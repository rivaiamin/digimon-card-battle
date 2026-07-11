import { describe, expect, it } from "vitest";
import {
    applySpecialtyFoeMultiplier,
    parseSpecialtyFoeDescription,
    shouldApplySpecialtyFoeMult,
} from "./specialtyFoeMult";

describe("specialtyFoeMult (FC-016 / P3-3)", () => {
    it("parses catalog Foe xN descriptions", () => {
        expect(parseSpecialtyFoeDescription("Ice Foe x3")).toEqual({
            specialty: "Ice",
            multiplier: 3,
        });
        expect(parseSpecialtyFoeDescription("Darkness Foe x3.")).toEqual({
            specialty: "Dark",
            multiplier: 3,
        });
        expect(parseSpecialtyFoeDescription("Dark Foe x3")).toEqual({
            specialty: "Dark",
            multiplier: 3,
        });
        expect(parseSpecialtyFoeDescription("Fire Foe x2")).toEqual({
            specialty: "Fire",
            multiplier: 2,
        });
        expect(parseSpecialtyFoeDescription("Eat-Up HP")).toBeNull();
        expect(parseSpecialtyFoeDescription("")).toBeNull();
    });

    it("matches opponent specialty with Darkness/Dark alias", () => {
        expect(shouldApplySpecialtyFoeMult("Ice", "Ice")).toBe(true);
        expect(shouldApplySpecialtyFoeMult("Dark", "Darkness")).toBe(true);
        expect(shouldApplySpecialtyFoeMult("Ice", "Fire")).toBe(false);
    });

    it("triples damage only against the matching specialty", () => {
        expect(applySpecialtyFoeMultiplier(380, "Ice", 3, "Ice")).toBe(1140);
        expect(applySpecialtyFoeMultiplier(380, "Ice", 3, "Fire")).toBe(380);
        expect(applySpecialtyFoeMultiplier(0, "Ice", 3, "Ice")).toBe(0);
    });
});
