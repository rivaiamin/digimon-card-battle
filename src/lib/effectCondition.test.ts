import { describe, expect, it } from "vitest";
import {
    evaluateCondition,
    isEffectCondition,
    normalizeLevelLetter,
    parseCondition,
    parseEffectConditionJson,
    serializeEffectConditionJson,
    splitConditional,
    type ConditionContext,
    type ConditionSubject,
    type EffectCondition,
} from "./effectCondition";

function subject(overrides: Partial<ConditionSubject> = {}): ConditionSubject {
    return {
        attack: null,
        hp: 1000,
        level: "Rookie",
        specialty: "Fire",
        handCount: 3,
        dpSlotCount: 0,
        ...overrides,
    };
}

function ctx(self: Partial<ConditionSubject>, opponent: Partial<ConditionSubject>): ConditionContext {
    return { self: subject(self), opponent: subject(opponent) };
}

describe("condition parsing (FC-027)", () => {
    it("parses attack comparisons", () => {
        expect(parseCondition("both Attacks are different")).toEqual({ kind: "attacks_different" });
        expect(parseCondition("both Attacks are same")).toEqual({ kind: "attacks_same" });
        expect(parseCondition("both players use same Attack")).toEqual({ kind: "attacks_same" });
        expect(parseCondition("own Attack is Circle")).toEqual({ kind: "own_attack_is", attack: "circle" });
        expect(parseCondition("own attack is Triangle")).toEqual({ kind: "own_attack_is", attack: "triangle" });
        expect(parseCondition("own Attack is not Circle")).toEqual({ kind: "own_attack_not", attack: "circle" });
        expect(parseCondition("opponent used Circle")).toEqual({ kind: "opponent_used", attack: "circle" });
        expect(parseCondition("opponent uses Circle")).toEqual({ kind: "opponent_used", attack: "circle" });
    });

    it("parses HP comparisons", () => {
        expect(parseCondition("own HP are less than 500")).toEqual({ kind: "own_hp_lt", value: 500 });
        expect(parseCondition("own HP are less then 200")).toEqual({ kind: "own_hp_lt", value: 200 });
        expect(parseCondition("own HP are less than foe's HP")).toEqual({ kind: "own_hp_lt_opponent" });
        expect(parseCondition("own HP are more than opponent's HP")).toEqual({ kind: "own_hp_gt_opponent" });
        expect(parseCondition("opponent's HP are lower then own")).toEqual({ kind: "opponent_hp_lt_own" });
        expect(parseCondition("opponent's HP are more than 1000")).toEqual({ kind: "opponent_hp_gt", value: 1000 });
    });

    it("parses level comparisons", () => {
        expect(parseCondition("both Levels are C")).toEqual({ kind: "both_levels_are", level: "C" });
        expect(parseCondition("own Level is C")).toEqual({ kind: "own_level_is", level: "C" });
        expect(parseCondition("own Level is U")).toEqual({ kind: "own_level_is", level: "U" });
        expect(parseCondition("opponent is Level A")).toEqual({ kind: "opponent_level_is", level: "A" });
        expect(parseCondition("own Level is below opponent's")).toEqual({ kind: "own_level_lower" });
        expect(parseCondition("own level is lower")).toEqual({ kind: "own_level_lower" });
    });

    it("parses specialty comparisons", () => {
        expect(parseCondition("opponent's Specialty is Darkness")).toEqual({
            kind: "opponent_specialty_is",
            specialty: "Darkness",
        });
        expect(parseCondition("opponent's Specialty is not Nature")).toEqual({
            kind: "opponent_specialty_not",
            specialty: "Nature",
        });
        expect(parseCondition("foe's Specialty is Fire or Ice")).toEqual({
            kind: "opponent_specialty_in",
            specialties: ["Fire", "Ice"],
        });
        expect(parseCondition("own Specialty is Fire")).toEqual({ kind: "own_specialty_is", specialty: "Fire" });
        expect(parseCondition("Specialties are same")).toEqual({ kind: "specialties_same" });
    });

    it("parses hand-count comparisons", () => {
        expect(parseCondition("own Cards in Hand 3 or more")).toEqual({ kind: "own_hand_gte", value: 3 });
        expect(parseCondition("1 or less Cards left in own Hand")).toEqual({ kind: "own_hand_lte", value: 1 });
    });

    it("returns null on unrecognized gates", () => {
        expect(parseCondition("the moon is full")).toBeNull();
        expect(parseCondition("")).toBeNull();
    });
});

