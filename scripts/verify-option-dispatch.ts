#!/usr/bin/env tsx
/**
 * Leaf-1.1.2 oracle — option resolution integrity.
 *
 * Usage: npx tsx scripts/verify-option-dispatch.ts G1|G2|G3|G4
 *
 * G1  no option card is both claimed `implemented` and a no-op at runtime
 * G2  an unimplemented effect produces an observable outcome, never a silent default
 * G3  the DP gauge cannot go negative through any evolution path
 * G4  one evolution-modifier type is the single source of truth
 *
 * Prints exactly one success marker ("option-dispatch <MODE> verified") after
 * every assertion in that mode passes. Exits non-zero with a diagnostic
 * otherwise. An unimplemented mode exits non-zero.
 */

import { readFileSync } from "node:fs";

import cardsData from "../src/data/cards.json";
import {
    loadCardCatalog,
    type NormalizedCardCatalogEntry,
} from "../src/lib/cardCatalogLoader";
import {
    canonicalizeEffectText,
    inferConditionalEffect,
    inferSupportEffectFromDescription,
    splitComposeClauses,
    splitConsequentClauses,
} from "../src/lib/effectTextNormalize";
import {
    evaluateCondition,
    parseCondition,
    splitConditional,
    type ConditionContext,
    type EffectCondition,
} from "../src/lib/effectCondition";
import {
    applyBattleOptionToContext,
    canEvolveWithOption,
    classifyOptionEffect,
    parseEvolutionModifiers,
    resolvePrepOption,
    type EvolutionModifiers,
    type OptionCardLike,
} from "../src/lib/optionResolver";
import {
    evaluateEvolution,
    spendEvolutionDp,
    type EvolutionCostModifiers,
} from "../src/lib/evolutionEligibility";
import {
    createSupportBattleContext,
    SUPPORT_PRIORITY,
    type SupportBattleContext,
} from "../src/lib/supportResolver";
import { BattleRoom } from "../src/rooms/BattleRoom";
import { CardSchema, PlayerSchema } from "../src/schema/BattleState";

type Mode = "G1" | "G2" | "G3" | "G4";

/**
 * Measured on the pre-fix tree by running this probe's equivalent against
 * `git show HEAD:src/lib/optionResolver.ts`:
 *   - 72 of the 98 `option` cards whose effects.json entry says `implemented`
 *     mutated nothing through `applyBattleOptionToContext`;
 *   - counting every option card as claimed (no effects.json join) the same
 *     probe reads 76 of 102 — the driver measured both figures.
 * Recorded here as the reproduction baseline; both counts are now zero.
 */
const PRE_FIX_NOOP_BASELINE = 72;
const PRE_FIX_CLAIMED_OPTIONS = 98;
const PRE_FIX_NOOP_BASELINE_NO_JOIN = 76;
const PRE_FIX_OPTION_CARDS = 102;

function fail(message: string): never {
    console.error(`option-dispatch verification FAILED: ${message}`);
    process.exit(1);
}

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) fail(message);
}

// ---------------------------------------------------------------------------
// Catalog + effects.json join
// ---------------------------------------------------------------------------

type EffectEntry = { id: string; text: string; sourceText?: string; status: string };

const EFFECTS: EffectEntry[] = (
    JSON.parse(readFileSync("src/data/effects.json", "utf8")) as { effects: EffectEntry[] }
).effects;

/**
 * effects.json text → status. Keyed case-insensitively on the canonical form:
 * the catalog and the effect list disagree about `Own Attack` / `Own attack`.
 */
const STATUS_BY_TEXT = new Map<string, string>();
for (const entry of EFFECTS) {
    const key = canonicalizeEffectText(entry.text).toLowerCase();
    if (!STATUS_BY_TEXT.has(key)) STATUS_BY_TEXT.set(key, entry.status);
}

function effectStatus(card: NormalizedCardCatalogEntry): string | undefined {
    const text = canonicalizeEffectText(card.supportEffect?.description ?? "").toLowerCase();
    return STATUS_BY_TEXT.get(text);
}

const LOADED = loadCardCatalog(cardsData as unknown[]);
assert(LOADED.length > 0, "the card catalog loaded empty");

const OPTION_CARDS = LOADED.filter(c => c.cardKind === "option");
const EVOLUTION_CARDS = LOADED.filter(c => c.cardKind === "evolution_option");
const OPTION_AND_EVOLUTION = [...OPTION_CARDS, ...EVOLUTION_CARDS];

assert(OPTION_CARDS.length > 0, "the catalog contains no option cards");
assert(EVOLUTION_CARDS.length > 0, "the catalog contains no evolution-option cards");

/** Cards whose effects.json entry claims a runtime implements them. */
const CLAIMED_IMPLEMENTED = OPTION_AND_EVOLUTION.filter(
    c => effectStatus(c) === "implemented"
);

assert(
    CLAIMED_IMPLEMENTED.length > 0,
    "no option card is claimed implemented, so this gate cannot discriminate"
);

