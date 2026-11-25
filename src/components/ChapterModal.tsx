import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  X,
  ArrowRight,
  ArrowLeft,
  Volume2,
  FileText,
  ShieldAlert,
  CheckCircle2,
  BookOpen,
  Lock,
  Sparkles,
  RefreshCw,
  Coffee,
  Eye,
  EyeOff,
} from "lucide-react";
import type { ChapterData, ChapterStageId, QuizQuestion, TappableTerm } from "../data/types";
import type { PlayerProgressState } from "../game/engine";
import {
  generateDynamicPracticeTask,
  getAdaptiveStanding,
  getChapterProgress,
  getDueReviewItemsForChapter,
  getQuizCorrectCount,
  isBossMastered,
  isPracticeComplete,
  isQuizMastered,
  isStageUnlocked,
  type DynamicGeneratedQuestion,
} from "../game/engine";
import { speakMandarin, stopSpeaking } from "../game/audio";
import { QuestionRenderer, type UnifiedQuestion } from "./QuestionRenderer";
import { TeacherAvatar, ToneContourExplorer, type TeacherMood } from "./TeacherAvatar";

interface ChapterModalProps {
  chapter: ChapterData;
  allChapters?: ChapterData[];
  state: PlayerProgressState;
  initialStage: ChapterStageId;
  onClose: () => void;
  onMarkPembukaDone: (chapterId: string) => void;
  onMarkPenjelasanDone: (chapterId: string) => void;
  onRecordPracticeOutcome: (
    chapterId: string,
    taskId: string,
    conceptTag: string,
    topic: string,
    isCorrect: boolean,
    hintLevel: number,
  ) => void;
  onRecordQuizOutcome: (
    chapterId: string,
    questionId: string,
    conceptTag: string,
    topic: string,
    isCorrect: boolean,
    hintLevel: number,
  ) => void;
  onRecordBossStep: (
    chapterId: string,
    stepId: string,
    isCorrect: boolean,
    isLastStep: boolean,
  ) => void;
  onChangeSpeechRate?: (rate: number) => void;
  onRecoverEnergy?: () => void;
  onAwardDynamicXp?: (xp: number) => number;
  onResolveReviewOutcome?: (
    question: QuizQuestion,
    isCorrect: boolean,
    hintLevel: number,
  ) => void;
}

const STAGES: { id: ChapterStageId; label: string }[] = [
  { id: "pembuka", label: "1. Pembuka" },
  { id: "penjelasan", label: "2. Penjelasan" },
  { id: "latihan", label: "3. Latihan" },
  { id: "kuis", label: "4. Kuis (5)" },
  { id: "boss", label: "5. Boss" },
];

const SPEECH_RATES = [
  { label: "0.75x", value: 0.75 },
  { label: "0.9x", value: 0.9 },
  { label: "1.05x", value: 1.05 },
];

