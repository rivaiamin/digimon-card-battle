export type AudioTag = "tag_bgm" | "tag_sfx_ui" | "tag_sfx_combat" | "tag_voice";

export type SfxId =
  | "tick"
  | "thud"
  | "error"
  | "chime"
  | "hit"
  | "heavy_hit"
  | "damage_drain"
  | "counter"
  | "evolve"
  | "menu_click"
  | "phase_alert"
  | "reward_tick"
  | "reward_clang"
  | "fire_hit";

export type SpatialEmitter = "player" | "enemy" | "center";

export interface PlaySfxOptions {
  tag?: AudioTag;
  spatial?: SpatialEmitter;
  volume?: number;
}

export interface AudioVolumes {
  master: number;
  tag_bgm: number;
  tag_sfx_ui: number;
  tag_sfx_combat: number;
  tag_voice: number;
}

export const DEFAULT_VOLUMES: AudioVolumes = {
  master: 0.85,
  tag_bgm: 0.45,
  tag_sfx_ui: 0.9,
  tag_sfx_combat: 1,
  tag_voice: 0.8,
};

export const STORAGE_KEY = "digimon-battle-audio-v1";