function toOptionLike(card: NormalizedCardCatalogEntry): OptionCardLike {
    const se = card.supportEffect;
    return {
        id: card.id,
        cardKind: card.cardKind,
        effectId: card.effectId,
        effectArgs: card.effectArgs,
        supportEffect: se
            ? {
                  type: se.type,
                  description: se.description,
                  value: se.value,
                  targetAttack: se.targetAttack,
              }
            : null,
    };
}

// ---------------------------------------------------------------------------
// Battle state + scenario construction
// ---------------------------------------------------------------------------

/**
 * Base states tried in order. A card passes when ANY reachable state mutates
 * observable state; a card whose gate needs a state none of these reach is
 * reported rather than silently accepted.
 */
const VARIANTS = [
    { selfType: "Fire", oppType: "Nature", selfHp: 400, oppHp: 400, selfLevel: "Champion", oppLevel: "Champion" },
    { selfType: "Ice", oppType: "Dark", selfHp: 300, oppHp: 900, selfLevel: "Rookie", oppLevel: "Mega" },
    { selfType: "Nature", oppType: "Fire", selfHp: 900, oppHp: 300, selfLevel: "Mega", oppLevel: "Rookie" },
] as const;

type Variant = (typeof VARIANTS)[number];

const ATTACKS = ["circle", "triangle", "cross"] as const;
type Attack = (typeof ATTACKS)[number];

/** A generous player: every primitive has something to change. */
function makePlayer(sessionId: string, variant: Variant): PlayerSchema {
    const player = new PlayerSchema();
    player.sessionId = sessionId;
    player.hp = variant.selfHp;
    player.dp = 100;
    const active = new CardSchema();
    active.id = `${sessionId}-active`;
    active.cardKind = "digimon";
    active.type = variant.selfType;
    active.level = variant.selfLevel;
    active.maxHp = 1000;
    active.hp = variant.selfHp;
    active.circle.damage = 400;
    active.triangle.damage = 300;
    active.cross.damage = 200;
    player.active = active;
    for (let i = 0; i < 3; i++) {
        const c = new CardSchema();
        c.id = `${sessionId}-h${i}`;
        c.cardKind = "digimon";
        player.hand.push(c);
    }
    for (let i = 0; i < 5; i++) {
        const c = new CardSchema();
        c.id = `${sessionId}-k${i}`;
        c.cardKind = "digimon";
        player.deck.push(c);
    }
    for (let i = 0; i < 2; i++) {
        const c = new CardSchema();
        c.id = `${sessionId}-d${i}`;
        c.cardKind = "digimon";
        player.dpSlot.push(c);
    }
    for (let i = 0; i < 4; i++) {
        const c = new CardSchema();
        c.id = `${sessionId}-t${i}`;
        c.cardKind = "digimon";
        player.trash.push(c);
    }
    const support = new CardSchema();
    support.id = `${sessionId}-support`;
    support.cardKind = "digimon";
    player.supportCard = support;
    return player;
}

function makeOpponent(variant: Variant): PlayerSchema {
    const opponent = makePlayer("d", variant);
    opponent.active!.type = variant.oppType;
    opponent.active!.level = variant.oppLevel;
    opponent.hp = variant.oppHp;
    opponent.active!.hp = variant.oppHp;
    return opponent;
}

/** Everything an option effect can observably change. */
function fingerprint(ctx: SupportBattleContext, players: readonly PlayerSchema[]): string {
    const side = (p: PlayerSchema) => ({
        hp: p.hp,
        dp: p.dp,
        hand: p.hand.length,
        deck: p.deck.length,
        dpSlot: p.dpSlot.length,
        trash: p.trash.length,
        support: p.supportCard ? 1 : 0,
        type: p.active?.type ?? "",
        activeHp: p.active?.hp ?? -1,
        bonus: ctx.attackBonus.get(p.sessionId) ?? null,
        mult: ctx.attackMultiplier.get(p.sessionId) ?? null,
        override: ctx.attackOverride.get(p.sessionId) ?? null,
        forced: ctx.forcedAttack.get(p.sessionId) ?? null,
        firstStrike: ctx.firstStrikePlayers.has(p.sessionId),
        attackSecond: ctx.attackSecondPlayers.has(p.sessionId),
        eatUpHp: ctx.eatUpHpPlayers.has(p.sessionId),
        counter: ctx.counterGrants.get(p.sessionId) ?? null,
        revive: ctx.reviveHp.get(p.sessionId) ?? null,
    });
    return JSON.stringify(players.map(side));
}

function conditionContext(
    self: PlayerSchema,
    opp: PlayerSchema,
    selfAttack: Attack,
    oppAttack: Attack
): ConditionContext {
    return {
        self: {
            attack: selfAttack,
            hp: self.hp,
            level: self.active?.level ?? "",
            specialty: self.active?.type ?? "",
            handCount: self.hand.length,
            dpSlotCount: self.dpSlot.length,
        },
        opponent: {
            attack: oppAttack,
            hp: opp.hp,
            level: opp.active?.level ?? "",
            specialty: opp.active?.type ?? "",
            handCount: opp.hand.length,
            dpSlotCount: opp.dpSlot.length,
        },
    };
}

