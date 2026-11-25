import React, { useMemo, useState } from "react";
import {
  X,
  Search,
  Volume2,
  AlertTriangle,
  CheckCircle2,
  Sparkles,
  Award,
  RotateCcw,
  BookOpen,
  Music,
} from "lucide-react";
import type { MateriBundle, QuizQuestion } from "../data/types";
import {
  evaluateExamReadiness,
  generateExamQuestions,
  getWeakSpots,
  type PlayerProgressState,
} from "../game/engine";
import { speakMandarin } from "../game/audio";
import { QuestionRenderer } from "./QuestionRenderer";
import { MandarinStudioPanel, PassportAchievementsPanel } from "./MandarinLabPanels";

export type StudyToolsTabId =
  | "lemah"
  | "studio"
  | "glosarium"
  | "ujian"
  | "paspor"
  | "profil";

interface StudyToolsDrawerProps {
  initialTab: StudyToolsTabId;
  materi: MateriBundle;
  state: PlayerProgressState;
  onClose: () => void;
  onResolveReviewOutcome: (
    question: QuizQuestion,
    isCorrect: boolean,
    hintLevel: number,
  ) => void;
  onJumpToChapter: (chapterId: string) => void;
  onSaveExamScore: (scorePct: number) => void;
  onFlashcardReview: (vocabId: string, knewIt: boolean) => void;
  onHanziPractice: (hanziChar: string) => void;
  onToneDrillSolved: (isCorrect: boolean) => void;
  onClaimDailyQuest: (questId: string) => void;
  onToggleNaturalTts: () => void;
  onToggleBgm?: () => void;
  onOpenGraduation?: () => void;
  onResetProgress: () => void;
}

