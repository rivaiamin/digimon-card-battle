import { describe, expect, it } from "vitest";
import { applyDiscardForDp, canDiscardForDp } from "./discardForDp";

type TestCard = { id: string; cardKind: string; plusDp: number };

describe("discardForDp (FC-006)", () => {
    it("allows only digimon cards to be discarded for DP", () => {
        expect(canDiscardForDp({ cardKind: "digimon" })).toBe(true);
        expect(canDiscardForDp({ cardKind: "option" })).toBe(false);
        expect(canDiscardForDp({ cardKind: "evolution_option" })).toBe(false);
    });

    it("moves digimon to trash and sums plusDp", () => {
        const hand: TestCard[] = [
            { id: "d1", cardKind: "digimon", plusDp: 20 },
            { id: "d2", cardKind: "digimon", plusDp: 30 },
        ];
        const trash: TestCard[] = [];

        const result = applyDiscardForDp(hand, trash, ["d1", "d2"]);

        expect(result.dpGained).toBe(50);
        expect(result.discardedIds).toEqual(["d1", "d2"]);
        expect(result.rejectedIds).toEqual([]);
        expect(hand).toHaveLength(0);
        expect(trash.map(c => c.id)).toEqual(["d1", "d2"]);
    });

    it("rejects option cards without removing them", () => {
        const hand: TestCard[] = [
            { id: "o1", cardKind: "option", plusDp: 0 },
            { id: "d1", cardKind: "digimon", plusDp: 10 },
        ];
        const trash: TestCard[] = [];

        const result = applyDiscardForDp(hand, trash, ["o1", "d1"]);

        expect(result.dpGained).toBe(10);
        expect(result.discardedIds).toEqual(["d1"]);
        expect(result.rejectedIds).toEqual(["o1"]);
        expect(hand.map(c => c.id)).toEqual(["o1"]);
    });

    it("rejects duplicate ids in one batch", () => {
        const hand: TestCard[] = [{ id: "d1", cardKind: "digimon", plusDp: 20 }];
        const trash: TestCard[] = [];

        const result = applyDiscardForDp(hand, trash, ["d1", "d1"]);

        expect(result.dpGained).toBe(20);
        expect(result.discardedIds).toEqual(["d1"]);
        expect(result.rejectedIds).toEqual(["d1"]);
        expect(hand).toHaveLength(0);
    });
});
