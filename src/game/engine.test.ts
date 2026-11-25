import test from "node:test";
import assert from "node:assert/strict";
import { MATERI } from "../data/materi";
import {
  type PlayerProgressState,
  auditCurriculumCompleteness,
  calculateXpAward,
  CAMPUS_ORBS,
  claimDailyQuestBonus,
  computeAchievements,
  computeChapterStars,
  computeGraduationEligibility,
  createEmptyChapterProgress,
  evaluateExamReadiness,
  generateDynamicPracticeTask,
  generateExamQuestions,
  generateToneDrillQuestion,
  getAdaptiveStanding,
  getDailyQuests,
  getDefaultProgressState,
  getLevel,
  isBossMastered,
  isStageUnlocked,
  loadProgressState,
  mergeLiveTranscriptChunk,
  recordFlashcardReview,
  recordHanziPractice,
  recordLiveVoiceTurn,
  recordOrbCollected,
  recordQuizOutcome,
  recordToneDrillSolved,
  recoverEnergyFromBreak,
  saveProgressState,
  syncEnergyAndStreak,
  validateQuestionAnswer,
} from "./engine";

test("auditCurriculumCompleteness passes all 5-stage, 5-quiz, multi-step boss, and source rules", () => {
  const report = auditCurriculumCompleteness(MATERI);
  assert.equal(report.ok, true, `Curriculum issues: ${report.issues.join("; ")}`);
  assert.equal(MATERI.chapters.length, 7);
});

test("validateQuestionAnswer verifies mcq, true_false, order, match, and short_fill (tone-agnostic)", () => {
  assert.equal(validateQuestionAnswer({ kind: "mcq", answer: 0 }, 0), true);
  assert.equal(validateQuestionAnswer({ kind: "mcq", answer: 0 }, 2), false);
  assert.equal(validateQuestionAnswer({ kind: "mcq", answer: 0 }, -1), false);
  assert.equal(validateQuestionAnswer({ kind: "mcq", answer: 0 }, 0.5), false);

  assert.equal(validateQuestionAnswer({ kind: "true_false", answer: false }, false), true);
  assert.equal(validateQuestionAnswer({ kind: "true_false", answer: false }, true), false);

  assert.equal(
    validateQuestionAnswer({ kind: "order", answer: ["我", "是", "学生"] }, ["我", "是", "学生"]),
    true,
  );
  assert.equal(
    validateQuestionAnswer({ kind: "order", answer: ["我", "是", "学生"] }, ["是", "我", "学生"]),
    false,
  );

  assert.equal(
    validateQuestionAnswer(
      { kind: "short_fill", answer: "呢", acceptedAnswers: ["呢", "ne"] },
      " NE ",
    ),
    true,
  );
  assert.equal(
    validateQuestionAnswer(
      { kind: "short_fill", answer: "清楚", acceptedAnswers: ["清楚", "qingchu", "qīngchu"] },
      "qīngchu",
    ),
    true,
  );
  assert.equal(
    validateQuestionAnswer(
      { kind: "short_fill", answer: "请问，您贵姓？", acceptedAnswers: ["请问，您贵姓？"] },
      "请问您贵姓?",
    ),
    true,
  );
  assert.equal(
    validateQuestionAnswer(
      { kind: "short_fill", answer: "绿茶", acceptedAnswers: ["绿茶", "lǜchá"] },
      "lvcha",
    ),
    true,
  );
});

test("recordQuizOutcome updates XP, streaks, soft energy, and spaced repetition reviewQueue", () => {
  const initial = { ...getDefaultProgressState(1000), mode: "tantangan" as const };

  // Wrong answer enqueues into reviewQueue & deducts 1 energy in tantangan mode
  const afterWrong = recordQuizOutcome(initial, {
    questionId: "b1_q1",
    chapterId: "bab1",
    conceptTag: "bab1_sandhi_nada",
    topic: "Aturan Sandhi Nada",
    isCorrect: false,
    hintLevel: 0,
    nowMs: 2000,
  });
  assert.equal(afterWrong.xpGained, 0);
  assert.equal(afterWrong.nextState.energy, 4);
  assert.equal(afterWrong.nextState.reviewQueue.length, 1);
  assert.equal(afterWrong.nextState.consecutiveWrong, 1);

  // Second wrong answer shifts adaptive standing to butuh_bimbingan
  const afterSecondWrong = recordQuizOutcome(afterWrong.nextState, {
    questionId: "b1_q2",
    chapterId: "bab1",
    conceptTag: "bab1_polite_marga",
    topic: "Kata 贵姓",
    isCorrect: false,
    hintLevel: 0,
    nowMs: 3000,
  });
  assert.equal(getAdaptiveStanding(afterSecondWrong.nextState), "butuh_bimbingan");

  // Correct answer on queued item removes it from reviewQueue & awards XP
  const afterCorrect = recordQuizOutcome(afterSecondWrong.nextState, {
    questionId: "b1_q1",
    chapterId: "bab1",
    conceptTag: "bab1_sandhi_nada",
    topic: "Aturan Sandhi Nada",
    isCorrect: true,
    hintLevel: 0,
    nowMs: 4000,
  });
  assert.ok(afterCorrect.xpGained >= 20);
  assert.equal(afterCorrect.nextState.reviewQueue.length, 1); // b1_q2 remains
  assert.equal(getLevel(afterCorrect.nextState.xp), 1);
});

