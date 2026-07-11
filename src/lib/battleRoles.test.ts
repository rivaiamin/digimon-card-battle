import { describe, expect, it } from "vitest";
import {
    formatBattleRoleLabel,
    getBattleRole,
    getBattleRoleHeadline,
    getBattleRoleSubline,
    getOpponentBattleRole,
    getTurnStatusHint,
    getTurnStatusTitle,
    shouldShowFlashMessage,
} from "./battleRoles";

describe("battleRoles (FC-003 UI)", () => {
    it("maps turn owner to attacker", () => {
        expect(getBattleRole("p1", "p1")).toBe("attacker");
        expect(getBattleRole("p2", "p1")).toBe("defender");
        expect(getOpponentBattleRole("attacker")).toBe("defender");
    });

    it("explains take-turn attack order during attack phase", () => {
        const hint = getTurnStatusHint({
            phase: "battle_attack",
            prepSubPhase: "",
            yourRole: "defender",
            isYourTurn: false,
            supportPickDefenderFirst: true,
            isYourSupportPickTurn: false,
            attackLocked: false,
        });
        expect(hint).toContain("Attacker strikes first");
    });

    it("shows draw target in hint", () => {
        const hint = getTurnStatusHint({
            phase: "draw",
            prepSubPhase: "",
            yourRole: "attacker",
            isYourTurn: true,
            supportPickDefenderFirst: true,
            isYourSupportPickTurn: false,
            attackLocked: false,
            handTarget: 4,
        });
        expect(hint).toBe("Drawing to 4 cards.");
    });

    it("labels defender-first support order", () => {
        const hint = getTurnStatusHint({
            phase: "battle_support",
            prepSubPhase: "",
            yourRole: "defender",
            isYourTurn: true,
            supportPickDefenderFirst: true,
            isYourSupportPickTurn: true,
            attackLocked: false,
        });
        expect(hint).toContain("first");
    });

    it("shows mulligan redraw hint with count", () => {
        const hint = getTurnStatusHint({
            phase: "preparation",
            prepSubPhase: "mulligan",
            yourRole: "attacker",
            isYourTurn: true,
            supportPickDefenderFirst: true,
            isYourSupportPickTurn: false,
            attackLocked: false,
            mulligansRemaining: 1,
        });
        expect(hint).toBe("Keep hand or redraw once.");
    });

    it("headline is compact for preparation", () => {
        const title = getTurnStatusTitle({
            phase: "preparation",
            prepSubPhase: "mulligan",
            yourRole: "attacker",
            isYourTurn: true,
            supportPickDefenderFirst: true,
            isYourSupportPickTurn: false,
            attackLocked: false,
            handTarget: 4,
        });
        expect(title).toContain("Opening hand");
    });

    it("legacy headline helper still works", () => {
        const headline = getBattleRoleHeadline({
            phase: "battle_attack",
            yourRole: "attacker",
            supportPickDefenderFirst: true,
            attackLockBeforeSupport: true,
            isYourSupportPickTurn: false,
            attackLocked: false,
        });
        expect(headline).toContain(formatBattleRoleLabel("attacker"));
    });

    it("legacy subline helper still works", () => {
        const subline = getBattleRoleSubline({
            phase: "battle_attack",
            yourRole: "attacker",
            supportPickDefenderFirst: true,
            attackLockBeforeSupport: true,
            isYourSupportPickTurn: false,
            attackLocked: false,
        });
        expect(subline.length).toBeGreaterThan(0);
    });

    it("only flashes exceptional server messages", () => {
        expect(shouldShowFlashMessage("KO — deploy a Rookie", "preparation")).toBe(true);
        expect(shouldShowFlashMessage("Battle Phase: Select Attack", "battle_attack")).toBe(false);
        expect(shouldShowFlashMessage("Match Over", "victory")).toBe(true);
    });
});
