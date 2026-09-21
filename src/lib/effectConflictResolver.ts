/**
 * Deterministic effect ordering for competing support/battle effects (FC-020 / RA-006).
 */

export interface OrderedEffect<T> {
    effect: T;
    /**
     * Primary key — the effect's declared speed/priority. RA-006 step 1.
     * D1: this per-card value is authoritative; it is the canonical
     * `support_speed` datum written into the catalog.
     */
    priority: number;
    /**
     * Secondary key — the `docs/2.3` §2B class rank for the effect type, applied
     * only when two effects declare the *same* speed. D1 restates §2B as the
     * equal-speed fallback rather than a competing primary key. Callers that
     * exercise the RA-006 chain alone may omit it, which skips the fallback.
     */
    classPriority?: number;
    sessionId: string;
    isActivePlayer: boolean;
    hasFirstStrike: boolean;
}

/**
 * RA-006 tie-break: declared speed -> §2B class (equal speed only) ->
 * 1st-attack owner -> attacking player -> deterministic session order.
 */
export function compareOrderedEffects<T>(
    a: OrderedEffect<T>,
    b: OrderedEffect<T>,
    sessionOrder: string[]
): number {
    if (a.priority !== b.priority) return a.priority - b.priority;
    if (
        a.classPriority != null &&
        b.classPriority != null &&
        a.classPriority !== b.classPriority
    ) {
        return a.classPriority - b.classPriority;
    }
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
