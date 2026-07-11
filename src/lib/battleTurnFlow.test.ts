import { describe, expect, it } from "vitest";
import {
    canonicalTurnPhases,
    DRAW_BEAT_MS,
    fidelityBattlePhaseChain,
    isLegalPhaseTransition,
    isPlayerActionLegal,
    prepSubPhaseAfterDraw,
    SUPPORT_REVEAL_MS,
    SUPPORT_REVEAL_STAGGER_S,
} from "./battleTurnFlow";
import { getRuleProfile } from "./ruleProfile";
import { getDefenderSessionId } from "./supportPhase";

describe("post-battle turn handoff (FC-003 / FC-004)", () => {
    const sessions = ["player_a", "player_b"] as const;

    it("gives the next draw phase to the defender after battle", () => {
        expect(getDefenderSessionId("player_a", sessions)).toBe("player_b");
        expect(getDefenderSessionId("player_b", sessions)).toBe("player_a");
    });
});

describe("canonical phase chain (FC-003)", () => {
    it("orders fidelity battle as attack → support → reveal → resolution", () => {
        expect(fidelityBattlePhaseChain(true)).toEqual([
            "battle_attack",
            "battle_support",
            "battle_reveal",
            "resolution",
        ]);
    });

    it("starts each turn with draw then preparation", () => {
        const chain = canonicalTurnPhases(true);
        expect(chain[0]).toBe("draw");
        expect(chain[1]).toBe("preparation");
        expect(chain).toContain("resolution");
    });

    it("resolves prep sub-phase after draw for opening mulligan", () => {
        const profile = getRuleProfile("fidelity_ps1");
        expect(prepSubPhaseAfterDraw(false, true, 1, profile)).toBe("mulligan");
    });

    it("resolves prep sub-phase after draw to discard when active exists", () => {
        const profile = getRuleProfile("fidelity_ps1");
        expect(prepSubPhaseAfterDraw(true, false, 0, profile)).toBe("discard");
    });

    it("allows only forward battle transitions for fidelity_ps1", () => {
        expect(isLegalPhaseTransition("preparation", "battle_attack", true)).toBe(true);
        expect(isLegalPhaseTransition("battle_attack", "battle_support", true)).toBe(true);
        expect(isLegalPhaseTransition("battle_support", "battle_reveal", true)).toBe(true);
        expect(isLegalPhaseTransition("battle_reveal", "resolution", true)).toBe(true);
        expect(isLegalPhaseTransition("resolution", "draw", true)).toBe(true);
        expect(isLegalPhaseTransition("battle_attack", "battle_reveal", true)).toBe(false);
        expect(isLegalPhaseTransition("draw", "battle_attack", true)).toBe(false);
    });
});

describe("player action legality (FC-003)", () => {
    const base = {
        isYourTurn: true,
        hasActive: true,
        supportLocked: false,
        attackLocked: false,
    };

    it("allows DRAW only during draw phase", () => {
        expect(
            isPlayerActionLegal("DRAW", { ...base, phase: "draw", prepSubPhase: "" })
        ).toBe(true);
        expect(
            isPlayerActionLegal("DRAW", { ...base, phase: "preparation", prepSubPhase: "discard" })
        ).toBe(false);
    });

    it("rejects prep actions during draw", () => {
        expect(
            isPlayerActionLegal("DISCARD_FOR_DP", { ...base, phase: "draw", prepSubPhase: "" })
        ).toBe(false);
        expect(
            isPlayerActionLegal("END_PREP", {
                ...base,
                phase: "preparation",
                prepSubPhase: "evolve",
            })
        ).toBe(true);
    });

    it("allows battle lock actions without active-player turn flag", () => {
        expect(
            isPlayerActionLegal("LOCK_ATTACK", {
                ...base,
                isYourTurn: false,
                phase: "battle_attack",
                prepSubPhase: "",
                attackLocked: false,
            })
        ).toBe(true);
    });

    it("rejects all actions during reveal / resolution / victory", () => {
        for (const phase of ["battle_reveal", "resolution", "victory"] as const) {
            expect(
                isPlayerActionLegal("LOCK_ATTACK", { ...base, phase, prepSubPhase: "" })
            ).toBe(false);
            expect(
                isPlayerActionLegal("LOCK_SUPPORT", { ...base, phase, prepSubPhase: "" })
            ).toBe(false);
            expect(isPlayerActionLegal("DRAW", { ...base, phase, prepSubPhase: "" })).toBe(false);
        }
    });

    it("rejects attack lock during support and support lock during attack", () => {
        expect(
            isPlayerActionLegal("LOCK_SUPPORT", {
                ...base,
                phase: "battle_attack",
                prepSubPhase: "",
            })
        ).toBe(false);
        expect(
            isPlayerActionLegal("LOCK_ATTACK", {
                ...base,
                phase: "battle_support",
                prepSubPhase: "",
            })
        ).toBe(false);
    });

    it("exposes draw beat timing for client pacing", () => {
        expect(DRAW_BEAT_MS).toBeGreaterThanOrEqual(1_000);
    });

    it("exposes support reveal timing that fits staggered flips (P3-6)", () => {
        expect(SUPPORT_REVEAL_MS).toBe(1_600);
        expect(SUPPORT_REVEAL_STAGGER_S * 1000 + 650).toBeLessThanOrEqual(SUPPORT_REVEAL_MS);
    });
});
