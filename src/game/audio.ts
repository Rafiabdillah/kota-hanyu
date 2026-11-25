let audioCtx: AudioContext | null = null;

export function getSharedAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!audioCtx) {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    audioCtx = new Ctor();
  }
  if (audioCtx.state === "suspended") {
    void audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

const speechDuckListeners = new Set<(active: boolean) => void>();
let speechDuckActive = false;

export function subscribeSpeechDuck(cb: (active: boolean) => void): () => void {
  speechDuckListeners.add(cb);
  cb(speechDuckActive);
  return () => {
    speechDuckListeners.delete(cb);
  };
}

function notifySpeechDuck(active: boolean): void {
  if (speechDuckActive === active) return;
  speechDuckActive = active;
  for (const cb of speechDuckListeners) {
    cb(active);
  }
}

export function playSfx(
  kind: "click" | "correct" | "wrong" | "victory" | "step" | "orb" | "achievement" | "graduation",
  muted = false,
): void {
  if (muted) return;
  const ctx = getSharedAudioContext();
  if (!ctx) return;

  try {
    const now = ctx.currentTime;
    const playTone = (
      freq: number,
      startOffset: number,
      duration: number,
      type: OscillatorType = "triangle",
      gainPeak = 0.08,
    ) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const jitter = 1 + (Math.random() - 0.5) * 0.06;
      osc.type = type;
      osc.frequency.setValueAtTime(freq * jitter, now + startOffset);
      gain.gain.setValueAtTime(0.0001, now + startOffset);
      gain.gain.exponentialRampToValueAtTime(gainPeak, now + startOffset + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + startOffset + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + startOffset);
      osc.stop(now + startOffset + duration + 0.02);
    };

    if (kind === "click") {
      playTone(540, 0, 0.07, "sine", 0.04);
    } else if (kind === "step") {
      playTone(180, 0, 0.05, "sine", 0.025);
    } else if (kind === "orb") {
      playTone(659.25, 0, 0.11, "sine", 0.075);
      playTone(880, 0.07, 0.14, "triangle", 0.08);
      playTone(1174.66, 0.14, 0.22, "sine", 0.07);
    } else if (kind === "achievement") {
      playTone(587.33, 0, 0.12, "triangle", 0.075);
      playTone(739.99, 0.09, 0.12, "triangle", 0.08);
      playTone(880, 0.18, 0.14, "triangle", 0.085);
      playTone(1174.66, 0.28, 0.3, "triangle", 0.09);
    } else if (kind === "correct") {
      playTone(523.25, 0, 0.12, "triangle", 0.07);
      playTone(659.25, 0.08, 0.16, "triangle", 0.08);
    } else if (kind === "wrong") {
      playTone(230, 0, 0.14, "sawtooth", 0.045);
      playTone(185, 0.09, 0.18, "sawtooth", 0.045);
    } else if (kind === "victory") {
      playTone(523.25, 0, 0.14, "triangle", 0.08);
      playTone(659.25, 0.1, 0.14, "triangle", 0.08);
      playTone(783.99, 0.2, 0.18, "triangle", 0.09);
      playTone(1046.5, 0.32, 0.34, "triangle", 0.09);
    } else if (kind === "graduation") {
      // Celebratory Chinese pentatonic + major triad fanfare
      playTone(523.25, 0, 0.16, "triangle", 0.085);
      playTone(659.25, 0.11, 0.16, "triangle", 0.085);
      playTone(783.99, 0.22, 0.18, "triangle", 0.09);
      playTone(880.0, 0.33, 0.18, "triangle", 0.085);
      playTone(1046.5, 0.46, 0.48, "triangle", 0.1);
      playTone(523.25, 0.46, 0.48, "sine", 0.06);
      playTone(783.99, 0.46, 0.48, "sine", 0.06);
    }
  } catch {
    // ignore Web Audio autoplay restrictions
  }
}

let activeSpeakTimer: number | null = null;
let activeHtmlAudio: HTMLAudioElement | null = null;
let activeSpeakRequestId = 0;
const clientTtsAudioCache = new Map<string, string>();
const MAX_CLIENT_TTS_CACHE = 40;
let ttsCooldownUntil = 0;

export function stopSpeaking(): void {
  activeSpeakRequestId += 1;
  notifySpeechDuck(false);
  if (activeHtmlAudio) {
    try {
      activeHtmlAudio.pause();
      activeHtmlAudio.currentTime = 0;
    } catch {
      // ignore
    }
    activeHtmlAudio = null;
  }
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    try {
      window.speechSynthesis.cancel();
    } catch {
      // ignore
    }
  }
  if (activeSpeakTimer !== null && typeof window !== "undefined") {
    window.clearTimeout(activeSpeakTimer);
    activeSpeakTimer = null;
  }
}

