import { Room, type Client } from "@colyseus/core";
import { BattleStateSchema, PlayerSchema, CardSchema, SupportEffectSchema } from "../schema/BattleState";
import cardsData from "../data/cards.json";
import { getFirebaseAdminAuth } from "../server/firebaseAdmin";
import { canEvolveDigimon } from "../lib/evolutionEligibility";
import { loadCardCatalog, type NormalizedCardCatalogEntry } from "../lib/cardCatalogLoader";
import { BattleAuditLog } from "../lib/battleAuditLog";
import {
    applyOpeningPenalty,
    drawToTarget,
    hasDigimonInHand,
    isRookieLevel,
    mulliganHand,
    resolveInitialPrepSubPhase,
    shouldDeckOutOnDraw,
    validateDeployDigimon,
} from "../lib/openingFlow";
import { resolveRuleProfile, type RuleProfile } from "../lib/ruleProfile";
import {
    createSupportBattleContext,
    getEffectiveAttackDamage,
    resolveSupportPhase,
    type AttackType,
    type SupportBattleContext,
} from "../lib/supportResolver";

/** Set `DEBUG_BATTLE_ROOM=0` when starting the server to silence draw/deck-out traces. */
const DEBUG_BATTLE_ROOM = process.env.DEBUG_BATTLE_ROOM !== "0";
const CARD_CATALOG: NormalizedCardCatalogEntry[] = loadCardCatalog(cardsData);

export class BattleRoom extends Room<{ state: BattleStateSchema }> {
    private supportChoices = new Map<string, CardSchema | null>();
    private attackChoices = new Map<string, AttackType | null>();
    private supportCtx: SupportBattleContext = createSupportBattleContext();
    private revealTimer: ReturnType<typeof this.clock.setTimeout> | null = null;
    private ruleProfile: RuleProfile = resolveRuleProfile("fidelity_ps1");
    private auditLog = new BattleAuditLog();

    /** Pause on reveal so clients can play flip / hologram FX before effects resolve. */
    private static readonly REVEAL_MS = 1600;

