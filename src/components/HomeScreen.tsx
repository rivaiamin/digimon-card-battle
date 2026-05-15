import React from "react";
import { useAudio } from "../context/AudioProvider";

type Props = {
  onJoinMatch: () => void;
};

export function HomeScreen({ onJoinMatch }: Props) {
  const audio = useAudio();

  const join = () => {
    audio.playSfx("menu_click");
    onJoinMatch();
  };
  return (
    <div className="relative w-screen h-screen bg-black overflow-hidden flex items-center justify-center">
      <div className="scanlines" />

      <div className="w-full max-w-xl px-6">
        <div className="digital-grid rounded-2xl border border-white/10 bg-black/60 p-8 shadow-[0_0_60px_rgba(60,155,255,0.15)]">
          <div className="text-center">
            <div className="text-5xl font-black italic tracking-tighter text-ps-blue">
              DIGIMON BATTLE
            </div>
            <div className="mt-2 text-white/50 text-sm font-mono uppercase tracking-widest">
              Online Versus
            </div>
          </div>

          <div className="mt-10 flex flex-col gap-3">
            <button
              onClick={join}
              onMouseEnter={() => audio.playUiHover()}
              className="bg-ps-yellow text-black px-8 py-4 font-black italic border-4 border-black hover:bg-white"
            >
              JOIN MATCH
            </button>

            <div className="text-center text-white/40 text-xs font-mono">
              Random matchmaking (2 players)
            </div>
          </div>
        </div>

        <div className="mt-6 text-center text-white/30 text-[10px] font-mono uppercase">
          Tip: open two browser windows to test matchmaking
        </div>
      </div>
    </div>
  );
}

