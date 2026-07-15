/**
 * Support phase resolution + nullification / jamming (FC-015).
 * Cancellation (void) resolves before other support and battle-option effects.
 * @see docs/fidelity-rules-contract.md FC-015, GDD.md Phase 3 Step 2
 */

import type { CardSchema, PlayerSchema, SupportEffectSchema } from "../schema/BattleState";
import { sortEffectsByConflictPolicy } from "./effectConflictResolver";
import {
    inferConditionalEffect,
    inferSupportEffectFromDescription,
    splitConsequentClauses,
    splitEffectClauses,
} from "./effectTextNormalize";
import {
    evaluateCondition,
    parseCondition,
    splitConditional,
    type ConditionContext,
    type ConditionSubject,
} from "./effectCondition";

export type AttackType = "circle" | "triangle" | "cross";

export type SupportEffectType =
    | "void_enemy_support"
    | "first_strike"
    | "attack_second"
    | "grant_counter"
    | "change_attack"
    | "both_change_attack"
    | "force_self_attack"
    | "rotate_enemy_attack"
    | "atk_mult"
    | "atk_set"
    | "atk_set_to_hp"
    | "atk_add_hp"
    | "enemy_atk_zero"
    | "enemy_atk_set"
    | "enemy_atk_lower"
    | "enemy_atk_halve"
    | "enemy_atk_mult"
    | "halve_hp"
    | "self_halve_hp"
    | "both_halve_hp"
    | "hp_set"
    | "enemy_hp_set"
    | "hp_double"
    | "enemy_hp_double"
    | "hp_swap"
    | "hp_copy_from_opponent"
    | "enemy_hp_copy_from_own"
    | "atk_buff"
    | "both_atk_buff"
    | "both_atk_zero"
    | "hp_heal"
    | "change_own_specialty"
    | "enemy_hp_heal"
    | "change_enemy_specialty"
    | "both_change_specialty"
    | "swap_specialty"
    | "enemy_specialty_becomes_own"
    | "copy_opponent_stats"
    | "hand_x_atk"
    | "atk_add_dp_count"
    | "hp_add_dp_count"
    | "discard_own_dp"
    | "discard_enemy_dp"
    | "atk_mult_by_dp_discards"
    | "hp_add_dp_discards"
    | "discard_both_dp_equal"
    | "grant_eat_up_hp"
    | "zero_attacks"
    | "draw_cards"
    | "conditional"
    | "compose";

/** Spec §2.B — lower runs first within the battle support stack. */
export const SUPPORT_PRIORITY: Record<SupportEffectType, number> = {
    void_enemy_support: 1,
    first_strike: 1,
    attack_second: 1,
    grant_counter: 1,
    change_attack: 2,
    both_change_attack: 2,
    force_self_attack: 2,
    rotate_enemy_attack: 2,
    change_own_specialty: 2,
    change_enemy_specialty: 2,
    both_change_specialty: 2,
    swap_specialty: 2,
    enemy_specialty_becomes_own: 2,
    atk_mult: 3,
    atk_set: 3,
    enemy_atk_zero: 3,
    enemy_atk_set: 3,
    enemy_atk_halve: 3,
    enemy_atk_mult: 3,
    zero_attacks: 3,
    both_atk_zero: 3,
    halve_hp: 3,
    self_halve_hp: 3,
    both_halve_hp: 3,
    hp_set: 3,
    enemy_hp_set: 3,
    hp_double: 3,
    enemy_hp_double: 3,
    hp_swap: 3,
    hp_copy_from_opponent: 3,
    enemy_hp_copy_from_own: 3,
    atk_buff: 4,
    both_atk_buff: 4,
    enemy_atk_lower: 4,
    atk_add_hp: 4,
    atk_set_to_hp: 4,
    hand_x_atk: 4,
    grant_eat_up_hp: 4,
    copy_opponent_stats: 4,
    atk_add_dp_count: 4,
    hp_add_dp_count: 4,
    discard_own_dp: 3,
    discard_enemy_dp: 3,
    atk_mult_by_dp_discards: 3,
    discard_both_dp_equal: 3,
    compose: 4,
    conditional: 4,
    draw_cards: 5,
    hp_heal: 5,
    enemy_hp_heal: 5,
    hp_add_dp_discards: 5,
};