    onCreate(options: any) {
        console.log("[SERVER] BattleRoom created", options);
        this.ruleProfile = resolveRuleProfile(options?.ruleProfile);
        // Matchmaking target: exactly 2 players per match.
        this.maxClients = 2;
        this.state = new BattleStateSchema();
        this.state.ruleProfileId = this.ruleProfile.id;

        this.onMessage("action", (client, message) => {
            const player = this.state.players.get(client.sessionId);
            if (!player) return;

            // Validation: only active player can act in Draw/Prep
            const isMyTurn = this.state.activePlayerSessionId === client.sessionId;

            switch (message.type) {
                case "DRAW": {
                    if (!isMyTurn || this.state.phase !== "draw") return;
                    this.logDrawSnapshot("DRAW before drawToTarget", player);
                    this.drawToHandTarget(player);
                    this.logDrawSnapshot("DRAW after drawToTarget", player);
                    if ((this.state.phase as string) === "victory") return;

                    const target = this.ruleProfile.handTarget;
                    const deckEmpty = player.deck.length <= 0;
                    const belowTarget = player.hand.length < target;
                    const hasActive = !!this.getActive(player);
                    const digimonInHand = hasDigimonInHand(player.hand);
                    let dugDeckForDigimon = false;

                    this.debugDraw("DRAW branch check", {
                        sessionId: player.sessionId.slice(0, 8),
                        hasActive,
                        digimonInHand,
                        hand: player.hand.length,
                        deck: player.deck.length,
                        belowTarget,
                        deckEmpty,
                        turn: this.state.turn,
                        handTarget: target,
                    });

                    if (hasActive) {
                        if (shouldDeckOutOnDraw(true, player.hand.length, player.deck.length, target)) {
                            this.audit("DRAW", player, "rejected", "deck_out_active", {
                                handSize: player.hand.length,
                                deckSize: player.deck.length,
                            });
                            this.endGame(player.sessionId, "deck_out");
                            return;
                        }
                    } else if (!digimonInHand) {
                        if (!this.tryRecoverDigimonFromDeck(player)) {
                            this.audit("DRAW", player, "rejected", "deck_out_no_digimon", {
                                handSize: player.hand.length,
                                deckSize: player.deck.length,
                            });
                            this.endGame(player.sessionId, "deck_out");
                            return;
                        }
                        dugDeckForDigimon = true;
                        this.logDrawSnapshot("DRAW after digimon recovery", player);
                    }

                    this.state.phase = "preparation";
                    this.beginPrepSubPhase(player);
                    this.audit("DRAW", player, "ok", undefined, {
                        dugDeckForDigimon,
                        handSize: player.hand.length,
                    });
                    this.state.message = dugDeckForDigimon
                        ? "Deck dig — deploy a Digimon from your hand"
                        : this.prepMessageFor(player);
                    break;
                }
                case "MULLIGAN": {
                    if (!isMyTurn || this.state.phase !== "preparation") return;
                    if (this.state.prepSubPhase !== "mulligan") return;
                    if (player.mulligansRemaining <= 0) return;
                    player.mulligansRemaining -= 1;
                    mulliganHand(player.hand, player.deck, this.ruleProfile.handTarget, arr =>
                        this.shuffle(arr)
                    );
                    this.logDrawSnapshot("MULLIGAN after redraw", player);
                    if (!hasDigimonInHand(player.hand) && !this.tryRecoverDigimonFromDeck(player)) {
                        this.audit("MULLIGAN", player, "rejected", "deck_out_no_digimon");
                        this.endGame(player.sessionId, "deck_out");
                        return;
                    }
                    this.audit("MULLIGAN", player, "ok", undefined, {
                        mulligansRemaining: player.mulligansRemaining,
                        handSize: player.hand.length,
                    });
                    if (player.mulligansRemaining <= 0) {
                        this.state.prepSubPhase = "deploy";
                    }
                    this.state.message = this.prepMessageFor(player);
                    break;
                }
                case "ACCEPT_HAND": {
                    if (!isMyTurn || this.state.phase !== "preparation") return;
                    if (this.state.prepSubPhase !== "mulligan") return;
                    this.state.prepSubPhase = "deploy";
                    this.audit("ACCEPT_HAND", player, "ok");
                    this.state.message = this.prepMessageFor(player);
                    break;
                }
                case "DISCARD_FOR_DP":
                    if (!isMyTurn || this.state.phase !== "preparation") return;
                    if (this.state.prepSubPhase !== "discard") return;
                    {
                        const dpBefore = player.dp;
                        this.discardForDp(player, Array.isArray(message.cardIds) ? message.cardIds : []);
                        this.audit("DISCARD_FOR_DP", player, "ok", undefined, {
                            cardIds: Array.isArray(message.cardIds) ? message.cardIds : [],
                            dpBefore,
                            dpAfter: player.dp,
                        });
                    }
                    break;
                case "END_DISCARD":
                    if (!isMyTurn || this.state.phase !== "preparation") return;
                    if (!this.getActive(player) || this.state.prepSubPhase !== "discard") return;
                    this.state.prepSubPhase = "evolve";
                    this.audit("END_DISCARD", player, "ok");
                    this.state.message = "Step 2: Evolve or end prep";
                    break;
                case "DEPLOY_DIGIMON":
                case "DEPLOY_ROOKIE":
                    if (!isMyTurn || this.state.phase !== "preparation") return;
                    if (this.state.prepSubPhase !== "deploy" && this.state.prepSubPhase !== "") return;
                    if (typeof message.cardId !== "string") return;
                    this.deployDigimon(player, message.cardId);
                    break;
                case "EVOLVE":
                    if (!isMyTurn || this.state.phase !== "preparation") return;
                    if (this.state.prepSubPhase !== "evolve") return;
                    if (typeof message.cardId !== "string") return;
                    {
                        const dpBefore = player.dp;
                        const evolved = this.evolve(player, message.cardId);
                        this.audit("EVOLVE", player, evolved ? "ok" : "rejected", evolved ? undefined : "invalid_evolution", {
                            cardId: message.cardId,
                            dpBefore,
                            dpAfter: player.dp,
                        });
                    }
                    break;
                case "END_PREP":
                    if (!isMyTurn || this.state.phase !== "preparation") return;
                    if (this.state.prepSubPhase === "mulligan" || this.state.prepSubPhase === "deploy") return;
                    if (this.state.prepSubPhase !== "evolve") return;
                    if (!this.getActive(player)) {
                        if (!hasDigimonInHand(player.hand)) {
                            if (!this.tryRecoverDigimonFromDeck(player)) {
                                this.audit("END_PREP", player, "rejected", "deck_out_no_digimon");
                                this.endGame(player.sessionId, "deck_out");
                            } else {
                                this.state.prepSubPhase = "deploy";
                                this.state.message = "Deck dig — deploy a Digimon from your hand";
                                this.logDrawSnapshot("END_PREP after recovery", player);
                            }
                        }
                        return;
                    }
                    this.audit("END_PREP", player, "ok");
                    this.endPrepOrPassTurn(player);
                    break;
                case "LOCK_SUPPORT":
                    if (this.state.phase !== "battle_support") return;
                    if (message.cardId != null && typeof message.cardId !== "string") return;
                    this.lockSupport(client.sessionId, message.cardId ?? null);
                    break;
                case "LOCK_ATTACK":
                    if (this.state.phase !== "battle_attack") return;
                    if (!["circle", "triangle", "cross"].includes(message.attack)) return;
                    this.lockAttack(client.sessionId, message.attack);
                    break;
            }
        });
    }

