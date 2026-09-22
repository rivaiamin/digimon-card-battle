#!/usr/bin/env tsx
/**
 * Leaf-1.2.3 oracle — fidelity scenario coverage.
 *
 * G1: FC-014 and FC-020 each have at least one passing scenario, and the scenario
 *     ids are asserted rather than inferred from a count.
 * G2: the two new scenarios FAIL against the pre-fix resolver (negative control).
 * G3: the covered FC ID set is asserted against the contract §6.2 in-scope set,
 *     derived from `docs/fidelity-rules-contract.md` rather than hardcoded.
 */

import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import {
    FIDELITY_SCENARIOS,
    ORDERING_PROBE_EXPECTATIONS,
    SHIPPED_ORDERING_HARNESS,
    assertConflictPolicyTieBreak,
    assertDeclaredSpeedOrdering,
    listCoveredFidelityIds,
    probeClassPrecedesFirstStrike,
    probeDeclaredSpeedPrimary,
    probeEqualSpeedClassFallback,
    probeFirstStrikeTieBreak,
    runAllFidelityScenarios,
    type OrderingProbeHarness,
} from "../src/lib/fidelityScenarioRunner";

type Mode = "G1" | "G2" | "G3";

function fail(message: string): never {
    console.error(`scenario-coverage verification FAILED: ${message}`);
    process.exit(1);
}

function assert(condition: unknown, message: string): never | void {
    if (!condition) fail(message);
}

const CONTRACT_PATH = "docs/fidelity-rules-contract.md";
/**
 * Pre-fix baseline: the tip of the reviewed work, before this remediation.
 * Wave-1 leaf-1.1.1 changed `effectConflictResolver.compareOrderedEffects`
 * (adding the equal-speed `classPriority` sub-key) and exported
 * `holdsFirstStrike` from `supportResolver` as uncommitted working-tree edits on
 * top of this commit.
 *
 * Pinned by SHA, never `HEAD`: committing the fix must not silently turn this
 * negative control into a tautology that compares the fix against itself.
 */
const PRE_FIX_REF = "7c60592";
/**
 * §6.2 in-scope total. FC-001..FC-012 (12), FC-014..FC-028 (15), FC-030 (1) = 28.
 * Pinned so a silently truncated §6.2 table cannot make coverage look complete.
 */
const IN_SCOPE_FC_COUNT = 28;
/** §6.3 deferred FC IDs: the only FC IDs allowed to be covered beyond §6.2. */
const DEFERRED_FC_IDS: Record<string, true> = { "FC-013": true, "FC-029": true };
/** FC IDs this leaf adds scenarios for. */
const NEW_SCENARIOS: ReadonlyArray<{ id: string; fidelityId: string }> = [
    { id: "support-declared-speed-ordering", fidelityId: "FC-014" },
    { id: "support-conflict-policy-tie-break", fidelityId: "FC-020" },
];

/**
 * Parse the contract §6.2 in-scope table into an FC ID set.
 *
 * §6.2 is a markdown table of `| Group | FC IDs | Scope note |` rows. Only rows
 * whose first cell is a group name carry FC IDs, so the parser reads the second
 * cell of every row that lists at least one `FC-###` token. §6.3 (deferred) is a
 * different table and is deliberately not read.
 */
function deriveInScopeFcIds(): Set<string> {
    let text: string;
    try {
        text = readFileSync(CONTRACT_PATH, "utf8");
    } catch (err) {
        fail(`could not read ${CONTRACT_PATH}: ${err instanceof Error ? err.message : String(err)}`);
    }
    const start = text.indexOf("### 6.2");
    assert(start >= 0, `${CONTRACT_PATH} no longer contains a §6.2 heading`);
    const end = text.indexOf("### 6.3", start);
    assert(end > start, `${CONTRACT_PATH} §6.2 is not terminated by a §6.3 heading`);
    const section = text.slice(start, end);

    const ids = new Set<string>();
    for (const line of section.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("|")) continue;
        const cells = trimmed
            .replace(/^\|/, "")
            .replace(/\|$/, "")
            .split("|")
            .map(cell => cell.trim());
        // The FC ID column is the second cell; the header/separator rows have none.
        const fcCell = cells[1] ?? "";
        for (const match of fcCell.matchAll(/FC-\d{3}/g)) ids.add(match[0]);
    }
    assert(ids.size > 0, `no FC IDs parsed out of ${CONTRACT_PATH} §6.2`);
    return ids;
}

