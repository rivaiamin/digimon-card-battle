import { describe, expect, it } from "vitest";
import { synthesizeCombatStrikes } from "./combatStrikePlan";
import type { CombatSnapshot } from "./combatResolution";

function snap(
    partial: Partial<CombatSnapshot> & Pick<CombatSnapshot, "phase">
): CombatSnapshot {
    return {
        playerHp: 500,
        opponentHp: 500,
        playerActive: {
            id: "p1",
            name: "Agumon",
            cardKind: "digimon",
            level: "Rookie",
            type: "Fire",
            hp: 500,
            maxHp: 500,
            dp: 0,
            plusDp: 0,
            evoCost: 0,
            image: "",
            attacks: {
                circle: { name: "Pepper Breath", damage: 400, type: "circle", description: "" },
                triangle: { name: "Tria", damage: 300, type: "triangle", description: "" },
                cross: { name: "Cross", damage: 100, type: "cross", description: "" },
            },
        },
        opponentActive: {
            id: "p2",
            name: "Gabumon",
            cardKind: "digimon",
            level: "Rookie",
            type: "Ice",
            hp: 500,
            maxHp: 500,
            dp: 0,
            plusDp: 0,
            evoCost: 0,
            image: "",
            attacks: {
                circle: { name: "Blue Blaster", damage: 400, type: "circle", description: "" },
                triangle: { name: "Tria", damage: 300, type: "triangle", description: "" },
                cross: { name: "Cross", damage: 100, type: "cross", description: "" },
            },
        },
        playerAttack: null,
        opponentAttack: null,
        ...partial,
    };
}

describe("synthesizeCombatStrikes", () => {
    it("builds take-turn strike order when defender survives", () => {
        const prev = snap({ phase: "battle_reveal" });
        const next = snap({
            phase: "draw",
            playerAttack: "circle",
            opponentAttack: "triangle",
            playerHp: 200,
            opponentHp: 100,
        });

        const strikes = synthesizeCombatStrikes(
            prev,
            next,
            { toPlayer: 300, toOpponent: 400, playerKo: false, opponentKo: false },
            "player-session",
            "player-session",
            "opponent-session"
        );

        expect(strikes).toHaveLength(2);
        expect(strikes[0].attackerSessionId).toBe("player-session");
        expect(strikes[0].totalDamage).toBe(400);
        expect(strikes[1].attackerSessionId).toBe("opponent-session");
        expect(strikes[1].totalDamage).toBe(300);
    });

    it("omits counter strike when defender is KO'd", () => {
        const prev = snap({ phase: "battle_reveal" });
        const next = snap({
            phase: "preparation",
            playerAttack: "circle",
            opponentAttack: "circle",
            opponentHp: 0,
        });

        const strikes = synthesizeCombatStrikes(
            prev,
            next,
            { toPlayer: 0, toOpponent: 500, playerKo: false, opponentKo: true },
            "player-session",
            "player-session",
            "opponent-session"
        );

        expect(strikes).toHaveLength(1);
        expect(strikes[0].targetHpAfter).toBe(0);
    });
});
