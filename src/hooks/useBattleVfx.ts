import { useCallback, useEffect, useRef, useState } from "react";
import { useAudio } from "../context/AudioProvider";
import {
  combatSnapshot,
  computeCombatDamage,
  type CombatSnapshot,
} from "../lib/combatResolution";
import { HEAVY_DAMAGE_THRESHOLD } from "../lib/audio/sfxPresets";
import type { DigimonCardData, GameState } from "../types";

export type BattleVfxPhase = "idle" | "lunge" | "impact" | "settle";
export type CameraState = "idle" | "attack" | "damage";

export type DamagePopup = {
  id: string;
  target: "player" | "opponent";
  amount: number;
  isHeavy: boolean;
};

export type FrozenField = {
  playerActive: DigimonCardData | null;
  opponentActive: DigimonCardData | null;
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
  frozenField: FrozenField | null;
  flashColor: string | null;
  popups: DamagePopup[];
  isCounter: boolean;
  playerKo: boolean;
  opponentKo: boolean;
};

const LUNGE_MS = 380;
const IMPACT_HOLD_MS = 320;
const SETTLE_MS = 520;
const KO_SETTLE_EXTRA_MS = 280;

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
  frozenField: null,
  flashColor: null,
  popups: [],
  isCounter: false,
  playerKo: false,
  opponentKo: false,
};

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

function playCombatSfx(
  audio: ReturnType<typeof useAudio>,
  prev: CombatSnapshot,
  damage: { toPlayer: number; toOpponent: number; playerKo: boolean; opponentKo: boolean },
  isCounter: boolean
) {
  if (isCounter) {
    audio.playSfx("counter", { tag: "tag_sfx_combat", spatial: "center" });
  }

  if (damage.toOpponent > 0) {
    audio.playCombatHit(
      damage.toOpponent,
      "enemy",
      prev.playerActive?.type
    );
  }
  if (damage.toPlayer > 0) {
    audio.playCombatHit(
      damage.toPlayer,
      "player",
      prev.opponentActive?.type
    );
  }

  if (damage.playerKo || damage.opponentKo) {
    setTimeout(() => {
      audio.playSfx("thud", { tag: "tag_sfx_combat", spatial: "center" });
    }, 200);
  }
}

export function useBattleVfx(gameState: GameState): BattleVfx {
  const audio = useAudio();
  const [vfx, setVfx] = useState<BattleVfx>(INITIAL);
  const prevRef = useRef<CombatSnapshot | null>(null);
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
    const next = combatSnapshot(gameState);
    prevRef.current = next;

    if (!prev) return;

    const damage = computeCombatDamage(prev, next);
    if (!damage || runningRef.current) return;

    const triggerKey = [
      prev.playerHp,
      prev.opponentHp,
      next.playerHp,
      next.opponentHp,
      prev.playerActive?.id ?? "none",
      next.playerActive?.id ?? "none",
      prev.opponentActive?.id ?? "none",
      next.opponentActive?.id ?? "none",
    ].join("|");

    if (lastTriggerKeyRef.current === triggerKey) return;
    lastTriggerKeyRef.current = triggerKey;

    const { toPlayer, toOpponent, playerKo, opponentKo } = damage;
    runningRef.current = true;
    clearTimers();

    const isCounter =
      next.playerAttack === "cross" || next.opponentAttack === "cross";
    const isHeavy =
      toOpponent >= HEAVY_DAMAGE_THRESHOLD ||
      toPlayer >= HEAVY_DAMAGE_THRESHOLD;
    const flashColor = flashForHits(toPlayer, toOpponent, isHeavy);
    const hasKo = playerKo || opponentKo;

    const frozenField: FrozenField = {
      playerActive: prev.playerActive,
      opponentActive: prev.opponentActive,
    };

    const popupSeed = Date.now();
    const popups: DamagePopup[] = [];
    if (toOpponent > 0) {
      popups.push({
        id: `${popupSeed}-opp`,
        target: "opponent",
        amount: toOpponent,
        isHeavy: toOpponent >= HEAVY_DAMAGE_THRESHOLD,
      });
    }
    if (toPlayer > 0) {
      popups.push({
        id: `${popupSeed}-plr`,
        target: "player",
        amount: toPlayer,
        isHeavy: toPlayer >= HEAVY_DAMAGE_THRESHOLD,
      });
    }

    setVfx({
      phase: "lunge",
      isAnimating: true,
      cameraState: "attack",
      playerAttacking: toOpponent > 0,
      opponentAttacking: toPlayer > 0,
      playerHit: false,
      opponentHit: false,
      displayPlayerHp: prev.playerHp,
      displayOpponentHp: prev.opponentHp,
      frozenField,
      flashColor: null,
      popups: [],
      isCounter,
      playerKo,
      opponentKo,
    });

    schedule(() => {
      playCombatSfx(audio, prev, damage, isCounter);

      setVfx((s) => ({
        ...s,
        phase: "impact",
        cameraState: "damage",
        playerAttacking: false,
        opponentAttacking: false,
        playerHit: toPlayer > 0,
        opponentHit: toOpponent > 0,
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
        displayPlayerHp: playerKo ? 0 : null,
        displayOpponentHp: opponentKo ? 0 : null,
      }));
    }, LUNGE_MS + IMPACT_HOLD_MS);

    const totalMs =
      LUNGE_MS + IMPACT_HOLD_MS + SETTLE_MS + (hasKo ? KO_SETTLE_EXTRA_MS : 0);

    schedule(() => {
      setVfx((s) => ({
        ...s,
        displayPlayerHp: null,
        displayOpponentHp: null,
      }));
    }, totalMs - 80);

    schedule(() => {
      resetVfx();
    }, totalMs);
  }, [gameState, clearTimers, resetVfx, schedule, audio]);

  useEffect(() => {
    if (gameState.phase === "waiting") {
      resetVfx();
    }
  }, [gameState.phase, resetVfx]);

  useEffect(() => () => resetVfx(), [resetVfx]);

  return vfx;
}