export type SupportEffectInput = {
    type: SupportEffectType | string;
    targetAttack?: string;
    value?: number;
    description?: string;
    requireType?: string;
    requireOpponentType?: string;
    priority?: number;
};

export type AttackBonuses = { circle: number; triangle: number; cross: number };
export type AttackMultipliers = { circle: number; triangle: number; cross: number };
/** Hard-set final attack power per slot; null = no override for that slot (FC-027). */
export type AttackOverride = { circle: number | null; triangle: number | null; cross: number | null };

export interface SupportBattleContext {
    attackBonus: Map<string, AttackBonuses>;
    attackMultiplier: Map<string, AttackMultipliers>;
    /** Absolute attack-power set ("becomes 300", "= own HP"); wins over bonus/mult. */
    attackOverride: Map<string, AttackOverride>;
    firstStrikePlayers: Set<string>;
    /** Support-forced "attack second" (mirror of first strike, FC-027). */
    attackSecondPlayers: Set<string>;
    forcedAttack: Map<string, AttackType>;
    /** Support-granted Eat-up HP for the rest of this exchange (FC-027). */
    eatUpHpPlayers: Set<string>;
    /** Support-granted counterattack: reflect+nullify a matching incoming attack (FC-027). */
    counterGrants: Map<string, { targetAttack: string; multiplier: number }>;
}

export function createSupportBattleContext(): SupportBattleContext {
    return {
        attackBonus: new Map(),
        attackMultiplier: new Map(),
        attackOverride: new Map(),
        firstStrikePlayers: new Set(),
        attackSecondPlayers: new Set(),
        forcedAttack: new Map(),
        eatUpHpPlayers: new Set(),
        counterGrants: new Map(),
    };
}

function emptyBonuses(): AttackBonuses {
    return { circle: 0, triangle: 0, cross: 0 };
}

function emptyMultipliers(): AttackMultipliers {
    return { circle: 1, triangle: 1, cross: 1 };
}

function getBonuses(ctx: SupportBattleContext, sessionId: string): AttackBonuses {
    return ctx.attackBonus.get(sessionId) ?? emptyBonuses();
}

function getMultipliers(ctx: SupportBattleContext, sessionId: string): AttackMultipliers {
    return ctx.attackMultiplier.get(sessionId) ?? emptyMultipliers();
}

function emptyOverride(): AttackOverride {
    return { circle: null, triangle: null, cross: null };
}

function getOverride(ctx: SupportBattleContext, sessionId: string): AttackOverride {
    return ctx.attackOverride?.get(sessionId) ?? emptyOverride();
}

function setAttackOverride(
    ctx: SupportBattleContext,
    sessionId: string,
    targetAttack: string,
    value: number
) {
    if (!ctx.attackOverride) ctx.attackOverride = new Map();
    const ov = getOverride(ctx, sessionId);
    const v = Math.max(0, value);
    if (targetAttack === "all" || !targetAttack) {
        ov.circle = v;
        ov.triangle = v;
        ov.cross = v;
    } else if (targetAttack === "circle" || targetAttack === "triangle" || targetAttack === "cross") {
        ov[targetAttack] = v;
    }
    ctx.attackOverride.set(sessionId, ov);
}

/**
 * Runtime facts a conditional / dynamic support effect needs beyond the two
 * PlayerSchemas: the effective attacks and a source-relative condition context.
 * Absent in the legacy simultaneous profile (attacks not yet chosen).
 */
export interface EffectRuntime {
    condition: ConditionContext;
    selfAttack: AttackType | null;
    opponentAttack: AttackType | null;
}

function conditionSubject(player: PlayerSchema, attack: AttackType | null): ConditionSubject {
    return {
        attack,
        hp: player.hp,
        level: player.active?.level ?? "",
        specialty: player.active?.type ?? "",
        handCount: player.hand.length,
        dpSlotCount: player.dpSlot?.length ?? 0,
    };
}

