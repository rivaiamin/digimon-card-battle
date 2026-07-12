import type { AttackType } from "./supportResolver";
import type { CombatDamageResult, CombatSnapshot } from "./combatResolution";

export type CombatStrike = {
    attackerSessionId: string;
    defenderSessionId: string;
    attack: AttackType;
    attackName: string;
    baseDamage: number;
    bonusDamage: number;
    totalDamage: number;
    targetHpAfter: number;
    canceled?: boolean;
    /** True when this strike damage came from a Cross Counter reflection. */
    isCounterEffect?: boolean;
};

export function parseCombatStrikesJson(json: string): CombatStrike[] {
    if (!json.trim()) return [];
    try {
        const parsed = JSON.parse(json) as CombatStrike[];
        return Array.isArray(parsed) ? parsed.filter((s) => !s.canceled) : [];
    } catch {
        return [];
    }
}

export function serializeCombatStrikes(strikes: CombatStrike[]): string {
    return JSON.stringify(strikes);
}

function attackNameFromCard(
    active: CombatSnapshot["playerActive"],
    attack: AttackType
): string {
    const atk = active?.attacks?.[attack];
    return atk?.name?.trim() || attack.toUpperCase();
}

function baseDamageFromCard(
    active: CombatSnapshot["playerActive"],
    attack: AttackType
): number {
    return active?.attacks?.[attack]?.damage ?? 0;
}

function buildSyntheticStrike(
    attackerSessionId: string,
    defenderSessionId: string,
    attack: AttackType,
    active: CombatSnapshot["playerActive"],
    totalDamage: number,
    targetHpAfter: number
): CombatStrike {
    const baseDamage = baseDamageFromCard(active, attack);
    return {
        attackerSessionId,
        defenderSessionId,
        attack,
        attackName: attackNameFromCard(active, attack),
        baseDamage,
        bonusDamage: Math.max(0, totalDamage - baseDamage),
        totalDamage,
        targetHpAfter,
    };
}

/**
 * Client fallback when combatStrikesJson is unavailable.
 * Replays take-turn order using HP deltas and the stored attacker session id.
 */
export function synthesizeCombatStrikes(
    prev: CombatSnapshot,
    next: CombatSnapshot,
    damage: CombatDamageResult,
    attackerSessionId: string,
    playerSessionId: string,
    opponentSessionId: string
): CombatStrike[] {
    if (!attackerSessionId || !next.playerAttack || !next.opponentAttack) return [];

    const defenderSessionId =
        attackerSessionId === playerSessionId ? opponentSessionId : playerSessionId;

    const attackerIsPlayer = attackerSessionId === playerSessionId;
    const attackerAttack = attackerIsPlayer ? next.playerAttack : next.opponentAttack;
    const defenderAttack = attackerIsPlayer ? next.opponentAttack : next.playerAttack;
    const attackerActive = attackerIsPlayer ? prev.playerActive : prev.opponentActive;
    const defenderActive = attackerIsPlayer ? prev.opponentActive : prev.playerActive;

    const damageToDefender = attackerIsPlayer ? damage.toOpponent : damage.toPlayer;
    const damageToAttacker = attackerIsPlayer ? damage.toPlayer : damage.toOpponent;
    const defenderKo = attackerIsPlayer ? damage.opponentKo : damage.playerKo;
    const defenderHpAfter = attackerIsPlayer ? next.opponentHp : next.playerHp;
    const attackerHpAfter = attackerIsPlayer ? next.playerHp : next.opponentHp;

    const strikes: CombatStrike[] = [];

    if (damageToDefender > 0 || defenderKo) {
        strikes.push(
            buildSyntheticStrike(
                attackerSessionId,
                defenderSessionId,
                attackerAttack,
                attackerActive,
                damageToDefender,
                defenderKo ? 0 : defenderHpAfter
            )
        );
    }

    if (!defenderKo && damageToAttacker > 0) {
        strikes.push(
            buildSyntheticStrike(
                defenderSessionId,
                attackerSessionId,
                defenderAttack,
                defenderActive,
                damageToAttacker,
                attackerHpAfter
            )
        );
    }

    return strikes;
}

export function resolveCombatStrikes(
    json: string,
    prev: CombatSnapshot,
    next: CombatSnapshot,
    damage: CombatDamageResult,
    attackerSessionId: string,
    playerSessionId: string,
    opponentSessionId: string
): CombatStrike[] {
    const fromServer = parseCombatStrikesJson(json);
    if (fromServer.length > 0) return fromServer;
    return synthesizeCombatStrikes(
        prev,
        next,
        damage,
        attackerSessionId,
        playerSessionId,
        opponentSessionId
    );
}
