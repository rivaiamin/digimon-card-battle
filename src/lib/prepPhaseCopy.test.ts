import { describe, expect, it } from "vitest";
import {
    getPrepHandFooter,
    getPrepPrimaryActionLabel,
    getPrepServerMessage,
    getPrepSubPhaseHint,
    getPrepSubPhaseTitle,
    nextPrepSubPhase,
    PREP_SUBPHASE_ORDER,
} from "./prepPhaseCopy";

describe("prepPhaseCopy (FC-003 / P2-9)", () => {
    it("defines the canonical forward prep chain", () => {
        expect(PREP_SUBPHASE_ORDER).toEqual(["mulligan", "deploy", "discard", "evolve"]);
        expect(nextPrepSubPhase("mulligan")).toBe("deploy");
        expect(nextPrepSubPhase("deploy")).toBe("discard");
        expect(nextPrepSubPhase("discard")).toBe("evolve");
        expect(nextPrepSubPhase("evolve")).toBeNull();
    });

    it("keeps header title, hint, and server message aligned per sub-phase", () => {
        expect(getPrepSubPhaseTitle("discard")).toBe("Discard for DP");
        expect(getPrepSubPhaseHint("discard")).toContain("DP");
        expect(getPrepServerMessage("discard")).toBe("Discard for DP — then continue");

        expect(getPrepSubPhaseTitle("evolve")).toBe("Digivolve");
        expect(getPrepSubPhaseHint("evolve")).toContain("end prep");
        expect(getPrepServerMessage("evolve")).toBe("Digivolve or end preparation");
    });

    it("uses special deploy messages for KO / deck dig", () => {
        expect(getPrepServerMessage("deploy", { isKoRedeploy: true })).toContain("KO");
        expect(getPrepServerMessage("deploy", { isDoubleKoRedeploy: true })).toContain("Double KO");
        expect(getPrepServerMessage("deploy", { dugDeckForDigimon: true })).toContain("Deck dig");
    });

    it("exposes consistent hand action labels", () => {
        expect(getPrepPrimaryActionLabel("discard")).toBe("CONTINUE");
        expect(getPrepPrimaryActionLabel("evolve")).toBe("END PREP");
        expect(getPrepHandFooter("mulligan")).toContain("opening hand");
    });
});