function buildEffectRuntime(
    source: PlayerSchema,
    target: PlayerSchema,
    sourceAttack: AttackType | null,
    targetAttack: AttackType | null
): EffectRuntime {
    return {
        condition: {
            self: conditionSubject(source, sourceAttack),
            opponent: conditionSubject(target, targetAttack),
        },
        selfAttack: sourceAttack,
        opponentAttack: targetAttack,
    };
}

const ATTACK_ROTATION: Record<AttackType, AttackType> = {
    circle: "triangle",
    triangle: "cross",
    cross: "circle",
};

function effectPriority(effect: SupportEffectSchema | SupportEffectInput): number {
    const custom = Number((effect as SupportEffectInput).priority ?? 0);
    if (custom > 0) return custom;
    const t = effect.type as SupportEffectType;
    return SUPPORT_PRIORITY[t] ?? 99;
}

/** Normalize specialty labels (Darkness → Dark). */
export function normalizeSpecialty(type: string): string {
    const t = String(type).trim().toLowerCase();
    if (t === "darkness") return "dark";
    return t;
}

export function specialtiesMatch(a: string, b: string): boolean {
    return normalizeSpecialty(a) === normalizeSpecialty(b);
}

function passesTypeGate(source: PlayerSchema, effect: SupportEffectSchema | SupportEffectInput): boolean {
    const required = String((effect as SupportEffectInput).requireType ?? "").trim();
    if (!required) return true;
    const activeType = source.active?.type ?? "";
    return specialtiesMatch(activeType, required);
}

function passesOpponentTypeGate(
    opponent: PlayerSchema,
    effect: SupportEffectSchema | SupportEffectInput
): boolean {
    const required = String((effect as SupportEffectInput).requireOpponentType ?? "").trim();
    if (!required) return true;
    const oppType = opponent.active?.type ?? "";
    return specialtiesMatch(oppType, required);
}

export function isVoidEffect(effect: SupportEffectSchema | SupportEffectInput | null | undefined): boolean {
    return effect?.type === "void_enemy_support";
}

/**
 * True when this support effect can nullify the opponent's support this reveal.
 * Specialty gates (own / opponent) must pass; enemy must have a support card.
 */
export function canVoidEnemySupport(
    source: PlayerSchema,
    effect: SupportEffectSchema | SupportEffectInput | null | undefined,
    opponent: PlayerSchema,
    opponentHasSupport: boolean
): boolean {
    if (!isVoidEffect(effect) || !opponentHasSupport || !effect) return false;
    if (!passesTypeGate(source, effect)) return false;
    if (!passesOpponentTypeGate(opponent, effect)) return false;
    return true;
}

export type SupportNullificationResult = {
    /** Active player's support was cancelled by defender void/jamming. */
    activeVoided: boolean;
    /** Defender's support was cancelled by active void/jamming. */
    defenderVoided: boolean;
};

function attackHasEffect(
    player: PlayerSchema,
    attack: AttackType | null | undefined,
    effectId: string
): boolean {
    if (!attack || !player.active) return false;
    const slot =
        attack === "circle"
            ? player.active.circle
            : attack === "triangle"
              ? player.active.triangle
              : player.active.cross;
    return String(slot.effectId ?? "") === effectId;
}

export function evaluateSupportNullification(
    active: PlayerSchema,
    defender: PlayerSchema,
    activeSupport: CardSchema | null,
    defenderSupport: CardSchema | null,
    lockedAttacks?: {
        activeAttack?: AttackType | null;
        defenderAttack?: AttackType | null;
    }
): SupportNullificationResult {
    const activeEffect = activeSupport?.supportEffect ?? null;
    const defenderEffect = defenderSupport?.supportEffect ?? null;

    const activeVoidsEnemy = canVoidEnemySupport(active, activeEffect, defender, !!defenderSupport);
    const defenderVoidsEnemy = canVoidEnemySupport(defender, defenderEffect, active, !!activeSupport);
    const activeJams = attackHasEffect(active, lockedAttacks?.activeAttack, "attack.jamming");
    const defenderJams = attackHasEffect(defender, lockedAttacks?.defenderAttack, "attack.jamming");

    return {
        activeVoided: defenderVoidsEnemy || defenderJams,
        defenderVoided: activeVoidsEnemy || activeJams,
    };
}

