import { describe, expect, it } from "vitest";
import {
    inferSupportEffectFromDescription,
    parseAttackEffectFromDescription,
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
        expect(parseAttackEffectFromDescription("Boost own Attack Power +100")).toBeNull();
    });

    it("promotes exact-match support catalog text", () => {
        expect(inferSupportEffectFromDescription("Recover own HP by +300")).toEqual({
            type: "hp_heal",
            value: 300,
            description: "Recover own HP by +300",
        });
        expect(inferSupportEffectFromDescription("Boost own Attack Power +200")).toEqual({
            type: "atk_buff",
            targetAttack: "all",
            value: 200,
            description: "Boost own Attack Power +200",
        });
        expect(
            inferSupportEffectFromDescription("Discard 7 Cards from Online Deck. Recover own HP by +1000.")
        ).toBeNull();
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
        expect(cat.every(c => c.cardKind === "digimon" || c.cardKind === "option" || c.cardKind === "evolution_option")).toBe(
            true
        );
    });
});
