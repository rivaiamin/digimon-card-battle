#!/usr/bin/env tsx
/**
 * Branch integration oracle for node-1.1 (engine semantics).
 *
 * Integrates leaf-1.1.1 (support ordering + tie-break) and leaf-1.1.2 (option
 * resolution integrity). Owned by the node-1.1 ledger; implements N-modes only.
 *
 * Usage: npx tsx scripts/verify-node-1.1.ts N2|N3|N4
 *
 * Prints exactly one success marker ("node-1.1 <MODE> verified") after every
 * assertion in that mode passes. Exits non-zero with a diagnostic otherwise.
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

import type { BattleCombatant } from "../src/lib/battleEffectEngine";
import { resolveFullBattle } from "../src/lib/battleEffectEngine";
import { loadCardCatalog } from "../src/lib/cardCatalogLoader";
import { sortEffectsByConflictPolicy } from "../src/lib/effectConflictResolver";
import { applyBattleOptionToContext } from "../src/lib/optionResolver";
import type { SupportBattleContext } from "../src/lib/supportResolver";
import { createSupportBattleContext, resolveSupportPhase } from "../src/lib/supportResolver";
import { CardSchema, PlayerSchema, SupportEffectSchema } from "../src/schema/BattleState";
import type { EffectArgs } from "../src/types";

type Mode = "N2" | "N3" | "N4";

/** Baseline measured at plan time; the suite may only grow. */
const BASELINE_TEST_FILES = 32;
const BASELINE_TESTS = 278;
const BASELINE_SCENARIOS = 38;

function fail(message: string): never {
    console.error(`node-1.1 verification FAILED: ${message}`);
    process.exit(1);
}

function assert(condition: unknown, message: string): void {
    if (!condition) fail(message);
}

type RawCard = {
    id: string;
    name?: string;
    cardKind?: string;
    effectId?: string;
    effectArgs?: Record<string, unknown>;
    supportEffect?: {
        type?: string;
        value?: number;
        targetAttack?: string;
        description?: string;
        requireType?: string;
        requireOpponentType?: string;
        priority?: number;
    } | null;
};

/**
 * The server never consumes cards.json directly: `loadCardCatalog` normalizes
 * raw supportEffect text into mechanical types and effect ids first. Comparing
 * the two resolution paths on RAW cards measures a divergence that does not
 * exist in the running game, so the probe must use the normalized catalog.
 */
function loadCatalog(): RawCard[] {
    const raw: unknown = JSON.parse(readFileSync("src/data/cards.json", "utf8"));
    const cards: unknown = Array.isArray(raw)
        ? raw
        : raw && typeof raw === "object" && "cards" in raw
          ? raw.cards
          : [];
    const normalized = loadCardCatalog(cards);
    if (normalized.length === 0) fail("normalized card catalog was empty");
    // NormalizedCardCatalogEntry is structurally a superset of RawCard for the
    // fields this oracle reads; the cast keeps the probe typed without
    // re-declaring the loader's full shape.
    return normalized as unknown as RawCard[];
}

function makePlayer(sessionId: string, specialty = "Fire", crossEffectId = ""): PlayerSchema {
    const player = new PlayerSchema();
    player.sessionId = sessionId;
    player.hp = 1000;
    const active = new CardSchema();
    active.id = `${sessionId}-active`;
    active.cardKind = "digimon";
    active.type = specialty;
    active.maxHp = 1000;
    active.hp = 1000;
    active.circle.damage = 400;
    active.triangle.damage = 300;
    active.cross.damage = 200;
    active.cross.effectId = crossEffectId;
    player.active = active;
    return player;
}

function supportFrom(raw: NonNullable<RawCard["supportEffect"]>): SupportEffectSchema {
    const se = new SupportEffectSchema();
    se.type = raw.type ?? "";
    se.value = raw.value ?? 0;
    se.targetAttack = raw.targetAttack ?? "";
    se.description = raw.description ?? "";
    se.requireType = raw.requireType ?? "";
    se.requireOpponentType = raw.requireOpponentType ?? "";
    se.priority = raw.priority ?? 0;
    return se;
}

function supportCard(raw: NonNullable<RawCard["supportEffect"]>): CardSchema {
    const card = new CardSchema();
    card.id = "support";
    card.cardKind = "digimon";
    card.supportEffect = supportFrom(raw);
    return card;
}

/** Sum of the additive attack bonus a context recorded for one player. */
function bonusTotal(ctx: SupportBattleContext, sessionId: string): number {
    const bonus = ctx.attackBonus.get(sessionId);
    if (!bonus) return 0;
    return bonus.circle + bonus.triangle + bonus.cross;
}

