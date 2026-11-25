import React, { useEffect, useRef, useState } from "react";
import { Volume2, HelpCircle, CheckCircle2, XCircle, RotateCcw, BookOpen } from "lucide-react";
import type { QuizQuestionKind, QuizVariant } from "../data/types";
import { speakMandarin } from "../game/audio";
import { validateQuestionAnswer } from "../game/engine";

export interface UnifiedQuestion {
  id: string;
  kind: QuizQuestionKind;
  topic: string;
  prompt: string;
  hanzi?: string;
  pinyin?: string;
  audioText?: string;
  dialogue?: { speaker: string; hanzi: string; pinyin: string; meaning: string }[];
  options?: string[];
  tokens?: string[];
  pairs?: { left: string; right: string }[];
  placeholder?: string;
  acceptedAnswers?: string[];
  answer: number | boolean | string[] | string;
  hints: [string, string, string];
  explain: string;
  source: string;
  isTambahan?: boolean;
  variant?: QuizVariant;
}

interface QuestionRendererProps {
  question: UnifiedQuestion;
  allowHints: boolean;
  muted: boolean;
  speechRate: number;
  timedSeconds?: number;
  showPinyin?: boolean;
  naturalTtsEnabled?: boolean;
  allowRetryOnWrong?: boolean;
  onSpeakingChange?: (speaking: boolean) => void;
  onEvaluated: (result: {
    isCorrect: boolean;
    hintLevelUsed: number;
    timedOut?: boolean;
  }) => void;
  onNext?: () => void;
  nextLabel?: string;
}

