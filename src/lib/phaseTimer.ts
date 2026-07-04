/**
 * Server-authoritative phase timer config (FC-021 / TIMER_SPEC).
 * Durations are tiered by cognitive load per phase type.
 */

export type TimedPhaseKey =
    | "draw"
    | "prep_mulligan"
    | "prep_deploy"
    | "prep_discard"
    | "prep_evolve"
    | "battle_support"
    | "battle_attack";

/** Milliseconds allowed per interactive phase before auto-commit. */
export const PHASE_TIMER_MS: Record<TimedPhaseKey, number> = {
    draw: 20_000,
    prep_mulligan: 20_000,
    prep_deploy: 20_000,
    prep_discard: 20_000,
    prep_evolve: 20_000,
    battle_support: 30_000,
    battle_attack: 15_000,
};

export const ATTACK_TYPES = ["circle", "triangle", "cross"] as const;
export type RandomAttackType = (typeof ATTACK_TYPES)[number];

export function resolveTimedPhaseKey(phase: string, prepSubPhase: string): TimedPhaseKey | null {
    if (phase === "draw") return "draw";
    if (phase === "preparation") {
        switch (prepSubPhase) {
            case "mulligan":
                return "prep_mulligan";
            case "deploy":
                return "prep_deploy";
            case "discard":
                return "prep_discard";
            case "evolve":
                return "prep_evolve";
            default:
                return null;
        }
    }
    if (phase === "battle_support") return "battle_support";
    if (phase === "battle_attack") return "battle_attack";
    return null;
}

export function phaseTimerDurationMs(phase: string, prepSubPhase: string): number | null {
    const key = resolveTimedPhaseKey(phase, prepSubPhase);
    if (!key) return null;
    return PHASE_TIMER_MS[key];
}

/** Deterministic random attack for timeout auto-commit (FC-022). */
export function pickRandomAttack(rng: () => number = Math.random): RandomAttackType {
    const index = Math.floor(rng() * ATTACK_TYPES.length);
    return ATTACK_TYPES[Math.min(index, ATTACK_TYPES.length - 1)];
}
