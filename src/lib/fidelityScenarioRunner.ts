/**
 * Fidelity scenario registry and runner (E8 / T8-3, FC-030).
 */

import { shouldForfeitAfk, strikesAfterTimeout, strikesAfterVoluntaryAction } from "./afkPolicy";
import { resolveArenaVariant } from "./arenaVariant";
import { resolveFullBattle, resolveKoScoring, type BattleCombatant } from "./battleEffectEngine";
import type { BattleAuditEntry } from "./battleAuditLog";
import { buildDefaultDeckCardIds } from "./defaultDeckBuilder";
import { validateDeck } from "./deckValidator";
import { drawToTarget, mulliganHand, validateDeployDigimon } from "./openingFlow";
import { applyDiscardForDp, canDiscardForDp } from "./discardForDp";
import { evaluateEvolution } from "./evolutionEligibility";
import {
    applyPostEvolutionRecovery,
    parseStatusAilmentsJson,
} from "./postEvolutionRecovery";
import { resolvePrepOption } from "./optionResolver";
import { getPrepOptionBadge } from "./prepOptionPresentation";
import { isPlayerActionLegal } from "./battleTurnFlow";
import { PHASE_TIMER_MS, phaseTimerDurationMs } from "./phaseTimer";
import { getRuleProfile } from "./ruleProfile";
import { createSeededRng, shuffleInPlace } from "./seededRng";
import {
    canLockSupport,
    getDefenderSessionId,
    initialSupportPicker,
    nextSupportPickerAfterLock,
} from "./supportPhase";
import { createSupportBattleContext } from "./supportResolver";
import type { ScenarioRunResult } from "./battleReplay";
import type { NormalizedCardCatalogEntry } from "./cardCatalogLoader";
import cardsData from "../data/cards.json";
import { loadCardCatalog } from "./cardCatalogLoader";

export interface FidelityScenario {
    id: string;
    fidelityIds: string[];
    description: string;
    run: () => void;
}

const CATALOG = loadCardCatalog(cardsData);
const CATALOG_BY_ID = new Map(CATALOG.map(c => [c.id, c]));

function combatant(sessionId: string, hp: number, crossEffectId = ""): BattleCombatant {
    return {
        sessionId,
        hp,
        maxHp: hp,
        active: {
            circle: { damage: 400 },
            triangle: { damage: 300 },
            cross: { damage: 200, effectId: crossEffectId, effectArgsJson: "" },
        },
    };
}

function makeCard(level: string, id = `c_${level}`) {
    return {
        id,
        level,
        cardKind: "digimon" as const,
        hp: 1000,
        maxHp: 1000,
        circle: { damage: 400 },
        triangle: { damage: 300 },
        cross: { damage: 200 },
    };
}

