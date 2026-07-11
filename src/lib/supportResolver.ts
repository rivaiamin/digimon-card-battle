/**
 * Support phase resolution + nullification / jamming (FC-015).
 * Cancellation (void) resolves before other support and battle-option effects.
 * @see docs/fidelity-rules-contract.md FC-015, GDD.md Phase 3 Step 2
 */

import type { CardSchema, PlayerSchema, SupportEffectSchema } from "../schema/BattleState";
import { sortEffectsByConflictPolicy } from "./effectConflictResolver";

export type AttackType = "circle" | "triangle" | "cross";

export type SupportEffectType =
    | "void_enemy_support"
    | "first_strike"
    | "change_attack"
    | "atk_mult"
    | "halve_hp"
    | "atk_buff"
    | "hp_heal";

/** Spec §2.B — lower runs first within the battle support stack. */
export const SUPPORT_PRIORITY: Record<SupportEffectType, number> = {
    void_enemy_support: 1,
    first_strike: 1,
    change_attack: 2,
    atk_mult: 3,
    halve_hp: 3,
    atk_buff: 4,
    hp_heal: 5,
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

export interface SupportBattleContext {
    attackBonus: Map<string, AttackBonuses>;
    attackMultiplier: Map<string, AttackMultipliers>;
    firstStrikePlayers: Set<string>;
    forcedAttack: Map<string, AttackType>;
}

export function createSupportBattleContext(): SupportBattleContext {
    return {
        attackBonus: new Map(),
        attackMultiplier: new Map(),
        firstStrikePlayers: new Set(),
        forcedAttack: new Map(),
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

export function evaluateSupportNullification(
    active: PlayerSchema,
    defender: PlayerSchema,
    activeSupport: CardSchema | null,
    defenderSupport: CardSchema | null
): SupportNullificationResult {
    const activeEffect = activeSupport?.supportEffect ?? null;
    const defenderEffect = defenderSupport?.supportEffect ?? null;

    const activeVoidsEnemy = canVoidEnemySupport(active, activeEffect, defender, !!defenderSupport);
    const defenderVoidsEnemy = canVoidEnemySupport(defender, defenderEffect, active, !!activeSupport);

    return {
        activeVoided: defenderVoidsEnemy,
        defenderVoided: activeVoidsEnemy,
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

function applySingleEffect(
    source: PlayerSchema,
    target: PlayerSchema,
    effect: SupportEffectSchema,
    ctx: SupportBattleContext
): void {
    const type = effect.type as SupportEffectType;

    switch (type) {
        case "void_enemy_support":
            // Nullification already applied before the stack; keep as no-op safety.
            target.supportCard = null;
            break;
        case "first_strike":
            ctx.firstStrikePlayers.add(source.sessionId);
            break;
        case "change_attack": {
            const forced = effect.targetAttack as AttackType;
            if (forced === "circle" || forced === "triangle" || forced === "cross") {
                ctx.forcedAttack.set(target.sessionId, forced);
            }
            break;
        }
        case "atk_mult": {
            const mult = getMultipliers(ctx, source.sessionId);
            const factor = effect.value > 0 ? effect.value : 2;
            const t = effect.targetAttack;
            if (t === "all" || !t) {
                mult.circle *= factor;
                mult.triangle *= factor;
                mult.cross *= factor;
            } else if (t === "circle" || t === "triangle" || t === "cross") {
                mult[t] *= factor;
            }
            ctx.attackMultiplier.set(source.sessionId, mult);
            break;
        }
        case "halve_hp":
            target.hp = Math.floor(target.hp / 2);
            break;
        case "atk_buff": {
            const bonus = getBonuses(ctx, source.sessionId);
            const v = effect.value ?? 0;
            const t = effect.targetAttack;
            if (t === "all" || !t) {
                bonus.circle += v;
                bonus.triangle += v;
                bonus.cross += v;
            } else if (t === "circle" || t === "triangle" || t === "cross") {
                bonus[t] += v;
            }
            ctx.attackBonus.set(source.sessionId, bonus);
            break;
        }
        case "hp_heal": {
            const max = source.active?.maxHp ?? source.hp;
            source.hp = Math.min(max, source.hp + (effect.value ?? 0));
            break;
        }
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
    hooks?: ResolveSupportHooks
): SupportNullificationResult {
    const nullify = evaluateSupportNullification(active, defender, activeSupport, defenderSupport);

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

    for (const { effect: entry } of ordered) {
        applySingleEffect(entry.source, entry.target, entry.effect, ctx);
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
    const totalDamage = Math.floor((cardBase + bonusAdd) * m);
    return {
        baseDamage: cardBase,
        bonusDamage: totalDamage - cardBase,
        totalDamage,
    };
}
