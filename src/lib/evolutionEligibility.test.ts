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
    const armor = { level: "Armor", type: "Fire", evoCost: 0, cardKind: "digimon" };

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

describe("Armor evolution paths (FC-010)", () => {
    const rookie = { level: "Rookie", type: "Fire" };
    const armorActive = { level: "Armor", type: "Fire" };
    const armor = { level: "Armor", type: "Fire", evoCost: 0, cardKind: "digimon" };
    const champion = { level: "Champion", type: "Fire", evoCost: 20, cardKind: "digimon" };
    const ultimate = { level: "Ultimate", type: "Fire", evoCost: 50, cardKind: "digimon" };
    const backToRookie = { level: "Rookie", type: "Fire", evoCost: 0, cardKind: "digimon" };

    it("allows Rookie → Armor at 0 DP with specialty match", () => {
        expect(evaluateEvolution(rookie, armor, 0)).toEqual({ ok: true });
        expect(canEvolveDigimon(rookie, armor, 0)).toBe(true);
    });

    it("rejects Rookie → Armor on specialty mismatch", () => {
        expect(evaluateEvolution(rookie, { ...armor, type: "Ice" }, 0)).toEqual({
            ok: false,
            reason: "wrong_specialty",
        });
    });

    it("rejects Armor → Champion without ArmorCrush", () => {
        expect(evaluateEvolution(armorActive, champion, 100)).toEqual({
            ok: false,
            reason: "needs_armor_option",
        });
        expect(evolutionStatusHint("needs_armor_option")).toBe("NEED OPTION");
    });

    it("allows Armor → Champion/Ultimate with armorCrush", () => {
        expect(evaluateEvolution(armorActive, champion, 20, { armorCrush: true })).toEqual({
            ok: true,
        });
        expect(evaluateEvolution(armorActive, ultimate, 50, { armorCrush: true })).toEqual({
            ok: true,
        });
        expect(evaluateEvolution(armorActive, champion, 10, { armorCrush: true })).toEqual({
            ok: false,
            reason: "insufficient_dp",
        });
    });

    it("allows Armor → Rookie with deArmor", () => {
        expect(evaluateEvolution(armorActive, backToRookie, 0, { deArmor: true })).toEqual({
            ok: true,
        });
        expect(evaluateEvolution(armorActive, backToRookie, 0)).toEqual({
            ok: false,
            reason: "needs_armor_option",
        });
    });

    it("rejects ArmorCrush / De-Armor on non-Armor actives", () => {
        expect(evaluateEvolution(rookie, champion, 20, { armorCrush: true })).toEqual({
            ok: false,
            reason: "invalid_level_path",
        });
        expect(evaluateEvolution(rookie, armor, 0, { deArmor: true })).toEqual({
            ok: false,
            reason: "invalid_level_path",
        });
    });

    it("Mutant Digivolve allows same-level onto any specialty (FC-027)", () => {
        const champIce = { level: "Champion", type: "Ice", evoCost: 20, cardKind: "digimon" };
        // Normally same-level + wrong specialty is illegal.
        expect(evaluateEvolution(champion, champIce, 20).ok).toBe(false);
        // With Mutant it is legal (DP still required).
        expect(evaluateEvolution(champion, champIce, 20, { sameLevel: true, ignoreSpecialty: true })).toEqual({
            ok: true,
        });
        expect(
            evaluateEvolution(champion, champIce, 0, { sameLevel: true, ignoreSpecialty: true })
        ).toEqual({ ok: false, reason: "insufficient_dp" });
    });

    it("Download Digivolve ignores specialty, level, and DP (FC-027)", () => {
        const ultIce = { level: "Ultimate", type: "Ice", evoCost: 60, cardKind: "digimon" };
        expect(evaluateEvolution(rookie, ultIce, 0).ok).toBe(false);
        expect(
            evaluateEvolution(rookie, ultIce, 0, {
                ignoreLevel: true,
                ignoreSpecialty: true,
                ignoreDp: true,
            })
        ).toEqual({ ok: true });
    });
});
