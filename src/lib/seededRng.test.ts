import { describe, expect, it } from "vitest";
import { createSeededRng, shuffleInPlace } from "./seededRng";

describe("createSeededRng (T8-2)", () => {
    it("produces deterministic values for the same seed", () => {
        const a = createSeededRng(99);
        const b = createSeededRng(99);
        const seqA = [a(), a(), a(), a(), a()];
        const seqB = [b(), b(), b(), b(), b()];
        expect(seqA).toEqual(seqB);
    });

    it("shuffles deterministically", () => {
        const arr1 = ["a", "b", "c", "d", "e"];
        const arr2 = ["a", "b", "c", "d", "e"];
        shuffleInPlace(arr1, createSeededRng(7));
        shuffleInPlace(arr2, createSeededRng(7));
        expect(arr1).toEqual(arr2);
        expect(arr1).not.toEqual(["a", "b", "c", "d", "e"]);
    });
});