type QueuedEffect = {
    source: PlayerSchema;
    target: PlayerSchema;
    effect: SupportEffectSchema;
    priority: number;
    isActivePlayer: boolean;
};

/**
 * Parse legacy `support_id` tokens (buff_o_200, void_enemy_support, swap_enemy_o_to_t).
 * Used when loading card data that still uses string ids.
 */
export function parseSupportId(supportId: string): SupportEffectInput | null {
    if (!supportId || supportId === "none") return null;
    const tokens = supportId.split("_");
    const action = tokens[0];

    if (action === "void" && tokens[1] === "enemy" && tokens[2] === "support") {
        return { type: "void_enemy_support", description: "Nullify enemy Support." };
    }
    if (supportId === "first_strike") {
        return { type: "first_strike", description: "Attack hits first." };
    }
    if (action === "swap" && tokens[1] === "enemy") {
        const to = tokens[4] ?? tokens[3];
        const attack = letterToAttack(to);
        if (attack) {
            return {
                type: "change_attack",
                targetAttack: attack,
                description: `Force enemy ${attack} attack.`,
            };
        }
    }
    if (action === "half" && tokens[1] === "enemy" && tokens[2] === "hp") {
        return { type: "halve_hp", description: "Halve opponent HP." };
    }
    if (action === "buff") {
        const target = tokens[1];
        const value = parseInt(tokens[2] ?? "0", 10) || 0;
        if (target === "all") {
            return { type: "atk_buff", targetAttack: "all", value, description: `+${value} all attacks.` };
        }
        const atk = letterToAttack(target);
        if (atk) {
            return { type: "atk_buff", targetAttack: atk, value, description: `+${value} ${atk} attack.` };
        }
    }
    if (action === "heal" && tokens[1] === "hp") {
        const value = parseInt(tokens[2] ?? "0", 10) || 0;
        return { type: "hp_heal", value, description: `Recover ${value} HP.` };
    }
    return null;
}

function letterToAttack(letter: string | undefined): AttackType | null {
    if (!letter) return null;
    const l = letter.toLowerCase();
    if (l === "o" || l === "circle") return "circle";
    if (l === "t" || l === "triangle") return "triangle";
    if (l === "x" || l === "cross") return "cross";
    return null;
}

function applyAtkBuff(
    ctx: SupportBattleContext,
    sessionId: string,
    value: number,
    targetAttack: string
) {
    const bonus = getBonuses(ctx, sessionId);
    const t = targetAttack;
    if (t === "all" || !t) {
        bonus.circle += value;
        bonus.triangle += value;
        bonus.cross += value;
    } else if (t === "circle" || t === "triangle" || t === "cross") {
        bonus[t] += value;
    }
    ctx.attackBonus.set(sessionId, bonus);
}

function applyZeroAttacks(ctx: SupportBattleContext, sessionId: string, targetsCsv: string) {
    const mult = getMultipliers(ctx, sessionId);
    const parts = targetsCsv.split(",").map(s => s.trim().toLowerCase());
    for (const p of parts) {
        if (p === "circle" || p === "triangle" || p === "cross") {
            mult[p] = 0;
        } else if (p === "all" || !p) {
            mult.circle = 0;
            mult.triangle = 0;
            mult.cross = 0;
        }
    }
    ctx.attackMultiplier.set(sessionId, mult);
}

/** Build a schema-shaped effect from an inferred clause for recursive application. */
function inferredToEffect(step: {
    type: string;
    targetAttack?: string;
    value?: number;
    description?: string;
}): SupportEffectSchema {
    return {
        type: step.type,
        targetAttack: step.targetAttack ?? "",
        value: step.value ?? 0,
        description: step.description ?? "",
        requireType: "",
        requireOpponentType: "",
        priority: 0,
    } as unknown as SupportEffectSchema;
}

