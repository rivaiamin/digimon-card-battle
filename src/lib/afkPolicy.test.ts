import { describe, expect, it } from "vitest";
import {
    AFK_FORFEIT_THRESHOLD,
    shouldForfeitAfk,
    strikesAfterTimeout,
    strikesAfterVoluntaryAction,
} from "./afkPolicy";

describe("AFK forfeit policy (FC-023)", () => {
    it("resets strikes on voluntary action", () => {
        expect(strikesAfterVoluntaryAction()).toBe(0);
    });

    it("increments strikes on timeout", () => {
        expect(strikesAfterTimeout(0)).toBe(1);
        expect(strikesAfterTimeout(1)).toBe(2);
    });

    it("forfeits at configured threshold", () => {
        expect(shouldForfeitAfk(AFK_FORFEIT_THRESHOLD - 1)).toBe(false);
        expect(shouldForfeitAfk(AFK_FORFEIT_THRESHOLD)).toBe(true);
    });
});
