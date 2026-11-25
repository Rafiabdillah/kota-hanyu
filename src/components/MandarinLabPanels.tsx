import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Volume2,
  RotateCcw,
  CheckCircle2,
  XCircle,
  Layers,
  PenTool,
  Music2,
  Undo2,
  Trash2,
  RefreshCw,
  Award,
  Sparkles,
  Target,
  GraduationCap,
} from "lucide-react";
import type { MateriBundle } from "../data/types";
import {
  CAMPUS_ORBS,
  computeAchievements,
  computeGraduationEligibility,
  generateToneDrillQuestion,
  getDailyQuests,
  type PlayerProgressState,
  type ToneDrillQuestion,
} from "../game/engine";
import { speakMandarin } from "../game/audio";

const HANZI_WRITING_DECK = [
  { char: "你", pinyin: "nǐ", meaning: "Kamu (Nada 3)", chapter: "Bab 1" },
  { char: "好", pinyin: "hǎo", meaning: "Baik (Nada 3)", chapter: "Bab 1" },
  { char: "谢", pinyin: "xiè", meaning: "Terima kasih", chapter: "Bab 1" },
  { char: "书", pinyin: "shū", meaning: "Buku", chapter: "Bab 2" },
  { char: "两", pinyin: "liǎng", meaning: "Dua (sebelum satuan)", chapter: "Bab 2" },
  { char: "本", pinyin: "běn", meaning: "Satuan jilid buku", chapter: "Bab 2" },
  { char: "钱", pinyin: "qián", meaning: "Uang / harga", chapter: "Bab 3" },
  { char: "点", pinyin: "diǎn", meaning: "Jam / pukul", chapter: "Bab 3" },
  { char: "走", pinyin: "zǒu", meaning: "Berjalan", chapter: "Bab 4" },
  { char: "在", pinyin: "zài", meaning: "Berada di", chapter: "Bab 4" },
  { char: "水", pinyin: "shuǐ", meaning: "Air", chapter: "Bab 5" },
  { char: "热", pinyin: "rè", meaning: "Panas / hangat", chapter: "Bab 5" },
  { char: "把", pinyin: "bǎ", meaning: "Partikel perlakuan 把", chapter: "Bab 6" },
  { char: "写", pinyin: "xiě", meaning: "Menulis", chapter: "Bab 6" },
  { char: "茶", pinyin: "chá", meaning: "Teh", chapter: "Bab 7" },
  { char: "吃", pinyin: "chī", meaning: "Makan", chapter: "Bab 7" },
];

const TONE_PATHS: Record<1 | 2 | 3 | 4, { path: string; color: string; label: string }> = {
  1: { path: "M 8 14 L 72 14", color: "#2563eb", label: "Nada 1 (Datar)" },
  2: { path: "M 8 34 Q 40 28 72 12", color: "#059669", label: "Nada 2 (Naik)" },
  3: { path: "M 8 32 Q 36 48 72 18", color: "#d97706", label: "Nada 3 (Turun-Naik)" },
  4: { path: "M 8 12 Q 40 24 72 44", color: "#dc2626", label: "Nada 4 (Turun)" },
};

interface StudioPanelProps {
  materi: MateriBundle;
  state: PlayerProgressState;
  onFlashcardReview: (vocabId: string, knewIt: boolean) => void;
  onHanziPractice: (hanziChar: string) => void;
  onToneDrillSolved: (isCorrect: boolean) => void;
}

