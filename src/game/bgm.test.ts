import test from "node:test";
import assert from "node:assert/strict";
import { getBgmSceneScore, PENTATONIC_HZ, resolveBgmMood, type BgmMood } from "./bgm";

test("resolveBgmMood selects appropriate mood and pauses for mute, pause, or Live Voice Lab", () => {
  const titleState = resolveBgmMood({
    enabled: true,
    muted: false,
    gameState: "title",
    graduationMode: false,
    studyOpen: false,
    voiceLabOpen: false,
  });
  assert.equal(titleState.mood, "title");
  assert.equal(titleState.shouldPlay, true);

  const campusState = resolveBgmMood({
    enabled: true,
    muted: false,
    gameState: "playing",
    graduationMode: false,
    studyOpen: false,
    voiceLabOpen: false,
  });
  assert.equal(campusState.mood, "campus");
  assert.equal(campusState.shouldPlay, true);

  const studyState = resolveBgmMood({
    enabled: true,
    muted: false,
    gameState: "playing",
    graduationMode: false,
    studyOpen: true,
    voiceLabOpen: false,
  });
  assert.equal(studyState.mood, "study");
  assert.equal(studyState.shouldPlay, true);
  assert.ok(studyState.targetGain < campusState.targetGain);

  const gradState = resolveBgmMood({
    enabled: true,
    muted: false,
    gameState: "playing",
    graduationMode: true,
    studyOpen: false,
    voiceLabOpen: false,
  });
  assert.equal(gradState.mood, "graduation");
  assert.equal(gradState.shouldPlay, true);
  assert.ok(gradState.targetGain >= campusState.targetGain);

  const voiceLabPaused = resolveBgmMood({
    enabled: true,
    muted: false,
    gameState: "playing",
    graduationMode: false,
    studyOpen: false,
    voiceLabOpen: true,
  });
  assert.equal(voiceLabPaused.shouldPlay, false);
  assert.equal(voiceLabPaused.targetGain, 0);

  const disabledState = resolveBgmMood({
    enabled: false,
    muted: false,
    gameState: "playing",
    graduationMode: false,
    studyOpen: false,
    voiceLabOpen: false,
  });
  assert.equal(disabledState.shouldPlay, false);
});

test("getBgmSceneScore provides valid D-major pentatonic patterns across all moods", () => {
  const validFreqs = new Set<number>(Object.values(PENTATONIC_HZ));
  const moods: BgmMood[] = ["title", "campus", "study", "graduation"];

  for (const mood of moods) {
    const score = getBgmSceneScore(mood);
    assert.ok(score.bpm >= 60 && score.bpm <= 130);
    assert.equal(score.guzhengSteps.length, 32);
    assert.equal(score.diziSteps.length, 32);
    assert.equal(score.padRoots.length, 32);
    assert.equal(score.chimeSteps.length, 32);

    for (const freq of score.guzhengSteps) {
      if (freq !== null) {
        assert.ok(validFreqs.has(freq), `Unexpected non-pentatonic note in ${mood}: ${freq}`);
      }
    }
    for (const step of score.diziSteps) {
      if (step !== null) {
        assert.ok(validFreqs.has(step.freq), `Unexpected dizi note in ${mood}: ${step.freq}`);
        assert.ok(step.beats > 0);
      }
    }
  }
});