/** Force a parsed condition true by mutating the scenario state. */
function satisfy(
    cond: EffectCondition,
    self: PlayerSchema,
    opp: PlayerSchema,
    start: { selfAttack: Attack; oppAttack: Attack }
): { selfAttack: Attack; oppAttack: Attack } {
    let selfAttack = start.selfAttack;
    let oppAttack = start.oppAttack;
    const growHand = (target: number) => {
        while (self.hand.length < target) {
            const c = new CardSchema();
            c.id = `a-extra-${self.hand.length}`;
            c.cardKind = "digimon";
            self.hand.push(c);
        }
    };
    switch (cond.kind) {
        case "attacks_same":
            oppAttack = selfAttack;
            break;
        case "attacks_different":
            oppAttack = selfAttack === "circle" ? "triangle" : "circle";
            break;
        case "own_attack_is":
            selfAttack = cond.attack;
            break;
        case "own_attack_not":
            selfAttack = cond.attack === "circle" ? "triangle" : "circle";
            break;
        case "opponent_used":
            oppAttack = cond.attack;
            break;
        case "own_hp_lt":
            self.hp = Math.max(1, cond.value - 1);
            self.active!.hp = self.hp;
            break;
        case "own_hp_lt_opponent":
            self.hp = 300;
            self.active!.hp = 300;
            opp.hp = 900;
            opp.active!.hp = 900;
            break;
        case "own_hp_gt_opponent":
            self.hp = 900;
            self.active!.hp = 900;
            opp.hp = 300;
            opp.active!.hp = 300;
            break;
        case "opponent_hp_gt":
            opp.hp = cond.value + 100;
            opp.active!.hp = opp.hp;
            break;
        case "opponent_hp_lt_own":
            self.hp = 900;
            self.active!.hp = 900;
            opp.hp = 300;
            opp.active!.hp = 300;
            break;
        case "own_level_is":
            self.active!.level = cond.level;
            break;
        case "opponent_level_is":
            opp.active!.level = cond.level;
            break;
        case "both_levels_are":
            self.active!.level = cond.level;
            opp.active!.level = cond.level;
            break;
        case "own_level_lower":
            self.active!.level = "Rookie";
            opp.active!.level = "Mega";
            break;
        case "own_specialty_is":
            self.active!.type = cond.specialty;
            break;
        case "opponent_specialty_is":
            opp.active!.type = cond.specialty;
            break;
        case "opponent_specialty_not":
            opp.active!.type =
                cond.specialty.trim().toLowerCase() === "fire" ? "Nature" : "Fire";
            break;
        case "opponent_specialty_in":
            opp.active!.type = cond.specialties[0]!;
            break;
        case "specialties_same":
            self.active!.type = "Fire";
            opp.active!.type = "Fire";
            break;
        case "own_hand_gte":
            growHand(cond.value);
            break;
        case "own_hand_lte":
            while (self.hand.length > cond.value) self.hand.pop();
            break;
        case "opponent_dp_slot_gt": {
            while (opp.dpSlot.length <= cond.value) {
                const c = new CardSchema();
                c.id = `d-extra-${opp.dpSlot.length}`;
                c.cardKind = "digimon";
                opp.dpSlot.push(c);
            }
            break;
        }
        default:
            break;
    }
    return { selfAttack, oppAttack };
}

/** The gate a card's text carries, plus the primitives it resolves to. */
function cardClauses(card: NormalizedCardCatalogEntry): {
    steps: string[];
    cond: EffectCondition | null;
} {
    const se = card.supportEffect;
    if (!se) return { steps: [], cond: null };
    if (se.type === "conditional") {
        const split = splitConditional(se.description);
        const cond = split ? parseCondition(split.head) : null;
        const steps = split
            ? splitConsequentClauses(split.consequent)
                  .map(c => inferSupportEffectFromDescription(c)?.type ?? "")
                  .filter(Boolean)
            : [];
        return { steps, cond };
    }
    if (se.type === "compose") {
        return {
            steps: splitComposeClauses(se.description)
                .map(
                    c =>
                        inferSupportEffectFromDescription(c)?.type ??
                        inferConditionalEffect(c)?.type ??
                        ""
                )
                .filter(Boolean),
            cond: null,
        };
    }
    return { steps: [se.type], cond: null };
}

/** A card played against one reachable battle state. */
type Scenario = {
    card: NormalizedCardCatalogEntry;
    self: PlayerSchema;
    opp: PlayerSchema;
    selfAttack: Attack;
    oppAttack: Attack;
    /** False when the card's gate cannot be satisfied in this variant. */
    gateHolds: boolean;
};

/**
 * Build the state a card is played against, satisfying its gate where one
 * exists. Built once per attempt so the gate is evaluated on exactly the state
 * that is then played.
 */
