import { getSharedAudioContext, subscribeSpeechDuck } from "./audio";

export type BgmMood = "title" | "campus" | "study" | "graduation";

// D Major Pentatonic frequencies (Hz): D, E, F#, A, B across octaves 3..6
export const PENTATONIC_HZ = {
  D3: 146.83,
  E3: 164.81,
  G3: 196.0,
  A3: 220.0,
  B3: 246.94,
  D4: 293.66,
  E4: 329.63,
  Fs4: 369.99,
  A4: 440.0,
  B4: 493.88,
  D5: 587.33,
  E5: 659.25,
  Fs5: 739.99,
  A5: 880.0,
  B5: 987.77,
  D6: 1174.66,
} as const;

export interface BgmScore {
  mood: BgmMood;
  bpm: number;
  baseGain: number;
  guzhengSteps: (number | null)[];
  diziSteps: ({ freq: number; beats: number } | null)[];
  padRoots: ({ root: number; fifth: number } | null)[];
  chimeSteps: (number | null)[];
}

export interface BgmSyncInput {
  enabled: boolean;
  muted: boolean;
  gameState: "title" | "playing" | "paused" | "gameover";
  graduationMode: boolean;
  studyOpen: boolean;
  voiceLabOpen: boolean;
}

export function resolveBgmMood(input: BgmSyncInput): {
  mood: BgmMood;
  shouldPlay: boolean;
  targetGain: number;
} {
  const mood: BgmMood = input.graduationMode
    ? "graduation"
    : input.gameState === "title"
      ? "title"
      : input.studyOpen
        ? "study"
        : "campus";

  // Pause BGM when muted, explicitly disabled, paused, or using Live Voice Lab mic
  const shouldPlay =
    input.enabled &&
    !input.muted &&
    !input.voiceLabOpen &&
    input.gameState !== "paused";

  const targetGain = !shouldPlay
    ? 0
    : mood === "study"
      ? 0.24
      : mood === "title"
        ? 0.34
        : mood === "graduation"
          ? 0.44
          : 0.38;

  return { mood, shouldPlay, targetGain };
}

const H = PENTATONIC_HZ;

