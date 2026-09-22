#!/usr/bin/env tsx
/**
 * Leaf-1.2.1 oracle — catalog specialty gates.
 *
 * Usage: npx tsx scripts/verify-specialty-gates.ts G1|G2|G3
 *
 * Prints exactly one success marker ("specialty-gates <MODE> verified") after
 * every assertion in that mode passes. Exits non-zero with a diagnostic on
 * stderr otherwise. An unknown/unimplemented mode is an explicit failure.
 *
 * G1  gated support cards keep their gate through load and do not void off-specialty
 * G2  every card whose text names a specialty condition carries the matching gate
 * G3  the catalog generator is either reproducible or its unrunnability is recorded
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

import cardsData from "../src/data/cards.json";
import { loadCardCatalog, type NormalizedCardCatalogEntry } from "../src/lib/cardCatalogLoader";
import { parseCondition, splitConditional } from "../src/lib/effectCondition";
import { normalizeSpecialtyLabel } from "../src/lib/effectTextNormalize";
import {
    canVoidEnemySupport,
    createSupportBattleContext,
    evaluateSupportNullification,
    resolveSupportPhase,
} from "../src/lib/supportResolver";
import { CardSchema, PlayerSchema, SupportEffectSchema } from "../src/schema/BattleState";
import { BattleRoom } from "../src/rooms/BattleRoom";

type Mode = "G1" | "G2" | "G3";

function fail(message: string): never {
    console.error(`specialty-gates verification FAILED: ${message}`);
    process.exit(1);
}

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) fail(message);
}

const CATALOG_PATH = "src/data/cards.json";

type RawSupport = {
    type?: string;
    targetAttack?: string;
    value?: number;
    description?: string;
    requireType?: string;
    requireOpponentType?: string;
    priority?: number;
};

type RawCard = {
    id: string;
    name?: string;
    cardKind?: string;
    type?: string;
    supportEffect?: RawSupport | null;
};

const RAW = cardsData as unknown as RawCard[];
const LOADED = loadCardCatalog(cardsData as unknown[]);

/** The real runtime card build (`BattleRoom.toSchemaCard`), reached without a room server. */
type RuntimeRoom = { toSchemaCard(raw: NormalizedCardCatalogEntry, instanceId: string): CardSchema };
let runtimeRoom: RuntimeRoom | null = null;
function room(): RuntimeRoom {
    runtimeRoom ??= new BattleRoom() as unknown as RuntimeRoom;
    return runtimeRoom;
}

/** Distinct specialty labels actually used by the catalog (Fire/Ice/Nature/Dark/Rare). */
const SPECIALTIES = [...new Set(LOADED.map(c => c.type).filter(Boolean))];

function otherSpecialty(not: string): string {
    const found = SPECIALTIES.find(s => normalizeSpecialtyLabel(s) !== normalizeSpecialtyLabel(not));
    assert(found, `catalog has no specialty distinct from "${not}"`);
    return found;
}

function makePlayer(sessionId: string, specialty: string): PlayerSchema {
    const player = new PlayerSchema();
    player.sessionId = sessionId;
    player.hp = 2000;
    const active = new CardSchema();
    active.id = `${sessionId}-active`;
    active.cardKind = "digimon";
    active.type = specialty;
    active.maxHp = 2000;
    active.hp = 2000;
    active.circle.damage = 400;
    active.triangle.damage = 300;
    active.cross.damage = 200;
    player.active = active;
    return player;
}

/** A plain, ungated support buff used as the victim of a void. */
function plainSupportCard(id: string): CardSchema {
    const card = new CardSchema();
    card.id = id;
    card.cardKind = "digimon";
    const se = new SupportEffectSchema();
    se.type = "atk_buff";
    se.targetAttack = "all";
    se.value = 500;
    se.description = "Boost own Attack Power +500.";
    card.supportEffect = se;
    return card;
}

function loadedById(id: string): NormalizedCardCatalogEntry {
    const found = LOADED.find(c => c.id === id);
    assert(found, `catalog card ${id} is missing from the loaded catalog`);
    return found;
}