/** Move up to `count` cards from a player's DP Slot to trash, reducing their DP gauge. */
function discardDpCards(player: PlayerSchema, count: number): number {
    const slot = player.dpSlot;
    if (!slot) return 0;
    const n = Math.min(Math.max(0, count), slot.length);
    let removedDp = 0;
    for (let i = 0; i < n; i++) {
        const card = slot.shift();
        if (!card) break;
        removedDp += Number((card as { plusDp?: number }).plusDp ?? 0);
        player.trash?.push(card);
    }
    player.dp = Math.max(0, player.dp - removedDp);
    return n;
}

function multiplyAttack(ctx: SupportBattleContext, sessionId: string, factor: number, target: string) {
    const mult = getMultipliers(ctx, sessionId);
    if (target === "all" || !target) {
        mult.circle *= factor;
        mult.triangle *= factor;
        mult.cross *= factor;
    } else if (target === "circle" || target === "triangle" || target === "cross") {
        mult[target] *= factor;
    }
    ctx.attackMultiplier.set(sessionId, mult);
}

function applySingleEffect(
    source: PlayerSchema,
    target: PlayerSchema,
    effect: SupportEffectSchema,
    ctx: SupportBattleContext,
    hooks?: ResolveSupportHooks,
    runtime?: EffectRuntime
): void {
    const type = String(effect.type ?? "");

    if (type === "compose") {
        const clauses = splitConsequentClauses(String(effect.description ?? ""));
        for (const clause of clauses) {
            const step = inferSupportEffectFromDescription(clause) ?? inferConditionalEffect(clause);
            if (!step) continue;
            applySingleEffect(source, target, inferredToEffect(step), ctx, hooks, runtime);
        }
        return;
    }

    if (type === "conditional") {
        if (!runtime) return;
        const split = splitConditional(String(effect.description ?? ""));
        if (!split) return;
        const cond = parseCondition(split.head);
        if (!cond || !evaluateCondition(cond, runtime.condition)) return;
        for (const clause of splitConsequentClauses(split.consequent)) {
            const step = inferSupportEffectFromDescription(clause);
            if (!step) continue;
            applySingleEffect(source, target, inferredToEffect(step), ctx, hooks, runtime);
        }
        return;
    }

    switch (type as SupportEffectType) {
        case "void_enemy_support":
            target.supportCard = null;
            break;
        case "first_strike":
            ctx.firstStrikePlayers.add(source.sessionId);
            break;
        case "attack_second":
            ctx.attackSecondPlayers.add(source.sessionId);
            break;
        case "grant_counter": {
            const targetAttack = String(effect.targetAttack || "all");
            const multiplier = effect.value > 0 ? effect.value : 2;
            ctx.counterGrants.set(source.sessionId, { targetAttack, multiplier });
            break;
        }
        case "change_attack": {
            const forced = effect.targetAttack as AttackType;
            if (forced === "circle" || forced === "triangle" || forced === "cross") {
                ctx.forcedAttack.set(target.sessionId, forced);
            }
            break;
        }
        case "both_change_attack": {
            const forced = effect.targetAttack as AttackType;
            if (forced === "circle" || forced === "triangle" || forced === "cross") {
                ctx.forcedAttack.set(source.sessionId, forced);
                ctx.forcedAttack.set(target.sessionId, forced);
            }
            break;
        }
        case "force_self_attack": {
            const forced = effect.targetAttack as AttackType;
            if (forced === "circle" || forced === "triangle" || forced === "cross") {
                ctx.forcedAttack.set(source.sessionId, forced);
            }
            break;
        }
        case "rotate_enemy_attack": {
            const current = runtime?.opponentAttack;
            if (current) ctx.forcedAttack.set(target.sessionId, ATTACK_ROTATION[current]);
            break;
        }
        case "atk_mult": {
            const factor = effect.value > 0 ? effect.value : 2;
            multiplyAttack(ctx, source.sessionId, factor, effect.targetAttack || "all");
            break;
        }
        case "enemy_atk_mult": {
            const factor = effect.value > 0 ? effect.value : 2;
            multiplyAttack(ctx, target.sessionId, factor, effect.targetAttack || "all");
            break;
        }
        case "enemy_atk_halve":
            multiplyAttack(ctx, target.sessionId, 0.5, effect.targetAttack || "all");
            break;
        case "atk_set":
            setAttackOverride(ctx, source.sessionId, effect.targetAttack || "all", effect.value ?? 0);
            break;
        case "enemy_atk_set":
            setAttackOverride(ctx, target.sessionId, effect.targetAttack || "all", effect.value ?? 0);
            break;
        case "atk_set_to_hp":
            setAttackOverride(ctx, source.sessionId, effect.targetAttack || "all", source.hp);
            break;
        case "atk_add_hp":
            applyAtkBuff(ctx, source.sessionId, source.hp, "all");
            break;
        case "enemy_atk_lower":
            applyAtkBuff(ctx, target.sessionId, -Math.abs(effect.value ?? 0), effect.targetAttack || "all");
            break;
        case "enemy_atk_zero":
            applyZeroAttacks(ctx, target.sessionId, String(effect.targetAttack || "all"));
            break;
        case "zero_attacks":
            applyZeroAttacks(ctx, source.sessionId, String(effect.targetAttack || "all"));
            break;
        case "both_atk_zero":
            applyZeroAttacks(ctx, source.sessionId, "all");
            applyZeroAttacks(ctx, target.sessionId, "all");
            break;
        case "halve_hp":
            target.hp = Math.floor(target.hp / 2);
            break;
        case "self_halve_hp":
            source.hp = Math.floor(source.hp / 2);
            break;
        case "both_halve_hp":
            source.hp = Math.floor(source.hp / 2);
            target.hp = Math.floor(target.hp / 2);
            break;
        case "hp_set":
            source.hp = Math.max(0, effect.value ?? 0);
            break;
        case "enemy_hp_set":
            target.hp = Math.max(0, effect.value ?? 0);
            break;
        case "hp_double":
            source.hp = Math.max(0, source.hp * 2);
            break;
        case "enemy_hp_double":
            target.hp = Math.max(0, target.hp * 2);
            break;
        case "hp_swap": {
            const tmp = source.hp;
            source.hp = target.hp;
            target.hp = tmp;
            break;
        }
        case "hp_copy_from_opponent":
            source.hp = target.hp;
            break;
        case "enemy_hp_copy_from_own":
            target.hp = source.hp;
            break;
        case "atk_buff":
            applyAtkBuff(ctx, source.sessionId, effect.value ?? 0, effect.targetAttack || "all");
            break;
        case "both_atk_buff":
            applyAtkBuff(ctx, source.sessionId, effect.value ?? 0, effect.targetAttack || "all");
            applyAtkBuff(ctx, target.sessionId, effect.value ?? 0, effect.targetAttack || "all");
            break;
        case "hand_x_atk": {
            const per = effect.value > 0 ? effect.value : 100;
            applyAtkBuff(ctx, source.sessionId, source.hand.length * per, "all");
            break;
        }
        case "atk_add_dp_count": {
            const per = effect.value > 0 ? effect.value : 100;
            applyAtkBuff(ctx, source.sessionId, (source.dpSlot?.length ?? 0) * per, "all");
            break;
        }
        case "hp_add_dp_count": {
            const per = effect.value > 0 ? effect.value : 100;
            const max = source.active?.maxHp ?? source.hp;
            source.hp = Math.min(max, source.hp + (source.dpSlot?.length ?? 0) * per);
            break;
        }
        case "discard_own_dp":
            discardDpCards(source, effect.value > 0 ? effect.value : (source.dpSlot?.length ?? 0));
            break;
        case "discard_enemy_dp":
            discardDpCards(target, effect.value > 0 ? effect.value : (target.dpSlot?.length ?? 0));
            break;
        case "atk_mult_by_dp_discards": {
            const discarded = discardDpCards(source, source.dpSlot?.length ?? 0);
            multiplyAttack(ctx, source.sessionId, Math.max(0, discarded), effect.targetAttack || "all");
            break;
        }
        case "hp_add_dp_discards": {
            const per = effect.value > 0 ? effect.value : 100;
            const discarded = discardDpCards(source, source.dpSlot?.length ?? 0);
            const max = source.active?.maxHp ?? source.hp;
            source.hp = Math.min(max, source.hp + discarded * per);
            break;
        }
        case "discard_both_dp_equal": {
            const discarded = discardDpCards(source, source.dpSlot?.length ?? 0);
            discardDpCards(target, discarded);
            break;
        }
        case "hp_heal": {
            const max = source.active?.maxHp ?? source.hp;
            source.hp = Math.min(max, source.hp + (effect.value ?? 0));
            break;
        }
        case "enemy_hp_heal": {
            const max = target.active?.maxHp ?? target.hp;
            target.hp = Math.min(max, target.hp + (effect.value ?? 0));
            break;
        }
        case "change_own_specialty": {
            if (source.active) {
                const specialty = String(effect.targetAttack || "").trim();
                if (specialty) source.active.type = specialty;
            }
            break;
        }
        case "change_enemy_specialty": {
            if (target.active) {
                const specialty = String(effect.targetAttack || "").trim();
                if (specialty) target.active.type = specialty;
            }
            break;
        }
        case "both_change_specialty": {
            const specialty = String(effect.targetAttack || "").trim();
            if (specialty) {
                if (source.active) source.active.type = specialty;
                if (target.active) target.active.type = specialty;
            }
            break;
        }
        case "swap_specialty": {
            if (source.active && target.active) {
                const tmp = source.active.type;
                source.active.type = target.active.type;
                target.active.type = tmp;
            }
            break;
        }
        case "enemy_specialty_becomes_own": {
            if (source.active && target.active) target.active.type = source.active.type;
            break;
        }
        case "copy_opponent_stats": {
            if (source.active && target.active) {
                setAttackOverride(ctx, source.sessionId, "circle", target.active.circle.damage);
                setAttackOverride(ctx, source.sessionId, "triangle", target.active.triangle.damage);
                setAttackOverride(ctx, source.sessionId, "cross", target.active.cross.damage);
                source.hp = target.hp;
                source.active.type = target.active.type;
            }
            break;
        }
        case "grant_eat_up_hp":
            ctx.eatUpHpPlayers.add(source.sessionId);
            break;
        case "draw_cards":
            hooks?.drawCards?.(source, Math.max(0, effect.value ?? 0));
            break;
        default:
            break;
    }
}

