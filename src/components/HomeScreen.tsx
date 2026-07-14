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
    fetchDefaultDeck({ random: true })
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
    <div className="relative w-screen h-screen jrpg-map-bg overflow-hidden flex items-center justify-center">
      <div className="scanlines" />

      <div className="w-full max-w-xl px-6">
        <div className="digital-grid rounded-2xl border border-line bg-surface p-10 shadow-[0_0_60px_rgba(60,155,255,0.12)]">
          <div className="text-center">
            <div className="flex justify-center mb-6">
              <AppIcon
                size={88}
                className="drop-shadow-[0_0_28px_rgba(60,155,255,0.45)]"
              />
            </div>
            <div className="flex items-center justify-center gap-2 mb-2">
              <div className="flex space-x-1">
                {[1, 2, 3, 4].map(i => (
                  <div key={i} className="w-3 h-1.5 bg-ps-red transform -skew-x-12" />
                ))}
              </div>
              <span className="text-ps-red font-bold tracking-[0.2em] text-xs uppercase">
                Online Versus
              </span>
            </div>
            <div className="text-5xl font-black italic tracking-tighter text-fg">
              DIGIMON BATTLE
            </div>
            <div className="mt-3 text-muted text-sm font-mono uppercase tracking-widest">
              Digital Card Arena
            </div>
          </div>

          <div className="mt-10 grid grid-cols-1 gap-4 text-left">
            <label className="flex flex-col gap-2">
              <span className="text-xs font-mono uppercase text-muted tracking-wider">Rule profile</span>
              <select
                value={ruleProfile}
                onChange={e => setRuleProfile(e.target.value as RuleProfileId)}
                className="bg-surface-strong border border-line text-fg px-3 py-2.5 font-mono text-sm focus:outline-none focus:border-ps-blue"
              >
                <option value="fidelity_ps1">Fidelity (PS1)</option>
                <option value="legacy_online">Legacy Online</option>
              </select>
            </label>

            <label className="flex flex-col gap-2">
              <span className="text-xs font-mono uppercase text-muted tracking-wider">Arena variant</span>
              <select
                value={arenaVariant}
                onChange={e => setArenaVariant(e.target.value as ArenaVariantId)}
                className="bg-surface-strong border border-line text-fg px-3 py-2.5 font-mono text-sm focus:outline-none focus:border-ps-blue"
              >
                {arenaOptions.map(v => (
                  <option key={v.id} value={v.id}>
                    {v.label}
                  </option>
                ))}
              </select>
            </label>

            <div className="text-xs font-mono uppercase text-muted">
              Deck:{" "}
              {loadingDeck
                ? "loading default…"
                : deckSize != null
                  ? `${deckSize}-card default (validated server-side)`
                  : "default unavailable"}
            </div>
          </div>

          {joinError && (
            <div className="mt-5 text-ps-red text-sm font-mono border border-ps-red/40 bg-ps-red/10 p-3">
              {joinError}
            </div>
          )}

          <div className="mt-10 flex flex-col gap-4">
            <button
              onClick={join}
              onMouseEnter={() => audio.playUiHover()}
              className="bg-ps-yellow text-black px-8 py-4 font-black italic border-4 border-fg hover:bg-fg hover:text-ps-yellow transition-colors"
            >
              JOIN MATCH
            </button>

            <div className="text-center text-muted text-sm font-mono">
              Random matchmaking (2 players) — same profile &amp; arena required
            </div>
          </div>
        </div>

        <div className="mt-8 text-center text-muted text-xs font-mono uppercase tracking-wide">
          Tip: open two browser windows with matching settings to test
        </div>
      </div>
    </div>
  );
}