const SCORES: Record<BgmMood, BgmScore> = {
  // Serene Academy Gate (74 BPM, 16-step phrase)
  title: {
    mood: "title",
    bpm: 74,
    baseGain: 0.34,
    guzhengSteps: [
      H.D4, H.A4, H.D5, null,
      H.E5, null, H.Fs5, H.E5,
      H.B4, H.Fs4, H.D5, null,
      H.A4, H.E4, H.Fs4, null,
      H.G3, H.D4, H.B4, null,
      H.A4, H.D5, H.E5, null,
      H.Fs5, H.E5, H.D5, H.B4,
      H.A4, null, H.D4, null,
    ],
    diziSteps: [
      { freq: H.D5, beats: 3 }, null, null, null,
      null, null, null, null,
      { freq: H.B4, beats: 3 }, null, null, null,
      { freq: H.A4, beats: 3 }, null, null, null,
      { freq: H.D5, beats: 2.5 }, null, null, null,
      { freq: H.E5, beats: 2.5 }, null, null, null,
      { freq: H.Fs5, beats: 2.5 }, null, null, null,
      { freq: H.D5, beats: 3.5 }, null, null, null,
    ],
    padRoots: [
      { root: H.D3, fifth: H.A3 }, null, null, null, null, null, null, null,
      { root: H.B3, fifth: H.Fs4 }, null, null, null, null, null, null, null,
      { root: H.G3, fifth: H.D4 }, null, null, null, null, null, null, null,
      { root: H.A3, fifth: H.E4 }, null, null, null, null, null, null, null,
    ],
    chimeSteps: [
      H.D6, null, null, null, null, null, null, null,
      null, null, null, null, null, null, null, null,
      H.A5, null, null, null, null, null, null, null,
      null, null, null, null, null, null, null, null,
    ],
  },

  // Flowing Campus Exploration (92 BPM, 32-step eighth-note loop)
  campus: {
    mood: "campus",
    bpm: 92,
    baseGain: 0.38,
    guzhengSteps: [
      H.D4, H.A4, H.D5, H.E5,
      H.Fs5, null, H.E5, H.D5,
      H.B4, H.Fs4, H.A4, H.B4,
      H.D5, null, H.A4, null,
      H.G3, H.D4, H.B4, H.D5,
      H.E5, null, H.Fs5, H.E5,
      H.D5, H.B4, H.A4, H.Fs4,
      H.E4, null, H.D4, null,
    ],
    diziSteps: [
      { freq: H.Fs5, beats: 2.5 }, null, null, null,
      { freq: H.A5, beats: 2.5 }, null, null, null,
      { freq: H.Fs5, beats: 2 }, null, null, null,
      { freq: H.E5, beats: 2.5 }, null, null, null,
      { freq: H.D5, beats: 2.5 }, null, null, null,
      { freq: H.B4, beats: 2 }, null, null, null,
      { freq: H.A4, beats: 2.5 }, null, null, null,
      { freq: H.D5, beats: 3 }, null, null, null,
    ],
    padRoots: [
      { root: H.D3, fifth: H.A3 }, null, null, null, null, null, null, null,
      { root: H.B3, fifth: H.Fs4 }, null, null, null, null, null, null, null,
      { root: H.G3, fifth: H.D4 }, null, null, null, null, null, null, null,
      { root: H.A3, fifth: H.E4 }, null, null, null, null, null, null, null,
    ],
    chimeSteps: [
      H.A5, null, null, null, null, null, null, null,
      null, null, null, null, null, null, null, null,
      H.D6, null, null, null, null, null, null, null,
      null, null, null, null, null, null, null, null,
    ],
  },

  // Gentle Study & Quiz Focus (70 BPM, warm non-intrusive plucked ostinato)
  study: {
    mood: "study",
    bpm: 70,
    baseGain: 0.24,
    guzhengSteps: [
      H.D4, null, H.A4, null,
      H.E4, null, H.Fs4, null,
      H.B3, null, H.Fs4, null,
      H.A4, null, H.E4, null,
      H.G3, null, H.D4, null,
      H.B4, null, H.A4, null,
      H.E4, null, H.Fs4, null,
      H.A4, null, H.D4, null,
    ],
    diziSteps: [
      null, null, null, null,
      null, null, null, null,
      { freq: H.D5, beats: 3 }, null, null, null,
      null, null, null, null,
      null, null, null, null,
      { freq: H.A4, beats: 3 }, null, null, null,
      null, null, null, null,
      null, null, null, null,
    ],
    padRoots: [
      { root: H.D3, fifth: H.A3 }, null, null, null, null, null, null, null,
      { root: H.B3, fifth: H.Fs4 }, null, null, null, null, null, null, null,
      { root: H.G3, fifth: H.D4 }, null, null, null, null, null, null, null,
      { root: H.A3, fifth: H.E4 }, null, null, null, null, null, null, null,
    ],
    chimeSteps: Array.from({ length: 32 }, () => null),
  },

  // Celebratory Graduation Ceremony (102 BPM, bright triumphant pentatonic march)
  graduation: {
    mood: "graduation",
    bpm: 102,
    baseGain: 0.44,
    guzhengSteps: [
      H.D4, H.A4, H.D5, H.Fs5,
      H.A5, H.Fs5, H.D5, H.A4,
      H.G3, H.D4, H.B4, H.D5,
      H.G3, H.B4, H.D5, H.E5,
      H.A3, H.E4, H.A4, H.E5,
      H.Fs5, H.E5, H.D5, H.B4,
      H.D5, H.Fs5, H.A5, H.Fs5,
      H.D5, H.A4, H.D5, null,
    ],
    diziSteps: [
      { freq: H.D5, beats: 2 }, null, null, null,
      { freq: H.Fs5, beats: 1.8 }, null, { freq: H.A5, beats: 1.8 }, null,
      { freq: H.B5, beats: 2.2 }, null, null, null,
      { freq: H.A5, beats: 2 }, null, null, null,
      { freq: H.E5, beats: 1.8 }, null, { freq: H.Fs5, beats: 1.8 }, null,
      { freq: H.A5, beats: 2 }, null, null, null,
      { freq: H.D6, beats: 2.5 }, null, null, null,
      { freq: H.A5, beats: 2.5 }, null, null, null,
    ],
    padRoots: [
      { root: H.D3, fifth: H.A3 }, null, null, null, null, null, null, null,
      { root: H.G3, fifth: H.D4 }, null, null, null, null, null, null, null,
      { root: H.A3, fifth: H.E4 }, null, null, null, null, null, null, null,
      { root: H.D3, fifth: H.A3 }, null, null, null, null, null, null, null,
    ],
    chimeSteps: [
      H.D6, null, null, null,
      H.A5, null, null, null,
      H.D6, null, null, null,
      null, null, null, null,
      H.A5, null, null, null,
      null, null, null, null,
      H.D6, null, null, null,
      H.A5, null, null, null,
    ],
  },
};

