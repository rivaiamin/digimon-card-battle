/**
 * Colyseus-free battle band: attack lock → support → reveal → effects → resolution / KO.
 * @see GLOSSARY.md — Fidelity battle session
 */

import type { AttackType } from "../types";
import {
    BattleStateSchema,
    CardSchema,
    PlayerSchema,
} from "../schema/BattleState";
import type { NormalizedCardCatalogEntry } from "./cardCatalogLoader";
import { parseEffectPlanJson } from "./effectPlan";
import { parseEffectArgsJson } from "./effectArgs";
import { resolveRuleProfile, type RuleProfile } from "./ruleProfile";
import { resolveArenaVariant, type ArenaVariant } from "./arenaVariant";
import type { Rng } from "./seededRng";
import {
    isPlayerActionLegal,
    SUPPORT_EFFECTS_MS,
    SUPPORT_REVEAL_MS,
    type PlayerActionType,
    type TurnPhase,
} from "./battleTurnFlow";
import type { PrepSubPhase } from "./openingFlow";
import type { BattleAuditEmit } from "./battleAuditLog";
import {
    applyBattleOptionToContext,
    applyFullStatsFromCatalog,
    canEvolveWithOption,
    classifyOptionEffect,
    parseEvolutionModifiers,
    resolvePrepOption,
    shouldRestoreFullStatsAfterEvolve,
    type OptionCardLike,
} from "./optionResolver";
import {
    canPlayEvolutionOption,
    canPlayPrepOption,
    canUseAsBattleSupport,
} from "./optionEligibility";
import { spendEvolutionDp } from "./evolutionEligibility";
import { applyOpeningPenalty, validateDeployDigimon } from "./openingFlow";
import { applyDiscardForDp } from "./discardForDp";
import {
    applyPostEvolutionRecovery,
    parseStatusAilmentsJson,
    serializeStatusAilments,
} from "./postEvolutionRecovery";
import { attemptOnlineDeckSupportGamble } from "./supportGamble";
import {
    canLockSupport,
    getDefenderSessionId,
    initialSupportPicker,
    nextSupportPickerAfterLock,
} from "./supportPhase";
import {
    createSupportBattleContext,
    resolveSupportPhase,
    type ResolveSupportHooks,
    type SupportBattleContext,
} from "./supportResolver";
import {
    buildSupportEffectNotifications,
    hasSupportEffectNotifications,
    serializeSupportEffects,
    snapshotSupportCtx,
} from "./supportEffectsNotify";
import {
    resolveFullBattle,
    resolveKoScoring,
    serializeCombatStrikes,
    type BattleCombatant,
    type BattleEvent,
} from "./battleEffectEngine";
import { pickRandomAttack, type TimedPhaseKey } from "./phaseTimer";
import {
    digForDeployableFromDeck,
    drawToTarget,
    hasDigimonInHand,
    hasLegalDeployInHand,
    mulliganHand,
    resolveInitialPrepSubPhase,
} from "./openingFlow";
import { getPrepServerMessage } from "./prepPhaseCopy";
import { isDeckOutOnDraw, loserSessionIdIfPointVictory } from "./matchOutcome";

export type FidelityBattleSessionDeps = {
    state: BattleStateSchema;
    ruleProfile: RuleProfile;
    arenaVariant: ArenaVariant;
    catalogById: Map<string, NormalizedCardCatalogEntry>;
    getRng: () => Rng;
};

export type PrepMessageExtras = {
    dugDeckForDigimon?: boolean;
    isKoRedeploy?: boolean;
    isDoubleKoRedeploy?: boolean;
};

export type FidelityBattleSessionHooks = {
    emitAudit: (emit: BattleAuditEmit) => void;
    auditPlayer: (
        action: string,
        player: PlayerSchema,
        validation: "ok" | "rejected",
        reason?: string,
        detail?: Record<string, unknown>,
        extra?: { fidelityIds?: string[] }
    ) => void;
    syncPhaseTimer: () => void;
    clearPhaseTimer: () => void;
    prepMessageFor: (player: PlayerSchema, extras?: PrepMessageExtras) => string;
    shuffleInPlace: <T>(arr: T[]) => void;
    endGame: (loserSessionId: string, reason: "points" | "deck_out" | "disconnect" | "afk") => void;
    endPrepOrPassTurn: (player: PlayerSchema) => void;
};

export type DispatchPayload = {
    cardId?: string | null;
    cardIds?: string[];
    gamble?: boolean;
    attack?: AttackType;
    evolutionOptionCardId?: string;
    auto?: boolean;
};

export type DispatchResult =
    | { ok: true; koOutcome?: BattleBandOutcome; presentation?: PresentationAdvanceResult }
    | { ok: false; reason: string };

/**
 * Room-driven presentation steps after rule mutations.
 * Attack-first: schedule_reveal → (schedule_effects?) → schedule_resolution → {@link completeResolutionPresentation}.
 * Support-first: schedule_reveal → (schedule_effects?) → sync_timer (attack lock) → schedule_resolution → outcome.
 */
export type PresentationAdvanceResult =
    | { kind: "idle" }
    | { kind: "schedule_reveal"; ms: number }
    | { kind: "schedule_effects"; ms: number }
    | { kind: "schedule_resolution"; ms: number }
    | { kind: "sync_timer" }
    | { kind: "outcome"; outcome: BattleBandOutcome };

export type PhaseTimeoutPort = {
    auditTimeout: (sessionIds: string[], autoCommit: string) => void;
    /** @returns true when the match ended (forfeit) and timeout handling must stop */
    applyStrike: (sessionId: string) => boolean;
};

export type PhaseTimeoutResult = {
    koOutcome?: BattleBandOutcome;
    presentation?: PresentationAdvanceResult;
};

export type BattleBandOutcome =
    | { kind: "turn_complete" }
    | { kind: "ko_redeploy" }
    | { kind: "deck_out"; loserSessionId: string }
    | { kind: "match_end"; loserSessionId: string; reason: "points" };

export type DeployDigimonResult =
    | { ok: true; koOutcome?: BattleBandOutcome }
    | { ok: false; reason: string };

export type DiscardForDpResult = ReturnType<typeof applyDiscardForDp>;

export type RevealCommitResult =
    | { kind: "immediate_effects_done"; presentation?: PresentationAdvanceResult }
    | { kind: "schedule_effects"; ms: number };

function catalogBaseId(instanceId: string): string {
    const parts = instanceId.split("_");
    return parts.length >= 2 ? parts[1] : instanceId;
}