    async onAuth(client: Client, options: any) {
        const idToken = options?.idToken;
        if (typeof idToken !== "string" || idToken.length < 10) {
            throw new Error("missing_id_token");
        }

        const decoded = await getFirebaseAdminAuth().verifyIdToken(idToken);
        const name =
            (typeof (decoded as any).name === "string" && (decoded as any).name.trim().length > 0
                ? (decoded as any).name
                : null) ??
            (typeof (decoded as any).email === "string" && (decoded as any).email.trim().length > 0
                ? (decoded as any).email
                : null) ??
            `Player`;

        return { uid: decoded.uid, name };
    }

    onJoin(client: Client, options: any) {
        console.log(`[SERVER] Client joined: ${client.sessionId}`, options);
        const player = new PlayerSchema();
        player.sessionId = client.sessionId;
        const authName = (client as any).auth?.name;
        player.name = typeof authName === "string" && authName.trim().length > 0 ? authName : `Player ${this.state.players.size + 1}`;
        player.hp = 0; // Will be set when active Digimon is chosen
        
        // Deck is assigned when the match starts (needs both players).

        this.state.players.set(client.sessionId, player);

        if (this.state.players.size === 2) {
            this.startGame();
        }
    }

    onLeave(client: Client, code?: number) {
        console.log(`[SERVER] Client left: ${client.sessionId}, code: ${code}`);
        this.state.players.delete(client.sessionId);
        if (this.state.phase !== "victory") {
            this.state.phase = "victory";
            this.state.winnerSessionId = Array.from(this.state.players.keys())[0] ?? "";
            this.state.loserReason = "disconnect";
            this.state.message = "A player disconnected.";
        }
    }