export const FIDELITY_SCENARIOS: FidelityScenario[] = [
    {
        id: "opening-draw-to-four",
        fidelityIds: ["FC-001", "FC-003"],
        description: "Fidelity profile draws to 4-card hand target",
        run() {
            const profile = getRuleProfile("fidelity_ps1");
            const hand: ReturnType<typeof makeCard>[] = [];
            const deck = [makeCard("Rookie"), makeCard("Rookie"), makeCard("Champion"), makeCard("Rookie")];
            const result = drawToTarget(hand, deck, profile.handTarget);
            if (result.drawn !== 4 || hand.length !== 4) {
                throw new Error(`expected 4 cards drawn, got drawn=${result.drawn} hand=${hand.length}`);
            }
        },
    },
    {
        id: "opening-champion-penalty",
        fidelityIds: ["FC-002"],
        description: "Champion opening deploy applies half HP/ATK penalty",
        run() {
            const profile = getRuleProfile("fidelity_ps1");
            const card = makeCard("Champion");
            const validation = validateDeployDigimon(card, profile, true);
            if (validation.ok === false || validation.penaltyLevel !== "champion") {
                throw new Error("expected champion opening deploy with penalty");
            }
        },
    },
    {
        id: "mulligan-redraw",
        fidelityIds: ["FC-001"],
        description: "Mulligan returns hand to deck and redraws to target",
        run() {
            const hand = [makeCard("Rookie")];
            const deck = [makeCard("Champion"), makeCard("Rookie"), makeCard("Rookie"), makeCard("Rookie")];
            mulliganHand(hand, deck, 4, arr => shuffleInPlace(arr, createSeededRng(42)));
            if (hand.length !== 4) throw new Error(`expected hand size 4 after mulligan, got ${hand.length}`);
        },
    },
    {
        id: "draw-phase-action-guards",
        fidelityIds: ["FC-003"],
        description: "DRAW is legal only in draw phase; prep actions rejected there",
        run() {
            const ctx = {
                isYourTurn: true,
                hasActive: true,
                supportLocked: false,
                attackLocked: false,
            };
            if (!isPlayerActionLegal("DRAW", { ...ctx, phase: "draw", prepSubPhase: "" })) {
                throw new Error("DRAW should be legal in draw phase");
            }
            if (isPlayerActionLegal("END_PREP", { ...ctx, phase: "draw", prepSubPhase: "" })) {
                throw new Error("END_PREP must be rejected during draw");
            }
            if (!isPlayerActionLegal("DISCARD_FOR_DP", { ...ctx, phase: "preparation", prepSubPhase: "discard" })) {
                throw new Error("discard should be legal in discard sub-phase");
            }
        },
    },
    {
        id: "prep-discard-dp-digimon-only",
        fidelityIds: ["FC-006"],
        description: "Discard-for-DP accepts digimon only and sums plusDp",
        run() {
            const hand = [
                { id: "d1", cardKind: "digimon", plusDp: 20 },
                { id: "o1", cardKind: "option", plusDp: 0 },
            ];
            const trash: typeof hand = [];
            if (!canDiscardForDp(hand[0]!) || canDiscardForDp(hand[1]!)) {
                throw new Error("only digimon should be discardable for DP");
            }
            const result = applyDiscardForDp(hand, trash, ["o1", "d1"]);
            if (result.dpGained !== 20 || result.discardedIds.length !== 1) {
                throw new Error(`expected 20 dp from one digimon, got ${result.dpGained}`);
            }
        },
    },
    {
        id: "prep-option-heal-active",
        fidelityIds: ["FC-008"],
        description: "Prep heal option restores active HP up to max during discard/evolve windows",
        run() {
            const badge = getPrepOptionBadge({
                effectId: "option.prep.heal_active",
                effectArgs: { value: 300 },
            });
            if (badge !== "HEAL 300") {
                throw new Error(`expected HEAL 300 badge, got ${badge}`);
            }
            const hand = [
                { id: "opt", cardKind: "option", effectId: "option.prep.heal_active", effectArgs: { value: 300 } },
            ];
            const state = {
                dp: 0,
                hp: 400,
                maxHp: 1000,
                hand,
                deck: [],
                trash: [],
            };
            const result = resolvePrepOption(hand[0]!, state, () => 0);
            if (!result.ok || state.hp !== 700) {
                throw new Error(`expected heal to 700 hp, got ${state.hp}`);
            }
        },
    },
    {
        id: "prep-digivolve-legality",
        fidelityIds: ["FC-007"],
        description: "Normal digivolve requires adjacent level, matching specialty, DP, and digimon target",
        run() {
            const active = { level: "Rookie", type: "Nature" };
            const legal = {
                level: "Champion",
                type: "Nature",
                evoCost: 30,
                cardKind: "digimon",
            };
            const ok = evaluateEvolution(active, legal, 30);
            if (!ok.ok) throw new Error("legal Rookie→Champion same specialty should pass");

            const wrongType = evaluateEvolution(active, { ...legal, type: "Fire" }, 100);
            if (wrongType.ok !== false || wrongType.reason !== "wrong_specialty") {
                throw new Error("wrong specialty must reject");
            }

            const skip = evaluateEvolution(
                active,
                { level: "Ultimate", type: "Nature", evoCost: 50, cardKind: "digimon" },
                100
            );
            if (skip.ok !== false || skip.reason !== "invalid_level_path") {
                throw new Error("Rookie→Ultimate without warp must reject");
            }

            const noDp = evaluateEvolution(active, legal, 29);
            if (noDp.ok !== false || noDp.reason !== "insufficient_dp") {
                throw new Error("insufficient DP must reject");
            }

            const optionTarget = evaluateEvolution(active, { ...legal, cardKind: "option" }, 100);
            if (optionTarget.ok !== false || optionTarget.reason !== "not_digimon") {
                throw new Error("option cards must not be digivolve targets");
            }
        },
    },
    {
        id: "prep-post-evolution-recovery",
        fidelityIds: ["FC-009"],
        description: "Evolve restores HP to new max and clears status ailments",
        run() {
            const ailments = parseStatusAilmentsJson('["poison","paralysis"]');
            if (ailments.length !== 2) throw new Error("expected two parsed ailments");
            const state = {
                hp: 80,
                active: { hp: 80, maxHp: 900 },
                statusAilments: ailments,
                openingPenaltyActive: true,
            };
            const result = applyPostEvolutionRecovery(state);
            if (result.hpRestoredTo !== 900 || state.hp !== 900 || state.active.hp !== 900) {
                throw new Error(`expected full HP restore to 900, got ${state.hp}`);
            }
            if (state.statusAilments.length !== 0 || result.ailmentsCleared.length !== 2) {
                throw new Error("status ailments must be cleared on evolve");
            }
            if (state.openingPenaltyActive || !result.openingPenaltyCleared) {
                throw new Error("opening penalty flag must clear when active digimon is replaced");
            }
        },
    },
    {
        id: "double-ko-no-points",
        fidelityIds: ["FC-005", "FC-019"],
        description: "Simultaneous KO awards no points",
        run() {
            const ko = resolveKoScoring(0, 0);
            if (!ko.isDoubleKo) throw new Error("expected double KO");
            if (ko.scoreDelta.p1 !== 0 || ko.scoreDelta.p2 !== 0) {
                throw new Error("double KO should not award points");
            }
        },
    },
    {
        id: "cross-counter-ko",
        fidelityIds: ["FC-017", "FC-018"],
        description: "Cross counter cancels return hit and deals reflected damage",
        run() {
            const ctx = createSupportBattleContext();
            const p1 = combatant("p1", 500, "cross.counter");
            p1.active!.cross.effectArgsJson = JSON.stringify({ targetAttack: "circle", multiplier: 2 });
            const p2 = combatant("p2", 500);
            const battle = resolveFullBattle(p1, p2, "cross", "circle", "p1", ctx);
            if (battle.p1Hp !== 500) throw new Error(`attacker should take 0 damage, hp=${battle.p1Hp}`);
            if (battle.p2Hp >= 500) throw new Error("defender should take counter damage");
        },
    },
    {
        id: "support-defender-first-order",
        fidelityIds: ["FC-012", "FC-025"],
        description: "Defender picks support before active in fidelity flow",
        run() {
            const sessions = ["active", "defender"] as const;
            const defender = getDefenderSessionId("active", sessions);
            if (defender !== "defender") throw new Error("defender session mismatch");
            const first = initialSupportPicker(defender);
            if (!canLockSupport(defender, first, true, false)) throw new Error("defender should pick first");
            if (canLockSupport("active", first, true, false)) throw new Error("active should wait");
            const next = nextSupportPickerAfterLock(defender, defender, "active");
            if (next !== "active") throw new Error("active should pick after defender");
        },
    },
    {
        id: "phase-timer-tiered-durations",
        fidelityIds: ["FC-021"],
        description: "Interactive phases have server-authoritative timer durations",
        run() {
            const supportMs = phaseTimerDurationMs("battle_support", "");
            const attackMs = phaseTimerDurationMs("battle_attack", "");
            if (!supportMs || !attackMs) throw new Error("missing phase timer durations");
            if (supportMs !== PHASE_TIMER_MS.battle_support) throw new Error("support timer mismatch");
            if (supportMs <= attackMs) throw new Error("support should be longer than attack");
        },
    },
    {
        id: "afk-three-strike-forfeit",
        fidelityIds: ["FC-023"],
        description: "Three consecutive timeouts trigger forfeit threshold",
        run() {
            let strikes = strikesAfterVoluntaryAction();
            strikes = strikesAfterTimeout(strikes);
            strikes = strikesAfterTimeout(strikes);
            if (shouldForfeitAfk(strikes)) throw new Error("should not forfeit at 2 strikes");
            strikes = strikesAfterTimeout(strikes);
            if (!shouldForfeitAfk(strikes)) throw new Error("should forfeit at 3 strikes");
        },
    },
    {
        id: "deck-validation-canonical",
        fidelityIds: ["FC-028", "FC-029"],
        description: "Default deck is legal for standard arena",
        run() {
            const ids = buildDefaultDeckCardIds(CATALOG, 0);
            const variant = resolveArenaVariant("standard");
            const result = validateDeck(ids, CATALOG_BY_ID, variant);
            if (result.ok === false) {
                throw new Error(`default deck invalid: ${result.message}`);
            }
        },
    },
    {
        id: "no-options-arena-rejects-options",
        fidelityIds: ["FC-029"],
        description: "no_options arena rejects option cards in deck",
        run() {
            const ids = buildDefaultDeckCardIds(CATALOG, 0);
            const result = validateDeck(ids, CATALOG_BY_ID, resolveArenaVariant("no_options"));
            if (result.ok !== false) {
                throw new Error("expected deck to be invalid in no_options arena");
            }
            if (result.reason !== "option_card_not_allowed" && result.reason !== "evolution_option_not_allowed") {
                throw new Error(`expected option restriction, got ${result.reason}`);
            }
        },
    },
    {
        id: "seeded-shuffle-deterministic",
        fidelityIds: ["FC-030"],
        description: "Seeded shuffle produces identical order across runs",
        run() {
            const arr1 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
            const arr2 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
            shuffleInPlace(arr1, createSeededRng(12345));
            shuffleInPlace(arr2, createSeededRng(12345));
            if (arr1.join(",") !== arr2.join(",")) {
                throw new Error("seeded shuffle not deterministic");
            }
        },
    },
];