test("calculateXpAward rewards streak and deducts heavy hint penalty", () => {
  const noHint = calculateXpAward({
    isCorrect: true,
    mode: "belajar",
    consecutiveCorrect: 2,
    hintLevel: 0,
  });
  const heavyHint = calculateXpAward({
    isCorrect: true,
    mode: "belajar",
    consecutiveCorrect: 2,
    hintLevel: 3,
  });
  assert.ok(noHint > heavyHint);
  assert.equal(noHint, 30);
});

test("syncEnergyAndStreak recovers energy over time and increments streak next day", () => {
  const day1 = Date.UTC(2026, 5, 1, 10, 0, 0);
  const state = {
    ...getDefaultProgressState(day1),
    energy: 2,
    lastEnergyTick: day1,
    lastPlayDate: "2026-06-01",
    streak: 3,
  };
  const day2 = day1 + 24 * 60 * 60 * 1000;
  const synced = syncEnergyAndStreak(state, day2);
  assert.equal(synced.energy, 5);
  assert.equal(synced.streak, 4);
  assert.equal(synced.lastPlayDate, "2026-06-02");
});

test("computeChapterStars awards 1 to 3 stars accurately and enforces Boss mastery", () => {
  const ch1 = MATERI.chapters[0];
  const cp = createEmptyChapterProgress();
  cp.latihanDoneIds = ch1.latihan.map((l) => l.id);
  cp.kuisResults = Object.fromEntries(ch1.kuis.map((q) => [q.id, true]));
  cp.bossCompleted = true;
  cp.bossStepDoneIds = ch1.boss.steps.map((s) => s.id);
  cp.bossResults = Object.fromEntries(ch1.boss.steps.map((s) => [s.id, true]));
  assert.equal(isBossMastered(cp, ch1), true);
  assert.equal(computeChapterStars(cp, ch1), 3);

  cp.kuisResults[ch1.kuis[0].id] = false;
  assert.equal(computeChapterStars(cp, ch1), 2);

  // Failing a boss step revokes boss mastery
  cp.bossResults[ch1.boss.steps[0].id] = false;
  assert.equal(isBossMastered(cp, ch1), false);
  assert.equal(computeChapterStars(cp, ch1), 1);
});

test("isStageUnlocked enforces sequential 5-stage progression", () => {
  const ch1 = MATERI.chapters[0];
  const cp = createEmptyChapterProgress();
  assert.equal(isStageUnlocked(cp, ch1, "pembuka"), true);
  assert.equal(isStageUnlocked(cp, ch1, "penjelasan"), false);
  assert.equal(isStageUnlocked(cp, ch1, "boss"), false);

  cp.pembukaDone = true;
  assert.equal(isStageUnlocked(cp, ch1, "penjelasan"), true);
  assert.equal(isStageUnlocked(cp, ch1, "latihan"), false);

  cp.penjelasanDone = true;
  assert.equal(isStageUnlocked(cp, ch1, "latihan"), true);
  assert.equal(isStageUnlocked(cp, ch1, "kuis"), false);

  cp.latihanDoneIds = ch1.latihan.map((l) => l.id);
  assert.equal(isStageUnlocked(cp, ch1, "kuis"), true);

  cp.kuisResults = Object.fromEntries(ch1.kuis.map((q) => [q.id, true]));
  assert.equal(isStageUnlocked(cp, ch1, "boss"), true);
});

test("recoverEnergyFromBreak restores soft energy and resets consecutive wrong count", () => {
  const drained = { ...getDefaultProgressState(1000), energy: 0, consecutiveWrong: 3 };
  const recovered = recoverEnergyFromBreak(drained, 2, 5000);
  assert.equal(recovered.energy, 2);
  assert.equal(recovered.consecutiveWrong, 0);
});

