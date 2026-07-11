import { describe, expect, it } from "vitest";
import { buildReplayBundle, formatScenarioReport, verifyReplayIntegrity } from "./battleReplay";
import type { BattleAuditEntry } from "./battleAuditLog";
import {
    FIDELITY_SCENARIOS,
    listCoveredFidelityIds,
    runFidelityScenario,
    runAllFidelityScenarios,
} from "./fidelityScenarioRunner";

describe("Fidelity Scenario Suite (FC-030)", () => {
    for (const scenario of FIDELITY_SCENARIOS) {
        it(`${scenario.id} [${scenario.fidelityIds.join(", ")}]`, () => {
            const result = runFidelityScenario(scenario);
            expect(result.failures).toEqual([]);
        });
    }

    it("covers critical in-scope fidelity IDs", () => {
        const covered = listCoveredFidelityIds();
        const required = [
            "FC-001",
            "FC-002",
            "FC-005",
            "FC-012",
            "FC-017",
            "FC-019",
            "FC-021",
            "FC-023",
            "FC-028",
            "FC-029",
            "FC-030",
        ];
        for (const id of required) {
            expect(covered).toContain(id);
        }
    });

    it("produces a CI-friendly report when all pass", () => {
        const results = runAllFidelityScenarios();
        const report = formatScenarioReport(results);
        expect(report).toContain("passed");
        const failed = results.filter(r => !r.passed);
        expect(
            failed.map(r => `${r.scenarioId}: ${r.failures.join("; ")}`),
            "one or more fidelity scenarios failed"
        ).toEqual([]);
    });
});

describe("replay bundle integrity (T8-2)", () => {
    it("validates monotonic sequence numbers", () => {
        const entries: BattleAuditEntry[] = [
            {
                seq: 1,
                ts: 1,
                turn: 1,
                phase: "draw",
                prepSubPhase: "",
                playerSessionId: "p1",
                action: "DRAW",
                validation: "ok",
            },
            {
                seq: 2,
                ts: 2,
                turn: 1,
                phase: "preparation",
                prepSubPhase: "deploy",
                playerSessionId: "p1",
                action: "DEPLOY_DIGIMON",
                validation: "ok",
            },
        ];
        const bundle = buildReplayBundle(entries, { seed: 42 });
        expect(verifyReplayIntegrity(bundle)).toEqual([]);
    });
});
