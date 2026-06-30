/**
 * Support phase pick-order helpers (RA-003 / FC-012).
 * Defender (attacks second) chooses support before the active player in fidelity_ps1.
 */

/** Session id of the player who is not the active attacker. */
export function getDefenderSessionId(
    activeSessionId: string,
    sessionOrder: readonly string[]
): string {
    const other = sessionOrder.find(id => id !== activeSessionId);
    return other ?? sessionOrder[1] ?? sessionOrder[0] ?? "";
}

/** First support picker in sequential mode (defender). */
export function initialSupportPicker(defenderSessionId: string): string {
    return defenderSessionId;
}

/**
 * Whether `sessionId` may lock support this turn.
 * @param sequential When false (legacy), either player may lock anytime.
 */
export function canLockSupport(
    sessionId: string,
    supportPickSessionId: string,
    sequential: boolean,
    alreadyLocked: boolean
): boolean {
    if (alreadyLocked) return false;
    if (!sequential) return true;
    if (!supportPickSessionId) return false;
    return sessionId === supportPickSessionId;
}

/** After a sequential lock, who picks next; empty string when both have committed. */
export function nextSupportPickerAfterLock(
    whoLocked: string,
    defenderSessionId: string,
    activeSessionId: string
): string {
    if (whoLocked === defenderSessionId) return activeSessionId;
    return "";
}