export function getBgmSceneScore(mood: BgmMood): BgmScore {
  return SCORES[mood];
}

class PentatonicBgmController {
  private masterGain: GainNode | null = null;
  private schedulerTimer: number | null = null;
  private currentMood: BgmMood = "title";
  private shouldPlay = false;
  private targetGain = 0;
  private speechDucked = false;
  private stepIndex = 0;
  private nextStepTime = 0;
  private unlocked = false;

  constructor() {
    if (typeof window !== "undefined") {
      subscribeSpeechDuck((active) => {
        this.speechDucked = active;
        this.applyMasterGain();
      });
    }
  }

  private ensureMasterGain(ctx: AudioContext): GainNode {
    if (!this.masterGain || this.masterGain.context !== ctx) {
      this.masterGain = ctx.createGain();
      this.masterGain.gain.setValueAtTime(0.0001, ctx.currentTime);
      this.masterGain.connect(ctx.destination);
    }
    return this.masterGain;
  }

  private applyMasterGain(): void {
    if (!this.unlocked) return;
    const ctx = getSharedAudioContext();
    if (!ctx || !this.masterGain) return;
    const now = ctx.currentTime;
    const effective = this.shouldPlay
      ? Math.max(0.0001, this.targetGain * (this.speechDucked ? 0.22 : 1))
      : 0.0001;
    this.masterGain.gain.cancelScheduledValues(now);
    this.masterGain.gain.setTargetAtTime(effective, now, 0.14);
  }

  private playGuzheng(ctx: AudioContext, dest: AudioNode, freq: number, when: number, gainPeak = 0.12): void {
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const amp = ctx.createGain();

    osc1.type = "triangle";
    osc1.frequency.setValueAtTime(freq, when);
    osc2.type = "sine";
    osc2.frequency.setValueAtTime(freq * 2.002, when);

    filter.type = "lowpass";
    filter.Q.value = 1.8;
    filter.frequency.setValueAtTime(Math.min(3600, freq * 5.2), when);
    filter.frequency.exponentialRampToValueAtTime(Math.max(320, freq * 1.3), when + 0.55);

    amp.gain.setValueAtTime(0.0001, when);
    amp.gain.linearRampToValueAtTime(gainPeak, when + 0.012);
    amp.gain.exponentialRampToValueAtTime(0.0001, when + 0.85);

    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(amp);
    amp.connect(dest);

    osc1.start(when);
    osc2.start(when);
    osc1.stop(when + 0.9);
    osc2.stop(when + 0.9);
  }

  private playDizi(ctx: AudioContext, dest: AudioNode, freq: number, when: number, durationSec: number): void {
    const oscMain = ctx.createOscillator();
    const oscHarm = ctx.createOscillator();
    const vibrato = ctx.createOscillator();
    const vibGain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    const amp = ctx.createGain();

    oscMain.type = "sine";
    oscMain.frequency.setValueAtTime(freq, when);

    oscHarm.type = "sine";
    oscHarm.frequency.setValueAtTime(freq * 2, when);

    const harmTrim = ctx.createGain();
    harmTrim.gain.value = 0.16;

    vibrato.type = "sine";
    vibrato.frequency.value = 5.2;
    vibGain.gain.setValueAtTime(0, when);
    vibGain.gain.linearRampToValueAtTime(freq * 0.008, when + 0.25);
    vibrato.connect(vibGain);
    vibGain.connect(oscMain.frequency);

    filter.type = "lowpass";
    filter.frequency.value = 2200;

    amp.gain.setValueAtTime(0.0001, when);
    amp.gain.linearRampToValueAtTime(0.068, when + 0.09);
    amp.gain.setValueAtTime(0.06, when + Math.max(0.12, durationSec - 0.16));
    amp.gain.exponentialRampToValueAtTime(0.0001, when + durationSec);

    oscMain.connect(filter);
    oscHarm.connect(harmTrim);
    harmTrim.connect(filter);
    filter.connect(amp);
    amp.connect(dest);

    oscMain.start(when);
    oscHarm.start(when);
    vibrato.start(when);
    oscMain.stop(when + durationSec + 0.04);
    oscHarm.stop(when + durationSec + 0.04);
    vibrato.stop(when + durationSec + 0.04);
  }

