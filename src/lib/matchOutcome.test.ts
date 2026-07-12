import { describe, expect, it } from "vitest";
import {
    MATCH_POINTS_TO_WIN,
    applyScoreDelta,
    isDeckOutOnDraw,
    isDeckOutOnRequiredDeploy,
    isWinningScore,
    loserSessionIdIfPointVictory,
} from "./matchOutcome";
import { resolveKoScoring } from "./battleEffectEngine";

describe("matchOutcome (FC-005)", () => {
    it("uses first-to-3 points", () => {
        expect(MATCH_POINTS_TO_WIN).toBe(3);
        expect(isWinningScore(2)).toBe(false);
        expect(isWinningScore(3)).toBe(true);
    });

    it("awards a point win after a single KO", () => {
        const ko = resolveKoScoring(0, 500);
        const scores = applyScoreDelta({ p1: 2, p2: 1 }, ko.scoreDelta);
        expect(scores).toEqual({ p1: 2, p2: 2 });
        expect(loserSessionIdIfPointVictory(scores, "a", "b")).toBeNull();

        const next = applyScoreDelta(scores, resolveKoScoring(0, 100).scoreDelta);
        expect(next).toEqual({ p1: 2, p2: 3 });
        expect(loserSessionIdIfPointVictory(next, "a", "b")).toBe("a");
    });

    it("treats double KO as a score tie (no points)", () => {
        const ko = resolveKoScoring(0, 0);
        expect(ko.isDoubleKo).toBe(true);
        const scores = applyScoreDelta({ p1: 2, p2: 2 }, ko.scoreDelta);
        expect(scores).toEqual({ p1: 2, p2: 2 });
        expect(loserSessionIdIfPointVictory(scores, "a", "b")).toBeNull();
    });

    it("detects deck-out on draw and required deploy", () => {
        expect(
            isDeckOutOnDraw({ hasActive: true, handSize: 2, deckSize: 0, handTarget: 4 })
        ).toBe(true);
        expect(
            isDeckOutOnDraw({ hasActive: true, handSize: 4, deckSize: 0, handTarget: 4 })
        ).toBe(false);
        expect(
            isDeckOutOnRequiredDeploy({ hasLegalDeployInHand: false, recoveredFromDeck: false })
        ).toBe(true);
        expect(
            isDeckOutOnRequiredDeploy({ hasLegalDeployInHand: false, recoveredFromDeck: true })
        ).toBe(false);
    });
});
