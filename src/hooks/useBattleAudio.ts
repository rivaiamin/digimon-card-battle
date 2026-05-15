import { useEffect, useRef } from "react";
import { useAudio } from "../context/AudioProvider";
import type { GameState } from "../types";

const LEVEL_RANK: Record<string, number> = {
  Rookie: 1,
  Champion: 2,
  Ultimate: 3,
  Mega: 4,
  Armor: 2,
};

type Snapshot = {
  phase: GameState["phase"];
  playerHp: number;
  opponentHp: number;
  playerMaxHp: number;
  playerActiveId: string | null;
  playerActiveLevel: string | null;
  opponentActiveId: string | null;
  playerSelectedAttack: GameState["player"]["selectedAttack"];
  opponentSelectedAttack: GameState["opponent"]["selectedAttack"];
  winnerSessionId?: string;
};

function snapshot(state: GameState): Snapshot {
  return {
    phase: state.phase,
    playerHp: state.player.hp,
    opponentHp: state.opponent.hp,
    playerMaxHp: state.player.active?.maxHp ?? 0,
    playerActiveId: state.player.active?.id ?? null,
    playerActiveLevel: state.player.active?.level ?? null,
    opponentActiveId: state.opponent.active?.id ?? null,
    playerSelectedAttack: state.player.selectedAttack,
    opponentSelectedAttack: state.opponent.selectedAttack,
    winnerSessionId: state.winnerSessionId,
  };
}

export function useBattleAudio(gameState: GameState, sessionId: string) {
  const audio = useAudio();
  const prevRef = useRef<Snapshot | null>(null);
  const rewardIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const inBattle = gameState.phase !== "waiting";

  useEffect(() => {
    if (!inBattle) return;
    audio.startBgm();
    return () => {
      audio.stopBgm();
      audio.setPinchMode(false);
    };
  }, [inBattle, audio]);

  useEffect(() => {
    if (gameState.phase === "waiting") return;

    const maxHp = gameState.player.active?.maxHp ?? 1;
    const ratio = maxHp > 0 ? gameState.player.hp / maxHp : 1;
    audio.setPinchMode(ratio > 0 && ratio < 0.25);
  }, [gameState.player.hp, gameState.player.active?.maxHp, audio]);

  useEffect(() => {
    const prev = prevRef.current;
    const next = snapshot(gameState);
    if (!prev) {
      prevRef.current = next;
      return;
    }

    if (prev.phase !== next.phase) {
      switch (next.phase) {
        case "preparation":
          audio.playSfx("phase_alert");
          break;
        case "battle_support":
        case "battle_attack":
          audio.playSfx("chime");
          break;
        case "resolution":
          audio.playSfx("phase_alert");
          break;
        case "victory": {
          audio.playSfx("thud", { spatial: "center" });
          let ticks = 0;
          rewardIntervalRef.current = setInterval(() => {
            ticks += 1;
            audio.playSfx("reward_tick");
            if (ticks >= 12) {
              if (rewardIntervalRef.current) clearInterval(rewardIntervalRef.current);
              audio.playSfx("reward_clang");
            }
          }, 80);
          break;
        }
        default:
          break;
      }
    }

    if (next.phase === "resolution" && prev.phase === "battle_attack") {
      const dmgToOpponent = prev.opponentHp - next.opponentHp;
      const dmgToPlayer = prev.playerHp - next.playerHp;

      if (
        next.playerSelectedAttack === "cross" ||
        next.opponentSelectedAttack === "cross"
      ) {
        audio.playSfx("counter", { tag: "tag_sfx_combat", spatial: "center" });
      }

      if (dmgToOpponent > 0) {
        audio.playCombatHit(
          dmgToOpponent,
          "enemy",
          gameState.player.active?.type
        );
      }
      if (dmgToPlayer > 0) {
        audio.playCombatHit(
          dmgToPlayer,
          "player",
          gameState.opponent.active?.type
        );
      }
    }

    if (
      gameState.phase === "preparation" &&
      next.playerActiveId &&
      next.playerActiveId !== prev.playerActiveId
    ) {
      const prevRank = prev.playerActiveLevel ? LEVEL_RANK[prev.playerActiveLevel] ?? 0 : 0;
      const nextRank = next.playerActiveLevel ? LEVEL_RANK[next.playerActiveLevel] ?? 0 : 0;
      if (!prev.playerActiveId) {
        audio.playSfx("thud", { spatial: "player" });
      } else if (nextRank > prevRank) {
        audio.playSfx("evolve", { spatial: "player" });
      }
    }

    prevRef.current = next;

    return () => {
      if (rewardIntervalRef.current && next.phase !== "victory") {
        clearInterval(rewardIntervalRef.current);
        rewardIntervalRef.current = null;
      }
    };
  }, [gameState, sessionId, audio]);
}
