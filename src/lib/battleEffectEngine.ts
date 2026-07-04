/**
 * Authoritative battle damage pipeline (E4): Cross/X effects, first-strike, double-KO.
 * @see docs/fidelity-rules-contract.md FC-017..FC-020, RA-006
 */

import type { EffectArgs } from "../types";
import { parseEffectArgsJson, readNumberArg } from "./effectArgs";
import {
    getEffectiveAttackDamage,
    type AttackType,
    type SupportBattleContext,
} from "./supportResolver";

export type BattleEventType =
    | "cross_counter"
    | "cross_to_zero"
    | "cross_crash"
    | "cross_eat_up_hp"
    | "first_strike_cancel"
    | "damage_dealt"
    | "double_ko";

export interface BattleEvent {
    type: BattleEventType;
    sessionId?: string;
    detail?: Record<string, unknown>;
}

export interface BattleCombatant {
    sessionId: string;
    hp: number;
    maxHp: number;
    active: {
        circle: { damage: number; effectId?: string; effectArgsJson?: string };
        triangle: { damage: number; effectId?: string; effectArgsJson?: string };
        cross: { damage: number; effectId?: string; effectArgsJson?: string };
    } | null;
}

export interface BattleExchangeInput {
    attacker: BattleCombatant;
    defender: BattleCombatant;
    attackerAttack: AttackType;
    defenderAttack: AttackType;
    activeSessionId: string;
    supportCtx: SupportBattleContext;
}

export interface BattleExchangeResult {
    attackerHp: number;
    defenderHp: number;
    events: BattleEvent[];
}

export interface CrossEffectState {
    effectId: string;
    effectArgs: EffectArgs;
}

function getAttackEffect(
    active: BattleCombatant["active"],
    attack: AttackType
): CrossEffectState | null {
    if (!active) return null;
    const atk =
        attack === "circle" ? active.circle : attack === "triangle" ? active.triangle : active.cross;
    const effectId = String(atk.effectId ?? "").trim();
    if (!effectId) return null;
    return {
        effectId,
        effectArgs: parseEffectArgsJson(atk.effectArgsJson),
    };
}

function targetAttackMatches(args: EffectArgs, opponentAttack: AttackType): boolean {
    const raw = args.targetAttack;
    if (typeof raw !== "string" || raw.length === 0) return false;
    if (raw === "all") return true;
    return raw === opponentAttack;
}

type DamagePair = { toDefender: number; toAttacker: number };

function applyCrossEffects(
    attacker: BattleCombatant,
    defender: BattleCombatant,
    attackerAttack: AttackType,
    defenderAttack: AttackType,
    supportCtx: SupportBattleContext,
    events: BattleEvent[]
): DamagePair {
    let toDefender = getEffectiveAttackDamage(attacker, attackerAttack, supportCtx);
    let toAttacker = getEffectiveAttackDamage(defender, defenderAttack, supportCtx);

    const attackerCross = attackerAttack === "cross" ? getAttackEffect(attacker.active, "cross") : null;
    const defenderCross = defenderAttack === "cross" ? getAttackEffect(defender.active, "cross") : null;

    if (attackerCross?.effectId === "cross.to_zero") {
        if (targetAttackMatches(attackerCross.effectArgs, defenderAttack)) {
            toAttacker = 0;
            events.push({
                type: "cross_to_zero",
                sessionId: attacker.sessionId,
                detail: { blockedAttack: defenderAttack },
            });
        }
    }
    if (defenderCross?.effectId === "cross.to_zero") {
        if (targetAttackMatches(defenderCross.effectArgs, attackerAttack)) {
            toDefender = 0;
            events.push({
                type: "cross_to_zero",
                sessionId: defender.sessionId,
                detail: { blockedAttack: attackerAttack },
            });
        }
    }

    if (attackerCross?.effectId === "cross.counter") {
        if (attackerAttack === "cross" && targetAttackMatches(attackerCross.effectArgs, defenderAttack)) {
            const mult = readNumberArg(attackerCross.effectArgs, "multiplier", 2);
            toDefender = Math.floor(toAttacker * mult);
            toAttacker = 0;
            events.push({
                type: "cross_counter",
                sessionId: attacker.sessionId,
                detail: { counteredAttack: defenderAttack, damage: toDefender },
            });
        }
    }
    if (defenderCross?.effectId === "cross.counter") {
        if (defenderAttack === "cross" && targetAttackMatches(defenderCross.effectArgs, attackerAttack)) {
            const mult = readNumberArg(defenderCross.effectArgs, "multiplier", 2);
            toAttacker = Math.floor(toDefender * mult);
            toDefender = 0;
            events.push({
                type: "cross_counter",
                sessionId: defender.sessionId,
                detail: { counteredAttack: attackerAttack, damage: toAttacker },
            });
        }
    }

    if (attackerCross?.effectId === "cross.crash" && attackerAttack === "cross") {
        toDefender = Math.max(0, attacker.hp);
        events.push({
            type: "cross_crash",
            sessionId: attacker.sessionId,
            detail: { damage: toDefender },
        });
    }
    if (defenderCross?.effectId === "cross.crash" && defenderAttack === "cross") {
        toAttacker = Math.max(0, defender.hp);
        events.push({
            type: "cross_crash",
            sessionId: defender.sessionId,
            detail: { damage: toAttacker },
        });
    }

    return { toDefender, toAttacker };
}

function applyEatUpHp(healer: BattleCombatant, damageDealt: number, events: BattleEvent[]): number {
    if (damageDealt <= 0) return healer.hp;
    const healed = Math.min(healer.maxHp, healer.hp + damageDealt);
    events.push({
        type: "cross_eat_up_hp",
        sessionId: healer.sessionId,
        detail: { healed: healed - healer.hp },
    });
    return healed;
}

