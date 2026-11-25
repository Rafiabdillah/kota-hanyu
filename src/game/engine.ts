import type {
  ChapterData,
  ChapterStageId,
  GameMode,
  MateriBundle,
  QuizQuestion,
} from "../data/types";

export const STORAGE_KEY = "hanyu_kota_kampus_3d_v3";
export const MAX_ENERGY = 5;

export interface ReviewItem {
  questionId: string;
  chapterId: string;
  conceptTag: string;
  topic: string;
  wrongCount: number;
  lastWrongAt: number;
}

export interface ChapterProgress {
  pembukaDone: boolean;
  penjelasanDone: boolean;
  latihanDoneIds: string[];
  kuisResults: Record<string, boolean>; // questionId -> first-try or solved correctly
  bossStepDoneIds: string[];
  bossResults?: Record<string, boolean>; // stepId -> solved correctly
  bossCompleted: boolean;
  stars: number; // 0..3
}

export interface DailyStats {
  date: string;
  quizzesSolved: number;
  orbsCollected: number;
  voiceTurns: number;
  flashcardsReviewed: number;
  hanziPracticed: number;
}

export interface PlayerProgressState {
  xp: number;
  energy: number;
  lastEnergyTick: number;
  streak: number;
  lastPlayDate: string;
  mode: GameMode;
  theme: "light" | "dark";
  muted: boolean;
  bgmEnabled: boolean;
  naturalTtsEnabled: boolean;
  speechRate: number;
  activeChapterId: string;
  badges: string[];
  chapters: Record<string, ChapterProgress>;
  reviewQueue: ReviewItem[];
  conceptMistakes: Record<string, { chapterId: string; topic: string; count: number }>;
  consecutiveCorrect: number;
  consecutiveWrong: number;
  bestCombo: number;
  liveVoiceTurns: number;
  lastExamScore: number | null;
  bestExamScore?: number | null;
  collectedOrbIds: string[];
  flashcardMastery: Record<string, number>; // vocabId -> box 0..3
  practicedHanzi: string[];
  toneDrillsSolved: number;
  dailyStats: DailyStats;
  claimedDailyQuestIds: string[];
}

export function createEmptyChapterProgress(): ChapterProgress {
  return {
    pembukaDone: false,
    penjelasanDone: false,
    latihanDoneIds: [],
    kuisResults: {},
    bossStepDoneIds: [],
    bossResults: {},
    bossCompleted: false,
    stars: 0,
  };
}

export function createEmptyDailyStats(date: string): DailyStats {
  return {
    date,
    quizzesSolved: 0,
    orbsCollected: 0,
    voiceTurns: 0,
    flashcardsReviewed: 0,
    hanziPracticed: 0,
  };
}

export function getDefaultProgressState(nowMs = Date.now()): PlayerProgressState {
  const today = new Date(nowMs).toISOString().slice(0, 10);
  return {
    xp: 0,
    energy: MAX_ENERGY,
    lastEnergyTick: nowMs,
    streak: 1,
    lastPlayDate: today,
    mode: "belajar",
    theme: "light",
    muted: false,
    bgmEnabled: true,
    naturalTtsEnabled: true,
    speechRate: 0.88,
    activeChapterId: "bab1",
    badges: [],
    chapters: {},
    reviewQueue: [],
    conceptMistakes: {},
    consecutiveCorrect: 0,
    consecutiveWrong: 0,
    bestCombo: 0,
    liveVoiceTurns: 0,
    lastExamScore: null,
    bestExamScore: null,
    collectedOrbIds: [],
    flashcardMastery: {},
    practicedHanzi: [],
    toneDrillsSolved: 0,
    dailyStats: createEmptyDailyStats(today),
    claimedDailyQuestIds: [],
  };
}

function resolveDailyState(
  state: Pick<PlayerProgressState, "dailyStats" | "claimedDailyQuestIds">,
  nowMs: number,
): { dailyStats: DailyStats; claimedDailyQuestIds: string[]; today: string } {
  const today = new Date(nowMs).toISOString().slice(0, 10);
  const sameDay = Boolean(state.dailyStats && state.dailyStats.date === today);
  return {
    today,
    dailyStats: sameDay ? { ...state.dailyStats } : createEmptyDailyStats(today),
    claimedDailyQuestIds:
      sameDay && Array.isArray(state.claimedDailyQuestIds)
        ? [...state.claimedDailyQuestIds]
        : [],
  };
}

export function syncEnergyAndStreak(
  state: PlayerProgressState,
  nowMs = Date.now(),
): PlayerProgressState {
  const { today, dailyStats, claimedDailyQuestIds } = resolveDailyState(state, nowMs);
  const clampedEnergy = Math.max(
    0,
    Math.min(MAX_ENERGY, Number.isFinite(state.energy) ? Math.floor(state.energy) : MAX_ENERGY),
  );
  const safeXp = Number.isFinite(state.xp) ? Math.max(0, state.xp) : 0;
  const safeSpeechRate =
    typeof state.speechRate === "number" && Number.isFinite(state.speechRate)
      ? Math.max(0.6, Math.min(1.3, state.speechRate))
      : 0.88;

  const next: PlayerProgressState = {
    ...state,
    xp: safeXp,
    energy: clampedEnergy,
    speechRate: safeSpeechRate,
    bestExamScore:
      state.bestExamScore ?? (state.lastExamScore !== null ? state.lastExamScore : null),
    chapters: { ...state.chapters },
    badges: [...state.badges],
    reviewQueue: [...state.reviewQueue],
    conceptMistakes: { ...state.conceptMistakes },
    collectedOrbIds: Array.isArray(state.collectedOrbIds) ? [...state.collectedOrbIds] : [],
    flashcardMastery: { ...(state.flashcardMastery ?? {}) },
    practicedHanzi: Array.isArray(state.practicedHanzi) ? [...state.practicedHanzi] : [],
    dailyStats,
    claimedDailyQuestIds,
  };

  const baseTick =
    typeof next.lastEnergyTick === "number" && Number.isFinite(next.lastEnergyTick)
      ? Math.min(nowMs, next.lastEnergyTick)
      : nowMs;
  const energyIntervalMs = 3 * 60000;
  const elapsedMs = Math.max(0, nowMs - baseTick);

  if (next.energy >= MAX_ENERGY) {
    next.lastEnergyTick = nowMs;
  } else {
    const recover = Math.min(MAX_ENERGY - next.energy, Math.floor(elapsedMs / energyIntervalMs));
    if (recover > 0) {
      next.energy += recover;
      next.lastEnergyTick =
        next.energy >= MAX_ENERGY ? nowMs : baseTick + recover * energyIntervalMs;
    } else {
      next.lastEnergyTick = baseTick;
    }
  }

  if (next.lastPlayDate !== today) {
    const yesterday = new Date(nowMs - 86400000).toISOString().slice(0, 10);
    next.streak = next.lastPlayDate === yesterday ? Math.max(1, next.streak) + 1 : 1;
    next.lastPlayDate = today;
  }

  return next;
}

export function loadProgressState(storage?: Pick<Storage, "getItem">): PlayerProgressState {
  try {
    const store = storage ?? (typeof window !== "undefined" ? window.localStorage : undefined);
    if (!store) return getDefaultProgressState();
    const raw = store.getItem(STORAGE_KEY);
    if (!raw) return getDefaultProgressState();
    const parsed = JSON.parse(raw) as Partial<PlayerProgressState>;
    const defaults = getDefaultProgressState();
    const validChapterIds = new Set(["bab1", "bab2", "bab3", "bab4", "bab5", "bab6", "bab7"]);
    const merged: PlayerProgressState = {
      ...defaults,
      ...parsed,
      activeChapterId:
        typeof parsed.activeChapterId === "string" && validChapterIds.has(parsed.activeChapterId)
          ? parsed.activeChapterId
          : defaults.activeChapterId,
      chapters: parsed.chapters ?? {},
      bgmEnabled:
        typeof parsed.bgmEnabled === "boolean" ? parsed.bgmEnabled : defaults.bgmEnabled,
      badges: Array.isArray(parsed.badges) ? parsed.badges : [],
      reviewQueue: Array.isArray(parsed.reviewQueue) ? parsed.reviewQueue : [],
      conceptMistakes: parsed.conceptMistakes ?? {},
      collectedOrbIds: Array.isArray(parsed.collectedOrbIds) ? parsed.collectedOrbIds : [],
      flashcardMastery: parsed.flashcardMastery ?? {},
      practicedHanzi: Array.isArray(parsed.practicedHanzi) ? parsed.practicedHanzi : [],
      dailyStats: parsed.dailyStats ?? defaults.dailyStats,
      claimedDailyQuestIds: Array.isArray(parsed.claimedDailyQuestIds)
        ? parsed.claimedDailyQuestIds
        : [],
    };
    return syncEnergyAndStreak(merged);
  } catch {
    return getDefaultProgressState();
  }
}

