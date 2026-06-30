import { describe, expect, it } from "vitest";
import {
    applyBattleOptionToContext,
    canEvolveWithOption,
    parseEvolutionModifiers,
    resolvePrepOption,
    shouldRestoreFullStatsAfterEvolve,
} from "./optionResolver";
import { canPlayEvolutionOption, canPlayPrepOption } from "./optionEligibility";

describe("option eligibility (FC-008)", () => {
    it("allows prep options during discard and evolve", () => {
        const card = { cardKind: "option", effectId: "option.prep.gain_dp" };
        expect(canPlayPrepOption(card, "discard", true)).toBe(true);
        expect(canPlayPrepOption(card, "evolve", true)).toBe(true);
        expect(canPlayPrepOption(card, "deploy", true)).toBe(false);
    });

    it("allows evolution options only during evolve sub-phase", () => {
        const card = { cardKind: "evolution_option", effectId: "evolution_option.warp_evolve" };
        expect(canPlayEvolutionOption(card, "evolve", true)).toBe(true);
        expect(canPlayEvolutionOption(card, "discard", true)).toBe(false);
    });
});

describe("prep option resolution", () => {
    it("gains DP from option.prep.gain_dp", () => {
        const hand = [{ id: "opt", cardKind: "option", effectId: "option.prep.gain_dp", effectArgs: { value: 20 } }];
        const state = {
            dp: 10,
            hp: 500,
            maxHp: 1000,
            hand,
            deck: [],
            trash: [],
        };
        const result = resolvePrepOption(hand[0], state, () => 0);
        expect(result.ok).toBe(true);
        expect(state.dp).toBe(30);
    });
});

describe("evolution modifiers (FC-008)", () => {
    it("parses warp evolve skip levels", () => {
        const mods = parseEvolutionModifiers({
            id: "warp",
            cardKind: "evolution_option",
            effectId: "evolution_option.warp_evolve",
            effectArgs: { skipLevels: 1 },
        });
        expect(mods.warpSkipLevels).toBe(1);
    });

    it("allows rookie to ultimate with warp option", () => {
        const mods = parseEvolutionModifiers({
            id: "warp",
            cardKind: "evolution_option",
            effectId: "evolution_option.warp_evolve",
            effectArgs: { skipLevels: 1 },
        });
        expect(
            canEvolveWithOption(
                { level: "Rookie", type: "Fire" },
                { level: "Ultimate", type: "Fire", evoCost: 50 },
                60,
                mods
            )
        ).toBe(true);
    });

    it("restores full stats for penalized champion to ultimate with any evo option", () => {
        expect(
            shouldRestoreFullStatsAfterEvolve(
                parseEvolutionModifiers({
                    id: "special",
                    cardKind: "evolution_option",
                    effectId: "evolution_option.dp_adjust",
                    effectArgs: { delta: -20 },
                }),
                true,
                "Champion",
                "Ultimate"
            )
        ).toBe(true);
    });
});

describe("battle options", () => {
    it("applies atk buff to battle context", () => {
        const ctx = { attackBonus: new Map<string, { circle: number; triangle: number; cross: number }>() };
        const applied = applyBattleOptionToContext(
            {
                id: "battle",
                cardKind: "option",
                effectId: "option.battle.atk_buff",
                effectArgs: { targetAttack: "circle", value: 150 },
            },
            "p1",
            ctx
        );
        expect(applied).toBe(true);
        expect(ctx.attackBonus.get("p1")?.circle).toBe(150);
    });
});
