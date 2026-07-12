import { describe, expect, it } from "vitest";
import {
    canUseAsBattleSupport,
    isLegacyBattleOptionCard,
} from "./optionEligibility";

describe("canUseAsBattleSupport", () => {
    it("allows digimon with support effects only", () => {
        expect(
            canUseAsBattleSupport({
                cardKind: "digimon",
                effectId: "",
                supportEffect: { type: "atk_buff" },
            })
        ).toBe(true);
        expect(
            canUseAsBattleSupport({
                cardKind: "digimon",
                effectId: "",
            })
        ).toBe(false);
    });

    it("allows normalized battle option cards", () => {
        expect(
            canUseAsBattleSupport({
                cardKind: "option",
                effectId: "option.battle.atk_buff",
            })
        ).toBe(true);
        expect(
            canUseAsBattleSupport({
                cardKind: "option",
                effectId: "option.battle.hp_heal",
            })
        ).toBe(true);
    });

    it("allows legacy battle option floppies with support text", () => {
        expect(
            isLegacyBattleOptionCard({
                cardKind: "option",
                effectId: "",
                supportEffect: { type: "catalog_text" },
            })
        ).toBe(true);
        expect(
            canUseAsBattleSupport({
                cardKind: "option",
                effectId: "",
                supportEffect: { type: "catalog_text" },
            })
        ).toBe(true);
    });

    it("rejects prep-only option cards", () => {
        expect(
            canUseAsBattleSupport({
                cardKind: "option",
                effectId: "option.prep.heal_active",
                supportEffect: { type: "catalog_text" },
            })
        ).toBe(false);
    });
});