function buildScenario(card: NormalizedCardCatalogEntry, variant: Variant): Scenario {
    const self = makePlayer("a", variant);
    const opp = makeOpponent(variant);
    const { cond } = cardClauses(card);
    let attacks: { selfAttack: Attack; oppAttack: Attack } = {
        selfAttack: "circle",
        oppAttack: "triangle",
    };
    if (cond) attacks = satisfy(cond, self, opp, attacks);
    const gateHolds = cond
        ? evaluateCondition(cond, conditionContext(self, opp, attacks.selfAttack, attacks.oppAttack))
        : true;
    return { card, self, opp, selfAttack: attacks.selfAttack, oppAttack: attacks.oppAttack, gateHolds };
}

/**
 * Play one option card as a battle support through the real runtime.
 *
 * The runtime is always supplied, exactly as the server does: it carries the
 * locked attacks a conditional gate reads, and `applySingleEffect` returns early
 * for a `conditional` without it.
 */
function playAsBattleOption(scenario: Scenario): {
    mutated: boolean;
    ctx: SupportBattleContext;
    unresolved: string[];
} {
    const { card, self, opp } = scenario;
    const ctx = createSupportBattleContext();
    const hpTarget = { hp: self.hp, maxHp: self.active!.maxHp };
    const unresolved: string[] = [];
    const before = fingerprint(ctx, [self, opp]);

    applyBattleOptionToContext(toOptionLike(card), self.sessionId, ctx, hpTarget, {
        source: self,
        target: opp,
        sourceAttack: scenario.selfAttack,
        targetAttack: scenario.oppAttack,
        hooks: {
            rng: () => 0.5,
            drawCards: (p, n) => {
                for (let i = 0; i < n && p.deck.length > 0; i++) p.hand.push(p.deck.shift()!);
            },
        },
        onUnresolved: (reason, detail) => {
            unresolved.push(`${reason}:${JSON.stringify(detail)}`);
        },
    });

    return { mutated: fingerprint(ctx, [self, opp]) !== before, ctx, unresolved };
}

/** A card mutates if any reachable scenario does. */
function mutatesAsBattleOption(card: NormalizedCardCatalogEntry): {
    ok: boolean;
    detail: string;
} {
    const { steps, cond } = cardClauses(card);
    const attempts: string[] = [];
    for (const variant of VARIANTS) {
        const scenario = buildScenario(card, variant);
        if (!scenario.gateHolds) {
            attempts.push(`${variant.selfType}/${variant.oppType}: gate ${cond?.kind} unreachable`);
            continue;
        }
        const result = playAsBattleOption(scenario);
        if (result.mutated) return { ok: true, detail: "" };
        attempts.push(
            `${variant.selfType}/${variant.oppType}: no mutation (steps=${steps.join(",")}, ` +
                `unresolved=${result.unresolved.join("|") || "none"})`
        );
    }
    return { ok: false, detail: attempts.join("; ") };
}

// ---------------------------------------------------------------------------
// G1 — claimed implemented => actually implemented
// ---------------------------------------------------------------------------

/** A card the runtime demonstrably applies: the probe's positive control. */
const G1_POSITIVE_CONTROL = "264"; // Attack Chip: option.battle.atk_buff +300

