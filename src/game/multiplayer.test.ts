import test from "node:test";
import assert from "node:assert/strict";
import {
  applyMultiplayerServerEvent,
  buildHideSeekDirectionHint,
  buildRandomChatStudyCard,
  clampWorldCoords,
  COIN_PARTY_SPAWNS,
  computeQuizRoundPoints,
  DEFAULT_MULTIPLAYER_ROOM,
  generateCoinPartyItems,
  generateDefuseBombs,
  generateHiddenLanternOrbs,
  generateRaceOrbs,
  generateWordHunterWave,
  HIDDEN_LANTERN_SPOTS,
  isWithinVerticalReach,
  PARKOUR_CHECKPOINTS,
  pickQuizBattleQuestion,
  pickWordDashPrompt,
  QUIZ_BATTLE_BANK,
  sanitizeAvatarGender,
  sanitizeChapterId,
  sanitizeChatText,
  sanitizeColorHex,
  sanitizePlayerName,
  sanitizeRoomId,
  selectNextSeekerId,
  shouldEmitMovementDelta,
  WORD_HUNTER_CLUES,
  type MultiplayerChatEntry,
  type RemotePlayerSnapshot,
} from "./multiplayer.ts";
import { FLOOR_2_Y, WORLD_BOUNDS } from "./worldLayout.ts";

test("sanitizers normalize player names, room IDs, colors, and chat text safely", () => {
  assert.equal(sanitizePlayerName("  <script>Rafi  "), "scriptRafi");
  assert.equal(sanitizePlayerName("   "), "Mahasiswa");
  assert.equal(sanitizeRoomId("Kelas Pagi 01!!"), "kelas-pagi-01");
  assert.equal(sanitizeRoomId(""), DEFAULT_MULTIPLAYER_ROOM);
  assert.equal(sanitizeColorHex("#7C3AED"), "#7c3aed");
  assert.equal(sanitizeColorHex("red"), "#059669");
  assert.equal(sanitizeChatText("  你好！\n早上好  "), "你好！早上好");
  assert.equal(sanitizeChatText("a".repeat(120)).length, 90);
  assert.equal(sanitizeChapterId("BAB4"), "bab4");
  assert.equal(sanitizeChapterId("unknown"), "bab1");
  assert.equal(sanitizeAvatarGender("girl"), "girl");
  assert.equal(sanitizeAvatarGender("boy"), "boy");
  assert.equal(sanitizeAvatarGender("other"), "boy");
});

test("clampWorldCoords bounds coordinates within expanded open-world campus limits", () => {
  const clamped = clampWorldCoords(999, -5, -999, Number.NaN);
  assert.deepEqual(clamped, {
    x: WORLD_BOUNDS.maxX,
    y: 0,
    z: WORLD_BOUNDS.minZ,
    yaw: Math.PI,
  });
});

test("shouldEmitMovementDelta throttles static state and fires on movement or heartbeat", () => {
  const base = { x: 0, y: 0, z: 14, yaw: Math.PI, isSprinting: false, activeChapterId: "bab1" };
  assert.equal(shouldEmitMovementDelta(null, base, 0), true);
  assert.equal(shouldEmitMovementDelta(base, { ...base, x: 0.01 }, 100), false);
  assert.equal(shouldEmitMovementDelta(base, { ...base, x: 0.05 }, 100), true);
  assert.equal(shouldEmitMovementDelta(base, { ...base, isSprinting: true }, 50), true);
  assert.equal(shouldEmitMovementDelta(base, base, 1850), true);
});

test("applyMultiplayerServerEvent reconciles world:init, delta moves, social emotes, chats, and leaves idempotently", () => {
  const players = new Map<string, RemotePlayerSnapshot>();
  let chats: MultiplayerChatEntry[] = [];
  let selfId: string | null = null;

  const pSelf: RemotePlayerSnapshot = {
    id: "p1",
    name: "Rafi",
    colorHex: "#2563eb",
    x: 0,
    y: 0,
    z: 14,
    yaw: Math.PI,
    isSprinting: false,
    activeChapterId: "bab1",
    xp: 30,
    starsTotal: 1,
  };
  const pPeer: RemotePlayerSnapshot = {
    id: "p2",
    name: "Mei",
    colorHex: "#059669",
    x: 2,
    y: 0,
    z: 10,
    yaw: 0,
    isSprinting: false,
    activeChapterId: "bab2",
    xp: 60,
    starsTotal: 3,
  };

  let res = applyMultiplayerServerEvent(players, chats, selfId, {
    type: "world:init",
    selfId: "p1",
    roomId: "kampus-utama",
    players: [pSelf, pPeer],
    recentChats: [],
  });
  chats = res.nextChats;
  selfId = res.nextSelfId;
  assert.equal(players.has("p1"), false);
  assert.equal(players.size, 1);
  assert.equal(players.get("p2")?.name, "Mei");

  applyMultiplayerServerEvent(players, chats, selfId, {
    type: "player:joined",
    player: pPeer,
  });
  assert.equal(players.size, 1);

  applyMultiplayerServerEvent(players, chats, selfId, {
    type: "player:moved",
    id: "p2",
    x: 42.5,
    y: 1.2,
    z: -48,
    yaw: 1.1,
    isSprinting: true,
    activeChapterId: "bab3",
    xp: 90,
    starsTotal: 4,
  });
  assert.equal(players.get("p2")?.x, 42.5);
  assert.equal(players.get("p2")?.z, -48);

  applyMultiplayerServerEvent(players, chats, selfId, {
    type: "player:social",
    id: "p2",
    name: "Mei",
    kind: "dance",
    x: 42.5,
    y: 1.2,
    z: -48,
    ts: 555555,
  });
  assert.equal(players.get("p2")?.lastSocial, "dance");
  assert.equal(players.get("p2")?.lastSocialAt, 555555);

  const chatEntry: MultiplayerChatEntry = {
    id: "c1",
    playerId: "p2",
    playerName: "Mei",
    colorHex: "#059669",
    text: "你好！",
    pinyin: "nǐ hǎo!",
    emoteOnly: true,
    ts: 123456,
  };
  res = applyMultiplayerServerEvent(players, chats, selfId, { type: "player:chat", entry: chatEntry });
  chats = res.nextChats;
  res = applyMultiplayerServerEvent(players, chats, selfId, { type: "player:chat", entry: chatEntry });
  chats = res.nextChats;
  assert.equal(chats.length, 1);
  assert.equal(players.get("p2")?.lastChat, "你好！");

  applyMultiplayerServerEvent(players, chats, selfId, { type: "player:left", id: "p2" });
  applyMultiplayerServerEvent(players, chats, selfId, { type: "player:left", id: "p2" });
  assert.equal(players.size, 0);
});