export function saveProgressState(
  state: PlayerProgressState,
  storage?: Pick<Storage, "setItem">,
): boolean {
  try {
    const store = storage ?? (typeof window !== "undefined" ? window.localStorage : undefined);
    if (!store) return false;
    store.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export function clearProgressState(
  storage?: Pick<Storage, "removeItem">,
): PlayerProgressState {
  try {
    const store = storage ?? (typeof window !== "undefined" ? window.localStorage : undefined);
    store?.removeItem(STORAGE_KEY);
  } catch {
    // ignore storage restriction
  }
  return getDefaultProgressState();
}

export function getLevel(xp: number): number {
  return Math.max(1, Math.floor(xp / 120) + 1);
}

export function getLevelProgress(xp: number): {
  level: number;
  currentInLevel: number;
  nextThreshold: number;
  pct: number;
} {
  const level = getLevel(xp);
  const currentInLevel = xp % 120;
  return {
    level,
    currentInLevel,
    nextThreshold: 120,
    pct: Math.round((currentInLevel / 120) * 100),
  };
}

export function getChapterProgress(
  state: PlayerProgressState,
  chapterId: string,
): ChapterProgress {
  return state.chapters[chapterId] ?? createEmptyChapterProgress();
}

export function isBossMastered(
  cp: ChapterProgress,
  chapter: ChapterData,
): boolean {
  if (!cp.bossCompleted) return false;
  const results = cp.bossResults ?? {};
  // Backwards compatibility if bossStepDoneIds existed without bossResults
  if (Object.keys(results).length === 0) {
    return cp.bossStepDoneIds.length >= chapter.boss.steps.length;
  }
  return chapter.boss.steps.every((step) => results[step.id] === true);
}

export function computeChapterStars(
  cp: ChapterProgress,
  chapter: ChapterData,
): number {
  const latihanComplete = cp.latihanDoneIds.length >= chapter.latihan.length;
  const quizValues = Object.values(cp.kuisResults);
  const quizDone = quizValues.length >= chapter.kuis.length;
  const correctQuizCount = quizValues.filter(Boolean).length;

  if (!isBossMastered(cp, chapter)) {
    if (latihanComplete && quizDone) return 1;
    return 0;
  }
  if (correctQuizCount >= chapter.kuis.length && latihanComplete) return 3;
  if (correctQuizCount >= Math.ceil(chapter.kuis.length * 0.6)) return 2;
  return 1;
}

export function isStageUnlocked(
  cp: ChapterProgress,
  chapter: ChapterData,
  stage: ChapterStageId,
): boolean {
  if (stage === "pembuka") return true;
  if (stage === "penjelasan") {
    return cp.pembukaDone || cp.penjelasanDone || cp.latihanDoneIds.length > 0;
  }
  if (stage === "latihan") {
    return cp.penjelasanDone || cp.latihanDoneIds.length > 0 || Object.keys(cp.kuisResults).length > 0;
  }
  if (stage === "kuis") {
    return cp.latihanDoneIds.length >= chapter.latihan.length || Object.keys(cp.kuisResults).length > 0;
  }
  // boss
  return Object.keys(cp.kuisResults).length >= chapter.kuis.length || cp.bossCompleted;
}

export function getCompletedStagesCount(
  cp: ChapterProgress,
  chapter: ChapterData,
): number {
  let count = 0;
  if (cp.pembukaDone) count += 1;
  if (cp.penjelasanDone) count += 1;
  if (cp.latihanDoneIds.length >= chapter.latihan.length) count += 1;
  if (Object.keys(cp.kuisResults).length >= chapter.kuis.length) count += 1;
  if (isBossMastered(cp, chapter)) count += 1;
  return count;
}

export function getRecommendedStage(
  cp: ChapterProgress,
  chapter: ChapterData,
): ChapterStageId {
  if (!cp.pembukaDone) return "pembuka";
  if (!cp.penjelasanDone) return "penjelasan";
  if (cp.latihanDoneIds.length < chapter.latihan.length) return "latihan";
  if (Object.keys(cp.kuisResults).length < chapter.kuis.length) return "kuis";
  return "boss";
}

export function recoverEnergyFromBreak(
  state: PlayerProgressState,
  amount = 2,
  nowMs = Date.now(),
): PlayerProgressState {
  return {
    ...state,
    energy: Math.min(MAX_ENERGY, state.energy + amount),
    lastEnergyTick: nowMs,
    consecutiveWrong: 0,
  };
}

export type AdaptiveStanding = "mantap" | "normal" | "butuh_bimbingan";

export function getAdaptiveStanding(state: PlayerProgressState): AdaptiveStanding {
  if (state.consecutiveWrong >= 2) return "butuh_bimbingan";
  if (state.consecutiveCorrect >= 3) return "mantap";
  return "normal";
}

export function calculateXpAward(params: {
  isCorrect: boolean;
  mode: GameMode;
  consecutiveCorrect: number;
  hintLevel: number;
}): number {
  if (!params.isCorrect) return 0;
  const base = params.mode === "tantangan" ? 30 : params.mode === "ujian" ? 35 : 20;
  const streakBonus = Math.min(15, params.consecutiveCorrect * 5);
  const hintPenalty = params.hintLevel >= 3 ? 10 : params.hintLevel === 2 ? 5 : 0;
  return Math.max(10, base + streakBonus - hintPenalty);
}

const PUNCT_AND_SPACE_RE = /[\s.,!?;:'"’‘“”`~()[\]{}，。！？；：、（）【】《》—\-·…]+/g;

export function stripToneMarks(text: string): string {
  return text
    .replace(/ü/gi, "u")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(PUNCT_AND_SPACE_RE, "")
    .toLowerCase()
    .trim();
}

export function validateQuestionAnswer(
  q: {
    kind: QuizQuestion["kind"];
    answer: QuizQuestion["answer"];
    acceptedAnswers?: string[];
  },
  userInput: number | boolean | string[] | string | null,
): boolean {
  if (userInput === null || userInput === undefined) return false;
  if (q.kind === "mcq") {
    return (
      typeof userInput === "number" &&
      Number.isInteger(userInput) &&
      userInput >= 0 &&
      userInput === q.answer
    );
  }
  if (q.kind === "true_false") {
    return typeof userInput === "boolean" && userInput === q.answer;
  }
  if (q.kind === "order" || q.kind === "match") {
    if (!Array.isArray(userInput) || !Array.isArray(q.answer)) return false;
    if (userInput.length !== q.answer.length) return false;
    return q.answer.every((val, idx) => String(userInput[idx]).trim() === String(val).trim());
  }
  if (q.kind === "short_fill") {
    if (typeof userInput !== "string") return false;
    const normalizedInput = stripToneMarks(userInput);
    if (!normalizedInput) return false;
    const vNormalized = normalizedInput.replace(/v/g, "u");
    const pool = q.acceptedAnswers?.length ? q.acceptedAnswers : [String(q.answer)];
    return pool.some((candidate) => {
      const targetNorm = stripToneMarks(candidate);
      return (
        targetNorm === normalizedInput ||
        (targetNorm.length > 0 && targetNorm.replace(/v/g, "u") === vNormalized)
      );
    });
  }
  return false;
}

export function recordQuizOutcome(
  state: PlayerProgressState,
  params: {
    questionId: string;
    chapterId: string;
    conceptTag: string;
    topic: string;
    isCorrect: boolean;
    hintLevel: number;
    nowMs?: number;
  },
): { nextState: PlayerProgressState; xpGained: number } {
  const nowMs = params.nowMs ?? Date.now();
  const xpGained = calculateXpAward({
    isCorrect: params.isCorrect,
    mode: state.mode,
    consecutiveCorrect: state.consecutiveCorrect,
    hintLevel: params.hintLevel,
  });

  let reviewQueue = [...state.reviewQueue];
  const conceptMistakes = { ...state.conceptMistakes };

  if (params.isCorrect) {
    reviewQueue = reviewQueue.filter((item) => item.questionId !== params.questionId);
  } else {
    const existingIdx = reviewQueue.findIndex((r) => r.questionId === params.questionId);
    if (existingIdx >= 0) {
      reviewQueue[existingIdx] = {
        ...reviewQueue[existingIdx],
        wrongCount: reviewQueue[existingIdx].wrongCount + 1,
        lastWrongAt: nowMs,
      };
    } else {
      reviewQueue.push({
        questionId: params.questionId,
        chapterId: params.chapterId,
        conceptTag: params.conceptTag,
        topic: params.topic,
        wrongCount: 1,
        lastWrongAt: nowMs,
      });
    }

    const prevConcept = conceptMistakes[params.conceptTag];
    conceptMistakes[params.conceptTag] = {
      chapterId: params.chapterId,
      topic: params.topic,
      count: (prevConcept?.count ?? 0) + 1,
    };
  }

  const energyDelta =
    !params.isCorrect && (state.mode === "tantangan" || state.mode === "ujian")
      ? -1
      : 0;

  const nextCombo = params.isCorrect ? state.consecutiveCorrect + 1 : 0;
  const { dailyStats, claimedDailyQuestIds } = resolveDailyState(state, nowMs);

  const nextState: PlayerProgressState = {
    ...state,
    xp: state.xp + xpGained,
    energy: Math.max(0, Math.min(MAX_ENERGY, state.energy + energyDelta)),
    lastEnergyTick: energyDelta < 0 ? nowMs : state.lastEnergyTick,
    consecutiveCorrect: nextCombo,
    consecutiveWrong: params.isCorrect ? 0 : state.consecutiveWrong + 1,
    bestCombo: Math.max(state.bestCombo ?? 0, nextCombo),
    dailyStats: {
      ...dailyStats,
      quizzesSolved: dailyStats.quizzesSolved + (params.isCorrect ? 1 : 0),
    },
    claimedDailyQuestIds,
    reviewQueue,
    conceptMistakes,
  };

  return { nextState, xpGained };
}

export function getDueReviewItemsForChapter(
  state: PlayerProgressState,
  activeChapterId: string,
  chapterOrderMap: Record<string, number>,
): ReviewItem[] {
  const activeOrder = chapterOrderMap[activeChapterId] ?? 1;
  return state.reviewQueue.filter((item) => {
    const originOrder = chapterOrderMap[item.chapterId] ?? 1;
    // Muncul ulang di bab berikutnya (atau bab yang sama jika belum tuntas)
    return activeOrder >= originOrder;
  });
}

export interface WeakSpotEntry {
  conceptTag: string;
  chapterId: string;
  chapterTitle: string;
  topic: string;
  mistakeCount: number;
  pendingReviewCount: number;
}

export function getWeakSpots(
  state: PlayerProgressState,
  materi: MateriBundle,
): WeakSpotEntry[] {
  const chapterMap = Object.fromEntries(materi.chapters.map((c) => [c.id, c]));
  const pendingByConcept: Record<string, number> = {};
  for (const r of state.reviewQueue) {
    pendingByConcept[r.conceptTag] = (pendingByConcept[r.conceptTag] ?? 0) + 1;
  }

  return Object.entries(state.conceptMistakes)
    .map(([conceptTag, info]) => ({
      conceptTag,
      chapterId: info.chapterId,
      chapterTitle: chapterMap[info.chapterId]?.shortTitle ?? info.chapterId,
      topic: info.topic,
      mistakeCount: info.count,
      pendingReviewCount: pendingByConcept[conceptTag] ?? 0,
    }))
    .sort((a, b) => b.mistakeCount - a.mistakeCount || b.pendingReviewCount - a.pendingReviewCount);
}

export function generateExamQuestions(
  materi: MateriBundle,
  count = 15,
  rng: () => number = Math.random,
): QuizQuestion[] {
  const allQuestions = materi.chapters.flatMap((ch) => ch.kuis);
  const shuffled = [...allQuestions];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, Math.min(count, shuffled.length));
}

export interface ExamEvaluation {
  total: number;
  correctCount: number;
  scorePct: number;
  readinessTier: "Siap Ujian" | "Hampir Siap" | "Perlu Penguatan";
  recommendedChapters: { chapterId: string; title: string; missed: number }[];
}

export function evaluateExamReadiness(
  questions: QuizQuestion[],
  outcomes: Record<string, boolean>,
  materi: MateriBundle,
): ExamEvaluation {
  const total = questions.length;
  let correctCount = 0;
  const missedByChapter: Record<string, number> = {};

  for (const q of questions) {
    if (outcomes[q.id]) {
      correctCount += 1;
    } else {
      missedByChapter[q.chapterId] = (missedByChapter[q.chapterId] ?? 0) + 1;
    }
  }

  const scorePct = total > 0 ? Math.round((correctCount / total) * 100) : 0;
  const readinessTier =
    scorePct >= 80 ? "Siap Ujian" : scorePct >= 60 ? "Hampir Siap" : "Perlu Penguatan";

  const chapterLookup = Object.fromEntries(materi.chapters.map((c) => [c.id, c.title]));
  const recommendedChapters = Object.entries(missedByChapter)
    .map(([chapterId, missed]) => ({
      chapterId,
      title: chapterLookup[chapterId] ?? chapterId,
      missed,
    }))
    .sort((a, b) => b.missed - a.missed);

  return {
    total,
    correctCount,
    scorePct,
    readinessTier,
    recommendedChapters,
  };
}

function auditQuestionIntegrity(
  label: string,
  q: {
    kind: QuizQuestion["kind"];
    options?: string[];
    tokens?: string[];
    pairs?: { left: string; right: string }[];
    acceptedAnswers?: string[];
    answer: QuizQuestion["answer"];
    hints?: [string, string, string];
    explain: string;
    source?: string;
  },
  issues: string[],
  requireSource = true,
): void {
  if (!q.explain?.trim()) issues.push(`${label}: missing explain`);
  if (requireSource && !q.source?.trim()) issues.push(`${label}: missing source`);
  if (q.hints) {
    if (q.hints.length !== 3 || q.hints.some((h) => !h.trim())) {
      issues.push(`${label}: must have 3 non-empty hints`);
    }
  }

  if (q.kind === "mcq") {
    if (!Array.isArray(q.options) || q.options.length < 2) {
      issues.push(`${label}: mcq needs >= 2 options`);
    } else {
      const normalizedOpts = q.options.map((o) => o.trim());
      if (normalizedOpts.some((o) => !o)) {
        issues.push(`${label}: mcq contains blank option`);
      }
      if (new Set(normalizedOpts).size !== normalizedOpts.length) {
        issues.push(`${label}: mcq has duplicate options`);
      }
      if (typeof q.answer !== "number" || !Number.isInteger(q.answer) || q.answer < 0 || q.answer >= q.options.length) {
        issues.push(`${label}: mcq answer index ${String(q.answer)} out of bounds`);
      }
    }
  } else if (q.kind === "true_false") {
    if (typeof q.answer !== "boolean") {
      issues.push(`${label}: true_false answer must be boolean`);
    }
  } else if (q.kind === "order") {
    if (!Array.isArray(q.tokens) || q.tokens.length < 2 || !Array.isArray(q.answer)) {
      issues.push(`${label}: order needs >= 2 tokens and array answer`);
    } else if (q.tokens.length !== q.answer.length) {
      issues.push(`${label}: order tokens/answer length mismatch`);
    } else {
      const sortedT = [...q.tokens].sort();
      const sortedA = [...q.answer].sort();
      if (sortedT.some((val, idx) => val !== sortedA[idx])) {
        issues.push(`${label}: order tokens do not match answer tokens`);
      }
    }
  } else if (q.kind === "match") {
    if (!Array.isArray(q.pairs) || q.pairs.length < 2 || !Array.isArray(q.answer)) {
      issues.push(`${label}: match needs >= 2 pairs and array answer`);
    } else if (q.pairs.length !== q.answer.length) {
      issues.push(`${label}: match pairs/answer length mismatch`);
    } else {
      const leftSet = new Set(q.pairs.map((p) => p.left));
      const rightSet = new Set(q.pairs.map((p) => p.right));
      if (leftSet.size !== q.pairs.length || rightSet.size !== q.pairs.length) {
        issues.push(`${label}: match pairs must have unique left and right values`);
      }
      const ansArr = q.answer;
      if (q.pairs.some((p, i) => p.right !== ansArr[i])) {
        issues.push(`${label}: match answer order must align with pairs.right`);
      }
    }
  } else if (q.kind === "short_fill") {
    if (typeof q.answer !== "string" || !stripToneMarks(q.answer)) {
      issues.push(`${label}: short_fill needs non-empty canonical answer`);
    }
    const checkList = q.acceptedAnswers?.length ? q.acceptedAnswers : [String(q.answer)];
    for (const candidate of checkList) {
      if (!validateQuestionAnswer(q, candidate)) {
        issues.push(`${label}: short_fill candidate "${candidate}" failed validation`);
      }
    }
  }
}

export function auditCurriculumCompleteness(materi: MateriBundle): {
  ok: boolean;
  issues: string[];
} {
  const issues: string[] = [];
  if (materi.chapters.length < 7) {
    issues.push(`Expected at least 7 chapters, got ${materi.chapters.length}`);
  }
  const seenChapterIds = new Set<string>();
  const seenVocabIds = new Set<string>();
  const seenQuestionIds = new Set<string>();

  for (const v of materi.vocabBank) {
    if (seenVocabIds.has(v.id)) {
      issues.push(`Duplicate vocabBank id: ${v.id}`);
    }
    seenVocabIds.add(v.id);
    if (!v.hanzi.trim() || !v.pinyin.trim() || !v.meaning.trim() || !v.source.trim()) {
      issues.push(`vocabBank ${v.id}: incomplete entry`);
    }
  }

  for (let i = 0; i < materi.chapters.length; i += 1) {
    const ch = materi.chapters[i];
    if (seenChapterIds.has(ch.id)) {
      issues.push(`Duplicate chapter id: ${ch.id}`);
    }
    seenChapterIds.add(ch.id);
    if (ch.order !== i + 1) {
      issues.push(`${ch.id}: expected order ${i + 1}, got ${ch.order}`);
    }
    if (!ch.pembuka.storyHook || !ch.pembuka.source) {
      issues.push(`${ch.id}: missing pembuka`);
    }
    if (ch.penjelasan.screens.length === 0) {
      issues.push(`${ch.id}: missing penjelasan screens`);
    }
    for (const scr of ch.penjelasan.screens) {
      if (scr.sentences.length > 4) {
        issues.push(`${ch.id}: screen "${scr.title}" exceeds 4 sentences`);
      }
    }
    if (ch.latihan.length < 2) {
      issues.push(`${ch.id}: needs at least 2 latihan tasks`);
    }
    for (const task of ch.latihan) {
      const normalizedKind: QuizQuestion["kind"] =
        task.kind === "order"
          ? "order"
          : task.kind === "polite_rewrite" && !task.options
            ? "short_fill"
            : "mcq";
      auditQuestionIntegrity(
        `${ch.id} latihan ${task.id}`,
        {
          kind: normalizedKind,
          options: task.options,
          tokens: task.tokens,
          acceptedAnswers: task.acceptedAnswers,
          answer: task.answer,
          hints: task.hints,
          explain: task.explain,
          source: task.source,
        },
        issues,
      );
    }
    if (ch.kuis.length !== 5) {
      issues.push(`${ch.id}: expected 5 quiz questions, got ${ch.kuis.length}`);
    }
    for (const q of ch.kuis) {
      if (seenQuestionIds.has(q.id)) {
        issues.push(`Duplicate quiz id: ${q.id}`);
      }
      seenQuestionIds.add(q.id);
      auditQuestionIntegrity(`${ch.id} quiz ${q.id}`, q, issues);
      if (!q.variant || !q.variant.explain) {
        issues.push(`${ch.id} quiz ${q.id}: missing wrong-answer retry variant`);
      } else {
        auditQuestionIntegrity(
          `${ch.id} quiz ${q.id} variant`,
          {
            kind: q.kind,
            options: q.variant.options,
            tokens: q.variant.tokens,
            pairs: q.variant.pairs,
            acceptedAnswers: q.variant.acceptedAnswers,
            answer: q.variant.answer,
            explain: q.variant.explain,
          },
          issues,
          false,
        );
      }
    }
    if (ch.boss.steps.length < 2) {
      issues.push(`${ch.id}: boss must be multi-step (>= 2 steps)`);
    }
    for (const step of ch.boss.steps) {
      auditQuestionIntegrity(`${ch.id} boss ${step.id}`, step, issues);
    }
  }

  for (const orb of CAMPUS_ORBS) {
    if (!seenChapterIds.has(orb.chapterId)) {
      issues.push(`CAMPUS_ORBS ${orb.id}: unknown chapterId ${orb.chapterId}`);
    }
  }

  for (const toneSet of TONE_SETS) {
    const tones = new Set(toneSet.items.map((x) => x.tone));
    if (toneSet.items.length !== 4 || tones.size !== 4) {
      issues.push(`TONE_SETS ${toneSet.base}: must contain tones 1..4`);
    }
    if (toneSet.items.some((x) => x.hanzi.includes("?") || !x.hanzi.trim() || !x.pinyin.trim())) {
      issues.push(`TONE_SETS ${toneSet.base}: invalid placeholder character`);
    }
  }

  return { ok: issues.length === 0, issues };
}

export interface DynamicGeneratedQuestion {
  id: string;
  kind: "mcq" | "order" | "short_fill";
  topic: string;
  prompt: string;
  hanzi?: string;
  pinyin?: string;
  audioText?: string;
  options?: string[];
  tokens?: string[];
  placeholder?: string;
  acceptedAnswers?: string[];
  answer: number | string[] | string;
  hints: [string, string, string];
  explain: string;
  source: string;
  isTambahan: boolean;
}

const MANDARIN_NUMS = ["", "一", "两", "三", "四", "五", "六", "七", "八", "九", "十"];

function pickIdx(len: number, rng: () => number): number {
  return Math.min(len - 1, Math.max(0, Math.floor(rng() * len)));
}

function buildShuffledMcqOptions(
  correct: string,
  wrongs: string[],
  rng: () => number,
): { options: string[]; answer: number } {
  const uniqueWrongs = Array.from(new Set(wrongs.filter((w) => w && w !== correct))).slice(0, 3);
  const list = [correct, ...uniqueWrongs];
  for (let i = list.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return {
    options: list,
    answer: list.indexOf(correct),
  };
}

export function generateDynamicPracticeTask(
  chapterId: string,
  rng: () => number = Math.random,
): DynamicGeneratedQuestion {
  const uid = Math.floor(rng() * 100000);

  if (chapterId === "bab1") {
    const slots = [
      {
        time: "07:30 pagi",
        hanzi: "早上好",
        pinyin: "zǎoshang hǎo",
        wrong: ["晚上好", "再见", "没关系"],
      },
      {
        time: "14:00 siang",
        hanzi: "下午好",
        pinyin: "xiàwǔ hǎo",
        wrong: ["早上好", "晚上好", "对不起"],
      },
      {
        time: "20:00 malam",
        hanzi: "晚上好",
        pinyin: "wǎnshang hǎo",
        wrong: ["早上好", "下午好", "不客气"],
      },
    ];
    const picked = slots[pickIdx(slots.length, rng)];
    if (uid % 2 === 0) {
      return {
        id: `dyn_bab1_${uid}`,
        kind: "short_fill",
        topic: "Tulis Ulang Lebih Sopan (Acak)",
        prompt: "Ubah pertanyaan kasual '你姓什么？' menjadi pertanyaan marga paling sopan untuk dosen (tulis Hanzi atau Pinyin).",
        hanzi: "你姓什么？ → ?",
        pinyin: "Nǐ xìng shénme?",
        placeholder: "Contoh: 请问，您贵姓？ atau qingwen nin guixing",
        acceptedAnswers: ["请问，您贵姓？", "请问您贵姓", "您贵姓", "qingwenninguixing", "ninguixing"],
        answer: "请问，您贵姓？",
        hints: [
          "Mulai dengan kata permisi sopan 请问 (qǐngwèn).",
          "Gunakan kata ganti hormat 您 dan 贵姓.",
          "Jawaban: 请问，您贵姓？",
        ],
        explain: "Bentuk hormat baku dari Speaking Pelajaran 4 adalah 请问，您贵姓？",
        source: "Speaking L4 hlm. 26–28",
        isTambahan: false,
      };
    }
    const mcq = buildShuffledMcqOptions(picked.hanzi, picked.wrong, rng);
    return {
      id: `dyn_bab1_${uid}`,
      kind: "mcq",
      topic: "Latihan Sapaan Waktu Dinamis",
      prompt: `Kamu bertemu Lǎoshī Lín di gerbang kampus pukul ${picked.time}. Sapaan yang tepat adalah "老师，____！"`,
      audioText: `老师，${picked.hanzi}！`,
      options: mcq.options,
      answer: mcq.answer,
      hints: [
        `Perhatikan jam pertemuan: ${picked.time}.`,
        `Sapaan yang sesuai berbunyi ${picked.pinyin}.`,
        `Kunci: ${picked.hanzi}.`,
      ],
      explain: `${picked.hanzi} (${picked.pinyin}) dipakai tepat untuk pukul ${picked.time}.`,
      source: "Speaking L1–L2 hlm. 2–10",
      isTambahan: true,
    };
  }

  if (chapterId === "bab2") {
    const qty = 2 + pickIdx(5, rng); // 2..6
    const items = [
      { noun: "书", label: "buku kamus", unit: "本", unitPy: "běn", wrong: ["口", "位", "条"] },
      { noun: "人", label: "anggota keluarga", unit: "口", unitPy: "kǒu", wrong: ["本", "张", "辆"] },
      { noun: "老师", label: "dosen", unit: "位", unitPy: "wèi", wrong: ["本", "口", "双"] },
    ];
    const it = items[pickIdx(items.length, rng)];
    const numHanzi = qty === 2 ? "两" : MANDARIN_NUMS[qty];
    const correctPhrase = `${numHanzi}${it.unit}${it.noun}`;
    const mcq = buildShuffledMcqOptions(
      correctPhrase,
      [
        `${qty === 2 ? "二" : numHanzi}${it.wrong[0]}${it.noun}`,
        `${numHanzi}${it.wrong[1]}${it.noun}`,
        `${numHanzi}${it.wrong[2]}${it.noun}`,
      ],
      rng,
    );
    return {
      id: `dyn_bab2_${uid}`,
      kind: "mcq",
      topic: "Generator Angka & Kata Satuan",
      prompt: `Rafi menghitung ada ${qty} ${it.label}. Bentuk frasa Mandarin yang paling baku adalah...`,
      hanzi: `${qty} ${it.label} → ?`,
      options: mcq.options,
      answer: mcq.answer,
      hints: [
        `Kata satuan untuk ${it.label} adalah ${it.unit} (${it.unitPy}).`,
        qty === 2 ? "Ingat: angka 2 di depan kata satuan memakai 两, bukan 二." : `Angka ${qty} adalah ${numHanzi}.`,
        `Kunci: ${correctPhrase}.`,
      ],
      explain: `Struktur baku Pelajaran 6 Speaking adalah [Angka] + [${it.unit}] + [${it.noun}] → ${correctPhrase}.`,
      source: "Speaking L6 hlm. 41–46; Listening L5 hlm. 22–26",
      isTambahan: true,
    };
  }

  if (chapterId === "bab3") {
    if (uid % 2 === 0) {
      const fruitPrice = 4 + pickIdx(4, rng); // 4..7 kuai
      const jinCount = 2 + pickIdx(2, rng); // 2..3 jin
      const waterPrice = 2 + pickIdx(2, rng); // 2..3 kuai
      const total = fruitPrice * jinCount + waterPrice;
      const numFruit = MANDARIN_NUMS[fruitPrice];
      const numJin = jinCount === 2 ? "两" : MANDARIN_NUMS[jinCount];
      const numWater = waterPrice === 2 ? "两" : MANDARIN_NUMS[waterPrice];
      return {
        id: `dyn_bab3_${uid}`,
        kind: "short_fill",
        topic: "Generator Hitungan Belanja Pasar",
        prompt: `Hitung total harga (tulis angkanya saja): Apel ${fruitPrice} 块一斤 (${numFruit}块), Rafi beli ${jinCount} 斤 (${numJin}斤) + 1 botol air ${waterPrice} 块 (${numWater}块). 一共多少块？`,
        hanzi: `苹果 ${fruitPrice}块/斤 × ${jinCount}斤 + 水 ${waterPrice}块 = ?`,
        audioText: `苹果${numFruit}块一斤，我要${numJin}斤，再要一瓶水${numWater}块。一共多少钱？`,
        placeholder: "Ketik angka totalnya (misal: 13)",
        acceptedAnswers: [String(total), `${total}块`, `${total}kuai`],
        answer: String(total),
        hints: [
          `Harga apel = ${fruitPrice} × ${jinCount} = ${fruitPrice * jinCount} 块.`,
          `Tambahkan air ${waterPrice} 块: ${fruitPrice * jinCount} + ${waterPrice}.`,
          `Totalnya ${total} 块.`,
        ],
        explain: `(${fruitPrice} × ${jinCount}) + ${waterPrice} = ${total} 块 (一共${total}块).`,
        source: "Speaking L7 hlm. 49–52; Listening L6 hlm. 28–32",
        isTambahan: true,
      };
    }

    const clocks = [
      { label: "07:45", correct: "差一刻八点", wrong: ["八点一刻", "七点半", "差半点八点"] },
      { label: "08:15", correct: "八点一刻", wrong: ["差一刻八点", "八点半", "七点三刻"] },
      { label: "09:30", correct: "九点半", wrong: ["差半点十点", "九点一刻", "差一刻九点"] },
      { label: "10:50", correct: "差十分十一点", wrong: ["十一点十分", "十点一刻", "差一刻十点"] },
    ];
    const clk = clocks[pickIdx(clocks.length, rng)];
    const mcq = buildShuffledMcqOptions(clk.correct, clk.wrong, rng);
    return {
      id: `dyn_bab3_${uid}`,
      kind: "mcq",
      topic: "Generator Membaca Jam Kampus",
      prompt: `Jam dinding kelas menunjukkan pukul ${clk.label}. Cara membacanya dalam Mandarin adalah...`,
      hanzi: `${clk.label} → ?`,
      options: mcq.options,
      answer: mcq.answer,
      hints: [
        "一刻 = 15 menit, 半 = 30 menit, 差 = kurang.",
        "Jika lewat setengah jam menjelang jam berikutnya, sering dipakai pola 差.",
        `Kunci: ${clk.correct}.`,
      ],
      explain: `Pukul ${clk.label} dibaca ${clk.correct} sesuai Speaking Pelajaran 10.`,
      source: "Speaking L10 hlm. 72–76; Listening L9 hlm. 44–47",
      isTambahan: true,
    };
  }

  if (chapterId === "bab4") {
    const places = [
      { target: "中国银行", ref: "学校", pos: "对面", posMean: "di seberang", wrong: "银行在学校的对面还是前面" },
      { target: "超市", ref: "银行", pos: "旁边", posMean: "di samping", wrong: "超市在银行里面" },
      { target: "留学生宿舍", ref: "教学楼", pos: "后边", posMean: "di belakang", wrong: "宿舍在教学楼对面" },
    ];
    const p = places[pickIdx(places.length, rng)];
    return {
      id: `dyn_bab4_${uid}`,
      kind: "order",
      topic: "Generator Kalimat Lokasi & Arah",
      prompt: `Susun kalimat: '${p.target} berada ${p.posMean} ${p.ref}.'`,
      tokens: [p.target, "在", p.ref, "的", p.pos],
      answer: [p.target, "在", p.ref, "的", p.pos],
      hints: [
        `Mulai dengan tempat yang dicari (${p.target}) + 在.`,
        `Tempat patokan (${p.ref}) diletakkan sebelum posisi (${p.pos}).`,
        `Urutan: ${p.target} 在 ${p.ref} 的 ${p.pos}.`,
      ],
      explain: "Struktur posisi wajib: [Tempat A] + 在 + [Patokan B] + 的 + [Posisi].",
      source: "Speaking L8 hlm. 56–60; Listening L7 hlm. 33–36",
      isTambahan: true,
    };
  }

  if (chapterId === "bab5") {
    const habits = [
      { a1: "下课", a2: "去食堂", mean: "Begitu selesai kelas, saya langsung pergi ke kantin." },
      { a1: "回家", a2: "喝热水", mean: "Begitu pulang ke rumah, saya langsung minum air hangat." },
      { a1: "起床", a2: "去上课", mean: "Begitu bangun tidur, saya langsung pergi masuk kelas." },
    ];
    const h = habits[pickIdx(habits.length, rng)];
    return {
      id: `dyn_bab5_${uid}`,
      kind: "order",
      topic: "Generator Pola 一……就……",
      prompt: `Susun kalimat: '${h.mean}'`,
      tokens: ["我", "一", h.a1, "就", h.a2],
      answer: ["我", "一", h.a1, "就", h.a2],
      hints: [
        "Karena subjeknya sama (我), letakkan 我 di awal sebelum 一.",
        `Urutkan aksi pertama (${h.a1}) setelah 一, lalu 就 + ${h.a2}.`,
        `Urutan: 我 一 ${h.a1} 就 ${h.a2}.`,
      ],
      explain: "Subjek tunggal diletakkan di depan 一 pada pola [Subjek + 一 + V1 + 就 + V2].",
      source: "Listening L14 hlm. 69–72; Speaking L18 hlm. 136",
      isTambahan: true,
    };
  }

  if (chapterId === "bab6") {
    const baItems = [
      { obj: "词典", verb: "放在", loc: "桌子上", mean: "letakkan kamus di atas meja" },
      { obj: "护照", verb: "放在", loc: "包里", mean: "letakkan paspor di dalam tas" },
      { obj: "照片", verb: "贴在", loc: "墙上", mean: "tempelkan foto di dinding" },
    ];
    const b = baItems[pickIdx(baItems.length, rng)];
    return {
      id: `dyn_bab6_${uid}`,
      kind: "order",
      topic: "Generator Kalimat Perlakuan 把",
      prompt: `Susun kalimat perintah sopan: 'Tolong kamu ${b.mean}.'`,
      tokens: ["请", "你", "把", b.obj, b.verb, b.loc],
      answer: ["请", "你", "把", b.obj, b.verb, b.loc],
      hints: [
        "Awali dengan 请 你, diikuti 把 + Objek.",
        `Akhiri dengan kata kerja berpelengkap lokasi (${b.verb} + ${b.loc}).`,
        `Urutan: 请 你 把 ${b.obj} ${b.verb} ${b.loc}.`,
      ],
      explain: "Pola baku kalimat 把 menempatkan objek sebelum kata kerja + hasil/posisi.",
      source: "Speaking L20 hlm. 152–158; Listening L21 hlm. 111",
      isTambahan: true,
    };
  }

  // bab7 default: AA制 split calculation
  const totals = [
    { total: 80, people: 4 },
    { total: 90, people: 3 },
    { total: 100, people: 5 },
    { total: 120, people: 4 },
  ];
  const split = totals[pickIdx(totals.length, rng)];
  const each = split.total / split.people;
  return {
    id: `dyn_bab7_${uid}`,
    kind: "short_fill",
    topic: "Generator Hitungan Budaya AA制",
    prompt: `Rafi dan teman-teman makan 中餐 bersama dengan total tagihan ${split.total} 块 untuk ${split.people} orang. Jika mereka sepakat AA制, berapa 块 yang dibayar masing-masing orang?`,
    hanzi: `一共 ${split.total} 块 ÷ ${split.people} 人 (AA制) = ?`,
    placeholder: "Ketik angka per orang (misal: 25)",
    acceptedAnswers: [String(each), `${each}块`, `${each}kuai`],
    answer: String(each),
    hints: [
      "AA制 artinya membagi tagihan rata per orang.",
      `Hitung ${split.total} dibagi ${split.people}.`,
      `Masing-masing membayar ${each} 块.`,
    ],
    explain: `${split.total} 块 ÷ ${split.people} orang = ${each} 块 per orang saat menerapkan budaya AA制.`,
    source: "Listening L20 & L22 hlm. 104, 115–119",
    isTambahan: true,
  };
}

export interface CampusOrbDef {
  id: string;
  chapterId: string;
  shortHanzi: string;
  phrase: string;
  pinyin: string;
  meaning: string;
  worldPos: [number, number, number];
  accentHex: string;
  xpReward: number;
}

export const CAMPUS_ORBS: CampusOrbDef[] = [
  {
    id: "orb_bab1",
    chapterId: "bab1",
    shortHanzi: "好",
    phrase: "你好！",
    pinyin: "nǐ hǎo",
    meaning: "Halo! (Salam pembuka di Gerbang Kampus)",
    worldPos: [0, 0, 5.5],
    accentHex: "#2563eb",
    xpReward: 15,
  },
  {
    id: "orb_bab2",
    chapterId: "bab2",
    shortHanzi: "本",
    phrase: "两本书",
    pinyin: "liǎng běn shū",
    meaning: "Dua buah buku (pakai 两 di depan kata satuan)",
    worldPos: [-16, 0, 2],
    accentHex: "#0d9488",
    xpReward: 15,
  },
  {
    id: "orb_bab3",
    chapterId: "bab3",
    shortHanzi: "钱",
    phrase: "多少钱一斤？",
    pinyin: "duōshao qián yì jīn",
    meaning: "Berapa harganya per 500 gram?",
    worldPos: [16, 0, 2],
    accentHex: "#d97706",
    xpReward: 15,
  },
  {
    id: "orb_bab4",
    chapterId: "bab4",
    shortHanzi: "走",
    phrase: "一直往前走",
    pinyin: "yìzhí wǎng qián zǒu",
    meaning: "Jalan lurus ke depan",
    worldPos: [-28, 0, -24],
    accentHex: "#0284c7",
    xpReward: 15,
  },
  {
    id: "orb_bab5",
    chapterId: "bab5",
    shortHanzi: "热",
    phrase: "多喝热水",
    pinyin: "duō hē rè shuǐ",
    meaning: "Banyak minum air hangat (tips sehat kampus)",
    worldPos: [28, 0, -24],
    accentHex: "#dc2626",
    xpReward: 15,
  },
  {
    id: "orb_bab6",
    chapterId: "bab6",
    shortHanzi: "把",
    phrase: "把护照放在包里",
    pinyin: "bǎ hùzhào fàng zài bāo lǐ",
    meaning: "Taruh paspor di dalam tas",
    worldPos: [-16, 0, -48],
    accentHex: "#7c3aed",
    xpReward: 15,
  },
  {
    id: "orb_bab7",
    chapterId: "bab7",
    shortHanzi: "茶",
    phrase: "我们AA制吧",
    pinyin: "wǒmen AA zhì ba",
    meaning: "Mari kita patungan rata!",
    worldPos: [16, 0, -48],
    accentHex: "#0f766e",
    xpReward: 15,
  },
];

export function recordOrbCollected(
  state: PlayerProgressState,
  orbId: string,
  nowMs = Date.now(),
): { nextState: PlayerProgressState; orb: CampusOrbDef | null; newlyCollected: boolean } {
  const orb = CAMPUS_ORBS.find((o) => o.id === orbId) ?? null;
  if (!orb) return { nextState: state, orb: null, newlyCollected: false };
  if (state.collectedOrbIds.includes(orbId)) {
    return { nextState: state, orb, newlyCollected: false };
  }
  const { dailyStats, claimedDailyQuestIds } = resolveDailyState(state, nowMs);

  return {
    orb,
    newlyCollected: true,
    nextState: {
      ...state,
      xp: state.xp + orb.xpReward,
      collectedOrbIds: [...state.collectedOrbIds, orbId],
      dailyStats: {
        ...dailyStats,
        orbsCollected: dailyStats.orbsCollected + 1,
      },
      claimedDailyQuestIds,
    },
  };
}

export function recordFlashcardReview(
  state: PlayerProgressState,
  vocabId: string,
  knewIt: boolean,
  nowMs = Date.now(),
): { nextState: PlayerProgressState; xpGained: number; newBox: number } {
  const curBox = state.flashcardMastery[vocabId] ?? 0;
  const newBox = knewIt ? Math.min(3, curBox + 1) : 0;
  const xpGained = knewIt ? 8 : 3;
  const { dailyStats, claimedDailyQuestIds } = resolveDailyState(state, nowMs);

  return {
    xpGained,
    newBox,
    nextState: {
      ...state,
      xp: state.xp + xpGained,
      flashcardMastery: {
        ...state.flashcardMastery,
        [vocabId]: newBox,
      },
      dailyStats: {
        ...dailyStats,
        flashcardsReviewed: dailyStats.flashcardsReviewed + 1,
      },
      claimedDailyQuestIds,
    },
  };
}

export function recordHanziPractice(
  state: PlayerProgressState,
  hanziChar: string,
  nowMs = Date.now(),
): { nextState: PlayerProgressState; xpGained: number; isFirstTime: boolean } {
  const isFirstTime = !state.practicedHanzi.includes(hanziChar);
  const xpGained = isFirstTime ? 12 : 4;
  const { dailyStats, claimedDailyQuestIds } = resolveDailyState(state, nowMs);

  return {
    xpGained,
    isFirstTime,
    nextState: {
      ...state,
      xp: state.xp + xpGained,
      practicedHanzi: isFirstTime ? [...state.practicedHanzi, hanziChar] : state.practicedHanzi,
      dailyStats: {
        ...dailyStats,
        hanziPracticed: dailyStats.hanziPracticed + 1,
      },
      claimedDailyQuestIds,
    },
  };
}

export function recordToneDrillSolved(
  state: PlayerProgressState,
  isCorrect: boolean,
  nowMs = Date.now(),
): { nextState: PlayerProgressState; xpGained: number } {
  const xpGained = isCorrect ? 10 : 0;
  const { dailyStats, claimedDailyQuestIds } = resolveDailyState(state, nowMs);

  return {
    xpGained,
    nextState: {
      ...state,
      xp: state.xp + xpGained,
      toneDrillsSolved: state.toneDrillsSolved + (isCorrect ? 1 : 0),
      dailyStats: {
        ...dailyStats,
        quizzesSolved: dailyStats.quizzesSolved + (isCorrect ? 1 : 0),
      },
      claimedDailyQuestIds,
    },
  };
}

export function recordLiveVoiceTurn(
  state: PlayerProgressState,
  nowMs = Date.now(),
): { nextState: PlayerProgressState; xpGained: number } {
  const xpGained = 15;
  const { dailyStats, claimedDailyQuestIds } = resolveDailyState(state, nowMs);
  return {
    xpGained,
    nextState: {
      ...state,
      xp: state.xp + xpGained,
      liveVoiceTurns: state.liveVoiceTurns + 1,
      dailyStats: {
        ...dailyStats,
        voiceTurns: dailyStats.voiceTurns + 1,
      },
      claimedDailyQuestIds,
    },
  };
}

export interface DailyQuest {
  id: string;
  title: string;
  description: string;
  progress: number;
  target: number;
  rewardXp: number;
  completed: boolean;
  claimed: boolean;
}

export function getDailyQuests(state: PlayerProgressState, nowMs = Date.now()): DailyQuest[] {
  const { dailyStats: ds, claimedDailyQuestIds } = resolveDailyState(state, nowMs);
  const claimedSet = new Set(claimedDailyQuestIds);

  const studioAndVoiceProgress = ds.voiceTurns + ds.flashcardsReviewed + ds.hanziPracticed;

  const list = [
    {
      id: "dq_orbs",
      title: "Penjelajah Kampus",
      description: "Kumpulkan 2 Bola Aksara di sekitar kampus 3D",
      progress: Math.min(2, ds.orbsCollected),
      target: 2,
      rewardXp: 25,
    },
    {
      id: "dq_quiz",
      title: "Ketekunan Harian",
      description: "Selesaikan 3 soal latihan/kuis/nada dengan benar hari ini",
      progress: Math.min(3, ds.quizzesSolved),
      target: 3,
      rewardXp: 30,
    },
    {
      id: "dq_studio",
      title: "Latih Suara & Aksara",
      description: "Lakukan 3 aktivitas Suara Live, Kartu Kilat, atau Tulis Hanzi",
      progress: Math.min(3, studioAndVoiceProgress),
      target: 3,
      rewardXp: 35,
    },
  ];

  return list.map((q) => ({
    ...q,
    completed: q.progress >= q.target,
    claimed: claimedSet.has(q.id),
  }));
}

export function claimDailyQuestBonus(
  state: PlayerProgressState,
  questId: string,
  nowMs = Date.now(),
): { nextState: PlayerProgressState; xpGained: number } {
  const quests = getDailyQuests(state, nowMs);
  const target = quests.find((q) => q.id === questId);
  if (!target || !target.completed || target.claimed) {
    return { nextState: state, xpGained: 0 };
  }
  const { dailyStats, claimedDailyQuestIds } = resolveDailyState(state, nowMs);
  return {
    xpGained: target.rewardXp,
    nextState: {
      ...state,
      xp: state.xp + target.rewardXp,
      dailyStats,
      claimedDailyQuestIds: [...claimedDailyQuestIds, questId],
    },
  };
}

export interface ToneDrillQuestion {
  id: string;
  syllableBase: string;
  targetTone: 1 | 2 | 3 | 4;
  targetHanzi: string;
  targetPinyin: string;
  targetMeaning: string;
  options: { tone: 1 | 2 | 3 | 4; hanzi: string; pinyin: string; meaning: string }[];
}

const TONE_SETS: {
  base: string;
  items: { tone: 1 | 2 | 3 | 4; hanzi: string; pinyin: string; meaning: string }[];
}[] = [
  {
    base: "ma",
    items: [
      { tone: 1, hanzi: "妈", pinyin: "mā", meaning: "ibu" },
      { tone: 2, hanzi: "麻", pinyin: "má", meaning: "rami / kebas" },
      { tone: 3, hanzi: "马", pinyin: "mǎ", meaning: "kuda" },
      { tone: 4, hanzi: "骂", pinyin: "mà", meaning: "memarahi" },
    ],
  },
  {
    base: "shi",
    items: [
      { tone: 1, hanzi: "师", pinyin: "shī", meaning: "guru / ahli" },
      { tone: 2, hanzi: "十", pinyin: "shí", meaning: "sepuluh" },
      { tone: 3, hanzi: "史", pinyin: "shǐ", meaning: "sejarah" },
      { tone: 4, hanzi: "是", pinyin: "shì", meaning: "adalah / ya" },
    ],
  },
  {
    base: "wen",
    items: [
      { tone: 1, hanzi: "温", pinyin: "wēn", meaning: "hangat / suhu" },
      { tone: 2, hanzi: "文", pinyin: "wén", meaning: "bahasa / tulisan" },
      { tone: 3, hanzi: "吻", pinyin: "wěn", meaning: "ciuman" },
      { tone: 4, hanzi: "问", pinyin: "wèn", meaning: "bertanya" },
    ],
  },
  {
    base: "ba",
    items: [
      { tone: 1, hanzi: "八", pinyin: "bā", meaning: "delapan" },
      { tone: 2, hanzi: "拔", pinyin: "bá", meaning: "mencabut" },
      { tone: 3, hanzi: "把", pinyin: "bǎ", meaning: "memegang / partikel 把" },
      { tone: 4, hanzi: "爸", pinyin: "bà", meaning: "ayah" },
    ],
  },
  {
    base: "tang",
    items: [
      { tone: 1, hanzi: "汤", pinyin: "tāng", meaning: "sup / kuah" },
      { tone: 2, hanzi: "糖", pinyin: "táng", meaning: "gula / permen" },
      { tone: 3, hanzi: "躺", pinyin: "tǎng", meaning: "berbaring" },
      { tone: 4, hanzi: "烫", pinyin: "tàng", meaning: "panas (menyengat)" },
    ],
  },
];

export function generateToneDrillQuestion(
  rng: () => number = Math.random,
): ToneDrillQuestion {
  const set = TONE_SETS[pickIdx(TONE_SETS.length, rng)];
  const target = set.items[pickIdx(set.items.length, rng)];
  return {
    id: `tone_${set.base}_${target.tone}_${Math.floor(rng() * 10000)}`,
    syllableBase: set.base,
    targetTone: target.tone,
    targetHanzi: target.hanzi,
    targetPinyin: target.pinyin,
    targetMeaning: target.meaning,
    options: set.items,
  };
}

export interface AchievementBadge {
  id: string;
  title: string;
  description: string;
  unlocked: boolean;
  progressText: string;
}

export function computeAchievements(
  state: PlayerProgressState,
  materi: MateriBundle,
): AchievementBadge[] {
  const completedChapters = Object.values(state.chapters).filter((c) => c.stars > 0).length;
  const totalStars = Object.values(state.chapters).reduce((acc, c) => acc + c.stars, 0);
  const masteredCards = Object.values(state.flashcardMastery).filter((box) => box >= 2).length;

  return [
    {
      id: "ach_first_step",
      title: "Langkah Pertama Kampus",
      description: "Raih minimal 100 XP dari misi dan eksplorasi",
      unlocked: state.xp >= 100,
      progressText: `${Math.min(100, Math.round(state.xp))}/100 XP`,
    },
    {
      id: "ach_orb_hunter",
      title: "Pemburu Bola Aksara",
      description: "Kumpulkan seluruh 7 Bola Hanzi di taman kampus 3D",
      unlocked: state.collectedOrbIds.length >= CAMPUS_ORBS.length,
      progressText: `${state.collectedOrbIds.length}/${CAMPUS_ORBS.length} Bola`,
    },
    {
      id: "ach_combo_master",
      title: "Kombo Cerdas",
      description: "Capai kombo 5 jawaban benar berturut-turut",
      unlocked: (state.bestCombo ?? 0) >= 5,
      progressText: `Terbaik ${state.bestCombo ?? 0}/5`,
    },
    {
      id: "ach_voice_partner",
      title: "Rekan Bicara Lǎoshī",
      description: "Selesaikan 3 giliran percakapan di Suara Live Gemini",
      unlocked: state.liveVoiceTurns >= 3,
      progressText: `${Math.min(3, state.liveVoiceTurns)}/3 Giliran`,
    },
    {
      id: "ach_calligrapher",
      title: "Kaligrafer Pemula",
      description: "Latih menulis 5 karakter Hanzi di Studio 米字格",
      unlocked: state.practicedHanzi.length >= 5,
      progressText: `${Math.min(5, state.practicedHanzi.length)}/5 Hanzi`,
    },
    {
      id: "ach_flashcards",
      title: "Memori Baja",
      description: "Kuasai 8 kartu kosakata hingga kotak level 2+",
      unlocked: masteredCards >= 8,
      progressText: `${Math.min(8, masteredCards)}/8 Kartu`,
    },
    {
      id: "ach_seven_zones",
      title: "Penakluk 7 Zona",
      description: "Tuntaskan Boss di seluruh 7 bangunan kampus",
      unlocked: completedChapters >= materi.chapters.length,
      progressText: `${completedChapters}/${materi.chapters.length} Bab (${totalStars}★)`,
    },
    {
      id: "ach_exam_ready",
      title: "Siap Ujian Developing Chinese",
      description: "Raih skor 80% atau lebih pada Evaluasi 15 Soal",
      unlocked: Math.max(state.bestExamScore ?? 0, state.lastExamScore ?? 0) >= 80,
      progressText:
        (state.bestExamScore ?? state.lastExamScore) !== null
          ? `Terbaik ${Math.max(state.bestExamScore ?? 0, state.lastExamScore ?? 0)}%`
          : "Belum ujian",
    },
  ];
}

const CJK_BOUNDARY_RE = /[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/;

export function mergeLiveTranscriptChunk(existing: string, incoming: string): string {
  const next = incoming.trim();
  if (!next) return existing;
  if (!existing) return next;
  const lastChar = existing[existing.length - 1];
  const firstChar = next[0];
  // Avoid artificial spaces inside Chinese phrases while preserving spaces around Latin words
  if (CJK_BOUNDARY_RE.test(lastChar) || CJK_BOUNDARY_RE.test(firstChar)) {
    return `${existing}${next}`;
  }
  return `${existing} ${next}`.replace(/\s+/g, " ");
}

export interface GraduationSummary {
  isEligible: boolean;
  completedChapters: number;
  totalChapters: number;
  totalStars: number;
  maxStars: number;
  orbsCollected: number;
  totalOrbs: number;
  badgesCount: number;
  bestExamScore: number | null;
  statusLabel: string;
  rankTitle: string;
  rankMandarin: string;
  ceremonySpeech: string;
}

export function computeGraduationEligibility(
  state: PlayerProgressState,
  materi: MateriBundle,
): GraduationSummary {
  const totalChapters = materi.chapters.length;
  const completedChapters = materi.chapters.filter(
    (ch) => (state.chapters[ch.id]?.stars ?? 0) > 0,
  ).length;
  const totalStars = materi.chapters.reduce(
    (sum, ch) => sum + (state.chapters[ch.id]?.stars ?? 0),
    0,
  );
  const maxStars = totalChapters * 3;
  const orbsCollected = state.collectedOrbIds.length;
  const totalOrbs = CAMPUS_ORBS.length;
  const bestExamRaw =
    state.bestExamScore !== null && state.bestExamScore !== undefined
      ? Math.max(state.bestExamScore, state.lastExamScore ?? 0)
      : state.lastExamScore;
  const bestExamScore =
    typeof bestExamRaw === "number" && Number.isFinite(bestExamRaw) ? bestExamRaw : null;

  const isEligible = completedChapters >= totalChapters && totalChapters > 0;

  let rankTitle = "Calon Lulusan Kampus Hanyu";
  let rankMandarin = "汉语学院结业预备";
  let statusLabel = `Gladi Resik Wisuda (${completedChapters}/${totalChapters} Bab)`;
  let ceremonySpeech =
    "同学们好！欢迎来到汉语学院毕业典礼彩排！继续完成全部七章，正式毕业吧！";

  if (isEligible) {
    statusLabel = `Lulus Penuh · ${completedChapters}/${totalChapters} Zona`;
    ceremonySpeech =
      "祝贺你顺利完成《发展汉语·初级》全部课程！今天你正式从汉语学院毕业了，你真棒！";

    if (totalStars >= Math.ceil(maxStars * 0.85) && (bestExamScore ?? 0) >= 85) {
      rankTitle = "Lulus Dengan Pujian Tertinggi";
      rankMandarin = "卓越荣誉毕业生";
    } else if (totalStars >= Math.ceil(maxStars * 0.65)) {
      rankTitle = "Lulus Sangat Memuaskan";
      rankMandarin = "优秀毕业生";
    } else {
      rankTitle = "Lulus Kurikulum Dasar";
      rankMandarin = "汉语初级结业生";
    }
  }

  return {
    isEligible,
    completedChapters,
    totalChapters,
    totalStars,
    maxStars,
    orbsCollected,
    totalOrbs,
    badgesCount: state.badges.length,
    bestExamScore,
    statusLabel,
    rankTitle,
    rankMandarin,
    ceremonySpeech,
  };
}

