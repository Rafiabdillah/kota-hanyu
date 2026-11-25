import React, { useEffect, useMemo, useRef, useState } from "react";
import { X, Mic, MicOff, Phone, PhoneOff, Send, AlertCircle, Volume2, Sparkles } from "lucide-react";
import type { ChapterData } from "../data/types";
import { mergeLiveTranscriptChunk } from "../game/engine";
import { speakMandarin } from "../game/audio";
import { GeminiLiveVoiceClient } from "../game/liveClient";

interface LiveVoiceLabProps {
  chapters: ChapterData[];
  initialChapterId: string;
  muted?: boolean;
  naturalTtsEnabled?: boolean;
  onClose: () => void;
  onTurnAwardXp: () => void;
}

interface TranscriptMessage {
  id: number;
  role: "user" | "laoshi" | "system";
  text: string;
}

const CHAPTER_SCENARIOS: Record<
  string,
  { scenarios: string[]; starters: { hanzi: string; pinyin: string }[] }
> = {
  bab1: {
    scenarios: [
      "Perkenalan di Gerbang Kampus",
      "Menanyakan Marga (请问您贵姓)",
    ],
    starters: [
      { hanzi: "老师，早上好！", pinyin: "Lǎoshī, zǎoshang hǎo!" },
      { hanzi: "请问，您贵姓？", pinyin: "Qǐngwèn, nín guìxìng?" },
      { hanzi: "我是印度尼西亚人。", pinyin: "Wǒ shì Yìndùníxīyà rén." },
    ],
  },
  bab2: {
    scenarios: [
      "Tanya Benda Kelas (这是什么)",
      "Cerita Anggota Keluarga",
    ],
    starters: [
      { hanzi: "这是汉语词典吗？", pinyin: "Zhè shì Hànyǔ cídiǎn ma?" },
      { hanzi: "我有两本汉语书。", pinyin: "Wǒ yǒu liǎng běn Hànyǔ shū." },
      { hanzi: "我家有四口人。", pinyin: "Wǒ jiā yǒu sì kǒu rén." },
    ],
  },
  bab3: {
    scenarios: [
      "Tawar Buah di Toko Kampus",
      "Jadwal Kelas & Jam (几点上课)",
    ],
    starters: [
      { hanzi: "苹果多少钱一斤？", pinyin: "Píngguǒ duōshao qián yì jīn?" },
      { hanzi: "我要两斤苹果。", pinyin: "Wǒ yào liǎng jīn píngguǒ." },
      { hanzi: "我们八点一刻上课。", pinyin: "Wǒmen bā diǎn yí kè shàngkè." },
    ],
  },
  bab4: {
    scenarios: [
      "Tanya Arah ke Bank (中国银行)",
      "Pilih MRT atau Bus (还是 vs 或者)",
    ],
    starters: [
      { hanzi: "请问，中国银行在哪儿？", pinyin: "Qǐngwèn, Zhōngguó Yínháng zài nǎr?" },
      { hanzi: "一直往前走，在超市旁边。", pinyin: "Yìzhí wǎng qián zǒu..." },
      { hanzi: "坐地铁快还是坐公共汽车快？", pinyin: "Zuò dìtiě kuài háishì..." },
    ],
  },
  bab5: {
    scenarios: [
      "Konsultasi Demam di Klinik",
      "Kebiasaan Harian (一……就……)",
    ],
    starters: [
      { hanzi: "我有点儿发烧，头疼。", pinyin: "Wǒ yǒudiǎnr fāshāo, tóuténg." },
      { hanzi: "今天很冷，多穿点儿衣服。", pinyin: "Jīntiān hěn lěng..." },
      { hanzi: "我一下课就去食堂。", pinyin: "Wǒ yí xiàkè jiù qù shítáng." },
    ],
  },
  bab6: {
    scenarios: [
      "Minta Bantuan Kalimat 把",
      "Hasil Perbaikan di Lab Bahasa",
    ],
    starters: [
      { hanzi: "请把护照放在包里。", pinyin: "Qǐng bǎ hùzhào fàng zài bāo lǐ." },
      { hanzi: "我听清楚了。", pinyin: "Wǒ tīng qīngchu le." },
      { hanzi: "我一边听音乐一边写汉字。", pinyin: "Wǒ yìbiān tīng yīnyuè..." },
    ],
  },
  bab7: {
    scenarios: [
      "Urus Kartu Hilang di Bank (挂失)",
      "Pesan Makan & Patungan AA制",
    ],
    starters: [
      { hanzi: "我的银行卡丢了，要挂失。", pinyin: "Wǒ de yínhángkǎ diū le..." },
      { hanzi: "今天我们吃中餐还是西餐？", pinyin: "Jīntiān wǒmen chī Zhōngcān..." },
      { hanzi: "咱们AA制吧！", pinyin: "Zánmen AA zhì ba!" },
    ],
  },
};

