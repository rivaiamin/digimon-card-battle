import { describe, expect, it } from "vitest";
import { getDefenderSessionId } from "./supportPhase";

describe("post-battle turn handoff (FC-003 / FC-004)", () => {
    const sessions = ["player_a", "player_b"] as const;

    it("gives the next draw phase to the defender after battle", () => {
        expect(getDefenderSessionId("player_a", sessions)).toBe("player_b");
        expect(getDefenderSessionId("player_b", sessions)).toBe("player_a");
    });
});