export function runFidelityScenario(scenario: FidelityScenario): ScenarioRunResult {
    const failures: string[] = [];
    try {
        scenario.run();
    } catch (err) {
        failures.push(err instanceof Error ? err.message : String(err));
    }
    return {
        scenarioId: scenario.id,
        fidelityIds: scenario.fidelityIds,
        passed: failures.length === 0,
        failures,
    };
}

export function runAllFidelityScenarios(): ScenarioRunResult[] {
    return FIDELITY_SCENARIOS.map(runFidelityScenario);
}

/** Collect FC IDs covered by the scenario suite. */
export function listCoveredFidelityIds(): string[] {
    const ids = new Set<string>();
    for (const s of FIDELITY_SCENARIOS) {
        for (const id of s.fidelityIds) ids.add(id);
    }
    return [...ids].sort();
}

/** Minimal audit trace builder for deterministic battle simulation tests. */
export function simulateBattleAuditTrace(
    p1: BattleCombatant,
    p2: BattleCombatant,
    a1: "circle" | "triangle" | "cross",
    a2: "circle" | "triangle" | "cross",
    activeSessionId: string
): BattleAuditEntry[] {
    const battle = resolveFullBattle(p1, p2, a1, a2, activeSessionId, createSupportBattleContext());
    return battle.events.map((event, i) => ({
        seq: i + 1,
        ts: i + 1,
        turn: 1,
        phase: "resolution",
        prepSubPhase: "",
        playerSessionId: event.sessionId ?? "",
        action: event.type,
        validation: "ok" as const,
        detail: event.detail,
        fidelityIds: ["FC-017", "FC-018"],
    }));
}

export function getScenarioCatalog(): readonly NormalizedCardCatalogEntry[] {
    return CATALOG;
}
