import { useCallback, useEffect, useRef, useState } from "react";
import { useAudio } from "../context/AudioProvider";
import {
  combatSnapshot,
  computeCombatDamage,
  type CombatSnapshot,
  type CombatDamageResult,
} from "../lib/combatResolution";
import { HEAVY_DAMAGE_THRESHOLD } from "../lib/audio/sfxPresets";
import type { DigimonCardData, GameState } from "../types";

export type BattleVfxPhase = "idle" | "lunge" | "impact" | "settle";
export type CameraState = "idle" | "attack" | "damage";
export type RevealStage = "support" | "attacks" | null;
export type AttackType = "circle" | "triangle" | "cross";

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

export type BattleRevealState = {
  active: boolean;
  stage: RevealStage;
  playerAttack: AttackType | null;
  opponentAttack: AttackType | null;
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
  reveal: BattleRevealState;
};

const LUNGE_MS = 380;
const IMPACT_HOLD_MS = 320;
const SETTLE_MS = 520;
const KO_SETTLE_EXTRA_MS = 280;
const ATTACK_REVEAL_MS = 900;

const INITIAL_REVEAL: BattleRevealState = {
  active: false,
  stage: null,
  playerAttack: null,
  opponentAttack: null,
};

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
  reveal: INITIAL_REVEAL,
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
  damage: CombatDamageResult,
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

function attacksFreshlyRevealed(prev: CombatSnapshot, next: CombatSnapshot): boolean {
  return (
    !prev.playerAttack &&
    !prev.opponentAttack &&
    !!next.playerAttack &&
    !!next.opponentAttack
  );
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

  const runCombatAnimation = useCallback(
    (prev: CombatSnapshot, next: CombatSnapshot, damage: CombatDamageResult) => {
      if (runningRef.current) return;

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

      setVfx((s) => ({
        ...s,
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
        reveal: INITIAL_REVEAL,
      }));

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
    },
    [audio, clearTimers, resetVfx, schedule]
  );

  useEffect(() => {
    if (gameState.phase === "battle_reveal") {
      setVfx((s) => ({
        ...s,
        reveal: {
          active: true,
          stage: "support",
          playerAttack: null,
          opponentAttack: null,
        },
      }));
      return;
    }

    if (
      gameState.phase !== "resolution" &&
      !runningRef.current &&
      gameState.phase !== "battle_attack"
    ) {
      setVfx((s) =>
        s.reveal.active && s.reveal.stage === "support"
          ? { ...s, reveal: INITIAL_REVEAL }
          : s
      );
    }
  }, [gameState.phase]);

  useEffect(() => {
    const prev = prevRef.current;
    const next = combatSnapshot(gameState);
    prevRef.current = next;

    if (!prev) return;

    const damage = computeCombatDamage(prev, next);
    if (!damage || runningRef.current) return;

    const showAttackReveal =
      attacksFreshlyRevealed(prev, next) ||
      (prev.phase === "battle_reveal" && next.phase === "resolution");

    if (showAttackReveal && next.playerAttack && next.opponentAttack) {
      setVfx((s) => ({
        ...s,
        reveal: {
          active: true,
          stage: "attacks",
          playerAttack: next.playerAttack,
          opponentAttack: next.opponentAttack,
        },
      }));
      schedule(() => {
        runCombatAnimation(prev, next, damage);
      }, ATTACK_REVEAL_MS);
      return;
    }

    runCombatAnimation(prev, next, damage);
  }, [gameState, runCombatAnimation, schedule]);

  useEffect(() => {
    if (gameState.phase === "waiting") {
      resetVfx();
    }
  }, [gameState.phase, resetVfx]);

  useEffect(() => () => resetVfx(), [resetVfx]);

  return vfx;
}
