#!/usr/bin/env tsx
/**
 * Leaf-1.1.1 oracle — support ordering, the RA-006 tie-break input, and the
 * shipped damage arithmetic order.
 *
 * Usage: npx tsx scripts/verify-resolution-order.ts G1|G2|G3
 *
 * Prints exactly one success marker ("resolution-order <MODE> verified") after
 * every assertion in that mode passes. Exits non-zero with a diagnostic on
 * stderr otherwise. An unimplemented mode is an explicit non-zero failure.
 *
 * @see docs/fidelity-rules-contract.md FC-014, FC-016, FC-018, FC-020, RA-006
 * @see docs/2.3 Support Phase & Conflict Resolution.md §2B
 */

import { readFileSync } from "node:fs";

import { resolveFullBattle, type BattleCombatant } from "../src/lib/battleEffectEngine";
import { compareOrderedEffects, sortEffectsByConflictPolicy } from "../src/lib/effectConflictResolver";
import {
    createSupportBattleContext,
    effectClassPriority,
    effectPriority,
    getAttackDamageBreakdown,
    resolveSupportPhase,
    type AttackType,
    type SupportBattleContext,
} from "../src/lib/supportResolver";
import { CardSchema, PlayerSchema, SupportEffectSchema } from "../src/schema/BattleState";

type Mode = "G1" | "G2" | "G3";

function fail(message: string): never {
    console.error(`resolution-order verification FAILED: ${message}`);
    process.exit(1);
}

function assert(condition: unknown, message: string): never | void {
    if (!condition) fail(message);
}

function makePlayer(sessionId: string, attackEffects: Partial<Record<AttackType, string>> = {}): PlayerSchema {
    const p = new PlayerSchema();
    p.sessionId = sessionId;
    p.hp = 1000;
    const active = new CardSchema();
    active.id = `${sessionId}-active`;
    active.cardKind = "digimon";
    active.type = "Fire";
    active.maxHp = 1000;
    active.hp = 1000;
    active.circle.damage = 400;
    active.triangle.damage = 300;
    active.cross.damage = 200;
    for (const [attack, effectId] of Object.entries(attackEffects)) {
        active[attack as AttackType].effectId = effectId;
    }
    p.active = active;
    return p;
}

function supportCard(
    id: string,
    type: string,
    options: { value?: number; priority?: number; description?: string } = {}
): CardSchema {
    const card = new CardSchema();
    card.id = id;
    card.cardKind = "digimon";
    const se = new SupportEffectSchema();
    se.type = type;
    se.value = options.value ?? 0;
    se.priority = options.priority ?? 0;
    se.description = options.description ?? "";
    card.supportEffect = se;
    return card;
}

function loadCatalog(): {
    supportEffect?: { type: string; priority?: number };
    cardKind?: string;
}[] {
    const raw = JSON.parse(readFileSync("src/data/cards.json", "utf8"));
    const cards = Array.isArray(raw) ? raw : raw.cards;
    if (!Array.isArray(cards)) fail("src/data/cards.json did not yield a card array");
    return cards;
}

/** The battle engine reads `BattleCombatant`, not `PlayerSchema`. */
function toCombatant(player: PlayerSchema): BattleCombatant {
    const active = player.active;
    return {
        sessionId: player.sessionId,
        hp: player.hp,
        maxHp: active?.maxHp ?? player.hp,
        specialty: active?.type ?? "",
        active: active
            ? {
                  circle: { damage: active.circle.damage, effectId: active.circle.effectId },
                  triangle: { damage: active.triangle.damage, effectId: active.triangle.effectId },
                  cross: { damage: active.cross.damage, effectId: active.cross.effectId },
              }
            : null,
    };
}

/**
 * Order-sensitive probe for the *support stack*.
 * The active player plays `hp_set 100` (source.hp = 100); the defender plays
 * `enemy_hp_copy_from_own` (target.hp = source.hp, i.e. active.hp = defender.hp).
 * The two effects share a declared priority and a §2B class, so only the RA-006
 * tie-break decides which lands first, and the surviving HP names that side:
 *
 *   defender's effect first -> copy 1000, then set 100  -> active.hp === 100
 *   active player first     -> set 100, then copy 1000  -> active.hp === 1000
 *
 * Returns the session id whose effect ran first, plus the mutated context.
 */
