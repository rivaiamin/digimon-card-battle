import { Room, type Client } from "@colyseus/core";
import { BattleStateSchema, PlayerSchema, CardSchema, SupportEffectSchema } from "../schema/BattleState";
import cardsData from "../data/cards.json";
import { getFirebaseAdminAuth } from "../server/firebaseAdmin";
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
import { parseEffectArgsJson } from "../lib/effectArgs";
import {
    canPlayBattleOption,
    canPlayEvolutionOption,
    canPlayPrepOption,
    canUseAsBattleSupport,
} from "../lib/optionEligibility";
import {
    applyBattleOptionToContext,
    applyFullStatsFromCatalog,
    canEvolveWithOption,
    parseEvolutionModifiers,
    resolvePrepOption,
    shouldRestoreFullStatsAfterEvolve,
    type OptionCardLike,
} from "../lib/optionResolver";
import {
    createSupportBattleContext,
    resolveSupportPhase,
    type AttackType,
    type SupportBattleContext,
} from "../lib/supportResolver";
import {
    resolveFullBattle,
    resolveKoScoring,
    type BattleCombatant,
} from "../lib/battleEffectEngine";
import {
    canLockSupport,
    getDefenderSessionId,
    initialSupportPicker,
    nextSupportPickerAfterLock,
} from "../lib/supportPhase";
import {
    AFK_FORFEIT_THRESHOLD,
    shouldForfeitAfk,
    strikesAfterTimeout,
    strikesAfterVoluntaryAction,
} from "../lib/afkPolicy";
import {
    phaseTimerDurationMs,
    pickRandomAttack,
    resolveTimedPhaseKey,
    type TimedPhaseKey,
} from "../lib/phaseTimer";

/** Set `DEBUG_BATTLE_ROOM=0` when starting the server to silence draw/deck-out traces. */
const DEBUG_BATTLE_ROOM = process.env.DEBUG_BATTLE_ROOM !== "0";
const CARD_CATALOG: NormalizedCardCatalogEntry[] = loadCardCatalog(cardsData);
const CATALOG_BY_ID = new Map(CARD_CATALOG.map(c => [c.id, c]));

