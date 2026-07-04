import React from "react";
import { useTheme, type ThemePreference } from "../context/ThemeProvider";
import { useAudio } from "../context/AudioProvider";

const LABELS: Record<ThemePreference, string> = {
  system: "System",
  light: "Light",
  dark: "Dark",
};

export function ThemeToggle({ className = "" }: { className?: string }) {
  const { preference, cyclePreference } = useTheme();
  const { playSfx } = useAudio();

  return (
    <button
      type="button"
      onClick={() => {
        cyclePreference();
        playSfx("menu_click");
      }}
      className={`pointer-events-auto bg-surface border border-line text-muted text-xs font-mono uppercase px-3 py-1.5 hover:border-ps-blue hover:text-ps-blue transition-colors ${className}`}
      aria-label={`Theme: ${LABELS[preference]}. Click to cycle.`}
      title="Cycle theme: System → Light → Dark"
    >
      Theme: {LABELS[preference]}
    </button>
  );
}