export type ResolveSupportHooks = {
    /**
     * Apply a surviving battle option card (after void checks).
     * Caller typically adds ATK buffs and moves the card to trash.
     */
    applyBattleOption?: (
        source: PlayerSchema,
        card: CardSchema,
        ctx: SupportBattleContext
    ) => void;
    /** Draw N cards from online deck into hand (FC-027 draw_cards). */
    drawCards?: (source: PlayerSchema, count: number) => void;
};

/**
 * Resolve both players' support cards.
 * 1) Void/jamming nullification (FC-015)
 * 2) Surviving battle options
 * 3) Remaining digimon support stack by priority
 */
export function resolveSupportPhase(
    active: PlayerSchema,
    defender: PlayerSchema,
    activeSupport: CardSchema | null,
    defenderSupport: CardSchema | null,
    ctx: SupportBattleContext,
    tieBreak?: { activeSessionId: string; sessionOrder: string[] },
    hooks?: ResolveSupportHooks,
    lockedAttacks?: {
        activeAttack?: AttackType | null;
        defenderAttack?: AttackType | null;
    }
): SupportNullificationResult {
    const nullify = evaluateSupportNullification(
        active,
        defender,
        activeSupport,
        defenderSupport,
        lockedAttacks
    );

    if (nullify.activeVoided) active.supportCard = null;
    if (nullify.defenderVoided) defender.supportCard = null;

    const survivingActive = nullify.activeVoided ? null : activeSupport;
    const survivingDefender = nullify.defenderVoided ? null : defenderSupport;

    if (survivingActive?.cardKind === "option") {
        hooks?.applyBattleOption?.(active, survivingActive, ctx);
        active.supportCard = null;
    }
    if (survivingDefender?.cardKind === "option") {
        hooks?.applyBattleOption?.(defender, survivingDefender, ctx);
        defender.supportCard = null;
    }

    const digimonActive =
        survivingActive && survivingActive.cardKind !== "option" ? survivingActive : null;
    const digimonDefender =
        survivingDefender && survivingDefender.cardKind !== "option" ? survivingDefender : null;

    const queue: QueuedEffect[] = [];

    const enqueue = (
        source: PlayerSchema,
        target: PlayerSchema,
        card: CardSchema | null,
        isActivePlayer: boolean
    ) => {
        if (!card?.supportEffect) return;
        // Void already resolved; do not re-run void in the stack.
        if (isVoidEffect(card.supportEffect)) return;
        if (!passesTypeGate(source, card.supportEffect)) return;
        if (!passesOpponentTypeGate(target, card.supportEffect)) return;
        queue.push({
            source,
            target,
            effect: card.supportEffect,
            priority: effectPriority(card.supportEffect),
            isActivePlayer,
        });
    };

    enqueue(active, defender, digimonActive, true);
    enqueue(defender, active, digimonDefender, false);

    const sessionOrder = tieBreak?.sessionOrder ?? [];
    const ordered = sortEffectsByConflictPolicy(
        queue.map(entry => ({
            effect: entry,
            priority: entry.priority,
            sessionId: entry.source.sessionId,
            isActivePlayer: entry.isActivePlayer,
            hasFirstStrike: ctx.firstStrikePlayers.has(entry.source.sessionId),
        })),
        sessionOrder
    );

    const attackOf = (p: PlayerSchema): AttackType | null => {
        const forced = ctx.forcedAttack.get(p.sessionId);
        if (forced) return forced;
        if (!lockedAttacks) return null;
        if (p.sessionId === active.sessionId) return lockedAttacks.activeAttack ?? null;
        if (p.sessionId === defender.sessionId) return lockedAttacks.defenderAttack ?? null;
        return null;
    };

    for (const { effect: entry } of ordered) {
        const runtime = buildEffectRuntime(
            entry.source,
            entry.target,
            attackOf(entry.source),
            attackOf(entry.target)
        );
        applySingleEffect(entry.source, entry.target, entry.effect, ctx, hooks, runtime);
    }

    return nullify;
}