/** Mirrors BattleRoom.toBattleCombatant so the oracle feeds the engine the same shape. */
function toCombatant(player: PlayerSchema): BattleCombatant {
    const active = player.active;
    return {
        sessionId: player.sessionId,
        hp: player.hp,
        maxHp: active?.maxHp ?? player.hp,
        specialty: active?.type ?? "",
        active: active
            ? {
                  circle: {
                      damage: active.circle.damage,
                      effectId: active.circle.effectId,
                      effectArgsJson: active.circle.effectArgsJson,
                  },
                  triangle: {
                      damage: active.triangle.damage,
                      effectId: active.triangle.effectId,
                      effectArgsJson: active.triangle.effectArgsJson,
                  },
                  cross: {
                      damage: active.cross.damage,
                      effectId: active.cross.effectId,
                      effectArgsJson: active.cross.effectArgsJson,
                  },
              }
            : null,
    };
}

async function modeN2(): Promise<void> {
    // Interface gate: the option path and the support path must route the same
    // card to the same primitive. The defect this branch exists to prevent is
    // two dispatch tables disagreeing about which primitive applies.
    //
    // Both children have now landed, so this gate covers EVERY claimed-
    // implemented option card, conditional ones included. The option path is
    // handed the same runtime BattleRoom hands it (source/target/locked
    // attacks); without that runtime a conditional card legitimately cannot
    // resolve, so omitting it would under-test rather than expose a defect.
    const cards = loadCatalog();
    const candidates = cards.filter(
        (c) =>
            c.cardKind === "option" &&
            c.effectId &&
            c.supportEffect &&
            typeof c.supportEffect.description === "string" &&
            c.supportEffect.description.trim().length > 0
    );
    assert(candidates.length > 0, "no claimed-implemented option card found to compare");

    let compared = 0;
    const disagreements: string[] = [];
    for (const card of candidates) {
        const rawSupport = card.supportEffect;
        assert(rawSupport, `card ${card.id} lost its supportEffect`);

        // Path A: as a Digimon support (supportResolver.applySingleEffect).
        const ctxA = createSupportBattleContext();
        const activeA = makePlayer("a");
        const defenderA = makePlayer("d");
        resolveSupportPhase(
            activeA,
            defenderA,
            supportCard(rawSupport),
            null,
            ctxA,
            { activeSessionId: "a", sessionOrder: ["a", "d"] },
            undefined,
            { activeAttack: "circle", defenderAttack: "circle" }
        );

        // Path B: as a battle option, with the same runtime the room supplies.
        const ctxB = createSupportBattleContext();
        const activeB = makePlayer("a");
        const defenderB = makePlayer("d");
        const hpTarget = { hp: activeB.hp, maxHp: activeB.active?.maxHp ?? activeB.hp };
        applyBattleOptionToContext(
            {
                id: card.id,
                cardKind: card.cardKind ?? "option",
                effectId: card.effectId ?? "",
                effectArgs: (card.effectArgs ?? {}) as EffectArgs,
                supportEffect: rawSupport,
            },
            "a",
            ctxB,
            hpTarget,
            {
                source: activeB,
                target: defenderB,
                sourceAttack: "circle",
                targetAttack: "circle",
            }
        );

        const totalA = bonusTotal(ctxA, "a");
        const totalB = bonusTotal(ctxB, "a");
        compared++;
        if (totalA !== totalB) {
            disagreements.push(
                `card ${card.id} ${card.name ?? ""}: support-path +${totalA} vs option-path +${totalB}`
            );
        }
    }

    assert(compared > 0, "no card reached the comparison");
    if (disagreements.length > 0) {
        fail(
            `${disagreements.length}/${compared} option cards resolve differently on the two paths:\n  ` +
                disagreements.slice(0, 8).join("\n  ")
        );
    }

    console.log(
        `node-1.1 N2 verified (all ${compared} claimed-implemented option cards route identically on both paths)`
    );
}

