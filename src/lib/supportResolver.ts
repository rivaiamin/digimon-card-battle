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

function passesTypeGate(source: PlayerSchema, effect: SupportEffectSchema): boolean {
    const required = String((effect as SupportEffectSchema & { requireType?: string }).requireType ?? "").trim();
    if (!required) return true;
    const activeType = source.active?.type ?? "";
    return activeType === required;
}

function isVoidEffect(effect: SupportEffectSchema | null | undefined): boolean {
    return effect?.type === "void_enemy_support";
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

/**
 * Resolve both players' support cards using the 5-tier stack (§2.B).
 * Void checks run before queuing; remaining effects sort by priority then active player first.
 */
export function resolveSupportPhase(
    active: PlayerSchema,
    defender: PlayerSchema,
    activeSupport: CardSchema | null,
    defenderSupport: CardSchema | null,
    ctx: SupportBattleContext,
    tieBreak?: { activeSessionId: string; sessionOrder: string[] }
): void {
    const activeEffect = activeSupport?.supportEffect ?? null;
    const defenderEffect = defenderSupport?.supportEffect ?? null;

    const activeVoided =
        isVoidEffect(defenderEffect) && !!activeSupport;
    const defenderVoided =
        isVoidEffect(activeEffect) && !!defenderSupport;

    if (activeVoided) active.supportCard = null;
    if (defenderVoided) defender.supportCard = null;

    const queue: QueuedEffect[] = [];

    const enqueue = (
        source: PlayerSchema,
        target: PlayerSchema,
        card: CardSchema | null,
        voided: boolean,
        isActivePlayer: boolean
    ) => {
        if (voided || !card?.supportEffect) return;
        if (!passesTypeGate(source, card.supportEffect)) return;
        queue.push({
            source,
            target,
            effect: card.supportEffect,
            priority: effectPriority(card.supportEffect),
            isActivePlayer,
        });
    };

    enqueue(active, defender, activeVoided ? null : activeSupport, activeVoided, true);
    enqueue(defender, active, defenderVoided ? null : defenderSupport, defenderVoided, false);

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
    const active = player.active;
    if (!active) return 0;
    const bonus = getBonuses(ctx, player.sessionId);
    const mult = getMultipliers(ctx, player.sessionId);
    let base = 0;
    if (attack === "circle") base = active.circle.damage + bonus.circle;
    else if (attack === "triangle") base = active.triangle.damage + bonus.triangle;
    else base = active.cross.damage + bonus.cross;
    const m = attack === "circle" ? mult.circle : attack === "triangle" ? mult.triangle : mult.cross;
    return Math.floor(base * m);
}