function rawById(id: string): RawCard {
    const found = RAW.find(c => c.id === id);
    assert(found, `catalog card ${id} is missing from src/data/cards.json`);
    return found;
}

// ---------------------------------------------------------------------------
// G1 — gate survives load; gated void does not fire off-specialty
// ---------------------------------------------------------------------------

/** Every card carrying a gate in the raw artifact. */
function rawGatedCards(): { raw: RawCard; field: "requireType" | "requireOpponentType"; value: string }[] {
    const out: { raw: RawCard; field: "requireType" | "requireOpponentType"; value: string }[] = [];
    for (const raw of RAW) {
        for (const field of ["requireType", "requireOpponentType"] as const) {
            const value = raw.supportEffect?.[field];
            if (typeof value === "string" && value.trim().length > 0) {
                out.push({ raw, field, value });
            }
        }
    }
    return out;
}

function modeG1(): string[] {
    const gated = rawGatedCards();
    assert(gated.length > 0, "no gated support card found in src/data/cards.json");

    // 1. The gate survives the catalog loader unchanged.
    for (const { raw, field, value } of gated) {
        const loaded = loadedById(raw.id).supportEffect;
        assert(loaded, `card ${raw.id} lost its supportEffect during load`);
        const actual = loaded[field];
        assert(
            normalizeSpecialtyLabel(actual) === normalizeSpecialtyLabel(value),
            `card ${raw.id} ${field} did not survive load: raw "${value}" -> loaded "${actual}"`
        );
    }

    // 2. The gate survives the runtime schema-card build.
    for (const { raw, field, value } of gated) {
        const card = room().toSchemaCard(loadedById(raw.id), `${raw.id}-instance`);
        const actual = card.supportEffect?.[field] ?? "";
        assert(
            normalizeSpecialtyLabel(actual) === normalizeSpecialtyLabel(value),
            `card ${raw.id} ${field} did not survive toSchemaCard: expected "${value}", got "${actual}"`
        );
    }

    // 3. The measured regression: commit 7657c41 dropped these two gates while
    //    keeping the gating text, so both cards voided unconditionally.
    const measured: [string, "requireType" | "requireOpponentType", string][] = [
        ["036", "requireType", "Ice"],
        ["152", "requireOpponentType", "Dark"],
    ];
    for (const [id, field, expected] of measured) {
        const rawValue = rawById(id).supportEffect?.[field] ?? "";
        assert(
            normalizeSpecialtyLabel(rawValue) === normalizeSpecialtyLabel(expected),
            `card ${id} must carry ${field}:"${expected}" (it kept the gating text but lost the gate); got "${rawValue}"`
        );
        const schemaValue = room().toSchemaCard(loadedById(id), `${id}-instance`).supportEffect?.[field] ?? "";
        assert(
            normalizeSpecialtyLabel(schemaValue) === normalizeSpecialtyLabel(expected),
            `card ${id} ${field} reached the runtime schema as "${schemaValue}", expected "${expected}"`
        );
    }

    // 4. Behavior: a gated void must not fire when either gate is violated, and
    //    must fire when both hold. 043 (ungated) is the positive control that
    //    proves the harness can observe a void at all.
    const gatedVoidIds = new Set(gated.map(g => g.raw.id));
    const gatedVoidCards = [...gatedVoidIds]
        .map(loadedById)
        .filter(c => c.supportEffect?.type === "void_enemy_support");
    assert(gatedVoidCards.length > 0, "no gated void_enemy_support card found to probe");

    const control = loadedById("043");
    assert(
        control.supportEffect?.type === "void_enemy_support",
        "positive control card 043 is no longer an ungated void"
    );
    assert(
        !control.supportEffect.requireType && !control.supportEffect.requireOpponentType,
        "positive control card 043 must stay ungated"
    );
    assert(
        voidsFrom(control, SPECIALTIES[0]!, SPECIALTIES[0]!),
        "positive control failed: an ungated void must nullify in this harness"
    );

    let probes = 0;
    for (const entry of gatedVoidCards) {
        const effect = entry.supportEffect!;
        const reqT = effect.requireType;
        const reqO = effect.requireOpponentType;
        const goodOwner = reqT || SPECIALTIES[0]!;
        const goodOpp = reqO || SPECIALTIES[0]!;

        // On-specialty: the exported primitive must allow the void.
        assert(
            canVoidEnemySupport(makePlayer("owner", goodOwner), effect, makePlayer("opponent", goodOpp), true),
            `card ${entry.id} stopped voiding when both of its gates hold (owner ${goodOwner}, opponent ${goodOpp})`
        );
        probes++;

        // Off-specialty on either gate: it must refuse.
        if (reqT) {
            const badOwner = otherSpecialty(reqT);
            assert(
                !canVoidEnemySupport(
                    makePlayer("owner", badOwner),
                    effect,
                    makePlayer("opponent", goodOpp),
                    true
                ),
                `card ${entry.id} voided with a ${badOwner} owner although its text requires ${reqT}`
            );
            probes++;
        }
        if (reqO) {
            const badOpp = otherSpecialty(reqO);
            assert(
                !canVoidEnemySupport(
                    makePlayer("owner", goodOwner),
                    effect,
                    makePlayer("opponent", badOpp),
                    true
                ),
                `card ${entry.id} voided a ${badOpp} opponent although its text requires ${reqO}`
            );
            probes++;
        }

        // Control: the gate field is what decides. Stripping it in memory must
        // flip the same off-specialty probe to "voids".
        const stripped: NormalizedCardCatalogEntry = {
            ...entry,
            supportEffect: { ...effect, requireType: "", requireOpponentType: "" },
        };
        const offSpecialty = otherSpecialty(reqT || reqO || SPECIALTIES[0]!);
        assert(
            voidsFrom(stripped, offSpecialty, offSpecialty),
            `control failed: card ${entry.id} with its gate stripped still did not void, so the probe does not observe the gate`
        );
    }

    // 5. End-to-end through resolveSupportPhase for every gated void card: the
    //    off-specialty void must leave the opponent's support intact, the
    //    on-specialty void must nullify it.
    for (const entry of gatedVoidCards) {
        const effect = entry.supportEffect!;
        const goodOwner = effect.requireType || SPECIALTIES[0]!;
        const goodOpp = effect.requireOpponentType || SPECIALTIES[0]!;
        const badOwner = effect.requireType ? otherSpecialty(effect.requireType) : goodOwner;
        const badOpp = effect.requireOpponentType ? otherSpecialty(effect.requireOpponentType) : goodOpp;

        const off = endToEndVoid(entry, badOwner, badOpp);
        assert(
            !off.defenderVoided,
            `card ${entry.id} voided a ${badOpp} opponent's support with a ${badOwner} owner end-to-end`
        );
        assert(
            off.defenderSupportIntact,
            `card ${entry.id} nullified the defender's support card off-specialty end-to-end`
        );

        const on = endToEndVoid(entry, goodOwner, goodOpp);
        assert(
            on.defenderVoided,
            `card ${entry.id} failed to void with a ${goodOwner} owner against a ${goodOpp} opponent end-to-end`
        );
        assert(
            !on.defenderSupportIntact,
            `card ${entry.id} did not nullify the defender's support card on-specialty end-to-end`
        );
    }

    // 6. A gate on a non-void effect is enforced by the same support path
    //    (`resolveSupportPhase` enqueues through both gates). 008 is the
    //    in-catalog card for this: an atk_mult whose Fire gate must not apply
    //    off-specialty. Only attack-multiplier cards are probed this way; any
    //    other gated non-void type is counted, not silently skipped.
    const gatedNonVoid = [...new Set(gated.map(g => g.raw.id))]
        .map(loadedById)
        .filter(c => c.supportEffect && c.supportEffect.type !== "void_enemy_support");
    const probed = gatedNonVoid.filter(c => c.supportEffect!.type === "atk_mult");
    assert(
        probed.some(c => c.id === "008"),
        "card 008 (gated atk_mult) is no longer in scope of the non-void gate probe"
    );
    for (const entry of probed) {
        const effect = entry.supportEffect!;
        const required = effect.requireType || effect.requireOpponentType;
        assert(required, `gated card ${entry.id} carries no gate value to probe`);
        const badOwner = otherSpecialty(required);
        const onSpecialty = attackDamageWithSupport(entry, required, required);
        const offSpecialty = attackDamageWithSupport(entry, badOwner, required);
        assert(
            onSpecialty > offSpecialty,
            `card ${entry.id} applied its ${required}-gated effect to a ${badOwner} owner ` +
                `(on-specialty damage ${onSpecialty}, off-specialty ${offSpecialty})`
        );
    }

    return [
        `  gated cards in artifact: ${gated.length} (${gated
            .map(g => `${g.raw.id}:${g.field}=${g.value}`)
            .join(", ")})`,
        `  gate preserved through load and toSchemaCard for every gated card`,
        `  behavioral probes: ${probes} on ${gatedVoidCards.length} gated void card(s) + 043 ungated control; ` +
            `${probed.length}/${gatedNonVoid.length} gated non-void card(s) probed via the support path`,
    ];
}

