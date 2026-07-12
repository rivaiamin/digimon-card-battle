/**
 * Victory / world-map return presentation (UX-007 / T9-7).
 * Client-only pacing — does not affect server match outcomes.
 */

export const VICTORY_OVERLAY_FADE_MS = 350;
/** Delay before result title (BATTLE WON / LOST). */
export const VICTORY_TITLE_MS = 280;
/** Delay before score line. */
export const VICTORY_SCORE_MS = 720;
/** Delay before loser-reason line. */
export const VICTORY_REASON_MS = 1_100;
/** Delay before RETURN CTA is interactable. */
export const VICTORY_CTA_MS = 1_550;

export type VictoryOutcome = "won" | "lost";

export type LoserReasonKey = "points" | "deck_out" | "disconnect" | "afk" | string;

export function victoryTitle(outcome: VictoryOutcome): string {
    return outcome === "won" ? "BATTLE WON" : "BATTLE LOST";
}

export function formatVictoryScore(playerScore: number, opponentScore: number): string {
    return `${playerScore} — ${opponentScore}`;
}

/** Human-readable match-end reason for the victory beat. */
export function formatLoserReason(reason: LoserReasonKey | null | undefined): string {
    if (!reason) return "";
    switch (String(reason)) {
        case "points":
            return "3 POINT VICTORY";
        case "deck_out":
            return "DECK OUT";
        case "disconnect":
            return "OPPONENT DISCONNECTED";
        case "afk":
            return "AFK FORFEIT";
        default:
            return String(reason).replace(/_/g, " ").toUpperCase();
    }
}

export type VictoryBeatStage = "idle" | "title" | "score" | "reason" | "cta";

/** Resolve which victory UI stage is active after elapsed ms. */
export function victoryBeatStage(elapsedMs: number): VictoryBeatStage {
    if (elapsedMs < VICTORY_TITLE_MS) return "idle";
    if (elapsedMs < VICTORY_SCORE_MS) return "title";
    if (elapsedMs < VICTORY_REASON_MS) return "score";
    if (elapsedMs < VICTORY_CTA_MS) return "reason";
    return "cta";
}

export function stageVisible(stage: VictoryBeatStage, required: VictoryBeatStage): boolean {
    const order: VictoryBeatStage[] = ["idle", "title", "score", "reason", "cta"];
    return order.indexOf(stage) >= order.indexOf(required);
}
