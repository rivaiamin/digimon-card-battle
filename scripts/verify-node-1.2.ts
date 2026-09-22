#!/usr/bin/env tsx
/**
 * Branch integration oracle for node-1.2 (data, docs, verification).
 *
 * Integrates leaf-1.2.1 (catalog specialty gates), leaf-1.2.2 (documentation
 * truth) and leaf-1.2.3 (fidelity scenario coverage). Owned by the node-1.2
 * ledger; implements N-modes only.
 *
 * Usage: npx tsx scripts/verify-node-1.2.ts N2|N3|N4
 *
 * Prints exactly one success marker ("node-1.2 <MODE> verified") after every
 * assertion in that mode passes. Exits non-zero with a diagnostic otherwise.
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

import { loadCardCatalog } from "../src/lib/cardCatalogLoader";
import { canVoidEnemySupport } from "../src/lib/supportResolver";
import { CardSchema, PlayerSchema, SupportEffectSchema } from "../src/schema/BattleState";

type Mode = "N2" | "N3" | "N4";

/** Baseline measured at plan time; the suite may only grow. */
const BASELINE_TEST_FILES = 32;
const BASELINE_TESTS = 278;
const BASELINE_SCENARIOS = 38;

const DOC_BACKLOG = "docs/8.0 Fidelity Checklist & Epic Backlog.md";
const DOC_SUPPORT = "docs/2.3 Support Phase & Conflict Resolution.md";
const GDD = "GDD.md";

function fail(message: string): never {
    console.error(`node-1.2 verification FAILED: ${message}`);
    process.exit(1);
}

function assert(condition: unknown, message: string): void {
    if (!condition) fail(message);
}

type EffectCounts = { total: number; implemented: number; partial: number; catalogOnly: number };

/** Recompute effect coverage from the artifact rather than trusting a doc claim. */
function measureEffectCounts(): EffectCounts {
    const raw: unknown = JSON.parse(readFileSync("src/data/effects.json", "utf8"));
    const effects: unknown =
        raw && typeof raw === "object" && "effects" in raw
            ? (raw as { effects: unknown }).effects
            : [];
    if (!Array.isArray(effects)) fail("effects.json did not contain an effects array");

    let implemented = 0;
    let partial = 0;
    let catalogOnly = 0;
    for (const entry of effects) {
        if (!entry || typeof entry !== "object" || !("status" in entry)) continue;
        const status = entry.status;
        if (status === "implemented") implemented++;
        else if (status === "partial") partial++;
        else if (status === "catalog_only") catalogOnly++;
    }
    return { total: effects.length, implemented, partial, catalogOnly };
}

type RawSupportEffect = {
    type?: string;
    description?: string;
    requireType?: string;
    requireOpponentType?: string;
};

type RawCard = {
    id?: string;
    name?: string;
    cardKind?: string;
    effectId?: string;
    supportEffect?: RawSupportEffect | null;
};