function runSupportStack(
    activeAttack: AttackType,
    defenderAttack: AttackType,
    activeAttackEffect: string,
    defenderAttackEffect: string,
    supportFirstStrike: { active?: boolean; defender?: boolean } = {}
): { firstRunner: string; firstStrikePlayers: string[] } {
    const active = makePlayer("a", activeAttackEffect ? { [activeAttack]: activeAttackEffect } : {});
    const defender = makePlayer("d", defenderAttackEffect ? { [defenderAttack]: defenderAttackEffect } : {});
    const ctx = createSupportBattleContext();
    if (supportFirstStrike.active) ctx.firstStrikePlayers.add("a");
    if (supportFirstStrike.defender) ctx.firstStrikePlayers.add("d");

    resolveSupportPhase(
        active,
        defender,
        supportCard("a-hp-set", "hp_set", { value: 100, priority: 2 }),
        supportCard("d-hp-copy", "enemy_hp_copy_from_own", { priority: 2 }),
        ctx,
        { activeSessionId: "a", sessionOrder: ["a", "d"] },
        undefined,
        { activeAttack, defenderAttack }
    );

    const firstRunner = active.hp === 100 ? "d" : active.hp === 1000 ? "a" : null;
    if (firstRunner === null) {
        fail(`support-stack probe produced an unreadable result: active.hp=${active.hp}`);
    }
    return { firstRunner, firstStrikePlayers: [...ctx.firstStrikePlayers].sort() };
}

/** Which session the battle engine makes strike first, same inputs as the probe. */
function engineFirstStriker(
    activeAttack: AttackType,
    defenderAttack: AttackType,
    activeAttackEffect: string,
    defenderAttackEffect: string,
    supportFirstStrike: { active?: boolean; defender?: boolean } = {}
): string {
    const ctx = createSupportBattleContext();
    if (supportFirstStrike.active) ctx.firstStrikePlayers.add("a");
    if (supportFirstStrike.defender) ctx.firstStrikePlayers.add("d");
    const battle = resolveFullBattle(
        toCombatant(makePlayer("a", activeAttackEffect ? { [activeAttack]: activeAttackEffect } : {})),
        toCombatant(
            makePlayer("d", defenderAttackEffect ? { [defenderAttack]: defenderAttackEffect } : {})
        ),
        activeAttack,
        defenderAttack,
        "a",
        ctx
    );
    assert(battle.strikes.length > 0, "battle produced no strikes");
    return battle.strikes[0]!.attackerSessionId;
}

/** Attack-power total produced by one compose card carrying both clause kinds. */
function composeTotal(description: string): { base: number; total: number } {
    const active = makePlayer("a");
    const ctx = createSupportBattleContext();
    resolveSupportPhase(
        active,
        makePlayer("d"),
        supportCard("a-compose", "compose", { priority: 4, description }),
        null,
        ctx,
        { activeSessionId: "a", sessionOrder: ["a", "d"] },
        undefined,
        { activeAttack: "circle", defenderAttack: "circle" }
    );
    const breakdown = getAttackDamageBreakdown(active, "circle", ctx);
    return { base: breakdown.baseDamage, total: breakdown.totalDamage };
}