    startGame() {
        const sessions = Array.from(this.state.players.keys());
        this.state.activePlayerSessionId = sessions[0];
        this.state.turn = 1;

        // Build and shuffle 30-card decks. Rookies are deployed manually after the first draw.
        sessions.forEach((sessionId, playerIndex) => {
            const p = this.state.players.get(sessionId)!;
            p.deck.clear();
            p.hand.clear();
            p.trash.clear();
            p.dp = 0;
            p.score = 0;
            p.supportCard = null;
            p.supportLocked = false;
            p.selectedAttack = null;
            p.attackLocked = false;
            p.evolutionStack.clear();
            p.active = null;
            p.hp = 0;
            p.needsOpeningDeploy = true;
            p.mulligansRemaining = this.ruleProfile.mulligan.maxRedraws;

            const deck = this.buildDeck30(playerIndex);
            this.shuffle(deck);
            deck.forEach(c => p.deck.push(c));
        });

        if (this.state.phase !== "victory") {
            this.state.phase = "draw";
            this.state.message = "Draw Phase";
        }
    }

    // ----------------------------
    // Deck + card helpers
    // ----------------------------

    private toSchemaCard(raw: NormalizedCardCatalogEntry, instanceId: string): CardSchema {
        const card = new CardSchema();
        card.id = instanceId;
        card.name = String(raw.name ?? "").toUpperCase();
        card.cardKind = raw.cardKind;
        card.effectId = String(raw.effectId ?? "");
        card.effectArgsJson = card.effectId ? JSON.stringify(raw.effectArgs ?? {}) : "";
        card.level = String(raw.level ?? "");
        card.type = String(raw.type ?? "");
        card.hp = Number(raw.hp ?? 0);
        card.maxHp = Number(raw.maxHp ?? raw.hp ?? 0);
        card.plusDp = Number(raw.plusDp ?? 0);
        card.evoCost = Number(raw.evoCost ?? 0);
        card.image = String(raw.image ?? "");

        const attacks = raw.attacks;
        card.circle.name = String(attacks?.circle?.name ?? "");
        card.circle.damage = Number(attacks?.circle?.damage ?? 0);
        card.circle.type = "circle";
        card.circle.description = String(attacks?.circle?.description ?? "");

        card.triangle.name = String(attacks?.triangle?.name ?? "");
        card.triangle.damage = Number(attacks?.triangle?.damage ?? 0);
        card.triangle.type = "triangle";
        card.triangle.description = String(attacks?.triangle?.description ?? "");

        card.cross.name = String(attacks?.cross?.name ?? "");
        card.cross.damage = Number(attacks?.cross?.damage ?? 0);
        card.cross.type = "cross";
        card.cross.description = String(attacks.cross?.description ?? "");

        const rawEffect = raw.supportEffect;
        if (rawEffect) {
            const se = new SupportEffectSchema();
            se.type = String(rawEffect.type ?? "");
            se.targetAttack = String(rawEffect.targetAttack ?? "");
            se.value = Number(rawEffect.value ?? 0);
            se.description = String(rawEffect.description ?? "");
            se.requireType = String((rawEffect as { requireType?: string }).requireType ?? "");
            se.priority = Number((rawEffect as { priority?: number }).priority ?? 0);
            card.supportEffect = se;
        } else {
            card.supportEffect = null;
        }

        return card;
    }

    private buildDeck30(playerIndex: number): CardSchema[] {
        // Current online profile still seeds a Digimon-only deck from the normalized catalog.
        const baseCards = CARD_CATALOG.filter(c => c.cardKind === "digimon");
        const counts = new Map<string, number>();
        const deck: CardSchema[] = [];

        // Deterministic-ish order per player by rotating start index.
        const start = playerIndex % Math.max(1, baseCards.length);
        let cursor = start;
        let serial = 1;
        while (deck.length < 30 && baseCards.length > 0) {
            const raw = baseCards[cursor];
            cursor = (cursor + 1) % baseCards.length;

            const baseId = String(raw.id);
            const n = counts.get(baseId) ?? 0;
            if (n >= 4) continue;
            counts.set(baseId, n + 1);

            const instanceId = `p${playerIndex}_${baseId}_${serial++}`;
            deck.push(this.toSchemaCard(raw, instanceId));
        }
        return deck;
    }

