/**
 * Deterministic effect ordering for competing support/battle effects (FC-020 / RA-006).
 */

export interface OrderedEffect<T> {
    effect: T;
    priority: number;
    sessionId: string;
    isActivePlayer: boolean;
    hasFirstStrike: boolean;
}

export function compareOrderedEffects<T>(
    a: OrderedEffect<T>,
    b: OrderedEffect<T>,
    sessionOrder: string[]
): number {
    if (a.priority !== b.priority) return a.priority - b.priority;
    if (a.hasFirstStrike !== b.hasFirstStrike) return a.hasFirstStrike ? -1 : 1;
    if (a.isActivePlayer !== b.isActivePlayer) return a.isActivePlayer ? -1 : 1;
    const ai = sessionOrder.indexOf(a.sessionId);
    const bi = sessionOrder.indexOf(b.sessionId);
    if (ai !== bi) return ai - bi;
    return 0;
}

export function sortEffectsByConflictPolicy<T>(
    effects: OrderedEffect<T>[],
    sessionOrder: string[]
): OrderedEffect<T>[] {
    return [...effects].sort((a, b) => compareOrderedEffects(a, b, sessionOrder));
}
