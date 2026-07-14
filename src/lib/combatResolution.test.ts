import { describe, expect, it } from "vitest";
import {
    computeCombatDamage,
    isCombatResolutionTransition,
    shouldDeferCombatVfx,
    type CombatSnapshot,
} from "./combatResolution";

function snap(partial: Partial<CombatSnapshot> & Pick<CombatSnapshot, "phase">): CombatSnapshot {
    return {
        playerHp: 800,
        opponentHp: 800,
        playerActive: { id: "p" } as CombatSnapshot["playerActive"],
        opponentActive: { id: "o" } as CombatSnapshot["opponentActive"],
        playerAttack: "circle",
        opponentAttack: "triangle",
        ...partial,
    };
}

describe("shouldDeferCombatVfx", () => {
    it("defers only while next snapshot is still battle_effects", () => {
        const effects = snap({ phase: "battle_effects", playerHp: 700 });
        expect(shouldDeferCombatVfx(snap({ phase: "battle_reveal" }), effects)).toBe(true);
        expect(shouldDeferCombatVfx(effects, snap({ phase: "draw", playerHp: 400 }))).toBe(false);
        expect(
            shouldDeferCombatVfx(effects, snap({ phase: "resolution", playerHp: 400 }))
        ).toBe(false);
        expect(
            shouldDeferCombatVfx(effects, snap({ phase: "preparation", playerHp: 0 }))
        ).toBe(false);
    });
});

describe("isCombatResolutionTransition after option effects", () => {
    it("treats battle_effects→draw as combat (server collapses resolution)", () => {
        expect(
            isCombatResolutionTransition(
                snap({ phase: "battle_effects" }),
                snap({ phase: "draw" })
            )
        ).toBe(true);
    });

    it("treats battle_effects→resolution as combat", () => {
        expect(
            isCombatResolutionTransition(
                snap({ phase: "battle_effects" }),
                snap({ phase: "resolution" })
            )
        ).toBe(true);
    });
});

describe("computeCombatDamage after support heal + option effect", () => {
    it("measures damage from post-heal HP when leaving battle_effects for draw", () => {
        const prev = snap({ phase: "battle_effects", playerHp: 700, opponentHp: 800 });
        const next = snap({ phase: "draw", playerHp: 400, opponentHp: 500 });
        expect(shouldDeferCombatVfx(prev, next)).toBe(false);
        expect(computeCombatDamage(prev, next)).toEqual({
            toPlayer: 300,
            toOpponent: 300,
            playerKo: false,
            opponentKo: false,
        });
    });

    it("does not treat heal-only entry into battle_effects as combat", () => {
        const prev = snap({ phase: "battle_reveal", playerHp: 400 });
        const next = snap({ phase: "battle_effects", playerHp: 700 });
        expect(shouldDeferCombatVfx(prev, next)).toBe(true);
        expect(computeCombatDamage(prev, next)).toBeNull();
    });
});