describe("splitConditional (FC-027)", () => {
    it("splits head/consequent on first comma", () => {
        expect(splitConditional("If both attacks are different, own Attack Power is doubled")).toEqual({
            head: "both attacks are different",
            consequent: "own Attack Power is doubled",
        });
    });
    it("returns null when there is no If gate", () => {
        expect(splitConditional("Recover own HP by +300")).toBeNull();
    });
});

describe("condition evaluation (FC-027)", () => {
    it("evaluates attack comparisons", () => {
        expect(evaluateCondition({ kind: "attacks_same" }, ctx({ attack: "circle" }, { attack: "circle" }))).toBe(true);
        expect(evaluateCondition({ kind: "attacks_same" }, ctx({ attack: "circle" }, { attack: "cross" }))).toBe(false);
        expect(evaluateCondition({ kind: "attacks_different" }, ctx({ attack: "circle" }, { attack: "cross" }))).toBe(true);
        // Unknown attack (legacy profile) never fires attack gates.
        expect(evaluateCondition({ kind: "attacks_same" }, ctx({ attack: null }, { attack: "circle" }))).toBe(false);
        expect(evaluateCondition({ kind: "opponent_used", attack: "cross" }, ctx({}, { attack: "cross" }))).toBe(true);
    });

    it("evaluates HP comparisons", () => {
        expect(evaluateCondition({ kind: "own_hp_lt", value: 500 }, ctx({ hp: 400 }, {}))).toBe(true);
        expect(evaluateCondition({ kind: "own_hp_lt", value: 500 }, ctx({ hp: 600 }, {}))).toBe(false);
        expect(evaluateCondition({ kind: "own_hp_lt_opponent" }, ctx({ hp: 300 }, { hp: 900 }))).toBe(true);
        expect(evaluateCondition({ kind: "opponent_hp_gt", value: 1000 }, ctx({}, { hp: 1500 }))).toBe(true);
        expect(evaluateCondition({ kind: "opponent_hp_lt_own" }, ctx({ hp: 900 }, { hp: 300 }))).toBe(true);
    });

    it("evaluates level comparisons", () => {
        expect(evaluateCondition({ kind: "own_level_is", level: "C" }, ctx({ level: "Champion" }, {}))).toBe(true);
        expect(evaluateCondition({ kind: "both_levels_are", level: "C" }, ctx({ level: "Champion" }, { level: "Champion" }))).toBe(true);
        expect(evaluateCondition({ kind: "both_levels_are", level: "C" }, ctx({ level: "Champion" }, { level: "Ultimate" }))).toBe(false);
        expect(evaluateCondition({ kind: "own_level_lower" }, ctx({ level: "Rookie" }, { level: "Ultimate" }))).toBe(true);
        expect(evaluateCondition({ kind: "own_level_lower" }, ctx({ level: "Ultimate" }, { level: "Rookie" }))).toBe(false);
    });

    it("evaluates specialty comparisons", () => {
        expect(evaluateCondition({ kind: "opponent_specialty_is", specialty: "Darkness" }, ctx({}, { specialty: "Dark" }))).toBe(true);
        expect(evaluateCondition({ kind: "opponent_specialty_not", specialty: "Nature" }, ctx({}, { specialty: "Fire" }))).toBe(true);
        expect(evaluateCondition({ kind: "opponent_specialty_in", specialties: ["Fire", "Ice"] }, ctx({}, { specialty: "Ice" }))).toBe(true);
        expect(evaluateCondition({ kind: "specialties_same" }, ctx({ specialty: "Fire" }, { specialty: "Fire" }))).toBe(true);
    });

    it("evaluates hand-count comparisons", () => {
        expect(evaluateCondition({ kind: "own_hand_gte", value: 3 }, ctx({ handCount: 4 }, {}))).toBe(true);
        expect(evaluateCondition({ kind: "own_hand_lte", value: 1 }, ctx({ handCount: 1 }, {}))).toBe(true);
        expect(evaluateCondition({ kind: "own_hand_lte", value: 1 }, ctx({ handCount: 2 }, {}))).toBe(false);
    });
});

