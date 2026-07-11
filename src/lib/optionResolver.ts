/**
 * Data-driven prep / evolution / battle option resolution (E3).
 * @see docs/fidelity-rules-contract.md FC-008
 */

import type { EffectArgs } from "../types";
import { readNumberArg } from "./effectArgs";
import { evaluateEvolution } from "./evolutionEligibility";

export interface OptionCardLike {
    id: string;
    cardKind: string;
    effectId: string;
    effectArgs?: EffectArgs;
    level?: string;
    type?: string;
    evoCost?: number;
    maxHp?: number;
    hp?: number;
    circle?: { damage: number };
    triangle?: { damage: number };
    cross?: { damage: number };
    supportEffect?: { type?: string } | null;
}

export interface CatalogStatSnapshot {
    maxHp: number;
    circle: number;
    triangle: number;
    cross: number;
}

export interface PrepOptionMutableState {
    dp: number;
    hp: number;
    maxHp: number;
    hand: OptionCardLike[];
    deck: OptionCardLike[];
    trash: OptionCardLike[];
}

export type PrepOptionResult =
    | { ok: true; effectId: string; detail?: Record<string, unknown> }
    | { ok: false; reason: string };

export interface EvolutionModifiers {
    warpSkipLevels: number;
    dpCostDelta: number;
    restoreFullStats: boolean;
    /** ArmorCrush Digivolve: Armor → Champion or Ultimate. */
    armorCrush: boolean;
    /** De-Armor Digivolve: Armor → Rookie. */
    deArmor: boolean;
}

const EMPTY_MODIFIERS: EvolutionModifiers = {
    warpSkipLevels: 0,
    dpCostDelta: 0,
    restoreFullStats: false,
    armorCrush: false,
    deArmor: false,
};

export function parseEvolutionModifiers(card: OptionCardLike | null | undefined): EvolutionModifiers {
    if (!card || card.cardKind !== "evolution_option") return { ...EMPTY_MODIFIERS };

    const args = card.effectArgs ?? {};
    switch (card.effectId) {
        case "evolution_option.warp_evolve":
            return {
                ...EMPTY_MODIFIERS,
                warpSkipLevels: Math.max(0, readNumberArg(args, "skipLevels", 1)),
                dpCostDelta: readNumberArg(args, "dpCostDelta", 0),
            };
        case "evolution_option.dp_adjust":
            return {
                ...EMPTY_MODIFIERS,
                warpSkipLevels: Math.max(0, readNumberArg(args, "skipLevels", 0)),
                dpCostDelta: readNumberArg(args, "delta", 0),
            };
        case "evolution_option.restore_full_stats":
            return {
                ...EMPTY_MODIFIERS,
                dpCostDelta: readNumberArg(args, "dpCostDelta", 0),
                restoreFullStats: true,
            };
        case "evolution_option.armor_crush":
            return {
                ...EMPTY_MODIFIERS,
                armorCrush: true,
            };
        case "evolution_option.de_armor":
            return {
                ...EMPTY_MODIFIERS,
                deArmor: true,
            };
        default:
            return { ...EMPTY_MODIFIERS };
    }
}

export function mergeEvolutionModifiers(a: EvolutionModifiers, b: EvolutionModifiers): EvolutionModifiers {
    return {
        warpSkipLevels: Math.max(a.warpSkipLevels, b.warpSkipLevels),
        dpCostDelta: a.dpCostDelta + b.dpCostDelta,
        restoreFullStats: a.restoreFullStats || b.restoreFullStats,
        armorCrush: a.armorCrush || b.armorCrush,
        deArmor: a.deArmor || b.deArmor,
    };
}

export function canEvolveWithOption(
    active: { level: string; type: string } | null | undefined,
    target: { level: string; type: string; evoCost: number; cardKind?: string },
    playerDp: number,
    modifiers: EvolutionModifiers
): boolean {
    return evaluateEvolution(active, target, playerDp, {
        dpCostDelta: modifiers.dpCostDelta,
        warpSkipLevels: modifiers.warpSkipLevels,
        armorCrush: modifiers.armorCrush,
        deArmor: modifiers.deArmor,
    }).ok;
}