test("mini-game helpers rotate seekers, enforce vertical floor reach, and spawn party games", () => {
  assert.equal(selectNextSeekerId(["b", "a", "c"], null), "a");
  assert.equal(selectNextSeekerId(["b", "a", "c"], "a"), "b");
  assert.equal(selectNextSeekerId(["b", "a", "c"], "c"), "a");

  assert.equal(isWithinVerticalReach(0, 0.5), true);
  assert.equal(isWithinVerticalReach(0, FLOOR_2_Y), false);
  assert.equal(isWithinVerticalReach(FLOOR_2_Y, FLOOR_2_Y + 0.5), true);

  const orbs = generateRaceOrbs(8, 2);
  assert.equal(orbs.length, 8);
  assert.ok(orbs.every((o) => o.hanzi.length > 0 && o.points === 10));

  assert.ok(HIDDEN_LANTERN_SPOTS.some((s) => (s.y ?? 0) >= FLOOR_2_Y));
  const lanterns = generateHiddenLanternOrbs(4, 1);
  assert.equal(lanterns.length, 4);
  assert.ok(lanterns.every((l) => l.points === 15));

  const coinItems = generateCoinPartyItems(2, true);
  assert.ok(coinItems.some((c) => c.kind === "crown" && c.points === 50));
  assert.ok(COIN_PARTY_SPAWNS.some((s) => s.y >= FLOOR_2_Y));

  const bombs = generateDefuseBombs(3, 1);
  assert.equal(bombs.length, 3);
  assert.ok(bombs.every((b) => b.kind === "bomb"));

  assert.equal(PARKOUR_CHECKPOINTS.length, 6);
  assert.ok(PARKOUR_CHECKPOINTS.some((cp) => cp.y >= FLOOR_2_Y));

  const prompt1 = pickWordDashPrompt(undefined, 0);
  const prompt2 = pickWordDashPrompt(prompt1.zoneName, 0);
  assert.notEqual(prompt2.zoneName, prompt1.zoneName);

  const hint = buildHideSeekDirectionHint(
    { x: 0, y: 0, z: 0 },
    [{ name: "Mei", x: 30, y: FLOOR_2_Y, z: -20 }],
  );
  assert.ok(hint && hint.includes("Utara") && hint.includes("Timur") && hint.includes("lantai atas"));
});

test("online learning systems cover all 7 chapters, generate valid quiz rounds, word hunter waves, and study cards", () => {
  for (let i = 1; i <= 7; i += 1) {
    const chId = `bab${i}`;
    assert.ok(QUIZ_BATTLE_BANK.some((q) => q.chapterId === chId), `Missing quiz questions for ${chId}`);
    assert.ok(WORD_HUNTER_CLUES.some((w) => w.chapterId === chId), `Missing word hunter clues for ${chId}`);
  }

  assert.equal(computeQuizRoundPoints(true, true), 30);
  assert.equal(computeQuizRoundPoints(true, false), 20);
  assert.equal(computeQuizRoundPoints(false, true), 0);

  const q1 = pickQuizBattleQuestion("bab3", [], 0);
  assert.equal(q1.chapterId, "bab3");
  assert.equal(q1.options.length, 4);
  assert.ok(q1.correctIdx >= 0 && q1.correctIdx < 4);

  const q2 = pickQuizBattleQuestion("bab3", [q1.id], 0);
  assert.notEqual(q2.id, q1.id);
  assert.equal(q2.chapterId, "bab3");

  const wave = generateWordHunterWave(3, "bab4", []);
  assert.equal(wave.prompt.chapterId, "bab4");
  assert.equal(wave.orbs.length, 4);
  const correctOrbs = wave.orbs.filter((o) => o.points > 0);
  const wrongOrbs = wave.orbs.filter((o) => o.points < 0);
  assert.equal(correctOrbs.length, 1);
  assert.equal(wrongOrbs.length, 3);
  assert.equal(correctOrbs[0].hanzi, wave.prompt.targetHanzi);
  assert.ok(
    wave.orbs.every(
      (o) =>
        o.x >= WORLD_BOUNDS.minX &&
        o.x <= WORLD_BOUNDS.maxX &&
        o.z >= WORLD_BOUNDS.minZ &&
        o.z <= WORLD_BOUNDS.maxZ,
    ),
  );

  const studyCard = buildRandomChatStudyCard("bab7", 2);
  assert.equal(studyCard.chapterLabel, "Bab 7");
  assert.equal(studyCard.options.length, 3);
  assert.ok(studyCard.correctIdx >= 0 && studyCard.correctIdx < 3);
});

