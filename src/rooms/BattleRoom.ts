import type { AttackType } from "../types";
import { Room, CloseCode, type Client } from "@colyseus/core";
import { BattleStateSchema, PlayerSchema, CardSchema, SupportEffectSchema } from "../schema/BattleState";
import cardsData from "../data/cards.json";
import { getFirebaseAdminAuth } from "../server/firebaseAdmin";
import { loadCardCatalog, type NormalizedCardCatalogEntry } from "../lib/cardCatalogLoader";
import { parseEffectPlanJson, serializeEffectPlanJson } from "../lib/effectPlan";
import { BattleAuditLog, snapshotPlayer, type StateDelta } from "../lib/battleAuditLog";
import {
    applyOpeningPenalty,
    digForDeployableFromDeck,
} from "../lib/openingFlow";
import {
    applyPostEvolutionRecovery,
    parseStatusAilmentsJson,
    serializeStatusAilments,
} from "../lib/postEvolutionRecovery";
import { getPrepServerMessage } from "../lib/prepPhaseCopy";
import { resolveRuleProfile, type RuleProfile } from "../lib/ruleProfile";
import { parseEffectArgsJson } from "../lib/effectArgs";
import {
    canPlayEvolutionOption,
    canPlayPrepOption,
    canUseAsBattleSupport,
} from "../lib/optionEligibility";
import {
    applyFullStatsFromCatalog,
    canEvolveWithOption,
    classifyOptionEffect,
    parseEvolutionModifiers,
    resolvePrepOption,
    shouldRestoreFullStatsAfterEvolve,
    type OptionCardLike,
} from "../lib/optionResolver";
import { spendEvolutionDp } from "../lib/evolutionEligibility";
import {
    FidelityBattleSession,
    toOptionCardView,
    type BattleBandOutcome,
    type DispatchResult,
    type PresentationAdvanceResult,
} from "../lib/fidelityBattleSession";
import { resolveArenaVariant, type ArenaVariant } from "../lib/arenaVariant";
import { buildDefaultDeckCardIds } from "../lib/defaultDeckBuilder";
import { resolveJoinDeckCardIds, validateClientJoin } from "../lib/fidelityMatchLifecycle";
import { validateDeck, formatDeckValidationError } from "../lib/deckValidator";
import { createSeededRng, shuffleInPlace, type Rng } from "../lib/seededRng";
import {
    AFK_FORFEIT_THRESHOLD,
    shouldForfeitAfk,
    strikesAfterTimeout,
    strikesAfterVoluntaryAction,
} from "../lib/afkPolicy";
import {
    RECONNECT_GRACE_SECONDS,
    isConsentedLeave,
    shouldOfferReconnectGrace,
} from "../lib/reconnectPolicy";
import {
    phaseTimerDurationMs,
    resolveTimedPhaseKey,
    type TimedPhaseKey,
} from "../lib/phaseTimer";
import { SUPPORT_EFFECTS_MS, type PlayerActionType } from "../lib/battleTurnFlow";
import { loserSessionIdIfPointVictory } from "../lib/matchOutcome";

/** Set `DEBUG_BATTLE_ROOM=0` when starting the server to silence draw/deck-out traces. */
const DEBUG_BATTLE_ROOM = process.env.DEBUG_BATTLE_ROOM !== "0";
const CARD_CATALOG: NormalizedCardCatalogEntry[] = loadCardCatalog(cardsData);
const CATALOG_BY_ID = new Map(CARD_CATALOG.map(c => [c.id, c]));

