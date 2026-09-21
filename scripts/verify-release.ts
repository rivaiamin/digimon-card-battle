#!/usr/bin/env tsx
/**
 * Root release aggregate for the fidelity-remediation scope (GATES.md R2).
 *
 * Runs only after both branches are verified. Re-measures the end state of the
 * integrated tree: the unit suite, the fidelity report, the effect-coverage
 * counts, and the specialty gates. Owned by the root ledger.
 *
 * Usage: npx tsx scripts/verify-release.ts
 *
 * Prints exactly one success marker ("release verification passed") after every
 * assertion passes. Exits non-zero with a diagnostic otherwise.
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

import { loadCardCatalog } from "../src/lib/cardCatalogLoader";
import { canVoidEnemySupport } from "../src/lib/supportResolver";
import { CardSchema, PlayerSchema, SupportEffectSchema } from "../src/schema/BattleState";

/** Baselines measured at plan time; the suite may only grow. */
const BASELINE_TEST_FILES = 32;
const BASELINE_TESTS = 278;
const BASELINE_SCENARIOS = 38;

function fail(message: string): never {
    console.error(`release verification FAILED: ${message}`);
    process.exit(1);
}

function assert(condition: unknown, message: string): void {
    if (!condition) fail(message);
}

function run(cmd: string, args: string[]): string {
    try {
        return execFileSync(cmd, args, {
            encoding: "utf8",
            stdio: ["ignore", "pipe", "pipe"],
            maxBuffer: 64 * 1024 * 1024,
        });
    } catch (err: unknown) {
        const e = err as { stdout?: string; stderr?: string };
        fail(`${cmd} ${args.join(" ")} failed:\n${`${e.stdout ?? ""}${e.stderr ?? ""}`.slice(-4000)}`);
    }
}

function makePlayer(sessionId: string, specialty: string): PlayerSchema {
    const player = new PlayerSchema();
    player.sessionId = sessionId;
    player.hp = 1000;
    const active = new CardSchema();
    active.id = `${sessionId}-active`;
    active.cardKind = "digimon";
    active.type = specialty;
    active.maxHp = 1000;
    active.hp = 1000;
    player.active = active;
    return player;
}

/** A gated void support effect. canVoidEnemySupport takes the EFFECT, not a card. */
function gatedVoid(requireType: string, requireOpponentType: string): SupportEffectSchema {
    const se = new SupportEffectSchema();
    se.type = "void_enemy_support";
    se.requireType = requireType;
    se.requireOpponentType = requireOpponentType;
    return se;
}

// --- 1. Typecheck and unit suite -------------------------------------------------
const tscOut = run("npx", ["tsc", "--noEmit"]);
assert(tscOut.trim().length === 0 || !/error TS/.test(tscOut), `typecheck reported errors:\n${tscOut.slice(-3000)}`);

const vitestOut = run("npx", ["vitest", "run"]);
const filesMatch = vitestOut.match(/Test Files\s+(\d+) passed/);
const testsMatch = vitestOut.match(/Tests\s+(\d+) passed/);
assert(filesMatch, `could not read the vitest file count:\n${vitestOut.slice(-2000)}`);
assert(testsMatch, `could not read the vitest test count:\n${vitestOut.slice(-2000)}`);
const files = Number(filesMatch![1]);
const tests = Number(testsMatch![1]);
assert(files >= BASELINE_TEST_FILES, `unit test files regressed: ${files} < ${BASELINE_TEST_FILES}`);
assert(tests >= BASELINE_TESTS, `unit tests regressed: ${tests} < ${BASELINE_TESTS}`);

// --- 2. Fidelity report and FC coverage -----------------------------------------
const reportOut = run("npx", ["tsx", "scripts/fidelity-report.ts"]);
assert(!/\[FAIL\]/.test(reportOut), `fidelity report contains failures:\n${reportOut.slice(-3000)}`);
const passCount = (reportOut.match(/\[PASS\]/g) ?? []).length;
assert(passCount >= BASELINE_SCENARIOS, `fidelity scenarios regressed: ${passCount} < ${BASELINE_SCENARIOS}`);

const coveredMatch = reportOut.match(/Covered FC IDs \(\d+\): ([^\n]+)/);
assert(coveredMatch, "the fidelity report did not print a Covered FC IDs line");
const covered = coveredMatch![1]!;
for (const fc of ["FC-014", "FC-020"]) {
    assert(covered.includes(fc), `${fc} is still absent from the covered FC ID set`);
}

// --- 3. Effect coverage artifact -------------------------------------------------
const effectsRaw: unknown = JSON.parse(readFileSync("src/data/effects.json", "utf8"));
const effects: unknown =
    effectsRaw && typeof effectsRaw === "object" && "effects" in effectsRaw
        ? (effectsRaw as { effects: unknown }).effects
        : [];
if (!Array.isArray(effects)) fail("effects.json did not contain an effects array");
let implemented = 0;
let catalogOnly = 0;
for (const entry of effects) {
    if (!entry || typeof entry !== "object" || !("status" in entry)) continue;
    if (entry.status === "implemented") implemented++;
    else if (entry.status === "catalog_only") catalogOnly++;
}
assert(
    implemented >= 252,
    `implemented effect lines regressed: ${implemented} < 252 (catalog_only=${catalogOnly})`
);

// --- 4. Specialty gates end to end ----------------------------------------------
const cardsRaw: unknown = JSON.parse(readFileSync("src/data/cards.json", "utf8"));
const normalized = loadCardCatalog(cardsRaw);
const normalizedGated = normalized.filter(
    (c) => c.supportEffect && (c.supportEffect.requireType || c.supportEffect.requireOpponentType)
);
assert(normalizedGated.length > 0, "the loader preserved no specialty gates");

const iceGated = gatedVoid("Ice", "");
assert(
    !canVoidEnemySupport(makePlayer("a", "Fire"), iceGated, makePlayer("d", "Fire"), true),
    "Ice-gated void fires for a Fire owner"
);
assert(
    canVoidEnemySupport(makePlayer("a", "Ice"), iceGated, makePlayer("d", "Fire"), true),
    "Ice-gated void does not fire for an Ice owner"
);

// --- 5. Docs describe the shipped artifact --------------------------------------
const backlog = readFileSync("docs/8.0 Fidelity Checklist & Epic Backlog.md", "utf8");
assert(!/70\/257/.test(backlog), "docs/8.0 still states the stale 70/257 coverage figure");
const gdd = readFileSync("GDD.md", "utf8");
assert(
    !/sends them to the Trash/.test(gdd),
    "GDD.md still routes prep discards to the Trash while the server uses the DP Slot"
);

console.log(
    `release verification passed (typecheck clean; ${files} files / ${tests} tests; ` +
        `${passCount} fidelity scenarios; ${implemented} implemented effects with ${catalogOnly} catalog_only; ` +
        `${normalizedGated.length} specialty-gated cards enforced; FC-014 and FC-020 covered)`
);