function voidsFrom(entry: NormalizedCardCatalogEntry, ownerType: string, opponentType: string): boolean {
    const owner = makePlayer("owner", ownerType);
    const opponent = makePlayer("opponent", opponentType);
    const ownerSupport = room().toSchemaCard(entry, "owner-support");
    const opponentSupport = plainSupportCard("opponent-support");
    return evaluateSupportNullification(owner, opponent, ownerSupport, opponentSupport).defenderVoided;
}

/** Total attack power a gated non-void support produces for its owner. */
function attackDamageWithSupport(
    entry: NormalizedCardCatalogEntry,
    ownerType: string,
    opponentType: string
): number {
    const owner = makePlayer("owner", ownerType);
    const opponent = makePlayer("opponent", opponentType);
    const ctx = createSupportBattleContext();
    resolveSupportPhase(
        owner,
        opponent,
        room().toSchemaCard(entry, "owner-support"),
        null,
        ctx,
        { activeSessionId: "owner", sessionOrder: ["owner", "opponent"] },
        undefined,
        { activeAttack: "circle", defenderAttack: "circle" }
    );
    const multiplier = ctx.attackMultiplier.get("owner") ?? { circle: 1, triangle: 1, cross: 1 };
    const bonus = ctx.attackBonus.get("owner") ?? { circle: 0, triangle: 0, cross: 0 };
    return (400 + bonus.circle) * multiplier.circle;
}