  private playSilkPad(ctx: AudioContext, dest: AudioNode, root: number, fifth: number, when: number, durationSec: number): void {
    const o1 = ctx.createOscillator();
    const o2 = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const amp = ctx.createGain();

    o1.type = "triangle";
    o1.frequency.setValueAtTime(root, when);
    o2.type = "sine";
    o2.frequency.setValueAtTime(fifth, when);

    filter.type = "lowpass";
    filter.frequency.value = 580;

    amp.gain.setValueAtTime(0.0001, when);
    amp.gain.linearRampToValueAtTime(0.075, when + 0.25);
    amp.gain.setValueAtTime(0.065, when + Math.max(0.3, durationSec - 0.35));
    amp.gain.exponentialRampToValueAtTime(0.0001, when + durationSec);

    o1.connect(filter);
    o2.connect(filter);
    filter.connect(amp);
    amp.connect(dest);

    o1.start(when);
    o2.start(when);
    o1.stop(when + durationSec + 0.05);
    o2.stop(when + durationSec + 0.05);
  }

  private playJadeChime(ctx: AudioContext, dest: AudioNode, freq: number, when: number): void {
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, when);

    amp.gain.setValueAtTime(0.0001, when);
    amp.gain.linearRampToValueAtTime(0.042, when + 0.01);
    amp.gain.exponentialRampToValueAtTime(0.0001, when + 1.45);

    osc.connect(amp);
    amp.connect(dest);
    osc.start(when);
    osc.stop(when + 1.5);
  }

  private scheduleTick = (): void => {
    if (!this.shouldPlay || !this.unlocked) return;
    const ctx = getSharedAudioContext();
    if (!ctx || ctx.state !== "running") return;

    const dest = this.ensureMasterGain(ctx);
    const score = getBgmSceneScore(this.currentMood);
    const stepSec = 60 / score.bpm / 2; // eighth-note step

    if (this.nextStepTime < ctx.currentTime - 0.2) {
      this.nextStepTime = ctx.currentTime + 0.05;
    }

    while (this.nextStepTime < ctx.currentTime + 0.3) {
      const idx = this.stepIndex % score.guzhengSteps.length;
      const gFreq = score.guzhengSteps[idx];
      if (gFreq) {
        this.playGuzheng(ctx, dest, gFreq, this.nextStepTime, this.currentMood === "graduation" ? 0.14 : 0.115);
      }

      const dNote = score.diziSteps[idx];
      if (dNote) {
        this.playDizi(ctx, dest, dNote.freq, this.nextStepTime, dNote.beats * stepSec * 2);
      }

      const pad = score.padRoots[idx];
      if (pad) {
        this.playSilkPad(ctx, dest, pad.root, pad.fifth, this.nextStepTime, stepSec * 8);
      }

      const chime = score.chimeSteps[idx];
      if (chime) {
        this.playJadeChime(ctx, dest, chime, this.nextStepTime);
      }

      this.nextStepTime += stepSec;
      this.stepIndex = (this.stepIndex + 1) % score.guzhengSteps.length;
    }
  };

  private ensureSchedulerRunning(): void {
    if (typeof window === "undefined") return;
    if (this.schedulerTimer === null) {
      this.schedulerTimer = window.setInterval(this.scheduleTick, 120);
    }
  }

  public unlock(): void {
    this.unlocked = true;
    const ctx = getSharedAudioContext();
    if (ctx) {
      this.ensureMasterGain(ctx);
      this.applyMasterGain();
    }
    if (this.shouldPlay) {
      this.ensureSchedulerRunning();
      this.scheduleTick();
    }
  }

  public sync(input: BgmSyncInput): void {
    const { mood, shouldPlay, targetGain } = resolveBgmMood(input);
    const moodChanged = mood !== this.currentMood;
    this.currentMood = mood;
    this.shouldPlay = shouldPlay;
    this.targetGain = targetGain;

    if (moodChanged) {
      this.stepIndex = 0;
    }

    if (this.unlocked) {
      const ctx = getSharedAudioContext();
      if (ctx) {
        this.ensureMasterGain(ctx);
        this.applyMasterGain();
      }
    }

    if (shouldPlay && this.unlocked) {
      this.ensureSchedulerRunning();
      this.scheduleTick();
    } else if (!shouldPlay && this.schedulerTimer !== null && typeof window !== "undefined") {
      window.clearInterval(this.schedulerTimer);
      this.schedulerTimer = null;
    }
  }
}

const bgmController = new PentatonicBgmController();

export function unlockBgmAudio(): void {
  bgmController.unlock();
}

export function syncBgmState(input: BgmSyncInput): void {
  bgmController.sync(input);
}
