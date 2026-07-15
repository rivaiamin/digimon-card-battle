/**
 * Authoritative battle damage pipeline (E4): Cross/X effects, first-strike, double-KO.
 * @see docs/fidelity-rules-contract.md FC-017..FC-020, RA-006
 */

import type { EffectArgs } from "../types";
import { parseEffectArgsJson, readNumberArg } from "./effectArgs";
import { applySpecialtyFoeMultiplier } from "./specialtyFoeMult";
import {
    getAttackDamageBreakdown,
    getEffectiveAttackDamage,
    type AttackType,
    type SupportBattleContext,
} from "./supportResolver";
import type { CombatStrike } from "./combatStrikePlan";

export type { CombatStrike } from "./combatStrikePlan";
export { parseCombatStrikesJson, serializeCombatStrikes } from "./combatStrikePlan";

export type BattleEventType =
    | "cross_counter"
    | "cross_to_zero"
    | "cross_crash"
    | "cross_eat_up_hp"
    | "specialty_foe_mult"
    | "first_strike_cancel"
    | "attack_canceled"
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
    /** Active Digimon specialty (Fire/Ice/Nature/Dark/Rare). */
    specialty: string;
    active: {
        circle: { damage: number; name?: string; effectId?: string; effectArgsJson?: string };
        triangle: { damage: number; name?: string; effectId?: string; effectArgsJson?: string };
        cross: { damage: number; name?: string; effectId?: string; effectArgsJson?: string };
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
    strikes: CombatStrike[];
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

function applySpecialtyFoeToDamage(
    damage: number,
    source: BattleCombatant,
    attack: AttackType,
    opponentSpecialty: string,
    events: BattleEvent[]
): number {
    const effect = getAttackEffect(source.active, attack);
    if (!effect || effect.effectId !== "attack.specialty_mult") return damage;
    const specialty = String(effect.effectArgs.specialty ?? "").trim();
    const multiplier = readNumberArg(effect.effectArgs, "multiplier", 3);
    const next = applySpecialtyFoeMultiplier(damage, specialty, multiplier, opponentSpecialty);
    if (next !== damage) {
        events.push({
            type: "specialty_foe_mult",
            sessionId: source.sessionId,
            detail: { specialty, multiplier, from: damage, to: next },
        });
    }
    return next;
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

    // FC-016: Specialty Foe ×N after support mods, before Cross specials.
    toDefender = applySpecialtyFoeToDamage(
        toDefender,
        attacker,
        attackerAttack,
        defender.specialty,
        events
    );
    toAttacker = applySpecialtyFoeToDamage(
        toAttacker,
        defender,
        defenderAttack,
        attacker.specialty,
        events
    );

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

    // Crash must not re-apply damage that Counter already zeroed on that direction.
    const defenderCounteredIncoming = events.some(
        (e) => e.type === "cross_counter" && e.sessionId === defender.sessionId
    );
    const attackerCounteredIncoming = events.some(
        (e) => e.type === "cross_counter" && e.sessionId === attacker.sessionId
    );

    if (
        attackerCross?.effectId === "cross.crash" &&
        attackerAttack === "cross" &&
        !defenderCounteredIncoming
    ) {
        toDefender = Math.max(0, attacker.hp);
        events.push({
            type: "cross_crash",
            sessionId: attacker.sessionId,
            detail: { damage: toDefender },
        });
    }
    if (
        defenderCross?.effectId === "cross.crash" &&
        defenderAttack === "cross" &&
        !attackerCounteredIncoming
    ) {
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

function hasEatUp(
    active: BattleCombatant["active"],
    attack: AttackType,
    sessionId: string,
    supportCtx: SupportBattleContext
): boolean {
    if (supportCtx.eatUpHpPlayers.has(sessionId)) return true;
    if (attack !== "cross" || !active) return false;
    return getAttackEffect(active, "cross")?.effectId === "cross.eat_up_hp";
}

function getAttackName(active: BattleCombatant["active"], attack: AttackType): string {
    if (!active) return attack.toUpperCase();
    const atk =
        attack === "circle" ? active.circle : attack === "triangle" ? active.triangle : active.cross;
    const name = String(atk.name ?? "").trim();
    return name || attack.toUpperCase();
}

function buildStrike(
    from: BattleCombatant,
    to: BattleCombatant,
    attack: AttackType,
    damage: number,
    targetHpAfter: number,
    supportCtx: SupportBattleContext,
    isCounterEffect = false
): CombatStrike {
    const breakdown = getAttackDamageBreakdown(from, attack, supportCtx);
    return {
        attackerSessionId: from.sessionId,
        defenderSessionId: to.sessionId,
        attack,
        attackName: getAttackName(from.active, attack),
        baseDamage: breakdown.baseDamage,
        bonusDamage: breakdown.bonusDamage,
        totalDamage: damage,
        targetHpAfter,
        ...(isCounterEffect ? { isCounterEffect: true } : {}),
    };
}

function emitAttackCanceled(
    events: BattleEvent[],
    canceledSessionId: string,
    canceledDamage: number
) {
    events.push({
        type: "attack_canceled",
        sessionId: canceledSessionId,
        detail: { canceledDamage },
    });
    events.push({
        type: "first_strike_cancel",
        sessionId: canceledSessionId,
        detail: { canceledDamage },
    });
}

/**
 * Resolve one directed exchange (attacker = active player for the turn).
 * Take-turn default: attacker strikes first; defender counter-attacks only if they survive.
 * First Strike support lets the holder strike before the opponent when only one has it.
 */
export function resolveBattleExchange(input: BattleExchangeInput): BattleExchangeResult {
    const events: BattleEvent[] = [];
    const strikes: CombatStrike[] = [];
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

    const attackerFirstStrike =
        input.supportCtx.firstStrikePlayers.has(input.attacker.sessionId) ||
        getAttackEffect(input.attacker.active, input.attackerAttack)?.effectId ===
            "attack.first_strike";
    const defenderFirstStrike =
        input.supportCtx.firstStrikePlayers.has(input.defender.sessionId) ||
        getAttackEffect(input.defender.active, input.defenderAttack)?.effectId ===
            "attack.first_strike";
    // "Attack second" (FC-027) mirrors first strike: the holder yields priority.
    const attackerSecond = input.supportCtx.attackSecondPlayers?.has(input.attacker.sessionId) ?? false;
    const defenderSecond = input.supportCtx.attackSecondPlayers?.has(input.defender.sessionId) ?? false;
    const attackerFirst = (attackerFirstStrike || defenderSecond) && !attackerSecond;
    const defenderFirst = (defenderFirstStrike || attackerSecond) && !defenderSecond;

    const applyHit = (
        from: BattleCombatant,
        to: BattleCombatant,
        fromSessionId: string,
        targetHp: number,
        damage: number,
        attack: AttackType,
        label: "toDefender" | "toAttacker"
    ): { nextHp: number; hpLost: number } => {
        if (damage <= 0 || targetHp <= 0) return { nextHp: targetHp, hpLost: 0 };
        const hpLost = Math.min(damage, targetHp);
        const next = targetHp - hpLost;
        events.push({
            type: "damage_dealt",
            sessionId: fromSessionId,
            detail: { damage, hpLost, [label]: true },
        });
        const isCounterEffect = events.some(
            (e) => e.type === "cross_counter" && e.sessionId === fromSessionId
        );
        strikes.push(
            buildStrike(from, to, attack, damage, next, input.supportCtx, isCounterEffect)
        );
        return { nextHp: next, hpLost };
    };

    let attackerEatUpHeal = 0;
    let defenderEatUpHeal = 0;

    const noteEatUp = (
        healer: BattleCombatant,
        attack: AttackType,
        hpLost: number,
        side: "attacker" | "defender"
    ) => {
        if (
            hpLost <= 0 ||
            !hasEatUp(healer.active, attack, healer.sessionId, input.supportCtx)
        ) {
            return;
        }
        if (side === "attacker") attackerEatUpHeal += hpLost;
        else defenderEatUpHeal += hpLost;
    };

    const strikeAttackerFirst = () => {
        const hit = applyHit(
            input.attacker,
            input.defender,
            input.attacker.sessionId,
            defenderHp,
            toDefender,
            input.attackerAttack,
            "toDefender"
        );
        defenderHp = hit.nextHp;
        noteEatUp(input.attacker, input.attackerAttack, hit.hpLost, "attacker");
        if (defenderHp > 0) {
            const ret = applyHit(
                input.defender,
                input.attacker,
                input.defender.sessionId,
                attackerHp,
                toAttacker,
                input.defenderAttack,
                "toAttacker"
            );
            attackerHp = ret.nextHp;
            noteEatUp(input.defender, input.defenderAttack, ret.hpLost, "defender");
        } else if (toAttacker > 0) {
            emitAttackCanceled(events, input.defender.sessionId, toAttacker);
        }
    };

    const strikeDefenderFirst = () => {
        const hit = applyHit(
            input.defender,
            input.attacker,
            input.defender.sessionId,
            attackerHp,
            toAttacker,
            input.defenderAttack,
            "toAttacker"
        );
        attackerHp = hit.nextHp;
        noteEatUp(input.defender, input.defenderAttack, hit.hpLost, "defender");
        if (attackerHp > 0) {
            const ret = applyHit(
                input.attacker,
                input.defender,
                input.attacker.sessionId,
                defenderHp,
                toDefender,
                input.attackerAttack,
                "toDefender"
            );
            defenderHp = ret.nextHp;
            noteEatUp(input.attacker, input.attackerAttack, ret.hpLost, "attacker");
        } else if (toDefender > 0) {
            emitAttackCanceled(events, input.attacker.sessionId, toDefender);
        }
    };

    if (defenderFirst && !attackerFirst) {
        strikeDefenderFirst();
    } else {
        // Attacker first: default take-turn, attacker-only First Strike, or both First Strike
        strikeAttackerFirst();
    }

    if (attackerEatUpHeal > 0) {
        attackerHp = applyEatUpHp(
            { ...input.attacker, hp: attackerHp },
            attackerEatUpHeal,
            events
        );
    }
    if (defenderEatUpHeal > 0) {
        defenderHp = applyEatUpHp(
            { ...input.defender, hp: defenderHp },
            defenderEatUpHeal,
            events
        );
    }

    if (
        hasCrash(input.attacker.active, input.attackerAttack) &&
        input.attackerAttack === "cross" &&
        !events.some((e) => e.type === "cross_counter" && e.sessionId === input.defender.sessionId)
    ) {
        attackerHp = 0;
    }
    if (
        hasCrash(input.defender.active, input.defenderAttack) &&
        input.defenderAttack === "cross" &&
        !events.some((e) => e.type === "cross_counter" && e.sessionId === input.attacker.sessionId)
    ) {
        defenderHp = 0;
    }

    if (attackerHp <= 0 && defenderHp <= 0) {
        events.push({ type: "double_ko" });
    }

    return { attackerHp, defenderHp, events, strikes };
}

/** Full 1v1 battle resolution for two session-ordered players. */
export function resolveFullBattle(
    p1: BattleCombatant,
    p2: BattleCombatant,
    attack1: AttackType,
    attack2: AttackType,
    activeSessionId: string,
    supportCtx: SupportBattleContext
): { p1Hp: number; p2Hp: number; events: BattleEvent[]; strikes: CombatStrike[] } {
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
        return {
            p1Hp: result.attackerHp,
            p2Hp: result.defenderHp,
            events: result.events,
            strikes: result.strikes,
        };
    }
    return {
        p1Hp: result.defenderHp,
        p2Hp: result.attackerHp,
        events: result.events,
        strikes: result.strikes,
    };
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
