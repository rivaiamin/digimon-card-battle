/**
 * Post-evolution recovery (FC-009 / P2-6).
 * GDD: upon evolving, HP restores to the new max and negative status ailments are cured.
 * @see docs/fidelity-rules-contract.md FC-009, GDD.md Phase 2 Evolution Bonuses
 */

/** Known negative status ailment ids. Application from effects is future work; evolve always clears. */
export const STATUS_AILMENT_IDS = ["poison", "paralysis", "confusion", "sleep"] as const;
export type StatusAilmentId = (typeof STATUS_AILMENT_IDS)[number];

export type PostEvolutionActiveLike = {
    hp: number;
    maxHp: number;
};

export type PostEvolutionRecoveryState = {
    /** Player-level HP mirror used by combat UI. */
    hp: number;
    /** Active digimon card after the evolve swap. */
    active: PostEvolutionActiveLike;
    /** Mutable list of active negative status ailments. */
    statusAilments: string[];
    /** Opening-deploy penalty flag; cleared because the active digimon was replaced. */
    openingPenaltyActive: boolean;
};

export type PostEvolutionRecoveryResult = {
    hpRestoredTo: number;
    ailmentsCleared: string[];
    openingPenaltyCleared: boolean;
};

export function parseStatusAilmentsJson(raw: string | null | undefined): string[] {
    if (!raw || !raw.trim()) return [];
    try {
        const parsed = JSON.parse(raw) as unknown;
        if (!Array.isArray(parsed)) return [];
        return parsed.filter((v): v is string => typeof v === "string" && v.trim().length > 0);
    } catch {
        return [];
    }
}

export function serializeStatusAilments(ailments: readonly string[]): string {
    return JSON.stringify([...ailments]);
}

/**
 * Apply GDD evolution bonuses: full HP to new max, cure all status ailments,
 * clear opening-penalty flag (active digimon is a new card).
 */
export function applyPostEvolutionRecovery(
    state: PostEvolutionRecoveryState
): PostEvolutionRecoveryResult {
    const maxHp = Math.max(0, state.active.maxHp);
    const ailmentsCleared = [...state.statusAilments];
    const openingPenaltyCleared = state.openingPenaltyActive;

    state.active.hp = maxHp;
    state.hp = maxHp;
    state.statusAilments.length = 0;
    state.openingPenaltyActive = false;

    return {
        hpRestoredTo: maxHp,
        ailmentsCleared,
        openingPenaltyCleared,
    };
}