function endToEndVoid(
    entry: NormalizedCardCatalogEntry,
    ownerType: string,
    opponentType: string
): { defenderVoided: boolean; defenderSupportIntact: boolean } {
    const owner = makePlayer("owner", ownerType);
    const opponent = makePlayer("opponent", opponentType);
    const ownerSupport = room().toSchemaCard(entry, "owner-support");
    const opponentSupport = plainSupportCard("opponent-support");
    opponent.supportCard = opponentSupport;

    const result = resolveSupportPhase(
        owner,
        opponent,
        ownerSupport,
        opponentSupport,
        createSupportBattleContext(),
        { activeSessionId: "owner", sessionOrder: ["owner", "opponent"] },
        undefined,
        { activeAttack: "circle", defenderAttack: "circle" }
    );

    return {
        defenderVoided: result.defenderVoided,
        defenderSupportIntact: opponent.supportCard !== null,
    };
}

// ---------------------------------------------------------------------------
// G2 — structural guard driven from card text
// ---------------------------------------------------------------------------

/**
 * Effect types the resolver re-parses `description` for at resolution time
 * (`applySingleEffect` handles `compose` and `conditional` before its primitive
 * switch). Every other type ignores the "If <specialty>, …" head entirely, so
 * the head is enforced only when a gate field carries it.
 */
const EVALUATES_DESCRIPTION: Record<string, true> = { conditional: true, compose: true };

type SpecialtyGate = { field: "requireType" | "requireOpponentType"; expected: string };