function modeG1(): void {
    // The defect: ctx.firstStrikePlayers was populated only by the support
    // effect, while the engine read the attack slot separately. A defender
    // holding attack.first_strike on its locked attack therefore got engine
    // order d,a but an empty firstStrikePlayers set, so the support stack
    // ordered itself the other way.

    // Positive control: with no first strike anywhere, the active player runs
    // first in both the support stack and the exchange.
    assert(
        runSupportStack("circle", "cross", "", "").firstRunner === "a",
        "control: without first strike the active player's support must run first"
    );
    assert(
        engineFirstStriker("circle", "cross", "", "") === "a",
        "control: without first strike the active player must strike first"
    );

    // The attack slot alone must reach the tie-break, and the engine must agree.
    const attackSlotOnly = runSupportStack("circle", "cross", "", "attack.first_strike");
    assert(
        attackSlotOnly.firstRunner === "d",
        `attack-slot first strike did not reach the support tie-break (first runner was '${attackSlotOnly.firstRunner}', expected 'd')`
    );
    assert(
        engineFirstStriker("circle", "cross", "", "attack.first_strike") === "d",
        "the engine did not honour the defender's attack-slot first strike"
    );
    // `firstStrikePlayers` is the carrier every reader consults; the holder must
    // be in it, not merely implied by a private predicate.
    assert(
        attackSlotOnly.firstStrikePlayers.join(",") === "d",
        `an attack-slot holder is missing from ctx.firstStrikePlayers (got [${attackSlotOnly.firstStrikePlayers.join(",")}], expected [d])`
    );

    // The support-granted source must keep working (it is the other input), and
    // both sources together must be recorded.
    const supportGranted = runSupportStack("circle", "cross", "", "", { defender: true });
    assert(
        supportGranted.firstRunner === "d",
        "support-granted first strike no longer reaches the support tie-break"
    );
    assert(
        supportGranted.firstStrikePlayers.join(",") === "d",
        `the support-granted holder is missing from ctx.firstStrikePlayers (got [${supportGranted.firstStrikePlayers.join(",")}])`
    );

    // The attacker's own attack slot is the mirror case.
    const attackerSlot = runSupportStack("circle", "cross", "attack.first_strike", "");
    assert(
        attackerSlot.firstRunner === "a",
        "the attacker's attack-slot first strike did not reach the support tie-break"
    );
    assert(
        attackerSlot.firstStrikePlayers.join(",") === "a",
        `the attacker's attack-slot holder is missing from ctx.firstStrikePlayers (got [${attackerSlot.firstStrikePlayers.join(",")}])`
    );

    // Absence control: nobody holds first strike, so the carrier stays empty.
    // Without this the "holder is present" probes could not distinguish a
    // correctly populated set from one that records everyone unconditionally.
    assert(
        runSupportStack("circle", "cross", "", "").firstStrikePlayers.length === 0,
        "ctx.firstStrikePlayers records a holder when nobody holds first strike"
    );

    // Full agreement matrix: for every combination of first-strike ownership,
    // the support stack and the battle engine must name the same first runner,
    // and the set must record exactly the owners of either source.
    for (const activeSlot of [false, true]) {
        for (const defenderSlot of [false, true]) {
            for (const activeSupport of [false, true]) {
                for (const defenderSupport of [false, true]) {
                    const activeEffect = activeSlot ? "attack.first_strike" : "";
                    const defenderEffect = defenderSlot ? "attack.first_strike" : "";
                    const label =
                        `attackSlot[a=${activeSlot},d=${defenderSlot}] ` +
                        `support[a=${activeSupport},d=${defenderSupport}]`;
                    const stack = runSupportStack("circle", "cross", activeEffect, defenderEffect, {
                        active: activeSupport,
                        defender: defenderSupport,
                    });
                    const engine = engineFirstStriker("circle", "cross", activeEffect, defenderEffect, {
                        active: activeSupport,
                        defender: defenderSupport,
                    });
                    assert(
                        stack.firstRunner === engine,
                        `support stack and battle engine disagree on the first runner for ${label}: stack=${stack.firstRunner} engine=${engine}`
                    );
                    const expectedOwners = [
                        ...(activeSlot || activeSupport ? ["a"] : []),
                        ...(defenderSlot || defenderSupport ? ["d"] : []),
                    ].sort();
                    assert(
                        stack.firstStrikePlayers.join(",") === expectedOwners.join(","),
                        `ctx.firstStrikePlayers is wrong for ${label}: got [${stack.firstStrikePlayers.join(",")}] expected [${expectedOwners.join(",")}]`
                    );
                }
            }
        }
    }

    console.log(
        "resolution-order G1 verified (attack-slot and support-granted first strike both reach the RA-006 tie-break and are recorded in ctx.firstStrikePlayers; the support stack and the battle engine agree on the first runner in all 16 ownership combinations)"
    );
}

