import { describe, expect, it } from "vitest";
import { compareOrderedEffects } from "./effectConflictResolver";

describe("effect conflict resolver (FC-020)", () => {
    it("prefers first-strike owner on same priority", () => {
        const a = {
            effect: "a",
            priority: 3,
            sessionId: "p1",
            isActivePlayer: false,
            hasFirstStrike: true,
        };
        const b = {
            effect: "b",
            priority: 3,
            sessionId: "p2",
            isActivePlayer: true,
            hasFirstStrike: false,
        };
        expect(compareOrderedEffects(a, b, ["p1", "p2"])).toBeLessThan(0);
    });

    it("falls back to session order when tied", () => {
        const a = {
            effect: "a",
            priority: 4,
            sessionId: "p2",
            isActivePlayer: false,
            hasFirstStrike: false,
        };
        const b = {
            effect: "b",
            priority: 4,
            sessionId: "p1",
            isActivePlayer: false,
            hasFirstStrike: false,
        };
        expect(compareOrderedEffects(a, b, ["p1", "p2"])).toBeGreaterThan(0);
    });
});