function modeG1(): void {
    // Positive control first: if this card does not register as mutating, the
    // probe itself is broken and every absence it reports is meaningless.
    const control = OPTION_CARDS.find(c => c.id === G1_POSITIVE_CONTROL);
    assert(control, `positive control card ${G1_POSITIVE_CONTROL} is missing from the catalog`);
    const controlRun = playAsBattleOption(buildScenario(control, VARIANTS[0]));
    assert(
        controlRun.mutated,
        `positive control ${control.name} (${G1_POSITIVE_CONTROL}) did not mutate observable state, ` +
            `so this probe cannot distinguish an implemented card from a no-op`
    );
    assert(
        controlRun.ctx.attackBonus.get("a")?.circle === 300,
        `positive control applied the wrong bonus: ${JSON.stringify(controlRun.ctx.attackBonus.get("a"))}`
    );

    const failures: string[] = [];
    let battleOptions = 0;
    let prepOptions = 0;
    let evolutionOptions = 0;

    for (const card of CLAIMED_IMPLEMENTED) {
        if (card.cardKind === "evolution_option") {
            evolutionOptions++;
            const verdict = classifyOptionEffect(toOptionLike(card));
            const modifiers = parseEvolutionModifiers(toOptionLike(card));
            const effective = Object.values(modifiers).some(v => v !== 0 && v !== false);
            if (verdict.implemented === false || !effective) {
                failures.push(
                    `evolution option ${card.id} ${card.name}: status=implemented but ` +
                        `verdict=${JSON.stringify(verdict)} modifiers=${JSON.stringify(modifiers)}`
                );
            }
            continue;
        }
        if (card.effectId.startsWith("option.prep.")) {
            prepOptions++;
            const state = {
                dp: 0,
                hp: 400,
                maxHp: 1000,
                hand: [],
                deck: [
                    { id: "deck-1", cardKind: "digimon", effectId: "" },
                    { id: "deck-2", cardKind: "digimon", effectId: "" },
                ],
                trash: [{ id: "trash-1", cardKind: "digimon", effectId: "" }],
            };
            const before = JSON.stringify({
                dp: state.dp,
                hp: state.hp,
                hand: state.hand.length,
                trash: state.trash.length,
            });
            const result = resolvePrepOption(toOptionLike(card), state, count => {
                let drawn = 0;
                for (let i = 0; i < count && state.deck.length > 0; i++) {
                    state.hand.push(state.deck.shift()!);
                    drawn++;
                }
                return drawn;
            });
            const after = JSON.stringify({
                dp: state.dp,
                hp: state.hp,
                hand: state.hand.length,
                trash: state.trash.length,
            });
            if (!result.ok || before === after) {
                failures.push(
                    `prep option ${card.id} ${card.name}: status=implemented but ` +
                        `result=${JSON.stringify(result)} unchanged=${before === after}`
                );
            }
            continue;
        }

        battleOptions++;
        const outcome = mutatesAsBattleOption(card);
        if (!outcome.ok) {
            failures.push(
                `battle option ${card.id} ${card.name} (${card.effectId || card.supportEffect?.type}): ` +
                    `status=implemented but no-op. ${outcome.detail}`
            );
        }
    }

    if (failures.length > 0) {
        fail(
            `${failures.length} of ${CLAIMED_IMPLEMENTED.length} cards claimed \`implemented\` in ` +
                `effects.json still no-op at runtime (pre-fix baseline was ${PRE_FIX_NOOP_BASELINE} of ` +
                `${OPTION_CARDS.length} option cards):\n  ` +
                failures.slice(0, 12).join("\n  ")
        );
    }

    console.log(
        `option-dispatch G1 verified (${CLAIMED_IMPLEMENTED.length} claimed-implemented cards all ` +
            `reach a runtime: ${battleOptions} battle options mutate through ` +
            `applyBattleOptionToContext, ${prepOptions} prep options resolve, ` +
            `${evolutionOptions} evolution options parse to effective modifiers; ` +
            `pre-fix baseline ${PRE_FIX_NOOP_BASELINE} of ${PRE_FIX_CLAIMED_OPTIONS} ` +
            `claimed-implemented option cards (${PRE_FIX_NOOP_BASELINE_NO_JOIN} of ` +
            `${PRE_FIX_OPTION_CARDS} option cards counting every card as claimed) was a no-op)`
    );
}

// ---------------------------------------------------------------------------
// G2 — unimplemented effects are observable
// ---------------------------------------------------------------------------

/** Every card whose text the loader could not turn into a primitive. */
function unresolvableCards(): NormalizedCardCatalogEntry[] {
    return OPTION_AND_EVOLUTION.filter(
        c => classifyOptionEffect(toOptionLike(c)).implemented === false
    );
}