/**
 * The gate a card's text demands, parsed with the runtime's own condition parser
 * (never a hand-written regex). Returns null for heads a single gate field
 * cannot express: `opponent_specialty_in` (a two-specialty OR) and
 * `opponent_specialty_not` (an inequality).
 */
function specialtyGateFromText(description: string): SpecialtyGate | null {
    const split = splitConditional(description);
    if (!split) return null;
    const condition = parseCondition(split.head);
    if (!condition) return null;
    if (condition.kind === "own_specialty_is") {
        return { field: "requireType", expected: normalizeSpecialtyLabel(condition.specialty) };
    }
    if (condition.kind === "opponent_specialty_is") {
        return { field: "requireOpponentType", expected: normalizeSpecialtyLabel(condition.specialty) };
    }
    return null;
}

/** True when the head names a specialty but no single gate field can carry it. */
function specialtyHeadIsUngateable(description: string): boolean {
    const split = splitConditional(description);
    if (!split) return false;
    const condition = parseCondition(split.head);
    if (!condition) return false;
    return condition.kind === "opponent_specialty_in" || condition.kind === "opponent_specialty_not";
}

/**
 * Independent text scan for a specialty gate head — deliberately NOT the runtime
 * parser. If the parser ever stops recognizing a gate this regex still sees, the
 * guard would otherwise report a valid absence. Kept in sync with the catalog's
 * own vocabulary ("own/opponent's/foe's Specialty is [not] <word> [or <word>]").
 */
const SPECIALTY_GATE_HEAD_RE =
    /^if\s+(?:own|opponent'?s|foe'?s)\s+specialty\s+is\s+(?:not\s+)?(?:fire|ice|nature|dark(?:ness)?|rare)(?:\s+or\s+(?:fire|ice|nature|dark(?:ness)?|rare))?\s*,/i;

function crossCheckGateDetection(catalog: readonly NormalizedCardCatalogEntry[]): void {
    const viaParser: string[] = [];
    const viaScan: string[] = [];
    for (const entry of catalog) {
        const description = entry.supportEffect?.description;
        if (!description) continue;
        const split = splitConditional(description);
        const condition = split ? parseCondition(split.head) : null;
        const parsed =
            condition !== null &&
            (condition.kind === "own_specialty_is" ||
                condition.kind === "opponent_specialty_is" ||
                condition.kind === "opponent_specialty_not" ||
                condition.kind === "opponent_specialty_in");
        if (parsed) viaParser.push(entry.id);
        if (SPECIALTY_GATE_HEAD_RE.test(description)) viaScan.push(entry.id);
    }
    const parserOnly = viaParser.filter(id => !viaScan.includes(id));
    const scanOnly = viaScan.filter(id => !viaParser.includes(id));
    if (parserOnly.length > 0 || scanOnly.length > 0) {
        fail(
            `the condition parser and an independent text scan disagree about which cards gate on specialty ` +
                `(parser-only: [${parserOnly.join(", ")}]; scan-only: [${scanOnly.join(", ")}]). ` +
                `Fix the parser before trusting the absence assertion.`
        );
    }
    if (viaParser.length === 0) fail("no specialty gate head found by either probe");
}

function gateViolations(catalog: readonly NormalizedCardCatalogEntry[]): string[] {
    const violations: string[] = [];
    for (const entry of catalog) {
        const effect = entry.supportEffect;
        if (!effect?.description) continue;
        const gate = specialtyGateFromText(effect.description);
        if (!gate) continue;
        if (EVALUATES_DESCRIPTION[effect.type] === true) continue;
        const actual = effect[gate.field];
        if (normalizeSpecialtyLabel(actual) !== gate.expected) {
            violations.push(
                `card ${entry.id} (${effect.type}) text requires ${gate.field}:"${gate.expected}" ` +
                    `but the field is "${actual}" — ${effect.description}`
            );
        }
    }
    return violations;
}

function ungateableSpecialtyHeads(catalog: readonly NormalizedCardCatalogEntry[]): string[] {
    const out: string[] = [];
    for (const entry of catalog) {
        const effect = entry.supportEffect;
        if (!effect?.description) continue;
        if (EVALUATES_DESCRIPTION[effect.type] === true) continue;
        if (specialtyHeadIsUngateable(effect.description)) out.push(`${entry.id}: ${effect.description}`);
    }
    return out;
}