/** Locate a scenario by id, failing loudly when it is absent. */
function scenarioById(id: string) {
    const scenario = FIDELITY_SCENARIOS.find(candidate => candidate.id === id);
    assert(scenario, `no scenario with id '${id}' is registered`);
    return scenario!;
}

/**
 * Extract the pre-fix source tree into a scratch directory and import its
 * `supportResolver` / `effectConflictResolver`.
 *
 * `git archive` is used rather than a checkout so the working tree is untouched.
 * The archive lands under `node_modules/.cache/` so the extracted modules resolve
 * `node_modules` and the repo's tsconfig the same way the shipped ones do.
 *
 * `await import()` is required here: the specifier is a runtime-selected scratch
 * path that does not exist at author time, so a static import cannot express it.
 * This is exactly the "test exercising a module-loading boundary" exception.
 */
async function loadPreFixHarness(): Promise<{
    harness: OrderingProbeHarness;
    preFixComparatorOrder: string;
}> {
    const dir = join(process.cwd(), "node_modules/.cache/scenario-coverage-prefix");
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    try {
        const tarPath = join(dir, "src.tar");
        let archive: Buffer;
        try {
            archive = execFileSync(
                "git",
                ["archive", "--format=tar", PRE_FIX_REF, "src/lib", "src/schema", "src/types.ts"],
                { maxBuffer: 1 << 28 }
            );
        } catch (err) {
            fail(
                `could not archive the pre-fix ref ${PRE_FIX_REF}: ` +
                    `${err instanceof Error ? err.message : String(err)}`
            );
        }
        writeFileSync(tarPath, archive!);
        execFileSync("tar", ["-x", "-f", tarPath, "-C", dir], { stdio: "pipe" });

        const resolver = (await import(
            pathToFileURL(join(dir, "src/lib/supportResolver.ts")).href
        )) as {
            resolveSupportPhase: OrderingProbeHarness["resolve"];
            createSupportBattleContext: OrderingProbeHarness["makeContext"];
        };
        assert(
            typeof resolver.resolveSupportPhase === "function",
            `the pre-fix ${PRE_FIX_REF} tree did not export resolveSupportPhase`
        );

        const conflictResolver = (await import(
            pathToFileURL(join(dir, "src/lib/effectConflictResolver.ts")).href
        )) as {
            sortEffectsByConflictPolicy: (
                effects: Array<{
                    effect: string;
                    priority: number;
                    classPriority?: number;
                    sessionId: string;
                    isActivePlayer: boolean;
                    hasFirstStrike: boolean;
                }>,
                sessionOrder: string[]
            ) => Array<{ effect: string }>;
        };
        const ordered = conflictResolver
            .sortEffectsByConflictPolicy(
                [
                    {
                        effect: "a",
                        priority: 2,
                        sessionId: "a",
                        isActivePlayer: true,
                        hasFirstStrike: false,
                    },
                    {
                        effect: "d",
                        priority: 2,
                        sessionId: "d",
                        isActivePlayer: false,
                        hasFirstStrike: false,
                    },
                ],
                ["a", "d"]
            )
            .map(entry => entry.effect);

        return {
            harness: {
                resolve: resolver.resolveSupportPhase,
                makeContext: resolver.createSupportBattleContext,
            },
            preFixComparatorOrder: ordered.join(","),
        };
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
}

function modeG1(): void {
    // Every new scenario must be registered, carry the FC id it claims, and pass.
    for (const { id, fidelityId } of NEW_SCENARIOS) {
        const scenario = scenarioById(id);
        assert(
            scenario.fidelityIds.includes(fidelityId),
            `scenario '${id}' does not declare ${fidelityId} (has ${scenario.fidelityIds.join(", ")})`
        );
    }

    const results = runAllFidelityScenarios();
    const failed = results.filter(result => !result.passed);
    assert(
        failed.length === 0,
        `fidelity scenarios failed: ${failed
            .map(result => `${result.scenarioId}: ${result.failures.join("; ")}`)
            .join(" | ")}`
    );

    for (const { id, fidelityId } of NEW_SCENARIOS) {
        const result = results.find(candidate => candidate.scenarioId === id);
        assert(result, `scenario '${id}' did not run`);
        assert(result!.passed, `scenario '${id}' failed: ${result!.failures.join("; ")}`);
        assert(
            result!.fidelityIds.includes(fidelityId),
            `scenario '${id}' lost its ${fidelityId} mapping`
        );
    }

    const covered = listCoveredFidelityIds();
    for (const { fidelityId } of NEW_SCENARIOS) {
        assert(covered.includes(fidelityId), `${fidelityId} is absent from the covered FC ID set`);
    }

    console.log(
        `scenario-coverage G1 verified (${results.length} scenarios pass; ` +
            `'${NEW_SCENARIOS[0]!.id}' covers ${NEW_SCENARIOS[0]!.fidelityId}; ` +
            `'${NEW_SCENARIOS[1]!.id}' covers ${NEW_SCENARIOS[1]!.fidelityId})`
    );
}

async function modeG2(): Promise<void> {
    // Negative control. The scenario bodies are exported, so the pre-fix resolver
    // runs the *same* assertions the shipped scenarios run. A body that passes on
    // both sides would prove nothing about this remediation.
    const { harness: preFix, preFixComparatorOrder } = await loadPreFixHarness();

    // Positive control first: the same bodies must pass on the shipped resolver,
    // otherwise "it fails pre-fix" could just mean the body is broken.
    assertDeclaredSpeedOrdering(SHIPPED_ORDERING_HARNESS);
    assertConflictPolicyTieBreak(SHIPPED_ORDERING_HARNESS);

    // The pre-fix comparator had no class step: an exact speed tie fell straight
    // through to the active player, so the two names come back in session order.
    assert(
        preFixComparatorOrder === "a,d",
        `the pre-fix comparator no longer reproduces the class-less ordering ` +
            `(got '${preFixComparatorOrder}', expected 'a,d')`
    );

    // Each new scenario body must fail against the pre-fix resolver.
    for (const { id, fidelityId } of NEW_SCENARIOS) {
        const body =
            fidelityId === "FC-014" ? assertDeclaredSpeedOrdering : assertConflictPolicyTieBreak;
        let failure: string | null = null;
        try {
            body(preFix);
        } catch (err) {
            failure = err instanceof Error ? err.message : String(err);
        }
        assert(
            failure !== null,
            `'${id}' PASSED against the pre-fix resolver — it is not a regression test for ${fidelityId}`
        );
        console.log(`  pre-fix ${id} failed as required: ${failure}`);
    }

    // Each wave-1 change must be independently load-bearing, so the control names
    // both defects rather than relying on whichever assertion happens to trip first.

    // (a) The class step. Declared speed is already primary pre-fix, so the
    //     declared-speed arm must be unchanged — that proves the class step, not
    //     the speed key, is what the new scenarios newly pin.
    const preFixSpeeds = probeDeclaredSpeedPrimary(preFix);
    assert(
        preFixSpeeds.activeFasterHp === ORDERING_PROBE_EXPECTATIONS.declaredSpeedPrimary.activeFasterHp &&
            preFixSpeeds.defenderFasterHp === ORDERING_PROBE_EXPECTATIONS.declaredSpeedPrimary.defenderFasterHp,
        `declared speed was not already the primary key pre-fix, so the FC-014 speed assertion is ` +
            `not measuring the fix: ${JSON.stringify(preFixSpeeds)}`
    );
    const preFixClass = probeEqualSpeedClassFallback(preFix);
    assert(
        preFixClass !== ORDERING_PROBE_EXPECTATIONS.equalSpeedClassFallbackHp,
        `the pre-fix resolver already produced the class-ordered result (${preFixClass}); the ` +
            `equal-speed class fallback is not load-bearing`
    );
    // The same defect must be independently visible through the FC-020 body's
    // class probe, not only through FC-014's. Otherwise one scenario would carry
    // the whole class-step regression.
    const preFixClassVsFirstStrike = probeClassPrecedesFirstStrike(preFix);
    assert(
        preFixClassVsFirstStrike !== ORDERING_PROBE_EXPECTATIONS.classPrecedesFirstStrikeHp,
        `the FC-020 class probe already matched the shipped result pre-fix (${preFixClassVsFirstStrike}); ` +
            `it is not an independent control for the class step`
    );

    // (b) The first-strike source. Pre-fix, an attack-slot holder was invisible to
    //     the tie-break, so the slot arm collapses onto the no-first-strike arm.
    const preFixTie = probeFirstStrikeTieBreak(preFix);
    assert(
        preFixTie.slotHp !== ORDERING_PROBE_EXPECTATIONS.firstStrikeTieBreak.slotHp,
        `the pre-fix resolver already honoured the attack-slot first strike (slot=${preFixTie.slotHp}); ` +
            `holdsFirstStrike is not load-bearing`
    );
    assert(
        preFixTie.slotHp === preFixTie.noFirstStrikeHp,
        `pre-fix, the attack-slot first strike was expected to be indistinguishable from holding none, ` +
            `but slot=${preFixTie.slotHp} and none=${preFixTie.noFirstStrikeHp}`
    );
    const shippedTie = probeFirstStrikeTieBreak(SHIPPED_ORDERING_HARNESS);
    assert(
        shippedTie.slotHp === ORDERING_PROBE_EXPECTATIONS.firstStrikeTieBreak.slotHp &&
            shippedTie.supportGrantedHp === ORDERING_PROBE_EXPECTATIONS.firstStrikeTieBreak.supportGrantedHp,
        `the shipped resolver does not honour both first-strike sources: ${JSON.stringify(shippedTie)}`
    );

    console.log(
        `scenario-coverage G2 verified (both new scenarios fail on the pre-fix ${PRE_FIX_REF} resolver ` +
            `while the same bodies pass on the shipped one; the class step and holdsFirstStrike are each ` +
            `independently load-bearing: class fallback ${preFixClass}->` +
            `${ORDERING_PROBE_EXPECTATIONS.equalSpeedClassFallbackHp}, FC-020 class-vs-first-strike ` +
            `${preFixClassVsFirstStrike}->${ORDERING_PROBE_EXPECTATIONS.classPrecedesFirstStrikeHp}, ` +
            `attack-slot first strike ${preFixTie.slotHp}->${ORDERING_PROBE_EXPECTATIONS.firstStrikeTieBreak.slotHp})`
    );
}

function modeG3(): void {
    const inScope = deriveInScopeFcIds();
    const covered = listCoveredFidelityIds();
    const coveredSet = new Set(covered);

    const missing = [...inScope].filter(id => !coveredSet.has(id)).sort();
    assert(
        missing.length === 0,
        `in-scope FC IDs from ${CONTRACT_PATH} §6.2 have no scenario: ${missing.join(", ")}`
    );

    // A bare count would let an unrelated scenario silently satisfy a missing FC.
    // Assert the exact in-scope set: every covered id must be in scope, and every
    // in-scope id must be covered. §6.3's deferred ids are the only allowed extras.
    const outOfScope = covered.filter(id => !inScope.has(id) && !(id in DEFERRED_FC_IDS)).sort();
    assert(
        outOfScope.length === 0,
        `scenarios cover FC IDs that are neither in scope (§6.2) nor deferred (§6.3): ${outOfScope.join(", ")}`
    );

    // Non-vacuous: the derived set is the documented one, so a silently truncated
    // §6.2 table cannot make coverage look complete.
    assert(
        inScope.size === IN_SCOPE_FC_COUNT,
        `§6.2 should list ${IN_SCOPE_FC_COUNT} in-scope FC IDs, derived ${inScope.size}: ` +
            `${[...inScope].sort().join(", ")}`
    );
    for (const id of ["FC-014", "FC-020", "FC-004", "FC-011", "FC-022"]) {
        assert(inScope.has(id), `${id} is missing from the derived §6.2 in-scope set`);
    }

    // Mapping an FC ID is not coverage on its own: the scenario carrying it must
    // also pass, or a red scenario would still satisfy the set comparison above.
    const failed = runAllFidelityScenarios().filter(result => !result.passed);
    assert(
        failed.length === 0,
        `fidelity scenarios failed, so their FC IDs are not covered: ${failed
            .map(result => `${result.scenarioId}: ${result.failures.join("; ")}`)
            .join(" | ")}`
    );

    console.log(
        `scenario-coverage G3 verified (${inScope.size} in-scope FC IDs derived from ${CONTRACT_PATH} §6.2, ` +
            `all covered by ${FIDELITY_SCENARIOS.length} scenarios; deferred-only extras: ` +
            `${Object.keys(DEFERRED_FC_IDS).join(", ")})`
    );
}

const modes: Record<Mode, () => void | Promise<void>> = { G1: modeG1, G2: modeG2, G3: modeG3 };

const mode = process.argv[2] as Mode | undefined;
if (!mode || !Object.prototype.hasOwnProperty.call(modes, mode)) {
    console.error(
        `scenario-coverage: unimplemented or missing mode ${JSON.stringify(mode)}; expected one of ${Object.keys(modes).join(", ")}`
    );
    process.exit(1);
}

await modes[mode]!();
