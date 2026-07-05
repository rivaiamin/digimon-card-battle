import React, { useState } from "react";
import { useAudio } from "../context/AudioProvider";
import type { AudioTag } from "../lib/audio";

const SLIDERS: { key: AudioTag | "master"; label: string }[] = [
  { key: "master", label: "Master" },
  { key: "tag_bgm", label: "BGM" },
  { key: "tag_sfx_ui", label: "UI" },
  { key: "tag_sfx_combat", label: "Combat" },
  { key: "tag_voice", label: "Voice" },
];

export function AudioSettings({ className = "" }: { className?: string }) {
  const { volumes, setVolumes, playSfx } = useAudio();
  const [open, setOpen] = useState(false);

  return (
    <div className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => {
          setOpen((o) => !o);
          playSfx("menu_click");
        }}
        className="pointer-events-auto bg-surface border border-line text-muted text-xs font-mono uppercase px-3 py-1.5 hover:border-ps-blue hover:text-ps-blue transition-colors"
        aria-expanded={open}
        aria-label="Audio settings"
      >
        Audio
      </button>
      {open && (
        <div
          className="absolute top-full right-0 mt-2 w-56 bg-surface-strong border border-ps-blue/40 p-4 shadow-lg pointer-events-auto z-[300]"
          role="dialog"
          aria-label="Volume mixer"
        >
          {SLIDERS.map(({ key, label }) => (
            <label key={key} className="flex items-center gap-2 mb-3 last:mb-0 text-xs font-mono text-fg">
              <span className="w-14 uppercase text-muted">{label}</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={volumes[key]}
                onChange={(e) => setVolumes({ [key]: Number(e.target.value) })}
                className="flex-1 accent-ps-blue"
              />
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
