import { describe, expect, it } from "vitest";
import {
    resolveBattleExchange,
    resolveFullBattle,
    resolveKoScoring,
    type BattleCombatant,
} from "./battleEffectEngine";
import { createSupportBattleContext } from "./supportResolver";

function combatant(
    sessionId: string,
    hp: number,
    crossEffectId = "",
    crossDamage = 100,
    crossArgs: Record<string, string | number> = {}
): BattleCombatant {
    return {
        sessionId,
        hp,
        maxHp: hp,
        active: {
            circle: { damage: 400 },
            triangle: { damage: 300 },
            cross: {
                damage: crossDamage,
                effectId: crossEffectId,
                effectArgsJson: Object.keys(crossArgs).length ? JSON.stringify(crossArgs) : "",
            },
        },
    };
}

describe("cross.counter (FC-017)", () => {
    it("doubles reflected damage and cancels opponent circle attack", () => {
        const ctx = createSupportBattleContext();
        const p1 = combatant("p1", 500, "cross.counter", 100, {
            targetAttack: "circle",
            multiplier: 2,
        });
        const p2 = combatant("p2", 500);

        const result = resolveFullBattle(p1, p2, "cross", "circle", "p1", ctx);

        // p2 circle (400) * 2 counter = 800 to p2, p1 takes 0
        expect(result.p2Hp).toBe(0);
        expect(result.p1Hp).toBe(500);
        expect(result.events.some(e => e.type === "cross_counter")).toBe(true);
    });
});

describe("cross.to_zero (FC-017)", () => {
    it("zeros opponent damage when they use the targeted attack", () => {
        const ctx = createSupportBattleContext();
        const attacker = combatant("a", 600, "cross.to_zero", 50, { targetAttack: "circle" });
        const defender = combatant("d", 600);

        const { defenderHp, attackerHp } = resolveBattleExchange({
            attacker,
            defender,
            attackerAttack: "cross",
            defenderAttack: "circle",
            activeSessionId: "a",
            supportCtx: ctx,
        });

        expect(attackerHp).toBe(600);
        expect(defenderHp).toBe(550);
    });
});

describe("first strike cancel (FC-018)", () => {
    it("prevents return hit when first striker KOs", () => {
        const ctx = createSupportBattleContext();
        ctx.firstStrikePlayers.add("a");
        const attacker = combatant("a", 500);
        const defender = combatant("d", 300);

        const { defenderHp, attackerHp, events } = resolveBattleExchange({
            attacker,
            defender,
            attackerAttack: "circle",
            defenderAttack: "circle",
            activeSessionId: "a",
            supportCtx: ctx,
        });

        expect(defenderHp).toBe(0);
        expect(attackerHp).toBe(500);
        expect(events.some(e => e.type === "first_strike_cancel")).toBe(true);
    });
});

describe("cross.crash and double KO (FC-019)", () => {
    it("deals self HP as damage then KOs self", () => {
        const ctx = createSupportBattleContext();
        const attacker = combatant("a", 400, "cross.crash", 50);
        const defender = combatant("d", 500);

        const { defenderHp, attackerHp } = resolveBattleExchange({
            attacker,
            defender,
            attackerAttack: "cross",
            defenderAttack: "triangle",
            activeSessionId: "a",
            supportCtx: ctx,
        });

        expect(defenderHp).toBe(100);
        expect(attackerHp).toBe(0);
    });

    it("awards no points on double KO", () => {
        const scoring = resolveKoScoring(0, 0);
        expect(scoring.isDoubleKo).toBe(true);
        expect(scoring.scoreDelta).toEqual({ p1: 0, p2: 0 });
    });
});

describe("cross.eat_up_hp (FC-017)", () => {
    it("heals attacker by damage dealt", () => {
        const ctx = createSupportBattleContext();
        const attacker = combatant("a", 500, "cross.eat_up_hp", 150);
        const defender = combatant("d", 800);

        const { defenderHp, attackerHp } = resolveBattleExchange({
            attacker,
            defender,
            attackerAttack: "cross",
            defenderAttack: "triangle",
            activeSessionId: "a",
            supportCtx: ctx,
        });

        expect(defenderHp).toBe(650);
        expect(attackerHp).toBe(350);
    });
});