export class BattleRoom extends Room<{ state: BattleStateSchema }> {
    private fidelitySession!: FidelityBattleSession;
    private revealTimer: ReturnType<typeof this.clock.setTimeout> | null = null;
    private effectsTimer: ReturnType<typeof this.clock.setTimeout> | null = null;
    private resolutionTimer: ReturnType<typeof this.clock.setTimeout> | null = null;
    private phaseTimerHandle: ReturnType<typeof this.clock.setTimeout> | null = null;
    private ruleProfile: RuleProfile = resolveRuleProfile("fidelity_ps1");
    private arenaVariant: ArenaVariant = resolveArenaVariant("standard");
    private pendingDecks = new Map<string, string[]>();
    private auditLog = new BattleAuditLog();
    private rng: Rng = Math.random;
    private replaySeed: number | null = null;
    /** Pause on reveal so clients can play flip / hologram FX before effects resolve. */
    /** Pause after support resolve for heal / buff notification VFX. */
    private static readonly EFFECTS_MS = SUPPORT_EFFECTS_MS;
    /** Pause after damage lands for attack reveal + strike VFX before draw/KO deploy. */

    onCreate(options: any) {
        console.log("[SERVER] BattleRoom created", options);
        this.ruleProfile = resolveRuleProfile(options?.ruleProfile);
        this.arenaVariant = resolveArenaVariant(options?.arenaVariant, this.ruleProfile.id);
        // Matchmaking target: exactly 2 players per match.
        this.maxClients = 2;
        this.state = new BattleStateSchema();
        this.state.ruleProfileId = this.ruleProfile.id;
        this.state.arenaVariantId = this.arenaVariant.id;

        if (typeof options?.replaySeed === "number") {
            this.replaySeed = options.replaySeed;
            this.rng = createSeededRng(options.replaySeed);
            this.auditLog.setReplayMode(options.replaySeed);
        }

        this.initFidelitySession();

        this.onMessage("action", (client, message) => {
            this.dispatchClientAction(client, message);
        });
    }

    private applyDispatchFollowUp(result: DispatchResult) {
        if (!result.ok) return;
        if (result.koOutcome) {
            this.applyKoRedeployOutcome(result.koOutcome);
        }
        if (result.presentation) {
            this.applyPresentationAdvance(result.presentation);
        }
    }

    private applyPresentationAdvance(step: PresentationAdvanceResult) {
        switch (step.kind) {
            case "idle":
                return;
            case "sync_timer":
                this.syncPhaseTimer();
                return;
            case "schedule_reveal":
                if (this.revealTimer) this.revealTimer.clear();
                this.revealTimer = this.clock.setTimeout(() => {
                    this.revealTimer = null;
                    this.finishSupportRevealAndAdvance();
                }, step.ms);
                return;
            case "schedule_effects":
                if (this.effectsTimer) this.effectsTimer.clear();
                this.effectsTimer = this.clock.setTimeout(() => {
                    this.effectsTimer = null;
                    this.finishBattleEffectsAndAdvance();
                }, step.ms);
                return;
            case "schedule_resolution":
                if (this.resolutionTimer) this.resolutionTimer.clear();
                this.resolutionTimer = this.clock.setTimeout(() => {
                    this.resolutionTimer = null;
                    if (this.state.phase !== "resolution") return;
                    const outcome = this.fidelitySession.completeResolutionPresentation();
                    if (outcome.kind === "ko_redeploy") return;
                    this.applyBattleBandOutcome(outcome);
                }, step.ms);
                return;
            case "outcome":
                this.applyBattleBandOutcome(step.outcome);
                return;
        }
    }

