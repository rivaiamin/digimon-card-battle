/**
 * Canonical turn / phase flow helpers (FC-003).
 * @see docs/fidelity-rules-contract.md FC-003, FC-004
 */

import { resolveInitialPrepSubPhase, type PrepSubPhase } from "./openingFlow";
import type { RuleProfile } from "./ruleProfile";

/** Client draw beat before committing server DRAW (PS1 pacing). */
export const DRAW_BEAT_MS = 1_100;

/** How long newly drawn hand cards stay highlighted after landing. */
export const DRAW_CARD_HIGHLIGHT_MS = 1_400;

/** Client beat after mulligan before highlighting the new hand. */
export const MULLIGAN_REDRAW_MS = 700;

/** How long mulligan-redrawn cards stay highlighted. */
export const MULLIGAN_CARD_HIGHLIGHT_MS = 1_200;

/** How long +DP gain flash stays visible after discard. */
export const DISCARD_DP_GAIN_MS = 1_000;

/** How long prep option result feedback stays visible. */
export const PREP_OPTION_FEEDBACK_MS = 1_200;

/** Brief highlight when prep sub-phase advances (P2-9). */
export const PREP_SUBPHASE_TRANSITION_MS = 450;

/** Server + client support reveal window before resolution (P3-6). */
export const SUPPORT_REVEAL_MS = 2_200;

/** Post-support effect notification beat (heal / ATK buff VFX). */
export const SUPPORT_EFFECTS_MS = 3_000;

/** Second support card flip delay within the reveal window (seconds). */
export const SUPPORT_REVEAL_STAGGER_S = 0.55;

/** Full-screen flash during field digivolution (PS1 burst). */
export const EVOLUTION_FLASH_MS = 480;

/** How long the active slot keeps the digivolve enter animation. */
export const EVOLUTION_ENTER_MS = 900;

/** Screen flash tint while a digimon digivolves on the field. */
export const EVOLUTION_FLASH_COLOR = "rgba(255, 235, 150, 0.55)";

export type TurnPhase =
    | "waiting"
    | "draw"
    | "preparation"
    | "battle_support"
    | "battle_reveal"
    | "battle_effects"
    | "battle_attack"
    | "resolution"
    | "victory";

export type PlayerActionType =
    | "DRAW"
    | "MULLIGAN"
    | "ACCEPT_HAND"
    | "DISCARD_FOR_DP"
    | "END_DISCARD"
    | "PLAY_PREP_OPTION"
    | "EVOLVE"
    | "END_PREP"
    | "DEPLOY_DIGIMON"
    | "DIG_FOR_DEPLOY"
    | "LOCK_SUPPORT"
    | "LOCK_ATTACK";

export type ActionLegalityContext = {
    phase: TurnPhase;
    prepSubPhase: PrepSubPhase;
    isYourTurn: boolean;
    hasActive: boolean;
    supportLocked: boolean;
    attackLocked: boolean;
};

/** High-level battle slice for fidelity_ps1 (attack lock before support). */
export function fidelityBattlePhaseChain(attackLockBeforeSupport: boolean): TurnPhase[] {
    if (attackLockBeforeSupport) {
        return [
            "battle_attack",
            "battle_support",
            "battle_reveal",
            "battle_effects",
            "resolution",
        ];
    }
    return [
        "battle_support",
        "battle_reveal",
        "battle_effects",
        "battle_attack",
        "resolution",
    ];
}

/** Full turn loop excluding KO redeploy shortcuts. */
export function canonicalTurnPhases(attackLockBeforeSupport: boolean): TurnPhase[] {
    return ["draw", "preparation", ...fidelityBattlePhaseChain(attackLockBeforeSupport)];
}

export function prepSubPhaseAfterDraw(
    hasActive: boolean,
    needsOpeningDeploy: boolean,
    mulligansRemaining: number,
    profile: RuleProfile
): PrepSubPhase {
    return resolveInitialPrepSubPhase(hasActive, needsOpeningDeploy, mulligansRemaining, profile);
}

/**
 * Mirrors server-side `onMessage` guards for player-initiated actions.
 * Used for FC-003 regression tests and client affordance hints.
 */
export function isPlayerActionLegal(
    action: PlayerActionType,
    ctx: ActionLegalityContext
): boolean {
    const { phase, prepSubPhase, isYourTurn } = ctx;

    // Non-interactive phases reject all player actions (battle slice FC-003).
    if (
        phase === "waiting" ||
        phase === "battle_reveal" ||
        phase === "battle_effects" ||
        phase === "resolution" ||
        phase === "victory"
    ) {
        return false;
    }

    if (!isYourTurn) {
        return action === "LOCK_SUPPORT" || action === "LOCK_ATTACK";
    }

    switch (action) {
        case "DRAW":
            return phase === "draw";
        case "MULLIGAN":
            return phase === "preparation" && prepSubPhase === "mulligan";
        case "ACCEPT_HAND":
            return phase === "preparation" && prepSubPhase === "mulligan";
        case "DISCARD_FOR_DP":
            return phase === "preparation" && prepSubPhase === "discard";
        case "END_DISCARD":
            return phase === "preparation" && prepSubPhase === "discard";
        case "PLAY_PREP_OPTION":
            return phase === "preparation" && (prepSubPhase === "discard" || prepSubPhase === "evolve");
        case "EVOLVE":
            return phase === "preparation" && prepSubPhase === "evolve";
        case "END_PREP":
            return phase === "preparation" && prepSubPhase === "evolve";
        case "DEPLOY_DIGIMON":
        case "DIG_FOR_DEPLOY":
            return phase === "preparation" && (prepSubPhase === "deploy" || prepSubPhase === "");
        case "LOCK_SUPPORT":
            return phase === "battle_support" && !ctx.supportLocked;
        case "LOCK_ATTACK":
            return phase === "battle_attack" && !ctx.attackLocked;
        default:
            return false;
    }
}

/**
 * Legal forward transitions for a normal turn (excluding KO-redeploy shortcuts).
 * Victory may be entered from any non-waiting phase via match-end rules (FC-005).
 */
export function isLegalPhaseTransition(
    from: TurnPhase,
    to: TurnPhase,
    attackLockBeforeSupport: boolean
): boolean {
    if (from === to) return true;
    if (to === "victory") return from !== "waiting" && from !== "victory";
    if (from === "victory" || from === "waiting") return false;

    const battle = fidelityBattlePhaseChain(attackLockBeforeSupport);
    const edges = new Set<string>([
        "draw->preparation",
        `preparation->${battle[0]}`,
        // After resolution, next turn starts with draw (FC-004 handoff).
        "resolution->draw",
        // KO redeploy / double-KO return to preparation deploy.
        "resolution->preparation",
    ]);
    for (let i = 0; i < battle.length - 1; i++) {
        edges.add(`${battle[i]}->${battle[i + 1]}`);
    }

    return edges.has(`${from}->${to}`);
}
