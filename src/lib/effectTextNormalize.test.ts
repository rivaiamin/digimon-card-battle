import { describe, expect, it } from "vitest";
import {
    inferCompoundSupportEffect,
    materializeEffectPlan,
    inferSupportEffectFromDescription,
    parseAttackEffectFromDescription,
    splitEffectClauses,
} from "./effectTextNormalize";
import { loadCardCatalog } from "./cardCatalogLoader";
import cardsData from "../data/cards.json";

describe("effectTextNormalize (FC-026 / FC-027)", () => {
    it("maps attack descriptions to effect ids", () => {
        expect(parseAttackEffectFromDescription("1st Attack")).toEqual({
            effectId: "attack.first_strike",
            effectArgs: {},
        });
        expect(parseAttackEffectFromDescription("Jamming")).toEqual({
            effectId: "attack.jamming",
            effectArgs: {},
        });
        expect(parseAttackEffectFromDescription("Ice Foe x3")).toEqual({
            effectId: "attack.specialty_mult",
            effectArgs: { specialty: "Ice", multiplier: 3 },
        });
    });

    it("promotes exact-match and compound support catalog text", () => {
        expect(inferSupportEffectFromDescription("Recover own HP by +300")).toEqual({
            type: "hp_heal",
            value: 300,
            description: "Recover own HP by +300",
        });
        expect(inferSupportEffectFromDescription("Boost own Attack Power by +100")).toEqual({
            type: "atk_buff",
            targetAttack: "all",
            value: 100,
            description: "Boost own Attack Power by +100",
        });
        expect(inferCompoundSupportEffect("Attack first. Boost own Attack Power +100.")).toEqual({
            type: "compose",
            description: "Attack first. Boost own Attack Power +100.",
        });
        expect(
            splitEffectClauses('Attack first. Own attack becomes "Eat-up HP." Boost Attack Power +200.')
        ).toEqual([
            "Attack first",
            'Own attack becomes "Eat-up HP',
            "Boost Attack Power +200",
        ]);
        expect(
            inferCompoundSupportEffect(
                'Attack first. Own attack becomes "Eat-up HP." Boost Attack Power +200.'
            )?.type
        ).toBe("compose");
    });

    it("normalizes 1st Attack / Jamming on loaded catalog cards", () => {
        const cat = loadCardCatalog(cardsData);
        const firstStrike = cat.find(c => c.attacks.cross.description === "1st Attack");
        expect(firstStrike?.attacks.cross.effectId).toBe("attack.first_strike");

        const jamming = cat.find(c => c.attacks.cross.description === "Jamming");
        expect(jamming?.attacks.cross.effectId).toBe("attack.jamming");
    });

    it("represents full Digimon / Option / Evolution taxonomy", () => {
        const cat = loadCardCatalog(cardsData);
        const kinds = new Set(cat.map(c => c.cardKind));
        expect(kinds.has("digimon")).toBe(true);
        expect(kinds.has("option")).toBe(true);
        expect(kinds.has("evolution_option")).toBe(true);
    });
});

describe("parser hardening (FC-027 Phase 2 Layer A)", () => {
    it("strips quotes before the trailing period (Eat-up HP)", () => {
        expect(inferSupportEffectFromDescription('Own attack becomes "Eat-up HP."')).toMatchObject({
            type: "grant_eat_up_hp",
        });
    });

    it("canonicalizes synonyms (his/foe's → opponent's, Atk Pwr → Attack Power)", () => {
        expect(inferSupportEffectFromDescription("his Attack Power goes to 0")).toMatchObject({
            type: "enemy_atk_zero",
        });
        expect(inferSupportEffectFromDescription("opponent's Atk Pwr becomes 0")).toMatchObject({
            type: "enemy_atk_set",
            value: 0,
        });
    });

    it("splits conditional consequents on comma and 'and'", () => {
        expect(
            inferCompoundSupportEffect(
                "If own Specialty is Fire, boost own Attack Power +100, recover HP +200"
            )?.type
        ).toBe("conditional");
        expect(
            inferCompoundSupportEffect(
                "If opponent uses Circle, attack first and boost own Attack Power +500"
            )?.type
        ).toBe("conditional");
        expect(
            inferCompoundSupportEffect("If foe's Specialty is Fire or Ice, his Attack Power goes to 0")
                ?.type
        ).toBe("conditional");
    });

    it("maps counterattack clauses", () => {
        expect(inferSupportEffectFromDescription("Circle Counterattack")).toMatchObject({
            type: "grant_counter",
            targetAttack: "circle",
        });
        expect(inferCompoundSupportEffect("Cross Counterattack. Attack second.")?.type).toBe("compose");
    });
});


describe("effect plan materialization", () => {
    it("materializes a single primitive without display prose", () => {
        expect(materializeEffectPlan("Boost own Attack Power by +100")).toEqual({
            planVersion: 1,
            op: "effect",
            effect: { type: "atk_buff", targetAttack: "all", value: 100 },
        });
    });

    it("preserves compose order and inherited opponent targets", () => {
        expect(
            materializeEffectPlan(
                "Opponent discards 2 cards from opponent's online deck. 2 cards from hand."
            )
        ).toEqual({
            planVersion: 1,
            op: "compose",
            steps: [
                {
                    planVersion: 1,
                    op: "effect",
                    effect: { type: "discard_enemy_deck", value: 2 },
                },
                {
                    planVersion: 1,
                    op: "effect",
                    effect: { type: "discard_enemy_hand", value: 2 },
                },
            ],
        });
    });

    it("serializes the parsed condition and ordered consequent steps", () => {
        expect(
            materializeEffectPlan(
                "If own Specialty is Fire, boost own Attack Power +100 and recover HP +200"
            )
        ).toEqual({
            planVersion: 1,
            op: "conditional",
            when: { kind: "own_specialty_is", specialty: "Fire" },
            steps: [
                {
                    planVersion: 1,
                    op: "effect",
                    effect: { type: "atk_buff", targetAttack: "all", value: 100 },
                },
                {
                    planVersion: 1,
                    op: "effect",
                    effect: { type: "hp_heal", value: 200 },
                },
            ],
        });
    });

    it("keeps unrecognized text unresolved", () => {
        expect(materializeEffectPlan("This effect has no recognized mechanical clause")).toBeNull();
    });
});
