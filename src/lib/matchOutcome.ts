/**
 * Match win/loss outcomes (FC-005).
 * @see docs/fidelity-rules-contract.md FC-005, RA-004
 */

import { shouldDeckOutOnDraw } from "./openingFlow";

/** First player to this many KO points wins. */
export const MATCH_POINTS_TO_WIN = 3;

export type MatchEndReason = "points" | "deck_out" | "disconnect" | "afk";

export type MatchScore = { p1: number; p2: number };

export function isWinningScore(score: number): boolean {
    return score >= MATCH_POINTS_TO_WIN;
}

/** Apply a KO score delta (double KO is always {0,0}). */
export function applyScoreDelta(scores: MatchScore, delta: MatchScore): MatchScore {
    return {
        p1: scores.p1 + delta.p1,
        p2: scores.p2 + delta.p2,
    };
}

/**
 * After scores update, return the loser session id if someone hit the point cap.
 * Null = match continues.
 */
export function loserSessionIdIfPointVictory(
    scores: MatchScore,
    p1SessionId: string,
    p2SessionId: string
): string | null {
    const p1Win = isWinningScore(scores.p1);
    const p2Win = isWinningScore(scores.p2);
    if (p1Win && p2Win) {
        // Should not occur (first-to-3 ends the match), but stay deterministic.
        return scores.p1 >= scores.p2 ? p2SessionId : p1SessionId;
    }
    if (p1Win) return p2SessionId;
    if (p2Win) return p1SessionId;
    return null;
}

/** Deck-out on draw: active battler cannot refill to hand target (RA-004). */
export function isDeckOutOnDraw(input: {
    hasActive: boolean;
    handSize: number;
    deckSize: number;
    handTarget: number;
}): boolean {
    return shouldDeckOutOnDraw(
        input.hasActive,
        input.handSize,
        input.deckSize,
        input.handTarget
    );
}

/**
 * Deck-out on required battler selection (opening / KO redeploy).
 * True when there is no legal deploy in hand and recovery from deck failed/unavailable.
 */
export function isDeckOutOnRequiredDeploy(input: {
    hasLegalDeployInHand: boolean;
    recoveredFromDeck: boolean;
}): boolean {
    return !input.hasLegalDeployInHand && !input.recoveredFromDeck;
}
