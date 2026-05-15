import type { SfxId } from "./types";
import type { AudioEngine } from "./AudioEngine";

type ToneFn = (engine: AudioEngine, at: number, spatialGain: number) => void;

/** Procedural SFX — mirrors docs/vertical-slice.html with GDD extensions. */
export const SFX_PRESETS: Record<SfxId, { tag: "tag_sfx_ui" | "tag_sfx_combat" | "tag_voice"; play: ToneFn }> = {
  tick: {
    tag: "tag_sfx_ui",
    play: (e, at, g) => e.playTone({ freq: 600, type: "sine", duration: 0.05, volume: 0.1 * g, at }),
  },
  menu_click: {
    tag: "tag_sfx_ui",
    play: (e, at, g) => e.playTone({ freq: 720, type: "sine", duration: 0.06, volume: 0.12 * g, at }),
  },
  chime: {
    tag: "tag_sfx_ui",
    play: (e, at, g) => {
      e.playTone({ freq: 800, type: "sine", duration: 0.1, volume: 0.2 * g, at });
      e.playTone({ freq: 1200, type: "sine", duration: 0.2, volume: 0.2 * g, at: at + 0.1 });
    },
  },
  phase_alert: {
    tag: "tag_sfx_ui",
    play: (e, at, g) => {
      e.playTone({ freq: 440, type: "square", duration: 0.08, volume: 0.15 * g, at });
      e.playTone({ freq: 880, type: "sine", duration: 0.15, volume: 0.18 * g, at: at + 0.08 });
    },
  },
  error: {
    tag: "tag_sfx_ui",
    play: (e, at, g) => {
      e.playTone({ freq: 150, type: "sawtooth", duration: 0.1, volume: 0.3 * g, at });
      e.playTone({ freq: 100, type: "sawtooth", duration: 0.15, volume: 0.3 * g, at: at + 0.1 });
    },
  },
  thud: {
    tag: "tag_sfx_combat",
    play: (e, at, g) =>
      e.playTone({ freq: 100, type: "square", duration: 0.2, volume: 0.5 * g, at, impact: true }),
  },
  hit: {
    tag: "tag_sfx_combat",
    play: (e, at, g) =>
      e.playTone({ freq: 80, type: "sawtooth", duration: 0.3, volume: 0.8 * g, at, impact: true }),
  },
  heavy_hit: {
    tag: "tag_sfx_combat",
    play: (e, at, g) => {
      e.playTone({ freq: 55, type: "sawtooth", duration: 0.45, volume: 0.95 * g, at, impact: true });
      e.playTone({ freq: 40, type: "square", duration: 0.35, volume: 0.5 * g, at: at + 0.05, impact: true });
    },
  },
  fire_hit: {
    tag: "tag_sfx_combat",
    play: (e, at, g) => {
      e.playTone({ freq: 70, type: "sawtooth", duration: 0.35, volume: 0.85 * g, at, impact: true });
      e.playNoise({ duration: 0.2, volume: 0.25 * g, at: at + 0.05, filterFreq: 800 });
    },
  },
  damage_drain: {
    tag: "tag_sfx_combat",
    play: (e, at, g) => {
      e.playTone({ freq: 200, type: "sine", duration: 0.5, volume: 0.15 * g, at });
      e.playTone({ freq: 120, type: "triangle", duration: 0.6, volume: 0.2 * g, at: at + 0.1, impact: true });
    },
  },
  counter: {
    tag: "tag_sfx_combat",
    play: (e, at, g) => {
      e.playTone({ freq: 1500, type: "square", duration: 0.1, volume: 0.2 * g, at });
      e.playTone({ freq: 2000, type: "square", duration: 0.2, volume: 0.4 * g, at: at + 0.1 });
      e.playNoise({ duration: 0.15, volume: 0.2 * g, at: at + 0.05, filterFreq: 4000 });
    },
  },
  evolve: {
    tag: "tag_sfx_combat",
    play: (e, at, g) => {
      e.playSweep({ startFreq: 80, endFreq: 400, duration: 0.35, volume: 0.35 * g, at, type: "sawtooth" });
      e.playTone({ freq: 1200, type: "sine", duration: 0.25, volume: 0.35 * g, at: at + 0.3 });
      e.playTone({ freq: 1600, type: "sine", duration: 0.3, volume: 0.25 * g, at: at + 0.45 });
    },
  },
  reward_tick: {
    tag: "tag_sfx_ui",
    play: (e, at, g) =>
      e.playTone({ freq: 900 + Math.random() * 200, type: "square", duration: 0.04, volume: 0.12 * g, at }),
  },
  reward_clang: {
    tag: "tag_sfx_ui",
    play: (e, at, g) => {
      e.playTone({ freq: 320, type: "triangle", duration: 0.5, volume: 0.45 * g, at });
      e.playTone({ freq: 640, type: "sine", duration: 0.35, volume: 0.25 * g, at: at + 0.05 });
    },
  },
};

export const HEAVY_DAMAGE_THRESHOLD = 500;
