import { DEFAULT_VOLUMES, STORAGE_KEY, type AudioVolumes } from "./types";

export function loadAudioVolumes(): AudioVolumes {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_VOLUMES };
    return { ...DEFAULT_VOLUMES, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_VOLUMES };
  }
}

export function saveAudioVolumes(volumes: AudioVolumes): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(volumes));
}