async function modeN3(): Promise<void> {
    // End-to-end: support resolution feeds the battle engine and the resulting
    // strike order follows the ordering authority D1 selected.
    const ctx = createSupportBattleContext();
    const attacker = makePlayer("a");
    const defender = makePlayer("d");
    resolveSupportPhase(
        attacker,
        defender,
        supportCard({
            type: "first_strike",
            value: 0,
            targetAttack: "",
            description: "Attack first.",
            requireType: "",
            requireOpponentType: "",
            priority: 1,
        }),
        null,
        ctx,
        { activeSessionId: "a", sessionOrder: ["a", "d"] },
        undefined,
        { activeAttack: "circle", defenderAttack: "circle" }
    );

    assert(
        ctx.firstStrikePlayers.has("a"),
        "support-granted first strike did not register in the context"
    );

    const battle = resolveFullBattle(toCombatant(attacker), toCombatant(defender), "circle", "circle", "a", ctx);
    assert(battle.strikes.length > 0, "battle produced no strikes");
    const firstStriker = battle.strikes[0]!.attackerSessionId;
    assert(firstStriker === "a", `first strike should let 'a' hit first, got '${firstStriker}'`);

    // The attack-slot source must reach the same conclusion (the leaf-1.1.1 fix).
    const ctx2 = createSupportBattleContext();
    const attacker2 = makePlayer("a");
    const defender2 = makePlayer("d", "Fire", "attack.first_strike");
    resolveSupportPhase(
        attacker2,
        defender2,
        null,
        null,
        ctx2,
        { activeSessionId: "a", sessionOrder: ["a", "d"] },
        undefined,
        { activeAttack: "circle", defenderAttack: "cross" }
    );
    const battle2 = resolveFullBattle(toCombatant(attacker2), toCombatant(defender2), "circle", "cross", "a", ctx2);
    assert(battle2.strikes.length > 0, "attack-slot battle produced no strikes");
    const first2 = battle2.strikes[0]!.attackerSessionId;
    assert(first2 === "d", `attack-slot first strike should let 'd' hit first, got '${first2}'`);

    // The integration consequence of leaf-1.1.1's fix: an attack-slot first
    // strike must also reach the CONFLICT-ORDERING input, not only the engine's
    // own strike ordering. Before the fix the engine read the attack slot
    // directly while ctx.firstStrikePlayers stayed empty, so the RA-006
    // tie-break ran blind to a first-strike holder.
    assert(
        ctx2.firstStrikePlayers.has("d"),
        "an attack-slot first-strike holder did not reach the RA-006 tie-break input " +
            "(ctx.firstStrikePlayers is empty), so equal-priority effects cannot defer to it"
    );

    await assertOrderingChain();
    console.log(
        "node-1.1 N3 verified (first strike reorders the exchange; RA-006 chain: priority, first-strike owner, active player, session order)"
    );
}

/** RA-006 ordering chain: priority -> 1st-attack owner -> active player -> session order. */
async function assertOrderingChain(): Promise<void> {
    const sessionOrder = ["a", "d"];
    type Entry = {
        effect: string;
        priority: number;
        sessionId: string;
        isActivePlayer: boolean;
        hasFirstStrike: boolean;
    };
    const mk = (
        id: string,
        priority: number,
        isActivePlayer: boolean,
        hasFirstStrike: boolean
    ): Entry => ({ effect: id, priority, sessionId: id, isActivePlayer, hasFirstStrike });

    const order = (input: Entry[]): string =>
        sortEffectsByConflictPolicy(input, sessionOrder)
            .map((e) => e.effect)
            .join(",");

    // 1. Priority is the primary key: a lower-priority effect runs first even
    //    when the other side is the active player and holds first strike.
    assert(
        order([mk("d", 1, false, false), mk("a", 4, true, true)]) === "d,a",
        "priority must outrank first strike and active-player status"
    );

    // 2. Equal priority: the 1st-attack owner defers, so the other side runs first.
    assert(
        order([mk("a", 3, true, false), mk("d", 3, false, true)]) === "d,a",
        "equal priority must defer to the 1st-attack owner"
    );

    // 3. Equal priority, no first strike: the active player runs first.
    assert(
        order([mk("d", 3, false, false), mk("a", 3, true, false)]) === "a,d",
        "equal priority without first strike must favour the active player"
    );

    // 4. Fully equal: deterministic session order decides.
    assert(
        order([mk("d", 3, false, false), mk("a", 3, false, false)]) === "a,d",
        "fully equal effects must fall back to session order"
    );
}

async function modeN4(): Promise<void> {
    // Regression: the full unit suite and the fidelity report must stay green
    // across the joined work.
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

    console.log(
        `node-1.1 N4 verified (${files} files / ${tests} tests passed; ${passCount} fidelity scenarios passed)`
    );
}

const modes: Record<string, () => Promise<void>> = { N2: modeN2, N3: modeN3, N4: modeN4 };

const mode = process.argv[2];
if (!mode || !modes[mode]) {
    console.error(
        `node-1.1: unimplemented or missing mode ${JSON.stringify(mode)}; expected one of ${Object.keys(modes).join(", ")}`
    );
    process.exit(1);
}

await modes[mode]!();
