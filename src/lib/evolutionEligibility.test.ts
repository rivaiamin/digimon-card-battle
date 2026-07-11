import { describe, expect, it } from "vitest";
import {
    canEvolveDigimon,
    evaluateEvolution,
    evolutionStatusHint,
    isDigimonEvolveTarget,
    isValidEvolutionLevel,
    matchesEvolutionType,
} from "./evolutionEligibility";

describe("evolutionEligibility (FC-007 / P2-5)", () => {
    const rookie = { level: "Rookie", type: "Fire" };
    const champion = { level: "Champion", type: "Fire", evoCost: 20, cardKind: "digimon" };
    const ultimate = { level: "Ultimate", type: "Fire", evoCost: 50, cardKind: "digimon" };

    it("allows adjacent same-specialty digivolution when DP is sufficient", () => {
        expect(canEvolveDigimon(rookie, champion, 20)).toBe(true);
        expect(evaluateEvolution(rookie, champion, 20)).toEqual({ ok: true });
    });

    it("rejects insufficient DP", () => {
        const gate = evaluateEvolution(rookie, champion, 19);
        expect(gate).toEqual({ ok: false, reason: "insufficient_dp" });
        expect(evolutionStatusHint("insufficient_dp")).toBe("NO DP");
    });

    it("rejects wrong specialty (type)", () => {
        const iceChamp = { ...champion, type: "Ice" };
        const gate = evaluateEvolution(rookie, iceChamp, 100);
        expect(gate).toEqual({ ok: false, reason: "wrong_specialty" });
        expect(evolutionStatusHint("wrong_specialty")).toBe("WRONG TYPE");
    });

    it("rejects non-adjacent level path (no warp)", () => {
        const gate = evaluateEvolution(rookie, ultimate, 100);
        expect(gate).toEqual({ ok: false, reason: "invalid_level_path" });
        expect(isValidEvolutionLevel("Rookie", "Ultimate")).toBe(false);
        expect(isValidEvolutionLevel("Rookie", "Champion")).toBe(true);
        expect(isValidEvolutionLevel("Champion", "Ultimate")).toBe(true);
    });

    it("rejects Armor level as normal digivolution path (FC-010 deferred)", () => {
        const armor = { level: "Armor", type: "Fire", evoCost: 0, cardKind: "digimon" };
        expect(evaluateEvolution(rookie, armor, 100)).toEqual({
            ok: false,
            reason: "invalid_level_path",
        });
    });

    it("rejects option / evolution_option cards as evolve targets", () => {
        expect(isDigimonEvolveTarget({ cardKind: "option" })).toBe(false);
        expect(isDigimonEvolveTarget({ cardKind: "evolution_option" })).toBe(false);
        expect(isDigimonEvolveTarget({ cardKind: "digimon" })).toBe(true);
        const gate = evaluateEvolution(rookie, { ...champion, cardKind: "option" }, 100);
        expect(gate).toEqual({ ok: false, reason: "not_digimon" });
    });

    it("matches specialty case-insensitively", () => {
        expect(matchesEvolutionType("Fire", "fire")).toBe(true);
        expect(matchesEvolutionType(" Nature ", "Nature")).toBe(true);
    });

    it("allows warp skip when modifiers permit Rookie → Ultimate", () => {
        const gate = evaluateEvolution(rookie, ultimate, 50, { warpSkipLevels: 1 });
        expect(gate).toEqual({ ok: true });
    });

    it("applies dpCostDelta from evolution options", () => {
        expect(evaluateEvolution(rookie, champion, 10, { dpCostDelta: -10 })).toEqual({ ok: true });
        expect(evaluateEvolution(rookie, champion, 10, { dpCostDelta: 5 })).toEqual({
            ok: false,
            reason: "insufficient_dp",
        });
    });

    it("rejects when no active digimon", () => {
        expect(evaluateEvolution(null, champion, 100)).toEqual({ ok: false, reason: "no_active" });
    });
});
