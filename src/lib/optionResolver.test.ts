import { describe, expect, it } from "vitest";
import {
    applyBattleOptionToContext,
    canEvolveWithOption,
    parseEvolutionModifiers,
    resolvePrepOption,
    shouldRestoreFullStatsAfterEvolve,
    type OptionCardLike,
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

    it("draws cards from option.prep.draw", () => {
        const hand: OptionCardLike[] = [
            { id: "opt", cardKind: "option", effectId: "option.prep.draw", effectArgs: { count: 2 } },
        ];
        const deck: OptionCardLike[] = [
            { id: "d1", cardKind: "digimon", effectId: "" },
            { id: "d2", cardKind: "digimon", effectId: "" },
        ];
        const state: {
            dp: number;
            hp: number;
            maxHp: number;
            hand: OptionCardLike[];
            deck: OptionCardLike[];
            trash: OptionCardLike[];
        } = {
            dp: 0,
            hp: 500,
            maxHp: 1000,
            hand,
            deck,
            trash: [],
        };
        const result = resolvePrepOption(hand[0], state, count => {
            let drawn = 0;
            for (let i = 0; i < count && state.deck.length > 0; i++) {
                state.hand.push(state.deck.shift()!);
                drawn++;
            }
            return drawn;
        });
        expect(result.ok).toBe(true);
        expect(state.hand.filter(c => c.id !== "opt").length).toBe(2);
    });

    it("heals active digimon from option.prep.heal_active", () => {
        const hand = [{ id: "opt", cardKind: "option", effectId: "option.prep.heal_active", effectArgs: { value: 200 } }];
        const state = {
            dp: 0,
            hp: 300,
            maxHp: 1000,
            hand,
            deck: [],
            trash: [],
        };
        const result = resolvePrepOption(hand[0], state, () => 0);
        expect(result.ok).toBe(true);
        expect(state.hp).toBe(500);
    });

    it("fetches a digimon from trash with option.prep.fetch_trash_digimon", () => {
        const hand = [{ id: "opt", cardKind: "option", effectId: "option.prep.fetch_trash_digimon" }];
        const trash = [
            { id: "t1", cardKind: "option", effectId: "" },
            { id: "d1", cardKind: "digimon", effectId: "" },
        ];
        const state = {
            dp: 0,
            hp: 500,
            maxHp: 1000,
            hand,
            deck: [] as typeof trash,
            trash,
        };
        const result = resolvePrepOption(hand[0], state, () => 0);
        expect(result.ok).toBe(true);
        expect(state.hand.some(c => c.id === "d1")).toBe(true);
        expect(state.trash.some(c => c.id === "d1")).toBe(false);
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
                { level: "Ultimate", type: "Fire", evoCost: 50, cardKind: "digimon" },
                60,
                mods
            )
        ).toBe(true);
    });

    it("rejects non-digimon evolve targets even with warp", () => {
        const mods = parseEvolutionModifiers({
            id: "warp",
            cardKind: "evolution_option",
            effectId: "evolution_option.warp_evolve",
            effectArgs: { skipLevels: 1 },
        });
        expect(
            canEvolveWithOption(
                { level: "Rookie", type: "Fire" },
                { level: "Ultimate", type: "Fire", evoCost: 0, cardKind: "option" },
                100,
                mods
            )
        ).toBe(false);
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
    it("parses ArmorCrush and De-Armor options", () => {
        expect(
            parseEvolutionModifiers({
                id: "294",
                cardKind: "evolution_option",
                effectId: "evolution_option.armor_crush",
            }).armorCrush
        ).toBe(true);
        expect(
            parseEvolutionModifiers({
                id: "298",
                cardKind: "evolution_option",
                effectId: "evolution_option.de_armor",
            }).deArmor
        ).toBe(true);
    });

    it("allows Armor → Champion with ArmorCrush option", () => {
        const mods = parseEvolutionModifiers({
            id: "294",
            cardKind: "evolution_option",
            effectId: "evolution_option.armor_crush",
        });
        expect(
            canEvolveWithOption(
                { level: "Armor", type: "Fire" },
                { level: "Champion", type: "Fire", evoCost: 20, cardKind: "digimon" },
                20,
                mods
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
