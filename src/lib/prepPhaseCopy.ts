/**
 * Prep sub-phase copy + transition helpers (FC-003 / P2-9).
 * Single source for server broadcast messages, match-header titles/hints, and hand footers.
 * @see docs/fidelity-rules-contract.md FC-003, GDD.md Phase 2
 */

import type { PrepSubPhase } from "./openingFlow";

/** Canonical forward order after opening shortcuts. */
export const PREP_SUBPHASE_ORDER = ["mulligan", "deploy", "discard", "evolve"] as const;

export type InteractivePrepSubPhase = (typeof PREP_SUBPHASE_ORDER)[number];

/** Brief client highlight when prepSubPhase changes. */
export { PREP_SUBPHASE_TRANSITION_MS } from "./battleTurnFlow";

export type PrepCopyContext = {
    handTarget?: number;
    mulligansRemaining?: number;
    needsOpeningDeploy?: boolean;
    isKoRedeploy?: boolean;
    isDoubleKoRedeploy?: boolean;
    dugDeckForDigimon?: boolean;
};

/** Next forced sub-phase after the player commits the current step (null = leave prep). */
export function nextPrepSubPhase(current: PrepSubPhase): PrepSubPhase | null {
    switch (current) {
        case "mulligan":
            return "deploy";
        case "deploy":
            return "discard";
        case "discard":
            return "evolve";
        case "evolve":
            return null;
        default:
            return null;
    }
}

export function isInteractivePrepSubPhase(value: string): value is InteractivePrepSubPhase {
    return (
        value === "mulligan" ||
        value === "deploy" ||
        value === "discard" ||
        value === "evolve"
    );
}

/** Compact match-header title while it is your prep turn. */
export function getPrepSubPhaseTitle(
    prepSubPhase: PrepSubPhase,
    ctx: PrepCopyContext = {}
): string {
    switch (prepSubPhase) {
        case "mulligan":
            return `Opening hand (${ctx.handTarget ?? 4} cards)`;
        case "deploy":
            return "Deploy Digimon";
        case "discard":
            return "Discard for DP";
        case "evolve":
            return "Digivolve";
        default:
            return "Preparation";
    }
}

/** Short match-header hint while it is your prep turn. */
export function getPrepSubPhaseHint(
    prepSubPhase: PrepSubPhase,
    ctx: PrepCopyContext = {}
): string {
    switch (prepSubPhase) {
        case "mulligan": {
            const left = ctx.mulligansRemaining ?? 0;
            if (left <= 0) return "No redraws left — keep hand to deploy.";
            return left === 1
                ? "Keep hand or redraw once."
                : `Keep hand or redraw (${left} left).`;
        }
        case "deploy":
            return ctx.needsOpeningDeploy
                ? "Play your opening Digimon from hand."
                : "Play a Digimon from your hand.";
        case "discard":
            return "Discard Digimon for DP, or play yellow prep options.";
        case "evolve":
            return "Evolve if you can, play prep options, then end prep.";
        default:
            return "";
    }
}

/**
 * Authoritative `state.message` for the current prep sub-phase.
 * Prefer this over ad-hoc strings so UI and audits stay aligned.
 */
export function getPrepServerMessage(
    prepSubPhase: PrepSubPhase,
    ctx: PrepCopyContext = {}
): string {
    if (ctx.dugDeckForDigimon) {
        return "Deck dig — deploy a Digimon from your hand";
    }
    if (ctx.isDoubleKoRedeploy) {
        return "Double KO — deploy a Digimon from your hand";
    }
    if (ctx.isKoRedeploy) {
        return "KO — deploy a Rookie from your hand";
    }

    switch (prepSubPhase) {
        case "mulligan":
            return `Opening hand (${ctx.handTarget ?? 4} cards) — keep or redraw?`;
        case "deploy":
            return ctx.needsOpeningDeploy
                ? "Deploy your battle Digimon"
                : "Deploy a Digimon from your hand";
        case "discard":
            return "Discard for DP — then continue";
        case "evolve":
            return "Digivolve or end preparation";
        default:
            return "Preparation";
    }
}

/** Hand-bar footer under the action buttons. */
export function getPrepHandFooter(
    prepSubPhase: PrepSubPhase,
    opts: { hasEvolutionOptions?: boolean; evoOptionSelected?: boolean } = {}
): string {
    switch (prepSubPhase) {
        case "mulligan":
            return "Review your opening hand before deploying";
        case "deploy":
            return "Select a Digimon in hand to put on the field";
        case "discard":
            return "Click Digimon for +DP · yellow badges play prep options";
        case "evolve":
            if (opts.hasEvolutionOptions) {
                return opts.evoOptionSelected
                    ? "Digivolve option selected — pick evolution target"
                    : "Digivolve options available (optional)";
            }
            return "Evolve if you can · yellow badges play prep options";
        default:
            return "";
    }
}

export function getPrepPrimaryActionLabel(prepSubPhase: PrepSubPhase): string | null {
    switch (prepSubPhase) {
        case "mulligan":
            return "KEEP HAND";
        case "discard":
            return "CONTINUE";
        case "evolve":
            return "END PREP";
        default:
            return null;
    }
}

export function getPrepSecondaryActionLabel(prepSubPhase: PrepSubPhase): string | null {
    switch (prepSubPhase) {
        case "mulligan":
            return "REDRAW";
        case "deploy":
            return "DIG DECK";
        default:
            return null;
    }
}