function modeG2(): void {
    // Positive control: the probe must be able to report "implemented" for a
    // card that is. Without this, a broken classifier reading `false` for
    // everything would look like a clean result.
    const good = OPTION_CARDS.find(c => c.id === G1_POSITIVE_CONTROL);
    assert(good, `positive control card ${G1_POSITIVE_CONTROL} is missing from the catalog`);
    const goodVerdict = classifyOptionEffect(toOptionLike(good));
    assert(
        goodVerdict.implemented === true,
        `the probe reported an implemented card as unresolved (${JSON.stringify(goodVerdict)}), ` +
            `so an absence result cannot be trusted`
    );

    // A card is "unresolvable" when no runtime applies it. Which runtime applies
    // depends on the kind: battle options go through the primitive dispatcher,
    // evolution options through `parseEvolutionModifiers`. A catalog_text card
    // with a real evolution effectId is therefore resolved, not silent — its
    // text is descriptive, and the effectId is what the runtime reads.
    const unresolvable = unresolvableCards();
    assert(
        unresolvable.length > 0,
        "no unresolvable option effect remains, so this gate cannot discriminate"
    );

    const silent: string[] = [];
    for (const card of unresolvable) {
        const verdict = classifyOptionEffect(toOptionLike(card));
        if (verdict.implemented !== false) {
            silent.push(`${card.id} ${card.name}: listed unresolved but classifies as implemented`);
            continue;
        }
        if (!verdict.reason) {
            silent.push(`${card.id} ${card.name}: unresolved with no reason`);
            continue;
        }
        if (!Object.keys(verdict.detail).includes("cardId")) {
            silent.push(
                `${card.id} ${card.name}: rejection carries no cardId ` +
                    `(${Object.keys(verdict.detail).join(",")})`
            );
        }
    }

    // Every card that DOES route through the dispatcher must be inside its
    // vocabulary — otherwise it reaches the silent `default: break`.
    const outsideVocabulary = OPTION_AND_EVOLUTION.filter(c => {
        if (c.cardKind !== "option") return false;
        if (c.effectId.startsWith("option.prep.")) return false;
        const verdict = classifyOptionEffect(toOptionLike(c));
        if (verdict.implemented === false) return false;
        return !(verdict.effectType in SUPPORT_PRIORITY);
    });
    assert(
        outsideVocabulary.length === 0,
        `option cards resolve to types outside the dispatcher vocabulary, which reach the ` +
            `silent \`default: break\`: ` +
            outsideVocabulary.map(c => `${c.id} ${c.name}`).join(", ")
    );

    // A battle option that cannot be resolved must report through the callback.
    const optionSilent: string[] = [];
    for (const card of unresolvable.filter(c => c.cardKind === "option")) {
        const result = playAsBattleOption(buildScenario(card, VARIANTS[0]));
        assert(
            !result.mutated,
            `${card.id} ${card.name} is unresolvable yet mutated observable state, ` +
                `so it is implemented and its effects.json status is the wrong one`
        );
        if (result.unresolved.length === 0) {
            optionSilent.push(`${card.id} ${card.name}: played without reporting through onUnresolved`);
        }
    }

    // An evolution option no runtime implements must be refused with an audit
    // entry, not accepted with a silently ignored option.
    const evolutionSilent: string[] = [];
    for (const card of unresolvable.filter(c => c.cardKind === "evolution_option")) {
        const room = makeRoom();
        const outcome = driveEvolve(room, {
            dp: 500,
            evoCost: 200,
            option: { id: card.id, effectId: card.effectId, effectArgs: card.effectArgs },
        });
        const audit = lastAudit(room, "EVOLVE");
        if (outcome.ok) {
            evolutionSilent.push(
                `${card.id} ${card.name}: accepted the evolution despite no runtime implementing it`
            );
            continue;
        }
        if (!audit || audit.validation !== "rejected" || !audit.reason) {
            evolutionSilent.push(
                `${card.id} ${card.name}: refused without a rejected audit entry ` +
                    `(${JSON.stringify(audit ?? null)})`
            );
        }
    }

    // Symmetric control: an implemented evolution option must NOT be refused,
    // so the rejection above cannot be a blanket refusal of every option.
    const implementedEvo = EVOLUTION_CARDS.find(
        c => c.effectId && classifyOptionEffect(toOptionLike(c)).implemented
    );
    assert(implementedEvo, "no implemented evolution option found for the symmetric control");
    const accepted = driveEvolve(makeRoom(), {
        dp: 500,
        evoCost: 200,
        option: {
            id: implementedEvo.id,
            effectId: implementedEvo.effectId,
            effectArgs: implementedEvo.effectArgs,
        },
    });
    assert(
        accepted.ok,
        `symmetric control failed: the implemented evolution option ` +
            `${implementedEvo.id} ${implementedEvo.name} was refused (${JSON.stringify(accepted)})`
    );

    const problems = [...silent, ...optionSilent, ...evolutionSilent];
    if (problems.length > 0) {
        fail(
            `${problems.length} unresolvable option effect(s) are not observable:\n  ` +
                problems.slice(0, 12).join("\n  ")
        );
    }

    const byKind = (kind: string) => unresolvable.filter(c => c.cardKind === kind).length;
    console.log(
        `option-dispatch G2 verified (${unresolvable.length} unresolvable option effects each ` +
            `carry a reason + cardId: ${byKind("option")} battle options report through ` +
            `onUnresolved, ${byKind("evolution_option")} evolution options are refused with a ` +
            `rejected EVOLVE audit; positive control ${good.name} classifies implemented, ` +
            `symmetric control ${implementedEvo.name} is still accepted)`
    );
}

// ---------------------------------------------------------------------------
// BattleRoom drive helpers (G2 / G3)
// ---------------------------------------------------------------------------

type AuditEntry = {
    action: string;
    validation: string;
    reason?: string;
    detail?: Record<string, unknown>;
};

type AuditableRoom = {
    auditLog: { getEntries(): readonly AuditEntry[] };
};

function makeRoom(): BattleRoom {
    const room = new BattleRoom() as unknown as BattleRoom & {
        onCreate(options: Record<string, unknown>): void;
        state: { phase: string; prepSubPhase: string };
    };
    room.onCreate({});
    room.state.phase = "preparation";
    room.state.prepSubPhase = "evolve";
    return room;
}

function lastAudit(room: BattleRoom, action: string): AuditEntry | undefined {
    const entries = (room as unknown as AuditableRoom).auditLog.getEntries();
    return [...entries].reverse().find(e => e.action === action);
}

/**
 * Run the real `BattleRoom.evolve` path: a Rookie active with a Champion target
 * in hand, plus an optional evolution option. Mirrors what the EVOLVE message
 * handler does, without a socket.
 */