export const StudyToolsDrawer: React.FC<StudyToolsDrawerProps> = ({
  initialTab,
  materi,
  state,
  onClose,
  onResolveReviewOutcome,
  onJumpToChapter,
  onSaveExamScore,
  onFlashcardReview,
  onHanziPractice,
  onToneDrillSolved,
  onClaimDailyQuest,
  onToggleNaturalTts,
  onToggleBgm,
  onOpenGraduation,
  onResetProgress,
}) => {
  const [tab, setTab] = useState<StudyToolsTabId>(initialTab);
  const [vocabFilter, setVocabFilter] = useState("Semua");
  const [vocabSearch, setVocabSearch] = useState("");
  const [confirmReset, setConfirmReset] = useState(false);

  // Spaced repetition inline drill
  const [drillingQuestion, setDrillingQuestion] = useState<QuizQuestion | null>(null);

  // 15-Question Exam Readiness / Ujian Akhir state
  const [examQuestions, setExamQuestions] = useState<QuizQuestion[] | null>(null);
  const [examIdx, setExamIdx] = useState(0);
  const [examOutcomes, setExamOutcomes] = useState<Record<string, boolean>>({});
  const [examFinished, setExamFinished] = useState(false);
  const [examStrictMode, setExamStrictMode] = useState(false);

  const weakSpots = useMemo(() => getWeakSpots(state, materi), [state, materi]);

  const allQuestionsMap = useMemo(() => {
    const map: Record<string, QuizQuestion> = {};
    for (const ch of materi.chapters) {
      for (const q of ch.kuis) {
        map[q.id] = q;
      }
    }
    return map;
  }, [materi]);

  const filteredVocab = useMemo(() => {
    const q = vocabSearch.trim().toLowerCase();
    return materi.vocabBank.filter((v) => {
      const matchCh = vocabFilter === "Semua" || v.chapterLabel === vocabFilter;
      const matchText =
        !q ||
        v.hanzi.toLowerCase().includes(q) ||
        v.pinyin.toLowerCase().includes(q) ||
        v.meaning.toLowerCase().includes(q) ||
        v.note.toLowerCase().includes(q);
      return matchCh && matchText;
    });
  }, [materi.vocabBank, vocabFilter, vocabSearch]);

  const startExam = (strictUjianAkhir: boolean) => {
    const qs = generateExamQuestions(materi, 15);
    setExamQuestions(qs);
    setExamIdx(0);
    setExamOutcomes({});
    setExamFinished(false);
    setExamStrictMode(strictUjianAkhir);
  };

  const examEvaluation = useMemo(() => {
    if (!examQuestions || !examFinished) return null;
    return evaluateExamReadiness(examQuestions, examOutcomes, materi);
  }, [examQuestions, examFinished, examOutcomes, materi]);

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/65 p-2 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="tools-modal-title"
    >
      <div className="flex max-h-[92dvh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-slate-300 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-800 sm:px-6">
          <h2
            id="tools-modal-title"
            className="text-base font-extrabold text-slate-900 dark:text-white sm:text-lg"
          >
            Alat Belajar, Ujian &amp; Glosarium
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup Alat Belajar"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-200 bg-slate-50 px-4 py-2 dark:border-slate-800 dark:bg-slate-950/60 sm:px-6">
          {[
            { id: "lemah" as const, label: `Perlu Diulang (${state.reviewQueue.length})` },
            { id: "studio" as const, label: "Studio Mandarin" },
            { id: "glosarium" as const, label: "Glosarium" },
            { id: "ujian" as const, label: "Siap Ujian" },
            { id: "paspor" as const, label: "Paspor & Misi" },
            { id: "profil" as const, label: "Kurikulum & Info" },
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              data-testid={`tools-tab-${t.id}`}
              onClick={() => setTab(t.id)}
              className={`min-h-[36px] shrink-0 rounded-lg border px-3 py-1.5 text-xs font-bold ${
                tab === t.id
                  ? "border-blue-700 bg-blue-700 text-white"
                  : "border-slate-200 bg-white text-slate-700 hover:border-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="custom-scroll flex-1 overflow-y-auto p-4 sm:p-6">
          {/* TAB 1: YANG MASIH LEMAH & SPACED REPETITION */}
          {tab === "lemah" && (
            <div className="space-y-5">
              {drillingQuestion ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-extrabold uppercase text-rose-700 dark:text-rose-400">
                      Latihan Pengulangan Berjarak
                    </span>
                    <button
                      type="button"
                      onClick={() => setDrillingQuestion(null)}
                      className="text-xs font-bold text-slate-600 underline dark:text-slate-300"
                    >
                      Kembali ke Daftar
                    </button>
                  </div>
                  <QuestionRenderer
                    key={drillingQuestion.id}
                    question={drillingQuestion}
                    allowHints={true}
                    muted={state.muted}
                    speechRate={state.speechRate}
                    onEvaluated={({ isCorrect, hintLevelUsed }) =>
                      onResolveReviewOutcome(drillingQuestion, isCorrect, hintLevelUsed)
                    }
                    onNext={() => setDrillingQuestion(null)}
                    nextLabel="Selesai Ulas Soal Ini"
                  />
                </div>
              ) : (
                <>
                  {/* Pending Review Queue */}
                  <div>
                    <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
                      Antrean Perlu Diulang ({state.reviewQueue.length})
                    </h3>
                    <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-300">
                      Setiap soal yang salah masuk ke antrean ini agar muncul ulang di latihan berikutnya hingga kamu kuasai.
                    </p>

                    {state.reviewQueue.length === 0 ? (
                      <div className="mt-3 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200">
                        <CheckCircle2 className="h-5 w-5 shrink-0" />
                        Belum ada soal yang perlu diulang saat ini. Mantap!
                      </div>
                    ) : (
                      <div className="mt-3 space-y-2">
                        {state.reviewQueue.map((item) => {
                          const q = allQuestionsMap[item.questionId];
                          return (
                            <div
                              key={item.questionId}
                              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-rose-200 bg-rose-50/70 p-3 dark:border-rose-800 dark:bg-rose-950/40"
                            >
                              <div>
                                <div className="text-xs font-extrabold uppercase text-rose-800 dark:text-rose-300">
                                  {item.chapterId.toUpperCase()} · Salah {item.wrongCount}x
                                </div>
                                <div className="text-sm font-bold text-slate-900 dark:text-white">
                                  {item.topic}
                                </div>
                                {q && (
                                  <div className="text-xs text-slate-600 dark:text-slate-300">
                                    {q.prompt.slice(0, 90)}
                                    {q.prompt.length > 90 ? "..." : ""}
                                  </div>
                                )}
                              </div>
                              {q && (
                                <button
                                  type="button"
                                  onClick={() => setDrillingQuestion(q)}
                                  className="min-h-[40px] rounded-lg bg-rose-700 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-rose-800"
                                >
                                  Latih Ulang
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Weak Concept Ranking */}
                  <div>
                    <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
                      Peta Konsep yang Sering Salah
                    </h3>
                    {weakSpots.length === 0 ? (
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        Belum ada catatan kesalahan konsep. Mulai kerjakan kuis di tiap bab!
                      </p>
                    ) : (
                      <div className="mt-2.5 grid gap-2 sm:grid-cols-2">
                        {weakSpots.map((w) => (
                          <div
                            key={w.conceptTag}
                            className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800"
                          >
                            <div>
                              <div className="text-xs font-bold text-amber-700 dark:text-amber-400">
                                {w.chapterTitle} · {w.mistakeCount} kesalahan
                              </div>
                              <div className="text-sm font-bold text-slate-900 dark:text-white">
                                {w.topic}
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => onJumpToChapter(w.chapterId)}
                              className="min-h-[38px] shrink-0 rounded-lg border border-slate-300 bg-white px-3 text-xs font-bold text-slate-800 hover:border-blue-600 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                            >
                              Buka Bab
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {/* TAB 1B: STUDIO KARTU KILAT, TULIS HANZI & NADA */}
          {tab === "studio" && (
            <MandarinStudioPanel
              materi={materi}
              state={state}
              onFlashcardReview={onFlashcardReview}
              onHanziPractice={onHanziPractice}
              onToneDrillSolved={onToneDrillSolved}
            />
          )}

          {/* TAB 2: GLOSARIUM */}
          {tab === "glosarium" && (
            <div className="space-y-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <div className="relative flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={vocabSearch}
                    onChange={(e) => setVocabSearch(e.target.value)}
                    placeholder="Cari hanzi, pinyin, arti, atau kata kunci (misal: 银行 / AA制)..."
                    className="min-h-[42px] w-full rounded-xl border border-slate-300 bg-white pl-9 pr-3 text-sm text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                </div>
                <select
                  aria-label="Filter Glosarium per Bab"
                  value={vocabFilter}
                  onChange={(e) => setVocabFilter(e.target.value)}
                  className="min-h-[42px] rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                >
                  <option value="Semua">Semua Bab ({materi.vocabBank.length})</option>
                  {materi.chapters.map((c) => (
                    <option key={c.id} value={`Bab ${c.order}`}>
                      Bab {c.order}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid gap-2.5 sm:grid-cols-2">
                {filteredVocab.map((entry) => (
                  <div
                    key={entry.id}
                    className="flex flex-col justify-between rounded-xl border border-slate-200 bg-slate-50 p-3.5 dark:border-slate-700 dark:bg-slate-800/70"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <span className="text-[11px] font-bold uppercase text-blue-700 dark:text-blue-400">
                            {entry.chapterLabel}
                          </span>
                          <div className="hanzi-text text-lg font-extrabold text-slate-900 dark:text-white">
                            {entry.hanzi}
                          </div>
                          <div className="text-xs font-bold text-slate-600 dark:text-slate-300">
                            {entry.pinyin}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            speakMandarin(entry.hanzi, {
                              muted: state.muted,
                              rate: state.speechRate,
                              naturalTts: state.naturalTtsEnabled,
                            })
                          }
                          aria-label={`Dengar ${entry.hanzi}`}
                          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-700 hover:border-blue-600 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
                        >
                          <Volume2 className="h-4 w-4" />
                        </button>
                      </div>
                      <p className="mt-1.5 text-sm font-semibold text-slate-800 dark:text-slate-100">
                        {entry.meaning}
                      </p>
                      <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">{entry.note}</p>
                    </div>
                    <p className="mt-2 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                      Sumber: {entry.source}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 3: CEK SIAP UJIAN (15 SOAL) & UJIAN AKHIR */}
          {tab === "ujian" && (
            <div className="space-y-4">
              {!examQuestions ? (
                <div className="space-y-4">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/70">
                    <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
                      Simulasi Kesiapan &amp; Ujian Akhir Komprehensif
                    </h3>
                    <p className="mt-1 text-sm text-slate-700 dark:text-slate-300">
                      Pilih paket evaluasi 15 soal acak dari seluruh Bab 1–7. Di akhir sesi kamu akan melihat skor, status kesiapan, serta daftar bab yang perlu diulang.
                    </p>
                    {state.lastExamScore !== null && (
                      <p className="mt-2 text-xs font-bold text-blue-700 dark:text-blue-400 tabular-nums">
                        Skor Evaluasi Terakhir: {state.lastExamScore}% · Terbaik:{" "}
                        {Math.max(state.bestExamScore ?? 0, state.lastExamScore)}%
                      </p>
                    )}
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-4 dark:border-blue-800 dark:bg-blue-950/40">
                      <div className="text-xs font-extrabold uppercase text-blue-700 dark:text-blue-400">
                        Diagnostik Cepat
                      </div>
                      <h4 className="mt-1 text-base font-extrabold text-slate-900 dark:text-white">
                        Cek Siap Ujian (15 Soal)
                      </h4>
                      <p className="mt-1 text-xs text-slate-700 dark:text-slate-300">
                        15 soal campuran acak lintas bab tanpa batas waktu ketat, fokus mengukur bab terlemahmu.
                      </p>
                      <button
                        type="button"
                        data-testid="start-exam-readiness-btn"
                        onClick={() => startExam(false)}
                        className="mt-3 inline-flex min-h-[42px] items-center gap-1.5 rounded-xl bg-blue-700 px-4 py-2 text-xs font-extrabold text-white hover:bg-blue-800"
                      >
                        <Sparkles className="h-4 w-4" />
                        Mulai Cek Siap Ujian (15 Soal)
                      </button>
                    </div>

                    <div className="rounded-xl border border-purple-200 bg-purple-50/70 p-4 dark:border-purple-800 dark:bg-purple-950/40">
                      <div className="text-xs font-extrabold uppercase text-purple-700 dark:text-purple-400">
                        Mode Tanpa Hint
                      </div>
                      <h4 className="mt-1 text-base font-extrabold text-slate-900 dark:text-white">
                        Ujian Akhir (15 Soal Acak)
                      </h4>
                      <p className="mt-1 text-xs text-slate-700 dark:text-slate-300">
                        Simulasi ujian sesungguhnya: acak dari seluruh bab, tanpa petunjuk/hint, dan batas 30 detik per soal.
                      </p>
                      <button
                        type="button"
                        data-testid="start-final-exam-btn"
                        onClick={() => startExam(true)}
                        className="mt-3 inline-flex min-h-[42px] items-center gap-1.5 rounded-xl bg-purple-700 px-4 py-2 text-xs font-extrabold text-white hover:bg-purple-800"
                      >
                        <Award className="h-4 w-4" />
                        Mulai Ujian Akhir
                      </button>
                    </div>
                  </div>
                </div>
              ) : examFinished && examEvaluation ? (
                <div className="space-y-4">
                  <div className="rounded-2xl border border-blue-200 bg-blue-50 p-5 dark:border-blue-800 dark:bg-blue-950/40">
                    <div className="text-xs font-extrabold uppercase text-blue-700 dark:text-blue-400">
                      {examStrictMode ? "Hasil Ujian Akhir" : "Hasil Cek Siap Ujian"}
                    </div>
                    <div className="mt-1 flex flex-wrap items-baseline gap-3">
                      <span className="text-3xl font-extrabold text-slate-900 dark:text-white tabular-nums">
                        {examEvaluation.scorePct}%
                      </span>
                      <span className="text-sm font-bold text-slate-700 dark:text-slate-200 tabular-nums">
                        ({examEvaluation.correctCount}/{examEvaluation.total} benar ·{" "}
                        {examEvaluation.readinessTier})
                      </span>
                    </div>
                  </div>

                  {examEvaluation.recommendedChapters.length > 0 ? (
                    <div>
                      <h4 className="text-sm font-extrabold text-slate-900 dark:text-white">
                        Saran Bab yang Perlu Diulang:
                      </h4>
                      <div className="mt-2 space-y-2">
                        {examEvaluation.recommendedChapters.map((rec) => (
                          <div
                            key={rec.chapterId}
                            className="flex items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/40"
                          >
                            <div>
                              <div className="text-sm font-bold text-slate-900 dark:text-white">
                                {rec.title}
                              </div>
                              <div className="text-xs text-amber-800 dark:text-amber-300">
                                {rec.missed} soal terlewat pada bab ini
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => onJumpToChapter(rec.chapterId)}
                              className="min-h-[38px] rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-amber-700"
                            >
                              Ulangi Bab
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
                      Luar biasa! Semua soal terjawab benar — kamu siap menghadapi ujian!
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => setExamQuestions(null)}
                    className="inline-flex min-h-[42px] items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-bold text-slate-800 hover:border-blue-600 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  >
                    <RotateCcw className="h-4 w-4" />
                    Kembali ke Menu Evaluasi
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-500 dark:text-slate-400">
                    <span>
                      {examStrictMode ? "Ujian Akhir" : "Cek Siap Ujian"} · Soal {examIdx + 1}/
                      {examQuestions.length}
                    </span>
                    <button
                      type="button"
                      onClick={() => setExamQuestions(null)}
                      className="text-rose-700 underline dark:text-rose-400"
                    >
                      Batalkan
                    </button>
                  </div>

                  <QuestionRenderer
                    key={examQuestions[examIdx].id}
                    question={examQuestions[examIdx]}
                    allowHints={false}
                    muted={state.muted}
                    speechRate={state.speechRate}
                    timedSeconds={examStrictMode ? 30 : undefined}
                    onEvaluated={({ isCorrect }) => {
                      const q = examQuestions[examIdx];
                      setExamOutcomes((prev) => ({ ...prev, [q.id]: isCorrect }));
                      if (!isCorrect) {
                        onResolveReviewOutcome(q, false, 0);
                      }
                    }}
                    onNext={() => {
                      if (examIdx + 1 < examQuestions.length) {
                        setExamIdx((i) => i + 1);
                      } else {
                        const evalNow = evaluateExamReadiness(examQuestions, examOutcomes, materi);
                        onSaveExamScore(evalNow.scorePct);
                        setExamFinished(true);
                      }
                    }}
                    nextLabel={
                      examIdx + 1 < examQuestions.length ? "Soal Berikutnya" : "Lihat Hasil Evaluasi"
                    }
                  />
                </div>
              )}
            </div>
          )}

          {/* TAB 3B: PASPOR PRESTASI & TARGET HARIAN */}
          {tab === "paspor" && (
            <PassportAchievementsPanel
              materi={materi}
              state={state}
              onClaimDailyQuest={onClaimDailyQuest}
              onOpenGraduation={onOpenGraduation}
            />
          )}

          {/* TAB 4: KURIKULUM, PROFIL & IN-PAGE RESET */}
          {tab === "profil" && (
            <div className="space-y-5">
              {/* Natural Gemini TTS Audio Setting */}
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50/70 p-4 dark:border-emerald-800 dark:bg-emerald-950/30">
                <div>
                  <div className="text-xs font-extrabold uppercase tracking-wider text-emerald-800 dark:text-emerald-300">
                    Kualitas Pelafalan Audio Mandarin
                  </div>
                  <p className="mt-0.5 text-xs text-slate-700 dark:text-slate-300">
                    Gunakan suara natural HD Lǎoshī Lín (Gemini Flash TTS) dengan cadangan otomatis suara browser.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onToggleNaturalTts}
                  className={`min-h-[38px] shrink-0 rounded-xl px-3.5 text-xs font-extrabold transition ${
                    state.naturalTtsEnabled
                      ? "bg-emerald-700 text-white hover:bg-emerald-800"
                      : "border border-slate-300 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                  }`}
                >
                  {state.naturalTtsEnabled ? "Suara HD Gemini: Aktif" : "Suara Browser Sistem"}
                </button>
              </div>

              {onToggleBgm && (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-blue-200 bg-blue-50/70 p-4 dark:border-blue-800 dark:bg-blue-950/30">
                  <div>
                    <div className="flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider text-blue-800 dark:text-blue-300">
                      <Music className="h-3.5 w-3.5" />
                      Musik Latar Kampus (BGM Pentatonik)
                    </div>
                    <p className="mt-0.5 text-xs text-slate-700 dark:text-slate-300">
                      Alunan guzheng &amp; suling bambu adaptif sesuai zona kampus, kuis tenang, hingga pawai wisuda (otomatis mengecil saat Lǎoshī berbicara).
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={onToggleBgm}
                    className={`min-h-[38px] shrink-0 rounded-xl px-3.5 text-xs font-extrabold transition ${
                      state.bgmEnabled
                        ? "bg-blue-700 text-white hover:bg-blue-800"
                        : "border border-slate-300 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                    }`}
                  >
                    {state.bgmEnabled ? "Musik Latar: Aktif" : "Musik Latar: Mati"}
                  </button>
                </div>
              )}

              {/* Tahap 0 Transparency */}
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/70">
                <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-blue-700 dark:text-blue-400">
                  <BookOpen className="h-4 w-4" />
                  Sumber &amp; Transparansi Kurikulum
                </div>
                <p className="mt-1.5 text-sm font-bold text-slate-900 dark:text-white">
                  Jenis Mata Kuliah: {materi.analysis.courseType}
                </p>
                <div className="mt-2 space-y-2 text-xs text-slate-700 dark:text-slate-300">
                  {materi.analysis.textbooks.map((tb) => (
                    <div key={tb.name}>
                      <strong>{tb.name}</strong> ({tb.scope}): {tb.coverageNote}
                    </div>
                  ))}
                  {materi.analysis.transparencyNotes.map((n, idx) => (
                    <div
                      key={idx}
                      className="rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
                    >
                      {n}
                    </div>
                  ))}
                </div>
              </div>

              {/* Badges */}
              <div>
                <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
                  Lencana Terkumpul ({state.badges.length}/{materi.chapters.length})
                </h3>
                <div className="mt-2 flex flex-wrap gap-2">
                  {materi.chapters.map((ch) => {
                    const unlocked = state.badges.includes(ch.badgeName);
                    return (
                      <div
                        key={ch.id}
                        className={`rounded-xl border px-3 py-2 text-xs font-bold ${
                          unlocked
                            ? "border-amber-400 bg-amber-50 text-amber-900 dark:border-amber-600 dark:bg-amber-950/60 dark:text-amber-200"
                            : "border-slate-200 bg-slate-100 text-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-500"
                        }`}
                      >
                        {unlocked ? "★ " : "☆ "}
                        {ch.badgeName}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* In-Page Reset Confirmation (never window.confirm) */}
              <div className="rounded-xl border border-rose-200 bg-rose-50/70 p-4 dark:border-rose-900 dark:bg-rose-950/30">
                <div className="flex items-center gap-2 text-sm font-extrabold text-rose-900 dark:text-rose-200">
                  <AlertTriangle className="h-4 w-4" />
                  Atur Ulang Progres Belajar
                </div>
                <p className="mt-1 text-xs text-rose-800 dark:text-rose-300">
                  Menghapus XP, bintang bab, lencana, dan antrean ulang dari penyimpanan perangkat ini.
                </p>

                {!confirmReset ? (
                  <button
                    type="button"
                    data-testid="reset-progress-trigger"
                    onClick={() => setConfirmReset(true)}
                    className="mt-3 min-h-[40px] rounded-lg border border-rose-400 bg-white px-4 py-1.5 text-xs font-bold text-rose-800 hover:bg-rose-100 dark:border-rose-700 dark:bg-slate-900 dark:text-rose-200"
                  >
                    Reset Semua Progres
                  </button>
                ) : (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <span className="text-xs font-bold text-rose-900 dark:text-rose-100">
                      Yakin hapus seluruh progres?
                    </span>
                    <button
                      type="button"
                      data-testid="confirm-reset-btn"
                      onClick={() => {
                        onResetProgress();
                        setConfirmReset(false);
                      }}
                      className="min-h-[38px] rounded-lg bg-rose-700 px-3.5 py-1.5 text-xs font-extrabold text-white hover:bg-rose-800"
                    >
                      Ya, Reset Sekarang
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmReset(false)}
                      className="min-h-[38px] rounded-lg border border-slate-300 bg-white px-3.5 py-1.5 text-xs font-bold text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                    >
                      Batal
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
