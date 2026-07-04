/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Arena } from "./components/Arena";
import { AudioSettings } from "./components/AudioSettings";
import { ThemeToggle } from "./components/ThemeToggle";
import { HomeScreen } from "./components/HomeScreen";
import { useAudio } from "./context/AudioProvider";
import { useCallback, useEffect, useRef, useState } from "react";
import { joinRandomBattle, type MatchJoinOptions } from "./services/matchmaking";
import { formatJoinError } from "./services/deckService";
import type { Room } from "colyseus.js";
import type { BattleStateSchema } from "./schema/BattleState";

export default function App() {
  const audio = useAudio();
  const [screen, setScreen] = useState<"home" | "queueing" | "game">("home");
  const [room, setRoom] = useState<Room<BattleStateSchema> | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);
  const joinAttemptIdRef = useRef(0);

  const handleJoin = useCallback(async (config: MatchJoinOptions) => {
    joinAttemptIdRef.current += 1;
    const attemptId = joinAttemptIdRef.current;
    setJoinError(null);
    setScreen("queueing");
    try {
      const r = await joinRandomBattle(config);
      if (attemptId !== joinAttemptIdRef.current) {
        r.leave();
        return;
      }
      // Stay on queue until a second player is in the room (no timeout).
      setRoom(r);
    } catch (e) {
      console.error(e);
      if (attemptId !== joinAttemptIdRef.current) return;
      setRoom(null);
      setJoinError(formatJoinError(e));
      setScreen("home");
    }
  }, []);

  // Wait in queue until both players are in the room. Use `room.onStateChange` only:
  // `Callbacks.onAdd("players")` runs before the client decoder assigns refIds and throws
  // "Can't addCallback on 'players' (refId is undefined)". Colyseus invokes onStateChange
  // after every full state and every patch, so player count updates are visible here.
  useEffect(() => {
    if (screen !== "queueing" || !room) return;

    const tryEnterGame = () => {
      if (room.state.players.size >= 2) {
        audio.playSfx("chime");
        setScreen("game");
      }
    };

    tryEnterGame();
    room.onStateChange(tryEnterGame);

    return () => {
      room.onStateChange.remove(tryEnterGame);
    };
  }, [screen, room, audio]);

  const handleCancel = useCallback(() => {
    joinAttemptIdRef.current += 1;
    if (room) room.leave();
    setRoom(null);
    setScreen("home");
  }, [room]);

  return (
    <div className="w-full h-screen bg-app text-fg">
      <div className="fixed top-4 right-4 z-[500] flex items-center gap-2">
        <ThemeToggle />
        <AudioSettings />
      </div>
      {screen === "home" && <HomeScreen onJoinMatch={handleJoin} joinError={joinError} />}

      {screen === "queueing" && (
        <div className="relative w-screen h-screen jrpg-map-bg overflow-hidden flex items-center justify-center">
          <div className="scanlines" />
          <div className="digital-grid rounded-2xl border border-line bg-surface p-10 text-center shadow-[0_0_60px_rgba(60,155,255,0.12)]">
            <div className="text-4xl font-black italic text-ps-blue tracking-tighter">
              FINDING OPPONENT...
            </div>
            <div className="mt-4 text-muted text-sm font-mono uppercase tracking-widest animate-pulse">
              Waiting for another player — no time limit
            </div>
            <button
              onClick={handleCancel}
              className="mt-10 bg-ps-red text-white px-8 py-4 font-black italic border-4 border-fg hover:bg-fg hover:text-ps-red transition-colors"
            >
              CANCEL
            </button>
          </div>
        </div>
      )}

      {screen === "game" && room && <Arena room={room} />}
    </div>
  );
}