    private dispatchClientAction(
        client: Client,
        message: {
            type: string;
            cardId?: string;
            cardIds?: string[];
            evolutionOptionCardId?: string;
            gamble?: boolean;
            attack?: AttackType;
        }
    ) {
        const player = this.state.players.get(client.sessionId);
        if (!player) return;

        const actionType =
            message.type === "DEPLOY_ROOKIE" ? "DEPLOY_DIGIMON" : message.type;
        const battleAction = actionType === "LOCK_SUPPORT" || actionType === "LOCK_ATTACK";
        const isMyTurn = this.state.activePlayerSessionId === client.sessionId;
        if (!battleAction && !isMyTurn) return;

        if (actionType === "LOCK_SUPPORT") {
            if (this.state.phase !== "battle_support") return;
            if (message.gamble === true) {
                this.recordVoluntaryAction(client.sessionId);
                this.applyDispatchFollowUp(
                    this.fidelitySession.dispatch(client.sessionId, "LOCK_SUPPORT", { gamble: true })
                );
                return;
            }
            if (message.cardId != null && typeof message.cardId !== "string") return;
        }
        if (actionType === "LOCK_ATTACK") {
            if (this.state.phase !== "battle_attack") return;
            if (!message.attack || !["circle", "triangle", "cross"].includes(message.attack)) return;
        }
        if (actionType === "END_PREP") {
            if (this.state.prepSubPhase === "mulligan" || this.state.prepSubPhase === "deploy") return;
        }

        const knownActions = new Set<PlayerActionType>([
            "DRAW",
            "MULLIGAN",
            "ACCEPT_HAND",
            "DISCARD_FOR_DP",
            "END_DISCARD",
            "DEPLOY_DIGIMON",
            "DIG_FOR_DEPLOY",
            "PLAY_PREP_OPTION",
            "EVOLVE",
            "END_PREP",
            "LOCK_SUPPORT",
            "LOCK_ATTACK",
        ]);
        if (!knownActions.has(actionType as PlayerActionType)) return;

        this.recordVoluntaryAction(client.sessionId);
        const result = this.fidelitySession.dispatch(client.sessionId, actionType as PlayerActionType, {
            cardId: message.cardId,
            cardIds: Array.isArray(message.cardIds) ? message.cardIds : undefined,
            evolutionOptionCardId: message.evolutionOptionCardId,
            gamble: message.gamble === true,
            attack: message.attack,
        });
        this.applyDispatchFollowUp(result);
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

        const joinCheck = validateClientJoin(
            this.ruleProfile,
            this.arenaVariant,
            options?.ruleProfile,
            options?.arenaVariant
        );
        if (joinCheck.ok === false) {
            throw new Error(joinCheck.code);
        }

        const deckCardIds = this.parseDeckCardIds(options?.deckCardIds);
        const deckValidation = validateDeck(deckCardIds, CATALOG_BY_ID, this.arenaVariant);
        if (deckValidation.ok === false) {
            throw new Error(
                `invalid_deck:${deckValidation.reason}:${formatDeckValidationError(deckValidation)}`
            );
        }
        this.pendingDecks.set(client.sessionId, deckCardIds);

        const player = new PlayerSchema();
        player.sessionId = client.sessionId;
        const authName = (client as any).auth?.name;
        player.name = typeof authName === "string" && authName.trim().length > 0 ? authName : `Player ${this.state.players.size + 1}`;
        player.hp = 0; // Will be set when active Digimon is chosen
        player.connected = true;
        
        // Deck is assigned when the match starts (needs both players).

        this.state.players.set(client.sessionId, player);

        if (this.state.players.size === 2) {
            this.startGame();
        }
    }

    /**
     * Unexpected disconnect (FC-024): keep seat + player state for a fixed grace window.
     * Phase timers keep running (momentum continuity).
     */
    async onDrop(client: Client, code?: number) {
        console.log(`[SERVER] Client dropped: ${client.sessionId}, code: ${code}`);
        const player = this.state.players.get(client.sessionId);
        if (player) {
            player.connected = false;
        }

        const consented = isConsentedLeave(code);
        if (!shouldOfferReconnectGrace(this.state.phase, consented)) {
            return;
        }

        this.state.message = `${player?.name ?? "Player"} reconnecting...`;
        this.auditLog.emit({
            turn: this.state.turn,
            phase: this.state.phase,
            prepSubPhase: this.state.prepSubPhase,
            playerSessionId: client.sessionId,
            action: "DISCONNECT_GRACE",
            validation: "ok",
            fidelityIds: ["FC-024"],
            detail: { graceSeconds: RECONNECT_GRACE_SECONDS, code: code ?? null },
        });

        try {
            await this.allowReconnection(client, RECONNECT_GRACE_SECONDS);
        } catch {
            // Grace expired or reconnect denied — onLeave handles forfeit.
        }
    }