function speakViaWebSpeech(
  text: string,
  requestId: number,
  options?: {
    rate?: number;
    onStatus?: (msg: string) => void;
    onStart?: () => void;
    onEnd?: () => void;
  },
): void {
  const durationEstimateMs = Math.min(3600, Math.max(900, text.length * 140));

  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    options?.onStatus?.("Browser tidak mendukung sintesis suara otomatis; baca transkrip Mandarin di layar.");
    options?.onStart?.();
    activeSpeakTimer = globalThis.setTimeout(() => {
      if (activeSpeakRequestId !== requestId) return;
      activeSpeakTimer = null;
      options?.onEnd?.();
    }, 900) as unknown as number;
    return;
  }

  try {
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = "zh-CN";
    const safeRate =
      typeof options?.rate === "number" && Number.isFinite(options.rate)
        ? Math.max(0.5, Math.min(1.5, options.rate))
        : 0.88;
    utter.rate = safeRate;
    const voices = window.speechSynthesis.getVoices();
    const zhVoice =
      voices.find((v) => v.lang.toLowerCase().includes("zh-cn")) ||
      voices.find((v) => v.lang.toLowerCase().startsWith("zh"));
    if (zhVoice) utter.voice = zhVoice;

    let ended = false;
    const startedAt = Date.now();
    const finishNow = () => {
      if (ended || activeSpeakRequestId !== requestId) return;
      ended = true;
      notifySpeechDuck(false);
      if (activeSpeakTimer !== null) {
        globalThis.clearTimeout(activeSpeakTimer);
        activeSpeakTimer = null;
      }
      options?.onEnd?.();
    };
    const handleFailureOrEnd = () => {
      const elapsed = Date.now() - startedAt;
      if (elapsed < 400) {
        if (activeSpeakTimer !== null) globalThis.clearTimeout(activeSpeakTimer);
        activeSpeakTimer = globalThis.setTimeout(finishNow, 1050) as unknown as number;
      } else {
        finishNow();
      }
    };

    utter.onstart = () => {
      notifySpeechDuck(true);
      options?.onStart?.();
    };
    utter.onend = finishNow;
    utter.onerror = handleFailureOrEnd;

    notifySpeechDuck(true);
    options?.onStart?.();
    window.speechSynthesis.speak(utter);

    activeSpeakTimer = globalThis.setTimeout(finishNow, durationEstimateMs) as unknown as number;

    options?.onStatus?.(
      zhVoice
        ? `Memutar suara ${zhVoice.name} (${utter.rate.toFixed(2)}x)...`
        : `Memutar pelafalan Mandarin zh-CN (${utter.rate.toFixed(2)}x)...`,
    );
  } catch {
    notifySpeechDuck(false);
    options?.onStatus?.("Gagal memutar suara otomatis.");
    options?.onEnd?.();
  }
}

export function speakMandarin(
  text: string,
  options?: {
    rate?: number;
    muted?: boolean;
    naturalTts?: boolean;
    onStatus?: (msg: string) => void;
    onStart?: () => void;
    onEnd?: () => void;
  },
): void {
  if (options?.muted) {
    options.onStatus?.("Audio sedang dibisukan (aktifkan suara di HUD kanan atas).");
    options.onEnd?.();
    return;
  }

  const clean = text.trim();
  if (!clean) {
    options?.onEnd?.();
    return;
  }

  stopSpeaking();
  const requestId = activeSpeakRequestId;
  const rate = options?.rate ?? 0.88;
  const useNatural = options?.naturalTts !== false;

  if (!useNatural || typeof window === "undefined" || clean.length > 240) {
    speakViaWebSpeech(clean, requestId, options);
    return;
  }

  const cacheKey = `${rate.toFixed(2)}::${clean}`;
  const playBase64Wav = (base64Audio: string) => {
    if (activeSpeakRequestId !== requestId) return;
    try {
      const audio = new Audio(`data:audio/wav;base64,${base64Audio}`);
      activeHtmlAudio = audio;
      notifySpeechDuck(true);
      options?.onStatus?.(`Memutar suara HD Lǎoshī Lín (${rate.toFixed(2)}x)...`);
      options?.onStart?.();

      const finish = () => {
        if (activeSpeakRequestId !== requestId) return;
        if (activeHtmlAudio === audio) activeHtmlAudio = null;
        notifySpeechDuck(false);
        options?.onEnd?.();
      };
      audio.onended = finish;
      audio.onerror = () => {
        if (activeSpeakRequestId === requestId) {
          speakViaWebSpeech(clean, requestId, options);
        }
      };
      void audio.play().catch(() => {
        if (activeSpeakRequestId === requestId) {
          speakViaWebSpeech(clean, requestId, options);
        }
      });
    } catch {
      speakViaWebSpeech(clean, requestId, options);
    }
  };

  const cached = clientTtsAudioCache.get(cacheKey);
  if (cached) {
    playBase64Wav(cached);
    return;
  }

  if (Date.now() < ttsCooldownUntil) {
    speakViaWebSpeech(clean, requestId, options);
    return;
  }

  // Trigger natural Gemini TTS with graceful instant fallback to Web Speech on error/timeout
  options?.onStatus?.("Menyiapkan suara HD Lǎoshī Lín...");
  options?.onStart?.();
  const controller = new AbortController();
  const abortTimer = window.setTimeout(() => controller.abort(), 3200);

  fetch("/api/tts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: clean, rate }),
    signal: controller.signal,
  })
    .then(async (resp) => {
      window.clearTimeout(abortTimer);
      if (!resp.ok) {
        if (resp.status === 429 || resp.status === 503) {
          ttsCooldownUntil = Date.now() + 120_000;
        }
        throw new Error(`HTTP ${resp.status}`);
      }
      const data = (await resp.json()) as { audioBase64?: string };
      if (!data.audioBase64) throw new Error("Empty audio");
      if (clientTtsAudioCache.size >= MAX_CLIENT_TTS_CACHE) {
        const firstKey = clientTtsAudioCache.keys().next().value;
        if (firstKey !== undefined) clientTtsAudioCache.delete(firstKey);
      }
      clientTtsAudioCache.set(cacheKey, data.audioBase64);
      playBase64Wav(data.audioBase64);
    })
    .catch(() => {
      window.clearTimeout(abortTimer);
      if (activeSpeakRequestId === requestId) {
        speakViaWebSpeech(clean, requestId, options);
      }
    });
}