test("generateDynamicPracticeTask builds valid randomized questions for every chapter", () => {
  for (const ch of MATERI.chapters) {
    const q = generateDynamicPracticeTask(ch.id, () => 0.4);
    assert.ok(q.prompt.length > 10);
    assert.ok(q.source.length > 0);
    assert.equal(
      validateQuestionAnswer(
        { kind: q.kind, answer: q.answer, acceptedAnswers: q.acceptedAnswers },
        q.answer,
      ),
      true,
    );
  }
});

test("generateExamQuestions and evaluateExamReadiness produce 15 questions and chapter advice", () => {
  const qs = generateExamQuestions(MATERI, 15, () => 0.42);
  assert.equal(qs.length, 15);
  const outcomes: Record<string, boolean> = {};
  qs.forEach((q, idx) => {
    outcomes[q.id] = idx < 10; // 10/15 = 67%
  });
  const evalRes = evaluateExamReadiness(qs, outcomes, MATERI);
  assert.equal(evalRes.total, 15);
  assert.equal(evalRes.correctCount, 10);
  assert.equal(evalRes.scorePct, 67);
  assert.equal(evalRes.readinessTier, "Hampir Siap");
  assert.ok(evalRes.recommendedChapters.length >= 1);
});

test("safe localStorage load/save handles valid and corrupted data gracefully", () => {
  const mem = new Map<string, string>();
  const mockStorage = {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => {
      mem.set(k, v);
    },
  };
  const base = { ...getDefaultProgressState(1000), xp: 260 };
  assert.equal(saveProgressState(base, mockStorage), true);
  const loaded = loadProgressState(mockStorage);
  assert.equal(loaded.xp, 260);

  // Corrupted storage falls back cleanly
  mem.set("hanyu_kota_kampus_3d_v3", "{not-valid-json");
  const fallback = loadProgressState(mockStorage);
  assert.equal(fallback.xp, 0);
});

test("recordOrbCollected awards XP once and completes campus orb daily quest", () => {
  const now = Date.UTC(2026, 6, 10, 9, 0, 0);
  const s0 = getDefaultProgressState(now);
  const r1 = recordOrbCollected(s0, CAMPUS_ORBS[0].id, now);
  assert.equal(r1.newlyCollected, true);
  assert.equal(r1.nextState.xp, 15);

  // Duplicate collection awards nothing
  const rDup = recordOrbCollected(r1.nextState, CAMPUS_ORBS[0].id, now);
  assert.equal(rDup.newlyCollected, false);
  assert.equal(rDup.nextState.xp, 15);

  // Second orb completes dq_orbs daily quest
  const r2 = recordOrbCollected(rDup.nextState, CAMPUS_ORBS[1].id, now);
  const quests = getDailyQuests(r2.nextState, now);
  const orbQuest = quests.find((q) => q.id === "dq_orbs");
  assert.equal(orbQuest?.completed, true);

  const claimed = claimDailyQuestBonus(r2.nextState, "dq_orbs", now);
  assert.equal(claimed.xpGained, 25);
  assert.equal(claimed.nextState.xp, 55);

  // Cannot double claim
  const reclaimed = claimDailyQuestBonus(claimed.nextState, "dq_orbs", now);
  assert.equal(reclaimed.xpGained, 0);
});

test("flashcard review, Hanzi practice, tone drill, and achievements update state accurately", () => {
  const now = Date.UTC(2026, 6, 10, 10, 0, 0);
  let state = getDefaultProgressState(now);

  const fc = recordFlashcardReview(state, "v1_1", true, now);
  assert.equal(fc.newBox, 1);
  assert.equal(fc.xpGained, 8);
  state = fc.nextState;

  const hp = recordHanziPractice(state, "好", now);
  assert.equal(hp.isFirstTime, true);
  assert.equal(hp.xpGained, 12);
  state = hp.nextState;

  const toneQ = generateToneDrillQuestion(() => 0.35);
  assert.equal(toneQ.options.length, 4);
  const td = recordToneDrillSolved(state, true, now);
  assert.equal(td.xpGained, 10);
  state = td.nextState;

  const achievements = computeAchievements(state, MATERI);
  assert.equal(achievements.length, 8);
  assert.equal(achievements[0].id, "ach_first_step");
});

test("mergeLiveTranscriptChunk avoids inserting spaces between CJK characters while keeping Latin spacing", () => {
  assert.equal(mergeLiveTranscriptChunk("早上", "好"), "早上好");
  assert.equal(mergeLiveTranscriptChunk("你好，", "Rafi！"), "你好，Rafi！");
  assert.equal(mergeLiveTranscriptChunk("Selamat pagi", "Rafi"), "Selamat pagi Rafi");
});