    onReconnect(client: Client) {
        console.log(`[SERVER] Client reconnected: ${client.sessionId}`);
        const player = this.state.players.get(client.sessionId);
        if (player) {
            player.connected = true;
        }
        if (this.state.phase !== "victory") {
            this.state.message = `${player?.name ?? "Player"} reconnected.`;
        }
        this.auditLog.emit({
            turn: this.state.turn,
            phase: this.state.phase,
            prepSubPhase: this.state.prepSubPhase,
            playerSessionId: client.sessionId,
            action: "RECONNECT",
            validation: "ok",
            fidelityIds: ["FC-024"],
        });
    }

    onLeave(client: Client, code?: number) {
        console.log(`[SERVER] Client left: ${client.sessionId}, code: ${code}`);
        this.pendingDecks.delete(client.sessionId);

        const phase = this.state.phase;

        if (this.fidelitySession.shouldForfeitOnPermanentLeave()) {
            this.endGame(client.sessionId, "disconnect");
        } else if (phase === "waiting") {
            this.state.message = "Waiting for players...";
        }

        this.state.players.delete(client.sessionId);

        if (code === CloseCode.CONSENTED && phase === "waiting") {
            this.clearPhaseTimer();
        }
    }

    startGame() {
        const sessions = Array.from(this.state.players.keys());
        this.fidelitySession.startMatch({
            sessionIds: sessions,
            deckCardIdsBySession: this.pendingDecks,
            fallbackDeckCardIds: playerIndex => buildDefaultDeckCardIds(CARD_CATALOG, playerIndex),
            materializeDeck: (playerIndex, cardIds) => this.buildDeckFromCardIds(playerIndex, cardIds),
        });
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
            se.requireOpponentType = String(
                (rawEffect as { requireOpponentType?: string }).requireOpponentType ?? ""
            );
            se.priority = Number((rawEffect as { priority?: number }).priority ?? 0);
            se.effectPlanJson = rawEffect.effectPlan
                ? serializeEffectPlanJson(rawEffect.effectPlan)
                : "";
            card.supportEffect = se;
        } else {
            card.supportEffect = null;
        }