    private shuffle<T>(arr: T[]) {
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
    }

    // ----------------------------
    // Phase logic (GDD)
    // ----------------------------

    /** Draw phase: fill hand to profile target when possible. */
    private drawToHandTarget(player: PlayerSchema) {
        const target = this.ruleProfile.handTarget;
        const beforeHand = player.hand.length;
        const beforeDeck = player.deck.length;
        const result = drawToTarget(player.hand, player.deck, target);
        if (result.drawn > 0 || player.hand.length < target) {
            this.debugDraw("drawToTarget summary", {
                target,
                drawn: result.drawn,
                handBefore: beforeHand,
                handAfter: result.handSize,
                deckBefore: beforeDeck,
                deckAfter: result.deckSize,
            });
        }
    }

    private discardForDp(player: PlayerSchema, cardIds: string[]) {
        for (const cardId of cardIds) {
            const idx = player.hand.findIndex(c => c.id === cardId);
            if (idx === -1) continue;
            const card = player.hand[idx];
            player.dp += card.plusDp;
            player.trash.push(card);
            player.hand.splice(idx, 1);
        }
        this.state.message = "Step 1: Discard cards for DP";
    }

    private beginPrepSubPhase(player: PlayerSchema) {
        this.state.prepSubPhase = resolveInitialPrepSubPhase(
            !!this.getActive(player),
            player.needsOpeningDeploy,
            player.mulligansRemaining,
            this.ruleProfile
        );
    }

    private prepMessageFor(player: PlayerSchema): string {
        switch (this.state.prepSubPhase) {
            case "mulligan":
                return `Opening hand (${this.ruleProfile.handTarget} cards) — keep or mulligan?`;
            case "deploy":
                return player.needsOpeningDeploy
                    ? "Deploy your battle Digimon"
                    : "Deploy a Rookie from your hand";
            case "discard":
                return "Step 1: Discard cards for DP";
            case "evolve":
                return "Step 2: Evolve or end prep";
            default:
                return this.getActive(player) ? "Step 1: Discard cards for DP" : "Deploy your battle Digimon";
        }
    }

    private evolve(player: PlayerSchema, cardId: string): boolean {
        const idx = player.hand.findIndex(c => c.id === cardId);
        if (idx === -1) return false;
        const evo = player.hand[idx];

        const current = this.getActive(player);
        if (!canEvolveDigimon(current, evo, player.dp)) return false;

        player.dp -= evo.evoCost;
        player.hand.splice(idx, 1);
        player.evolutionStack.push(evo);
        player.active = evo;
        player.hp = evo.maxHp;
        this.state.message = "Step 2: Evolve or end prep";
        return true;
    }

    private getActive(player: PlayerSchema): CardSchema | null {
        return player.active ?? null;
    }

    private getOpponent(player: PlayerSchema): PlayerSchema | null {
        const opponentSessionId = Array.from(this.state.players.keys()).find(id => id !== player.sessionId);
        return opponentSessionId ? this.state.players.get(opponentSessionId) ?? null : null;
    }