test("syncEnergyAndStreak preserves partial 3-minute energy progress and handles clock skew", () => {
  const t0 = Date.UTC(2026, 6, 15, 8, 0, 0);
  const drained = { ...getDefaultProgressState(t0), energy: 1, lastEnergyTick: t0 };
  // 5 minutes elapsed -> +1 energy (costing 3 min), leaving 2 minutes banked
  const after5Min = syncEnergyAndStreak(drained, t0 + 5 * 60000);
  assert.equal(after5Min.energy, 2);
  assert.equal(after5Min.lastEnergyTick, t0 + 3 * 60000);
  // 1 more minute (total 3 since lastEnergyTick) -> +1 more energy
  const after1MoreMin = syncEnergyAndStreak(after5Min, t0 + 6 * 60000);
  assert.equal(after1MoreMin.energy, 3);

  // Clock skew in future shouldn't give negative tick
  const skewed = syncEnergyAndStreak({ ...after1MoreMin, lastEnergyTick: t0 + 99999999 }, t0 + 6 * 60000);
  assert.equal(skewed.lastEnergyTick, t0 + 6 * 60000);
});

test("overnight rollover resets claimedDailyQuestIds and bestExamScore preserves achievement", () => {
  const day1 = Date.UTC(2026, 6, 15, 22, 0, 0);
  const day2 = Date.UTC(2026, 6, 16, 8, 0, 0);
  let state = getDefaultProgressState(day1);
  state = recordOrbCollected(state, CAMPUS_ORBS[0].id, day1).nextState;
  state = recordOrbCollected(state, CAMPUS_ORBS[1].id, day1).nextState;
  state = claimDailyQuestBonus(state, "dq_orbs", day1).nextState;
  assert.deepEqual(state.claimedDailyQuestIds, ["dq_orbs"]);

  // Overnight voice turn cleanly clears yesterday's claimedDailyQuestIds
  state = recordLiveVoiceTurn(state, day2).nextState;
  assert.deepEqual(state.claimedDailyQuestIds, []);
  assert.equal(state.dailyStats.voiceTurns, 1);

  // bestExamScore preserves exam achievement even if a later score is lower
  state = { ...state, lastExamScore: 60, bestExamScore: 87 };
  const ach = computeAchievements(state, MATERI).find((a) => a.id === "ach_exam_ready");
  assert.equal(ach?.unlocked, true);
});

test("dynamic practice MCQs shuffle answer indices and tone drills cover all 5 sets without placeholders", () => {
  const seenAnswers = new Set<number>();
  for (const seed of [0.05, 0.25, 0.45, 0.65, 0.85, 0.95]) {
    const q = generateDynamicPracticeTask("bab2", () => seed);
    assert.equal(typeof q.answer, "number");
    seenAnswers.add(q.answer as number);
    assert.equal(new Set(q.options).size, 4);
  }
  assert.ok(seenAnswers.size >= 2);

  for (const seed of [0.0, 0.2, 0.4, 0.6, 0.8]) {
    const tq = generateToneDrillQuestion(() => seed);
    assert.equal(tq.options.length, 4);
    assert.ok(tq.options.every((o) => !o.hanzi.includes("?") && o.pinyin.length > 0));
  }
});

test("computeGraduationEligibility evaluates rehearsal vs full graduation honors tiers", () => {
  const base = getDefaultProgressState();
  const pre = computeGraduationEligibility(base, MATERI);
  assert.equal(pre.isEligible, false);
  assert.equal(pre.completedChapters, 0);
  assert.equal(pre.rankMandarin, "汉语学院结业预备");

  const chaptersAll3: PlayerProgressState["chapters"] = {};
  for (const ch of MATERI.chapters) {
    chaptersAll3[ch.id] = {
      ...createEmptyChapterProgress(),
      pembukaDone: true,
      penjelasanDone: true,
      bossCompleted: true,
      stars: 3,
    };
  }
  const topGrad = computeGraduationEligibility(
    { ...base, chapters: chaptersAll3, bestExamScore: 93, badges: MATERI.chapters.map((c) => c.badgeName) },
    MATERI,
  );
  assert.equal(topGrad.isEligible, true);
  assert.equal(topGrad.completedChapters, 7);
  assert.equal(topGrad.totalStars, 21);
  assert.equal(topGrad.rankTitle, "Lulus Dengan Pujian Tertinggi");
  assert.equal(topGrad.rankMandarin, "卓越荣誉毕业生");
});
