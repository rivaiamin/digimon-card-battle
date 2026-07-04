/**
 * Replay bundle format and report helpers (E8 / T8-1, T8-2).
 */

import type { BattleAuditEntry } from "./battleAuditLog";

export const REPLAY_FORMAT_VERSION = 1;

export interface ReplayBundle {
    version: number;
    seed?: number;
    ruleProfileId?: string;
    arenaVariantId?: string;
    entries: BattleAuditEntry[];
}

export interface ScenarioRunResult {
    scenarioId: string;
    fidelityIds: string[];
    passed: boolean;
    failures: string[];
}

export function buildReplayBundle(
    entries: readonly BattleAuditEntry[],
    meta: Pick<ReplayBundle, "seed" | "ruleProfileId" | "arenaVariantId"> = {}
): ReplayBundle {
    return {
        version: REPLAY_FORMAT_VERSION,
        entries: [...entries],
        ...meta,
    };
}

/** Summarize scenario suite for CI / agent review (T8-4). */
export function formatScenarioReport(results: ScenarioRunResult[]): string {
    const passed = results.filter(r => r.passed);
    const failed = results.filter(r => !r.passed);
    const lines: string[] = [
        `# Fidelity Scenario Report`,
        ``,
        `**${passed.length}/${results.length} passed**`,
        ``,
    ];

    if (failed.length > 0) {
        lines.push(`## Failures`);
        for (const f of failed) {
            lines.push(`- **${f.scenarioId}** [${f.fidelityIds.join(", ")}]`);
            for (const msg of f.failures) {
                lines.push(`  - ${msg}`);
            }
        }
        lines.push(``);
    }

    lines.push(`## All scenarios`);
    for (const r of results) {
        const mark = r.passed ? "PASS" : "FAIL";
        lines.push(`- [${mark}] ${r.scenarioId} — ${r.fidelityIds.join(", ")}`);
    }

    return lines.join("\n");
}

/** Verify replay entries are monotonically sequenced (sanity check). */
export function verifyReplayIntegrity(bundle: ReplayBundle): string[] {
    const errors: string[] = [];
    if (bundle.version !== REPLAY_FORMAT_VERSION) {
        errors.push(`unsupported replay version: ${bundle.version}`);
    }
    for (let i = 0; i < bundle.entries.length; i++) {
        const e = bundle.entries[i];
        if (e.seq !== i + 1) {
            errors.push(`entry ${i}: expected seq ${i + 1}, got ${e.seq}`);
        }
    }
    return errors;
}