function hasCrash(active: BattleCombatant["active"], attack: AttackType): boolean {
    if (attack !== "cross" || !active) return false;
    return getAttackEffect(active, "cross")?.effectId === "cross.crash";
}

function hasEatUp(active: BattleCombatant["active"], attack: AttackType): boolean {
    if (attack !== "cross" || !active) return false;
    return getAttackEffect(active, "cross")?.effectId === "cross.eat_up_hp";
}

/**
 * Resolve one directed exchange (attacker = active player for the turn).
 * First-strike is evaluated from support context relative to each combatant session.
 */
export function resolveBattleExchange(input: BattleExchangeInput): BattleExchangeResult {
    const events: BattleEvent[] = [];
    let attackerHp = input.attacker.hp;
    let defenderHp = input.defender.hp;

    const attacker = { ...input.attacker, hp: attackerHp };
    const defender = { ...input.defender, hp: defenderHp };

    const { toDefender, toAttacker } = applyCrossEffects(
        attacker,
        defender,
        input.attackerAttack,
        input.defenderAttack,
        input.supportCtx,
        events
    );

    const attackerFirst = input.supportCtx.firstStrikePlayers.has(input.attacker.sessionId);
    const defenderFirst = input.supportCtx.firstStrikePlayers.has(input.defender.sessionId);

    const applyHit = (
        fromSessionId: string,
        targetHp: number,
        damage: number,
        label: "toDefender" | "toAttacker"
    ): number => {
        if (damage <= 0) return targetHp;
        const next = Math.max(0, targetHp - damage);
        events.push({
            type: "damage_dealt",
            sessionId: fromSessionId,
            detail: { damage, [label]: true },
        });
        return next;
    };

    if (attackerFirst && !defenderFirst) {
        defenderHp = applyHit(input.attacker.sessionId, defenderHp, toDefender, "toDefender");
        if (defenderHp > 0) {
            attackerHp = applyHit(input.defender.sessionId, attackerHp, toAttacker, "toAttacker");
        } else if (toAttacker > 0) {
            events.push({
                type: "first_strike_cancel",
                sessionId: input.attacker.sessionId,
                detail: { canceledDamage: toAttacker },
            });
        }
    } else if (defenderFirst && !attackerFirst) {
        attackerHp = applyHit(input.defender.sessionId, attackerHp, toAttacker, "toAttacker");
        if (attackerHp > 0) {
            defenderHp = applyHit(input.attacker.sessionId, defenderHp, toDefender, "toDefender");
        } else if (toDefender > 0) {
            events.push({
                type: "first_strike_cancel",
                sessionId: input.defender.sessionId,
                detail: { canceledDamage: toDefender },
            });
        }
    } else {
        defenderHp = applyHit(input.attacker.sessionId, defenderHp, toDefender, "toDefender");
        attackerHp = applyHit(input.defender.sessionId, attackerHp, toAttacker, "toAttacker");
    }

    if (hasEatUp(input.attacker.active, input.attackerAttack) && toDefender > 0 && defenderHp >= 0) {
        attackerHp = applyEatUpHp({ ...input.attacker, hp: attackerHp }, toDefender, events);
    }
    if (hasEatUp(input.defender.active, input.defenderAttack) && toAttacker > 0 && attackerHp >= 0) {
        defenderHp = applyEatUpHp({ ...input.defender, hp: defenderHp }, toAttacker, events);
    }

    if (hasCrash(input.attacker.active, input.attackerAttack) && input.attackerAttack === "cross") {
        attackerHp = 0;
    }
    if (hasCrash(input.defender.active, input.defenderAttack) && input.defenderAttack === "cross") {
        defenderHp = 0;
    }

    if (attackerHp <= 0 && defenderHp <= 0) {
        events.push({ type: "double_ko" });
    }

    return { attackerHp, defenderHp, events };
}

/** Full 1v1 battle resolution for two session-ordered players. */
export function resolveFullBattle(
    p1: BattleCombatant,
    p2: BattleCombatant,
    attack1: AttackType,
    attack2: AttackType,
    activeSessionId: string,
    supportCtx: SupportBattleContext
): { p1Hp: number; p2Hp: number; events: BattleEvent[] } {
    const isP1Active = p1.sessionId === activeSessionId;
    const result = resolveBattleExchange({
        attacker: isP1Active ? p1 : p2,
        defender: isP1Active ? p2 : p1,
        attackerAttack: isP1Active ? attack1 : attack2,
        defenderAttack: isP1Active ? attack2 : attack1,
        activeSessionId,
        supportCtx,
    });

    if (isP1Active) {
        return { p1Hp: result.attackerHp, p2Hp: result.defenderHp, events: result.events };
    }
    return { p1Hp: result.defenderHp, p2Hp: result.attackerHp, events: result.events };
}

export type DoubleKoOutcome = {
    isDoubleKo: boolean;
    scoreDelta: { p1: number; p2: number };
};

/** Deterministic KO scoring: double KO awards no points. */
export function resolveKoScoring(p1Hp: number, p2Hp: number): DoubleKoOutcome {
    const p1Ko = p1Hp <= 0;
    const p2Ko = p2Hp <= 0;
    if (!p1Ko && !p2Ko) return { isDoubleKo: false, scoreDelta: { p1: 0, p2: 0 } };
    if (p1Ko && p2Ko) return { isDoubleKo: true, scoreDelta: { p1: 0, p2: 0 } };
    return {
        isDoubleKo: false,
        scoreDelta: p1Ko ? { p1: 0, p2: 1 } : { p1: 1, p2: 0 },
    };
}
