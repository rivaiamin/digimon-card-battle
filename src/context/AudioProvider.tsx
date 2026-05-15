import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { audioEngine } from "../lib/audio";
import type { AudioVolumes, PlaySfxOptions, SfxId, SpatialEmitter } from "../lib/audio";

type AudioContextValue = {
  unlocked: boolean;
  unlock: () => Promise<void>;
  playSfx: (id: SfxId, options?: PlaySfxOptions) => void;
  playUiHover: () => void;
  playCombatHit: (damage: number, spatial: SpatialEmitter, cardType?: string) => void;
  volumes: AudioVolumes;
  setVolumes: (next: Partial<AudioVolumes>) => void;
  startBgm: () => void;
  stopBgm: () => void;
  setPinchMode: (enabled: boolean) => void;
};

const AudioCtx = createContext<AudioContextValue | null>(null);

const HOVER_DEBOUNCE_MS = 140;

export function AudioProvider({ children }: { children: React.ReactNode }) {
  const [unlocked, setUnlocked] = useState(audioEngine.isUnlocked);
  const [volumes, setVolumesState] = useState(audioEngine.getVolumes());
  const lastHoverRef = useRef(0);

  const unlock = useCallback(async () => {
    await audioEngine.unlock();
    setUnlocked(true);
    setVolumesState(audioEngine.getVolumes());
  }, []);

  useEffect(() => {
    const onGesture = () => {
      void unlock();
    };
    window.addEventListener("pointerdown", onGesture, { once: true });
    window.addEventListener("keydown", onGesture, { once: true });
    return () => {
      window.removeEventListener("pointerdown", onGesture);
      window.removeEventListener("keydown", onGesture);
    };
  }, [unlock]);

  const playSfx = useCallback((id: SfxId, options?: PlaySfxOptions) => {
    audioEngine.playSfx(id, options);
  }, []);

  const playUiHover = useCallback(() => {
    const now = Date.now();
    if (now - lastHoverRef.current < HOVER_DEBOUNCE_MS) return;
    lastHoverRef.current = now;
    audioEngine.playSfx("tick", { tag: "tag_sfx_ui" });
  }, []);

  const playCombatHit = useCallback(
    (damage: number, spatial: SpatialEmitter, cardType?: string) => {
      audioEngine.playCombatHit(damage, spatial, cardType);
    },
    []
  );

  const setVolumes = useCallback((next: Partial<AudioVolumes>) => {
    audioEngine.setVolumes(next);
    setVolumesState(audioEngine.getVolumes());
  }, []);

  const value = useMemo<AudioContextValue>(
    () => ({
      unlocked,
      unlock,
      playSfx,
      playUiHover,
      playCombatHit,
      volumes,
      setVolumes,
      startBgm: () => audioEngine.startBgm(),
      stopBgm: () => audioEngine.stopBgm(),
      setPinchMode: (enabled) => audioEngine.setPinchMode(enabled),
    }),
    [unlocked, unlock, playSfx, playUiHover, playCombatHit, volumes, setVolumes]
  );

  return <AudioCtx.Provider value={value}>{children}</AudioCtx.Provider>;
}

export function useAudio(): AudioContextValue {
  const ctx = useContext(AudioCtx);
  if (!ctx) throw new Error("useAudio must be used within AudioProvider");
  return ctx;
}
