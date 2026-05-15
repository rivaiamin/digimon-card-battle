import { useCallback, useEffect, useRef, useState } from "react";
import { HEAVY_DAMAGE_THRESHOLD } from "../lib/audio/sfxPresets";
import type { GameState } from "../types";

export type BattleVfxPhase = "idle" | "lunge" | "impact" | "settle";
export type CameraState = "idle" | "attack" | "damage";

export type DamagePopup = {
  id: string;
  target: "player" | "opponent";
  amount: number;
  isHeavy: boolean;
};

export type BattleVfx = {
  phase: BattleVfxPhase;
  isAnimating: boolean;
  cameraState: CameraState;
  playerAttacking: boolean;
  opponentAttacking: boolean;
  playerHit: boolean;
  opponentHit: boolean;
  displayPlayerHp: number | null;
  displayOpponentHp: number | null;
  flashColor: string | null;
  popups: DamagePopup[];
  isCounter: boolean;
};

const LUNGE_MS = 380;
const IMPACT_HOLD_MS = 320;
const SETTLE_MS = 520;

const INITIAL: BattleVfx = {
  phase: "idle",
  isAnimating: false,
  cameraState: "idle",
  playerAttacking: false,
  opponentAttacking: false,
  playerHit: false,
  opponentHit: false,
  displayPlayerHp: null,
  displayOpponentHp: null,
  flashColor: null,
  popups: [],
  isCounter: false,
};

type Snapshot = {
  phase: GameState["phase"];
  playerHp: number;
  opponentHp: number;
  playerAttack: GameState["player"]["selectedAttack"];
  opponentAttack: GameState["opponent"]["selectedAttack"];
};

function snapshot(state: GameState): Snapshot {
  return {
    phase: state.phase,
    playerHp: state.player.hp,
    opponentHp: state.opponent.hp,
    playerAttack: state.player.selectedAttack,
    opponentAttack: state.opponent.selectedAttack,
  };
}

function flashForHits(
  dmgToPlayer: number,
  dmgToOpponent: number,
  isHeavy: boolean
): string {
  if (dmgToPlayer > 0 && dmgToOpponent > 0) {
    return isHeavy ? "rgba(255,255,255,0.55)" : "rgba(255,255,255,0.35)";
  }
  if (dmgToPlayer > 0) {
    return isHeavy ? "rgba(60,155,255,0.5)" : "rgba(60,155,255,0.28)";
  }
  return isHeavy ? "rgba(255,60,60,0.5)" : "rgba(255,60,60,0.28)";
}

function shouldTriggerCombatVfx(prev: Snapshot, next: Snapshot): boolean {
  const leavingAttack =
    prev.phase === "battle_attack" &&
    (next.phase === "resolution" || next.phase === "draw" || next.phase === "victory");
  const resolutionToNext =
    prev.phase === "resolution" &&
    (next.phase === "draw" || next.phase === "preparation" || next.phase === "victory");
  return leavingAttack || resolutionToNext;
}

export function useBattleVfx(gameState: GameState): BattleVfx {
  const [vfx, setVfx] = useState<BattleVfx>(INITIAL);
  const prevRef = useRef<Snapshot | null>(null);
  const runningRef = useRef(false);
  const lastTriggerKeyRef = useRef<string | null>(null);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearTimers = useCallback(() => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
  }, []);

  const schedule = useCallback((fn: () => void, ms: number) => {
    const id = setTimeout(fn, ms);
    timersRef.current.push(id);
  }, []);

  const resetVfx = useCallback(() => {
    clearTimers();
    runningRef.current = false;
    lastTriggerKeyRef.current = null;
    setVfx(INITIAL);
  }, [clearTimers]);

  useEffect(() => {
    const prev = prevRef.current;
    const next = snapshot(gameState);
    prevRef.current = next;

    if (!prev) return;

    const dmgToOpponent = Math.max(0, prev.opponentHp - next.opponentHp);
    const dmgToPlayer = Math.max(0, prev.playerHp - next.playerHp);
    const hasDamage = dmgToOpponent > 0 || dmgToPlayer > 0;

    if (!shouldTriggerCombatVfx(prev, next) || !hasDamage || runningRef.current) {
      return;
    }

    const triggerKey = `${prev.playerHp}-${prev.opponentHp}->${next.playerHp}-${next.opponentHp}`;
    if (lastTriggerKeyRef.current === triggerKey) {
      return;
    }
    lastTriggerKeyRef.current = triggerKey;

    runningRef.current = true;
    clearTimers();

    const isCounter =
      next.playerAttack === "cross" || next.opponentAttack === "cross";
    const isHeavy =
      dmgToOpponent >= HEAVY_DAMAGE_THRESHOLD ||
      dmgToPlayer >= HEAVY_DAMAGE_THRESHOLD;
    const flashColor = flashForHits(dmgToPlayer, dmgToOpponent, isHeavy);

    const popupSeed = Date.now();
    const popups: DamagePopup[] = [];
    if (dmgToOpponent > 0) {
      popups.push({
        id: `${popupSeed}-opp`,
        target: "opponent",
        amount: dmgToOpponent,
        isHeavy: dmgToOpponent >= HEAVY_DAMAGE_THRESHOLD,
      });
    }
    if (dmgToPlayer > 0) {
      popups.push({
        id: `${popupSeed}-plr`,
        target: "player",
        amount: dmgToPlayer,
        isHeavy: dmgToPlayer >= HEAVY_DAMAGE_THRESHOLD,
      });
    }

    setVfx({
      phase: "lunge",
      isAnimating: true,
      cameraState: "attack",
      playerAttacking: dmgToOpponent > 0,
      opponentAttacking: dmgToPlayer > 0,
      playerHit: false,
      opponentHit: false,
      displayPlayerHp: prev.playerHp,
      displayOpponentHp: prev.opponentHp,
      flashColor: null,
      popups: [],
      isCounter,
    });

    schedule(() => {
      setVfx((s) => ({
        ...s,
        phase: "impact",
        cameraState: "damage",
        playerAttacking: false,
        opponentAttacking: false,
        playerHit: dmgToPlayer > 0,
        opponentHit: dmgToOpponent > 0,
        flashColor,
        popups,
      }));
    }, LUNGE_MS);

    schedule(() => {
      setVfx((s) => ({
        ...s,
        phase: "settle",
        cameraState: "damage",
        playerHit: false,
        opponentHit: false,
        flashColor: null,
        displayPlayerHp: null,
        displayOpponentHp: null,
      }));
    }, LUNGE_MS + IMPACT_HOLD_MS);

    schedule(() => {
      resetVfx();
    }, LUNGE_MS + IMPACT_HOLD_MS + SETTLE_MS);
  }, [gameState, clearTimers, resetVfx, schedule]);

  useEffect(() => {
    if (gameState.phase === "waiting") {
      resetVfx();
    }
  }, [gameState.phase, resetVfx]);

  useEffect(() => () => resetVfx(), [resetVfx]);

  return vfx;
}
