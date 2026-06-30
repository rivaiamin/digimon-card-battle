import React, { useEffect, useState } from "react";
import { AppIcon } from "./AppIcon";
import { useAudio } from "../context/AudioProvider";
import type { ArenaVariantId } from "../lib/arenaVariant";
import type { RuleProfileId } from "../lib/ruleProfile";
import { listArenaVariants } from "../lib/arenaVariant";
import { fetchDefaultDeck } from "../services/deckService";
import type { MatchJoinOptions } from "../services/matchmaking";

type Props = {
  onJoinMatch: (config: MatchJoinOptions) => void;
  joinError?: string | null;
};

export function HomeScreen({ onJoinMatch, joinError }: Props) {
  const audio = useAudio();
  const [ruleProfile, setRuleProfile] = useState<RuleProfileId>("fidelity_ps1");
  const [arenaVariant, setArenaVariant] = useState<ArenaVariantId>("standard");
  const [deckSize, setDeckSize] = useState<number | null>(null);
  const [loadingDeck, setLoadingDeck] = useState(false);

  const arenaOptions = listArenaVariants(ruleProfile);

  useEffect(() => {
    if (!arenaOptions.some(v => v.id === arenaVariant)) {
      setArenaVariant(arenaOptions[0]?.id ?? "standard");
    }
  }, [ruleProfile, arenaVariant, arenaOptions]);

  useEffect(() => {
    let cancelled = false;
    setLoadingDeck(true);
    fetchDefaultDeck(0)
      .then(ids => {
        if (!cancelled) setDeckSize(ids.length);
      })
      .catch(() => {
        if (!cancelled) setDeckSize(null);
      })
      .finally(() => {
        if (!cancelled) setLoadingDeck(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const join = () => {
    audio.playSfx("menu_click");
    onJoinMatch({ ruleProfile, arenaVariant });
  };

  return (
    <div className="relative w-screen h-screen bg-black overflow-hidden flex items-center justify-center">
      <div className="scanlines" />

      <div className="w-full max-w-xl px-6">
        <div className="digital-grid rounded-2xl border border-white/10 bg-black/60 p-8 shadow-[0_0_60px_rgba(60,155,255,0.15)]">
          <div className="text-center">
            <div className="flex justify-center mb-5">
              <AppIcon
                size={88}
                className="drop-shadow-[0_0_28px_rgba(60,155,255,0.55)]"
              />
            </div>
            <div className="text-5xl font-black italic tracking-tighter text-ps-blue">
              DIGIMON BATTLE
            </div>
            <div className="mt-2 text-white/50 text-sm font-mono uppercase tracking-widest">
              Online Versus
            </div>
          </div>

          <div className="mt-8 grid grid-cols-1 gap-3 text-left">
            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-mono uppercase text-white/50">Rule profile</span>
              <select
                value={ruleProfile}
                onChange={e => setRuleProfile(e.target.value as RuleProfileId)}
                className="bg-black/80 border border-white/20 text-white px-3 py-2 font-mono text-sm"
              >
                <option value="fidelity_ps1">Fidelity (PS1)</option>
                <option value="legacy_online">Legacy Online</option>
              </select>
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-mono uppercase text-white/50">Arena variant</span>
              <select
                value={arenaVariant}
                onChange={e => setArenaVariant(e.target.value as ArenaVariantId)}
                className="bg-black/80 border border-white/20 text-white px-3 py-2 font-mono text-sm"
              >
                {arenaOptions.map(v => (
                  <option key={v.id} value={v.id}>
                    {v.label}
                  </option>
                ))}
              </select>
            </label>

            <div className="text-[10px] font-mono uppercase text-white/40">
              Deck:{" "}
              {loadingDeck
                ? "loading default…"
                : deckSize != null
                  ? `${deckSize}-card default (validated server-side)`
                  : "default unavailable"}
            </div>
          </div>

          {joinError && (
            <div className="mt-4 text-ps-red text-xs font-mono border border-ps-red/40 bg-ps-red/10 p-3">
              {joinError}
            </div>
          )}

          <div className="mt-8 flex flex-col gap-3">
            <button
              onClick={join}
              onMouseEnter={() => audio.playUiHover()}
              className="bg-ps-yellow text-black px-8 py-4 font-black italic border-4 border-black hover:bg-white"
            >
              JOIN MATCH
            </button>

            <div className="text-center text-white/40 text-xs font-mono">
              Random matchmaking (2 players) — same profile &amp; arena required
            </div>
          </div>
        </div>

        <div className="mt-6 text-center text-white/30 text-[10px] font-mono uppercase">
          Tip: open two browser windows with matching settings to test
        </div>
      </div>
    </div>
  );
}
