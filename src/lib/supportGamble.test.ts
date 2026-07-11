import { describe, expect, it } from "vitest";
import {
    attemptOnlineDeckSupportGamble,
    canGambleOnlineDeckSupport,
    drawOnlineDeckSupport,
} from "./supportGamble";

describe("supportGamble (FC-013 / P3-4)", () => {
    it("allows gamble only when the online deck has cards", () => {
        expect(canGambleOnlineDeckSupport(0)).toBe(false);
        expect(canGambleOnlineDeckSupport(1)).toBe(true);
    });

    it("draws the top card and shrinks the deck", () => {
        const deck = [{ id: "top" }, { id: "next" }];
        const drawn = drawOnlineDeckSupport(deck);
        expect(drawn).toEqual({ id: "top" });
        expect(deck).toEqual([{ id: "next" }]);
    });

    it("attemptOnlineDeckSupportGamble returns structured results", () => {
        expect(attemptOnlineDeckSupportGamble([], true)).toEqual({
            ok: false,
            reason: "empty_deck",
        });
        expect(attemptOnlineDeckSupportGamble([{ id: "a" }], false)).toEqual({
            ok: false,
            reason: "gamble_disabled",
        });
        const deck = [{ id: "a" }, { id: "b" }];
        const result = attemptOnlineDeckSupportGamble(deck, true);
        expect(result).toEqual({ ok: true, card: { id: "a" }, deckSizeAfter: 1 });
        expect(deck).toEqual([{ id: "b" }]);
    });
});
