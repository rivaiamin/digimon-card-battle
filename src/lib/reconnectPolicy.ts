/**
 * Disconnect / reconnect fairness (FC-024 / NET_SPEC).
 *
 * Policy (deterministic):
 * - Consented leave → immediate disconnect forfeit (no grace).
 * - Unexpected drop → fixed grace window; seat reserved for reconnect.
 * - Grace expired without reconnect → disconnect forfeit.
 * - Match already in victory / still waiting → no forfeit (cleanup only).
 * - Phase timers keep running during grace (momentum continuity; AFK auto-commit).
 */

/** Seconds a dropped client may reconnect before disconnect forfeit. */
export const RECONNECT_GRACE_SECONDS = 30;

/** Colyseus CloseCode.CONSENTED — intentional room.leave(). */
export const CONSENTED_LEAVE_CODE = 4000;

export function isConsentedLeave(code: number | undefined | null): boolean {
    return code === CONSENTED_LEAVE_CODE;
}

/** Whether an unexpected drop should call allowReconnection. */
export function shouldOfferReconnectGrace(phase: string, consented: boolean): boolean {
    if (consented) return false;
    if (phase === "victory") return false;
    return true;
}

/**
 * Permanent leave after grace expiry or consented leave.
 * Forfeit only once the match has started (not waiting / not already over).
 */
export function shouldForfeitOnPermanentLeave(phase: string, playerCount: number): boolean {
    if (phase === "victory" || phase === "waiting") return false;
    return playerCount >= 2;
}
