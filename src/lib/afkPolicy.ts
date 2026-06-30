/**
 * Three-strike AFK forfeit policy (FC-023 / TIMER_SPEC).
 */

export const AFK_FORFEIT_THRESHOLD = 3;

export function shouldForfeitAfk(strikes: number): boolean {
    return strikes >= AFK_FORFEIT_THRESHOLD;
}

/** Voluntary action before timeout clears consecutive inactivity. */
export function strikesAfterVoluntaryAction(): number {
    return 0;
}

export function strikesAfterTimeout(currentStrikes: number): number {
    return currentStrikes + 1;
}