    private deployDigimon(player: PlayerSchema, cardId: string) {
        if (this.getActive(player)) {
            this.audit("DEPLOY_DIGIMON", player, "rejected", "already_active");
            return;
        }
        const idx = player.hand.findIndex(c => c.id === cardId);
        if (idx === -1) {
            this.audit("DEPLOY_DIGIMON", player, "rejected", "card_not_in_hand", { cardId });
            return;
        }
        const card = player.hand[idx];
        const validation = validateDeployDigimon(card, this.ruleProfile, player.needsOpeningDeploy);
        if (validation.ok === false) {
            this.audit("DEPLOY_DIGIMON", player, "rejected", validation.reason, { cardId });
            return;
        }

        player.hand.splice(idx, 1);
        player.evolutionStack.clear();
        player.evolutionStack.push(card);

        let penaltyApplied = false;
        if (validation.isOpening && validation.penaltyLevel) {
            const result = applyOpeningPenalty(card, this.ruleProfile);
            penaltyApplied = result.applied;
        }

        player.active = card;
        player.hp = card.maxHp;
        player.needsOpeningDeploy = false;
        this.state.prepSubPhase = "discard";
        this.state.message = "Step 1: Discard cards for DP";
        this.audit("DEPLOY_DIGIMON", player, "ok", undefined, {
            cardId,
            level: card.level,
            penaltyApplied,
            penaltyLevel: validation.penaltyLevel,
        });
    }

    private endPrepOrPassTurn(player: PlayerSchema) {
        const opponent = this.getOpponent(player);
        if (!opponent?.active) {
            this.endTurn();
            return;
        }
        this.beginSupportPlacement();
    }

    /**
     * No active Digimon and no legal card in hand: trash hand, dig deck until a
     * deployable Digimon is found (Rookie-only in legacy profile).
     */
    private tryRecoverDigimonFromDeck(player: PlayerSchema): boolean {
        const handToTrash = player.hand.length;
        const deckStart = player.deck.length;
        while (player.hand.length > 0) {
            const card = player.hand[0];
            player.hand.splice(0, 1);
            player.trash.push(card);
        }
        const revealedLevels: string[] = [];
        let found: string | null = null;
        while (player.deck.length > 0) {
            const card = player.deck.shift()!;
            const lvl = String(card.level);
            revealedLevels.push(lvl);
            const isTarget = this.ruleProfile.digForRookieOnly
                ? isRookieLevel(card.level)
                : card.cardKind === "digimon" || !card.cardKind;
            if (isTarget) {
                player.hand.push(card);
                found = `${card.name} (${card.id})`;
                this.debugDraw("tryRecoverDigimonFromDeck: success", {
                    sessionId: player.sessionId.slice(0, 8),
                    handTrashed: handToTrash,
                    deckStart,
                    dugCount: revealedLevels.length,
                    found,
                    firstLevels: revealedLevels.slice(0, 12),
                });
                return true;
            }
            player.trash.push(card);
        }
        this.debugDraw("tryRecoverDigimonFromDeck: failed (deck empty)", {
            sessionId: player.sessionId.slice(0, 8),
            handTrashed: handToTrash,
            deckStart,
            levelsSeen: revealedLevels,
        });
        return false;
    }

    private beginSupportPlacement() {
        this.state.phase = "battle_support";
        this.state.prepSubPhase = "";
        this.state.message = "Battle Phase: Place Support";

        if (this.revealTimer) {
            this.revealTimer.clear();
            this.revealTimer = null;
        }
        this.supportChoices.clear();
        this.attackChoices.clear();
        this.supportCtx = createSupportBattleContext();
        this.state.players.forEach(p => {
            p.supportCard = null; // not revealed yet
            p.supportLocked = false;
            p.selectedAttack = null;
            p.attackLocked = false;
            this.supportChoices.set(p.sessionId, null);
            this.attackChoices.set(p.sessionId, null);
        });
    }

    private lockSupport(sessionId: string, cardId: string | null) {
        const player = this.state.players.get(sessionId);
        if (!player) return;
        if (player.supportLocked) return;

        let chosen: CardSchema | null = null;
        if (cardId) {
            const idx = player.hand.findIndex(c => c.id === cardId);
            if (idx === -1) return;
            chosen = player.hand[idx];
            player.hand.splice(idx, 1);
        }

        player.supportLocked = true;
        this.supportChoices.set(sessionId, chosen);
        this.maybeRevealSupportAndAdvance();
    }

