#!/usr/bin/env tsx
/**
 * CLI fidelity report for CI / agents (E8 / T8-4).
 * Usage: pnpm fidelity:report
 */
import { writeFileSync } from "fs";
import { formatScenarioReport } from "../src/lib/battleReplay.js";
import {
    listCoveredFidelityIds,
    runAllFidelityScenarios,
} from "../src/lib/fidelityScenarioRunner.js";

const results = runAllFidelityScenarios();
const report = formatScenarioReport(results);
const covered = listCoveredFidelityIds();

console.log(report);
console.log("");
console.log(`Covered FC IDs (${covered.length}): ${covered.join(", ")}`);

writeFileSync("fidelity-report.md", `${report}\n\nCovered FC IDs: ${covered.join(", ")}\n`);

const failed = results.filter(r => !r.passed);
if (failed.length > 0) {
    console.error(`\n${failed.length} scenario(s) failed.`);
    process.exit(1);
}
