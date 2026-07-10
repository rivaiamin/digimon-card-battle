import { describe, expect, it } from "vitest";
import { isFieldEvolution } from "../hooks/useEvolutionVfx";

describe("isFieldEvolution", () => {
    it("detects digivolution when active changes and stack grows", () => {
        expect(
            isFieldEvolution(
                { activeId: "rook-1", stackLen: 1 },
                { activeId: "rook-2", stackLen: 2 }
            )
        ).toBe(true);
    });

    it("rejects opening deploy", () => {
        expect(
            isFieldEvolution(
                { activeId: null, stackLen: 0 },
                { activeId: "rook-1", stackLen: 1 }
            )
        ).toBe(false);
    });

    it("rejects KO redeploy after stack was cleared", () => {
        expect(
            isFieldEvolution(
                { activeId: null, stackLen: 0 },
                { activeId: "rook-3", stackLen: 1 }
            )
        ).toBe(false);
    });

    it("rejects active swap without stack growth", () => {
        expect(
            isFieldEvolution(
                { activeId: "rook-1", stackLen: 2 },
                { activeId: "rook-2", stackLen: 2 }
            )
        ).toBe(false);
    });
});