    private maybeRevealSupportAndAdvance() {
        const sessions = Array.from(this.state.players.keys());
        if (sessions.length !== 2) return;
        const p1 = this.state.players.get(sessions[0])!;
        const p2 = this.state.players.get(sessions[1])!;
        if (!p1.supportLocked || !p2.supportLocked) return;

        const c1 = this.supportChoices.get(p1.sessionId) ?? null;
        const c2 = this.supportChoices.get(p2.sessionId) ?? null;
        p1.supportCard = c1;
        p2.supportCard = c2;

        this.state.phase = "battle_reveal";
        this.state.message = "Support Reveal";

        if (this.revealTimer) this.revealTimer.clear();
        this.revealTimer = this.clock.setTimeout(() => {
            this.revealTimer = null;
            this.finishSupportRevealAndAdvance();
        }, BattleRoom.REVEAL_MS);
    }

    private finishSupportRevealAndAdvance() {
        const sessions = Array.from(this.state.players.keys());
        if (sessions.length !== 2) return;
        const p1 = this.state.players.get(sessions[0])!;
        const p2 = this.state.players.get(sessions[1])!;
        const active = this.state.players.get(this.state.activePlayerSessionId);
        if (!active) return;
        const defender = sessions[0] === this.state.activePlayerSessionId ? p2 : p1;

        const activeSupport = active.supportCard;
        const defenderSupport = defender.supportCard;

        resolveSupportPhase(active, defender, activeSupport, defenderSupport, this.supportCtx);

        this.state.phase = "battle_attack";
        this.state.message = "Battle Phase: Select Attack";
    }

    private lockAttack(sessionId: string, attack: AttackType) {
        const player = this.state.players.get(sessionId);
        if (!player) return;
        if (player.attackLocked) return;
        player.attackLocked = true;
        this.attackChoices.set(sessionId, attack);
        this.maybeResolveBattle();
    }

    private maybeResolveBattle() {
        const sessions = Array.from(this.state.players.keys());
        if (sessions.length !== 2) return;
        const p1 = this.state.players.get(sessions[0])!;
        const p2 = this.state.players.get(sessions[1])!;
        if (!p1.attackLocked || !p2.attackLocked) return;

        let a1 = this.attackChoices.get(p1.sessionId) ?? "circle";
        let a2 = this.attackChoices.get(p2.sessionId) ?? "circle";
        const forced1 = this.supportCtx.forcedAttack.get(p1.sessionId);
        const forced2 = this.supportCtx.forcedAttack.get(p2.sessionId);
        if (forced1) a1 = forced1;
        if (forced2) a2 = forced2;
        p1.selectedAttack = a1;
        p2.selectedAttack = a2;

        this.state.phase = "resolution";
        this.state.message = "Resolving Battle...";

        const d1 = getEffectiveAttackDamage(p1, a1, this.supportCtx);
        const d2 = getEffectiveAttackDamage(p2, a2, this.supportCtx);

        const p1First = this.supportCtx.firstStrikePlayers.has(p1.sessionId);
        const p2First = this.supportCtx.firstStrikePlayers.has(p2.sessionId);

        if (p1First && !p2First) {
            p2.hp = Math.max(0, p2.hp - d1);
            if (p2.hp > 0) p1.hp = Math.max(0, p1.hp - d2);
        } else if (p2First && !p1First) {
            p1.hp = Math.max(0, p1.hp - d2);
            if (p1.hp > 0) p2.hp = Math.max(0, p2.hp - d1);
        } else {
            p2.hp = Math.max(0, p2.hp - d1);
            p1.hp = Math.max(0, p1.hp - d2);
        }

        this.resolveKOsAndMaybeEndGame();
        if (this.state.phase === "victory") return;

        // End turn -> next player's draw
        this.endTurn();
    }