export const ChapterModal: React.FC<ChapterModalProps> = ({
  chapter,
  allChapters,
  state,
  initialStage,
  onClose,
  onMarkPembukaDone,
  onMarkPenjelasanDone,
  onRecordPracticeOutcome,
  onRecordQuizOutcome,
  onRecordBossStep,
  onChangeSpeechRate,
  onRecoverEnergy,
  onAwardDynamicXp,
  onResolveReviewOutcome,
}) => {
  const [stage, setStage] = useState<ChapterStageId>(initialStage);
  const [dialogIdx, setDialogIdx] = useState(0);
  const [selectedTerm, setSelectedTerm] = useState<TappableTerm | null>(
    chapter.penjelasan.tappableTerms[0] ?? null,
  );
  const [showCheatSheet, setShowCheatSheet] = useState(false);
  const [showQuickRecap, setShowQuickRecap] = useState(false);
  const [showToneLab, setShowToneLab] = useState(chapter.id === "bab1");
  const [showPinyin, setShowPinyin] = useState(true);
  const [dynamicRewardNote, setDynamicRewardNote] = useState("");
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);

  const initialCp = getChapterProgress(state, chapter.id);
  const firstPendingLatihan = chapter.latihan.findIndex(
    (t) => !initialCp.latihanDoneIds.includes(t.id),
  );
  const firstPendingQuiz = chapter.kuis.findIndex(
    (q) => initialCp.kuisResults[q.id] !== true,
  );
  const firstPendingBoss = chapter.boss.steps.findIndex(
    (s) => initialCp.bossResults?.[s.id] !== true,
  );

  const [latihanIdx, setLatihanIdx] = useState(
    firstPendingLatihan >= 0 ? firstPendingLatihan : 0,
  );
  const [quizIdx, setQuizIdx] = useState(firstPendingQuiz >= 0 ? firstPendingQuiz : 0);
  const [bossIdx, setBossIdx] = useState(firstPendingBoss >= 0 ? firstPendingBoss : 0);

  // Dynamic practice generator & soft energy recovery drill
  const [showDynamicDrill, setShowDynamicDrill] = useState(false);
  const [dynamicTask, setDynamicTask] = useState<DynamicGeneratedQuestion>(() =>
    generateDynamicPracticeTask(chapter.id),
  );
  const [energyBreakTask, setEnergyBreakTask] = useState<DynamicGeneratedQuestion>(() =>
    generateDynamicPracticeTask(chapter.id),
  );

  // Living teacher speaking + feedback reaction state
  const [isTeacherSpeaking, setIsTeacherSpeaking] = useState(false);
  const [coachReaction, setCoachReaction] = useState<{
    mood: TeacherMood;
    text: string;
  } | null>(null);
  const [typedCoachText, setTypedCoachText] = useState("");

  useEffect(() => {
    return () => {
      stopSpeaking();
    };
  }, []);

  useEffect(() => {
    const previousFocus = document.activeElement;
    titleRef.current?.focus();
    return () => {
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) {
        previousFocus.focus();
      }
    };
  }, []);

  const cp = getChapterProgress(state, chapter.id);
  const standing = getAdaptiveStanding(state);
  const allowHints = state.mode === "belajar";
  const timedSeconds = state.mode === "tantangan" ? 35 : undefined;
  const needsEnergyBreak =
    state.mode === "tantangan" &&
    state.energy <= 0 &&
    (stage === "latihan" || stage === "kuis" || stage === "boss");

  const currentScreen = chapter.penjelasan.screens[dialogIdx] ?? chapter.penjelasan.screens[0];
  const currentLatihan = chapter.latihan[latihanIdx];
  const currentQuiz = chapter.kuis[quizIdx];
  const currentBossStep = chapter.boss.steps[bossIdx];

  // Due spaced-repetition review questions from earlier chapters
  const dueReviewQuestion = useMemo(() => {
    const sourceChapters = allChapters ?? [chapter];
    const orderMap = Object.fromEntries(sourceChapters.map((c) => [c.id, c.order]));
    const dueItems = getDueReviewItemsForChapter(state, chapter.id, orderMap).filter(
      (item) => item.chapterId !== chapter.id,
    );
    if (dueItems.length === 0) return null;
    for (const item of dueItems) {
      for (const ch of sourceChapters) {
        const found = ch.kuis.find((q) => q.id === item.questionId);
        if (found) return { item, question: found };
      }
    }
    return null;
  }, [allChapters, chapter, state]);

  const [dismissedReviewId, setDismissedReviewId] = useState<string | null>(null);
  const activeReviewWarmup =
    stage === "kuis" &&
    dueReviewQuestion &&
    dismissedReviewId !== dueReviewQuestion.question.id
      ? dueReviewQuestion
      : null;

  // Determine default teacher coaching script per stage
  const defaultCoachLine = useMemo(() => {
    if (needsEnergyBreak) {
      return {
        mood: "encouraging" as TeacherMood,
        text: "Energi tantanganmu habis! Tarik napas dulu, jawab 1 soal pemanasan santai ini untuk memulihkan +2 energi.",
      };
    }
    if (stage === "pembuka") {
      return {
        mood: "explaining" as TeacherMood,
        text: `Selamat datang di Bab ${chapter.order}! Baca tantangan situasi dulu sebelum kita bedah rumusnya bersama.`,
      };
    }
    if (stage === "penjelasan") {
      return {
        mood: standing === "butuh_bimbingan" ? ("encouraging" as TeacherMood) : ("explaining" as TeacherMood),
        text: `${currentScreen.title}: ${currentScreen.sentences[0]} Ketuk tombol suara agar telingamu terbiasa dengan nadanya.`,
      };
    }
    if (stage === "latihan") {
      if (showDynamicDrill) {
        return {
          mood: "thinking" as TeacherMood,
          text: "Ini soal acak dinamis! Kerjakan tanpa menghafal urutan jawaban. Bonus XP tersedia untuk 3 jawaban benar pertama setiap hari.",
        };
      }
      return {
        mood: "explaining" as TeacherMood,
        text: `Sekarang kita praktik nyata (${latihanIdx + 1}/${chapter.latihan.length}). Gunakan Petunjuk Bertingkat kalau kamu butuh arahan.`,
      };
    }
    if (stage === "kuis") {
      if (activeReviewWarmup) {
        return {
          mood: "encouraging" as TeacherMood,
          text: `Sebelum Kuis Bab ${chapter.order}, mari segarkan ingatan tentang soal dari ${activeReviewWarmup.item.chapterId.toUpperCase()} yang sempat keliru.`,
        };
      }
      return {
        mood: "thinking" as TeacherMood,
        text: `Waktunya 5 soal Kuis Bab ${chapter.order}. Fokus pada makna kalimat dan nada Mandarin-nya!`,
      };
    }
    return {
      mood: "thinking" as TeacherMood,
      text: `Tantangan Boss Bab ${chapter.order}! Selesaikan setiap langkah dengan tepat untuk menguasai bab ini.`,
    };
  }, [
    needsEnergyBreak,
    stage,
    chapter.order,
    standing,
    currentScreen.title,
    currentScreen.sentences,
    showDynamicDrill,
    latihanIdx,
    chapter.latihan.length,
    activeReviewWarmup,
  ]);

  const activeCoach = coachReaction ?? defaultCoachLine;
  const activeMood: TeacherMood = isTeacherSpeaking ? "speaking" : activeCoach.mood;

  // Typewriter reveal for living teacher line
  useEffect(() => {
    const fullText = activeCoach.text;
    setTypedCoachText("");
    let idx = 0;
    const timer = window.setInterval(() => {
      idx += 4;
      if (idx >= fullText.length) {
        setTypedCoachText(fullText);
        window.clearInterval(timer);
      } else {
        setTypedCoachText(fullText.slice(0, idx));
      }
    }, 14);
    return () => window.clearInterval(timer);
  }, [activeCoach.text]);

  // Clear temporary reaction when changing stage or screen
  useEffect(() => {
    setCoachReaction(null);
  }, [stage, dialogIdx, latihanIdx, quizIdx, bossIdx, showDynamicDrill]);

  const speakWithTeacher = (text: string) => {
    speakMandarin(text, {
      muted: state.muted,
      rate: state.speechRate,
      naturalTts: state.naturalTtsEnabled,
      onStart: () => setIsTeacherSpeaking(true),
      onEnd: () => setIsTeacherSpeaking(false),
    });
  };

  const currentSpeakTarget = useMemo(() => {
    if (stage === "penjelasan" && currentScreen.example) return currentScreen.example.hanzi;
    if (stage === "latihan" && currentLatihan) {
      return currentLatihan.audioText || currentLatihan.hanzi || chapter.penjelasan.tappableTerms[0]?.hanzi || "";
    }
    if (stage === "kuis" && currentQuiz) {
      return currentQuiz.hanzi || chapter.penjelasan.tappableTerms[0]?.hanzi || "";
    }
    if (stage === "boss" && currentBossStep) {
      return currentBossStep.audioText || currentBossStep.hanzi || "";
    }
    return chapter.penjelasan.tappableTerms[0]?.hanzi || "你好";
  }, [stage, currentScreen, currentLatihan, currentQuiz, currentBossStep, chapter]);

  const practiceToUnified = (t: typeof currentLatihan): UnifiedQuestion => ({
    id: `${chapter.id}_${t.id}`,
    kind:
      t.kind === "order"
        ? "order"
        : t.kind === "polite_rewrite" && !t.options
          ? "short_fill"
          : "mcq",
    topic: t.topic,
    prompt: t.prompt,
    hanzi: t.hanzi,
    pinyin: t.pinyin,
    audioText: t.audioText,
    dialogue: t.dialogue,
    options: t.options,
    tokens: t.tokens,
    placeholder: t.placeholder,
    acceptedAnswers: t.acceptedAnswers,
    answer: t.answer,
    hints: t.hints,
    explain: t.explain,
    source: t.source,
    isTambahan: t.isTambahan,
  });

  const dynamicToUnified = (d: DynamicGeneratedQuestion): UnifiedQuestion => ({
    id: d.id,
    kind: d.kind,
    topic: d.topic,
    prompt: d.prompt,
    hanzi: d.hanzi,
    pinyin: d.pinyin,
    audioText: d.audioText,
    options: d.options,
    tokens: d.tokens,
    placeholder: d.placeholder,
    acceptedAnswers: d.acceptedAnswers,
    answer: d.answer,
    hints: d.hints,
    explain: d.explain,
    source: d.source,
    isTambahan: d.isTambahan,
  });

  const bossToUnified = (b: typeof currentBossStep): UnifiedQuestion => ({
    id: `${chapter.id}_${b.id}`,
    kind: b.kind,
    topic: b.stepTitle,
    prompt: b.situation,
    hanzi: b.hanzi,
    pinyin: b.pinyin,
    audioText: b.audioText,
    options: b.options,
    tokens: b.tokens,
    answer: b.answer,
    hints: b.hints,
    explain: b.explain,
    source: b.source,
  });

  const handleTeacherFeedback = (isCorrect: boolean) => {
    setCoachReaction(
      isCorrect
        ? {
            mood: "happy",
            text: "Bagus sekali! Pelafalan dan struktur kalimatmu sudah tepat. Ayo lanjutkan!",
          }
        : {
            mood: "encouraging",
            text: "Tidak apa-apa! Baca alasan koreksinya bersama saya — kesalahan ini membuat ingatanmu makin tajam.",
          },
    );
  };

  return (
    <div
      ref={dialogRef}
      className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/65 p-2 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="chapter-modal-title"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          onClose();
          return;
        }
        if (event.key !== "Tab") return;
        const focusable = Array.from(
          event.currentTarget.querySelectorAll<HTMLElement>(
            'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
          ),
        ).filter((element) => element.getClientRects().length > 0);
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (!first || !last) {
          event.preventDefault();
          return;
        }
        const active = document.activeElement;
        if (!(active instanceof HTMLElement) || !focusable.includes(active)) {
          event.preventDefault();
          (event.shiftKey ? last : first).focus();
        } else if (event.shiftKey && active === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && active === last) {
          event.preventDefault();
          first.focus();
        }
      }}
    >
      <div className="flex max-h-[94dvh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-300 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900">
        {/* Top Modal Header */}
        <div className="flex items-start justify-between gap-2 border-b border-slate-200 px-4 py-3 dark:border-slate-800 sm:px-6">
          <div className="min-w-0">
            <div className="text-[11px] font-bold uppercase tracking-wider text-blue-700 dark:text-blue-400">
              Bab {chapter.order} · {chapter.npcName}
            </div>
            <h2
              ref={titleRef}
              id="chapter-modal-title"
              tabIndex={-1}
              className="text-base font-extrabold leading-snug text-slate-900 outline-none dark:text-white sm:text-lg"
            >
              {chapter.title}
            </h2>
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            {state.consecutiveCorrect >= 2 && (
              <span className="font-mono-num hidden rounded-lg border border-amber-300 bg-amber-50 px-2 py-1 text-xs font-extrabold text-amber-800 dark:border-amber-700 dark:bg-amber-950/60 dark:text-amber-200 sm:inline-flex">
                Kombo {state.consecutiveCorrect}x
              </span>
            )}
            <button
              type="button"
              onClick={() => setShowPinyin((v) => !v)}
              aria-label={showPinyin ? "Sembunyikan Pinyin" : "Tampilkan Pinyin"}
              aria-pressed={showPinyin}
              title="Tampilkan / Sembunyikan Pinyin pada latihan"
              className={`inline-flex h-9 items-center gap-1 rounded-lg border px-2 text-xs font-bold transition ${
                !showPinyin
                  ? "border-amber-600 bg-amber-600 text-white"
                  : "border-slate-300 bg-slate-50 text-slate-800 hover:border-blue-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              }`}
            >
              {showPinyin ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
              <span className="hidden sm:inline">{showPinyin ? "Pinyin On" : "Pinyin Off"}</span>
            </button>

            <button
              type="button"
              onClick={() => setShowCheatSheet((v) => !v)}
              aria-expanded={showCheatSheet}
              aria-controls="chapter-cheat-sheet"
              className={`inline-flex h-9 items-center gap-1 rounded-lg border px-2.5 text-xs font-bold transition ${
                showCheatSheet
                  ? "border-blue-700 bg-blue-700 text-white"
                  : "border-slate-300 bg-slate-50 text-slate-800 hover:border-blue-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              }`}
            >
              <FileText className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Kartu Contekan</span>
              <span className="sm:hidden">Contekan</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              aria-label="Tutup Bab"
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* 5-Stage Sequential Stepper Bar */}
        <nav
          aria-label="Tahapan belajar bab"
          className="custom-scroll flex items-center gap-1.5 overflow-x-auto border-b border-slate-200 bg-slate-50 px-4 py-2 dark:border-slate-800 dark:bg-slate-950/60 sm:px-6"
        >
          {STAGES.map((st) => {
            const active = stage === st.id;
            const unlocked = isStageUnlocked(cp, chapter, st.id);
            const done =
              (st.id === "pembuka" && cp.pembukaDone) ||
              (st.id === "penjelasan" && cp.penjelasanDone) ||
              (st.id === "latihan" && isPracticeComplete(cp, chapter)) ||
              (st.id === "kuis" && isQuizMastered(cp, chapter)) ||
              (st.id === "boss" && isBossMastered(cp, chapter));

            return (
              <button
                key={st.id}
                type="button"
                aria-disabled={!unlocked}
                aria-current={active ? "step" : undefined}
                aria-label={`${st.label}${!unlocked ? ", terkunci" : done ? ", selesai" : ""}`}
                data-testid={`stage-tab-${st.id}`}
                title={!unlocked ? "Selesaikan tahap sebelumnya untuk membuka" : st.label}
                onClick={() => unlocked && setStage(st.id)}
                className={`inline-flex min-h-[36px] shrink-0 items-center gap-1.5 rounded-lg border px-3 py-1 text-xs font-bold transition ${
                  active
                    ? "border-blue-700 bg-blue-700 text-white"
                    : !unlocked
                      ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-600"
                      : done
                        ? "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-200"
                        : "border-slate-200 bg-white text-slate-700 hover:border-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                }`}
              >
                {!unlocked ? (
                  <Lock className="h-3 w-3" />
                ) : done && !active ? (
                  <CheckCircle2 className="h-3.5 w-3.5" />
                ) : null}
                {st.label}
              </button>
            );
          })}
        </nav>

        {/* Living Teacher Coach Strip */}
        <div
          data-testid="living-teacher-panel"
          className="flex items-start gap-3 border-b border-slate-200 bg-sky-50/80 px-4 py-2.5 dark:border-slate-800 dark:bg-slate-800/70 sm:px-6"
        >
          <TeacherAvatar
            mood={activeMood}
            isSpeaking={isTeacherSpeaking}
            size="sm"
            speakerName={chapter.npcName}
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center justify-between gap-1.5">
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-blue-800 dark:text-blue-300">
                {chapter.npcName} · {chapter.npcRole}
              </span>
              <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Kecepatan suara">
                {onChangeSpeechRate &&
                  SPEECH_RATES.map((sr) => (
                    <button
                      key={sr.value}
                      type="button"
                      onClick={() => onChangeSpeechRate(sr.value)}
                      aria-pressed={Math.abs(state.speechRate - sr.value) < 0.04}
                      aria-label={`Kecepatan suara ${sr.label}`}
                      className={`rounded px-1.5 py-0.5 text-[10px] font-extrabold transition ${
                        Math.abs(state.speechRate - sr.value) < 0.04
                          ? "bg-blue-700 text-white"
                          : "bg-white text-slate-600 hover:bg-slate-200 dark:bg-slate-900 dark:text-slate-300"
                      }`}
                    >
                      {sr.label}
                    </button>
                  ))}
                <button
                  type="button"
                  data-testid="teacher-speak-btn"
                  onClick={() => speakWithTeacher(currentSpeakTarget)}
                  className="inline-flex items-center gap-1 rounded-md bg-emerald-700 px-2 py-0.5 text-[11px] font-bold text-white hover:bg-emerald-800"
                >
                  <Volume2 className="h-3 w-3" />
                  Dengarkan
                </button>
              </div>
            </div>
            <p className="mt-1 text-xs font-medium leading-relaxed text-slate-800 dark:text-slate-100 sm:text-sm">
              {typedCoachText || activeCoach.text}
            </p>
          </div>
        </div>

        {/* Adaptive Hint Banner */}
        {(standing === "butuh_bimbingan" || standing === "mantap") && (
          <div
            className={`flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2 text-xs font-semibold sm:px-6 ${
              standing === "butuh_bimbingan"
                ? "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-200"
                : "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200"
            }`}
          >
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 shrink-0" />
              <span>
                {standing === "butuh_bimbingan"
                  ? "Mode Adaptif Dibimbing: Kamu salah 2x beruntun—gunakan Ringkasan Kilat atau Kartu Contekan di bawah."
                  : "Mode Adaptif Naik Tingkat: Kamu menjawab 3x benar beruntun! Coba sembunyikan Pinyin atau tantang soal acak."}
              </span>
            </div>
            {standing === "butuh_bimbingan" && chapter.penjelasan.simplifiedRecap && (
              <button
                type="button"
                onClick={() => setShowQuickRecap((v) => !v)}
                className="rounded-md border border-amber-400 bg-white px-2.5 py-1 text-[11px] font-extrabold text-amber-900 dark:border-amber-700 dark:bg-slate-900 dark:text-amber-200"
              >
                {showQuickRecap ? "Tutup Ringkasan" : "Ringkasan Kilat"}
              </button>
            )}
          </div>
        )}

        {/* Main Scrollable Stage Content */}
        <div className="custom-scroll flex-1 overflow-y-auto p-4 sm:p-6">
          {/* Quick Simplified Recap Card (shown automatically in Penjelasan if butuh_bimbingan or toggled) */}
          {(showQuickRecap || (standing === "butuh_bimbingan" && stage === "penjelasan")) &&
            chapter.penjelasan.simplifiedRecap && (
              <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50/90 p-3.5 text-xs sm:text-sm dark:border-amber-700 dark:bg-amber-950/40">
                <div className="font-extrabold text-amber-900 dark:text-amber-200">
                  Ringkasan Kilat Lǎoshī Lín (Versi Sederhana)
                </div>
                <p className="mt-1 leading-relaxed text-amber-950 dark:text-amber-100">
                  {chapter.penjelasan.simplifiedRecap}
                </p>
              </div>
            )}

          {/* Kartu Contekan Pop-in */}
          {showCheatSheet && (
            <div id="chapter-cheat-sheet" className="mb-5 rounded-xl border border-blue-300 bg-blue-50/90 p-4 dark:border-blue-800 dark:bg-blue-950/50">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-extrabold text-blue-950 dark:text-blue-100">
                  {chapter.penjelasan.cheatSheet.title}
                </h3>
                <button
                  type="button"
                  onClick={() => setShowCheatSheet(false)}
                  className="text-xs font-bold text-blue-700 underline dark:text-blue-300"
                >
                  Tutup
                </button>
              </div>
              <div className="mt-2.5 grid gap-2 sm:grid-cols-2">
                {chapter.penjelasan.cheatSheet.formulas.map((f, idx) => (
                  <div
                    key={idx}
                    className="rounded-lg border border-blue-200 bg-white p-2.5 text-xs dark:border-blue-800 dark:bg-slate-900"
                  >
                    <div className="font-extrabold text-slate-900 dark:text-white">{f.pattern}</div>
                    <div className="text-slate-600 dark:text-slate-400">{f.usage}</div>
                    <div className="hanzi-text mt-1 font-bold text-blue-800 dark:text-blue-300">
                      {f.example}
                    </div>
                  </div>
                ))}
              </div>
              <ul className="mt-2.5 list-disc space-y-1 pl-4 text-xs text-slate-700 dark:text-slate-300">
                {chapter.penjelasan.cheatSheet.quickPitfalls.map((p, idx) => (
                  <li key={idx}>{p}</li>
                ))}
              </ul>
              <div className="mt-2 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                Sumber: {chapter.penjelasan.cheatSheet.source}
              </div>
            </div>
          )}

          {/* SOFT ENERGY RECOVERY BREAK (Zero Hard Game Over) */}
          {needsEnergyBreak ? (
            <div
              data-testid="energy-break-panel"
              className="space-y-4 rounded-2xl border border-amber-300 bg-amber-50/80 p-4 dark:border-amber-700 dark:bg-amber-950/40"
            >
              <div className="flex items-center gap-2 text-sm font-extrabold text-amber-900 dark:text-amber-200">
                <Coffee className="h-5 w-5" />
                Istirahat Teh Kampus · Pulihkan +2 Energi
              </div>
              <p className="text-xs leading-relaxed text-amber-950 dark:text-amber-100 sm:text-sm">
                Energi Tantanganmu habis (0/5). Jawab 1 soal pemanasan ringan ini untuk mengisi kembali 2 energi dan melanjutkan tanpa mengulang bab!
              </p>
              <QuestionRenderer
                key={energyBreakTask.id}
                question={dynamicToUnified(energyBreakTask)}
                allowHints={true}
                muted={state.muted}
                speechRate={state.speechRate}
                showPinyin={showPinyin}
                naturalTtsEnabled={state.naturalTtsEnabled}
                allowRetryOnWrong={true}
                onSpeakingChange={setIsTeacherSpeaking}
                onEvaluated={({ isCorrect }) => {
                  handleTeacherFeedback(isCorrect);
                }}
                onNext={() => {
                  onRecoverEnergy?.();
                  setEnergyBreakTask(generateDynamicPracticeTask(chapter.id));
                }}
                nextLabel="Klaim +2 Energi & Lanjut Belajar"
              />
            </div>
          ) : (
            <>
              {/* STAGE 1: PEMBUKA */}
              {stage === "pembuka" && (
                <div className="space-y-4">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/70">
                    <div className="text-xs font-extrabold uppercase tracking-wider text-blue-700 dark:text-blue-400">
                      Situasi Lapangan
                    </div>
                    <h3 className="mt-1 text-lg font-extrabold text-slate-900 dark:text-white">
                      {chapter.pembuka.sceneTitle}
                    </h3>
                    <p className="mt-2 text-sm leading-relaxed text-slate-700 dark:text-slate-200">
                      {chapter.pembuka.storyHook}
                    </p>
                  </div>

                  <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-700/70 dark:bg-amber-950/40">
                    <div className="text-xs font-extrabold uppercase tracking-wider text-amber-800 dark:text-amber-300">
                      Masalah yang Harus Dipecahkan
                    </div>
                    <p className="mt-1 text-sm font-medium leading-relaxed text-amber-950 dark:text-amber-100">
                      {chapter.pembuka.challengePrompt}
                    </p>
                  </div>

                  <p className="text-sm text-slate-700 dark:text-slate-300">
                    <strong>Target Bab Ini:</strong> {chapter.pembuka.goalSummary}
                  </p>
                  <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                    Sumber Kurikulum: {chapter.pembuka.source}
                  </p>

                  <div className="pt-2">
                    <button
                      type="button"
                      data-testid="goto-penjelasan-btn"
                      onClick={() => {
                        onMarkPembukaDone(chapter.id);
                        setStage("penjelasan");
                      }}
                      className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-blue-700 px-5 py-2.5 text-sm font-extrabold text-white hover:bg-blue-800"
                    >
                      Masuk Penjelasan Materi
                      <ArrowRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              )}

              {/* STAGE 2: PENJELASAN */}
              {stage === "penjelasan" && (
                <div className="space-y-5">
                  {/* Stepped Dialog Screen (<= 4 short sentences) */}
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/70">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-extrabold text-blue-700 dark:text-blue-400">
                        {currentScreen.speaker} · Layar {dialogIdx + 1}/{chapter.penjelasan.screens.length}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          disabled={dialogIdx === 0}
                          onClick={() => setDialogIdx((i) => Math.max(0, i - 1))}
                          aria-label="Penjelasan Sebelumnya"
                          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-700 disabled:opacity-40 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
                        >
                          <ArrowLeft className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          disabled={dialogIdx >= chapter.penjelasan.screens.length - 1}
                          onClick={() =>
                            setDialogIdx((i) => Math.min(chapter.penjelasan.screens.length - 1, i + 1))
                          }
                          aria-label="Penjelasan Berikutnya"
                          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-700 disabled:opacity-40 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
                        >
                          <ArrowRight className="h-4 w-4" />
                        </button>
                      </div>
                    </div>

                    <h3 className="mt-2 text-base font-extrabold text-slate-900 dark:text-white">
                      {currentScreen.title}
                    </h3>

                    <ul className="mt-2 space-y-1.5 text-sm leading-relaxed text-slate-700 dark:text-slate-200">
                      {currentScreen.sentences.map((s, idx) => (
                        <li key={idx}>• {s}</li>
                      ))}
                    </ul>

                    {currentScreen.example && (
                      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
                        <div>
                          <div className="hanzi-text text-lg font-extrabold text-slate-900 dark:text-white">
                            {currentScreen.example.hanzi}
                          </div>
                          <div className="text-xs font-medium text-slate-600 dark:text-slate-300">
                            {currentScreen.example.pinyin} — {currentScreen.example.meaning}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => speakWithTeacher(currentScreen.example!.hanzi)}
                          className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-800"
                        >
                          <Volume2 className="h-4 w-4" />
                          Dengar
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Interactive 4-Tone Pitch Contour Lab */}
                  {chapter.id !== "bab1" && (
                    <div>
                      <button
                        type="button"
                        onClick={() => setShowToneLab((v) => !v)}
                        className="text-xs font-extrabold text-blue-700 underline dark:text-blue-400"
                      >
                        {showToneLab ? "Sembunyikan Lab 4 Nada" : "Buka Lab Visual 4 Nada Mandarin"}
                      </button>
                    </div>
                  )}
                  {showToneLab && (
                    <ToneContourExplorer onSpeakTone={(sample) => speakWithTeacher(sample)} />
                  )}

                  {/* Tappable Difficult Terms */}
                  <div>
                    <div className="mb-2 flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                      <BookOpen className="h-3.5 w-3.5" />
                      Istilah Penting (Ketuk untuk melihat arti &amp; sumber)
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {chapter.penjelasan.tappableTerms.map((term) => {
                        const active = selectedTerm?.hanzi === term.hanzi;
                        return (
                          <button
                            key={term.hanzi}
                            type="button"
                            onClick={() => {
                              setSelectedTerm(term);
                              speakWithTeacher(term.hanzi);
                            }}
                            className={`hanzi-text min-h-[40px] rounded-xl border px-3 py-1.5 text-sm font-bold transition ${
                              active
                                ? "border-blue-700 bg-blue-700 text-white"
                                : "border-slate-300 bg-white text-slate-900 hover:border-blue-600 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                            }`}
                          >
                            {term.hanzi}
                          </button>
                        );
                      })}
                    </div>

                    {selectedTerm && (
                      <div className="mt-2.5 rounded-xl border border-slate-200 bg-white p-3 text-xs sm:text-sm dark:border-slate-700 dark:bg-slate-800">
                        <div className="font-extrabold text-slate-900 dark:text-white">
                          <span className="hanzi-text mr-2">{selectedTerm.hanzi}</span>
                          <span className="text-blue-700 dark:text-blue-400">({selectedTerm.pinyin})</span>{" "}
                          — {selectedTerm.meaning}
                        </div>
                        <p className="mt-1 text-slate-700 dark:text-slate-300">{selectedTerm.note}</p>
                        <p className="mt-1 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                          Sumber: {selectedTerm.source}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Visual Material Board */}
                  <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
                    <div className="bg-slate-100 px-3.5 py-2 text-xs font-extrabold text-slate-800 dark:bg-slate-800 dark:text-slate-100">
                      {chapter.penjelasan.visualBoard.title}
                    </div>
                    <table className="w-full text-left text-xs sm:text-sm">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                          <th className="px-3 py-2 font-bold">{chapter.penjelasan.visualBoard.headers[0]}</th>
                          <th className="px-3 py-2 font-bold">{chapter.penjelasan.visualBoard.headers[1]}</th>
                          <th className="px-3 py-2 font-bold">{chapter.penjelasan.visualBoard.headers[2]}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {chapter.penjelasan.visualBoard.rows.map((r, i) => (
                          <tr
                            key={i}
                            className="border-b border-slate-100 last:border-0 dark:border-slate-800"
                          >
                            <td className="px-3 py-2 font-semibold text-slate-900 dark:text-white">{r.col1}</td>
                            <td className="hanzi-text px-3 py-2 font-bold text-blue-800 dark:text-blue-300">
                              {r.col2}
                            </td>
                            <td className="px-3 py-2 text-slate-700 dark:text-slate-300">{r.col3}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {chapter.penjelasan.visualBoard.tambahanNote && (
                      <div className="border-t border-amber-200 bg-amber-50 px-3.5 py-2 text-xs font-medium text-amber-900 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-200">
                        {chapter.penjelasan.visualBoard.tambahanNote}
                      </div>
                    )}
                  </div>

                  <div className="flex justify-end pt-1">
                    <button
                      type="button"
                      data-testid="goto-latihan-btn"
                      onClick={() => {
                        onMarkPenjelasanDone(chapter.id);
                        setStage("latihan");
                      }}
                      className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-blue-700 px-5 py-2.5 text-sm font-extrabold text-white hover:bg-blue-800"
                    >
                      Lanjut ke Latihan Nyata
                      <ArrowRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              )}

              {/* STAGE 3: LATIHAN NYATA + RANDOM DYNAMIC GENERATOR */}
              {stage === "latihan" && currentLatihan && (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-bold text-slate-500 dark:text-slate-400">
                    <span>
                      {showDynamicDrill
                        ? "Tantangan Acak Dinamis (Latihan Konteks Berubah-ubah)"
                        : `Misi Latihan ${latihanIdx + 1} dari ${chapter.latihan.length} · Selesai ${cp.latihanDoneIds.length}/${chapter.latihan.length}`}
                    </span>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        data-testid="toggle-dynamic-drill-btn"
                        onClick={() => {
                          setShowDynamicDrill((v) => !v);
                          setDynamicTask(generateDynamicPracticeTask(chapter.id));
                          setDynamicRewardNote("");
                        }}
                        className={`inline-flex min-h-[32px] items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-bold transition ${
                          showDynamicDrill
                            ? "border-purple-600 bg-purple-700 text-white"
                            : "border-purple-300 bg-purple-50 text-purple-900 hover:bg-purple-100 dark:border-purple-700 dark:bg-purple-950/50 dark:text-purple-200"
                        }`}
                      >
                        <Sparkles className="h-3.5 w-3.5" />
                        {showDynamicDrill ? "Kembali ke Misi Pokok" : "Soal Acak Dinamis"}
                      </button>
                    </div>
                  </div>

                  {showDynamicDrill ? (
                    <div className="space-y-3 rounded-xl border border-purple-200 bg-purple-50/40 p-4 dark:border-purple-800 dark:bg-purple-950/20">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-extrabold uppercase text-purple-800 dark:text-purple-300">
                          Generator Latihan Acak · Bab {chapter.order}
                        </span>
                        <button
                          type="button"
                          data-testid="new-dynamic-question-btn"
                          onClick={() => {
                            setDynamicTask(generateDynamicPracticeTask(chapter.id));
                            setDynamicRewardNote("");
                          }}
                          className="inline-flex items-center gap-1 rounded-lg border border-purple-300 bg-white px-2.5 py-1 text-xs font-bold text-purple-900 hover:bg-purple-100 dark:border-purple-700 dark:bg-slate-900 dark:text-purple-200"
                        >
                          <RefreshCw className="h-3 w-3" />
                          Acak Soal Baru
                        </button>
                      </div>

                      <QuestionRenderer
                        key={dynamicTask.id}
                        question={dynamicToUnified(dynamicTask)}
                        allowHints={allowHints}
                        muted={state.muted}
                        speechRate={state.speechRate}
                        showPinyin={showPinyin}
                        naturalTtsEnabled={state.naturalTtsEnabled}
                        allowRetryOnWrong={true}
                        onSpeakingChange={setIsTeacherSpeaking}
                        onEvaluated={({ isCorrect }) => {
                          handleTeacherFeedback(isCorrect);
                          if (isCorrect) {
                            const xp = onAwardDynamicXp?.(15) ?? 0;
                            setDynamicRewardNote(
                              xp > 0
                                ? `Benar! +${xp} XP.`
                                : "Benar! Bonus 3 soal acak hari ini sudah tercapai; latihan tetap dilanjutkan.",
                            );
                          }
                        }}
                        onNext={() => {
                          setDynamicTask(generateDynamicPracticeTask(chapter.id));
                          setDynamicRewardNote("");
                        }}
                        nextLabel="Buat Soal Acak Berikutnya"
                      />
                      {dynamicRewardNote && (
                        <p role="status" className="text-xs font-bold text-purple-900 dark:text-purple-200">
                          {dynamicRewardNote}
                        </p>
                      )}
                    </div>
                  ) : (
                    <QuestionRenderer
                      key={`${chapter.id}_${currentLatihan.id}`}
                      question={practiceToUnified(currentLatihan)}
                      allowHints={allowHints}
                      muted={state.muted}
                      speechRate={state.speechRate}
                      timedSeconds={timedSeconds}
                      showPinyin={showPinyin}
                      naturalTtsEnabled={state.naturalTtsEnabled}
                      allowRetryOnWrong={true}
                      onSpeakingChange={setIsTeacherSpeaking}
                      onEvaluated={({ isCorrect, hintLevelUsed }) => {
                        handleTeacherFeedback(isCorrect);
                        onRecordPracticeOutcome(
                          chapter.id,
                          currentLatihan.id,
                          currentLatihan.conceptTag,
                          currentLatihan.topic,
                          isCorrect,
                          hintLevelUsed,
                        );
                      }}
                      onNext={() => {
                        if (!isPracticeComplete(cp, chapter)) {
                          const firstIncomplete = chapter.latihan.findIndex(
                            (task) => !cp.latihanDoneIds.includes(task.id),
                          );
                          if (firstIncomplete >= 0) setLatihanIdx(firstIncomplete);
                          return;
                        }
                        if (latihanIdx + 1 < chapter.latihan.length) {
                          setLatihanIdx((i) => i + 1);
                        } else {
                          setStage("kuis");
                        }
                      }}
                      nextLabel={
                        latihanIdx + 1 < chapter.latihan.length
                          ? "Misi Latihan Berikutnya"
                          : "Masuk Tahap Kuis (5 Soal)"
                      }
                    />
                  )}
                </div>
              )}

              {/* STAGE 4: KUIS + SPACED REPETITION INJECTION */}
              {stage === "kuis" && (
                <div className="space-y-4">
                  {/* Variant retries do not emit outcomes; graded review and quiz use canonical retries. */}
                  {activeReviewWarmup ? (
                    <div
                      data-testid="spaced-repetition-warmup"
                      className="space-y-3 rounded-xl border border-rose-300 bg-rose-50/70 p-4 dark:border-rose-800 dark:bg-rose-950/30"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xs font-extrabold uppercase tracking-wider text-rose-800 dark:text-rose-300">
                          Pengulangan Berjarak Otomatis · Dari {activeReviewWarmup.item.chapterId.toUpperCase()}
                        </span>
                        <button
                          type="button"
                          onClick={() => setDismissedReviewId(activeReviewWarmup.question.id)}
                          className="text-xs font-bold text-slate-600 underline dark:text-slate-300"
                        >
                          Lewati ke Kuis Bab {chapter.order}
                        </button>
                      </div>

                      <QuestionRenderer
                        key={activeReviewWarmup.question.id}
                        question={{ ...activeReviewWarmup.question, variant: undefined }}
                        allowHints={true}
                        muted={state.muted}
                        speechRate={state.speechRate}
                        showPinyin={showPinyin}
                        naturalTtsEnabled={state.naturalTtsEnabled}
                        allowRetryOnWrong={true}
                        onSpeakingChange={setIsTeacherSpeaking}
                        onEvaluated={({ isCorrect, hintLevelUsed }) => {
                          handleTeacherFeedback(isCorrect);
                          onResolveReviewOutcome?.(
                            activeReviewWarmup.question,
                            isCorrect,
                            hintLevelUsed,
                          );
                        }}
                        onNext={() => setDismissedReviewId(activeReviewWarmup.question.id)}
                        nextLabel={`Lanjut ke Kuis Bab ${chapter.order}`}
                      />
                    </div>
                  ) : currentQuiz ? (
                    <>
                      <div className="flex items-center justify-between text-xs font-bold text-slate-500 dark:text-slate-400">
                        <span>
                          Soal Kuis {quizIdx + 1} dari {chapter.kuis.length} ({currentQuiz.kind.toUpperCase()})
                        </span>
                        <span>
                          Benar: {getQuizCorrectCount(cp, chapter)}/{chapter.kuis.length}
                        </span>
                      </div>

                      <QuestionRenderer
                        key={currentQuiz.id}
                        question={{ ...currentQuiz, variant: undefined }}
                        allowHints={allowHints}
                        muted={state.muted}
                        speechRate={state.speechRate}
                        timedSeconds={timedSeconds}
                        showPinyin={showPinyin}
                        naturalTtsEnabled={state.naturalTtsEnabled}
                        allowRetryOnWrong={true}
                        onSpeakingChange={setIsTeacherSpeaking}
                        onEvaluated={({ isCorrect, hintLevelUsed }) => {
                          handleTeacherFeedback(isCorrect);
                          onRecordQuizOutcome(
                            chapter.id,
                            currentQuiz.id,
                            currentQuiz.conceptTag,
                            currentQuiz.topic,
                            isCorrect,
                            hintLevelUsed,
                          );
                        }}
                        onNext={() => {
                          if (!isQuizMastered(cp, chapter)) {
                            const firstIncorrect = chapter.kuis.findIndex(
                              (question) => cp.kuisResults[question.id] !== true,
                            );
                            if (firstIncorrect >= 0) setQuizIdx(firstIncorrect);
                            return;
                          }
                          if (quizIdx + 1 < chapter.kuis.length) {
                            setQuizIdx((i) => i + 1);
                          } else {
                            setStage("boss");
                          }
                        }}
                        nextLabel={
                          quizIdx + 1 < chapter.kuis.length
                            ? "Soal Kuis Berikutnya"
                            : "Hadapi Boss Bab!"
                        }
                      />
                    </>
                  ) : null}
                </div>
              )}

              {/* STAGE 5: BOSS MULTI-STEP (REQUIRES CORRECT SOLUTION PER STEP) */}
              {stage === "boss" && !isQuizMastered(cp, chapter) ? (
                <div role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100">
                  <strong>Boss masih terkunci.</strong> Jawab seluruh 5 soal kuis dengan benar sebelum melanjutkan.
                  <button
                    type="button"
                    onClick={() => {
                      const firstIncorrect = chapter.kuis.findIndex(
                        (question) => cp.kuisResults[question.id] !== true,
                      );
                      if (firstIncorrect >= 0) setQuizIdx(firstIncorrect);
                      setStage("kuis");
                    }}
                    className="ml-3 min-h-[40px] rounded-lg bg-amber-700 px-3 py-1.5 text-xs font-extrabold text-white"
                  >
                    Kembali ke Kuis
                  </button>
                </div>
              ) : stage === "boss" && currentBossStep ? (
                <div className="space-y-4">
                  <div className="rounded-xl border border-purple-300 bg-purple-50 p-3.5 dark:border-purple-800 dark:bg-purple-950/50">
                    <div className="flex items-center justify-between text-xs font-extrabold uppercase tracking-wider text-purple-800 dark:text-purple-300">
                      <span>{chapter.boss.title}</span>
                      <span>
                        Langkah {bossIdx + 1}/{chapter.boss.steps.length}
                      </span>
                    </div>
                    <p className="mt-1 text-xs font-medium text-purple-950 dark:text-purple-100 sm:text-sm">
                      {chapter.boss.brief}
                    </p>
                  </div>

                  <QuestionRenderer
                    key={`${chapter.id}_${currentBossStep.id}`}
                    question={bossToUnified(currentBossStep)}
                    allowHints={allowHints}
                    muted={state.muted}
                    speechRate={state.speechRate}
                    timedSeconds={timedSeconds}
                    showPinyin={showPinyin}
                    naturalTtsEnabled={state.naturalTtsEnabled}
                    allowRetryOnWrong={true}
                    onSpeakingChange={setIsTeacherSpeaking}
                    onEvaluated={({ isCorrect }) => {
                      handleTeacherFeedback(isCorrect);
                      const isLast = bossIdx + 1 >= chapter.boss.steps.length;
                      onRecordBossStep(chapter.id, currentBossStep.id, isCorrect, isLast);
                    }}
                    onNext={() => {
                      if (bossIdx + 1 < chapter.boss.steps.length) {
                        setBossIdx((i) => i + 1);
                      } else {
                        onClose();
                      }
                    }}
                    nextLabel={
                      bossIdx + 1 < chapter.boss.steps.length
                        ? "Langkah Boss Berikutnya"
                        : "Selesaikan Boss & Klaim Bintang"
                    }
                  />
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