export const LiveVoiceLab: React.FC<LiveVoiceLabProps> = ({
  chapters,
  initialChapterId,
  muted = false,
  naturalTtsEnabled = true,
  onClose,
  onTurnAwardXp,
}) => {
  const [selectedChapterId, setSelectedChapterId] = useState(initialChapterId);
  const pack = CHAPTER_SCENARIOS[selectedChapterId] ?? CHAPTER_SCENARIOS.bab1;
  const [selectedScenario, setSelectedScenario] = useState(pack.scenarios[0]);

  const [status, setStatus] = useState<"idle" | "connecting" | "connected" | "error" | "closed">("idle");
  const [statusDetail, setStatusDetail] = useState(
    "Pilih topik & skenario lalu hubungkan sesi percakapan suara real-time dengan Lǎoshī Lín (gemini-3.8-live).",
  );
  const [micActive, setMicActive] = useState(false);
  const [micMuted, setMicMuted] = useState(false);
  const [textDraft, setTextDraft] = useState("");
  const [serverReady, setServerReady] = useState<boolean | null>(null);
  const [messages, setMessages] = useState<TranscriptMessage[]>([]);

  const clientRef = useRef<GeminiLiveVoiceClient | null>(null);
  const msgCounterRef = useRef(1);
  const waveCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const nextPack = CHAPTER_SCENARIOS[selectedChapterId] ?? CHAPTER_SCENARIOS.bab1;
    setSelectedScenario(nextPack.scenarios[0]);
  }, [selectedChapterId]);

  const pushMessage = (role: TranscriptMessage["role"], text: string) => {
    const clean = text.trim();
    if (!clean) return;
    setMessages((prev) => {
      const last = prev[prev.length - 1];
      if (last && last.role === role) {
        return [
          ...prev.slice(0, -1),
          { ...last, text: mergeLiveTranscriptChunk(last.text, clean) },
        ];
      }
      const id = msgCounterRef.current++;
      return [...prev, { id, role, text: clean }];
    });
  };

  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then((data: { geminiConfigured?: boolean }) => {
        setServerReady(Boolean(data.geminiConfigured));
      })
      .catch(() => setServerReady(false));

    return () => {
      clientRef.current?.disconnect();
      clientRef.current = null;
    };
  }, []);

  // Live audio waveform canvas loop
  useEffect(() => {
    let rafId = 0;
    const drawWave = () => {
      const canvas = waveCanvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext("2d");
        if (ctx) {
          const w = canvas.width;
          const h = canvas.height;
          ctx.clearRect(0, 0, w, h);

          const spec = clientRef.current?.sampleSpectrum();
          const barCount = 24;
          const gap = 3;
          const barW = (w - gap * (barCount - 1)) / barCount;

          for (let i = 0; i < barCount; i += 1) {
            let amp = 0.08;
            if (spec && status === "connected") {
              const aiBin = (spec.bins[i % spec.bins.length] ?? 0) / 255;
              const micBoost = spec.micLevel * (0.55 + Math.sin(performance.now() * 0.015 + i) * 0.45);
              amp = Math.max(0.08, aiBin * 0.9, micBoost);
            }
            const bh = Math.max(4, amp * (h - 6));
            const x = i * (barW + gap);
            const y = (h - bh) / 2;
            ctx.fillStyle =
              spec?.aiSpeaking
                ? "#059669"
                : micActive && !micMuted
                  ? "#2563eb"
                  : "#94a3b8";
            ctx.beginPath();
            ctx.roundRect(x, y, barW, bh, 3);
            ctx.fill();
          }
        }
      }
      rafId = requestAnimationFrame(drawWave);
    };
    rafId = requestAnimationFrame(drawWave);
    return () => cancelAnimationFrame(rafId);
  }, [status, micActive, micMuted]);

  const handleConnect = async () => {
    const client = new GeminiLiveVoiceClient();
    clientRef.current = client;
    setMessages([]);
    setStatus("connecting");

    await client.connect(
      selectedChapterId,
      {
        onStatus: (nextStatus, detail) => {
          setStatus(nextStatus);
          if (detail) setStatusDetail(detail);
          if (nextStatus === "error" || nextStatus === "closed") {
            setMicActive(false);
          }
        },
        onInputTranscript: (txt) => pushMessage("user", txt),
        onOutputTranscript: (txt) => pushMessage("laoshi", txt),
        onTurnComplete: () => onTurnAwardXp(),
      },
      selectedScenario,
    );
  };

  const handleEnableMic = async () => {
    if (!clientRef.current || status !== "connected") return;
    try {
      await clientRef.current.startMicrophone();
      setMicActive(true);
      setMicMuted(false);
      setStatusDetail("Mikrofon aktif (16kHz PCM). Silakan berbicara dalam bahasa Mandarin!");
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : "Izin mikrofon ditolak atau tidak tersedia di browser ini.";
      setStatusDetail(msg);
      pushMessage("system", msg);
    }
  };

  const handleToggleMicMute = () => {
    const next = !micMuted;
    setMicMuted(next);
    clientRef.current?.setMicMuted(next);
  };

  const handleDisconnect = () => {
    clientRef.current?.disconnect();
    clientRef.current = null;
    setMicActive(false);
    setStatus("closed");
    setStatusDetail("Sesi suara dihentikan.");
  };

  const sendMessage = (val: string) => {
    const clean = val.trim();
    if (!clean || status !== "connected") return;
    pushMessage("user", clean);
    clientRef.current?.sendTextPrompt(clean);
  };

  const handleSendText = (e: React.FormEvent) => {
    e.preventDefault();
    if (!textDraft.trim() || status !== "connected") return;
    sendMessage(textDraft);
    setTextDraft("");
  };

  const activeChapter = chapters.find((c) => c.id === selectedChapterId) ?? chapters[0];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-2 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="live-voice-title"
    >
      <div className="flex max-h-[92dvh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-300 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-800 sm:px-6">
          <div>
            <div className="text-[11px] font-extrabold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
              Gemini Live API · gemini-3.8-live
            </div>
            <h2
              id="live-voice-title"
              className="text-base font-extrabold text-slate-900 dark:text-white sm:text-lg"
            >
              Latihan Suara Langsung dengan Lǎoshī Lín
            </h2>
          </div>
          <button
            type="button"
            onClick={() => {
              handleDisconnect();
              onClose();
            }}
            aria-label="Tutup Lab Suara Live"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Controls, Scenario & Live Waveform */}
        <div className="space-y-2.5 border-b border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-950/50 sm:px-6">
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="text-xs font-bold text-slate-700 dark:text-slate-200">
              Konteks Topik Bab:
              <select
                value={selectedChapterId}
                disabled={status === "connected" || status === "connecting"}
                onChange={(e) => setSelectedChapterId(e.target.value)}
                className="mt-1 block min-h-[38px] w-full rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-900 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              >
                {chapters.map((c) => (
                  <option key={c.id} value={c.id}>
                    Bab {c.order} — {c.shortTitle}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-xs font-bold text-slate-700 dark:text-slate-200">
              Skenario Roleplay:
              <select
                value={selectedScenario}
                disabled={status === "connected" || status === "connecting"}
                onChange={(e) => setSelectedScenario(e.target.value)}
                className="mt-1 block min-h-[38px] w-full rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-900 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              >
                {pack.scenarios.map((sc) => (
                  <option key={sc} value={sc}>
                    {sc}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              {status !== "connected" ? (
                <button
                  type="button"
                  data-testid="live-connect-btn"
                  disabled={status === "connecting"}
                  onClick={handleConnect}
                  className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-emerald-700 px-4 py-2 text-xs font-extrabold text-white hover:bg-emerald-800 disabled:opacity-50"
                >
                  <Phone className="h-4 w-4" />
                  {status === "connecting" ? "Menghubungkan..." : "Mulai Panggilan Live"}
                </button>
              ) : (
                <>
                  {!micActive ? (
                    <button
                      type="button"
                      onClick={handleEnableMic}
                      className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-blue-700 px-3.5 py-2 text-xs font-extrabold text-white hover:bg-blue-800"
                    >
                      <Mic className="h-4 w-4" />
                      Aktifkan Mikrofon
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleToggleMicMute}
                      className={`inline-flex min-h-[40px] items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-extrabold text-white ${
                        micMuted ? "bg-amber-600 hover:bg-amber-700" : "bg-blue-700 hover:bg-blue-800"
                      }`}
                    >
                      {micMuted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                      {micMuted ? "Mikrofon Dibisukan" : "Mikrofon Aktif"}
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() =>
                      sendMessage(
                        `Mulai roleplay "${selectedScenario}" sekarang dengan menyapa Rafi duluan dalam bahasa Mandarin!`,
                      )
                    }
                    className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-emerald-400 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-900 hover:bg-emerald-100 dark:border-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-200"
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    Lǎoshī Mulai Sapa
                  </button>

                  <button
                    type="button"
                    onClick={handleDisconnect}
                    className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-rose-700 px-3.5 py-2 text-xs font-extrabold text-white hover:bg-rose-800"
                  >
                    <PhoneOff className="h-4 w-4" />
                    Akhiri
                  </button>
                </>
              )}
            </div>

            {status === "connected" ? (
              <canvas
                ref={waveCanvasRef}
                width={140}
                height={28}
                aria-label="Indikator gelombang suara"
                className="h-7 w-[140px] rounded-lg border border-slate-200 bg-white px-1.5 dark:border-slate-700 dark:bg-slate-900"
              />
            ) : (
              <span className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                Suara 24 kHz Siap
              </span>
            )}
          </div>

          <div
            data-testid="live-status-banner"
            className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-xs font-medium ${
              status === "error" || serverReady === false
                ? "border-rose-300 bg-rose-50 text-rose-900 dark:border-rose-800 dark:bg-rose-950/50 dark:text-rose-200"
                : status === "connected"
                  ? "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200"
                  : "border-slate-200 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
            }`}
          >
            {status === "error" || serverReady === false ? (
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            ) : null}
            <div>
              {serverReady === false && status === "idle"
                ? "Server melaporkan GEMINI_API_KEY belum tersedia di panel Secrets. Klik 'Mulai Panggilan Live' tetap akan memverifikasi koneksi server atau menampilkan pesan galat asli."
                : statusDetail}
            </div>
          </div>
        </div>

        {/* Transcript Window */}
        <div
          ref={chatScrollRef}
          className="custom-scroll flex-1 space-y-2.5 overflow-y-auto p-4 sm:p-5"
        >
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-300">
            <strong>Fokus {activeChapter.shortTitle}:</strong>{" "}
            <span className="hanzi-text">{activeChapter.subtitle}</span>
          </div>

          {messages.length === 0 ? (
            <p className="py-5 text-center text-xs text-slate-500 dark:text-slate-400">
              Transkrip percakapan langsung akan muncul di sini saat sesi suara berlangsung.
            </p>
          ) : (
            messages.map((m) => (
              <div
                key={m.id}
                className={`rounded-xl px-3.5 py-2.5 text-sm ${
                  m.role === "user"
                    ? "ml-auto max-w-[85%] bg-blue-700 text-white"
                    : m.role === "system"
                      ? "border border-rose-300 bg-rose-50 text-rose-900 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-200"
                      : "mr-auto max-w-[85%] border border-slate-200 bg-slate-100 text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-extrabold uppercase opacity-75">
                    {m.role === "user" ? "Rafi (Kamu)" : m.role === "system" ? "Info" : "Lǎoshī Lín"}
                  </span>
                  {m.role === "laoshi" && (
                    <button
                      type="button"
                      onClick={() =>
                        speakMandarin(m.text.slice(0, 220), {
                          muted,
                          naturalTts: naturalTtsEnabled,
                        })
                      }
                      aria-label="Putar ulang kalimat Lǎoshī Lín"
                      className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-white/80 text-slate-700 hover:text-emerald-700 dark:bg-slate-900 dark:text-slate-300"
                    >
                      <Volume2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                <div className="hanzi-text mt-0.5 leading-relaxed">{m.text}</div>
              </div>
            ))
          )}
        </div>

        {/* Starter Phrase Chips + Text Input */}
        <div className="space-y-2 border-t border-slate-200 px-4 py-2.5 dark:border-slate-800 sm:px-6">
          <div className="custom-scroll flex items-center gap-1.5 overflow-x-auto pb-0.5">
            {pack.starters.map((st) => (
              <button
                key={st.hanzi}
                type="button"
                disabled={status !== "connected"}
                onClick={() => sendMessage(st.hanzi)}
                title={st.pinyin}
                className="hanzi-text shrink-0 rounded-lg border border-slate-300 bg-slate-50 px-2.5 py-1 text-xs font-bold text-slate-800 hover:border-blue-600 hover:text-blue-700 disabled:opacity-45 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                {st.hanzi}
              </button>
            ))}
          </div>

          <form onSubmit={handleSendText} className="flex items-center gap-2">
            <input
              type="text"
              disabled={status !== "connected"}
              value={textDraft}
              onChange={(e) => setTextDraft(e.target.value)}
              placeholder={
                status === "connected"
                  ? "Ketik salam atau kalimat Mandarin (contoh: 老师好！)..."
                  : "Hubungkan sesi terlebih dahulu untuk berlatih..."
              }
              className="min-h-[42px] flex-1 rounded-xl border border-slate-300 bg-white px-3.5 text-sm text-slate-900 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
            <button
              type="submit"
              disabled={status !== "connected" || !textDraft.trim()}
              className="inline-flex min-h-[42px] items-center gap-1.5 rounded-xl bg-blue-700 px-4 text-xs font-bold text-white hover:bg-blue-800 disabled:opacity-45"
            >
              <Send className="h-4 w-4" />
              Kirim
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