export const MandarinStudioPanel: React.FC<StudioPanelProps> = ({
  materi,
  state,
  onFlashcardReview,
  onHanziPractice,
  onToneDrillSolved,
}) => {
  const [subTab, setSubTab] = useState<"flashcard" | "write" | "tone">("flashcard");

  // --- 1. FLASHCARDS STATE ---
  const [cardChapterFilter, setCardChapterFilter] = useState("Semua");
  const [cardIndex, setCardIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);

  // Freeze sorted card order per filter session so updating mastery doesn't jump-skip cards
  const orderedCardIds = useMemo(() => {
    const filtered = materi.vocabBank.filter(
      (v) => cardChapterFilter === "Semua" || v.chapterLabel === cardChapterFilter,
    );
    return [...filtered]
      .sort((a, b) => (state.flashcardMastery[a.id] ?? 0) - (state.flashcardMastery[b.id] ?? 0))
      .map((v) => v.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [materi.vocabBank, cardChapterFilter]);

  const deck = useMemo(() => {
    const lookup = Object.fromEntries(materi.vocabBank.map((v) => [v.id, v]));
    return orderedCardIds.map((id) => lookup[id]).filter(Boolean);
  }, [materi.vocabBank, orderedCardIds]);

  const currentCard = deck[cardIndex % Math.max(1, deck.length)] ?? materi.vocabBank[0];
  const currentCardBox = state.flashcardMastery[currentCard?.id ?? ""] ?? 0;

  // --- 2. HANZI WRITING PAD STATE ---
  const [selectedCharIdx, setSelectedCharIdx] = useState(0);
  const [strokes, setStrokes] = useState<{ x: number; y: number }[][]>([]);
  const [writeSavedMsg, setWriteSavedMsg] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isDrawingRef = useRef(false);
  const currentStrokeRef = useRef<{ x: number; y: number }[]>([]);

  const activeHanzi = HANZI_WRITING_DECK[selectedCharIdx] ?? HANZI_WRITING_DECK[0];

  const redrawCanvas = (allStrokes: { x: number; y: number }[][], activeStroke?: { x: number; y: number }[]) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const size = canvas.width;
    ctx.clearRect(0, 0, size, size);

    // Classic Tianzi-ge / Mizige grid
    ctx.fillStyle = "#fffdf7";
    ctx.fillRect(0, 0, size, size);

    ctx.strokeStyle = "rgba(220, 38, 38, 0.25)";
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 6]);
    ctx.beginPath();
    ctx.moveTo(size / 2, 0);
    ctx.lineTo(size / 2, size);
    ctx.moveTo(0, size / 2);
    ctx.lineTo(size, size / 2);
    ctx.moveTo(0, 0);
    ctx.lineTo(size, size);
    ctx.moveTo(size, 0);
    ctx.lineTo(0, size);
    ctx.stroke();
    ctx.setLineDash([]);

    // Faint reference Hanzi watermark
    ctx.fillStyle = "rgba(148, 163, 184, 0.24)";
    ctx.font = `700 ${Math.round(size * 0.68)}px "Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(activeHanzi.char, size / 2, size / 2 + 6);

    const drawPath = (pts: { x: number; y: number }[]) => {
      if (pts.length === 0) return;
      ctx.strokeStyle = "#0f172a";
      ctx.lineWidth = 11;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i += 1) {
        ctx.lineTo(pts[i].x, pts[i].y);
      }
      if (pts.length === 1) {
        ctx.lineTo(pts[0].x + 0.5, pts[0].y + 0.5);
      }
      ctx.stroke();
    };

    allStrokes.forEach(drawPath);
    if (activeStroke && activeStroke.length > 0) drawPath(activeStroke);
  };

  useEffect(() => {
    if (subTab === "write") {
      redrawCanvas(strokes);
    }
  }, [subTab, strokes, activeHanzi.char]);

  const getCanvasPoint = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * canvas.width,
      y: ((e.clientY - rect.top) / rect.height) * canvas.height,
    };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    isDrawingRef.current = true;
    const pt = getCanvasPoint(e);
    currentStrokeRef.current = [pt];
    setWriteSavedMsg(null);
    redrawCanvas(strokes, currentStrokeRef.current);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current) return;
    const pt = getCanvasPoint(e);
    currentStrokeRef.current.push(pt);
    redrawCanvas(strokes, currentStrokeRef.current);
  };

  const handlePointerUp = () => {
    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;
    if (currentStrokeRef.current.length > 0) {
      const finalized = [...strokes, [...currentStrokeRef.current]];
      currentStrokeRef.current = [];
      setStrokes(finalized);
    }
  };

  // --- 3. TONE LISTENING DRILL STATE ---
  const [toneQ, setToneQ] = useState<ToneDrillQuestion>(() => generateToneDrillQuestion());
  const [pickedTone, setPickedTone] = useState<number | null>(null);
  const [toneStreak, setToneStreak] = useState(0);

  const speakText = (txt: string) => {
    speakMandarin(txt, {
      muted: state.muted,
      rate: state.speechRate,
      naturalTts: state.naturalTtsEnabled,
    });
  };

  return (
    <div className="space-y-4">
      {/* Sub-mode switcher */}
      <div className="flex flex-wrap items-center gap-2">
        {[
          { id: "flashcard" as const, icon: Layers, label: "Kartu Kilat (Flashcard)" },
          { id: "write" as const, icon: PenTool, label: "Papan Tulis Hanzi (米字格)" },
          { id: "tone" as const, icon: Music2, label: "Tantangan 4 Nada (四声)" },
        ].map((item) => {
          const Icon = item.icon;
          const active = subTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              data-testid={`studio-subtab-${item.id}`}
              onClick={() => setSubTab(item.id)}
              className={`inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-bold ${
                active
                  ? "border-emerald-700 bg-emerald-700 text-white"
                  : "border-slate-300 bg-slate-50 text-slate-800 hover:border-emerald-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {item.label}
            </button>
          );
        })}
      </div>

      {/* 1. FLASHCARD DECK */}
      {subTab === "flashcard" && currentCard && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <select
              aria-label="Filter Kartu Kilat per Bab"
              value={cardChapterFilter}
              onChange={(e) => {
                setCardChapterFilter(e.target.value);
                setCardIndex(0);
                setFlipped(false);
              }}
              className="min-h-[38px] rounded-xl border border-slate-300 bg-white px-3 text-xs font-bold text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            >
              <option value="Semua">Semua Bab ({materi.vocabBank.length} kartu)</option>
              {materi.chapters.map((c) => (
                <option key={c.id} value={`Bab ${c.order}`}>
                  Bab {c.order} — {c.shortTitle}
                </option>
              ))}
            </select>

            <div className="font-mono-num text-xs font-bold text-slate-600 dark:text-slate-300">
              Kartu {(cardIndex % deck.length) + 1}/{deck.length} · Penguasaan Kotak {currentCardBox}/3
            </div>
          </div>

          <div
            onClick={() => setFlipped((f) => !f)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setFlipped((f) => !f);
              }
            }}
            data-testid="flashcard-card"
            className="cursor-pointer rounded-2xl border-2 border-slate-300 bg-amber-50/40 p-6 text-center shadow-sm transition hover:border-blue-600 dark:border-slate-700 dark:bg-slate-800/80"
          >
            <div className="text-[11px] font-extrabold uppercase tracking-wider text-blue-700 dark:text-blue-400">
              {currentCard.chapterLabel} · Ketuk Kartu untuk Balik
            </div>
            <div className="hanzi-text mt-4 text-3xl font-black text-slate-900 dark:text-white sm:text-4xl">
              {currentCard.hanzi}
            </div>
            <div className="mt-2 text-base font-bold text-blue-700 dark:text-blue-300">
              {currentCard.pinyin}
            </div>

            {flipped ? (
              <div className="mt-5 border-t border-slate-200 pt-4 dark:border-slate-700">
                <div className="text-base font-extrabold text-slate-900 dark:text-white">
                  {currentCard.meaning}
                </div>
                <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                  {currentCard.note}
                </p>
                <p className="mt-2 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                  Sumber: {currentCard.source}
                </p>
              </div>
            ) : (
              <p className="mt-5 text-xs font-semibold text-slate-500 dark:text-slate-400">
                (Arti &amp; catatan tersembunyi — tebak dulu lalu balik kartu)
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => speakText(currentCard.hanzi)}
              className="inline-flex min-h-[42px] items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-4 text-xs font-bold text-slate-800 hover:border-emerald-600 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            >
              <Volume2 className="h-4 w-4 text-emerald-600" />
              Dengar Pelafalan
            </button>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  onFlashcardReview(currentCard.id, false);
                  setFlipped(false);
                  setCardIndex((i) => (i + 1) % deck.length);
                }}
                className="inline-flex min-h-[42px] items-center gap-1.5 rounded-xl border border-amber-400 bg-amber-50 px-3.5 text-xs font-bold text-amber-900 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-950/60 dark:text-amber-200"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Ulangi Lagi (+3 XP)
              </button>
              <button
                type="button"
                data-testid="flashcard-knew-btn"
                onClick={() => {
                  onFlashcardReview(currentCard.id, true);
                  setFlipped(false);
                  setCardIndex((i) => (i + 1) % deck.length);
                }}
                className="inline-flex min-h-[42px] items-center gap-1.5 rounded-xl bg-emerald-700 px-4 text-xs font-extrabold text-white hover:bg-emerald-800"
              >
                <CheckCircle2 className="h-4 w-4" />
                Sudah Hafal (+8 XP)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. HANZI WRITING PAD */}
      {subTab === "write" && (
        <div className="grid gap-4 md:grid-cols-[270px_1fr]">
          <div className="flex flex-col items-center">
            <canvas
              ref={canvasRef}
              width={260}
              height={260}
              data-testid="hanzi-write-canvas"
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              className="h-[250px] w-[250px] touch-none rounded-2xl border-2 border-rose-300 shadow-inner"
            />
            <div className="mt-2.5 flex flex-wrap items-center justify-center gap-1.5">
              <button
                type="button"
                onClick={() => setStrokes((prev) => prev.slice(0, -1))}
                disabled={strokes.length === 0}
                className="inline-flex min-h-[36px] items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-bold text-slate-700 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                <Undo2 className="h-3.5 w-3.5" />
                Urungkan
              </button>
              <button
                type="button"
                onClick={() => {
                  setStrokes([]);
                  setWriteSavedMsg(null);
                }}
                className="inline-flex min-h-[36px] items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-bold text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Bersihkan
              </button>
              <button
                type="button"
                data-testid="hanzi-practice-done-btn"
                disabled={strokes.length === 0}
                onClick={() => {
                  onHanziPractice(activeHanzi.char);
                  setWriteSavedMsg(`Mantap! Karakter "${activeHanzi.char}" tercatat.`);
                  setStrokes([]);
                }}
                className="inline-flex min-h-[36px] items-center gap-1 rounded-lg bg-emerald-700 px-3 text-xs font-extrabold text-white hover:bg-emerald-800 disabled:opacity-45"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                Simpan Goresan
              </button>
            </div>
            {writeSavedMsg && (
              <p className="mt-2 text-center text-xs font-bold text-emerald-700 dark:text-emerald-400">
                {writeSavedMsg}
              </p>
            )}
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/70">
              <div>
                <div className="text-[11px] font-bold uppercase text-blue-700 dark:text-blue-400">
                  {activeHanzi.chapter} · {state.practicedHanzi.length}/{HANZI_WRITING_DECK.length} Dilatih
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="hanzi-text text-2xl font-black text-slate-900 dark:text-white">
                    {activeHanzi.char}
                  </span>
                  <span className="text-sm font-bold text-blue-700 dark:text-blue-300">
                    ({activeHanzi.pinyin})
                  </span>
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                    — {activeHanzi.meaning}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => speakText(activeHanzi.char)}
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-700 text-white hover:bg-emerald-800"
                aria-label={`Dengar ${activeHanzi.char}`}
              >
                <Volume2 className="h-4 w-4" />
              </button>
            </div>

            <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-8">
              {HANZI_WRITING_DECK.map((item, idx) => {
                const practiced = state.practicedHanzi.includes(item.char);
                const selected = idx === selectedCharIdx;
                return (
                  <button
                    key={item.char}
                    type="button"
                    onClick={() => {
                      setSelectedCharIdx(idx);
                      setStrokes([]);
                      setWriteSavedMsg(null);
                    }}
                    className={`hanzi-text relative flex h-11 items-center justify-center rounded-xl border text-lg font-extrabold transition ${
                      selected
                        ? "border-blue-700 bg-blue-700 text-white"
                        : practiced
                          ? "border-emerald-400 bg-emerald-50 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-200"
                          : "border-slate-200 bg-white text-slate-900 hover:border-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    }`}
                  >
                    {item.char}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              Tips: Tarik goresan dari kiri ke kanan, lalu atas ke bawah mengikuti bayangan aksara pada kotak 米字格.
            </p>
          </div>
        </div>
      )}

      {/* 3. TONE LISTENING DRILL */}
      {subTab === "tone" && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/70">
            <div>
              <div className="text-xs font-extrabold uppercase tracking-wider text-blue-700 dark:text-blue-400">
                Latihan Pendengaran 4 Nada · Terjawab: {state.toneDrillsSolved}
                {toneStreak >= 2 ? ` · Beruntun ${toneStreak}x` : ""}
              </div>
              <p className="mt-0.5 text-sm font-bold text-slate-900 dark:text-white">
                Dengarkan bunyi suku kata "{toneQ.syllableBase}", lalu pilih nada yang tepat!
              </p>
            </div>
            <button
              type="button"
              data-testid="tone-drill-play-btn"
              onClick={() => speakText(toneQ.targetHanzi)}
              className="inline-flex min-h-[42px] items-center gap-1.5 rounded-xl bg-emerald-700 px-4 text-xs font-extrabold text-white hover:bg-emerald-800"
            >
              <Volume2 className="h-4 w-4" />
              Putar Suara Nada
            </button>
          </div>

          <div className="grid gap-2.5 sm:grid-cols-4">
            {toneQ.options.map((opt) => {
              const info = TONE_PATHS[opt.tone];
              const isPicked = pickedTone === opt.tone;
              const isRight = opt.tone === toneQ.targetTone;
              let cls =
                "border-slate-200 bg-white hover:border-blue-600 dark:border-slate-700 dark:bg-slate-800";
              if (pickedTone !== null) {
                if (isRight) {
                  cls = "border-emerald-600 bg-emerald-50 dark:border-emerald-500 dark:bg-emerald-950/60";
                } else if (isPicked) {
                  cls = "border-rose-600 bg-rose-50 dark:border-rose-500 dark:bg-rose-950/60";
                }
              }

              return (
                <button
                  key={opt.tone}
                  type="button"
                  disabled={pickedTone !== null}
                  onClick={() => {
                    const correct = opt.tone === toneQ.targetTone;
                    setPickedTone(opt.tone);
                    setToneStreak((s) => (correct ? s + 1 : 0));
                    onToneDrillSolved(correct);
                  }}
                  className={`flex flex-col items-start rounded-xl border p-3 text-left transition ${cls}`}
                >
                  <div className="flex w-full items-center justify-between">
                    <span className="hanzi-text text-xl font-black text-slate-900 dark:text-white">
                      {opt.hanzi}
                    </span>
                    <span className="text-xs font-extrabold" style={{ color: info.color }}>
                      {opt.pinyin}
                    </span>
                  </div>
                  <svg viewBox="0 0 80 52" className="my-1.5 h-8 w-full" aria-hidden="true">
                    <path d={info.path} fill="none" stroke={info.color} strokeWidth="3.5" strokeLinecap="round" />
                  </svg>
                  <div className="text-xs font-bold text-slate-800 dark:text-slate-100">{info.label}</div>
                  <div className="text-[11px] text-slate-600 dark:text-slate-300">{opt.meaning}</div>
                </button>
              );
            })}
          </div>

          {pickedTone !== null && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800">
              <div className="flex items-center gap-2 text-xs font-bold sm:text-sm">
                {pickedTone === toneQ.targetTone ? (
                  <>
                    <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                    <span className="text-emerald-900 dark:text-emerald-200">
                      Tepat! {toneQ.targetHanzi} ({toneQ.targetPinyin}) artinya "{toneQ.targetMeaning}". (+10 XP)
                    </span>
                  </>
                ) : (
                  <>
                    <XCircle className="h-5 w-5 text-rose-600" />
                    <span className="text-rose-900 dark:text-rose-200">
                      Yang diputar adalah {toneQ.targetHanzi} ({toneQ.targetPinyin}) — Nada {toneQ.targetTone}.
                    </span>
                  </>
                )}
              </div>
              <button
                type="button"
                onClick={() => {
                  const nextQ = generateToneDrillQuestion();
                  setToneQ(nextQ);
                  setPickedTone(null);
                  speakText(nextQ.targetHanzi);
                }}
                className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg bg-blue-700 px-3.5 text-xs font-bold text-white hover:bg-blue-800"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Soal Nada Berikutnya
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

interface PassportPanelProps {
  materi: MateriBundle;
  state: PlayerProgressState;
  onClaimDailyQuest: (questId: string) => void;
  onOpenGraduation?: () => void;
}

export const PassportAchievementsPanel: React.FC<PassportPanelProps> = ({
  materi,
  state,
  onClaimDailyQuest,
  onOpenGraduation,
}) => {
  const dailyQuests = useMemo(() => getDailyQuests(state), [state]);
  const achievements = useMemo(() => computeAchievements(state, materi), [state, materi]);
  const unlockedCount = achievements.filter((a) => a.unlocked).length;
  const gradSummary = useMemo(() => computeGraduationEligibility(state, materi), [state, materi]);

  return (
    <div className="space-y-5">
      {/* Graduation Ceremony Banner */}
      {onOpenGraduation && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50/80 p-4 dark:border-amber-700 dark:bg-amber-950/40">
          <div>
            <div className="flex items-center gap-1.5 text-xs font-extrabold text-amber-800 dark:text-amber-300">
              <GraduationCap className="h-4 w-4" />
              <span>{gradSummary.statusLabel}</span>
            </div>
            <p className="mt-0.5 text-xs text-slate-700 dark:text-slate-300">
              {gradSummary.isEligible
                ? `${gradSummary.rankTitle} (${gradSummary.rankMandarin}) — hadiri panggung wisuda 3D & unduh ijazah!`
                : `Selesaikan seluruh ${gradSummary.totalChapters} zona kampus untuk wisuda penuh, atau lihat gladi resik panggung 3D.`}
            </p>
          </div>
          <button
            type="button"
            onClick={onOpenGraduation}
            className="inline-flex min-h-[38px] shrink-0 items-center gap-1.5 rounded-xl bg-amber-600 px-3.5 text-xs font-extrabold text-white hover:bg-amber-700"
          >
            <GraduationCap className="h-4 w-4" />
            Buka Scene Kelulusan
          </button>
        </div>
      )}

      {/* Daily Quests */}
      <div>
        <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-blue-700 dark:text-blue-400">
          <Target className="h-4 w-4" />
          Target Harian Kampus ({dailyQuests.filter((q) => q.completed).length}/{dailyQuests.length})
        </div>
        <div className="mt-2.5 grid gap-2.5 sm:grid-cols-3">
          {dailyQuests.map((q) => {
            const pct = Math.min(100, Math.round((q.progress / q.target) * 100));
            return (
              <div
                key={q.id}
                className="flex flex-col justify-between rounded-xl border border-slate-200 bg-slate-50 p-3.5 dark:border-slate-700 dark:bg-slate-800/70"
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-extrabold text-slate-900 dark:text-white">{q.title}</span>
                    <span className="font-mono-num text-[11px] font-bold text-amber-700 dark:text-amber-400">
                      +{q.rewardXp} XP
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">{q.description}</p>
                </div>

                <div className="mt-3">
                  <div className="mb-1 flex items-center justify-between text-[11px] font-bold text-slate-600 dark:text-slate-300 font-mono-num">
                    <span>Progres</span>
                    <span>
                      {q.progress}/{q.target}
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                    <div
                      className="h-full rounded-full bg-emerald-600 transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  {q.completed && !q.claimed ? (
                    <button
                      type="button"
                      onClick={() => onClaimDailyQuest(q.id)}
                      className="mt-2.5 w-full min-h-[36px] rounded-lg bg-amber-600 text-xs font-extrabold text-white hover:bg-amber-700"
                    >
                      Klaim +{q.rewardXp} XP
                    </button>
                  ) : q.claimed ? (
                    <div className="mt-2 text-center text-[11px] font-bold text-emerald-700 dark:text-emerald-400">
                      Sudah Diklaim
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Campus Orbs Tracker */}
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 dark:border-slate-700 dark:bg-slate-800/70">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
            <Sparkles className="h-4 w-4" />
            Bola Aksara Kampus 3D ({state.collectedOrbIds.length}/{CAMPUS_ORBS.length})
          </div>
          <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
            Berjalanlah melintasi bola bercahaya di kampus untuk mengoleksi!
          </span>
        </div>
        <div className="mt-2.5 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {CAMPUS_ORBS.map((orb) => {
            const got = state.collectedOrbIds.includes(orb.id);
            return (
              <div
                key={orb.id}
                className={`rounded-lg border p-2 text-xs ${
                  got
                    ? "border-emerald-300 bg-white dark:border-emerald-700 dark:bg-slate-900"
                    : "border-slate-200 bg-slate-100/80 opacity-65 dark:border-slate-700 dark:bg-slate-900/50"
                }`}
              >
                <div className="hanzi-text font-extrabold text-slate-900 dark:text-white">
                  {got ? orb.phrase : `${orb.shortHanzi} · ???`}
                </div>
                <div className="text-[11px] text-slate-600 dark:text-slate-300">
                  {got ? orb.pinyin : `Zona ${orb.chapterId.toUpperCase()}`}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 8 Achievements */}
      <div>
        <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-amber-700 dark:text-amber-400">
          <Award className="h-4 w-4" />
          Paspor Prestasi ({unlockedCount}/{achievements.length} Terbuka)
        </div>
        <div className="mt-2.5 grid gap-2 sm:grid-cols-2">
          {achievements.map((ach) => (
            <div
              key={ach.id}
              className={`flex items-center justify-between gap-3 rounded-xl border p-3 ${
                ach.unlocked
                  ? "border-amber-400 bg-amber-50/70 dark:border-amber-600 dark:bg-amber-950/40"
                  : "border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800/50"
              }`}
            >
              <div>
                <div className="text-xs font-extrabold text-slate-900 dark:text-white">
                  {ach.unlocked ? "★ " : ""}
                  {ach.title}
                </div>
                <div className="text-[11px] text-slate-600 dark:text-slate-300">{ach.description}</div>
              </div>
              <span className="font-mono-num shrink-0 text-[11px] font-bold text-slate-700 dark:text-slate-200">
                {ach.progressText}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
