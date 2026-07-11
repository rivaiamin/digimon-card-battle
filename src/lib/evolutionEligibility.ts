/**
 * Normal digivolution legality (FC-007 / P2-5).
 * Level path, specialty (type), and DP cost — Armor/partner paths are FC-010 (out of scope).
 * @see docs/fidelity-rules-contract.md FC-007
 */

export const EVOLUTION_LEVEL_ORDER = ["Rookie", "Champion", "Ultimate", "Mega"] as const;

export type EvolutionLevel = (typeof EVOLUTION_LEVEL_ORDER)[number];

export type EvolutionRejectReason =
    | "no_active"
    | "not_digimon"
    | "insufficient_dp"
    | "wrong_specialty"
    | "invalid_level_path";

export type EvolutionGateResult = { ok: true } | { ok: false; reason: EvolutionRejectReason };

export type EvolutionActiveLike = {
    level: string;
    type: string;
};

export type EvolutionTargetLike = {
    level: string;
    type: string;
    evoCost: number;
    cardKind?: string;
};

export type EvolutionCostModifiers = {
    /** Extra (or reduced) DP cost from evolution option cards. */
    dpCostDelta?: number;
    /** Allowed extra level jumps (warp evolve). 0 = adjacent only. */
    warpSkipLevels?: number;
};

/** Digimon targets only; empty/legacy cardKind treated as digimon for catalog compatibility. */
export function isDigimonEvolveTarget(card: Pick<EvolutionTargetLike, "cardKind">): boolean {
    const kind = (card.cardKind ?? "digimon").trim().toLowerCase();
    return kind === "digimon" || kind === "";
}

export function isValidEvolutionLevel(from: string, to: string): boolean {
    const fi = EVOLUTION_LEVEL_ORDER.indexOf(from as EvolutionLevel);
    const ti = EVOLUTION_LEVEL_ORDER.indexOf(to as EvolutionLevel);
    if (fi === -1 || ti === -1) return false;
    return ti === fi + 1;
}

/** Specialty match (Fire/Ice/Nature/Dark/Rare) — case-insensitive, trimmed. */
export function matchesEvolutionType(activeType: string, targetType: string): boolean {
    return String(activeType).trim().toLowerCase() === String(targetType).trim().toLowerCase();
}

export function adjustedEvolutionCost(evoCost: number, dpCostDelta = 0): number {
    return Math.max(0, evoCost + dpCostDelta);
}

function isValidLevelPath(from: string, to: string, warpSkipLevels: number): boolean {
    const fi = EVOLUTION_LEVEL_ORDER.indexOf(from as EvolutionLevel);
    const ti = EVOLUTION_LEVEL_ORDER.indexOf(to as EvolutionLevel);
    if (fi === -1 || ti === -1) return false;
    if (warpSkipLevels > 0) {
        const maxJump = 1 + warpSkipLevels;
        return ti > fi && ti - fi <= maxJump;
    }
    return ti === fi + 1;
}

/**
 * Evaluate digivolution gates (level path, specialty, DP).
 * Pass warpSkipLevels / dpCostDelta when an evolution option is attached.
 */
export function evaluateEvolution(
    active: EvolutionActiveLike | null | undefined,
    target: EvolutionTargetLike,
    playerDp: number,
    modifiers: EvolutionCostModifiers = {}
): EvolutionGateResult {
    if (!active) return { ok: false, reason: "no_active" };
    if (!isDigimonEvolveTarget(target)) return { ok: false, reason: "not_digimon" };

    const dpCostDelta = modifiers.dpCostDelta ?? 0;
    const warpSkipLevels = modifiers.warpSkipLevels ?? 0;
    const cost = adjustedEvolutionCost(target.evoCost, dpCostDelta);
    if (playerDp < cost) return { ok: false, reason: "insufficient_dp" };
    if (!matchesEvolutionType(active.type, target.type)) {
        return { ok: false, reason: "wrong_specialty" };
    }
    if (!isValidLevelPath(active.level, target.level, warpSkipLevels)) {
        return { ok: false, reason: "invalid_level_path" };
    }
    return { ok: true };
}

export function canEvolveDigimon(
    active: EvolutionActiveLike | null | undefined,
    target: EvolutionTargetLike,
    playerDp: number
): boolean {
    return evaluateEvolution(active, target, playerDp).ok;
}

/** Hand / UI status chip for a failed evolve gate. */
export function evolutionStatusHint(reason: EvolutionRejectReason): string {
    switch (reason) {
        case "insufficient_dp":
            return "NO DP";
        case "wrong_specialty":
            return "WRONG TYPE";
        case "invalid_level_path":
            return "WRONG LEVEL";
        case "not_digimon":
            return "INVALID";
        case "no_active":
            return "NO ACTIVE";
        default:
            return "INVALID";
    }
}