export const QuestionRenderer: React.FC<QuestionRendererProps> = ({
  question,
  allowHints,
  muted,
  speechRate,
  timedSeconds,
  showPinyin = true,
  naturalTtsEnabled = true,
  allowRetryOnWrong = false,
  onSpeakingChange,
  onEvaluated,
  onNext,
  nextLabel = "Lanjut",
}) => {
  const [selectedMcq, setSelectedMcq] = useState<number | null>(null);
  const [selectedTf, setSelectedTf] = useState<boolean | null>(null);
  const [builtOrder, setBuiltOrder] = useState<{ uid: number; text: string }[]>([]);
  const [remainingTokens, setRemainingTokens] = useState<{ uid: number; text: string }[]>([]);
  const [matchSelections, setMatchSelections] = useState<string[]>([]);
  const [shortInput, setShortInput] = useState("");
  const [hintLevel, setHintLevel] = useState(0);
  const [submitted, setSubmitted] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);
  const [audioStatus, setAudioStatus] = useState("");
  const [secondsLeft, setSecondsLeft] = useState<number | null>(timedSeconds ?? null);
  const evaluatedRef = useRef(false);

  // Variant retry mode if user gets a quiz question wrong
  const [activeVariant, setActiveVariant] = useState(false);
  const [variantSubmitted, setVariantSubmitted] = useState(false);
  const [variantCorrect, setVariantCorrect] = useState(false);

  const currentPrompt = activeVariant && question.variant ? question.variant.prompt : question.prompt;
  const currentHanzi = activeVariant && question.variant?.hanzi ? question.variant.hanzi : question.hanzi;
  const currentPinyin = activeVariant && question.variant?.pinyin ? question.variant.pinyin : question.pinyin;
  const currentOptions = activeVariant && question.variant?.options ? question.variant.options : question.options;
  const currentTokens = activeVariant && question.variant?.tokens ? question.variant.tokens : question.tokens;
  const currentPairs = activeVariant && question.variant?.pairs ? question.variant.pairs : question.pairs;
  const currentAccepted =
    activeVariant && question.variant?.acceptedAnswers ? question.variant.acceptedAnswers : question.acceptedAnswers;
  const currentPlaceholder =
    activeVariant && question.variant?.placeholder ? question.variant.placeholder : question.placeholder;
  const currentAnswer = activeVariant && question.variant ? question.variant.answer : question.answer;
  const currentExplain = activeVariant && question.variant ? question.variant.explain : question.explain;

  const shuffleTokens = (src?: string[]): { uid: number; text: string }[] => {
    if (!src) return [];
    const copy = [...src];
    // Deterministic mild rotation/shuffle so it's never already solved
    if (copy.length > 1) {
      copy.push(copy.shift()!);
      if (copy.length > 3) {
        const tmp = copy[0];
        copy[0] = copy[2];
        copy[2] = tmp;
      }
    }
    return copy.map((text, idx) => ({ uid: idx, text }));
  };

  useEffect(() => {
    setSelectedMcq(null);
    setSelectedTf(null);
    setBuiltOrder([]);
    setRemainingTokens(shuffleTokens(question.tokens));
    setMatchSelections(question.pairs ? question.pairs.map(() => "") : []);
    setShortInput("");
    setHintLevel(0);
    setSubmitted(false);
    setIsCorrect(false);
    setShowTranscript(false);
    setAudioStatus("");
    setActiveVariant(false);
    setVariantSubmitted(false);
    setVariantCorrect(false);
    setSecondsLeft(timedSeconds ?? null);
    evaluatedRef.current = false;
  }, [question.id, timedSeconds]);

  useEffect(() => {
    if (secondsLeft === null || submitted || activeVariant) return;
    if (secondsLeft <= 0) {
      if (evaluatedRef.current) return;
      evaluatedRef.current = true;
      setSubmitted(true);
      setIsCorrect(false);
      onEvaluated({ isCorrect: false, hintLevelUsed: hintLevel, timedOut: true });
      return;
    }
    const t = window.setTimeout(() => setSecondsLeft((s) => (s !== null ? s - 1 : null)), 1000);
    return () => window.clearTimeout(t);
  }, [secondsLeft, submitted, activeVariant]);

  const shuffledMatchOptions = React.useMemo(() => {
    if (!currentPairs) return [];
    const rights = currentPairs.map((p) => p.right);
    if (rights.length <= 1) return rights;
    // Deterministic seeded Fisher-Yates shuffle keyed on question ID so middle items never stay fixed
    const copy = [...rights];
    let seed = 0;
    for (let i = 0; i < question.id.length; i += 1) {
      seed = (seed * 31 + question.id.charCodeAt(i)) >>> 0;
    }
    for (let i = copy.length - 1; i > 0; i -= 1) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      const j = seed % (i + 1);
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    if (copy.every((val, idx) => val === rights[idx]) && copy.length > 1) {
      copy.push(copy.shift()!);
    }
    return copy;
  }, [currentPairs, question.id]);

  const canCheck = (() => {
    if (question.kind === "mcq") return selectedMcq !== null;
    if (question.kind === "true_false") return selectedTf !== null;
    if (question.kind === "order") return remainingTokens.length === 0 && builtOrder.length > 0;
    if (question.kind === "match") return matchSelections.length > 0 && matchSelections.every(Boolean);
    if (question.kind === "short_fill") return shortInput.trim().length > 0;
    return false;
  })();

  const handleCheck = () => {
    let userVal: number | boolean | string[] | string | null = null;
    if (question.kind === "mcq") userVal = selectedMcq;
    else if (question.kind === "true_false") userVal = selectedTf;
    else if (question.kind === "order") userVal = builtOrder.map((t) => t.text);
    else if (question.kind === "match") userVal = matchSelections;
    else if (question.kind === "short_fill") userVal = shortInput;

    const ok = validateQuestionAnswer(
      {
        kind: question.kind,
        answer: currentAnswer,
        acceptedAnswers: currentAccepted,
      },
      userVal,
    );

    if (activeVariant) {
      setVariantSubmitted(true);
      setVariantCorrect(ok);
    } else {
      if (evaluatedRef.current) return;
      evaluatedRef.current = true;
      setSubmitted(true);
      setIsCorrect(ok);
      onEvaluated({ isCorrect: ok, hintLevelUsed: hintLevel });
    }
  };

  const handleRetrySameQuestion = () => {
    evaluatedRef.current = false;
    setSelectedMcq(null);
    setSelectedTf(null);
    setBuiltOrder([]);
    setRemainingTokens(shuffleTokens(question.tokens));
    setMatchSelections(question.pairs ? question.pairs.map(() => "") : []);
    setShortInput("");
    setSubmitted(false);
    setIsCorrect(false);
    setSecondsLeft(timedSeconds ?? null);
  };

  const launchVariantRetry = () => {
    if (!question.variant) return;
    setActiveVariant(true);
    setVariantSubmitted(false);
    setVariantCorrect(false);
    setSelectedMcq(null);
    setSelectedTf(null);
    setBuiltOrder([]);
    setRemainingTokens(shuffleTokens(question.variant.tokens));
    setMatchSelections(question.variant.pairs ? question.variant.pairs.map(() => "") : []);
    setShortInput("");
  };

  const pickToken = (item: { uid: number; text: string }) => {
    if (submitted && !activeVariant) return;
    if (activeVariant && variantSubmitted) return;
    setBuiltOrder((prev) => (prev.some((x) => x.uid === item.uid) ? prev : [...prev, item]));
    setRemainingTokens((prev) => prev.filter((x) => x.uid !== item.uid));
  };

  const undoToken = (item: { uid: number; text: string }) => {
    if (submitted && !activeVariant) return;
    if (activeVariant && variantSubmitted) return;
    setRemainingTokens((prev) => (prev.some((x) => x.uid === item.uid) ? prev : [...prev, item]));
    setBuiltOrder((prev) => prev.filter((x) => x.uid !== item.uid));
  };

  const isDone = activeVariant ? variantSubmitted : submitted;
  const isOkNow = activeVariant ? variantCorrect : isCorrect;

  // Keyboard shortcuts: keys 1-4 pick MCQ options; Enter checks answer or moves next
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      const el = ev.target as HTMLElement | null;
      const tag = el?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") {
        // Allow Enter inside short_fill input to check or advance
        if (ev.code === "Enter" && tag === "INPUT") {
          if (!isDone && canCheck) {
            ev.preventDefault();
            handleCheck();
          } else if (isDone && onNext && (!allowRetryOnWrong || isOkNow)) {
            ev.preventDefault();
            onNext();
          }
        }
        return;
      }

      if (!isDone && question.kind === "mcq" && currentOptions) {
        if (ev.key >= "1" && ev.key <= "4") {
          const idx = Number(ev.key) - 1;
          if (idx >= 0 && idx < currentOptions.length) {
            ev.preventDefault();
            setSelectedMcq(idx);
          }
          return;
        }
      }

      if (ev.code === "Enter") {
        if (!isDone && canCheck) {
          ev.preventDefault();
          handleCheck();
        } else if (isDone && onNext && (!allowRetryOnWrong || isOkNow)) {
          ev.preventDefault();
          onNext();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const triggerSpeak = (text: string, withStatus = false) => {
    speakMandarin(text, {
      muted,
      rate: speechRate,
      naturalTts: naturalTtsEnabled,
      onStatus: withStatus ? setAudioStatus : undefined,
      onStart: () => onSpeakingChange?.(true),
      onEnd: () => onSpeakingChange?.(false),
    });
  };

  return (
    <div className="space-y-4">
      {/* Header Row */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-extrabold uppercase tracking-wider text-blue-700 dark:text-blue-400">
          {activeVariant ? "Soal Penguatan Serupa" : question.topic}
        </span>

        <div className="flex items-center gap-2">
          {question.isTambahan && (
            <span className="rounded-md border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-300">
              Tambahan
            </span>
          )}
          {secondsLeft !== null && !submitted && !activeVariant && (
            <span
              className={`rounded-md px-2 py-0.5 text-xs font-extrabold tabular-nums ${
                secondsLeft <= 10
                  ? "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200"
                  : "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200"
              }`}
            >
              {secondsLeft}s
            </span>
          )}
        </div>
      </div>

      {/* Prompt */}
      <p className="text-sm font-semibold leading-relaxed text-slate-900 dark:text-slate-100 sm:text-base">
        {currentPrompt}
      </p>

      {/* Audio / Dialogue Support */}
      {(question.audioText || question.dialogue) && !activeVariant && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/80">
          <div className="flex flex-wrap items-center gap-2">
            {question.audioText && (
              <button
                type="button"
                onClick={() => triggerSpeak(question.audioText!, true)}
                className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-800"
              >
                <Volume2 className="h-4 w-4" />
                Putar Audio Mandarin
              </button>
            )}
            {question.dialogue && (
              <button
                type="button"
                onClick={() => setShowTranscript((v) => !v)}
                className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:border-blue-600 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
              >
                <BookOpen className="h-3.5 w-3.5" />
                {showTranscript ? "Tutup Transkrip" : "Lihat Transkrip"}
              </button>
            )}
            {audioStatus && (
              <span className="text-xs text-slate-600 dark:text-slate-300">{audioStatus}</span>
            )}
          </div>

          {showTranscript && question.dialogue && (
            <div className="mt-3 space-y-2 border-t border-slate-200 pt-2.5 dark:border-slate-700">
              {question.dialogue.map((line, i) => (
                <div key={i} className="text-xs sm:text-sm">
                  <span className="font-bold text-blue-700 dark:text-blue-400">{line.speaker}: </span>
                  <span className="hanzi-text font-bold text-slate-900 dark:text-white">
                    {line.hanzi}
                  </span>
                  <div className="text-xs text-slate-600 dark:text-slate-300">
                    {(showPinyin || isDone) ? `${line.pinyin} — ` : ""}
                    {line.meaning}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Visual Hanzi / Pinyin Box */}
      {currentHanzi && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800/70">
          <div>
            <div className="hanzi-text text-xl font-extrabold text-slate-900 dark:text-white sm:text-2xl">
              {currentHanzi}
            </div>
            {currentPinyin && (showPinyin || isDone) ? (
              <div className="text-xs font-medium text-slate-600 dark:text-slate-300">
                {currentPinyin}
              </div>
            ) : currentPinyin ? (
              <div className="text-[11px] font-semibold italic text-slate-500 dark:text-slate-400">
                Pinyin disembunyikan (Mode Tantang Hanzi)
              </div>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => triggerSpeak(currentHanzi)}
            aria-label={`Dengarkan pelafalan ${currentHanzi}`}
            className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-xs font-bold text-slate-800 hover:border-blue-600 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
          >
            <Volume2 className="h-4 w-4" />
            Dengar
          </button>
        </div>
      )}

      {/* Answer Input Area */}
      {question.kind === "mcq" && currentOptions && (
        <div className="grid gap-2">
          {currentOptions.map((opt, idx) => {
            const picked = selectedMcq === idx;
            const correctIdx = currentAnswer as number;
            let stateStyle =
              "border-slate-200 bg-white text-slate-900 hover:border-blue-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100";
            if (isDone) {
              if (idx === correctIdx) {
                stateStyle =
                  "border-emerald-600 bg-emerald-50 text-emerald-950 dark:border-emerald-500 dark:bg-emerald-950/60 dark:text-emerald-100";
              } else if (picked) {
                stateStyle =
                  "border-rose-600 bg-rose-50 text-rose-950 dark:border-rose-500 dark:bg-rose-950/60 dark:text-rose-100";
              }
            } else if (picked) {
              stateStyle =
                "border-blue-700 bg-blue-50 text-blue-950 ring-2 ring-blue-500/30 dark:border-blue-400 dark:bg-blue-950/70 dark:text-blue-100";
            }

            return (
              <button
                key={idx}
                type="button"
                disabled={isDone}
                onClick={() => setSelectedMcq(idx)}
                className={`min-h-[46px] w-full rounded-xl border px-4 py-2.5 text-left text-sm font-semibold transition ${stateStyle}`}
              >
                <span className="mr-2 font-extrabold text-slate-500 dark:text-slate-400">
                  {String.fromCharCode(65 + idx)}.
                </span>
                <span className="hanzi-text">{opt}</span>
              </button>
            );
          })}
        </div>
      )}

      {question.kind === "true_false" && (
        <div className="grid grid-cols-2 gap-3">
          {[
            { val: true, label: "Benar (对)" },
            { val: false, label: "Salah (错)" },
          ].map((item) => {
            const picked = selectedTf === item.val;
            let cls =
              "border-slate-200 bg-white text-slate-900 hover:border-blue-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100";
            if (isDone) {
              if (item.val === currentAnswer) {
                cls =
                  "border-emerald-600 bg-emerald-50 text-emerald-950 dark:border-emerald-500 dark:bg-emerald-950/60 dark:text-emerald-100";
              } else if (picked) {
                cls =
                  "border-rose-600 bg-rose-50 text-rose-950 dark:border-rose-500 dark:bg-rose-950/60 dark:text-rose-100";
              }
            } else if (picked) {
              cls =
                "border-blue-700 bg-blue-50 text-blue-950 ring-2 ring-blue-500/30 dark:border-blue-400 dark:bg-blue-950/70 dark:text-blue-100";
            }
            return (
              <button
                key={String(item.val)}
                type="button"
                disabled={isDone}
                onClick={() => setSelectedTf(item.val)}
                className={`min-h-[48px] rounded-xl border px-4 py-3 text-sm font-extrabold transition ${cls}`}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      )}

      {question.kind === "order" && currentTokens && (
        <div className="space-y-3">
          <div className="min-h-[54px] rounded-xl border border-dashed border-slate-400 bg-slate-50 p-2.5 dark:border-slate-600 dark:bg-slate-800/70">
            {builtOrder.length === 0 ? (
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Ketuk potongan kata di bawah secara berurutan untuk menyusun kalimat...
              </span>
            ) : (
              <div className="flex flex-wrap gap-2">
                {builtOrder.map((tok) => (
                  <button
                    key={tok.uid}
                    type="button"
                    disabled={isDone}
                    onClick={() => undoToken(tok)}
                    className="hanzi-text min-h-[38px] rounded-lg border border-blue-600 bg-blue-700 px-3 py-1.5 text-sm font-bold text-white"
                  >
                    {tok.text}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            {remainingTokens.map((tok) => (
              <button
                key={tok.uid}
                type="button"
                disabled={isDone}
                onClick={() => pickToken(tok)}
                className="hanzi-text min-h-[42px] rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-bold text-slate-900 hover:border-blue-600 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
              >
                {tok.text}
              </button>
            ))}
          </div>
        </div>
      )}

      {question.kind === "match" && currentPairs && (
        <div className="space-y-2.5">
          {currentPairs.map((pair, idx) => (
            <div
              key={pair.left}
              className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/70 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="hanzi-text text-sm font-bold text-slate-900 dark:text-white">
                {pair.left}
              </div>
              <select
                aria-label={`Pasangan untuk ${pair.left}`}
                disabled={isDone}
                value={matchSelections[idx] ?? ""}
                onChange={(e) => {
                  const val = e.target.value;
                  setMatchSelections((prev) => {
                    const copy = [...prev];
                    copy[idx] = val;
                    return copy;
                  });
                }}
                className="min-h-[42px] rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
              >
                <option value="">-- Pilih pasangan --</option>
                {shuffledMatchOptions.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
      )}

      {question.kind === "short_fill" && (
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Jawaban Singkat (Hanzi atau Pinyin)
          </label>
          <input
            type="text"
            disabled={isDone}
            value={shortInput}
            onChange={(e) => setShortInput(e.target.value)}
            placeholder={currentPlaceholder || "Ketik jawabanmu di sini..."}
            className="mt-1.5 min-h-[46px] w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-white"
          />
        </div>
      )}

      {/* Controls: Check + Tiered Hints */}
      {!isDone && (
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <div className="flex flex-wrap items-center gap-2">
            {allowHints && !activeVariant && hintLevel < 3 && (
              <button
                type="button"
                onClick={() => setHintLevel((h) => Math.min(3, h + 1))}
                className="inline-flex min-h-[42px] items-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50 px-3.5 py-2 text-xs font-bold text-amber-900 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-950/60 dark:text-amber-200"
              >
                <HelpCircle className="h-4 w-4" />
                {hintLevel === 0
                  ? "Petunjuk Kecil"
                  : hintLevel === 1
                    ? "Petunjuk Besar"
                    : "Lihat Kunci"}
              </button>
            )}
          </div>

          <button
            type="button"
            data-testid="check-answer-btn"
            disabled={!canCheck}
            onClick={handleCheck}
            className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-blue-700 px-5 py-2 text-sm font-extrabold text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-45"
          >
            Periksa Jawaban
          </button>
        </div>
      )}

      {/* Tiered Hint Box */}
      {hintLevel > 0 && !isDone && !activeVariant && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs font-medium text-amber-950 dark:border-amber-700 dark:bg-amber-950/60 dark:text-amber-100 sm:text-sm">
          <div className="font-extrabold">Petunjuk Tingkat {hintLevel}/3:</div>
          <p className="mt-0.5">{question.hints[hintLevel - 1]}</p>
        </div>
      )}

      {/* Feedback Box: Reason + Source + Optional Variant Practice */}
      {isDone && (
        <div
          data-testid="answer-feedback"
          className={`rounded-xl border p-4 ${
            isOkNow
              ? "border-emerald-300 bg-emerald-50 text-emerald-950 dark:border-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-100"
              : "border-rose-300 bg-rose-50 text-rose-950 dark:border-rose-700 dark:bg-rose-950/50 dark:text-rose-100"
          }`}
        >
          <div className="flex items-center gap-2 font-extrabold">
            {isOkNow ? (
              <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            ) : (
              <XCircle className="h-5 w-5 text-rose-600 dark:text-rose-400" />
            )}
            <span>
              {isOkNow
                ? "Tepat sekali!"
                : "Belum tepat — masuk daftar 'Perlu Diulang'."}
            </span>
          </div>

          {!isOkNow && (
            <p className="mt-1.5 text-xs font-bold sm:text-sm">
              Kunci Jawaban:{" "}
              <span className="hanzi-text">
                {Array.isArray(currentAnswer)
                  ? currentAnswer.join(" ")
                  : typeof currentAnswer === "boolean"
                    ? currentAnswer
                      ? "Benar (对)"
                      : "Salah (错)"
                    : typeof currentAnswer === "number" && currentOptions
                      ? currentOptions[currentAnswer]
                      : String(currentAnswer)}
              </span>
            </p>
          )}

          <p className="mt-1.5 text-xs leading-relaxed sm:text-sm">
            <strong>Alasan:</strong> {currentExplain}
          </p>
          <p className="mt-1 text-[11px] font-semibold opacity-80">
            Sumber: {question.source}
          </p>

          <div className="mt-3 flex flex-wrap gap-2">
            {allowRetryOnWrong && !isOkNow && (
              <button
                type="button"
                data-testid="retry-step-btn"
                onClick={handleRetrySameQuestion}
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-rose-700 px-4 py-1.5 text-xs font-extrabold text-white hover:bg-rose-800"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Coba Lagi Langkah Ini
              </button>
            )}

            {!isOkNow && !activeVariant && question.variant && (
              <button
                type="button"
                data-testid="practice-variant-btn"
                onClick={launchVariantRetry}
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-rose-400 bg-white px-3.5 py-1.5 text-xs font-bold text-rose-900 hover:bg-rose-100 dark:border-rose-700 dark:bg-slate-900 dark:text-rose-200"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Latih Soal Serupa (Konteks Baru)
              </button>
            )}

            {onNext && (!allowRetryOnWrong || isOkNow) && (
              <button
                type="button"
                data-testid="next-question-btn"
                onClick={onNext}
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-1.5 text-xs font-bold text-white hover:bg-slate-800 dark:bg-blue-700 dark:hover:bg-blue-600"
              >
                {nextLabel}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