export type DamageSourcePlayer = {
    sessionId: string;
    active: {
        circle: { damage: number };
        triangle: { damage: number };
        cross: { damage: number };
    } | null;
};

export function getEffectiveAttackDamage(
    player: DamageSourcePlayer,
    attack: AttackType,
    ctx: SupportBattleContext
): number {
    return getAttackDamageBreakdown(player, attack, ctx).totalDamage;
}

export type AttackDamageBreakdown = {
    baseDamage: number;
    bonusDamage: number;
    totalDamage: number;
};

/** Card base AP, support bonus delta, and final pre-cross damage. */
export function getAttackDamageBreakdown(
    player: DamageSourcePlayer,
    attack: AttackType,
    ctx: SupportBattleContext
): AttackDamageBreakdown {
    const active = player.active;
    if (!active) return { baseDamage: 0, bonusDamage: 0, totalDamage: 0 };
    const bonus = getBonuses(ctx, player.sessionId);
    const mult = getMultipliers(ctx, player.sessionId);
    const cardBase =
        attack === "circle"
            ? active.circle.damage
            : attack === "triangle"
              ? active.triangle.damage
              : active.cross.damage;
    const bonusAdd =
        attack === "circle" ? bonus.circle : attack === "triangle" ? bonus.triangle : bonus.cross;
    const m =
        attack === "circle" ? mult.circle : attack === "triangle" ? mult.triangle : mult.cross;
    const override = getOverride(ctx, player.sessionId);
    const overrideValue =
        attack === "circle" ? override.circle : attack === "triangle" ? override.triangle : override.cross;
    // Absolute set ("becomes 0/300", "= own HP") wins over additive/multiplicative mods.
    const totalDamage =
        overrideValue != null ? Math.max(0, overrideValue) : Math.floor((cardBase + bonusAdd) * m);
    return {
        baseDamage: cardBase,
        bonusDamage: totalDamage - cardBase,
        totalDamage,
    };
}