    private resolveKOsAndMaybeEndGame() {
        const sessions = Array.from(this.state.players.keys());
        if (sessions.length !== 2) return;
        const pA = this.state.players.get(sessions[0])!;
        const pB = this.state.players.get(sessions[1])!;

        const aKO = pA.hp <= 0;
        const bKO = pB.hp <= 0;

        if (!aKO && !bKO) return;

        if (aKO && bKO) {
            // Double KO: trash both stacks; each player redeploys manually on their next prep phase
            this.trashEvolutionStack(pA);
            this.trashEvolutionStack(pB);
            this.state.message = "Double KO — deploy a Digimon on your next turn";
            return;
        }

        const winner = aKO ? pB : pA;
        const loser = aKO ? pA : pB;
        winner.score += 1;

        this.trashEvolutionStack(loser);
        this.state.message = "KO — deploy a Digimon from your hand";

        if (winner.score >= 3) {
            this.endGame(loser.sessionId, "points");
        }
    }

    private trashEvolutionStack(player: PlayerSchema) {
        // Trash full stack (including active)
        while (player.evolutionStack.length > 0) {
            const top = player.evolutionStack.pop();
            if (top) player.trash.push(top);
        }
        player.active = null;
        player.hp = 0;
        player.supportCard = null;
        player.supportLocked = false;
        player.selectedAttack = null;
        player.attackLocked = false;
    }

    private endTurn() {
        const sessions = Array.from(this.state.players.keys());
        const currentIndex = sessions.indexOf(this.state.activePlayerSessionId);
        this.state.activePlayerSessionId = sessions[(currentIndex + 1) % 2];
        this.state.turn += 1;
        this.state.phase = "draw";
        this.state.prepSubPhase = "";
        this.state.message = "Draw Phase";
    }

    private endGame(loserSessionId: string, reason: "points" | "deck_out" | "disconnect") {
        if (reason === "deck_out" && DEBUG_BATTLE_ROOM) {
            const loser = this.state.players.get(loserSessionId);
            console.log("[BattleRoom:draw] endGame deck_out", {
                loserSessionId: loserSessionId.slice(0, 8),
                loserHand: loser?.hand.length,
                loserDeck: loser?.deck.length,
                loserHasActive: !!loser?.active,
                turn: this.state.turn,
                phaseBefore: this.state.phase,
            });
        }
        const winnerSessionId = Array.from(this.state.players.keys()).find(id => id !== loserSessionId) ?? "";
        this.state.phase = "victory";
        this.state.winnerSessionId = winnerSessionId;
        this.state.loserReason = reason;
        this.state.message = reason === "deck_out" ? "Deck Out!" : "Match Over";
    }

    private audit(
        action: string,
        player: PlayerSchema,
        validation: "ok" | "rejected",
        reason?: string,
        detail?: Record<string, unknown>
    ) {
        this.auditLog.emit({
            turn: this.state.turn,
            phase: this.state.phase,
            prepSubPhase: this.state.prepSubPhase,
            playerSessionId: player.sessionId,
            action,
            validation,
            reason,
            handSize: player.hand.length,
            deckSize: player.deck.length,
            detail,
        });
    }

    private debugDraw(message: string, data?: Record<string, unknown>) {
        if (!DEBUG_BATTLE_ROOM) return;
        if (data !== undefined) console.log(`[BattleRoom:draw] ${message}`, data);
        else console.log(`[BattleRoom:draw] ${message}`);
    }

    private logDrawSnapshot(label: string, player: PlayerSchema) {
        if (!DEBUG_BATTLE_ROOM) return;
        const levels: string[] = [];
        for (let i = 0; i < player.hand.length; i++) {
            levels.push(String(player.hand[i]?.level ?? ""));
        }
        console.log(`[BattleRoom:draw] ${label}`, {
            sessionId: player.sessionId.slice(0, 8),
            hand: player.hand.length,
            deck: player.deck.length,
            trash: player.trash.length,
            hasActive: !!player.active,
            activeLevel: player.active?.level ?? null,
            handLevels: levels,
        });
    }
}
