/**
 * Fidelity scenario registry and runner (E8 / T8-3, FC-030).
 */

import { shouldForfeitAfk, strikesAfterTimeout, strikesAfterVoluntaryAction } from "./afkPolicy";
import {
    isConsentedLeave,
    RECONNECT_GRACE_SECONDS,
    shouldForfeitOnPermanentLeave,
    shouldOfferReconnectGrace,
} from "./reconnectPolicy";
import { resolveArenaVariant } from "./arenaVariant";
import { resolveFullBattle, resolveKoScoring, type BattleCombatant } from "./battleEffectEngine";
import type { BattleAuditEntry } from "./battleAuditLog";
import { buildDefaultDeckCardIds, buildSyntheticDefaultDeck } from "./defaultDeckBuilder";
import { validateDeck } from "./deckValidator";
import { drawToTarget, mulliganHand, validateDeployDigimon } from "./openingFlow";
import { applyDiscardForDp, canDiscardForDp } from "./discardForDp";
import { evaluateEvolution } from "./evolutionEligibility";
import {
    applyPostEvolutionRecovery,
    parseStatusAilmentsJson,
} from "./postEvolutionRecovery";
import { getPrepServerMessage, nextPrepSubPhase } from "./prepPhaseCopy";
import {
    canEvolveWithOption,
    parseEvolutionModifiers,
    resolvePrepOption,
} from "./optionResolver";
import { canPlayEvolutionOption, canPlayPrepOption } from "./optionEligibility";
import { getPrepOptionBadge } from "./prepOptionPresentation";
import { isPlayerActionLegal, prepSubPhaseAfterDraw } from "./battleTurnFlow";
import type { PlayerActionType } from "./battleTurnFlow";
import { PHASE_TIMER_MS, phaseTimerDurationMs } from "./phaseTimer";
import { getRuleProfile } from "./ruleProfile";
import { createSeededRng, shuffleInPlace } from "./seededRng";
import {
    canLockSupport,
    getDefenderSessionId,
    initialSupportPicker,
    nextSupportPickerAfterLock,
} from "./supportPhase";
import {
    canVoidEnemySupport,
    createSupportBattleContext,
    evaluateSupportNullification,
} from "./supportResolver";
import { attemptOnlineDeckSupportGamble } from "./supportGamble";
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
        specialty: "Fire",
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
        id: "prep-armor-evolution",
        fidelityIds: ["FC-010"],
        description: "Online Armor: Rookie→Armor; ArmorCrush A→C/U; De-Armor A→R",
        run() {
            const rookie = { level: "Rookie", type: "Fire" };
            const armorCard = { level: "Armor", type: "Fire", evoCost: 0, cardKind: "digimon" };
            const toArmor = evaluateEvolution(rookie, armorCard, 0);
            if (!toArmor.ok) throw new Error("Rookie→Armor should pass at 0 DP");

            const armorActive = { level: "Armor", type: "Fire" };
            const champion = { level: "Champion", type: "Fire", evoCost: 20, cardKind: "digimon" };
            const bareCrush = evaluateEvolution(armorActive, champion, 100);
            if (bareCrush.ok !== false || bareCrush.reason !== "needs_armor_option") {
                throw new Error("Armor→Champion without ArmorCrush must need option");
            }

            const crush = evaluateEvolution(armorActive, champion, 20, { armorCrush: true });
            if (!crush.ok) throw new Error("ArmorCrush should allow Armor→Champion");

            const deArmor = evaluateEvolution(
                armorActive,
                { level: "Rookie", type: "Fire", evoCost: 0, cardKind: "digimon" },
                0,
                { deArmor: true }
            );
            if (!deArmor.ok) throw new Error("De-Armor should allow Armor→Rookie");

            const crushOpt = CATALOG_BY_ID.get("294");
            const deOpt = CATALOG_BY_ID.get("298");
            if (crushOpt?.effectId !== "evolution_option.armor_crush") {
                throw new Error("ArmorCrush Digivolve must normalize to evolution_option.armor_crush");
            }
            if (deOpt?.effectId !== "evolution_option.de_armor") {
                throw new Error("De-Armor Digivolve must normalize to evolution_option.de_armor");
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
        id: "prep-subphase-transitions",
        fidelityIds: ["FC-003"],
        description: "Prep sub-phases advance mulligan→deploy→discard→evolve with aligned copy",
        run() {
            const profile = getRuleProfile("fidelity_ps1");
            if (prepSubPhaseAfterDraw(false, true, 1, profile) !== "mulligan") {
                throw new Error("opening should start at mulligan");
            }
            if (prepSubPhaseAfterDraw(true, false, 0, profile) !== "discard") {
                throw new Error("mid-game with active should start at discard");
            }
            if (nextPrepSubPhase("mulligan") !== "deploy") throw new Error("mulligan→deploy");
            if (nextPrepSubPhase("deploy") !== "discard") throw new Error("deploy→discard");
            if (nextPrepSubPhase("discard") !== "evolve") throw new Error("discard→evolve");
            if (nextPrepSubPhase("evolve") !== null) throw new Error("evolve ends prep");

            const discardMsg = getPrepServerMessage("discard");
            const evolveMsg = getPrepServerMessage("evolve");
            if (!discardMsg.toLowerCase().includes("dp")) {
                throw new Error(`discard copy should mention DP: ${discardMsg}`);
            }
            if (!evolveMsg.toLowerCase().includes("digivolve") && !evolveMsg.toLowerCase().includes("prep")) {
                throw new Error(`evolve copy should mention digivolve/prep: ${evolveMsg}`);
            }

            const ctx = {
                isYourTurn: true,
                hasActive: true,
                supportLocked: false,
                attackLocked: false,
            };
            if (!isPlayerActionLegal("END_DISCARD", { ...ctx, phase: "preparation", prepSubPhase: "discard" })) {
                throw new Error("END_DISCARD must be legal in discard");
            }
            if (isPlayerActionLegal("END_PREP", { ...ctx, phase: "preparation", prepSubPhase: "discard" })) {
                throw new Error("END_PREP must be illegal before evolve");
            }
            if (!isPlayerActionLegal("END_PREP", { ...ctx, phase: "preparation", prepSubPhase: "evolve" })) {
                throw new Error("END_PREP must be legal in evolve");
            }
        },
    },
    {
        id: "prep-flow-action-matrix",
        fidelityIds: ["FC-003"],
        description: "Prep action legality matrix across mulligan/deploy/discard/evolve",
        run() {
            const base = {
                isYourTurn: true,
                hasActive: true,
                supportLocked: false,
                attackLocked: false,
                phase: "preparation" as const,
            };

            const expectLegal = (
                action: PlayerActionType,
                prepSubPhase: "mulligan" | "deploy" | "discard" | "evolve",
                ok: boolean
            ) => {
                const legal = isPlayerActionLegal(action, {
                    ...base,
                    prepSubPhase,
                    hasActive: prepSubPhase !== "deploy" && prepSubPhase !== "mulligan",
                });
                if (legal !== ok) {
                    throw new Error(`${action} in ${prepSubPhase}: expected ${ok}, got ${legal}`);
                }
            };

            expectLegal("MULLIGAN", "mulligan", true);
            expectLegal("ACCEPT_HAND", "mulligan", true);
            expectLegal("DEPLOY_DIGIMON", "mulligan", false);
            expectLegal("DISCARD_FOR_DP", "mulligan", false);

            expectLegal("DEPLOY_DIGIMON", "deploy", true);
            expectLegal("DIG_FOR_DEPLOY", "deploy", true);
            expectLegal("DISCARD_FOR_DP", "deploy", false);
            expectLegal("END_PREP", "deploy", false);

            expectLegal("DISCARD_FOR_DP", "discard", true);
            expectLegal("END_DISCARD", "discard", true);
            expectLegal("PLAY_PREP_OPTION", "discard", true);
            expectLegal("EVOLVE", "discard", false);
            expectLegal("END_PREP", "discard", false);

            expectLegal("EVOLVE", "evolve", true);
            expectLegal("END_PREP", "evolve", true);
            expectLegal("PLAY_PREP_OPTION", "evolve", true);
            expectLegal("DISCARD_FOR_DP", "evolve", false);
            expectLegal("MULLIGAN", "evolve", false);
        },
    },
    {
        id: "prep-evolution-option-warp",
        fidelityIds: ["FC-008"],
        description: "Evolution option warp enables Rookie→Ultimate only during evolve window",
        run() {
            const warp = {
                id: "warp",
                cardKind: "evolution_option",
                effectId: "evolution_option.warp_evolve",
                effectArgs: { skipLevels: 1 },
            };
            if (!canPlayEvolutionOption(warp, "evolve", true)) {
                throw new Error("warp option must be playable during evolve");
            }
            if (canPlayEvolutionOption(warp, "discard", true)) {
                throw new Error("warp option must not attach during discard");
            }

            const mods = parseEvolutionModifiers(warp);
            const ok = canEvolveWithOption(
                { level: "Rookie", type: "Fire" },
                { level: "Ultimate", type: "Fire", evoCost: 50, cardKind: "digimon" },
                50,
                mods
            );
            if (!ok) throw new Error("warp should allow Rookie→Ultimate when DP is met");

            const blocked = canEvolveWithOption(
                { level: "Rookie", type: "Fire" },
                { level: "Ultimate", type: "Fire", evoCost: 50, cardKind: "digimon" },
                50,
                parseEvolutionModifiers(null)
            );
            if (blocked) throw new Error("Rookie→Ultimate must fail without warp");

            const prepGain = { cardKind: "option", effectId: "option.prep.gain_dp" };
            if (!canPlayPrepOption(prepGain, "discard", true) || !canPlayPrepOption(prepGain, "evolve", true)) {
                throw new Error("prep options must remain legal in discard and evolve");
            }
            const hand = [
                { id: "opt", cardKind: "option", effectId: "option.prep.gain_dp", effectArgs: { value: 20 } },
            ];
            const state = { dp: 0, hp: 500, maxHp: 1000, hand, deck: [], trash: [] };
            const resolved = resolvePrepOption(hand[0]!, state, () => 0);
            if (!resolved.ok || state.dp !== 20) {
                throw new Error("prep gain_dp option should add DP");
            }
        },
    },
    {
        id: "prep-flow-end-to-end",
        fidelityIds: ["FC-003", "FC-006", "FC-007", "FC-009"],
        description: "Integrated prep slice: discard DP → legal digivolve gate → post-evo recovery",
        run() {
            // FC-006 discard
            const hand = [
                { id: "d1", cardKind: "digimon", plusDp: 30 },
                { id: "d2", cardKind: "digimon", plusDp: 10 },
                { id: "o1", cardKind: "option", plusDp: 99 },
            ];
            const trash: typeof hand = [];
            const discard = applyDiscardForDp(hand, trash, ["d1", "o1", "d2"]);
            if (discard.dpGained !== 40 || discard.discardedIds.length !== 2) {
                throw new Error(`expected 40 DP from two digimon, got ${discard.dpGained}`);
            }

            // FC-007 digivolve gate with earned DP
            const gate = evaluateEvolution(
                { level: "Rookie", type: "Nature" },
                { level: "Champion", type: "Nature", evoCost: 40, cardKind: "digimon" },
                discard.dpGained
            );
            if (!gate.ok) throw new Error("40 DP should afford Champion evoCost 40");

            const tooExpensive = evaluateEvolution(
                { level: "Rookie", type: "Nature" },
                { level: "Champion", type: "Nature", evoCost: 41, cardKind: "digimon" },
                discard.dpGained
            );
            if (tooExpensive.ok !== false || tooExpensive.reason !== "insufficient_dp") {
                throw new Error("41 cost must reject with insufficient_dp");
            }

            // FC-009 recovery after evolve
            const ailments = parseStatusAilmentsJson('["poison"]');
            const recoveryState = {
                hp: 50,
                active: { hp: 50, maxHp: 700 },
                statusAilments: ailments,
                openingPenaltyActive: false,
            };
            const recovery = applyPostEvolutionRecovery(recoveryState);
            if (recovery.hpRestoredTo !== 700 || recoveryState.statusAilments.length !== 0) {
                throw new Error("post-evo recovery must restore HP and clear ailments");
            }

            // FC-003: after discard step, evolve is next; END_PREP only then
            if (nextPrepSubPhase("discard") !== "evolve") {
                throw new Error("discard must advance to evolve");
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
        id: "support-void-jamming",
        fidelityIds: ["FC-015"],
        description: "Void/jamming cancels enemy support before options and buffs resolve",
        run() {
            const active = {
                sessionId: "a",
                active: { type: "Fire" },
            };
            const defender = {
                sessionId: "d",
                active: { type: "Ice" },
            };
            const voidEffect = { type: "void_enemy_support", requireType: "", requireOpponentType: "" };
            const iceGated = { type: "void_enemy_support", requireType: "Ice", requireOpponentType: "" };

            if (!canVoidEnemySupport(active as never, voidEffect, defender as never, true)) {
                throw new Error("unconditional void should apply");
            }
            if (canVoidEnemySupport(active as never, iceGated, defender as never, true)) {
                throw new Error("Fire active must fail Ice-gated void");
            }
            if (!canVoidEnemySupport(defender as never, iceGated, active as never, true)) {
                throw new Error("Ice active must pass Ice-gated void");
            }

            const mutual = evaluateSupportNullification(
                active as never,
                defender as never,
                { supportEffect: voidEffect } as never,
                { supportEffect: voidEffect } as never
            );
            if (!mutual.activeVoided || !mutual.defenderVoided) {
                throw new Error("mutual void must cancel both");
            }

            const optionNullify = evaluateSupportNullification(
                active as never,
                defender as never,
                { cardKind: "option", supportEffect: null } as never,
                { cardKind: "digimon", supportEffect: voidEffect } as never
            );
            if (!optionNullify.activeVoided) {
                throw new Error("void must cancel enemy battle option");
            }
            if (optionNullify.defenderVoided) {
                throw new Error("option without void must not cancel defender void");
            }
        },
    },
    {
        id: "support-online-deck-gamble",
        fidelityIds: ["FC-013"],
        description: "Online Deck All-or-Nothing gamble draws top card when enabled",
        run() {
            const profile = getRuleProfile("fidelity_ps1");
            if (!profile.battle.allowOnlineDeckGamble) {
                throw new Error("fidelity_ps1 must allow online-deck gamble");
            }
            const deck = [
                { id: "top", name: "Agumon" },
                { id: "next", name: "Gabumon" },
            ];
            const result = attemptOnlineDeckSupportGamble(deck, true);
            if (result.ok === false) {
                throw new Error(`expected gamble ok, got ${result.reason}`);
            }
            if (result.card.id !== "top" || result.deckSizeAfter !== 1) {
                throw new Error("gamble must take the top Online Deck card");
            }
            if (deck.length !== 1 || deck[0].id !== "next") {
                throw new Error("deck must shrink after gamble");
            }
            const empty = attemptOnlineDeckSupportGamble([], true);
            if (empty.ok !== false || empty.reason !== "empty_deck") {
                throw new Error("empty Online Deck must reject gamble");
            }
            const disabled = attemptOnlineDeckSupportGamble([{ id: "x" }], false);
            if (disabled.ok !== false || disabled.reason !== "gamble_disabled") {
                throw new Error("disabled profile must reject gamble");
            }
        },
    },
    {
        id: "attack-specialty-foe-mult",
        fidelityIds: ["FC-016"],
        description: "Specialty Foe ×N triples attack power vs matching specialty (no universal RPS triangle)",
        run() {
            const wargreymon = CATALOG_BY_ID.get("002");
            if (!wargreymon) throw new Error("missing WarGreymon catalog entry");
            if (wargreymon.attacks.cross.effectId !== "attack.specialty_mult") {
                throw new Error(
                    `WarGreymon Cross should normalize Ice Foe x3, got ${wargreymon.attacks.cross.effectId}`
                );
            }
            if (wargreymon.attacks.cross.effectArgs.specialty !== "Ice") {
                throw new Error("WarGreymon Cross specialty arg should be Ice");
            }

            const ctx = createSupportBattleContext();
            const attacker: BattleCombatant = {
                sessionId: "a",
                hp: 2000,
                maxHp: 2000,
                specialty: "Fire",
                active: {
                    circle: { damage: 900 },
                    triangle: { damage: 670 },
                    cross: {
                        damage: 380,
                        effectId: "attack.specialty_mult",
                        effectArgsJson: JSON.stringify({ specialty: "Ice", multiplier: 3 }),
                    },
                },
            };
            const iceFoe: BattleCombatant = {
                sessionId: "d",
                hp: 2000,
                maxHp: 2000,
                specialty: "Ice",
                active: {
                    circle: { damage: 400 },
                    triangle: { damage: 300 },
                    cross: { damage: 200 },
                },
            };
            const fireFoe = { ...iceFoe, specialty: "Fire" };

            const vsIce = resolveFullBattle(attacker, iceFoe, "cross", "triangle", "a", ctx);
            if (vsIce.p2Hp !== 2000 - 1140) {
                throw new Error(`expected 1140 vs Ice, p2Hp=${vsIce.p2Hp}`);
            }
            if (!vsIce.events.some(e => e.type === "specialty_foe_mult")) {
                throw new Error("expected specialty_foe_mult event");
            }

            const vsFire = resolveFullBattle(attacker, fireFoe, "cross", "triangle", "a", ctx);
            if (vsFire.p2Hp !== 2000 - 380) {
                throw new Error(`expected no mult vs Fire, p2Hp=${vsFire.p2Hp}`);
            }
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
        id: "reconnect-disconnect-fairness",
        fidelityIds: ["FC-024"],
        description: "Grace on drop; consented/expired leave forfeits mid-match only",
        run() {
            if (RECONNECT_GRACE_SECONDS <= 0) throw new Error("grace must be positive");
            if (!shouldOfferReconnectGrace("battle_support", false)) {
                throw new Error("unexpected drop mid-match must offer grace");
            }
            if (shouldOfferReconnectGrace("battle_support", true)) {
                throw new Error("consented leave must not offer grace");
            }
            if (shouldOfferReconnectGrace("victory", false)) {
                throw new Error("victory drop must not offer grace");
            }
            if (!isConsentedLeave(4000)) throw new Error("4000 is consented leave");
            if (!shouldForfeitOnPermanentLeave("preparation", 2)) {
                throw new Error("permanent leave mid-match must forfeit");
            }
            if (shouldForfeitOnPermanentLeave("waiting", 2)) {
                throw new Error("waiting leave must not forfeit");
            }
            if (shouldForfeitOnPermanentLeave("victory", 2)) {
                throw new Error("victory leave must not re-forfeit");
            }
        },
    },
    {
        id: "catalog-taxonomy-effect-normalize",
        fidelityIds: ["FC-026", "FC-027"],
        description: "All cardKinds present; 1st Attack/Jamming/Foe normalize to effectIds",
        run() {
            const kinds = new Set(CATALOG.map(c => c.cardKind));
            if (!kinds.has("digimon") || !kinds.has("option") || !kinds.has("evolution_option")) {
                throw new Error("missing cardKind in taxonomy");
            }
            const first = CATALOG.find(c => c.attacks.cross.description === "1st Attack");
            if (!first || first.attacks.cross.effectId !== "attack.first_strike") {
                throw new Error("1st Attack must normalize to attack.first_strike");
            }
            const jam = CATALOG.find(c => c.attacks.cross.description === "Jamming");
            if (!jam || jam.attacks.cross.effectId !== "attack.jamming") {
                throw new Error("Jamming must normalize to attack.jamming");
            }
            const foe = CATALOG.find(c => /Foe x\d/i.test(c.attacks.cross.description));
            if (!foe || foe.attacks.cross.effectId !== "attack.specialty_mult") {
                throw new Error("Specialty Foe must normalize to attack.specialty_mult");
            }
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
            // Use a deck that is known to include options. Random/index base decks can be
            // digimon-only (~2%), which would incorrectly pass no_options validation.
            const ids = buildSyntheticDefaultDeck(CATALOG, 0);
            const hasOption = ids.some(id => {
                const card = CATALOG_BY_ID.get(id);
                return card?.cardKind === "option" || card?.cardKind === "evolution_option";
            });
            if (!hasOption) throw new Error("synthetic default deck must include option cards");

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