function driveEvolve(
    room: BattleRoom,
    input: {
        dp: number;
        evoCost: number;
        option?: { id: string; effectId: string; effectArgs?: Record<string, unknown> };
    }
): { ok: boolean; dpAfter: number } {
    const internal = room as unknown as {
        evolve(player: PlayerSchema, cardId: string, optionCardId?: string): boolean;
        state: { players: Map<string, PlayerSchema> };
    };

    const player = new PlayerSchema();
    player.sessionId = "s1";
    player.dp = input.dp;
    player.hp = 500;

    const active = new CardSchema();
    active.id = "x_active";
    active.cardKind = "digimon";
    active.level = "Rookie";
    active.type = "Fire";
    active.maxHp = 500;
    active.hp = 500;
    active.evoCost = 0;
    player.active = active;

    const target = new CardSchema();
    target.id = "x_target";
    target.cardKind = "digimon";
    target.level = "Champion";
    target.type = "Fire";
    target.evoCost = input.evoCost;
    target.maxHp = 1000;
    target.hp = 1000;
    player.hand.push(target);

    let optionCardId: string | undefined;
    if (input.option) {
        const option = new CardSchema();
        option.id = input.option.id;
        option.cardKind = "evolution_option";
        option.effectId = input.option.effectId;
        option.effectArgsJson = JSON.stringify(input.option.effectArgs ?? {});
        player.hand.push(option);
        optionCardId = option.id;
    }

    internal.state.players.set(player.sessionId, player);
    const ok = internal.evolve(player, target.id, optionCardId);
    return { ok, dpAfter: player.dp };
}

// ---------------------------------------------------------------------------
// G3 — the DP gauge never goes negative
// ---------------------------------------------------------------------------

function modeG3(): void {
    // Positive control: the drive path must be able to succeed and deduct, else
    // "no negative DP" is trivially true because nothing ever runs.
    const control = driveEvolve(makeRoom(), { dp: 500, evoCost: 200 });
    assert(
        control.ok && control.dpAfter === 300,
        `positive control failed: a 200-cost evolution at 500 DP must succeed and leave 300, ` +
            `got ${JSON.stringify(control)}`
    );

    // The gate must still refuse an evolution the player cannot pay for.
    const unaffordable = driveEvolve(makeRoom(), { dp: 100, evoCost: 200 });
    assert(
        !unaffordable.ok && unaffordable.dpAfter === 100,
        `an unaffordable evolution must be refused without spending, got ` +
            `${JSON.stringify(unaffordable)}`
    );

    // The reproduced defect: Download Digivolve sets ignoreDp, so the DP gate
    // passes at 0 DP and the deduction used to drive the gauge negative.
    const download = driveEvolve(makeRoom(), {
        dp: 0,
        evoCost: 200,
        option: { id: "x_293", effectId: "evolution_option.download" },
    });
    assert(
        download.ok,
        `Download Digivolve at 0 DP must still be legal (ignoreDp skips the sufficiency gate), ` +
            `got ${JSON.stringify(download)}`
    );
    assert(
        download.dpAfter === 0,
        `Download Digivolve at 0 DP drove the gauge to ${download.dpAfter}; the reproduced defect ` +
            `was -200`
    );

    // Sweep every evolution path shape for a negative gauge.
    const negative: string[] = [];
    for (const evoCost of [0, 50, 200, 1000]) {
        for (const dp of [0, 1, 100, 5000]) {
            const cases: { label: string; option?: { id: string; effectId: string; effectArgs?: Record<string, unknown> } }[] = [
                { label: "no option" },
                {
                    label: "download",
                    option: { id: "x_293", effectId: "evolution_option.download" },
                },
                {
                    label: "warp",
                    option: {
                        id: "x_297",
                        effectId: "evolution_option.warp_evolve",
                        effectArgs: { skipLevels: 1 },
                    },
                },
                {
                    label: "dp_adjust +20",
                    option: {
                        id: "x_295",
                        effectId: "evolution_option.dp_adjust",
                        effectArgs: { delta: 20 },
                    },
                },
                {
                    label: "dp_adjust -999 (Speed)",
                    option: {
                        id: "x_299",
                        effectId: "evolution_option.dp_adjust",
                        effectArgs: { delta: -999 },
                    },
                },
                {
                    label: "restore_full_stats",
                    option: {
                        id: "x_restore",
                        effectId: "evolution_option.restore_full_stats",
                        effectArgs: { dpCostDelta: 20 },
                    },
                },
            ];
            for (const c of cases) {
                const outcome = driveEvolve(makeRoom(), { dp, evoCost, option: c.option });
                if (outcome.dpAfter < 0) {
                    negative.push(
                        `${c.label}: dp=${dp} evoCost=${evoCost} -> ${outcome.dpAfter}`
                    );
                }
            }
        }
    }
    if (negative.length > 0) {
        fail(
            `the DP gauge went negative on ${negative.length} evolution path(s):\n  ` +
                negative.join("\n  ")
        );
    }

    // The spend helper is the single place the subtraction happens; pin it.
    assert(
        spendEvolutionDp(0, 200) === 0,
        "spendEvolutionDp(0, 200) must floor at 0"
    );
    assert(
        spendEvolutionDp(500, 200) === 300,
        "spendEvolutionDp(500, 200) must deduct to 300"
    );

    console.log(
        `option-dispatch G3 verified (Download Digivolve at 0 DP stays at 0 instead of -200; ` +
            `all ${4 * 4 * 6} evolution path combinations floor at 0; ` +
            `affordability gate still refuses an unpaid evolution)`
    );
}