function modeG2(): void {
    // D1: the per-card declared priority (the catalog's canonical `support_speed`)
    // is the authoritative ordering speed. docs/2.3 §2B's class list is restated
    // as the equal-speed fallback, not a competing primary key.

    // (a) Singularity across the whole shipped artifact.
    const cards = loadCatalog();
    const ranked = cards.filter(c => (c.supportEffect?.priority ?? 0) > 0);
    assert(ranked.length > 0, "no catalog card declares a priority to check");
    let classDisagreements = 0;
    for (const card of ranked) {
        const se = card.supportEffect!;
        const declared = se.priority!;
        assert(
            effectPriority(se) === declared,
            `card's ordering speed is not its declared priority: declared=${declared} got=${effectPriority(se)}`
        );
        if (effectClassPriority(se) !== declared) classDisagreements++;
    }
    // Non-vacuous: the artifact genuinely contains declared speeds that
    // contradict the §2B class list, so "declared wins" is a real assertion.
    assert(
        classDisagreements >= 50,
        `only ${classDisagreements} cards disagree with the §2B class list; the singularity check is vacuous`
    );

    // (b) A declared priority beats a contradicting §2B class.
    //     a is the active player but declares the slower speed; the class list
    //     would rank it first, so the two authorities give opposite orders.
    const declaredActive = makePlayer("a");
    const declaredDefender = makePlayer("d");
    resolveSupportPhase(
        declaredActive,
        declaredDefender,
        // hp_heal is §2B class 5 but declares speed 1 here.
        supportCard("a-heal", "hp_heal", { value: 500, priority: 1 }),
        // enemy_hp_set is §2B class 3 and declares the slower speed 2.
        supportCard("d-set", "enemy_hp_set", { value: 100, priority: 2 }),
        createSupportBattleContext(),
        { activeSessionId: "a", sessionOrder: ["a", "d"] },
        undefined,
        { activeAttack: "circle", defenderAttack: "circle" }
    );
    // Declared wins -> heal (1500) then set (100) -> 100.
    // Class wins    -> set (100) then heal (600)     -> 600.
    assert(
        declaredActive.hp === 100,
        `the §2B class list overrode the declared priority (hp=${declaredActive.hp}, expected 100)`
    );

    // (c) Equal declared priority falls back to the §2B class order.
    //     Both declare speed 2; enemy_hp_set is class 3, hp_heal is class 5.
    const classActive = makePlayer("a");
    const classDefender = makePlayer("d");
    resolveSupportPhase(
        classActive,
        classDefender,
        supportCard("a-heal", "hp_heal", { value: 500, priority: 2 }),
        supportCard("d-set", "enemy_hp_set", { value: 100, priority: 2 }),
        createSupportBattleContext(),
        { activeSessionId: "a", sessionOrder: ["a", "d"] },
        undefined,
        { activeAttack: "circle", defenderAttack: "circle" }
    );
    // Class 3 first -> set 100, then heal 500 -> 600.
    // Active-player fallback would heal first -> 1500, then set -> 100.
    assert(
        classActive.hp === 600,
        `equal declared speeds did not fall back to the §2B class order (hp=${classActive.hp}, expected 600)`
    );

    // (d) The RA-006 chain itself, on the shared comparator.
    type Entry = {
        effect: string;
        priority: number;
        classPriority?: number;
        sessionId: string;
        isActivePlayer: boolean;
        hasFirstStrike: boolean;
    };
    const mk = (
        id: string,
        priority: number,
        isActivePlayer: boolean,
        hasFirstStrike: boolean,
        classPriority?: number
    ): Entry => ({ effect: id, priority, classPriority, sessionId: id, isActivePlayer, hasFirstStrike });
    const order = (input: Entry[]): string =>
        sortEffectsByConflictPolicy(input, ["a", "d"])
            .map(e => e.effect)
            .join(",");

    // Step 1: declared speed outranks everything else.
    assert(
        order([mk("d", 1, false, false), mk("a", 4, true, true)]) === "d,a",
        "RA-006 step 1: declared speed must outrank first strike and active-player status"
    );
    // Step 1b: the §2B class only breaks a declared-speed tie.
    assert(
        order([mk("d", 1, false, false, 5), mk("a", 2, true, false, 1)]) === "d,a",
        "RA-006 step 1b: the §2B class must not override a declared-speed difference"
    );
    assert(
        order([mk("a", 2, true, false, 5), mk("d", 2, false, false, 3)]) === "d,a",
        "RA-006 step 1b: equal declared speeds must fall back to the §2B class"
    );
    // Step 2: the 1st-attack owner defers, so the other side runs first.
    assert(
        order([mk("a", 3, true, false, 3), mk("d", 3, false, true, 3)]) === "d,a",
        "RA-006 step 2: equal speed and class must defer to the 1st-attack owner"
    );
    // Step 3: the attacking (active) player runs first.
    assert(
        order([mk("d", 3, false, false, 3), mk("a", 3, true, false, 3)]) === "a,d",
        "RA-006 step 3: equal speed, class and first strike must favour the active player"
    );
    // Step 4: deterministic session order.
    assert(
        order([mk("d", 3, false, false, 3), mk("a", 3, false, false, 3)]) === "a,d",
        "RA-006 step 4: fully equal effects must fall back to session order"
    );
    assert(
        compareOrderedEffects(
            { effect: "x", priority: 3, sessionId: "d", isActivePlayer: false, hasFirstStrike: false },
            { effect: "y", priority: 3, sessionId: "d", isActivePlayer: false, hasFirstStrike: false },
            ["a", "d"]
        ) === 0,
        "RA-006: identical effects must compare as equal"
    );

    console.log(
        `resolution-order G2 verified (${ranked.length} declared speeds authoritative, ${classDisagreements} contradicting the §2B class list, which now serves as the equal-speed fallback)`
    );
}

