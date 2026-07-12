import { describe, expect, it } from "vitest";
import { getHandCardInteraction, type HandInteractionContext } from "./handCardInteraction";
import type { DigimonCardData } from "../types";
import { getRuleProfile } from "./ruleProfile";
import { parseEvolutionModifiers } from "./optionResolver";

function baseCtx(overrides: Partial<HandInteractionContext> = {}): HandInteractionContext {
    return {
        phase: "preparation",
        prepSubPhase: "discard",
        isYourTurn: true,
        hasActive: true,
        playerDp: 500,
        activeDigimon: null,
        selectedEvoOptionId: null,
        evoModifiers: parseEvolutionModifiers(null),
        canPickSupport: false,
        supportLocked: false,
        ruleProfile: getRuleProfile("fidelity_ps1"),
        needsOpeningDeploy: false,
        selectedEvoOption: null,
        ...overrides,
    };
}

function digimon(id: string, level: DigimonCardData["level"] = "Rookie"): DigimonCardData {
    return {
        id,
        name: id,
        cardKind: "digimon",
        level,
        type: "Fire",
        hp: 500,
        maxHp: 500,
        dp: 0,
        plusDp: 100,
        evoCost: 200,
        image: "",
        attacks: {
            circle: { name: "A", damage: 400, type: "circle", description: "" },
            triangle: { name: "B", damage: 300, type: "triangle", description: "" },
            cross: { name: "C", damage: 100, type: "cross", description: "" },
        },
    };
}

function prepOption(id: string): DigimonCardData {
    return {
        ...digimon(id),
        cardKind: "option",
        effectId: "option.prep.draw",
        attacks: null,
    };
}