// ---------------------------------------------------------------------------
// G4 — one evolution-modifier declaration
// ---------------------------------------------------------------------------

/** The modifier fields the contract requires, pinned independently of the source. */
const REQUIRED_MODIFIER_FIELDS = [
    "armorCrush",
    "deArmor",
    "dpCostDelta",
    "ignoreDp",
    "ignoreLevel",
    "ignoreSpecialty",
    "restoreFullStats",
    "sameLevel",
    "warpSkipLevels",
];

function modeG4(): void {
    // Runtime: every producer of a modifier set yields exactly the contract's
    // fields. A second, drifting declaration shows up as a key mismatch.
    const evolutionCards = EVOLUTION_CARDS.filter(c => c.effectId);
    assert(evolutionCards.length > 0, "no evolution option card carries an effectId");

    const seen = new Set<string>();
    for (const card of evolutionCards) {
        const modifiers = parseEvolutionModifiers(toOptionLike(card));
        const keys = Object.keys(modifiers).sort();
        seen.add(keys.join(","));
        assert(
            keys.join(",") === [...REQUIRED_MODIFIER_FIELDS].sort().join(","),
            `card ${card.id} ${card.name} parsed modifiers with fields [${keys.join(",")}], ` +
                `expected [${[...REQUIRED_MODIFIER_FIELDS].sort().join(",")}]`
        );
    }
    assert(
        seen.size === 1,
        `evolution options produce ${seen.size} different modifier shapes: ${[...seen].join(" | ")}`
    );

    // Runtime: a complete modifier set is accepted by the gate entry points as
    // the (partial) gate input — i.e. one type serves both roles.
    const warp = evolutionCards.find(c => c.effectId === "evolution_option.warp_evolve");
    assert(warp, "no warp_evolve card found");
    const full: EvolutionModifiers = parseEvolutionModifiers(toOptionLike(warp));
    const asGateInput: EvolutionCostModifiers = full;
    const gate = evaluateEvolution(
        { level: "Rookie", type: "Fire" },
        { level: "Ultimate", type: "Fire", evoCost: 50, cardKind: "digimon" },
        50,
        asGateInput
    );
    assert(gate.ok, `warp modifiers must permit Rookie → Ultimate, got ${JSON.stringify(gate)}`);
    assert(
        canEvolveWithOption(
            { level: "Rookie", type: "Fire" },
            { level: "Ultimate", type: "Fire", evoCost: 50, cardKind: "digimon" },
            50,
            full
        ),
        "canEvolveWithOption must accept the same modifier set"
    );

    // Structural: exactly one declaration, and the second name is derived from it.
    const eligibilitySource = readFileSync("src/lib/evolutionEligibility.ts", "utf8");
    const resolverSource = readFileSync("src/lib/optionResolver.ts", "utf8");

    assert(
        /export type EvolutionModifiers = \{/.test(eligibilitySource),
        "evolutionEligibility.ts must declare `export type EvolutionModifiers = {`"
    );
    assert(
        /export type EvolutionCostModifiers = Partial<EvolutionModifiers>;/.test(eligibilitySource),
        "EvolutionCostModifiers must be derived as Partial<EvolutionModifiers> rather than " +
            "re-declaring the fields"
    );
    const secondDeclaration =
        /(?:export\s+)?(?:interface|type)\s+EvolutionModifiers\s*(?:=|extends|\{)/.test(
            resolverSource
        );
    assert(
        !secondDeclaration,
        "optionResolver.ts declares its own EvolutionModifiers again — the two declarations " +
            "drifting apart is exactly the defect this gate exists to prevent"
    );
    assert(
        /export type \{ EvolutionModifiers \}/.test(resolverSource),
        "optionResolver.ts must re-export the shared EvolutionModifiers type"
    );

    console.log(
        `option-dispatch G4 verified (one EvolutionModifiers declaration in ` +
            `evolutionEligibility.ts with EvolutionCostModifiers derived as Partial<>; ` +
            `${evolutionCards.length} evolution options parse to the same ${REQUIRED_MODIFIER_FIELDS.length} ` +
            `fields; the full set is accepted as gate input)`
    );
}

// ---------------------------------------------------------------------------

const MODES: Record<Mode, () => void> = {
    G1: modeG1,
    G2: modeG2,
    G3: modeG3,
    G4: modeG4,
};

const requested = process.argv[2];
if (!requested || !(requested in MODES)) {
    console.error(
        `option-dispatch: unimplemented or missing mode ${JSON.stringify(requested)}; ` +
            `expected one of ${Object.keys(MODES).join(", ")}`
    );
    process.exit(1);
}

MODES[requested as Mode]();