        return card;
    }

    private parseDeckCardIds(raw: unknown): string[] {
        return resolveJoinDeckCardIds(raw, this.state.players.size, CARD_CATALOG);
    }

    private buildDeckFromCardIds(playerIndex: number, cardIds: string[]): CardSchema[] {
        return cardIds.map((baseId, index) => {
            const raw = CATALOG_BY_ID.get(baseId);
            if (!raw) {
                throw new Error(`invalid_deck:unknown_card_id:Missing catalog card ${baseId}`);
            }
            const instanceId = `p${playerIndex}_${baseId}_${index + 1}`;
            return this.toSchemaCard(raw, instanceId);
        });
    }

    private shuffle<T>(arr: T[]) {
        shuffleInPlace(arr, this.rng);
    }

    // ----------------------------
    // Phase logic (GDD)
    // ----------------------------

    private prepMessageFor(
        player: PlayerSchema,
        extras: {
            dugDeckForDigimon?: boolean;
            isKoRedeploy?: boolean;
            isDoubleKoRedeploy?: boolean;
        } = {}
    ): string {
        return getPrepServerMessage(this.state.prepSubPhase as "" | "mulligan" | "deploy" | "discard" | "evolve", {
            handTarget: this.ruleProfile.handTarget,
            mulligansRemaining: player.mulligansRemaining,
            needsOpeningDeploy: player.needsOpeningDeploy,
            dugDeckForDigimon: extras.dugDeckForDigimon,
            isKoRedeploy: extras.isKoRedeploy,
            isDoubleKoRedeploy: extras.isDoubleKoRedeploy,
        });
    }

    private toOptionCardView(card: CardSchema): OptionCardLike {
        return toOptionCardView(card);
    }

    private catalogBaseId(instanceId: string): string {
        const parts = instanceId.split("_");
        return parts.length >= 2 ? parts[1] : instanceId;
    }


    /** @internal Verify scripts may call through the Colyseus adapter. */
    evolve(player: PlayerSchema, cardId: string, evolutionOptionCardId?: string): boolean {
        return this.fidelitySession.evolve(player, cardId, evolutionOptionCardId);
    }

    private getActive(player: PlayerSchema): CardSchema | null {
        return player.active ?? null;
    }

    private getOpponent(player: PlayerSchema): PlayerSchema | null {
        const opponentSessionId = Array.from(this.state.players.keys()).find(id => id !== player.sessionId);
        return opponentSessionId ? this.state.players.get(opponentSessionId) ?? null : null;
    }

    private endPrepOrPassTurn(player: PlayerSchema) {
        const opponent = this.getOpponent(player);
        if (!opponent?.active) {
            this.endTurn();
            return;
        }
        this.beginBattlePhaseAfterPrep();
    }

    /**
     * No active Digimon and no legal card in hand: dig deck until a deployable
     * Digimon is found. Existing hand is kept (GDD KO / DIG_FOR_DEPLOY).
     */
    private tryRecoverDigimonFromDeck(player: PlayerSchema): boolean {
        const handBefore = player.hand.length;
        const deckStart = player.deck.length;
        const found = this.fidelitySession.tryRecoverDigimonFromDeckPublic(player);
        if (found) {
            const foundCard = player.hand[player.hand.length - 1];
            this.debugDraw("tryRecoverDigimonFromDeck: success", {
                sessionId: player.sessionId.slice(0, 8),
                handBefore,
                handAfter: player.hand.length,
                deckStart,
                found: foundCard ? `${foundCard.name} (${foundCard.id})` : null,
            });
            return true;
        }
        this.debugDraw("tryRecoverDigimonFromDeck: failed (deck empty)", {
            sessionId: player.sessionId.slice(0, 8),
            handBefore,
            deckStart,
        });
        return false;
    }

    private initFidelitySession() {
        this.fidelitySession = new FidelityBattleSession(
            {
                state: this.state,
                ruleProfile: this.ruleProfile,
                arenaVariant: this.arenaVariant,
                catalogById: CATALOG_BY_ID,
                getRng: () => this.rng,
            },
            {
                emitAudit: emit => this.auditLog.emit(emit),
                auditPlayer: (action, player, validation, reason, detail, extra) =>
                    this.audit(action, player, validation, reason, detail, extra),
                syncPhaseTimer: () => this.syncPhaseTimer(),
                clearPhaseTimer: () => this.clearPhaseTimer(),
                prepMessageFor: (player, extras) => this.prepMessageFor(player, extras),
                shuffleInPlace: arr => this.shuffle(arr),
                endGame: (loserSessionId, reason) => this.endGame(loserSessionId, reason),
                endPrepOrPassTurn: player => this.endPrepOrPassTurn(player),
            }
        );
    }

    get attackChoices() {
        return this.fidelitySession.attackChoices;
    }

    get supportCtx() {
        return this.fidelitySession.supportCtx;
    }

    private applyBattleBandOutcome(outcome: BattleBandOutcome) {
        switch (outcome.kind) {
            case "match_end":
                this.endGame(outcome.loserSessionId, outcome.reason);
                break;
            case "deck_out":
                this.endGame(outcome.loserSessionId, "deck_out");
                break;
            case "turn_complete":
                this.fidelitySession.handoffTurnAfterBattle();
                break;
            case "ko_redeploy":
                break;
        }
    }

    private beginBattlePhaseAfterPrep() {
        this.clearBattlePresentationTimers();
        this.fidelitySession.enterBattlePhase();
    }

    /** @internal Tests and timers call through the Colyseus adapter. */
    finishSupportRevealAndAdvance() {
        if (this.effectsTimer) {
            this.effectsTimer.clear();
            this.effectsTimer = null;
        }
        const result = this.fidelitySession.finishSupportRevealAndAdvance();
        if (result.kind === "schedule_effects") {
            this.applyPresentationAdvance({ kind: "schedule_effects", ms: result.ms });
            return;
        }
        if (result.presentation) {
            this.applyPresentationAdvance(result.presentation);
        }
    }

    finishBattleEffectsAndAdvance() {
        if (this.effectsTimer) {
            this.effectsTimer.clear();
            this.effectsTimer = null;
        }
        this.applyPresentationAdvance(this.fidelitySession.finishBattleEffectsAndAdvance());
    }

    maybeResolveBattle() {
        this.applyPresentationAdvance(this.fidelitySession.maybeResolveBattle());
    }

    private beginAttackSelection() {
        this.fidelitySession.beginAttackSelection();
        this.clearBattlePresentationTimers();
    }

    private beginSupportPlacement() {
        this.fidelitySession.beginSupportPlacement();
        this.clearBattlePresentationTimers();
    }

    private clearBattlePresentationTimers() {
        if (this.revealTimer) {
            this.revealTimer.clear();
            this.revealTimer = null;
        }
        if (this.effectsTimer) {
            this.effectsTimer.clear();
            this.effectsTimer = null;
        }
        if (this.resolutionTimer) {
            this.resolutionTimer.clear();
            this.resolutionTimer = null;
        }
    }

    private syncActiveHp(player: PlayerSchema): void {
        if (player.active) player.active.hp = player.hp;
    }

    private isKoRedeployFor(sessionId: string): boolean {
        return this.fidelitySession.isKoRedeployFor(sessionId);
    }

    private applyKoRedeployOutcome(outcome: BattleBandOutcome) {
        if (outcome.kind === "turn_complete") {
            this.fidelitySession.handoffTurnAfterBattle();
        } else if (outcome.kind === "deck_out") {
            this.endGame(outcome.loserSessionId, "deck_out");
        }
    }

    private endTurn() {
        this.fidelitySession.passActiveTurn();
    }

    private endGame(loserSessionId: string, reason: "points" | "deck_out" | "disconnect" | "afk") {
        this.clearPhaseTimer();
        if (this.revealTimer) {
            this.revealTimer.clear();
            this.revealTimer = null;
        }
        if (this.effectsTimer) {
            this.effectsTimer.clear();
            this.effectsTimer = null;
        }
        if (this.resolutionTimer) {
            this.resolutionTimer.clear();
            this.resolutionTimer = null;
        }
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
        this.fidelitySession.applyMatchEnd(loserSessionId, reason);

        if (this.replaySeed != null && DEBUG_BATTLE_ROOM) {
            console.log("[BattleRoom:replay]", this.auditLog.exportJson());
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

        const port = {
            auditTimeout: (sessionIds: string[], autoCommit: string) =>
                this.auditPhaseTimeout(phaseKey, sessionIds, autoCommit),
            applyStrike: (sessionId: string) => this.applyTimeoutStrike(sessionId),
        };
        const result = this.fidelitySession.handlePhaseTimeout(phaseKey, port);
        if (result.koOutcome) {
            this.applyKoRedeployOutcome(result.koOutcome);
        }
        if (result.presentation) {
            this.applyPresentationAdvance(result.presentation);
        }
    }

    private executeDrawPhase(player: PlayerSchema, auto: boolean) {
        this.logDrawSnapshot("DRAW before drawToTarget", player);
        this.fidelitySession.executeDrawPhase(player, auto);
        this.logDrawSnapshot("DRAW after drawToTarget", player);
    }

    private audit(
        action: string,
        player: PlayerSchema,
        validation: "ok" | "rejected",
        reason?: string,
        detail?: Record<string, unknown>,
        extra?: { fidelityIds?: string[]; stateDelta?: StateDelta }
    ) {
        this.auditLog.emit({
            turn: this.state.turn,
            phase: this.state.phase,
            prepSubPhase: this.state.prepSubPhase,
            playerSessionId: player.sessionId,
            action,
            validation,
            reason,
            fidelityIds: extra?.fidelityIds,
            handSize: player.hand.length,
            deckSize: player.deck.length,
            stateDelta: extra?.stateDelta,
            detail: {
                ...detail,
                player: snapshotPlayer(player),
            },
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
