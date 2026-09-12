/**
 * Ambient audio engine — a whisper-quiet, fully synthesized soundscape
 * (Web Audio, zero assets). Off by default; enabled by explicit user
 * gesture. Each route "tunes" the drone: different chord, filter colour,
 * level. Navigation plays a soft blip.
 *
 * Graph per voice:  Osc(sine) -> gain -> \
 *                                          filter(lowpass) -> master -> out
 * LFOs: slow filter-sweep, gain "breathing", per-voice detune shimmer.
 */

type SceneId = "home" | "live" | "watch" | "studio" | "auth";

interface Scene {
  /** fundamental frequencies of the three voices (Hz) */
  chord: [number, number, number];
  /** lowpass cutoff (Hz) */
  cutoff: number;
  /** master level (linear gain) */
  level: number;
}

const SCENES: Record<SceneId, Scene> = {
  // A2 + E3 + C#4 — warm, open, "the stage is dark"
  home: { chord: [110.0, 164.81, 277.18], cutoff: 640, level: 0.05 },
  // F3 + A3 + C4 — brighter, "the floor is live"
  live: { chord: [174.61, 220.0, 261.63], cutoff: 920, level: 0.045 },
  // A3 + E4 + B4 — sparse, high, "in the room"
  watch: { chord: [220.0, 329.63, 493.88], cutoff: 1150, level: 0.03 },
  // D3 + A3 + F#4 — steady, "control room"
  studio: { chord: [146.83, 220.0, 369.99], cutoff: 780, level: 0.045 },
  // E3 + B3 + G#4 — dreamy, "before you arrive"
  auth: { chord: [164.81, 246.94, 415.3], cutoff: 1000, level: 0.035 },
};

export function sceneForPath(pathname: string): SceneId {
  if (pathname === "/") return "home";
  if (pathname.startsWith("/stream")) return pathname === "/stream" ? "live" : "studio";
  if (pathname.startsWith("/watch")) return "watch";
  if (pathname.startsWith("/dashboard")) return "studio";
  if (
    pathname.startsWith("/login") ||
    pathname.startsWith("/signup") ||
    pathname.startsWith("/forgot") ||
    pathname.startsWith("/reset")
  )
    return "auth";
  return "home";
}

const KEY = "imlive:sound";

class AmbientAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private filter: BiquadFilterNode | null = null;
  private voices: { osc: OscillatorNode; gain: GainNode; lfo: OscillatorNode }[] = [];
  private filterLfo: OscillatorNode | null = null;
  private breathLfo: OscillatorNode | null = null;
  private _enabled = false;
  private scene: SceneId = "home";
  private readonly voiceLevels = [0.5, 0.3, 0.18];

  get enabled() {
    return this._enabled;
  }

  static isEnabled(): boolean {
    try {
      return localStorage.getItem(KEY) === "on";
    } catch {
      return false;
    }
  }

  /** Must be called from a user gesture. */
  async setEnabled(on: boolean) {
    this._enabled = on;
    try {
      localStorage.setItem(KEY, on ? "on" : "off");
    } catch {
      /* ignore */
    }

    if (on) {
      await this.start();
    } else {
      this.stopAll();
    }
  }

  private async start() {
    if (!this.ctx) {
      const Ctor = window.AudioContext || (window as any).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.buildGraph();
    }
    if (this.ctx.state === "suspended") {
      await this.ctx.resume().catch(() => {});
    }
    this.applyScene(this.scene, true);
  }

  private buildGraph() {
    const ctx = this.ctx!;
    this.master = ctx.createGain();
    this.master.gain.value = 0;

    this.filter = ctx.createBiquadFilter();
    this.filter.type = "lowpass";
    this.filter.frequency.value = 700;
    this.filter.Q.value = 0.7;

    this.filter.connect(this.master);
    this.master.connect(ctx.destination);

    // voices
    for (let i = 0; i < 3; i++) {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = 110;

      const gain = ctx.createGain();
      gain.gain.value = this.voiceLevels[i];

      // slow detune shimmer
      const lfo = ctx.createOscillator();
      lfo.type = "sine";
      lfo.frequency.value = 0.05 + i * 0.037;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 2.5 + i * 1.5; // cents-ish via detune param
      lfo.connect(lfoGain);
      lfoGain.connect(osc.detune);

      osc.connect(gain);
      gain.connect(this.filter);
      osc.start();
      lfo.start();

      this.voices.push({ osc, gain, lfo });
    }

    // filter sweep
    this.filterLfo = ctx.createOscillator();
    this.filterLfo.type = "sine";
    this.filterLfo.frequency.value = 0.043;
    const sweepGain = ctx.createGain();
    sweepGain.gain.value = 140;
    this.filterLfo.connect(sweepGain);
    sweepGain.connect(this.filter.frequency);
    this.filterLfo.start();

    // breathing
    this.breathLfo = ctx.createOscillator();
    this.breathLfo.type = "sine";
    this.breathLfo.frequency.value = 0.021;
    const breathGain = ctx.createGain();
    breathGain.gain.value = 0.008;
    this.breathLfo.connect(breathGain);
    breathGain.connect(this.master.gain);
    this.breathLfo.start();
  }

  private stopAll() {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setTargetAtTime(0, t, 0.25);
    const ctx = this.ctx;
    window.setTimeout(() => {
      if (ctx.state !== "suspended") void ctx.suspend().catch(() => {});
    }, 700);
  }

  /** Crossfade to a route scene. */
  setScene(id: SceneId) {
    this.scene = id;
    if (!this._enabled || !this.ctx || !this.master) return;
    this.applyScene(id, false);
  }

  private applyScene(id: SceneId, immediate: boolean) {
    const ctx = this.ctx!;
    const scene = SCENES[id];
    const t = ctx.currentTime;
    const tc = immediate ? 0.02 : 1.4;

    scene.chord.forEach((f, i) => {
      const v = this.voices[i];
      if (!v) return;
      v.osc.frequency.cancelScheduledValues(t);
      v.osc.frequency.setTargetAtTime(f, t, tc);
    });

    this.filter!.frequency.cancelScheduledValues(t);
    this.filter!.frequency.setTargetAtTime(scene.cutoff, t, tc);

    this.master!.gain.cancelScheduledValues(t);
    this.master!.gain.setTargetAtTime(scene.level, t, tc);
  }

  /** Suspend when the tab is hidden, resume when visible. */
  handleVisibility() {
    if (!this.ctx) return;
    if (document.hidden) {
      if (this.ctx.state === "running") void this.ctx.suspend().catch(() => {});
    } else if (this._enabled && this.ctx.state === "suspended") {
      void this.ctx.resume().catch(() => {});
    }
  }

  /** Short soft UI cue. */
  blip(kind: "nav" | "success" | "toggle" = "nav") {
    if (!this._enabled || !this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;

    const play = (freq: number, start: number, dur: number, gain: number, type: OscillatorType = "triangle") => {
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t + start);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t + start);
      g.gain.exponentialRampToValueAtTime(gain, t + start + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + start + dur);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start(t + start);
      osc.stop(t + start + dur + 0.05);
    };

    if (kind === "nav") {
      play(520, 0, 0.16, 0.028);
      play(780, 0.03, 0.14, 0.02, "sine");
    } else if (kind === "success") {
      play(659.25, 0, 0.22, 0.035, "sine");
      play(987.77, 0.1, 0.3, 0.03, "sine");
    } else {
      play(440, 0, 0.12, 0.03, "sine");
    }
  }
}

export const ambientAudio = new AmbientAudio();
