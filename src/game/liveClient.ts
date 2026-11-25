export interface LiveSessionCallbacks {
  onStatus: (status: "connecting" | "connected" | "error" | "closed", detail?: string) => void;
  onInputTranscript: (text: string) => void;
  onOutputTranscript: (text: string) => void;
  onTurnComplete?: () => void;
}

function float32ToPcmBase64(samples: Float32Array): string {
  const buffer = new ArrayBuffer(samples.length * 2);
  const view = new DataView(buffer);
  for (let i = 0; i < samples.length; i += 1) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function base64PcmToFloat32(base64: string): Float32Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  const view = new DataView(bytes.buffer);
  const count = Math.floor(bytes.byteLength / 2);
  const out = new Float32Array(count);
  for (let i = 0; i < count; i += 1) {
    out[i] = view.getInt16(i * 2, true) / 32768;
  }
  return out;
}

export class GeminiLiveVoiceClient {
  private ws: WebSocket | null = null;
  private inputCtx: AudioContext | null = null;
  private outputCtx: AudioContext | null = null;
  private outputAnalyser: AnalyserNode | null = null;
  private micStream: MediaStream | null = null;
  private processor: ScriptProcessorNode | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private nextStartTime = 0;
  private activeSources = new Set<AudioBufferSourceNode>();
  private micMuted = false;
  private micLevel = 0;
  private receivedError = false;
  private analyserBins = new Uint8Array(32);

  async connect(
    chapterId: string,
    callbacks: LiveSessionCallbacks,
    scenario?: string,
  ): Promise<void> {
    this.disconnect();
    this.receivedError = false;
    callbacks.onStatus("connecting", "Menghubungkan ke Lǎoshī Lín (gemini-3.8-live)...");

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const params = new URLSearchParams({ chapter: chapterId });
    if (scenario) params.set("scenario", scenario);
    const wsUrl = `${protocol}//${window.location.host}/live?${params.toString()}`;

    const ws = new WebSocket(wsUrl);
    this.ws = ws;

    this.outputCtx = new AudioContext({ sampleRate: 24000 });
    this.outputAnalyser = this.outputCtx.createAnalyser();
    this.outputAnalyser.fftSize = 64;
    this.outputAnalyser.connect(this.outputCtx.destination);
    this.nextStartTime = this.outputCtx.currentTime;

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string) as {
          type?: string;
          audio?: string;
          text?: string;
          message?: string;
        };

