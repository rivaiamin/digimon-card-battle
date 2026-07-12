import type { DigimonCardData, GameState } from "../types";

export type CombatSnapshot = {
  phase: GameState["phase"];
  playerHp: number;
  opponentHp: number;
  playerActive: DigimonCardData | null;
  opponentActive: DigimonCardData | null;
  playerAttack: GameState["player"]["selectedAttack"];
  opponentAttack: GameState["opponent"]["selectedAttack"];
};

export type CombatDamageResult = {
  toPlayer: number;
  toOpponent: number;
  playerKo: boolean;
  opponentKo: boolean;
};

export function combatSnapshot(state: GameState): CombatSnapshot {
  return {
    phase: state.phase,
    playerHp: state.player.hp,
    opponentHp: state.opponent.hp,
    playerActive: state.player.active,
    opponentActive: state.opponent.active,
    playerAttack: state.player.selectedAttack,
    opponentAttack: state.opponent.selectedAttack,
  };
}

/** True when the server finished an attack exchange (incl. KO / skip-resolution paths). */
export function isCombatResolutionTransition(
  prev: CombatSnapshot,
  next: CombatSnapshot
): boolean {
  if (prev.phase === "battle_reveal" || prev.phase === "battle_effects") {
    return (
      next.phase === "resolution" ||
      next.phase === "draw" ||
      next.phase === "victory" ||
      next.phase === "preparation"
    );
  }
  if (prev.phase === "battle_attack") {
    return (
      next.phase === "resolution" ||
      next.phase === "draw" ||
      next.phase === "victory" ||
      next.phase === "preparation"
    );
  }
  if (prev.phase === "resolution") {
    return (
      next.phase === "draw" ||
      next.phase === "victory" ||
      next.phase === "preparation"
    );
  }
  return false;
}

export function computeCombatDamage(
  prev: CombatSnapshot,
  next: CombatSnapshot
): CombatDamageResult | null {
  const playerKo = !!prev.playerActive && !next.playerActive;
  const opponentKo = !!prev.opponentActive && !next.opponentActive;

  let toOpponent = Math.max(0, prev.opponentHp - next.opponentHp);
  let toPlayer = Math.max(0, prev.playerHp - next.playerHp);

  // KO in same patch as trash: HP may already be 0 in `next` with no delta.
  if (opponentKo && toOpponent === 0 && prev.opponentHp > 0) {
    toOpponent = prev.opponentHp;
  }
  if (playerKo && toPlayer === 0 && prev.playerHp > 0) {
    toPlayer = prev.playerHp;
  }

  const hasHit = toOpponent > 0 || toPlayer > 0 || playerKo || opponentKo;
  if (!hasHit) return null;

  if (!isCombatResolutionTransition(prev, next)) {
    // Active removed after battle while phase already advanced (single combined patch).
    const koAfterBattle =
      (playerKo || opponentKo) &&
      (prev.phase === "battle_attack" || prev.phase === "resolution");
    const bothLockedIn =
      prev.playerAttack != null &&
      prev.opponentAttack != null &&
      (prev.phase === "battle_attack" || prev.phase === "resolution");

    if (!koAfterBattle && !bothLockedIn) return null;
    if (!koAfterBattle && !toOpponent && !toPlayer) return null;
  }

  return { toPlayer, toOpponent, playerKo, opponentKo };
}
