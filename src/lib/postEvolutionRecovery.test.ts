import { describe, expect, it } from "vitest";
import {
    applyPostEvolutionRecovery,
    parseStatusAilmentsJson,
    serializeStatusAilments,
} from "./postEvolutionRecovery";

describe("postEvolutionRecovery (FC-009 / P2-6)", () => {
    it("restores HP to evolved max and cures status ailments", () => {
        const state = {
            hp: 120,
            active: { hp: 120, maxHp: 800 },
            statusAilments: ["poison", "sleep"],
            openingPenaltyActive: true,
        };
        const result = applyPostEvolutionRecovery(state);
        expect(result.hpRestoredTo).toBe(800);
        expect(result.ailmentsCleared).toEqual(["poison", "sleep"]);
        expect(result.openingPenaltyCleared).toBe(true);
        expect(state.hp).toBe(800);
        expect(state.active.hp).toBe(800);
        expect(state.statusAilments).toEqual([]);
        expect(state.openingPenaltyActive).toBe(false);
    });

    it("is a no-op clear when already healthy", () => {
        const state = {
            hp: 500,
            active: { hp: 500, maxHp: 500 },
            statusAilments: [] as string[],
            openingPenaltyActive: false,
        };
        const result = applyPostEvolutionRecovery(state);
        expect(result.hpRestoredTo).toBe(500);
        expect(result.ailmentsCleared).toEqual([]);
        expect(result.openingPenaltyCleared).toBe(false);
    });

    it("round-trips status ailments JSON", () => {
        expect(parseStatusAilmentsJson('["poison"]')).toEqual(["poison"]);
        expect(serializeStatusAilments(["poison", "confusion"])).toBe('["poison","confusion"]');
        expect(parseStatusAilmentsJson("not-json")).toEqual([]);
        expect(parseStatusAilmentsJson("")).toEqual([]);
    });
});