/**
 * The reverse direction: a gate field whose card text states no specialty
 * condition. A hand edit that adds a gate the text does not justify silently
 * disables the card off-specialty, which is the same class of defect.
 */
function unjustifiedGates(catalog: readonly NormalizedCardCatalogEntry[]): string[] {
    const out: string[] = [];
    for (const entry of catalog) {
        const effect = entry.supportEffect;
        if (!effect) continue;
        const gate = effect.description ? specialtyGateFromText(effect.description) : null;
        for (const field of ["requireType", "requireOpponentType"] as const) {
            const value = effect[field];
            if (!value) continue;
            if (gate?.field === field) continue;
            out.push(
                `card ${entry.id} carries ${field}:"${value}" but its text states no matching condition` +
                    (effect.description ? ` — ${effect.description}` : " (no description)")
            );
        }
    }
    return out;
}

function modeG2(): string[] {
    // Positive control 1: the parser must read a known-good card's text. A
    // broken pattern would otherwise make every card look gate-free and the
    // absence assertion would pass vacuously.
    const knownGood = specialtyGateFromText("If own Specialty is Fire, own Attack Power is doubled.");
    assert(
        knownGood?.field === "requireType" && knownGood.expected === "Fire",
        `condition parser control failed: expected requireType:"Fire", got ${JSON.stringify(knownGood)}`
    );
    const knownGoodOpp = specialtyGateFromText(
        "If opponent's Specialty is Darkness, opponent's Support Effect is voided."
    );
    assert(
        knownGoodOpp?.field === "requireOpponentType" && knownGoodOpp.expected === "Dark",
        `condition parser control failed: expected requireOpponentType:"Dark", got ${JSON.stringify(knownGoodOpp)}`
    );
    assert(
        specialtyGateFromText("Opponent's Support Effect is voided.") === null,
        "an unconditional description must not demand a gate"
    );

    // Positive control 1b: the parser must not silently stop seeing gates the
    // text plainly states, or the absence assertion below is vacuous.
    crossCheckGateDetection(LOADED);

    // Positive control 2: the violation probe must distinguish present from
    // absent. Mutate a known-good gated card in memory and require detection.
    const gatedNonConditional = LOADED.filter(c => {
        const effect = c.supportEffect;
        if (!effect?.description) return false;
        if (EVALUATES_DESCRIPTION[effect.type] === true) return false;
        return specialtyGateFromText(effect.description) !== null;
    });
    assert(
        gatedNonConditional.length > 0,
        "no specialty-gated card resolves outside the conditional path — the guard has nothing to check"
    );
    assert(
        gatedNonConditional.some(c => c.id === "008"),
        "card 008 (requireType Fire, atk_mult) must be in scope of the structural guard"
    );
    assert(
        LOADED.some(
            c => EVALUATES_DESCRIPTION[c.supportEffect?.type ?? ""] === true && c.id === "018"
        ),
        "card 018 (conditional) must resolve through the description-evaluating path, or the exemption is wrong"
    );

    const mutated = LOADED.map(c =>
        c.id === "008"
            ? {
                  ...c,
                  supportEffect: { ...c.supportEffect!, requireType: "" },
              }
            : c
    );
    const mutationViolations = gateViolations(mutated);
    assert(
        mutationViolations.some(v => v.includes("card 008")),
        "violation probe control failed: stripping requireType from card 008 was not detected"
    );

    // The assertion: no ungated specialty condition may reach a primitive path.
    const violations = gateViolations(LOADED);
    if (violations.length > 0) {
        fail(
            `${violations.length} specialty condition(s) reach resolution without a gate field:\n  ` +
                violations.join("\n  ")
        );
    }

    const ungateable = ungateableSpecialtyHeads(LOADED);
    if (ungateable.length > 0) {
        fail(
            `${ungateable.length} specialty condition(s) cannot be expressed by a gate field and are ` +
                `unresolved at runtime:\n  ${ungateable.join("\n  ")}`
        );
    }

    // Reverse direction: a gate the text does not justify is the same defect
    // mirrored — it silently disables the card off-specialty. Control first.
    const unjustifiedControl = unjustifiedGates(
        LOADED.map(c =>
            c.id === "043" ? { ...c, supportEffect: { ...c.supportEffect!, requireType: "Ice" } } : c
        )
    );
    assert(
        unjustifiedControl.some(v => v.includes("card 043")),
        "reverse probe control failed: a gate added to the unconditional card 043 was not detected"
    );
    const unjustified = unjustifiedGates(LOADED);
    if (unjustified.length > 0) {
        fail(
            `${unjustified.length} gate field(s) are not justified by the card text:\n  ` +
                unjustified.join("\n  ")
        );
    }

    return [
        `  specialty-gated cards outside the conditional path: ${gatedNonConditional
            .map(c => `${c.id}:${c.supportEffect!.requireType || c.supportEffect!.requireOpponentType}`)
            .join(", ")}`,
        `  conditional-path specialty cards exempted: ${
            LOADED.filter(
                c =>
                    EVALUATES_DESCRIPTION[c.supportEffect?.type ?? ""] === true &&
                    c.supportEffect?.description &&
                    specialtyGateFromText(c.supportEffect.description) !== null
            ).length
        }`,
        `  controls: parser cross-checked against an independent text scan; stripping 008's gate is detected; ` +
            `adding an unjustified gate to 043 is detected`,
    ];
}