export function toOptionCardView(card: CardSchema): OptionCardLike {
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
        supportEffect: card.supportEffect
            ? {
                  type: card.supportEffect.type,
                  description: card.supportEffect.description,
                  value: card.supportEffect.value,
                  targetAttack: card.supportEffect.targetAttack,
                  effectPlan: card.supportEffect.effectPlanJson
                      ? parseEffectPlanJson(card.supportEffect.effectPlanJson)
                      : undefined,
              }
            : null,
    };
}

export function toBattleCombatant(player: PlayerSchema): BattleCombatant {
    const active = player.active;
    return {
        sessionId: player.sessionId,
        hp: player.hp,
        maxHp: active?.maxHp ?? player.hp,
        specialty: active?.type ?? "",
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

export class FidelityBattleSession {
    readonly supportChoices = new Map<string, CardSchema | null>();
    readonly attackChoices = new Map<string, AttackType | null>();
    supportCtx: SupportBattleContext = createSupportBattleContext();

    private readonly deps: FidelityBattleSessionDeps;
    private readonly hooks: FidelityBattleSessionHooks;
    private battleTurnOwnerSessionId = "";
    private koRedeployQueue: string[] = [];

    constructor(deps: FidelityBattleSessionDeps, hooks: FidelityBattleSessionHooks) {
        this.deps = deps;
        this.hooks = hooks;
    }

    private get state() {
        return this.deps.state;
    }

    private get ruleProfile() {
        return this.deps.ruleProfile;
    }

    private rng(): Rng {
        return this.deps.getRng();
    }

    legalityContext(sessionId: string): {
        phase: TurnPhase;
        prepSubPhase: PrepSubPhase;
        isYourTurn: boolean;
        hasActive: boolean;
        supportLocked: boolean;
        attackLocked: boolean;
    } {
        const player = this.state.players.get(sessionId);
        return {
            phase: this.state.phase as TurnPhase,
            prepSubPhase: this.state.prepSubPhase as PrepSubPhase,
            isYourTurn: this.state.activePlayerSessionId === sessionId,
            hasActive: Boolean(player?.active),
            supportLocked: Boolean(player?.supportLocked),
            attackLocked: Boolean(player?.attackLocked),
        };
    }

    dispatch(
        sessionId: string,
        action: PlayerActionType,
        payload: DispatchPayload = {}
    ): DispatchResult {
        const player = this.state.players.get(sessionId);
        if (!player) return { ok: false, reason: "illegal_timing" };

        const ctx = this.legalityContext(sessionId);
        if (!isPlayerActionLegal(action, ctx)) {
            return { ok: false, reason: "illegal_timing" };
        }

        switch (action) {
            case "DRAW":
                this.executeDrawPhase(player, payload.auto === true);
                return { ok: true };
            case "MULLIGAN":
                return this.mulligan(player);
            case "ACCEPT_HAND":
                return this.acceptHand(player);
            case "DISCARD_FOR_DP":
                return this.dispatchDiscardForDp(player, payload.cardIds ?? []);
            case "END_DISCARD":
                if (!this.getActive(player)) return { ok: false, reason: "illegal_timing" };
                this.state.prepSubPhase = "evolve";
                this.hooks.auditPlayer("END_DISCARD", player, "ok");
                this.state.message = this.hooks.prepMessageFor(player);
                this.hooks.syncPhaseTimer();
                return { ok: true };
            case "DEPLOY_DIGIMON": {
                if (typeof payload.cardId !== "string") return { ok: false, reason: "illegal_timing" };
                const deploy = this.deployDigimon(player, payload.cardId);
                if (deploy.ok === false) return { ok: false, reason: deploy.reason };
                return { ok: true, koOutcome: deploy.koOutcome };
            }
            case "DIG_FOR_DEPLOY":
                return this.digForDeploy(player);
            case "PLAY_PREP_OPTION":
                if (typeof payload.cardId !== "string") return { ok: false, reason: "illegal_timing" };
                this.playPrepOption(player, payload.cardId);
                return { ok: true };
            case "EVOLVE": {
                if (typeof payload.cardId !== "string") return { ok: false, reason: "illegal_timing" };
                const dpBefore = player.dp;
                const evolved = this.evolve(player, payload.cardId, payload.evolutionOptionCardId);
                this.hooks.auditPlayer(
                    "EVOLVE",
                    player,
                    evolved ? "ok" : "rejected",
                    evolved ? undefined : "invalid_evolution",
                    {
                        cardId: payload.cardId,
                        evolutionOptionCardId: payload.evolutionOptionCardId,
                        dpBefore,
                        dpAfter: player.dp,
                        hpAfter: player.hp,
                        statusAilmentsJson: player.statusAilmentsJson,
                    },
                    { fidelityIds: evolved ? ["FC-007", "FC-009"] : ["FC-007"] }
                );
                return evolved ? { ok: true } : { ok: false, reason: "invalid_evolution" };
            }
            case "END_PREP":
                return this.endPrep(player);
            case "LOCK_SUPPORT": {
                const locked = this.lockSupport(sessionId, payload.cardId ?? null, {
                    gamble: payload.gamble === true,
                });
                if (!locked.ok) return locked;
                const presentation = this.afterLockSupport();
                return presentation.kind === "idle"
                    ? locked
                    : { ...locked, presentation };
            }
            case "LOCK_ATTACK":
                if (!payload.attack) return { ok: false, reason: "illegal_timing" };
                return this.lockAttack(sessionId, payload.attack);
            default:
                return { ok: false, reason: "illegal_timing" };
        }
    }

    drawToHandTarget(player: PlayerSchema): void {
        const target = this.ruleProfile.handTarget;
        drawToTarget(player.hand, player.deck, target);
    }

    beginPrepSubPhase(player: PlayerSchema): void {
        this.state.prepSubPhase = resolveInitialPrepSubPhase(
            !!this.getActive(player),
            player.needsOpeningDeploy,
            player.mulligansRemaining,
            this.ruleProfile
        );
        this.state.message = this.hooks.prepMessageFor(player);
        this.hooks.syncPhaseTimer();
    }

    executeDrawPhase(player: PlayerSchema, auto: boolean): void {
        this.drawToHandTarget(player);
        if ((this.state.phase as string) === "victory") return;

        const target = this.ruleProfile.handTarget;
        const hasActive = !!this.getActive(player);
        const digimonInHand = hasDigimonInHand(player.hand);
        let dugDeckForDigimon = false;

        if (hasActive) {
            if (
                isDeckOutOnDraw({
                    hasActive: true,
                    handSize: player.hand.length,
                    deckSize: player.deck.length,
                    handTarget: target,
                })
            ) {
                this.hooks.auditPlayer("DRAW", player, "rejected", "deck_out_active", {
                    handSize: player.hand.length,
                    deckSize: player.deck.length,
                    auto,
                });
                this.hooks.endGame(player.sessionId, "deck_out");
                return;
            }
        } else if (!digimonInHand) {
            if (!this.tryRecoverDigimonFromDeckPublic(player)) {
                this.hooks.auditPlayer("DRAW", player, "rejected", "deck_out_no_digimon", {
                    handSize: player.hand.length,
                    deckSize: player.deck.length,
                    auto,
                });
                this.hooks.endGame(player.sessionId, "deck_out");
                return;
            }
            dugDeckForDigimon = true;
        }

        this.state.phase = "preparation";
        this.beginPrepSubPhase(player);
        this.hooks.auditPlayer("DRAW", player, "ok", undefined, {
            dugDeckForDigimon,
            handSize: player.hand.length,
            auto,
        });
        this.state.message = dugDeckForDigimon
            ? this.hooks.prepMessageFor(player, { dugDeckForDigimon: true })
            : this.hooks.prepMessageFor(player);
    }

    timeoutAcceptHand(player: PlayerSchema): void {
        this.state.prepSubPhase = "deploy";
        this.state.message = this.hooks.prepMessageFor(player);
        this.hooks.syncPhaseTimer();
    }

    timeoutEndDiscard(player: PlayerSchema): void {
        this.state.prepSubPhase = "evolve";
        this.state.message = this.hooks.prepMessageFor(player);
        this.hooks.syncPhaseTimer();
    }

    autoDeployDigimon(player: PlayerSchema): BattleBandOutcome | undefined {
        if (this.state.prepSubPhase !== "deploy" && this.state.prepSubPhase !== "") return;
        if (this.getActive(player)) {
            if (this.isKoRedeployFor(player.sessionId)) {
                return this.continueKoRedeployAfterDeploy();
            }
            this.autoEndPrep(player);
            return;
        }
        for (const card of player.hand) {
            const validation = validateDeployDigimon(card, this.ruleProfile, player.needsOpeningDeploy);
            if (validation.ok !== false) {
                const deploy = this.deployDigimon(player, card.id);
                return deploy.ok ? deploy.koOutcome : undefined;
            }
        }
        if (!hasLegalDeployInHand(player.hand, this.ruleProfile, player.needsOpeningDeploy)) {
            if (!this.tryRecoverDigimonFromDeckPublic(player)) {
                this.hooks.endGame(player.sessionId, "deck_out");
                return;
            }
            return this.autoDeployDigimon(player);
        }
        if (this.isKoRedeployFor(player.sessionId)) {
            this.hooks.endGame(player.sessionId, "deck_out");
            return;
        }
        this.autoEndPrep(player);
    }

    autoEndPrep(player: PlayerSchema): void {
        if (this.state.phase !== "preparation" || this.state.prepSubPhase !== "evolve") return;
        if (!this.getActive(player)) {
            if (!hasDigimonInHand(player.hand)) {
                if (!this.tryRecoverDigimonFromDeckPublic(player)) {
                    this.hooks.endGame(player.sessionId, "deck_out");
                } else {
                    this.state.prepSubPhase = "deploy";
                    this.state.message = this.hooks.prepMessageFor(player, { dugDeckForDigimon: true });
                    this.hooks.syncPhaseTimer();
                }
            }
            return;
        }
        this.hooks.auditPlayer("END_PREP", player, "ok", undefined, { auto: true });
        this.hooks.endPrepOrPassTurn(player);
    }

    private mulligan(player: PlayerSchema): DispatchResult {
        if (player.mulligansRemaining <= 0) return { ok: false, reason: "illegal_timing" };
        player.mulligansRemaining -= 1;
        mulliganHand(player.hand, player.deck, this.ruleProfile.handTarget, arr =>
            this.hooks.shuffleInPlace(arr)
        );
        if (!hasDigimonInHand(player.hand) && !this.tryRecoverDigimonFromDeckPublic(player)) {
            this.hooks.auditPlayer("MULLIGAN", player, "rejected", "deck_out_no_digimon");
            this.hooks.endGame(player.sessionId, "deck_out");
            return { ok: false, reason: "deck_out" };
        }
        this.hooks.auditPlayer("MULLIGAN", player, "ok", undefined, {
            mulligansRemaining: player.mulligansRemaining,
            handSize: player.hand.length,
        });
        if (player.mulligansRemaining <= 0) {
            this.state.prepSubPhase = "deploy";
        }
        this.state.message = this.hooks.prepMessageFor(player);
        this.hooks.syncPhaseTimer();
        return { ok: true };
    }

    private acceptHand(player: PlayerSchema): DispatchResult {
        this.state.prepSubPhase = "deploy";
        this.hooks.auditPlayer("ACCEPT_HAND", player, "ok");
        this.state.message = this.hooks.prepMessageFor(player);
        this.hooks.syncPhaseTimer();
        return { ok: true };
    }

    private dispatchDiscardForDp(player: PlayerSchema, cardIds: string[]): DispatchResult {
        const dpBefore = player.dp;
        const result = this.discardForDp(player, cardIds);
        if (result.discardedIds.length === 0) {
            this.hooks.auditPlayer("DISCARD_FOR_DP", player, "rejected", "no_valid_discards", {
                cardIds,
                rejectedIds: result.rejectedIds,
            });
            return { ok: false, reason: "no_valid_discards" };
        }
        this.hooks.auditPlayer("DISCARD_FOR_DP", player, "ok", undefined, {
            cardIds: result.discardedIds,
            rejectedIds: result.rejectedIds,
            dpBefore,
            dpAfter: player.dp,
            dpGained: result.dpGained,
        });
        return { ok: true };
    }

    private digForDeploy(player: PlayerSchema): DispatchResult {
        if (this.getActive(player)) return { ok: false, reason: "illegal_timing" };
        if (hasLegalDeployInHand(player.hand, this.ruleProfile, player.needsOpeningDeploy)) {
            this.hooks.auditPlayer("DIG_FOR_DEPLOY", player, "rejected", "legal_deploy_in_hand");
            return { ok: false, reason: "legal_deploy_in_hand" };
        }
        if (!this.tryRecoverDigimonFromDeckPublic(player)) {
            this.hooks.auditPlayer("DIG_FOR_DEPLOY", player, "rejected", "deck_out_no_digimon");
            this.hooks.endGame(player.sessionId, "deck_out");
            return { ok: false, reason: "deck_out" };
        }
        this.hooks.auditPlayer("DIG_FOR_DEPLOY", player, "ok");
        this.state.message = this.hooks.prepMessageFor(player, { dugDeckForDigimon: true });
        this.hooks.syncPhaseTimer();
        return { ok: true };
    }

    private endPrep(player: PlayerSchema): DispatchResult {
        if (!this.getActive(player)) {
            if (!hasDigimonInHand(player.hand)) {
                if (!this.tryRecoverDigimonFromDeckPublic(player)) {
                    this.hooks.auditPlayer("END_PREP", player, "rejected", "deck_out_no_digimon");
                    this.hooks.endGame(player.sessionId, "deck_out");
                    return { ok: false, reason: "deck_out" };
                }
                this.state.prepSubPhase = "deploy";
                this.state.message = this.hooks.prepMessageFor(player, { dugDeckForDigimon: true });
                return { ok: true };
            }
            return { ok: false, reason: "illegal_timing" };
        }
        this.hooks.auditPlayer("END_PREP", player, "ok");
        this.hooks.endPrepOrPassTurn(player);
        return { ok: true };
    }

    enterBattlePhase(): void {
        this.state.combatStrikesJson = "";
        this.state.lastBattleAttackerSessionId = "";
        this.state.supportEffectsJson = "";
        this.battleTurnOwnerSessionId = this.state.activePlayerSessionId;
        if (this.ruleProfile.battle.attackLockBeforeSupport) {
            this.beginAttackSelection();
        } else {
            this.beginSupportPlacement();
        }
    }

    beginAttackSelection(): void {
        this.state.phase = "battle_attack";
        this.state.prepSubPhase = "";
        this.state.message = "Battle Phase: Select Attack";
        this.state.supportPickSessionId = "";

        this.supportChoices.clear();
        this.attackChoices.clear();
        this.supportCtx = createSupportBattleContext();
        this.state.supportEffectsJson = "";
        this.state.players.forEach(p => {
            p.supportCard = null;
            p.supportLocked = false;
            p.selectedAttack = null;
            p.attackLocked = false;
            this.supportChoices.set(p.sessionId, null);
            this.attackChoices.set(p.sessionId, null);
        });
        this.hooks.syncPhaseTimer();
    }

    beginSupportPlacement(): void {
        this.state.phase = "battle_support";
        this.state.prepSubPhase = "";
        const attackFirst = this.ruleProfile.battle.attackLockBeforeSupport;

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
        this.hooks.syncPhaseTimer();
    }

    lockSupport(
        sessionId: string,
        cardId: string | null,
        options?: { gamble?: boolean }
    ): DispatchResult {
        const player = this.state.players.get(sessionId);
        if (!player) return { ok: false, reason: "illegal_timing" };
        if (
            !canLockSupport(
                sessionId,
                this.state.supportPickSessionId,
                this.ruleProfile.battle.supportPickDefenderFirst,
                player.supportLocked
            )
        ) {
            return { ok: false, reason: "illegal_timing" };
        }

        let chosen: CardSchema | null = null;
        if (options?.gamble) {
            const result = attemptOnlineDeckSupportGamble(
                player.deck,
                this.ruleProfile.battle.allowOnlineDeckGamble
            );
            if (!result.ok) return { ok: false, reason: "illegal_timing" };
            chosen = result.card;
        } else if (cardId) {
            const idx = player.hand.findIndex(c => c.id === cardId);
            if (idx === -1) return { ok: false, reason: "card_not_in_hand" };
            chosen = player.hand[idx];
            const view = toOptionCardView(chosen);
            if (!canUseAsBattleSupport(view)) return { ok: false, reason: "illegal_timing" };
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

        const sessions = Array.from(this.state.players.keys());
        if (sessions.length === 2 && this.state.phase === "battle_support") {
            const p1 = this.state.players.get(sessions[0])!;
            const p2 = this.state.players.get(sessions[1])!;
            if (!p1.supportLocked || !p2.supportLocked) {
                this.hooks.syncPhaseTimer();
            }
        }
        return { ok: true };
    }

    lockAttack(sessionId: string, attack: AttackType): DispatchResult {
        const player = this.state.players.get(sessionId);
        if (!player) return { ok: false, reason: "illegal_timing" };
        if (player.attackLocked) return { ok: false, reason: "illegal_timing" };
        player.attackLocked = true;
        this.attackChoices.set(sessionId, attack);
        let presentation: PresentationAdvanceResult = { kind: "idle" };
        if (this.ruleProfile.battle.attackLockBeforeSupport) {
            this.maybeBeginSupportAfterAttacks();
        } else {
            presentation = this.maybeResolveBattle();
        }
        return presentation.kind === "idle" ? { ok: true } : { ok: true, presentation };
    }

    /** After both supports lock: enter reveal phase; room schedules the reveal timer. */
    afterLockSupport(): PresentationAdvanceResult {
        const { advanced } = this.tryAdvanceToSupportReveal();
        if (!advanced) return { kind: "idle" };
        return { kind: "schedule_reveal", ms: SUPPORT_REVEAL_MS };
    }

    /** After attack locks in the support-first profile, attempt battle resolution presentation. */
    afterLockAttack(): PresentationAdvanceResult {
        if (this.ruleProfile.battle.attackLockBeforeSupport) return { kind: "idle" };
        return this.maybeResolveBattle();
    }

    /** Sync path when both supports are locked (room may schedule reveal timer after). */
    tryAdvanceToSupportReveal(): { advanced: boolean } {
        const sessions = Array.from(this.state.players.keys());
        if (sessions.length !== 2) return { advanced: false };
        const p1 = this.state.players.get(sessions[0])!;
        const p2 = this.state.players.get(sessions[1])!;
        if (!p1.supportLocked || !p2.supportLocked) return { advanced: false };

        this.hooks.clearPhaseTimer();
        this.state.phaseEndsAtMs = 0;

        const c1 = this.supportChoices.get(p1.sessionId) ?? null;
        const c2 = this.supportChoices.get(p2.sessionId) ?? null;
        p1.supportCard = c1;
        p2.supportCard = c2;

        this.state.phase = "battle_reveal";
        this.state.message = "Support Reveal";
        return { advanced: true };
    }

    finishSupportRevealAndAdvance(): RevealCommitResult {
        const sessions = Array.from(this.state.players.keys());
        if (sessions.length !== 2) return { kind: "immediate_effects_done" };
        const p1 = this.state.players.get(sessions[0])!;
        const p2 = this.state.players.get(sessions[1])!;
        const active = this.state.players.get(this.state.activePlayerSessionId);
        if (!active) return { kind: "immediate_effects_done" };
        const defender = sessions[0] === this.state.activePlayerSessionId ? p2 : p1;

        const activeSupport = active.supportCard;
        const defenderSupport = defender.supportCard;

        const hpBefore: Record<string, number> = {
            [active.sessionId]: active.hp,
            [defender.sessionId]: defender.hp,
        };
        const ctxBefore = snapshotSupportCtx(this.supportCtx);

        const resolveHooks: ResolveSupportHooks = {
            applyBattleOption: (source, card, ctx) => {
                const opponent = source.sessionId === active.sessionId ? defender : active;
                const hpTarget = {
                    hp: source.hp,
                    maxHp: source.active?.maxHp ?? source.hp,
                };
                applyBattleOptionToContext(toOptionCardView(card), source.sessionId, ctx, hpTarget, {
                    source,
                    target: opponent,
                    sourceAttack: this.attackChoices.get(source.sessionId) ?? null,
                    targetAttack: this.attackChoices.get(opponent.sessionId) ?? null,
                    hooks: resolveHooks,
                    onUnresolved: (reason, detail) => {
                        this.hooks.auditPlayer(
                            "BATTLE_OPTION_UNRESOLVED",
                            source,
                            "rejected",
                            reason,
                            detail
                        );
                    },
                });
                source.hp = hpTarget.hp;
                source.trash.push(card);
            },
            drawCards: (source, count) => {
                for (let i = 0; i < count; i++) {
                    if (source.deck.length <= 0) break;
                    source.hand.push(source.deck.shift()!);
                }
            },
            rng: this.rng(),
        };

        const nullify = resolveSupportPhase(
            active,
            defender,
            activeSupport,
            defenderSupport,
            this.supportCtx,
            {
                activeSessionId: this.state.activePlayerSessionId,
                sessionOrder: sessions,
            },
            resolveHooks,
            this.ruleProfile.battle.attackLockBeforeSupport
                ? {
                      activeAttack: this.attackChoices.get(active.sessionId) ?? null,
                      defenderAttack: this.attackChoices.get(defender.sessionId) ?? null,
                  }
                : undefined
        );
        this.syncActiveHp(active);
        this.syncActiveHp(defender);

        this.discardResolvedSupport(active, activeSupport);
        this.discardResolvedSupport(defender, defenderSupport);

        const effects = buildSupportEffectNotifications({
            activeSessionId: active.sessionId,
            defenderSessionId: defender.sessionId,
            hpBefore,
            hpAfter: {
                [active.sessionId]: active.hp,
                [defender.sessionId]: defender.hp,
            },
            before: ctxBefore,
            after: this.supportCtx,
            nullify,
        });
        this.state.supportEffectsJson = serializeSupportEffects(effects);

        if (hasSupportEffectNotifications(effects)) {
            this.state.phase = "battle_effects";
            this.state.message = "Support Effect";
            return { kind: "schedule_effects", ms: SUPPORT_EFFECTS_MS };
        }
        const presentation = this.finishBattleEffectsAndAdvance();
        return {
            kind: "immediate_effects_done",
            presentation: presentation.kind === "idle" ? undefined : presentation,
        };
    }

    finishBattleEffectsAndAdvance(): PresentationAdvanceResult {
        if (this.ruleProfile.battle.attackLockBeforeSupport) {
            this.state.phase = "resolution";
            this.state.message = "Resolving Battle...";
            return this.maybeResolveBattle();
        }
        this.state.phase = "battle_attack";
        this.state.message = "Battle Phase: Select Attack";
        this.hooks.syncPhaseTimer();
        return { kind: "sync_timer" };
    }

    maybeResolveBattle(): PresentationAdvanceResult {
        const sessions = Array.from(this.state.players.keys());
        if (sessions.length !== 2) return { kind: "idle" };
        const p1 = this.state.players.get(sessions[0])!;
        const p2 = this.state.players.get(sessions[1])!;
        if (!p1.attackLocked || !p2.attackLocked) return { kind: "idle" };

        this.hooks.clearPhaseTimer();
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
            toBattleCombatant(p1),
            toBattleCombatant(p2),
            a1,
            a2,
            this.state.activePlayerSessionId,
            this.supportCtx
        );

        p1.hp = battle.p1Hp;
        p2.hp = battle.p2Hp;
        this.syncActiveHp(p1);
        this.syncActiveHp(p2);
        this.state.combatStrikesJson = serializeCombatStrikes(battle.strikes);
        this.state.lastBattleAttackerSessionId = this.state.activePlayerSessionId;

        for (const event of battle.events) {
            this.emitBattleEvent(event, p1.sessionId, battle.p1Hp, battle.p2Hp);
        }

        return { kind: "schedule_resolution", ms: 0 };
    }

    completeResolutionPresentation(): BattleBandOutcome {
        if (this.state.phase !== "resolution") return { kind: "turn_complete" };
        const outcome = this.resolveKOsAndMaybeEndGame();
        if (outcome) return outcome;
        if (this.koRedeployQueue.length > 0) return { kind: "ko_redeploy" };
        return { kind: "turn_complete" };
    }

    isKoRedeployFor(sessionId: string): boolean {
        return this.koRedeployQueue.length > 0 && this.koRedeployQueue[0] === sessionId;
    }

    continueKoRedeployAfterDeploy(): BattleBandOutcome {
        this.koRedeployQueue.shift();
        return this.advanceKoRedeploy();
    }

    clearKoRedeployOnDrawPhase(): void {
        this.koRedeployQueue = [];
    }

    autoCommitSupportTimeouts(
        phaseKey: TimedPhaseKey,
        port: PhaseTimeoutPort
    ): PhaseTimeoutResult {
        if (this.state.phase !== "battle_support") return {};

        if (this.ruleProfile.battle.supportPickDefenderFirst && this.state.supportPickSessionId) {
            const sessionId = this.state.supportPickSessionId;
            const player = this.state.players.get(sessionId);
            if (!player || player.supportLocked) return {};
            port.auditTimeout([sessionId], "auto_no_support");
            if (port.applyStrike(sessionId)) return {};
            this.lockSupport(sessionId, null);
            return { presentation: this.afterLockSupport() };
        }

        for (const player of this.state.players.values()) {
            if (player.supportLocked) continue;
            port.auditTimeout([player.sessionId], "auto_no_support");
            if (port.applyStrike(player.sessionId)) return {};
            this.lockSupport(player.sessionId, null);
        }
        return { presentation: this.afterLockSupport() };
    }

    autoCommitAttackTimeouts(phaseKey: TimedPhaseKey, port: PhaseTimeoutPort): PhaseTimeoutResult {
        if (this.state.phase !== "battle_attack") return {};
        let presentation: PresentationAdvanceResult = { kind: "idle" };
        for (const player of this.state.players.values()) {
            if (player.attackLocked) continue;
            port.auditTimeout([player.sessionId], "auto_random_attack");
            if (port.applyStrike(player.sessionId)) return {};
            const locked = this.lockAttack(player.sessionId, pickRandomAttack(this.rng()));
            if (locked.ok && locked.presentation) {
                presentation = locked.presentation;
            }
        }
        if (presentation.kind === "idle") {
            presentation = this.afterLockAttack();
        }
        return presentation.kind === "idle" ? {} : { presentation };
    }

    handlePhaseTimeout(phaseKey: TimedPhaseKey, port: PhaseTimeoutPort): PhaseTimeoutResult {
        switch (phaseKey) {
            case "draw": {
                const player = this.state.players.get(this.state.activePlayerSessionId);
                if (!player || this.state.phase !== "draw") return {};
                port.auditTimeout([player.sessionId], "auto_draw");
                if (port.applyStrike(player.sessionId)) return {};
                this.executeDrawPhase(player, true);
                return {};
            }
            case "prep_mulligan": {
                const player = this.state.players.get(this.state.activePlayerSessionId);
                if (!player || this.state.phase !== "preparation") return {};
                port.auditTimeout([player.sessionId], "auto_accept_hand");
                if (port.applyStrike(player.sessionId)) return {};
                this.timeoutAcceptHand(player);
                return {};
            }
            case "prep_deploy": {
                const player = this.state.players.get(this.state.activePlayerSessionId);
                if (!player || this.state.phase !== "preparation") return {};
                port.auditTimeout([player.sessionId], "auto_deploy");
                if (port.applyStrike(player.sessionId)) return {};
                const koOutcome = this.autoDeployDigimon(player);
                return koOutcome ? { koOutcome } : {};
            }
            case "prep_discard": {
                const player = this.state.players.get(this.state.activePlayerSessionId);
                if (!player || this.state.phase !== "preparation" || !this.getActive(player)) return {};
                port.auditTimeout([player.sessionId], "auto_end_discard");
                if (port.applyStrike(player.sessionId)) return {};
                this.timeoutEndDiscard(player);
                return {};
            }
            case "prep_evolve": {
                const player = this.state.players.get(this.state.activePlayerSessionId);
                if (!player || this.state.phase !== "preparation") return {};
                port.auditTimeout([player.sessionId], "auto_end_prep");
                if (port.applyStrike(player.sessionId)) return {};
                this.autoEndPrep(player);
                return {};
            }
            case "battle_support":
                return this.autoCommitSupportTimeouts(phaseKey, port);
            case "battle_attack":
                return this.autoCommitAttackTimeouts(phaseKey, port);
            default:
                return {};
        }
    }

    handoffTurnAfterBattle(): void {
        const sessions = Array.from(this.state.players.keys());
        const turnOwner =
            this.battleTurnOwnerSessionId || this.state.activePlayerSessionId;
        const defender = getDefenderSessionId(turnOwner, sessions);
        this.state.activePlayerSessionId = defender;
        this.state.turn += 1;
        this.consumeTurnComplete();
        this.enterDrawPhase();
    }

    passActiveTurn(): void {
        const sessions = Array.from(this.state.players.keys());
        const currentIndex = sessions.indexOf(this.state.activePlayerSessionId);
        this.state.activePlayerSessionId = sessions[(currentIndex + 1) % sessions.length];
        this.state.turn += 1;
        this.enterDrawPhase();
    }

    enterDrawPhase(): void {
        this.clearKoRedeployOnDrawPhase();
        this.state.phase = "draw";
        this.state.prepSubPhase = "";
        this.state.message = "Draw Phase";
        this.hooks.syncPhaseTimer();
    }

    private emitBattleEvent(event: BattleEvent, p1SessionId: string, p1Hp: number, p2Hp: number): void {
        this.hooks.emitAudit({
            turn: this.state.turn,
            phase: "resolution",
            prepSubPhase: "",
            playerSessionId: event.sessionId ?? "",
            action: event.type,
            validation: "ok",
            fidelityIds: ["FC-017", "FC-018", "FC-016"],
            detail: event.detail,
            stateDelta: {
                hp: event.sessionId === p1SessionId ? p1Hp : p2Hp,
            },
        });
    }

    private maybeBeginSupportAfterAttacks(): void {
        const sessions = Array.from(this.state.players.keys());
        if (sessions.length !== 2) return;
        const p1 = this.state.players.get(sessions[0])!;
        const p2 = this.state.players.get(sessions[1])!;
        if (!p1.attackLocked || !p2.attackLocked) return;
        this.beginSupportPlacement();
    }

    private syncActiveHp(player: PlayerSchema): void {
        if (player.active) player.active.hp = player.hp;
    }

    private discardResolvedSupport(player: PlayerSchema, card: CardSchema | null): void {
        if (!card) return;
        let inTrash = false;
        for (let i = 0; i < player.trash.length; i++) {
            if (player.trash[i] === card) {
                inTrash = true;
                break;
            }
        }
        if (!inTrash) player.trash.push(card);
        player.supportCard = null;
    }

    private resolveKOsAndMaybeEndGame(): BattleBandOutcome | null {
        const sessions = Array.from(this.state.players.keys());
        if (sessions.length !== 2) return null;
        const pA = this.state.players.get(sessions[0])!;
        const pB = this.state.players.get(sessions[1])!;

        const ko = resolveKoScoring(pA.hp, pB.hp);
        if (ko.scoreDelta.p1 === 0 && ko.scoreDelta.p2 === 0 && pA.hp > 0 && pB.hp > 0) {
            return null;
        }

        if (ko.isDoubleKo) {
            this.trashEvolutionStack(pA);
            this.trashEvolutionStack(pB);
            this.state.message = getPrepServerMessage("deploy", { isDoubleKoRedeploy: true });
            this.hooks.emitAudit({
                turn: this.state.turn,
                phase: this.state.phase,
                prepSubPhase: "",
                playerSessionId: "",
                action: "DOUBLE_KO",
                validation: "ok",
                fidelityIds: ["FC-005", "FC-019"],
                detail: { p1Hp: pA.hp, p2Hp: pB.hp },
            });
            return this.beginKoRedeploy([pA.sessionId, pB.sessionId]);
        }

        if (pA.hp <= 0 || pB.hp <= 0) {
            pA.score += ko.scoreDelta.p1;
            pB.score += ko.scoreDelta.p2;

            const loser = pA.hp <= 0 ? pA : pB;
            const winner = pA.hp <= 0 ? pB : pA;

            this.hooks.emitAudit({
                turn: this.state.turn,
                phase: this.state.phase,
                prepSubPhase: "",
                playerSessionId: winner.sessionId,
                action: "KO_SCORE",
                validation: "ok",
                fidelityIds: ["FC-005"],
                stateDelta: { score: winner.score },
                detail: {
                    winnerSessionId: winner.sessionId,
                    loserSessionId: loser.sessionId,
                    p1Score: pA.score,
                    p2Score: pB.score,
                    delta: ko.scoreDelta,
                },
            });

            const pointLoser = loserSessionIdIfPointVictory(
                { p1: pA.score, p2: pB.score },
                pA.sessionId,
                pB.sessionId
            );
            if (pointLoser) {
                this.trashEvolutionStack(loser);
                return { kind: "match_end", loserSessionId: pointLoser, reason: "points" };
            }

            const reviveHp = this.supportCtx.reviveHp?.get(loser.sessionId) ?? 0;
            if (reviveHp > 0) {
                this.supportCtx.reviveHp.delete(loser.sessionId);
                loser.hp = reviveHp;
                if (loser.active) loser.active.hp = reviveHp;
                this.hooks.emitAudit({
                    turn: this.state.turn,
                    phase: this.state.phase,
                    prepSubPhase: "",
                    playerSessionId: loser.sessionId,
                    action: "REVIVE",
                    validation: "ok",
                    fidelityIds: ["FC-027"],
                    detail: { reviveHp },
                });
                return null;
            }

            this.trashEvolutionStack(loser);
            return this.beginKoRedeploy([loser.sessionId]);
        }
        return null;
    }

    private beginKoRedeploy(sessionIds: string[]): BattleBandOutcome {
        this.koRedeployQueue = sessionIds.filter(id => {
            const player = this.state.players.get(id);
            return player && !player.active;
        });
        return this.advanceKoRedeploy();
    }

    private advanceKoRedeploy(): BattleBandOutcome {
        while (this.koRedeployQueue.length > 0) {
            const sessionId = this.koRedeployQueue[0];
            const player = this.state.players.get(sessionId);
            if (!player) {
                this.koRedeployQueue.shift();
                continue;
            }
            if (player.active) {
                this.koRedeployQueue.shift();
                continue;
            }

            const isOpening = player.needsOpeningDeploy;
            if (!hasLegalDeployInHand(player.hand, this.ruleProfile, isOpening)) {
                if (!this.tryRecoverDigimonFromDeck(player)) {
                    this.koRedeployQueue.shift();
                    return { kind: "deck_out", loserSessionId: sessionId };
                }
            }

            this.state.activePlayerSessionId = sessionId;
            this.state.phase = "preparation";
            this.state.prepSubPhase = "deploy";
            const koPlayer = this.state.players.get(sessionId);
            this.state.message = koPlayer
                ? this.hooks.prepMessageFor(koPlayer, { isKoRedeploy: true })
                : getPrepServerMessage("deploy", { isKoRedeploy: true });
            this.hooks.syncPhaseTimer();
            return { kind: "ko_redeploy" };
        }
        return { kind: "turn_complete" };
    }

    private tryRecoverDigimonFromDeck(player: PlayerSchema): boolean {
        const result = digForDeployableFromDeck(
            player.hand,
            player.deck,
            player.trash,
            this.ruleProfile,
            player.needsOpeningDeploy
        );
        return result.found;
    }

    private trashEvolutionStack(player: PlayerSchema): void {
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

    evolve(player: PlayerSchema, cardId: string, evolutionOptionCardId?: string): boolean {
        const evoIdx = player.hand.findIndex(c => c.id === cardId);
        if (evoIdx === -1) return false;
        const evo = player.hand[evoIdx];

        const current = this.getActive(player);
        if (!current) return false;

        const evoKind = (evo.cardKind ?? "digimon").trim().toLowerCase();
        if (evoKind !== "digimon" && evoKind !== "") return false;

        let modifiers = parseEvolutionModifiers(null);
        let optionIdx = -1;
        if (evolutionOptionCardId) {
            optionIdx = player.hand.findIndex(c => c.id === evolutionOptionCardId);
            if (optionIdx === -1) return false;
            const optionCard = player.hand[optionIdx];
            const optionView = toOptionCardView(optionCard);
            const verdict = classifyOptionEffect(optionView);
            if (verdict.implemented === false) {
                this.hooks.auditPlayer("EVOLVE", player, "rejected", verdict.reason, {
                    cardId,
                    evolutionOptionCardId,
                    ...verdict.detail,
                });
                return false;
            }
            if (
                !canPlayEvolutionOption(
                    optionView,
                    this.state.prepSubPhase as PrepSubPhase,
                    true
                )
            ) {
                this.hooks.auditPlayer("EVOLVE", player, "rejected", "illegal_timing", {
                    cardId,
                    evolutionOptionCardId,
                });
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
        player.dp = spendEvolutionDp(player.dp, adjustedCost);
        player.evolutionStack.push(evoCard);
        player.active = evoCard;

        const penaltyWasActive = player.openingPenaltyActive;
        const ailments = parseStatusAilmentsJson(player.statusAilmentsJson);
        const recoveryState = {
            hp: player.hp,
            active: evoCard,
            statusAilments: ailments,
            openingPenaltyActive: penaltyWasActive,
        };
        applyPostEvolutionRecovery(recoveryState);
        player.hp = recoveryState.hp;
        player.statusAilmentsJson = serializeStatusAilments(recoveryState.statusAilments);
        player.openingPenaltyActive = recoveryState.openingPenaltyActive;

        const restore = shouldRestoreFullStatsAfterEvolve(
            modifiers,
            penaltyWasActive,
            fromLevel,
            evoCard.level
        );
        if (restore) {
            const stats = this.getCatalogStats(evoCard);
            if (stats) {
                applyFullStatsFromCatalog(evoCard, stats);
                player.hp = evoCard.maxHp;
                evoCard.hp = evoCard.maxHp;
            }
        }

        this.state.message = this.hooks.prepMessageFor(player);
        return true;
    }

    deployDigimon(player: PlayerSchema, cardId: string): DeployDigimonResult {
        if (this.getActive(player)) {
            this.hooks.auditPlayer("DEPLOY_DIGIMON", player, "rejected", "already_active");
            return { ok: false, reason: "already_active" };
        }
        const idx = player.hand.findIndex(c => c.id === cardId);
        if (idx === -1) {
            this.hooks.auditPlayer("DEPLOY_DIGIMON", player, "rejected", "card_not_in_hand", { cardId });
            return { ok: false, reason: "card_not_in_hand" };
        }
        const card = player.hand[idx];
        const validation = validateDeployDigimon(card, this.ruleProfile, player.needsOpeningDeploy);
        if (validation.ok === false) {
            this.hooks.auditPlayer("DEPLOY_DIGIMON", player, "rejected", validation.reason, { cardId });
            return { ok: false, reason: validation.reason };
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
        player.statusAilmentsJson = "[]";
        player.needsOpeningDeploy = false;
        this.hooks.auditPlayer("DEPLOY_DIGIMON", player, "ok", undefined, {
            cardId,
            level: card.level,
            penaltyApplied,
            penaltyLevel: validation.penaltyLevel,
            koRedeploy: this.isKoRedeployFor(player.sessionId),
        });

        if (this.isKoRedeployFor(player.sessionId)) {
            const koOutcome = this.continueKoRedeployAfterDeploy();
            return { ok: true, koOutcome };
        }

        this.state.prepSubPhase = "discard";
        this.state.message = this.hooks.prepMessageFor(player);
        this.hooks.syncPhaseTimer();
        return { ok: true };
    }

    playPrepOption(player: PlayerSchema, cardId: string): void {
        const idx = player.hand.findIndex(c => c.id === cardId);
        if (idx === -1) {
            this.hooks.auditPlayer("PLAY_PREP_OPTION", player, "rejected", "card_not_in_hand", { cardId });
            return;
        }
        const card = player.hand[idx];
        const view = toOptionCardView(card);
        if (
            !canPlayPrepOption(
                view,
                this.state.prepSubPhase as PrepSubPhase,
                !!this.getActive(player)
            )
        ) {
            this.hooks.auditPlayer("PLAY_PREP_OPTION", player, "rejected", "illegal_timing", { cardId });
            return;
        }

        const dpBefore = player.dp;
        const active = this.getActive(player);
        const hpBefore = active?.hp ?? player.hp;
        const prepState = {
            dp: player.dp,
            hp: hpBefore,
            maxHp: active?.maxHp ?? 0,
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
            this.hooks.auditPlayer("PLAY_PREP_OPTION", player, "rejected", result.reason, { cardId });
            return;
        }

        player.dp = prepState.dp;
        player.hp = prepState.hp;
        if (active) {
            active.hp = prepState.hp;
        }

        player.hand.splice(idx, 1);
        player.trash.push(card);
        this.hooks.auditPlayer("PLAY_PREP_OPTION", player, "ok", undefined, {
            cardId,
            effectId: result.effectId,
            dpBefore,
            dpAfter: player.dp,
            hpBefore,
            hpAfter: player.hp,
            detail: result.detail,
        });
        this.state.message = this.hooks.prepMessageFor(player);
    }

    discardForDp(player: PlayerSchema, cardIds: string[]): DiscardForDpResult {
        type DiscardRow = { id: string; cardKind: string; plusDp: number };
        const hand = player.hand as unknown as DiscardRow[];
        const dpSlot = player.dpSlot as unknown as DiscardRow[];
        const result = applyDiscardForDp(hand, dpSlot, cardIds);
        if (result.dpGained > 0) {
            player.dp += result.dpGained;
        }
        if (result.discardedIds.length > 0) {
            this.state.message = this.hooks.prepMessageFor(player);
        }
        return result;
    }

    tryRecoverDigimonFromDeckPublic(player: PlayerSchema): boolean {
        return this.tryRecoverDigimonFromDeck(player);
    }

    private getActive(player: PlayerSchema): CardSchema | null {
        return player.active ?? null;
    }

    private getOpponent(player: PlayerSchema): PlayerSchema | null {
        const opponentSessionId = Array.from(this.state.players.keys()).find(id => id !== player.sessionId);
        return opponentSessionId ? this.state.players.get(opponentSessionId) ?? null : null;
    }

    private getCatalogStats(card: CardSchema) {
        const baseId = catalogBaseId(card.id);
        const entry = this.deps.catalogById.get(baseId);
        if (!entry) return null;
        return {
            maxHp: entry.maxHp,
            circle: entry.attacks.circle.damage,
            triangle: entry.attacks.triangle.damage,
            cross: entry.attacks.cross.damage,
        };
    }

    consumeTurnComplete(): void {
        this.battleTurnOwnerSessionId = "";
    }

    getBattleTurnOwnerSessionId(): string {
        return this.battleTurnOwnerSessionId;
    }
}

const noopHooks: FidelityBattleSessionHooks = {
    emitAudit: () => {},
    auditPlayer: () => {},
    syncPhaseTimer: () => {},
    clearPhaseTimer: () => {},
    prepMessageFor: () => "",
    shuffleInPlace: () => {},
    endGame: () => {},
    endPrepOrPassTurn: () => {},
};

/** Test / verify harness: session over schema state with catalog lookup. */
export function createFidelityBattleSession(
    state: BattleStateSchema,
    catalogById: Map<string, NormalizedCardCatalogEntry>,
    hooks: FidelityBattleSessionHooks = noopHooks
): FidelityBattleSession {
    return new FidelityBattleSession(
        {
            state,
            ruleProfile: resolveRuleProfile(state.ruleProfileId || "fidelity_ps1"),
            arenaVariant: resolveArenaVariant(state.arenaVariantId || "standard"),
            catalogById,
            getRng: () => Math.random,
        },
        hooks
    );
}
