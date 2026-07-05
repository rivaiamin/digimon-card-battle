import { useCallback, useEffect, useRef, useState } from "react";
import { useAudio } from "../context/AudioProvider";
import {
  combatSnapshot,
  computeCombatDamage,
  isCombatResolutionTransition,
  type CombatSnapshot,
  type CombatDamageResult,
} from "../lib/combatResolution";
import {
  parseCombatStrikesJson,
  resolveCombatStrikes,
  type CombatStrike,
} from "../lib/combatStrikePlan";
import { HEAVY_DAMAGE_THRESHOLD } from "../lib/audio/sfxPresets";
import type { DigimonCardData, GameState } from "../types";

export type BattleVfxPhase =
  | "idle"
  | "raise"
  | "impact"
  | "rest"
  | "ko_beat"
  | "lunge"
  | "settle";
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

export type ActiveStrikeSide = "player" | "opponent" | null;

export type BattleVfx = {
  phase: BattleVfxPhase;
  isAnimating: boolean;
  cameraState: CameraState;
  playerAttacking: boolean;
  opponentAttacking: boolean;
  playerRaised: boolean;
  opponentRaised: boolean;
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
  activeStrike: CombatStrike | null;
  activeStrikeSide: ActiveStrikeSide;
  koMessage: string | null;
  koSide: "player" | "opponent" | null;
};

/** Playback at 50% speed — durations doubled from original targets. */
const RAISE_MS = 700;
const IMPACT_MS = 600;
const REST_MS = 500;
const KO_BEAT_MS = 800;
const ATTACK_REVEAL_MS = 1800;

const WHITE_FLASH = "rgba(255,255,255,0.45)";
const WHITE_FLASH_HEAVY = "rgba(255,255,255,0.55)";

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
  playerRaised: false,
  opponentRaised: false,
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
  activeStrike: null,
  activeStrikeSide: null,
  koMessage: null,
  koSide: null,
};

function strikeAttackerSide(
  strike: CombatStrike,
  playerSessionId: string
): ActiveStrikeSide {
  return strike.attackerSessionId === playerSessionId ? "player" : "opponent";
}

function strikeDefenderSide(side: ActiveStrikeSide): ActiveStrikeSide {
  return side === "player" ? "opponent" : side === "opponent" ? "player" : null;
}

