import { loadAudioVolumes, saveAudioVolumes } from "./audioSettings";
import { SFX_PRESETS, HEAVY_DAMAGE_THRESHOLD } from "./sfxPresets";
import type {
  AudioTag,
  AudioVolumes,
  PlaySfxOptions,
  SfxId,
  SpatialEmitter,
} from "./types";

const MAX_COMBAT_SOUNDS = 3;

export type ToneParams = {
  freq: number;
  type: OscillatorType;
  duration: number;
  volume: number;
  at: number;
  impact?: boolean;
};

export type NoiseParams = {
  duration: number;
  volume: number;
  at: number;
  filterFreq?: number;
};

export type SweepParams = {
  startFreq: number;
  endFreq: number;
  duration: number;
  volume: number;
  at: number;
  type?: OscillatorType;
};

const SPATIAL_GAIN: Record<SpatialEmitter, number> = {
  player: 1,
  center: 0.85,
  enemy: 0.62,
};

const SPATIAL_PAN: Record<SpatialEmitter, number> = {
  player: 0,
  center: 0,
  enemy: 0.08,
};

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private tagGains: Partial<Record<AudioTag, GainNode>> = {};
  private volumes: AudioVolumes = loadAudioVolumes();
  private unlocked = false;
  private combatPlaying = 0;
  private bgmGain: GainNode | null = null;
  private bgmOscillators: OscillatorNode[] = [];
  private bgmInterval: ReturnType<typeof setInterval> | null = null;
  private pinchMode = false;
  private pinchGain: GainNode | null = null;
  private normalBgmGain: GainNode | null = null;

  get isUnlocked(): boolean {
    return this.unlocked;
  }

  getVolumes(): AudioVolumes {
    return { ...this.volumes };
  }

  setVolumes(next: Partial<AudioVolumes>): void {
    this.volumes = { ...this.volumes, ...next };
    saveAudioVolumes(this.volumes);
    this.applyVolumeGains();
  }

  async unlock(): Promise<void> {
    const ctx = this.ensureContext();
    if (ctx.state === "suspended") await ctx.resume();
    this.unlocked = true;
  }

  playSfx(id: SfxId, options: PlaySfxOptions = {}): void {
    if (!this.unlocked) return;

    const preset = SFX_PRESETS[id];
    const tag = options.tag ?? preset.tag;
    if (tag === "tag_sfx_combat") {
      if (this.combatPlaying >= MAX_COMBAT_SOUNDS) return;
      this.combatPlaying += 1;
      const duration =
        id === "heavy_hit" ? 500 : id === "damage_drain" ? 700 : id === "evolve" ? 800 : 400;
      setTimeout(() => {
        this.combatPlaying = Math.max(0, this.combatPlaying - 1);
      }, duration);
    }

    const spatial = options.spatial ?? "center";
    const spatialMul = SPATIAL_GAIN[spatial] * (options.volume ?? 1);
    const ctx = this.ensureContext();
    const at = ctx.currentTime;

    const chain = this.createSpatialChain(spatial, tag, at);
    const prevConnect = this.connectToTag;
    this.connectToTag = (node: AudioNode) => {
      node.connect(chain.input);
    };

    preset.play(this, at, spatialMul);

    this.connectToTag = prevConnect;
    chain.panner.pan.setValueAtTime(SPATIAL_PAN[spatial], at);
  }

  playCombatHit(
    damage: number,
    spatial: SpatialEmitter,
    cardType?: string
  ): void {
    const isHeavy = damage >= HEAVY_DAMAGE_THRESHOLD;
    const sfx: SfxId =
      cardType === "Fire" && !isHeavy ? "fire_hit" : isHeavy ? "heavy_hit" : "hit";

    this.playSfx(sfx, { tag: "tag_sfx_combat", spatial });

    if (isHeavy) {
      setTimeout(() => {
        this.playSfx("damage_drain", { tag: "tag_sfx_combat", spatial });
      }, 280);
    }
  }

  startBgm(): void {
    if (!this.unlocked || this.bgmInterval) return;
    const ctx = this.ensureContext();
    const at = ctx.currentTime;

    this.bgmGain = ctx.createGain();
    this.normalBgmGain = ctx.createGain();
    this.pinchGain = ctx.createGain();
    this.normalBgmGain.gain.value = 1;
    this.pinchGain.gain.value = 0;

    this.normalBgmGain.connect(this.bgmGain);
    this.pinchGain.connect(this.bgmGain);
    this.bgmGain.connect(this.getTagGain("tag_bgm"));
    this.applyBgmMasterGain();

    const baseFreqs = [55, 82.5, 110];
    const pinchFreqs = [65, 98, 130];

    const playPulse = (freqs: number[], dest: GainNode, speed: number) => {
      let step = 0;
      return setInterval(() => {
        if (!this.ctx || !this.unlocked) return;
        const t = this.ctx.currentTime;
        const freq = freqs[step % freqs.length];
        step += 1;

        const osc = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        osc.type = "sawtooth";
        osc.frequency.value = freq;
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.04 / speed, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.15 / speed);
        osc.connect(g);
        g.connect(dest);
        osc.start(t);
        osc.stop(t + 0.2 / speed);
      }, 180 / speed);
    };

    this.bgmInterval = playPulse(baseFreqs, this.normalBgmGain, 1);
    const pinchInterval = playPulse(pinchFreqs, this.pinchGain, 1.35);
    this.bgmOscillators = []; // intervals tracked separately

    this._pinchInterval = pinchInterval;
  }

  private _pinchInterval: ReturnType<typeof setInterval> | null = null;

  stopBgm(): void {
    if (this.bgmInterval) clearInterval(this.bgmInterval);
    if (this._pinchInterval) clearInterval(this._pinchInterval);
    this.bgmInterval = null;
    this._pinchInterval = null;
    this.bgmOscillators.forEach((o) => {
      try {
        o.stop();
      } catch {
        /* already stopped */
      }
    });
    this.bgmOscillators = [];
    this.bgmGain?.disconnect();
    this.bgmGain = null;
  }

  setPinchMode(enabled: boolean): void {
    if (this.pinchMode === enabled) return;
    this.pinchMode = enabled;
    const ctx = this.ctx;
    if (!ctx || !this.normalBgmGain || !this.pinchGain) return;
    const t = ctx.currentTime;
    if (enabled) {
      this.normalBgmGain.gain.linearRampToValueAtTime(0.25, t + 1.2);
      this.pinchGain.gain.linearRampToValueAtTime(1, t + 1.2);
    } else {
      this.normalBgmGain.gain.linearRampToValueAtTime(1, t + 1.2);
      this.pinchGain.gain.linearRampToValueAtTime(0, t + 1.2);
    }
  }

  /** @internal Used by sfx presets */
  connectToTag: (node: AudioNode) => void = () => {};

  playTone(params: ToneParams): void {
    const ctx = this.ensureContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = params.type;
    osc.frequency.setValueAtTime(params.freq, params.at);
    if (params.impact) {
      osc.frequency.exponentialRampToValueAtTime(10, params.at + params.duration);
    }
    gain.gain.setValueAtTime(params.volume, params.at);
    gain.gain.exponentialRampToValueAtTime(0.001, params.at + params.duration);
    osc.connect(gain);
    this.connectToTag(gain);
    osc.start(params.at);
    osc.stop(params.at + params.duration + 0.05);
  }

  playNoise(params: NoiseParams): void {
    const ctx = this.ensureContext();
    const bufferSize = Math.floor(ctx.sampleRate * params.duration);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(params.volume, params.at);
    gain.gain.exponentialRampToValueAtTime(0.001, params.at + params.duration);

    let node: AudioNode = source;
    if (params.filterFreq) {
      const filter = ctx.createBiquadFilter();
      filter.type = "highpass";
      filter.frequency.value = params.filterFreq;
      source.connect(filter);
      node = filter;
    }
    node.connect(gain);
    this.connectToTag(gain);
    source.start(params.at);
    source.stop(params.at + params.duration + 0.05);
  }

  playSweep(params: SweepParams): void {
    const ctx = this.ensureContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = params.type ?? "sine";
    osc.frequency.setValueAtTime(params.startFreq, params.at);
    osc.frequency.exponentialRampToValueAtTime(
      Math.max(params.endFreq, 1),
      params.at + params.duration
    );
    gain.gain.setValueAtTime(params.volume, params.at);
    gain.gain.exponentialRampToValueAtTime(0.001, params.at + params.duration);
    osc.connect(gain);
    this.connectToTag(gain);
    osc.start(params.at);
    osc.stop(params.at + params.duration + 0.05);
  }

  private ensureContext(): AudioContext {
    if (!this.ctx) {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.connect(this.ctx.destination);
      (["tag_bgm", "tag_sfx_ui", "tag_sfx_combat", "tag_voice"] as AudioTag[]).forEach((tag) => {
        const g = this.ctx!.createGain();
        g.connect(this.masterGain!);
        this.tagGains[tag] = g;
      });
      this.applyVolumeGains();
    }
    return this.ctx;
  }

  private getTagGain(tag: AudioTag): GainNode {
    this.ensureContext();
    return this.tagGains[tag]!;
  }

  private applyVolumeGains(): void {
    if (!this.masterGain) return;
    this.masterGain.gain.value = this.volumes.master;
    (Object.keys(this.tagGains) as AudioTag[]).forEach((tag) => {
      this.tagGains[tag]!.gain.value = this.volumes[tag];
    });
    this.applyBgmMasterGain();
  }

  private applyBgmMasterGain(): void {
    if (this.bgmGain) this.bgmGain.gain.value = 1;
  }

  private createSpatialChain(
    _spatial: SpatialEmitter,
    tag: AudioTag,
    _at: number
  ): { input: GainNode; panner: StereoPannerNode } {
    const ctx = this.ensureContext();
    const input = ctx.createGain();
    input.gain.value = 1;
    const panner = ctx.createStereoPanner();
    input.connect(panner);
    panner.connect(this.getTagGain(tag));
    this.connectToTag = (node: AudioNode) => node.connect(input);
    return { input, panner };
  }
}

export const audioEngine = new AudioEngine();
