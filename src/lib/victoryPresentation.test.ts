import { describe, expect, it } from "vitest";
import {
    formatLoserReason,
    formatVictoryScore,
    stageVisible,
    victoryBeatStage,
    victoryTitle,
    VICTORY_CTA_MS,
    VICTORY_SCORE_MS,
    VICTORY_TITLE_MS,
} from "./victoryPresentation";

describe("victoryPresentation (UX-007)", () => {
    it("formats titles and scores", () => {
        expect(victoryTitle("won")).toBe("BATTLE WON");
        expect(victoryTitle("lost")).toBe("BATTLE LOST");
        expect(formatVictoryScore(2, 1)).toBe("2 — 1");
    });

    it("formats loser reasons", () => {
        expect(formatLoserReason("points")).toBe("3 POINT VICTORY");
        expect(formatLoserReason("deck_out")).toBe("DECK OUT");
        expect(formatLoserReason("disconnect")).toBe("OPPONENT DISCONNECTED");
        expect(formatLoserReason("afk")).toBe("AFK FORFEIT");
        expect(formatLoserReason("")).toBe("");
    });

    it("advances beat stages by elapsed time", () => {
        expect(victoryBeatStage(0)).toBe("idle");
        expect(victoryBeatStage(VICTORY_TITLE_MS)).toBe("title");
        expect(victoryBeatStage(VICTORY_SCORE_MS)).toBe("score");
        expect(victoryBeatStage(VICTORY_CTA_MS)).toBe("cta");
        expect(stageVisible("score", "title")).toBe(true);
        expect(stageVisible("title", "score")).toBe(false);
    });
});