function rawCards(): RawCard[] {
    const raw: unknown = JSON.parse(readFileSync("src/data/cards.json", "utf8"));
    const cards: unknown = Array.isArray(raw)
        ? raw
        : raw && typeof raw === "object" && "cards" in raw
          ? raw.cards
          : [];
    if (!Array.isArray(cards)) fail("cards.json did not contain a card array");
    return cards as RawCard[];
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

async function modeN2(): Promise<void> {
    // The documentation must describe the catalog and engine that actually
    // shipped. Read the numbers out of the docs and compare to the artifact.
    const counts = measureEffectCounts();
    const backlog = readFileSync(DOC_BACKLOG, "utf8");

    // 1. No doc may still state the pre-remediation implemented/total figures.
    const staleClaim = /70\/257/.test(backlog);
    assert(
        !staleClaim,
        `docs/8.0 still states the stale "70/257" coverage figure; artifact says ` +
            `${counts.implemented}/${counts.total} implemented`
    );

    // 2. The FC-027 status word must be CONSISTENT with the measured state.
    //    PARTIAL is correct while any effect line remains partial or
    //    catalog_only; it would be wrong once every line is implemented.
    const fc027Row = backlog
        .split("\n")
        .find((line) => line.startsWith("| FC-027 |"));
    assert(fc027Row, "docs/8.0 no longer contains an FC-027 row");
    const uncovered = counts.partial + counts.catalogOnly;
    const markedPartial = /\|\s*PARTIAL\s*\|/.test(fc027Row!);
    if (uncovered > 0) {
        assert(
            markedPartial,
            `docs/8.0 FC-027 is marked complete while ${uncovered} effect line(s) remain ` +
                `(${counts.partial} partial, ${counts.catalogOnly} catalog_only)`
        );
    } else {
        assert(
            !markedPartial,
            `docs/8.0 FC-027 is still marked PARTIAL while every effect line is implemented ` +
                `(${counts.implemented}/${counts.total})`
        );
    }

    // 3. The stated counts, where the doc states any, must equal the artifact.
    const statedRatio = backlog.match(/\*\*(\d+)\/(\d+)\*\* effect lines/);
    if (statedRatio) {
        assert(
            Number(statedRatio[1]) === counts.implemented && Number(statedRatio[2]) === counts.total,
            `docs/8.0 states ${statedRatio[1]}/${statedRatio[2]} but the artifact measures ` +
                `${counts.implemented}/${counts.total}`
        );
    }

    console.log(
        `node-1.2 N2 verified (docs agree with the artifact: ${counts.implemented}/${counts.total} implemented, ` +
            `${counts.partial} partial, ${counts.catalogOnly} catalog_only)`
    );
}

async function modeN3(): Promise<void> {
    // Cross-child join: a specialty gate documented as enforced must actually
    // be enforced by the loader, and the runtime must not void off-specialty.
    const cards = rawCards();

    // 1. The catalog must carry gates for cards whose text names a condition,
    //    but ONLY where the gate field is the mechanism that enforces it.
    //
    //    `conditional` effects encode their condition in the description and are
    //    evaluated by effectCondition.ts (parseCondition/evaluateCondition); they
    //    deliberately carry no gate field. `catalog_text` entries do not resolve
    //    at all. So the gate requirement binds only the typed, non-conditional
    //    primitives that rely on passesTypeGate / passesOpponentTypeGate.
    const GATE_BEARING_TYPES: Record<string, true> = {
        atk_mult: true,
        void_enemy_support: true,
    };
    const textGated = cards.filter(
        (c) =>
            c.supportEffect &&
            GATE_BEARING_TYPES[String(c.supportEffect.type ?? "")] === true &&
            typeof c.supportEffect.description === "string" &&
            /specialty is (fire|ice|nature|darkness|dark|rare)/i.test(c.supportEffect.description)
    );
    const missingGate = textGated.filter(
        (c) => !c.supportEffect!.requireType && !c.supportEffect!.requireOpponentType
    );
    if (missingGate.length > 0) {
        fail(
            `${missingGate.length}/${textGated.length} gate-bearing cards name a specialty condition ` +
                `but carry no gate: ` +
                missingGate.map((c) => c.id ?? "?").join(", ")
        );
    }

    // Positive control: the detection above must be able to see a gated card at
    // all, otherwise "no missing gates" could just mean "no textGated cards".
    assert(
        textGated.length > 0,
        "no gate-bearing card text matched the specialty-condition pattern; the probe cannot be trusted"
    );
    assert(
        textGated.some((c) => c.supportEffect!.requireType || c.supportEffect!.requireOpponentType),
        "no gate-bearing card carries a gate, so the missing-gate check has no positive control"
    );

    // 2. The runtime must honour the gate: a Fire owner with an Ice-gated void
    //    must NOT void, and an Ice owner must.
    const iceGated = gatedVoid("Ice", "");
    assert(
        !canVoidEnemySupport(makePlayer("a", "Fire"), iceGated, makePlayer("d", "Fire"), true),
        "Ice-gated void must not fire for a Fire owner"
    );
    assert(
        canVoidEnemySupport(makePlayer("a", "Ice"), iceGated, makePlayer("d", "Fire"), true),
        "Ice-gated void must fire for an Ice owner"
    );

    const darkGated = gatedVoid("", "Dark");
    assert(
        !canVoidEnemySupport(makePlayer("a", "Fire"), darkGated, makePlayer("d", "Fire"), true),
        "Darkness-gated void must not fire against a Fire opponent"
    );
    assert(
        canVoidEnemySupport(makePlayer("a", "Fire"), darkGated, makePlayer("d", "Dark"), true),
        "Darkness-gated void must fire against a Dark opponent"
    );

    // 3. The loaded catalog must preserve the gates through normalization.
    const raw: unknown = JSON.parse(readFileSync("src/data/cards.json", "utf8"));
    const normalized = loadCardCatalog(raw);
    const normalizedGated = normalized.filter(
        (c) => c.supportEffect && (c.supportEffect.requireType || c.supportEffect.requireOpponentType)
    );
    assert(
        normalizedGated.length > 0,
        "the loader dropped every specialty gate during normalization"
    );

    // 4. Docs must not contradict the shipped destination for prep discards.
    const gdd = readFileSync(GDD, "utf8");
    assert(
        !/sends them to the Trash/.test(gdd),
        "GDD.md still routes prep discards to the Trash while the server uses the DP Slot"
    );

    // 5. §2B must be restated as the equal-speed fallback, not a rival authority.
    const supportDoc = readFileSync(DOC_SUPPORT, "utf8");
    assert(
        /equal speed|equal priority|within equal/i.test(supportDoc),
        "docs/2.3 §2B does not state that its class list applies within equal speed/priority"
    );

    console.log(
        `node-1.2 N3 verified (${textGated.length} text-gated cards all carry gates; runtime honours ` +
            `Ice and Darkness gates; GDD discard destination and §2B authority agree with the engine)`
    );
}

async function modeN4(): Promise<void> {
    // Regression: the full unit suite and the fidelity report must stay green.
    const run = (cmd: string, args: string[]): string => {
        try {
            return execFileSync(cmd, args, {
                encoding: "utf8",
                stdio: ["ignore", "pipe", "pipe"],
                maxBuffer: 64 * 1024 * 1024,
            });
        } catch (err: unknown) {
            const e = err as { stdout?: string; stderr?: string };
            const out = `${e.stdout ?? ""}${e.stderr ?? ""}`;
            fail(`${cmd} ${args.join(" ")} failed:\n${out.slice(-4000)}`);
        }
    };

    const vitestOut = run("npx", ["vitest", "run"]);
    const filesMatch = vitestOut.match(/Test Files\s+(\d+) passed/);
    const testsMatch = vitestOut.match(/Tests\s+(\d+) passed/);
    assert(filesMatch, `could not read the vitest file count:\n${vitestOut.slice(-2000)}`);
    assert(testsMatch, `could not read the vitest test count:\n${vitestOut.slice(-2000)}`);
    const files = Number(filesMatch![1]);
    const tests = Number(testsMatch![1]);
    assert(files >= BASELINE_TEST_FILES, `unit test files regressed: ${files} < ${BASELINE_TEST_FILES}`);
    assert(tests >= BASELINE_TESTS, `unit tests regressed: ${tests} < ${BASELINE_TESTS}`);

    const reportOut = run("npx", ["tsx", "scripts/fidelity-report.ts"]);
    assert(!/\[FAIL\]/.test(reportOut), `fidelity report contains failures:\n${reportOut.slice(-3000)}`);
    const passCount = (reportOut.match(/\[PASS\]/g) ?? []).length;
    assert(
        passCount >= BASELINE_SCENARIOS,
        `fidelity scenarios regressed: ${passCount} < ${BASELINE_SCENARIOS}`
    );

    // FC-014 and FC-020 must now be covered (leaf-1.2.3's deliverable).
    const coveredMatch = reportOut.match(/Covered FC IDs \(\d+\): ([^\n]+)/);
    assert(coveredMatch, "the fidelity report did not print a Covered FC IDs line");
    const covered = coveredMatch![1]!;
    for (const fc of ["FC-014", "FC-020"]) {
        assert(
            covered.includes(fc),
            `${fc} is still absent from the covered FC ID set: ${covered}`
        );
    }

    console.log(
        `node-1.2 N4 verified (${files} files / ${tests} tests passed; ${passCount} fidelity scenarios passed; FC-014 and FC-020 covered)`
    );
}

const modes: Record<string, () => Promise<void>> = { N2: modeN2, N3: modeN3, N4: modeN4 };

const mode = process.argv[2];
if (!mode || !modes[mode]) {
    console.error(
        `node-1.2: unimplemented or missing mode ${JSON.stringify(mode)}; expected one of ${Object.keys(modes).join(", ")}`
    );
    process.exit(1);
}

await modes[mode]!();