function modeG3(): void {
    // The shipped arithmetic is (base + flat) * mult, applied unconditionally
    // regardless of clause sequence. §2B classes 3->4 would imply
    // (base * mult) + flat. This gate pins whichever order ships; it does not
    // change the number.

    const combined = composeTotal("Own Attack Power is doubled. Boost own Attack Power +300.");
    assert(combined.base === 400, `unexpected card base AP: ${combined.base}`);
    assert(
        combined.total === 1400,
        `shipped arithmetic changed: expected (400 + 300) * 2 = 1400, got ${combined.total}`
    );
    assert(
        combined.total !== 1100,
        "the shipped arithmetic now follows the §2B class-ordered reading (400 * 2 + 300 = 1100)"
    );

    // Same number with the clause text reversed: the result comes from the
    // formula, not from clause sequencing.
    const reversed = composeTotal("Boost own Attack Power +300. Own Attack Power is doubled.");
    assert(
        reversed.total === 1400,
        `reversing the compose clause text changed the total: ${reversed.total}`
    );

    // Pin the formula shape on independent operands, including a sub-1 multiplier
    // where the two readings genuinely differ.
    const cases: { description: string; expected: number; classOrdered: number }[] = [
        { description: "Own Attack Power is tripled.", expected: 1200, classOrdered: 1200 },
        {
            description: "Boost own Attack Power +100.",
            expected: 500,
            classOrdered: 500,
        },
        {
            description: "Own Attack Power is halved. Boost own Attack Power +100.",
            expected: 250,
            classOrdered: 300,
        },
        {
            description: "Own Attack Power is tripled. Boost own Attack Power +300.",
            expected: 2100,
            classOrdered: 1500,
        },
    ];
    for (const { description, expected, classOrdered } of cases) {
        const { total } = composeTotal(description);
        assert(
            total === expected,
            `"${description}" expected ${expected}, got ${total}`
        );
        if (expected !== classOrdered) {
            assert(
                total !== classOrdered,
                `"${description}" now matches the class-ordered reading (${classOrdered})`
            );
        }
    }

    // Caution from the ledger: effects owned by different players do not compose.
    // x2 on the defender and +300 on the attacker measured 800 (the multiplier
    // alone) — that is not evidence about arithmetic order, so the gate asserts
    // the non-composition rather than reading a number from it.
    const attacker = makePlayer("a");
    const defender = makePlayer("d");
    const splitCtx: SupportBattleContext = createSupportBattleContext();
    resolveSupportPhase(
        attacker,
        defender,
        supportCard("a-flat", "atk_buff", { value: 300, priority: 4 }),
        supportCard("d-mult", "atk_mult", { value: 2, priority: 3 }),
        splitCtx,
        { activeSessionId: "a", sessionOrder: ["a", "d"] },
        undefined,
        { activeAttack: "circle", defenderAttack: "circle" }
    );
    const attackerDamage = getAttackDamageBreakdown(attacker, "circle", splitCtx);
    const defenderDamage = getAttackDamageBreakdown(defender, "circle", splitCtx);
    assert(
        attackerDamage.totalDamage === 700 && defenderDamage.totalDamage === 800,
        `cross-player clauses composed unexpectedly: attacker=${attackerDamage.totalDamage} defender=${defenderDamage.totalDamage}`
    );
    assert(
        attackerDamage.baseDamage === 400 && attackerDamage.bonusDamage === 300,
        `breakdown no longer reports the raw card base plus the support delta: ${JSON.stringify(attackerDamage)}`
    );

    console.log(
        "resolution-order G3 verified (shipped (base + flat) * mult pinned: 400 with x2 and +300 yields 1400, not 1100)"
    );
}

const modes: Record<Mode, () => void> = { G1: modeG1, G2: modeG2, G3: modeG3 };

const mode = process.argv[2] as Mode | undefined;
if (!mode || !Object.prototype.hasOwnProperty.call(modes, mode)) {
    console.error(
        `resolution-order: unimplemented or missing mode ${JSON.stringify(mode)}; expected one of ${Object.keys(modes).join(", ")}`
    );
    process.exit(1);
}

modes[mode]!();
