/**
 * Data-driven prep / evolution / battle option resolution (E3).
 * @see docs/fidelity-rules-contract.md FC-008
 */

import type { EffectArgs } from "../types";
import { readNumberArg } from "./effectArgs";
import {
    inferCompoundSupportEffect,
    inferSupportEffectFromDescription,
    splitEffectClauses,
} from "./effectTextNormalize";
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
    supportEffect?: { type?: string; description?: string; value?: number; targetAttack?: string } | null;
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
    /** Mutant Digivolve: onto a same-Level Digimon. */
    sameLevel: boolean;
    /** Download Digivolve: any level path allowed. */
    ignoreLevel: boolean;
    /** Skip the specialty gate (Mutant / Download). */
    ignoreSpecialty: boolean;
    /** Skip the DP cost gate (Download). */
    ignoreDp: boolean;
}

const EMPTY_MODIFIERS: EvolutionModifiers = {
    warpSkipLevels: 0,
    dpCostDelta: 0,
    restoreFullStats: false,
    armorCrush: false,
    deArmor: false,
    sameLevel: false,
    ignoreLevel: false,
    ignoreSpecialty: false,
    ignoreDp: false,
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
        case "evolution_option.mutant":
            return {
                ...EMPTY_MODIFIERS,
                sameLevel: true,
                ignoreSpecialty: true,
            };
        case "evolution_option.download":
            return {
                ...EMPTY_MODIFIERS,
                ignoreLevel: true,
                ignoreSpecialty: true,
                ignoreDp: true,
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
        sameLevel: a.sameLevel || b.sameLevel,
        ignoreLevel: a.ignoreLevel || b.ignoreLevel,
        ignoreSpecialty: a.ignoreSpecialty || b.ignoreSpecialty,
        ignoreDp: a.ignoreDp || b.ignoreDp,
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
        sameLevel: modifiers.sameLevel,
        ignoreLevel: modifiers.ignoreLevel,
        ignoreSpecialty: modifiers.ignoreSpecialty,
        ignoreDp: modifiers.ignoreDp,
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
    firstStrikePlayers?: Set<string>;
    eatUpHpPlayers?: Set<string>;
    attackMultiplier?: Map<string, { circle: number; triangle: number; cross: number }>;
}

/** Mutable HP snapshot for battle-option heals (caller writes back to player schema). */
export interface BattleOptionHpTarget {
    hp: number;
    maxHp: number;
}

function applyAtkBuffToContext(
    ctx: AttackBonusContext,
    sourceSessionId: string,
    value: number,
    targetAttack: string
): boolean {
    if (value === 0) return false;
    const bonus = ctx.attackBonus.get(sourceSessionId) ?? { circle: 0, triangle: 0, cross: 0 };
    if (targetAttack === "all" || !targetAttack) {
        bonus.circle += value;
        bonus.triangle += value;
        bonus.cross += value;
    } else if (
        targetAttack === "circle" ||
        targetAttack === "triangle" ||
        targetAttack === "cross"
    ) {
        bonus[targetAttack] += value;
    } else {
        return false;
    }
    ctx.attackBonus.set(sourceSessionId, bonus);
    return true;
}

function applyHpHealToTarget(target: BattleOptionHpTarget | undefined, value: number): boolean {
    if (!target || value <= 0 || target.maxHp <= 0) return false;
    const before = target.hp;
    target.hp = Math.min(target.maxHp, target.hp + value);
    return target.hp !== before || value > 0;
}

function applyBattleOptionPrimitive(
    type: string,
    args: EffectArgs,
    sourceSessionId: string,
    ctx: AttackBonusContext,
    hpTarget?: BattleOptionHpTarget
): boolean {
    switch (type) {
        case "option.battle.atk_buff":
        case "support.atk_buff":
        case "atk_buff": {
            const buff = getBattleOptionAttackBuff(args);
            if (!buff) return false;
            return applyAtkBuffToContext(ctx, sourceSessionId, buff.value, buff.targetAttack);
        }
        case "option.battle.hp_heal":
        case "support.hp_heal":
        case "hp_heal": {
            const value = readNumberArg(args, "value", 0);
            return applyHpHealToTarget(hpTarget, value);
        }
        case "support.first_strike":
        case "first_strike": {
            ctx.firstStrikePlayers?.add(sourceSessionId);
            return !!ctx.firstStrikePlayers;
        }
        case "support.grant_eat_up_hp":
        case "grant_eat_up_hp": {
            ctx.eatUpHpPlayers?.add(sourceSessionId);
            return !!ctx.eatUpHpPlayers;
        }
        case "support.atk_mult":
        case "atk_mult": {
            const multMap = ctx.attackMultiplier;
            if (!multMap) return false;
            const factor = readNumberArg(args, "value", 2);
            const t = typeof args.targetAttack === "string" ? args.targetAttack : "all";
            const mult = multMap.get(sourceSessionId) ?? { circle: 1, triangle: 1, cross: 1 };
            if (t === "all" || !t) {
                mult.circle *= factor;
                mult.triangle *= factor;
                mult.cross *= factor;
            } else if (t === "circle" || t === "triangle" || t === "cross") {
                mult[t] *= factor;
            } else {
                return false;
            }
            multMap.set(sourceSessionId, mult);
            return true;
        }
        default:
            return false;
    }
}

/**
 * Apply a surviving battle option (after void checks).
 * Covers normalized option.battle.* ids, support.* aliases, and legacy supportEffect text.
 */
export function applyBattleOptionToContext(
    card: OptionCardLike,
    sourceSessionId: string,
    ctx: AttackBonusContext,
    hpTarget?: BattleOptionHpTarget
): boolean {
    const args = card.effectArgs ?? {};
    const effectId = String(card.effectId ?? "").trim();

    if (effectId === "option.battle.atk_buff" || effectId === "option.battle.hp_heal") {
        return applyBattleOptionPrimitive(effectId, args, sourceSessionId, ctx, hpTarget);
    }

    if (
        effectId === "support.hp_heal" ||
        effectId === "support.atk_buff" ||
        effectId === "support.first_strike" ||
        effectId === "support.grant_eat_up_hp" ||
        effectId === "support.atk_mult"
    ) {
        return applyBattleOptionPrimitive(effectId, args, sourceSessionId, ctx, hpTarget);
    }

    // Compose / catalog_text: route clauses through the same primitives as digimon support.
    const supportType = String(card.supportEffect?.type ?? "").trim();
    const description = String(card.supportEffect?.description ?? "").trim();

    if (supportType === "compose" || supportType === "catalog_text" || (!effectId && description)) {
        const inferred =
            supportType === "compose" && description
                ? { type: "compose" as const, description }
                : inferCompoundSupportEffect(description) ??
                  (supportType && supportType !== "catalog_text"
                      ? {
                            type: supportType,
                            value:
                                card.supportEffect?.value ??
                                readNumberArg(args, "value", 0),
                            targetAttack:
                                card.supportEffect?.targetAttack ||
                                (typeof args.targetAttack === "string"
                                    ? args.targetAttack
                                    : undefined),
                            description,
                        }
                      : null);

        if (!inferred) return false;

        if (inferred.type === "compose") {
            const clauses = splitEffectClauses(inferred.description ?? description);
            let any = false;
            for (const clause of clauses) {
                const step = inferSupportEffectFromDescription(clause);
                if (!step) continue;
                const stepArgs: EffectArgs = {
                    ...(step.value != null ? { value: step.value } : {}),
                    ...(step.targetAttack ? { targetAttack: step.targetAttack } : {}),
                };
                if (
                    applyBattleOptionPrimitive(
                        step.type,
                        stepArgs,
                        sourceSessionId,
                        ctx,
                        hpTarget
                    )
                ) {
                    any = true;
                }
            }
            return any;
        }

        const stepArgs: EffectArgs = {
            ...args,
            ...(inferred.value != null ? { value: inferred.value } : {}),
            ...(inferred.targetAttack ? { targetAttack: inferred.targetAttack } : {}),
        };
        return applyBattleOptionPrimitive(
            inferred.type,
            stepArgs,
            sourceSessionId,
            ctx,
            hpTarget
        );
    }

    if (
        supportType === "hp_heal" ||
        supportType === "atk_buff" ||
        supportType === "first_strike" ||
        supportType === "grant_eat_up_hp"
    ) {
        const stepArgs: EffectArgs = {
            ...args,
            ...(card.supportEffect?.value != null ? { value: card.supportEffect.value } : {}),
            ...(card.supportEffect?.targetAttack
                ? { targetAttack: card.supportEffect.targetAttack }
                : {}),
        };
        return applyBattleOptionPrimitive(supportType, stepArgs, sourceSessionId, ctx, hpTarget);
    }

    return false;
}
