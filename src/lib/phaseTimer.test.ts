import { describe, expect, it } from "vitest";
import {
    PHASE_TIMER_MS,
    pickRandomAttack,
    phaseTimerDurationMs,
    resolveTimedPhaseKey,
} from "./phaseTimer";

describe("resolveTimedPhaseKey (FC-021)", () => {
    it("maps interactive phases to timer keys", () => {
        expect(resolveTimedPhaseKey("draw", "")).toBe("draw");
        expect(resolveTimedPhaseKey("preparation", "mulligan")).toBe("prep_mulligan");
        expect(resolveTimedPhaseKey("preparation", "evolve")).toBe("prep_evolve");
        expect(resolveTimedPhaseKey("battle_support", "")).toBe("battle_support");
        expect(resolveTimedPhaseKey("battle_attack", "")).toBe("battle_attack");
    });

    it("returns null for non-interactive phases", () => {
        expect(resolveTimedPhaseKey("battle_reveal", "")).toBeNull();
        expect(resolveTimedPhaseKey("resolution", "")).toBeNull();
        expect(resolveTimedPhaseKey("victory", "")).toBeNull();
    });

    it("exposes tiered durations", () => {
        expect(phaseTimerDurationMs("battle_support", "")).toBe(PHASE_TIMER_MS.battle_support);
        expect(phaseTimerDurationMs("battle_attack", "")).toBe(PHASE_TIMER_MS.battle_attack);
        expect(PHASE_TIMER_MS.battle_support).toBeGreaterThan(PHASE_TIMER_MS.battle_attack);
    });
});

describe("pickRandomAttack (FC-022)", () => {
    it("returns a valid attack type", () => {
        expect(pickRandomAttack(() => 0)).toBe("circle");
        expect(pickRandomAttack(() => 0.99)).toBe("cross");
    });
});