describe("getHandCardInteraction", () => {
    it("shows all cards as view-only during mulligan", () => {
        const ctx = baseCtx({ prepSubPhase: "mulligan" });
        expect(getHandCardInteraction(digimon("d1"), ctx).mode).toBe("view");
        expect(getHandCardInteraction(prepOption("o1"), ctx).mode).toBe("view");
    });

    it("shows hand as view-only during draw phase", () => {
        const ctx = baseCtx({ phase: "draw", prepSubPhase: "" });
        expect(getHandCardInteraction(digimon("d1"), ctx).mode).toBe("view");
        expect(getHandCardInteraction(digimon("d1"), ctx).enabled).toBe(false);

        const waiting = baseCtx({ phase: "draw", prepSubPhase: "", isYourTurn: false });
        expect(getHandCardInteraction(digimon("d1"), waiting).mode).toBe("view");
    });

    it("shows non-deploy cards as view-only during deploy (not hidden/dimmed)", () => {
        const ctx = baseCtx({
            prepSubPhase: "deploy",
            hasActive: false,
        });
        const deploy = getHandCardInteraction(digimon("d1", "Rookie"), ctx);
        expect(deploy.mode).toBe("deploy");
        expect(deploy.enabled).toBe(true);

        const option = getHandCardInteraction(prepOption("o1"), ctx);
        expect(option.mode).toBe("view");
        expect(option.enabled).toBe(false);
    });

    it("shows non-actionable discard cards as view-only", () => {
        const ctx = baseCtx({ prepSubPhase: "discard" });
        const evoOpt = getHandCardInteraction(
            { ...prepOption("e1"), cardKind: "evolution_option", effectId: "evolution_option.skip" },
            ctx
        );
        expect(evoOpt.mode).toBe("view");
    });

    it("enables digimon discard during discard sub-phase", () => {
        const ctx = baseCtx({ prepSubPhase: "discard" });
        const digi = getHandCardInteraction(digimon("d1"), ctx);
        expect(digi.mode).toBe("discard");
        expect(digi.enabled).toBe(true);
        expect(digi.badge).toBe("+100 DP");
    });

    it("shows options as view-only during discard unless prep playable", () => {
        const ctx = baseCtx({ prepSubPhase: "discard" });
        const opt = getHandCardInteraction(prepOption("o1"), ctx);
        expect(opt.mode).toBe("prep_option");
        expect(opt.badge).toBe("DRAW 1");
        expect(getHandCardInteraction(digimon("d2"), ctx).mode).toBe("discard");
    });

    it("enables prep options during evolve sub-phase", () => {
        const ctx = baseCtx({ prepSubPhase: "evolve" });
        const opt = getHandCardInteraction(prepOption("o1"), ctx);
        expect(opt.mode).toBe("prep_option");
        expect(opt.enabled).toBe(true);
        expect(opt.badge).toBe("DRAW 1");
    });

    it("shows full hand as view-only when opponent is in prep", () => {
        const ctx = baseCtx({ isYourTurn: false, prepSubPhase: "evolve" });
        expect(getHandCardInteraction(digimon("d1"), ctx).mode).toBe("view");
        expect(getHandCardInteraction(prepOption("o1"), ctx).mode).toBe("view");
    });

    it("shows non-support cards as view-only during battle_support", () => {
        const ctx = baseCtx({
            phase: "battle_support",
            prepSubPhase: "",
            canPickSupport: true,
        });
        const support = getHandCardInteraction(
            { ...digimon("d1"), supportEffect: { type: "first_strike", value: 0, description: "First" } },
            ctx
        );
        expect(support.mode).toBe("support");
        expect(support.enabled).toBe(true);

        expect(getHandCardInteraction(digimon("d2"), ctx).mode).toBe("view");

        const legacyBattleOption = getHandCardInteraction(
            {
                ...digimon("o-battle"),
                cardKind: "option",
                effectId: "",
                supportEffect: { type: "catalog_text", value: 0, description: "Battle floppy" },
            },
            ctx
        );
        expect(legacyBattleOption.mode).toBe("support");
        expect(legacyBattleOption.enabled).toBe(true);

        expect(getHandCardInteraction(prepOption("o1"), ctx).mode).toBe("view");

        const battleHeal = getHandCardInteraction(
            {
                ...digimon("o-heal"),
                cardKind: "option",
                effectId: "option.battle.hp_heal",
                effectArgs: { value: 300 },
                supportEffect: {
                    type: "hp_heal",
                    value: 300,
                    description: "Recover own HP by +300.",
                },
            },
            ctx
        );
        expect(battleHeal.mode).toBe("support");
        expect(battleHeal.badge).toBe("OPTION");
        expect(battleHeal.enabled).toBe(true);
    });

    it("shows full hand as view-only during battle_attack", () => {
        const ctx = baseCtx({ phase: "battle_attack", prepSubPhase: "" });
        expect(getHandCardInteraction(digimon("d1"), ctx).mode).toBe("view");
        expect(getHandCardInteraction(prepOption("o1"), ctx).mode).toBe("view");
    });

    it("dims support cards while waiting for sequential pick", () => {
        const ctx = baseCtx({
            phase: "battle_support",
            prepSubPhase: "",
            canPickSupport: false,
        });
        const support = getHandCardInteraction(
            { ...digimon("d1"), supportEffect: { type: "atk_buff", value: 100, description: "Buff" } },
            ctx
        );
        expect(support.mode).toBe("support");
        expect(support.enabled).toBe(false);
    });

    it("shows digivolve reject hints for DP, type, and level", () => {
        const active = digimon("active", "Rookie");
        const noDp = getHandCardInteraction(digimon("c1", "Champion"), baseCtx({
            prepSubPhase: "evolve",
            activeDigimon: active,
            playerDp: 0,
        }));
        expect(noDp.mode).toBe("evolve_target");
        expect(noDp.enabled).toBe(false);
        expect(noDp.statusHint).toBe("NO DP");

        const wrongType = getHandCardInteraction(
            { ...digimon("c2", "Champion"), type: "Ice" },
            baseCtx({
                prepSubPhase: "evolve",
                activeDigimon: active,
                playerDp: 500,
            })
        );
        expect(wrongType.statusHint).toBe("WRONG TYPE");

        const wrongLevel = getHandCardInteraction(digimon("u1", "Ultimate"), baseCtx({
            prepSubPhase: "evolve",
            activeDigimon: active,
            playerDp: 500,
        }));
        expect(wrongLevel.statusHint).toBe("WRONG LEVEL");
    });
});
