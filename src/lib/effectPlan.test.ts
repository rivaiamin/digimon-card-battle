import { describe, expect, it } from "vitest";

import {
    isEffectPlan,
    parseEffectPlanJson,
    serializeEffectPlanJson,
    type EffectPlan,
} from "./effectPlan";

const plan: EffectPlan = {
    planVersion: 1,
    op: "compose",
    steps: [
        {
            planVersion: 1,
            op: "effect",
            effect: { type: "atk_mult", targetAttack: "all", value: 2 },
        },
        {
            planVersion: 1,
            op: "conditional",
            when: { kind: "opponent_used", attack: "cross" },
            steps: [
                {
                    planVersion: 1,
                    op: "effect",
                    effect: { type: "enemy_atk_zero", targetAttack: "cross" },
                },
            ],
        },
    ],
};

describe("effect plan contract", () => {
    it("round-trips ordered composed and conditional effects as JSON", () => {
        const encoded = serializeEffectPlanJson(plan);
        const decoded = parseEffectPlanJson(encoded);

        expect(decoded).toEqual(plan);
        expect(decoded?.op === "compose" && decoded.steps.map(step => step.op)).toEqual([
            "effect",
            "conditional",
        ]);
    });

    it("treats an empty transport value as no plan", () => {
        expect(parseEffectPlanJson("")).toBeNull();
    });

    it.each([
        ["unsupported version", { ...plan, planVersion: 2 }],
        ["unknown operation", { ...plan, op: "parallel" }],
        ["empty compose", { planVersion: 1, op: "compose", steps: [] }],
        ["unknown condition", {
            planVersion: 1,
            op: "conditional",
            when: { kind: "always" },
            steps: [plan.steps[0]],
        }],
        ["unknown field", { ...plan, ignored: true }],
    ])("rejects %s before execution", (_case, invalidPlan) => {
        expect(isEffectPlan(invalidPlan)).toBe(false);
        expect(() => parseEffectPlanJson(JSON.stringify(invalidPlan))).toThrow(TypeError);
    });

    it("rejects invalid typed input during serialization", () => {
        expect(() => serializeEffectPlanJson({ ...plan, planVersion: 3 } as unknown as EffectPlan)).toThrow(
            "Cannot serialize an invalid effect plan"
        );
    });

    it("rejects malformed JSON", () => {
        expect(() => parseEffectPlanJson("{" )).toThrow("Invalid effect plan JSON");
    });
});
