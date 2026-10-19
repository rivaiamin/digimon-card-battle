import { describe, expect, it } from "vitest";

import cardsData from "../data/cards.json";
import { loadCardCatalog } from "./cardCatalogLoader";
import type { EffectPlan } from "./effectPlan";

const composePlan: EffectPlan = {
    planVersion: 1,
    op: "compose",
    steps: [
        { planVersion: 1, op: "effect", effect: { type: "first_strike" } },
        { planVersion: 1, op: "effect", effect: { type: "atk_buff", targetAttack: "all", value: 100 } },
    ],
};

const conditionalPlan: EffectPlan = {
    planVersion: 1,
    op: "conditional",
    when: { kind: "own_specialty_is", specialty: "Fire" },
    steps: [
        { planVersion: 1, op: "effect", effect: { type: "enemy_atk_zero", targetAttack: "cross" } },
    ],
};

describe("card catalog effect plan loading", () => {
    it("preserves plans for Digimon and Option support effects", () => {
        const cards = loadCardCatalog([
            {
                id: "digimon",
                cardKind: "digimon",
                supportEffect: {
                    type: "compose",
                    description: "Attack first. Boost own Attack Power +100.",
                    effectPlan: composePlan,
                },
            },
            {
                id: "option",
                cardKind: "option",
                supportEffect: {
                    type: "catalog_text",
                    description: "If own Specialty is Fire, boost own Attack Power +100.",
                    effectPlan: conditionalPlan,
                },
            },
        ]);

        expect(cards.find(card => card.id === "digimon")?.supportEffect?.effectPlan).toEqual(composePlan);
        expect(cards.find(card => card.id === "option")?.supportEffect?.effectPlan).toEqual(conditionalPlan);
    });

    it("preserves all plans present in the generated catalog", () => {
        const cards = loadCardCatalog(cardsData);
        const planned = cards.filter(card => card.supportEffect?.effectPlan != null);

        expect(planned).toHaveLength(193);
        expect(cards.find(card => card.id === "001")?.supportEffect?.effectPlan?.op).toBe("compose");
        expect(cards.find(card => card.id === "264")?.supportEffect?.effectPlan?.op).toBe("effect");
    });

    it("rejects malformed plans with the owning card id and reason", () => {
        expect(() =>
            loadCardCatalog([
                {
                    id: "bad-plan-card",
                    supportEffect: {
                        type: "compose",
                        description: "Attack first. Boost own Attack Power +100.",
                        effectPlan: {
                            planVersion: 2,
                            op: "effect",
                            effect: { type: "atk_buff" },
                        },
                    },
                },
            ])
        ).toThrow(
            '[cardCatalogLoader] Invalid effect plan on card "bad-plan-card": unsupported planVersion "2".'
        );
    });
});