export class BattleRoom extends Room<{ state: BattleStateSchema }> {
    private supportChoices = new Map<string, CardSchema | null>();
    private attackChoices = new Map<string, AttackType | null>();
    private supportCtx: SupportBattleContext = createSupportBattleContext();
    private revealTimer: ReturnType<typeof this.clock.setTimeout> | null = null;
    private phaseTimerHandle: ReturnType<typeof this.clock.setTimeout> | null = null;
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
                    this.recordVoluntaryAction(client.sessionId);
                    this.executeDrawPhase(player, false);
                    break;
                }
                case "MULLIGAN": {
                    if (!isMyTurn || this.state.phase !== "preparation") return;
                    if (this.state.prepSubPhase !== "mulligan") return;
                    if (player.mulligansRemaining <= 0) return;
                    this.recordVoluntaryAction(client.sessionId);
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
                    this.syncPhaseTimer();
                    break;
                }
                case "ACCEPT_HAND": {
                    if (!isMyTurn || this.state.phase !== "preparation") return;
                    if (this.state.prepSubPhase !== "mulligan") return;
                    this.recordVoluntaryAction(client.sessionId);
                    this.state.prepSubPhase = "deploy";
                    this.audit("ACCEPT_HAND", player, "ok");
                    this.state.message = this.prepMessageFor(player);
                    this.syncPhaseTimer();
                    break;
                }
                case "DISCARD_FOR_DP":
                    if (!isMyTurn || this.state.phase !== "preparation") return;
                    if (this.state.prepSubPhase !== "discard") return;
                    this.recordVoluntaryAction(client.sessionId);
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
                    this.recordVoluntaryAction(client.sessionId);
                    this.state.prepSubPhase = "evolve";
                    this.audit("END_DISCARD", player, "ok");
                    this.state.message = "Step 2: Evolve or end prep";
                    this.syncPhaseTimer();
                    break;
                case "DEPLOY_DIGIMON":
                case "DEPLOY_ROOKIE":
                    if (!isMyTurn || this.state.phase !== "preparation") return;
                    if (this.state.prepSubPhase !== "deploy" && this.state.prepSubPhase !== "") return;
                    if (typeof message.cardId !== "string") return;
                    this.recordVoluntaryAction(client.sessionId);
                    this.deployDigimon(player, message.cardId);
                    break;
                case "PLAY_PREP_OPTION":
                    if (!isMyTurn || this.state.phase !== "preparation") return;
                    if (typeof message.cardId !== "string") return;
                    this.recordVoluntaryAction(client.sessionId);
                    this.playPrepOption(player, message.cardId);
                    break;
                case "EVOLVE":
                    if (!isMyTurn || this.state.phase !== "preparation") return;
                    if (this.state.prepSubPhase !== "evolve") return;
                    if (typeof message.cardId !== "string") return;
                    this.recordVoluntaryAction(client.sessionId);
                    {
                        const dpBefore = player.dp;
                        const evolutionOptionCardId =
                            typeof message.evolutionOptionCardId === "string"
                                ? message.evolutionOptionCardId
                                : undefined;
                        const evolved = this.evolve(player, message.cardId, evolutionOptionCardId);
                        this.audit("EVOLVE", player, evolved ? "ok" : "rejected", evolved ? undefined : "invalid_evolution", {
                            cardId: message.cardId,
                            evolutionOptionCardId,
                            dpBefore,
                            dpAfter: player.dp,
                        });
                    }
                    break;
                case "END_PREP":
                    if (!isMyTurn || this.state.phase !== "preparation") return;
                    if (this.state.prepSubPhase === "mulligan" || this.state.prepSubPhase === "deploy") return;
                    if (this.state.prepSubPhase !== "evolve") return;
                    this.recordVoluntaryAction(client.sessionId);
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
                    this.recordVoluntaryAction(client.sessionId);
                    this.lockSupport(client.sessionId, message.cardId ?? null);
                    break;
                case "LOCK_ATTACK":
                    if (this.state.phase !== "battle_attack") return;
                    if (!["circle", "triangle", "cross"].includes(message.attack)) return;
                    this.recordVoluntaryAction(client.sessionId);
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
        this.clearPhaseTimer();
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
            p.openingPenaltyActive = false;
            p.afkStrikes = 0;

            const deck = this.buildDeck30(playerIndex);
            this.shuffle(deck);
            deck.forEach(c => p.deck.push(c));
        });

        if (this.state.phase !== "victory") {
            this.state.phase = "draw";
            this.state.message = "Draw Phase";
            this.syncPhaseTimer();
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
        card.circle.effectId = String(raw.attacks?.circle?.effectId ?? "");
        card.circle.effectArgsJson = card.circle.effectId
            ? JSON.stringify(raw.attacks?.circle?.effectArgs ?? {})
            : "";

        card.triangle.name = String(attacks?.triangle?.name ?? "");
        card.triangle.damage = Number(attacks?.triangle?.damage ?? 0);
        card.triangle.type = "triangle";
        card.triangle.description = String(attacks?.triangle?.description ?? "");
        card.triangle.effectId = String(raw.attacks?.triangle?.effectId ?? "");
        card.triangle.effectArgsJson = card.triangle.effectId
            ? JSON.stringify(raw.attacks?.triangle?.effectArgs ?? {})
            : "";

        card.cross.name = String(attacks?.cross?.name ?? "");
        card.cross.damage = Number(attacks?.cross?.damage ?? 0);
        card.cross.type = "cross";
        card.cross.description = String(attacks.cross?.description ?? "");
        card.cross.effectId = String(raw.attacks?.cross?.effectId ?? "");
        card.cross.effectArgsJson = card.cross.effectId
            ? JSON.stringify(raw.attacks?.cross?.effectArgs ?? {})
            : "";

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
        const digimonCards = CARD_CATALOG.filter(c => c.cardKind === "digimon");
        const optionCards = CARD_CATALOG.filter(
            c => c.cardKind === "option" || c.cardKind === "evolution_option"
        );
        const counts = new Map<string, number>();
        const deck: CardSchema[] = [];

        const start = playerIndex % Math.max(1, digimonCards.length);
        let cursor = start;
        let serial = 1;

        const pushCard = (raw: NormalizedCardCatalogEntry, maxCopies: number) => {
            const baseId = String(raw.id);
            const n = counts.get(baseId) ?? 0;
            if (n >= maxCopies) return false;
            counts.set(baseId, n + 1);
            const instanceId = `p${playerIndex}_${baseId}_${serial++}`;
            deck.push(this.toSchemaCard(raw, instanceId));
            return true;
        };

        // Seed a small option package for fidelity testing (max 1 copy each).
        for (const raw of optionCards) {
            if (deck.length >= 26) break;
            pushCard(raw, 1);
        }

        while (deck.length < 30 && digimonCards.length > 0) {
            const raw = digimonCards[cursor];
            cursor = (cursor + 1) % digimonCards.length;
            pushCard(raw, 4);
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
        this.syncPhaseTimer();
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

    private toOptionCardView(card: CardSchema): OptionCardLike {
        return {
            id: card.id,
            cardKind: card.cardKind,
            effectId: card.effectId,
            effectArgs: parseEffectArgsJson(card.effectArgsJson),
            level: card.level,
            type: card.type,
            evoCost: card.evoCost,
            maxHp: card.maxHp,
            hp: card.hp,
            circle: card.circle,
            triangle: card.triangle,
            cross: card.cross,
        };
    }

    private catalogBaseId(instanceId: string): string {
        const parts = instanceId.split("_");
        return parts.length >= 2 ? parts[1] : instanceId;
    }

    private getCatalogStats(card: CardSchema) {
        const baseId = this.catalogBaseId(card.id);
        const entry = CATALOG_BY_ID.get(baseId);
        if (!entry) return null;
        return {
            maxHp: entry.maxHp,
            circle: entry.attacks.circle.damage,
            triangle: entry.attacks.triangle.damage,
            cross: entry.attacks.cross.damage,
        };
    }

    private playPrepOption(player: PlayerSchema, cardId: string) {
        const idx = player.hand.findIndex(c => c.id === cardId);
        if (idx === -1) {
            this.audit("PLAY_PREP_OPTION", player, "rejected", "card_not_in_hand", { cardId });
            return;
        }
        const card = player.hand[idx];
        const view = this.toOptionCardView(card);
        if (
            !canPlayPrepOption(
                view,
                this.state.prepSubPhase as "" | "mulligan" | "deploy" | "discard" | "evolve",
                !!this.getActive(player)
            )
        ) {
            this.audit("PLAY_PREP_OPTION", player, "rejected", "illegal_timing", { cardId });
            return;
        }

        const dpBefore = player.dp;
        const hpBefore = player.hp;
        const prepState = {
            dp: player.dp,
            hp: player.hp,
            maxHp: player.active?.maxHp ?? 0,
            hand: player.hand as unknown as OptionCardLike[],
            deck: player.deck as unknown as OptionCardLike[],
            trash: player.trash as unknown as OptionCardLike[],
        };
        const result = resolvePrepOption(view, prepState, count => {
            let drawn = 0;
            for (let i = 0; i < count; i++) {
                if (player.deck.length <= 0) break;
                player.hand.push(player.deck.shift()!);
                drawn++;
            }
            return drawn;
        });

        if (result.ok === false) {
            this.audit("PLAY_PREP_OPTION", player, "rejected", result.reason, { cardId });
            return;
        }

        player.dp = prepState.dp;
        player.hp = prepState.hp;

        player.hand.splice(idx, 1);
        player.trash.push(card);
        this.audit("PLAY_PREP_OPTION", player, "ok", undefined, {
            cardId,
            effectId: result.effectId,
            dpBefore,
            dpAfter: player.dp,
            hpBefore,
            hpAfter: player.hp,
            detail: result.detail,
        });
        this.state.message = this.prepMessageFor(player);
    }

    private evolve(player: PlayerSchema, cardId: string, evolutionOptionCardId?: string): boolean {
        const evoIdx = player.hand.findIndex(c => c.id === cardId);
        if (evoIdx === -1) return false;
        const evo = player.hand[evoIdx];

        const current = this.getActive(player);
        if (!current) return false;

        let modifiers = parseEvolutionModifiers(null);
        let optionIdx = -1;
        if (evolutionOptionCardId) {
            optionIdx = player.hand.findIndex(c => c.id === evolutionOptionCardId);
            if (optionIdx === -1) return false;
            const optionCard = player.hand[optionIdx];
            const optionView = this.toOptionCardView(optionCard);
            if (
                !canPlayEvolutionOption(
                    optionView,
                    this.state.prepSubPhase as "" | "mulligan" | "deploy" | "discard" | "evolve",
                    true
                )
            ) {
                return false;
            }
            modifiers = parseEvolutionModifiers(optionView);
        }

        if (!canEvolveWithOption(current, evo, player.dp, modifiers)) return false;

        const adjustedCost = Math.max(0, evo.evoCost + modifiers.dpCostDelta);
        const fromLevel = current.level;

        let digimonHandIdx = evoIdx;
        if (optionIdx !== -1) {
            const optionCard = player.hand.splice(optionIdx, 1)[0];
            if (optionIdx < digimonHandIdx) digimonHandIdx -= 1;
            player.trash.push(optionCard);
        }

        const evoCard = player.hand.splice(digimonHandIdx, 1)[0];
        player.dp -= adjustedCost;
        player.evolutionStack.push(evoCard);
        player.active = evoCard;
        player.hp = evoCard.maxHp;

        const restore = shouldRestoreFullStatsAfterEvolve(
            modifiers,
            player.openingPenaltyActive,
            fromLevel,
            evoCard.level
        );
        if (restore) {
            const stats = this.getCatalogStats(evoCard);
            if (stats) {
                applyFullStatsFromCatalog(evoCard, stats);
                player.hp = evoCard.maxHp;
            }
            player.openingPenaltyActive = false;
        }

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
            player.openingPenaltyActive = result.applied;
        } else {
            player.openingPenaltyActive = false;
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
        this.syncPhaseTimer();
    }

    private endPrepOrPassTurn(player: PlayerSchema) {
        const opponent = this.getOpponent(player);
        if (!opponent?.active) {
            this.endTurn();
            return;
        }
        this.beginBattlePhaseAfterPrep();
    }

    private beginBattlePhaseAfterPrep() {
        if (this.ruleProfile.battle.attackLockBeforeSupport) {
            this.beginAttackSelection();
        } else {
            this.beginSupportPlacement();
        }
    }

    private beginAttackSelection() {
        this.state.phase = "battle_attack";
        this.state.prepSubPhase = "";
        this.state.message = "Battle Phase: Select Attack";
        this.state.supportPickSessionId = "";

        if (this.revealTimer) {
            this.revealTimer.clear();
            this.revealTimer = null;
        }
        this.supportChoices.clear();
        this.attackChoices.clear();
        this.supportCtx = createSupportBattleContext();
        this.state.players.forEach(p => {
            p.supportCard = null;
            p.supportLocked = false;
            p.selectedAttack = null;
            p.attackLocked = false;
            this.supportChoices.set(p.sessionId, null);
            this.attackChoices.set(p.sessionId, null);
        });
        this.syncPhaseTimer();
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
        const attackFirst = this.ruleProfile.battle.attackLockBeforeSupport;

        if (this.revealTimer) {
            this.revealTimer.clear();
            this.revealTimer = null;
        }
        this.supportChoices.clear();
        if (!attackFirst) {
            this.attackChoices.clear();
            this.supportCtx = createSupportBattleContext();
        }
        this.state.players.forEach(p => {
            p.supportCard = null;
            p.supportLocked = false;
            if (!attackFirst) {
                p.selectedAttack = null;
                p.attackLocked = false;
                this.attackChoices.set(p.sessionId, null);
            }
            this.supportChoices.set(p.sessionId, null);
        });

        if (this.ruleProfile.battle.supportPickDefenderFirst) {
            const sessions = Array.from(this.state.players.keys());
            const defender = getDefenderSessionId(this.state.activePlayerSessionId, sessions);
            this.state.supportPickSessionId = initialSupportPicker(defender);
            this.state.message = "Defender: Place Support";
        } else {
            this.state.supportPickSessionId = "";
            this.state.message = "Battle Phase: Place Support";
        }
        this.syncPhaseTimer();
    }

    private lockSupport(sessionId: string, cardId: string | null) {
        const player = this.state.players.get(sessionId);
        if (!player) return;
        if (
            !canLockSupport(
                sessionId,
                this.state.supportPickSessionId,
                this.ruleProfile.battle.supportPickDefenderFirst,
                player.supportLocked
            )
        ) {
            return;
        }

        let chosen: CardSchema | null = null;
        if (cardId) {
            const idx = player.hand.findIndex(c => c.id === cardId);
            if (idx === -1) return;
            chosen = player.hand[idx];
            const view = this.toOptionCardView(chosen);
            if (!canUseAsBattleSupport(view)) return;
            if (chosen.cardKind === "option" && !canPlayBattleOption(view, this.state.phase)) return;
            player.hand.splice(idx, 1);
        }

        player.supportLocked = true;
        this.supportChoices.set(sessionId, chosen);

        if (this.ruleProfile.battle.supportPickDefenderFirst) {
            const sessions = Array.from(this.state.players.keys());
            const defender = getDefenderSessionId(this.state.activePlayerSessionId, sessions);
            const next = nextSupportPickerAfterLock(
                sessionId,
                defender,
                this.state.activePlayerSessionId
            );
            if (next) {
                this.state.supportPickSessionId = next;
                this.state.message = "Active: Place Support";
            } else {
                this.state.supportPickSessionId = "";
            }
        }

        this.maybeRevealSupportAndAdvance();
        const sessions = Array.from(this.state.players.keys());
        if (sessions.length === 2 && this.state.phase === "battle_support") {
            const p1 = this.state.players.get(sessions[0])!;
            const p2 = this.state.players.get(sessions[1])!;
            if (!p1.supportLocked || !p2.supportLocked) {
                this.syncPhaseTimer();
            }
        }
    }

    private maybeRevealSupportAndAdvance() {
        const sessions = Array.from(this.state.players.keys());
        if (sessions.length !== 2) return;
        const p1 = this.state.players.get(sessions[0])!;
        const p2 = this.state.players.get(sessions[1])!;
        if (!p1.supportLocked || !p2.supportLocked) return;

        this.clearPhaseTimer();
        this.state.phaseEndsAtMs = 0;

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

        let activeSupport = active.supportCard;
        let defenderSupport = defender.supportCard;

        if (activeSupport?.cardKind === "option") {
            applyBattleOptionToContext(this.toOptionCardView(activeSupport), active.sessionId, this.supportCtx);
            active.trash.push(activeSupport);
            active.supportCard = null;
            activeSupport = null;
        }
        if (defenderSupport?.cardKind === "option") {
            applyBattleOptionToContext(this.toOptionCardView(defenderSupport), defender.sessionId, this.supportCtx);
            defender.trash.push(defenderSupport);
            defender.supportCard = null;
            defenderSupport = null;
        }

        resolveSupportPhase(active, defender, activeSupport, defenderSupport, this.supportCtx, {
            activeSessionId: this.state.activePlayerSessionId,
            sessionOrder: sessions,
        });

        if (this.ruleProfile.battle.attackLockBeforeSupport) {
            this.state.phase = "resolution";
            this.state.message = "Resolving Battle...";
            this.maybeResolveBattle();
        } else {
            this.state.phase = "battle_attack";
            this.state.message = "Battle Phase: Select Attack";
            this.syncPhaseTimer();
        }
    }

    private lockAttack(sessionId: string, attack: AttackType) {
        const player = this.state.players.get(sessionId);
        if (!player) return;
        if (player.attackLocked) return;
        player.attackLocked = true;
        this.attackChoices.set(sessionId, attack);
        if (this.ruleProfile.battle.attackLockBeforeSupport) {
            this.maybeBeginSupportAfterAttacks();
        } else {
            this.maybeResolveBattle();
        }
    }

    private maybeBeginSupportAfterAttacks() {
        const sessions = Array.from(this.state.players.keys());
        if (sessions.length !== 2) return;
        const p1 = this.state.players.get(sessions[0])!;
        const p2 = this.state.players.get(sessions[1])!;
        if (!p1.attackLocked || !p2.attackLocked) return;
        this.beginSupportPlacement();
    }

    private toBattleCombatant(player: PlayerSchema): BattleCombatant {
        const active = player.active;
        return {
            sessionId: player.sessionId,
            hp: player.hp,
            maxHp: active?.maxHp ?? player.hp,
            active: active
                ? {
                      circle: {
                          damage: active.circle.damage,
                          effectId: active.circle.effectId,
                          effectArgsJson: active.circle.effectArgsJson,
                      },
                      triangle: {
                          damage: active.triangle.damage,
                          effectId: active.triangle.effectId,
                          effectArgsJson: active.triangle.effectArgsJson,
                      },
                      cross: {
                          damage: active.cross.damage,
                          effectId: active.cross.effectId,
                          effectArgsJson: active.cross.effectArgsJson,
                      },
                  }
                : null,
        };
    }

    private maybeResolveBattle() {
        const sessions = Array.from(this.state.players.keys());
        if (sessions.length !== 2) return;
        const p1 = this.state.players.get(sessions[0])!;
        const p2 = this.state.players.get(sessions[1])!;
        if (!p1.attackLocked || !p2.attackLocked) return;

        this.clearPhaseTimer();
        this.state.phaseEndsAtMs = 0;

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

        const battle = resolveFullBattle(
            this.toBattleCombatant(p1),
            this.toBattleCombatant(p2),
            a1,
            a2,
            this.state.activePlayerSessionId,
            this.supportCtx
        );

        p1.hp = battle.p1Hp;
        p2.hp = battle.p2Hp;

        for (const event of battle.events) {
            this.auditLog.emit({
                turn: this.state.turn,
                phase: "resolution",
                prepSubPhase: "",
                playerSessionId: event.sessionId ?? "",
                action: event.type,
                validation: "ok",
                detail: event.detail,
            });
        }

        this.resolveKOsAndMaybeEndGame();
        if (this.state.phase === "victory") return;

        this.endTurn();
    }

    private resolveKOsAndMaybeEndGame() {
        const sessions = Array.from(this.state.players.keys());
        if (sessions.length !== 2) return;
        const pA = this.state.players.get(sessions[0])!;
        const pB = this.state.players.get(sessions[1])!;

        const ko = resolveKoScoring(pA.hp, pB.hp);
        if (ko.scoreDelta.p1 === 0 && ko.scoreDelta.p2 === 0 && pA.hp > 0 && pB.hp > 0) return;

        if (ko.isDoubleKo) {
            this.trashEvolutionStack(pA);
            this.trashEvolutionStack(pB);
            this.state.message = "Double KO — deploy a Digimon on your next turn";
            return;
        }

        if (pA.hp <= 0 || pB.hp <= 0) {
            pA.score += ko.scoreDelta.p1;
            pB.score += ko.scoreDelta.p2;

            const loser = pA.hp <= 0 ? pA : pB;
            const winner = pA.hp <= 0 ? pB : pA;
            this.trashEvolutionStack(loser);
            this.state.message = "KO — deploy a Digimon from your hand";

            if (winner.score >= 3) {
                this.endGame(loser.sessionId, "points");
            }
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
        this.syncPhaseTimer();
    }

    private endGame(loserSessionId: string, reason: "points" | "deck_out" | "disconnect" | "afk") {
        this.clearPhaseTimer();
        if (this.revealTimer) {
            this.revealTimer.clear();
            this.revealTimer = null;
        }
        this.state.phaseEndsAtMs = 0;
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
        if (reason === "deck_out") {
            this.state.message = "Deck Out!";
        } else if (reason === "afk") {
            this.state.message = "Match forfeited (AFK)";
        } else {
            this.state.message = "Match Over";
        }
    }

    // ----------------------------
    // Phase timers & AFK (E6)
    // ----------------------------

    private clearPhaseTimer() {
        if (this.phaseTimerHandle) {
            this.phaseTimerHandle.clear();
            this.phaseTimerHandle = null;
        }
    }

    private syncPhaseTimer() {
        this.clearPhaseTimer();
        if (this.state.phase === "victory") {
            this.state.phaseEndsAtMs = 0;
            return;
        }
        const duration = phaseTimerDurationMs(this.state.phase, this.state.prepSubPhase);
        if (!duration) {
            this.state.phaseEndsAtMs = 0;
            return;
        }
        this.state.phaseEndsAtMs = Date.now() + duration;
        this.phaseTimerHandle = this.clock.setTimeout(() => {
            this.phaseTimerHandle = null;
            this.onPhaseTimeout();
        }, duration);
    }

    private recordVoluntaryAction(sessionId: string) {
        const player = this.state.players.get(sessionId);
        if (player) {
            player.afkStrikes = strikesAfterVoluntaryAction();
        }
    }

    private applyTimeoutStrike(sessionId: string): boolean {
        const player = this.state.players.get(sessionId);
        if (!player) return false;
        player.afkStrikes = strikesAfterTimeout(player.afkStrikes);
        this.auditLog.emit({
            turn: this.state.turn,
            phase: this.state.phase,
            prepSubPhase: this.state.prepSubPhase,
            playerSessionId: sessionId,
            action: "AFK_STRIKE",
            validation: "ok",
            detail: { strikes: player.afkStrikes, threshold: AFK_FORFEIT_THRESHOLD },
        });
        if (shouldForfeitAfk(player.afkStrikes)) {
            this.auditLog.emit({
                turn: this.state.turn,
                phase: this.state.phase,
                prepSubPhase: this.state.prepSubPhase,
                playerSessionId: sessionId,
                action: "AFK_FORFEIT",
                validation: "ok",
                detail: { strikes: player.afkStrikes },
            });
            this.endGame(sessionId, "afk");
            return true;
        }
        return false;
    }

    private auditPhaseTimeout(phaseKey: TimedPhaseKey, sessionIds: string[], autoCommit: string) {
        for (const sessionId of sessionIds) {
            this.auditLog.emit({
                turn: this.state.turn,
                phase: this.state.phase,
                prepSubPhase: this.state.prepSubPhase,
                playerSessionId: sessionId,
                action: "PHASE_TIMEOUT",
                validation: "ok",
                detail: { phaseKey, autoCommit },
            });
        }
    }

    private onPhaseTimeout() {
        if (this.state.phase === "victory") return;
        const phaseKey = resolveTimedPhaseKey(this.state.phase, this.state.prepSubPhase);
        if (!phaseKey) return;

        switch (phaseKey) {
            case "draw": {
                const player = this.state.players.get(this.state.activePlayerSessionId);
                if (!player || this.state.phase !== "draw") return;
                this.auditPhaseTimeout(phaseKey, [player.sessionId], "auto_draw");
                if (this.applyTimeoutStrike(player.sessionId)) return;
                this.executeDrawPhase(player, true);
                break;
            }
            case "prep_mulligan": {
                const player = this.state.players.get(this.state.activePlayerSessionId);
                if (!player || this.state.phase !== "preparation") return;
                this.auditPhaseTimeout(phaseKey, [player.sessionId], "auto_accept_hand");
                if (this.applyTimeoutStrike(player.sessionId)) return;
                this.state.prepSubPhase = "deploy";
                this.state.message = this.prepMessageFor(player);
                this.syncPhaseTimer();
                break;
            }
            case "prep_deploy": {
                const player = this.state.players.get(this.state.activePlayerSessionId);
                if (!player || this.state.phase !== "preparation") return;
                this.auditPhaseTimeout(phaseKey, [player.sessionId], "auto_deploy");
                if (this.applyTimeoutStrike(player.sessionId)) return;
                this.autoDeployDigimon(player);
                break;
            }
            case "prep_discard": {
                const player = this.state.players.get(this.state.activePlayerSessionId);
                if (!player || this.state.phase !== "preparation" || !this.getActive(player)) return;
                this.auditPhaseTimeout(phaseKey, [player.sessionId], "auto_end_discard");
                if (this.applyTimeoutStrike(player.sessionId)) return;
                this.state.prepSubPhase = "evolve";
                this.state.message = "Step 2: Evolve or end prep";
                this.syncPhaseTimer();
                break;
            }
            case "prep_evolve": {
                const player = this.state.players.get(this.state.activePlayerSessionId);
                if (!player || this.state.phase !== "preparation") return;
                this.auditPhaseTimeout(phaseKey, [player.sessionId], "auto_end_prep");
                if (this.applyTimeoutStrike(player.sessionId)) return;
                this.autoEndPrep(player);
                break;
            }
            case "battle_support":
                this.autoCommitSupportTimeouts(phaseKey);
                break;
            case "battle_attack":
                this.autoCommitAttackTimeouts(phaseKey);
                break;
        }
    }

    private executeDrawPhase(player: PlayerSchema, auto: boolean) {
        this.logDrawSnapshot("DRAW before drawToTarget", player);
        this.drawToHandTarget(player);
        this.logDrawSnapshot("DRAW after drawToTarget", player);
        if ((this.state.phase as string) === "victory") return;

        const target = this.ruleProfile.handTarget;
        const hasActive = !!this.getActive(player);
        const digimonInHand = hasDigimonInHand(player.hand);
        let dugDeckForDigimon = false;

        this.debugDraw("DRAW branch check", {
            sessionId: player.sessionId.slice(0, 8),
            hasActive,
            digimonInHand,
            hand: player.hand.length,
            deck: player.deck.length,
            belowTarget: player.hand.length < target,
            deckEmpty: player.deck.length <= 0,
            turn: this.state.turn,
            handTarget: target,
        });

        if (hasActive) {
            if (shouldDeckOutOnDraw(true, player.hand.length, player.deck.length, target)) {
                this.audit("DRAW", player, "rejected", "deck_out_active", {
                    handSize: player.hand.length,
                    deckSize: player.deck.length,
                    auto,
                });
                this.endGame(player.sessionId, "deck_out");
                return;
            }
        } else if (!digimonInHand) {
            if (!this.tryRecoverDigimonFromDeck(player)) {
                this.audit("DRAW", player, "rejected", "deck_out_no_digimon", {
                    handSize: player.hand.length,
                    deckSize: player.deck.length,
                    auto,
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
            auto,
        });
        this.state.message = dugDeckForDigimon
            ? "Deck dig — deploy a Digimon from your hand"
            : this.prepMessageFor(player);
    }

    private autoDeployDigimon(player: PlayerSchema) {
        if (this.state.prepSubPhase !== "deploy" && this.state.prepSubPhase !== "") return;
        if (this.getActive(player)) {
            this.autoEndPrep(player);
            return;
        }
        for (const card of player.hand) {
            const validation = validateDeployDigimon(card, this.ruleProfile, player.needsOpeningDeploy);
            if (validation.ok !== false) {
                this.deployDigimon(player, card.id);
                return;
            }
        }
        if (!hasDigimonInHand(player.hand)) {
            if (!this.tryRecoverDigimonFromDeck(player)) {
                this.endGame(player.sessionId, "deck_out");
                return;
            }
            this.autoDeployDigimon(player);
            return;
        }
        this.autoEndPrep(player);
    }

    private autoEndPrep(player: PlayerSchema) {
        if (this.state.phase !== "preparation" || this.state.prepSubPhase !== "evolve") return;
        if (!this.getActive(player)) {
            if (!hasDigimonInHand(player.hand)) {
                if (!this.tryRecoverDigimonFromDeck(player)) {
                    this.endGame(player.sessionId, "deck_out");
                } else {
                    this.state.prepSubPhase = "deploy";
                    this.state.message = "Deck dig — deploy a Digimon from your hand";
                    this.syncPhaseTimer();
                }
            }
            return;
        }
        this.audit("END_PREP", player, "ok", undefined, { auto: true });
        this.endPrepOrPassTurn(player);
    }

    private autoCommitSupportTimeouts(phaseKey: TimedPhaseKey) {
        if (this.state.phase !== "battle_support") return;

        if (this.ruleProfile.battle.supportPickDefenderFirst && this.state.supportPickSessionId) {
            const sessionId = this.state.supportPickSessionId;
            const player = this.state.players.get(sessionId);
            if (!player || player.supportLocked) return;
            this.auditPhaseTimeout(phaseKey, [sessionId], "auto_no_support");
            if (this.applyTimeoutStrike(sessionId)) return;
            this.lockSupport(sessionId, null);
            return;
        }

        for (const player of this.state.players.values()) {
            if (player.supportLocked) continue;
            this.auditPhaseTimeout(phaseKey, [player.sessionId], "auto_no_support");
            if (this.applyTimeoutStrike(player.sessionId)) return;
            this.lockSupport(player.sessionId, null);
        }
    }

    private autoCommitAttackTimeouts(phaseKey: TimedPhaseKey) {
        if (this.state.phase !== "battle_attack") return;
        for (const player of this.state.players.values()) {
            if (player.attackLocked) continue;
            this.auditPhaseTimeout(phaseKey, [player.sessionId], "auto_random_attack");
            if (this.applyTimeoutStrike(player.sessionId)) return;
            this.lockAttack(player.sessionId, pickRandomAttack());
        }
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