describe("normalizeLevelLetter", () => {
    it("normalizes labels and letters", () => {
        expect(normalizeLevelLetter("Rookie")).toBe("R");
        expect(normalizeLevelLetter("champion")).toBe("C");
        expect(normalizeLevelLetter("U")).toBe("U");
        expect(normalizeLevelLetter("Armor")).toBe("A");
    });
});

describe("condition JSON codec", () => {
    it("round-trips every condition kind produced by parseCondition", () => {
        const conditionTexts = [
            "both attacks are same",
            "both attacks are different",
            "own Attack is Circle",
            "own Attack is not Circle",
            "opponent used Circle",
            "own HP is less than 500",
            "own HP is less than opponent's HP",
            "own HP is more than opponent's HP",
            "opponent's HP is more than 1000",
            "opponent's HP is lower than own",
            "own Level is C",
            "opponent is Level A",
            "both Levels are C",
            "own Level is below opponent's",
            "own Specialty is Fire",
            "opponent's Specialty is Darkness",
            "opponent's Specialty is not Nature",
            "foe's Specialty is Fire or Ice",
            "Specialties are same",
            "own Cards in Hand 3 or more",
            "1 or less Cards left in own Hand",
            "opponent has more than 2 cards in DP Slot",
        ];
        const conditions = conditionTexts.map(text => parseCondition(text));
        expect(conditions.every((condition): condition is EffectCondition => condition !== null)).toBe(true);
        const parsed = conditions as EffectCondition[];
        expect([...new Set(parsed.map(condition => condition.kind))].sort()).toEqual([
            "attacks_different",
            "attacks_same",
            "both_levels_are",
            "opponent_dp_slot_gt",
            "opponent_hp_gt",
            "opponent_hp_lt_own",
            "opponent_level_is",
            "opponent_specialty_in",
            "opponent_specialty_is",
            "opponent_specialty_not",
            "opponent_used",
            "own_attack_is",
            "own_attack_not",
            "own_hand_gte",
            "own_hand_lte",
            "own_hp_gt_opponent",
            "own_hp_lt",
            "own_hp_lt_opponent",
            "own_level_is",
            "own_level_lower",
            "own_specialty_is",
            "specialties_same",
        ]);

        for (const condition of parsed) {
            expect(parseEffectConditionJson(serializeEffectConditionJson(condition))).toEqual(condition);
        }
    });

    it("rejects malformed condition JSON and values", () => {
        expect(() => parseEffectConditionJson("{")).toThrow("Invalid effect condition JSON");
        expect(() => parseEffectConditionJson(JSON.stringify({ kind: "own_attack_is", attack: "square" }))).toThrow(
            "Invalid effect condition structure"
        );
        expect(isEffectCondition({ kind: "own_hp_lt", value: Number.NaN })).toBe(false);
        expect(isEffectCondition({ kind: "attacks_same", extra: true })).toBe(false);
    });

    it("rejects invalid typed conditions during serialization", () => {
        expect(() =>
            serializeEffectConditionJson({
                kind: "own_attack_is",
                attack: "square",
            } as unknown as EffectCondition)
        ).toThrow("Cannot serialize an invalid effect condition");
    });
});