export function resolvePrepOption(
    card: OptionCardLike,
    state: PrepOptionMutableState,
    drawFromDeck: (count: number) => number
): PrepOptionResult {
    const args = card.effectArgs ?? {};

    switch (card.effectId) {
        case "option.prep.gain_dp": {
            const value = readNumberArg(args, "value", 0);
            if (value <= 0) return { ok: false, reason: "invalid_gain_dp_value" };
            state.dp += value;
            return { ok: true, effectId: card.effectId, detail: { gained: value, dp: state.dp } };
        }
        case "option.prep.draw": {
            const count = Math.max(1, readNumberArg(args, "count", 1));
            const drawn = drawFromDeck(count);
            return { ok: true, effectId: card.effectId, detail: { requested: count, drawn } };
        }
        case "option.prep.heal_active": {
            const value = readNumberArg(args, "value", 0);
            if (value <= 0) return { ok: false, reason: "invalid_heal_value" };
            if (state.maxHp <= 0) return { ok: false, reason: "no_active_digimon" };
            const before = state.hp;
            state.hp = Math.min(state.maxHp, state.hp + value);
            return { ok: true, effectId: card.effectId, detail: { before, after: state.hp } };
        }
        case "option.prep.fetch_trash_digimon": {
            const trashIdx = state.trash.findIndex(c => c.cardKind === "digimon" || !c.cardKind);
            if (trashIdx === -1) return { ok: false, reason: "no_digimon_in_trash" };
            const [fetched] = state.trash.splice(trashIdx, 1);
            state.hand.push(fetched);
            return { ok: true, effectId: card.effectId, detail: { fetchedId: fetched.id } };
        }
        default:
            return { ok: false, reason: "unsupported_prep_option" };
    }
}

export function applyFullStatsFromCatalog(card: OptionCardLike, catalog: CatalogStatSnapshot): void {
    card.maxHp = catalog.maxHp;
    card.hp = catalog.maxHp;
    if (card.circle) card.circle.damage = catalog.circle;
    if (card.triangle) card.triangle.damage = catalog.triangle;
    if (card.cross) card.cross.damage = catalog.cross;
}

export function shouldRestoreFullStatsAfterEvolve(
    modifiers: EvolutionModifiers,
    openingPenaltyActive: boolean,
    fromLevel: string,
    toLevel: string
): boolean {
    if (modifiers.restoreFullStats) return true;
    // PS1 manual: penalized Level C -> Level U with any Digivolve Option restores full power.
    if (!openingPenaltyActive) return false;
    const from = fromLevel.trim().toLowerCase();
    const to = toLevel.trim().toLowerCase();
    return from === "champion" && to === "ultimate";
}

export function getBattleOptionAttackBuff(args: EffectArgs): { targetAttack: string; value: number } | null {
    const value = readNumberArg(args, "value", 0);
    if (value === 0) return null;
    const targetAttack = typeof args.targetAttack === "string" ? args.targetAttack : "all";
    return { targetAttack, value };
}

export interface AttackBonusContext {
    attackBonus: Map<string, { circle: number; triangle: number; cross: number }>;
}

export function applyBattleOptionToContext(
    card: OptionCardLike,
    sourceSessionId: string,
    ctx: AttackBonusContext
): boolean {
    if (card.effectId !== "option.battle.atk_buff") return false;
    const buff = getBattleOptionAttackBuff(card.effectArgs ?? {});
    if (!buff) return false;

    const bonus = ctx.attackBonus.get(sourceSessionId) ?? { circle: 0, triangle: 0, cross: 0 };
    if (buff.targetAttack === "all") {
        bonus.circle += buff.value;
        bonus.triangle += buff.value;
        bonus.cross += buff.value;
    } else if (buff.targetAttack === "circle" || buff.targetAttack === "triangle" || buff.targetAttack === "cross") {
        bonus[buff.targetAttack] += buff.value;
    }
    ctx.attackBonus.set(sourceSessionId, bonus);
    return true;
}