        if (msg.type === "ready") {
          callbacks.onStatus("connected", "Terhubung! Mulai bicara bahasa Mandarin atau ketik pesan.");
        } else if (msg.type === "inputTranscript" && msg.text) {
          callbacks.onInputTranscript(msg.text);
        } else if (msg.type === "outputTranscript" && msg.text) {
          callbacks.onOutputTranscript(msg.text);
        } else if (msg.type === "audio" && msg.audio) {
          this.schedulePcmPlayback(msg.audio);
        } else if (msg.type === "interrupted") {
          this.stopQueuedPlayback();
        } else if (msg.type === "turnComplete") {
          callbacks.onTurnComplete?.();
        } else if (msg.type === "error") {
          this.receivedError = true;
          callbacks.onStatus("error", msg.message || "Terjadi kesalahan pada sesi Gemini Live.");
        } else if (msg.type === "closed") {
          if (!this.receivedError) {
            callbacks.onStatus("closed", "Sesi Live ditutup.");
          }
        }
      } catch {
        // ignore parse errors
      }
    };

    ws.onerror = () => {
      this.receivedError = true;
      callbacks.onStatus("error", "Koneksi WebSocket Live gagal tersambung ke server.");
    };

    ws.onclose = (ev) => {
      if (this.receivedError) return;
      if (ev.code === 1008) {
        callbacks.onStatus(
          "error",
          "GEMINI_API_KEY belum dikonfigurasi di server. Tambahkan secret untuk percakapan suara Live.",
        );
      } else {
        callbacks.onStatus("closed", "Koneksi suara selesai.");
      }
    };
  }

  async startMicrophone(): Promise<void> {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("Perangkat/browser tidak mendukung akses mikrofon.");
    }
    this.micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.inputCtx = new AudioContext({ sampleRate: 16000 });
    this.sourceNode = this.inputCtx.createMediaStreamSource(this.micStream);
    this.processor = this.inputCtx.createScriptProcessor(4096, 1, 1);

    this.processor.onaudioprocess = (event) => {
      const samples = event.inputBuffer.getChannelData(0);
      let sum = 0;
      for (let i = 0; i < samples.length; i += 8) {
        sum += Math.abs(samples[i]);
      }
      this.micLevel = this.micMuted ? 0 : Math.min(1, (sum / (samples.length / 8)) * 5.5);

      if (this.micMuted || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;
      const base64 = float32ToPcmBase64(samples);
      this.ws.send(JSON.stringify({ audio: base64 }));
    };

    this.sourceNode.connect(this.processor);
    this.processor.connect(this.inputCtx.destination);
  }

  setMicMuted(muted: boolean): void {
    this.micMuted = muted;
    if (muted) this.micLevel = 0;
  }

  sampleSpectrum(): { bins: Uint8Array; micLevel: number; aiSpeaking: boolean } {
    let aiSum = 0;
    if (this.outputAnalyser && this.activeSources.size > 0) {
      this.outputAnalyser.getByteFrequencyData(this.analyserBins);
      for (let i = 0; i < this.analyserBins.length; i += 1) {
        aiSum += this.analyserBins[i];
      }
    } else {
      this.analyserBins.fill(0);
    }
    return {
      bins: this.analyserBins,
      micLevel: this.micLevel,
      aiSpeaking: aiSum > 20 || this.activeSources.size > 0,
    };
  }

  sendTextPrompt(text: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({ text }));
  }

  private schedulePcmPlayback(base64Audio: string): void {
    if (!this.outputCtx || !this.outputAnalyser) return;
    if (this.outputCtx.state === "suspended") {
      void this.outputCtx.resume().catch(() => {});
    }
    const floatData = base64PcmToFloat32(base64Audio);
    if (floatData.length === 0) return;

    const buffer = this.outputCtx.createBuffer(1, floatData.length, 24000);
    buffer.getChannelData(0).set(floatData);

    const src = this.outputCtx.createBufferSource();
    src.buffer = buffer;
    src.connect(this.outputAnalyser);

    const startAt = Math.max(this.outputCtx.currentTime, this.nextStartTime);
    src.start(startAt);
    this.nextStartTime = startAt + buffer.duration;
    this.activeSources.add(src);
    src.onended = () => {
      this.activeSources.delete(src);
    };
  }

  private stopQueuedPlayback(): void {
    for (const src of this.activeSources) {
      try {
        src.stop();
      } catch {
        // ignore
      }
    }
    this.activeSources.clear();
    if (this.outputCtx) {
      this.nextStartTime = this.outputCtx.currentTime;
    }
  }

  disconnect(): void {
    this.stopQueuedPlayback();
    this.micLevel = 0;
    try {
      this.processor?.disconnect();
      this.sourceNode?.disconnect();
      this.outputAnalyser?.disconnect();
    } catch {
      // ignore
    }
    this.processor = null;
    this.sourceNode = null;
    this.outputAnalyser = null;

    if (this.micStream) {
      for (const track of this.micStream.getTracks()) {
        track.stop();
      }
      this.micStream = null;
    }

    if (this.inputCtx) {
      void this.inputCtx.close().catch(() => {});
      this.inputCtx = null;
    }
    if (this.outputCtx) {
      void this.outputCtx.close().catch(() => {});
      this.outputCtx = null;
    }
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        // ignore
      }
      this.ws = null;
    }
  }
}
