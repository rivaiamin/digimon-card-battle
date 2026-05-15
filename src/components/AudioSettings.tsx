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
        className="pointer-events-auto bg-black/80 border border-white/20 text-white/70 text-[10px] font-mono uppercase px-3 py-1.5 hover:border-ps-blue hover:text-ps-blue"
        aria-expanded={open}
        aria-label="Audio settings"
      >
        Audio
      </button>
      {open && (
        <div
          className="absolute bottom-full right-0 mb-2 w-56 bg-black/95 border border-ps-blue/40 p-3 shadow-lg pointer-events-auto z-[300]"
          role="dialog"
          aria-label="Volume mixer"
        >
          {SLIDERS.map(({ key, label }) => (
            <label key={key} className="flex items-center gap-2 mb-2 last:mb-0 text-[10px] font-mono text-white/80">
              <span className="w-14 uppercase">{label}</span>
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