// ---------------------------------------------------------------------------
// G3 — generator reproducibility or a recorded limitation
// ---------------------------------------------------------------------------

const GENERATOR = "scripts/buildCardCatalog.ts";
const GENERATOR_INPUTS = ["scripts/data/asyrafkz/cards.json", "scripts/data/asyrafkz/result.json"];
/** The generator that DOES work on this checkout, used as the contrast. */
const WORKING_GENERATOR_INPUT = "scripts/data/asyrafkz/effectList2.txt";

function isGitIgnored(path: string): boolean {
    try {
        execFileSync("git", ["check-ignore", "-q", path], { stdio: "pipe" });
        return true;
    } catch (err: unknown) {
        const status = (err as { status?: number }).status;
        if (status === 1) return false;
        fail(`git check-ignore failed for ${path} with status ${String(status)}`);
    }
}

/** Deep-equality after dropping volatile generation timestamps. */
function identicalIgnoringVolatile(before: string, after: string): boolean {
    const strip = (text: string): unknown =>
        JSON.parse(text, (key, value) => (key === "generatedAt" ? undefined : value));
    return JSON.stringify(strip(before)) === JSON.stringify(strip(after));
}

function modeG3(): string[] {
    // Probe control: the comparison must tell identical from different, and must
    // ignore a timestamp-only difference.
    assert(
        identicalIgnoringVolatile('{"a":1}', '{"a":1}') &&
            !identicalIgnoringVolatile('{"a":1}', '{"a":2}'),
        "comparison control failed: identical/different catalogs are not distinguished"
    );
    assert(
        identicalIgnoringVolatile('{"generatedAt":"2020","a":1}', '{"generatedAt":"2026","a":1}'),
        "comparison control failed: a volatile timestamp difference was not ignored"
    );

    assert(existsSync(GENERATOR), `the card generator ${GENERATOR} is missing`);
    const generatorSource = readFileSync(GENERATOR, "utf8");
    for (const input of GENERATOR_INPUTS) {
        assert(
            generatorSource.includes(input.replace("scripts/data/asyrafkz/", "")),
            `${GENERATOR} no longer references ${input} — the recorded limitation is stale`
        );
    }

    // Positive control for the branch selector: the presence probe must
    // distinguish a present input from an absent one, or "inputs are missing"
    // could read as true for a reason other than the recorded limitation.
    assert(
        existsSync(WORKING_GENERATOR_INPUT) && !existsSync("scripts/data/asyrafkz/__absent_probe__.json"),
        "branch selector control failed: the input-presence probe does not distinguish present from absent"
    );

    const missing = GENERATOR_INPUTS.filter(input => !existsSync(input));

    if (missing.length === 0) {
        // Reproducible branch: regenerate and require a byte-identical artifact.
        const before = readFileSync(CATALOG_PATH, "utf8");
        let after: string | null = null;
        let generatorError = "";
        try {
            execFileSync("npx", ["tsx", GENERATOR], { stdio: "pipe" });
            after = readFileSync(CATALOG_PATH, "utf8");
        } catch (err: unknown) {
            const stderr = String((err as { stderr?: Buffer }).stderr ?? "");
            generatorError = stderr.trim() || String(err);
        } finally {
            // Restore the artifact we captured, never a git-derived copy: an
            // uncommitted edit is the thing this gate exists to protect. Done
            // before any fail() so a crashing generator cannot leave the
            // catalog half-regenerated.
            writeFileSync(CATALOG_PATH, before);
        }
        if (after === null) {
            fail(
                `${GENERATOR} failed to run even though its inputs are present:\n${generatorError}`
            );
        }
        assert(
            identicalIgnoringVolatile(before, after),
            `${GENERATOR} no longer reproduces ${CATALOG_PATH} byte-for-byte; regenerate and commit the artifact`
        );
        return [`  branch: REPRODUCIBLE — ${GENERATOR} regenerated ${CATALOG_PATH} identically`];
    }

    // Recorded-limitation branch. State the limitation, then prove it is real
    // and that the manual artifact edit it forces actually happened.
    for (const input of missing) {
        assert(
            isGitIgnored(input),
            `${input} is absent but NOT git-ignored — the generator inputs should be reproducible, fix the checkout instead of recording a limitation`
        );
    }
    assert(
        !isGitIgnored(CATALOG_PATH),
        `${CATALOG_PATH} is git-ignored, so it is not the tracked artifact this decision assumes`
    );
    assert(
        existsSync(WORKING_GENERATOR_INPUT),
        `contrast input ${WORKING_GENERATOR_INPUT} is missing, so the "generator" limitation is not specific to buildCardCatalog`
    );

    // The generator must not silently look functional: the limitation and the
    // manual-edit decision are recorded at the defect site in its own source.
    assert(
        generatorSource.includes("KNOWN DEFECT") &&
            generatorSource.includes("edited as the artifact"),
        `${GENERATOR} does not record its unrunnable-input limitation and the manual-edit decision at the void branch; ` +
            `add the note so the generator does not look functional`
    );

    // The manual edit this limitation forces must be present in the artifact.
    for (const [id, field, value] of [
        ["036", "requireType", "Ice"],
        ["152", "requireOpponentType", "Dark"],
    ] as const) {
        const actual = rawById(id).supportEffect?.[field] ?? "";
        assert(
            normalizeSpecialtyLabel(actual) === normalizeSpecialtyLabel(value),
            `${CATALOG_PATH} is edited by hand here, but card ${id} is still missing ${field}:"${value}"`
        );
    }

    return [
        `  branch: RECORDED LIMITATION — ${GENERATOR} cannot run on this checkout`,
        `  absent generator inputs: ${missing.join(", ")} (excluded by .gitignore "*.json")`,
        `  decision: ${CATALOG_PATH} is edited as the artifact (gates 036/152 verified present)`,
        `  limitation recorded in ${GENERATOR} at the void branch (does not look functional)`,
        `  contrast: ${WORKING_GENERATOR_INPUT} is present, so buildEffectCatalog.ts stays reproducible`,
    ];
}

// ---------------------------------------------------------------------------

function main(): void {
    const mode = process.argv[2];
    if (mode !== "G1" && mode !== "G2" && mode !== "G3") {
        fail(`expected one mode argument (G1|G2|G3), got ${mode === undefined ? "none" : `"${mode}"`}`);
    }

    const run = (): string[] => {
        switch (mode as Mode) {
            case "G1":
                return modeG1();
            case "G2":
                return modeG2();
            case "G3":
                return modeG3();
        }
    };

    const details = run();
    for (const line of details) console.log(line);
    console.log(`specialty-gates ${mode} verified`);
}

main();