export function useBattleVfx(
  gameState: GameState,
  playerSessionId: string,
  opponentSessionId: string
): BattleVfx {
  const audio = useAudio();
  const [vfx, setVfx] = useState<BattleVfx>(INITIAL);
  const prevRef = useRef<CombatSnapshot | null>(null);
  const runningRef = useRef(false);
  const lastTriggerKeyRef = useRef<string | null>(null);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const pendingStrikesRef = useRef<CombatStrike[]>([]);

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
    pendingStrikesRef.current = [];
    setVfx(INITIAL);
  }, [clearTimers]);

  const runStrikeSequence = useCallback(
    (
      strikes: CombatStrike[],
      prev: CombatSnapshot,
      next: CombatSnapshot,
      damage: CombatDamageResult
    ) => {
      if (strikes.length === 0) return;

      runningRef.current = true;
      clearTimers();
      pendingStrikesRef.current = strikes;

      const frozenField: FrozenField = {
        playerActive: prev.playerActive,
        opponentActive: prev.opponentActive,
      };

      let runningPlayerHp = prev.playerHp;
      let runningOpponentHp = prev.opponentHp;
      let elapsed = 0;

      const isCounter =
        next.playerAttack === "cross" || next.opponentAttack === "cross";

      setVfx((s) => ({
        ...s,
        phase: "raise",
        isAnimating: true,
        cameraState: "attack",
        frozenField,
        displayPlayerHp: runningPlayerHp,
        displayOpponentHp: runningOpponentHp,
        isCounter,
        playerKo: damage.playerKo,
        opponentKo: damage.opponentKo,
        reveal: INITIAL_REVEAL,
        koMessage: null,
        koSide: null,
        playerRaised: false,
        opponentRaised: false,
        playerHit: false,
        opponentHit: false,
        playerAttacking: false,
        opponentAttacking: false,
      }));

      strikes.forEach((strike, index) => {
        const attackerSide = strikeAttackerSide(strike, playerSessionId);
        const defenderSide = strikeDefenderSide(attackerSide);
        if (!attackerSide || !defenderSide) return;

        const strikeStart = elapsed;
        const isHeavy = strike.totalDamage >= HEAVY_DAMAGE_THRESHOLD;
        const popupId = `${Date.now()}-${index}`;
        const defenderName =
          defenderSide === "player"
            ? prev.playerActive?.name
            : prev.opponentActive?.name;
        const targetKo = strike.targetHpAfter <= 0;

        schedule(() => {
          setVfx((s) => ({
            ...s,
            phase: "raise",
            cameraState: "attack",
            playerRaised: attackerSide === "player",
            opponentRaised: attackerSide === "opponent",
            playerHit: false,
            opponentHit: false,
            flashColor: null,
            popups: [],
            activeStrike: strike,
            activeStrikeSide: attackerSide,
          }));
        }, strikeStart);

        schedule(() => {
          if (strike.attack === "cross") {
            audio.playSfx("counter", { tag: "tag_sfx_combat", spatial: "center" });
          }
          audio.playCombatHit(
            strike.totalDamage,
            defenderSide === "opponent" ? "enemy" : "player",
            attackerSide === "player"
              ? prev.playerActive?.type
              : prev.opponentActive?.type
          );

          if (defenderSide === "player") {
            runningPlayerHp = strike.targetHpAfter;
          } else {
            runningOpponentHp = strike.targetHpAfter;
          }

          setVfx((s) => ({
            ...s,
            phase: "impact",
            cameraState: "damage",
            playerRaised: false,
            opponentRaised: false,
            playerHit: defenderSide === "player",
            opponentHit: defenderSide === "opponent",
            flashColor: isHeavy ? WHITE_FLASH_HEAVY : WHITE_FLASH,
            popups:
              strike.totalDamage > 0
                ? [
                    {
                      id: popupId,
                      target: defenderSide,
                      amount: strike.totalDamage,
                      isHeavy,
                    },
                  ]
                : [],
            displayPlayerHp: runningPlayerHp,
            displayOpponentHp: runningOpponentHp,
          }));
        }, strikeStart + RAISE_MS);

        elapsed = strikeStart + RAISE_MS + IMPACT_MS;

        schedule(() => {
          setVfx((s) => ({
            ...s,
            phase: "rest",
            playerHit: false,
            opponentHit: false,
            flashColor: null,
            popups: [],
            activeStrike: null,
            activeStrikeSide: null,
          }));
        }, elapsed);

        elapsed += REST_MS;

        if (targetKo) {
          schedule(() => {
            audio.playSfx("thud", { tag: "tag_sfx_combat", spatial: "center" });
            setVfx((s) => ({
              ...s,
              phase: "ko_beat",
              cameraState: "damage",
              koMessage: `${defenderName ?? "Digimon"} was defeated!`,
              koSide: defenderSide,
              displayPlayerHp: defenderSide === "player" ? 0 : s.displayPlayerHp,
              displayOpponentHp: defenderSide === "opponent" ? 0 : s.displayOpponentHp,
            }));
          }, elapsed);
          elapsed += KO_BEAT_MS;
        }
      });

      schedule(() => resetVfx(), elapsed + 80);
    },
    [audio, clearTimers, playerSessionId, resetVfx, schedule]
  );

  const runCombatAnimation = useCallback(
    (
      prev: CombatSnapshot,
      next: CombatSnapshot,
      damage: CombatDamageResult,
      strikes: CombatStrike[]
    ) => {
      if (runningRef.current || strikes.length === 0) return;

      const triggerKey = [
        prev.playerHp,
        prev.opponentHp,
        next.playerHp,
        next.opponentHp,
        prev.playerActive?.id ?? "none",
        next.playerActive?.id ?? "none",
        prev.opponentActive?.id ?? "none",
        next.opponentActive?.id ?? "none",
        strikes.map((s) => `${s.attackerSessionId}:${s.totalDamage}:${s.targetHpAfter}`).join(","),
      ].join("|");

      if (lastTriggerKeyRef.current === triggerKey) return;
      lastTriggerKeyRef.current = triggerKey;

      runStrikeSequence(strikes, prev, next, damage);
    },
    [runStrikeSequence]
  );

  useEffect(() => {
    if (gameState.combatStrikesJson) {
      const parsed = parseCombatStrikesJson(gameState.combatStrikesJson);
      if (parsed.length > 0) pendingStrikesRef.current = parsed;
    }
  }, [gameState.combatStrikesJson]);

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

    const attackerSessionId = gameState.lastBattleAttackerSessionId ?? "";
    const strikes = resolveCombatStrikes(
      gameState.combatStrikesJson ?? "",
      prev,
      next,
      damage,
      attackerSessionId,
      playerSessionId,
      opponentSessionId
    );

    if (strikes.length === 0) return;

    pendingStrikesRef.current = strikes;

    const combatEnded = isCombatResolutionTransition(prev, next);
    const showAttackReveal =
      combatEnded &&
      !!next.playerAttack &&
      !!next.opponentAttack &&
      (prev.phase === "battle_reveal" ||
        (!prev.playerAttack && !prev.opponentAttack));

    if (showAttackReveal) {
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
        runCombatAnimation(prev, next, damage, pendingStrikesRef.current);
      }, ATTACK_REVEAL_MS);
      return;
    }

    runCombatAnimation(prev, next, damage, strikes);
  }, [
    gameState,
    opponentSessionId,
    playerSessionId,
    runCombatAnimation,
    schedule,
  ]);

  useEffect(() => {
    if (gameState.phase === "waiting") {
      resetVfx();
    }
  }, [gameState.phase, resetVfx]);

  useEffect(() => () => resetVfx(), [resetVfx]);

  return vfx;
}
