import "dotenv/config";
import crypto from "crypto";
import express from "express";
import fs from "fs";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from "vite";
import { WebSocketServer, WebSocket } from "ws";
import { GoogleGenAI, LiveServerMessage, Modality } from "@google/genai";
import {
  buildHideSeekDirectionHint,
  clampWorldCoords,
  computeDistanceXZ,
  computeQuizRoundPoints,
  generateCoinPartyItems,
  generateDefuseBombs,
  generateHiddenLanternOrbs,
  generateRaceOrbs,
  generateWordHunterWave,
  isWithinVerticalReach,
  PARKOUR_CHECKPOINTS,
  pickQuizBattleQuestion,
  pickWordDashPrompt,
  sanitizeAvatarGender,
  sanitizeChapterId,
  sanitizeChatText,
  sanitizeColorHex,
  sanitizePlayerName,
  sanitizeRoomId,
  selectNextSeekerId,
  SOCIAL_EMOTES,
  type ChatStudyCard,
  type MiniGameKind,
  type MiniGamePlayerState,
  type MiniGameSnapshot,
  type MultiplayerChatEntry,
  type MultiplayerClientMessage,
  type MultiplayerServerMessage,
  type RemotePlayerSnapshot,
  type SharedBallState,
  type SocialEmoteKind,
} from "./src/game/multiplayer.ts";
import { SOCCER_FIELD_CENTER, SOCCER_GOALS } from "./src/game/worldLayout.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);

const CHAPTER_LIVE_PROMPTS: Record<string, { title: string; focus: string }> = {
  bab1: {
    title: "Bab 1: Sapaan, Nada & Perkenalan",
    focus:
      "Sapaan (你好, 您好, 早上好, 谢谢, 不客气, 对不起, 没关系) dan perkenalan (请问您贵姓, 我叫..., 我是印度尼西亚人, 认识你很高兴).",
  },
  bab2: {
    title: "Bab 2: Benda Kelas, Keluarga & Kata Satuan",
    focus:
      "Menunjuk benda (这是什么书, 汉语词典), jumlah & kata satuan (几, 多少, 两本书, 四口人, 一位老师), serta kepemilikan (有 / 没有).",
  },
  bab3: {
    title: "Bab 3: Harga Belanja, Tanggal & Jadwal Jam",
    focus:
      "Menanyakan harga buah/barang (多少钱一斤, 一共..., 块/毛), tanggal & hari (几月几号, 星期几), dan jam (几点上课, 半, 刻, 差一刻八点).",
  },
  bab4: {
    title: "Bab 4: Arah Kampus, Tempat Tinggal & Transportasi",
    focus:
      "Menanyakan arah (请问中国银行在哪儿, 对面, 旁边, 一直往前走), rute (从...到...), dan perbandingan pilihan dengan 还是 vs 或者.",
  },
  bab5: {
    title: "Bab 5: Cuaca, Pakaian, Kebiasaan & Kesehatan",
    focus:
      "Perubahan situasi & penyangkalan lampau (了 vs 没), pola 一……就……, cuaca dingin (多穿点儿衣服), dan keluhan kesehatan (感冒, 发烧, 头疼).",
  },
  bab6: {
    title: "Bab 6: Kalimat 把, Pelengkap Hasil & Aksi Bersamaan",
    focus:
      "Struktur 把 (把照片贴在墙上 / 把号码写在这儿), pelengkap hasil (修好了, 找到了, 听清楚了), dan pola 一边……一边…….",
  },
  bab7: {
    title: "Bab 7: Bank 挂失, Kuliner AA制 & Evaluasi Kampus",
    focus:
      "Mengurus kartu hilang di bank (银行卡丢了, 挂失, 填表, 护照), makan bersama (中餐, 西餐, 外卖, AA制), dan rencana dengan 先……然后…….",
  },
};

function buildSystemInstruction(chapterId: string, scenario?: string): string {
  const ctx = CHAPTER_LIVE_PROMPTS[chapterId] ?? CHAPTER_LIVE_PROMPTS.bab1;
  const scenarioLine = scenario
    ? `Skenario roleplay khusus sekarang: ${scenario}. Arahkan percakapan sesuai peran tersebut secara natural.`
    : "";
  return [
    "Kamu adalah Lǎoshī Lín (老师林), dosen bahasa Mandarin yang ramah, sabar, dan ekspresif di Kota & Kampus Hanyu.",
    "Kamu sedang melatih mahasiswa Indonesia bernama Rafi (level pemula / Developing Chinese Elementary Speaking & Listening 1).",
    `Fokus latihan saat ini adalah ${ctx.title}: ${ctx.focus}`,
    scenarioLine,
    "Aturan percakapan:",
    "1. Berbicaralah dalam bahasa Mandarin sederhana yang jelas dan bertempo sedang-pelan untuk pemula, lalu berikan terjemahan atau koreksi singkat dalam bahasa Indonesia yang hangat bila diperlukan.",
    "2. Batasi setiap giliran berbicara maksimal 2-3 kalimat pendek agar terasa seperti latihan dialog nyata.",
    "3. Ajak pengguna merespons dalam bahasa Mandarin. Jika pengguna salah nada atau struktur, puji usahanya dulu lalu beri contoh pengucapan yang benar.",
    "4. Utamakan kosakata dan pola dari buku Developing Chinese Elementary 1.",
  ]
    .filter(Boolean)
    .join("\n");
}

const ttsCache = new Map<string, string>();
const MAX_TTS_CACHE = 80;

async function startServer() {
  const app = express();
  app.use(express.json({ limit: "1mb" }));

  app.get("/api/health", (_req, res) => {
    res.json({
      ok: true,
      geminiConfigured: Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== "MY_GEMINI_API_KEY"),
      liveModel: "gemini-3.8-live",
      ttsModel: "gemini-3.8-flash-lite-tts",
    });
  });

  app.post("/api/tts", async (req, res) => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === "MY_GEMINI_API_KEY") {
      res.status(503).json({ error: "GEMINI_API_KEY belum tersedia." });
      return;
    }

    const rawText = typeof req.body?.text === "string" ? req.body.text.trim() : "";
    const rate =
      typeof req.body?.rate === "number" && Number.isFinite(req.body.rate)
        ? Math.max(0.5, Math.min(1.5, req.body.rate))
        : 0.9;
    if (!rawText || rawText.length > 260) {
      res.status(400).json({ error: "Teks TTS tidak valid (maksimal 260 karakter)." });
      return;
    }

    const paceStyle =
      rate < 0.82
        ? "slow, very clear beginner Mandarin pronunciation with distinct tones"
        : rate > 0.98
          ? "natural conversational Mandarin pace with clear tones"
          : "steady, clear Mandarin teacher pace with distinct tones";

    const cacheKey = `${paceStyle}::${rawText}`;
    const cached = ttsCache.get(cacheKey);
    if (cached) {
      res.json({ audioBase64: cached, mimeType: "audio/wav", cached: true });
      return;
    }

    try {
      const ai = new GoogleGenAI({
        apiKey,
        apiVersion: "v1beta",
        httpOptions: { headers: { "User-Agent": "aistudio-build" } },
      });

      const response = await ai.models.generateContent({
        model: "gemini-3.8-flash-lite-tts",
        contents: [
          {
            role: "user",
            parts: [
              {
                text: rawText,
                speechMetadata: {
                  style: `Mandarin Chinese language instructor Lǎoshī Lín speaking in ${paceStyle}`,
                },
              },
            ],
          },
        ],
        config: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: "Kore" },
            },
          },
        },
      });

      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (!base64Audio) {
        res.status(502).json({ error: "Model TTS tidak mengembalikan data audio." });
        return;
      }

      if (ttsCache.size >= MAX_TTS_CACHE) {
        const firstKey = ttsCache.keys().next().value;
        if (firstKey !== undefined) ttsCache.delete(firstKey);
      }
      ttsCache.set(cacheKey, base64Audio);
      res.json({ audioBase64: base64Audio, mimeType: "audio/wav", cached: false });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Gagal membuat audio TTS.";
      const upstreamStatus =
        typeof (err as { status?: unknown })?.status === "number"
          ? ((err as { status: number }).status)
          : msg.includes("\"code\":429") || msg.includes("429")
            ? 429
            : 500;
      res.status(upstreamStatus).json({ error: msg });
    }
  });

  interface ServerMpPlayer {
    snapshot: RemotePlayerSnapshot;
    ws: WebSocket;
    lastChatMs: number;
    lastSocialMs: number;
    isAlive: boolean;
  }

  interface ServerMpRoom {
    id: string;
    players: Map<string, ServerMpPlayer>;
    recentChats: MultiplayerChatEntry[];
    minigame: MiniGameSnapshot | null;
    ball: SharedBallState;
    lastSeekerId: string | null;
    roundSeed: number;
    lastHintSec: number;
    bombFuseAt: number;
    lastBombPassMs: number;
    lastCrownStealMs: number;
    usedQuizIds: string[];
    usedClueIds: string[];
    quizRevealUntil: number;
  }

  const mpRooms = new Map<string, ServerMpRoom>();

  const getOrCreateRoom = (roomId: string): ServerMpRoom => {
    let room = mpRooms.get(roomId);
    if (!room) {
      room = {
        id: roomId,
        players: new Map(),
        recentChats: [],
        minigame: null,
        ball: {
          x: SOCCER_FIELD_CENTER.x,
          z: SOCCER_FIELD_CENTER.z,
          vx: 0,
          vz: 0,
          westGoals: 0,
          eastGoals: 0,
        },
        lastSeekerId: null,
        roundSeed: 1,
        lastHintSec: -1,
        bombFuseAt: 0,
        lastBombPassMs: 0,
        lastCrownStealMs: 0,
        usedQuizIds: [],
        usedClueIds: [],
        quizRevealUntil: 0,
      };
      mpRooms.set(roomId, room);
    }
    return room;
  };

  const sendMp = (ws: WebSocket, payload: MultiplayerServerMessage) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload));
    }
  };

  const broadcastRoom = (
    room: ServerMpRoom,
    payload: MultiplayerServerMessage,
    excludePlayerId?: string,
  ) => {
    const serialized = JSON.stringify(payload);
    for (const [pid, member] of room.players) {
      if (excludePlayerId && pid === excludePlayerId) continue;
      if (member.ws.readyState === WebSocket.OPEN) {
        member.ws.send(serialized);
      }
    }
  };

  const emitRoomNotice = (
    room: ServerMpRoom,
    text: string,
    tone: "info" | "catch" | "score" | "win",
    pinyin?: string,
    extra?: { rewardPlayerId?: string; xpReward?: number },
  ) => {
    broadcastRoom(room, {
      type: "minigame:event",
      notice: {
        id: `${Date.now()}_${crypto.randomUUID().slice(0, 4)}`,
        text,
        pinyin,
        tone,
        rewardPlayerId: extra?.rewardPlayerId,
        xpReward: extra?.xpReward,
        ts: Date.now(),
      },
    });
  };

  const broadcastMiniGameState = (room: ServerMpRoom) => {
    broadcastRoom(room, {
      type: "minigame:state",
      minigame: room.minigame,
    });
  };

  const finishMiniGame = (room: ServerMpRoom, summary: string) => {
    if (!room.minigame || room.minigame.phase === "ended") return;
    room.minigame.phase = "ended";
    room.minigame.secondsLeft = 0;
    room.minigame.winnerSummary = summary;
    room.minigame.endsAt = Date.now();
    broadcastMiniGameState(room);
    emitRoomNotice(room, summary, "win", "游戏结束 · Yóuxì jiéshù");
  };

  const startMiniGame = (
    room: ServerMpRoom,
    hostId: string,
    kind: MiniGameKind,
    chapterFilter = "all",
  ) => {
    const members = Array.from(room.players.values());
    if (members.length === 0) return;

    const cleanFilter =
      chapterFilter === "all" ? "all" : sanitizeChapterId(chapterFilter);
    room.roundSeed += 1;
    room.lastHintSec = -1;
    room.lastBombPassMs = 0;
    room.lastCrownStealMs = 0;
    room.quizRevealUntil = 0;
    const now = Date.now();
    const soloMode = members.length < 2;

    if (kind === "quiz_battle") {
      const q = pickQuizBattleQuestion(cleanFilter, room.usedQuizIds, room.roundSeed);
      room.usedQuizIds = [...room.usedQuizIds.slice(-14), q.id];
      const totalRounds = 6;
      room.minigame = {
        matchId: `mg_${now}_${crypto.randomUUID().slice(0, 4)}`,
        kind: "quiz_battle",
        phase: "active",
        soloMode,
        hostId,
        chapterFilter: cleanFilter,
        seekerId: null,
        quizQuestion: q,
        totalRounds,
        startedAt: now,
        endsAt: now + 16_000,
        secondsLeft: 16,
        roundNumber: 1,
        players: members.map((m) => ({
          id: m.snapshot.id,
          name: m.snapshot.name,
          colorHex: m.snapshot.colorHex,
          role: "runner",
          caught: false,
          score: 0,
        })),
        orbs: [],
        wordPrompt: null,
        lastHint: `${q.chapterLabel} · Jawab cepat untuk bonus +30 pt & +15 XP!`,
        winnerSummary: null,
      };
      broadcastMiniGameState(room);
      emitRoomNotice(
        room,
        `Cerdas Cermat Mandarin dimulai! (${cleanFilter === "all" ? "Semua Bab 1-7" : cleanFilter.toUpperCase()})`,
        "info",
        "汉语抢答赛 · Hànyǔ Qiǎngdásài",
      );
      return;
    }

    if (kind === "word_hunter") {
      const wave = generateWordHunterWave(room.roundSeed, cleanFilter, room.usedClueIds);
      room.usedClueIds = [...room.usedClueIds.slice(-8), wave.clueId];
      room.minigame = {
        matchId: `mg_${now}_${crypto.randomUUID().slice(0, 4)}`,
        kind: "word_hunter",
        phase: "active",
        soloMode,
        hostId,
        chapterFilter: cleanFilter,
        seekerId: null,
        wordHunterPrompt: wave.prompt,
        startedAt: now,
        endsAt: now + 65_000,
        secondsLeft: 65,
        roundNumber: 1,
        players: members.map((m) => ({
          id: m.snapshot.id,
          name: m.snapshot.name,
          colorHex: m.snapshot.colorHex,
          role: "runner",
          caught: false,
          score: 0,
        })),
        orbs: wave.orbs,
        wordPrompt: null,
        lastHint: `${wave.prompt.chapterLabel}: ${wave.prompt.clue}`,
        winnerSummary: null,
      };
      broadcastMiniGameState(room);
      emitRoomNotice(
        room,
        `Berburu Terjemahan 3D! ${wave.prompt.clue}`,
        "info",
        "寻词大冒险 · Xúncí Dà Màoxiǎn",
      );
      return;
    }

    if (kind === "hide_seek") {
      if (soloMode) {
        const seeker = members[0];
        const lanternOrbs = generateHiddenLanternOrbs(4, room.roundSeed);
        room.minigame = {
          matchId: `mg_${now}_${crypto.randomUUID().slice(0, 4)}`,
          kind: "hide_seek",
          phase: "active",
          soloMode: true,
          hostId,
          seekerId: seeker.snapshot.id,
          startedAt: now,
          endsAt: now + 75_000,
          secondsLeft: 75,
          roundNumber: 1,
          players: [
            {
              id: seeker.snapshot.id,
              name: seeker.snapshot.name,
              colorHex: seeker.snapshot.colorHex,
              role: "seeker",
              caught: false,
              score: 0,
            },
          ],
          orbs: lanternOrbs,
          wordPrompt: null,
          lastHint: "Mode Solo: Cari 4 Lampion Rahasia termasuk di lantai atas Menara & Arcade!",
          winnerSummary: null,
        };
        broadcastMiniGameState(room);
        emitRoomNotice(
          room,
          "Petak Umpet Lampion (Solo) dimulai! Cek ruangan dalam gedung & lantai atas.",
          "info",
          "捉迷藏 · Zhuōmícáng",
        );
        return;
      }

      const ids = members.map((m) => m.snapshot.id);
      const seekerId = selectNextSeekerId(ids, room.lastSeekerId);
      room.lastSeekerId = seekerId;
      const mgPlayers: MiniGamePlayerState[] = members.map((m) => ({
        id: m.snapshot.id,
        name: m.snapshot.name,
        colorHex: m.snapshot.colorHex,
        role: m.snapshot.id === seekerId ? "seeker" : "hider",
        caught: false,
        score: 0,
      }));
      const seekerName = members.find((m) => m.snapshot.id === seekerId)?.snapshot.name ?? "Pencari";

      room.minigame = {
        matchId: `mg_${now}_${crypto.randomUUID().slice(0, 4)}`,
        kind: "hide_seek",
        phase: "countdown",
        soloMode: false,
        hostId,
        seekerId,
        startedAt: now,
        endsAt: now + 10_000,
        secondsLeft: 10,
        roundNumber: 1,
        players: mgPlayers,
        orbs: [],
        wordPrompt: null,
        lastHint: `${seekerName} jadi Pencari! Kabur ke gedung bertingkat atau Labirin Bambu (10d)!`,
        winnerSummary: null,
      };
      broadcastMiniGameState(room);
      emitRoomNotice(
        room,
        `Petak Umpet 3D dimulai! ${seekerName} jadi Pencari (tunggu 10 detik)!`,
        "info",
        "快躲起来！· Kuài duǒ qǐlái!",
      );
      return;
    }

    if (kind === "tag_bomb") {
      if (soloMode) {
        room.minigame = {
          matchId: `mg_${now}_${crypto.randomUUID().slice(0, 4)}`,
          kind: "tag_bomb",
          phase: "active",
          soloMode: true,
          hostId,
          seekerId: null,
          bombHolderId: null,
          bombFuseLeft: 60,
          startedAt: now,
          endsAt: now + 60_000,
          secondsLeft: 60,
          roundNumber: 1,
          players: members.map((m) => ({
            id: m.snapshot.id,
            name: m.snapshot.name,
            colorHex: m.snapshot.colorHex,
            role: "runner",
            caught: false,
            score: 0,
          })),
          orbs: generateDefuseBombs(3, room.roundSeed),
          wordPrompt: null,
          lastHint: "Mode Solo: Kejar & jinakkan bom waktu merah di seluruh kampus!",
          winnerSummary: null,
        };
        broadcastMiniGameState(room);
        emitRoomNotice(room, "Estafet Bom Waktu (Solo): Jinakkan bom sebelum waktu habis!", "info");
        return;
      }

      const initialHolder = members[room.roundSeed % members.length];
      room.bombFuseAt = now + 18_000;
      room.minigame = {
        matchId: `mg_${now}_${crypto.randomUUID().slice(0, 4)}`,
        kind: "tag_bomb",
        phase: "active",
        soloMode: false,
        hostId,
        seekerId: null,
        bombHolderId: initialHolder.snapshot.id,
        bombFuseLeft: 18,
        startedAt: now,
        endsAt: now + 65_000,
        secondsLeft: 65,
        roundNumber: 1,
        players: members.map((m) => ({
          id: m.snapshot.id,
          name: m.snapshot.name,
          colorHex: m.snapshot.colorHex,
          role: "runner",
          caught: false,
          score: 0,
        })),
        orbs: [],
        wordPrompt: null,
        lastHint: `${initialHolder.snapshot.name} memegang Bom! Sentuh teman atau tekan [F] untuk mengoper!`,
        winnerSummary: null,
      };
      broadcastMiniGameState(room);
      emitRoomNotice(
        room,
        `Estafet Bom Waktu dimulai! ${initialHolder.snapshot.name} memegang bom (18d)!`,
        "catch",
      );
      return;
    }

    if (kind === "coin_party") {
      room.minigame = {
        matchId: `mg_${now}_${crypto.randomUUID().slice(0, 4)}`,
        kind: "coin_party",
        phase: "active",
        soloMode,
        hostId,
        seekerId: null,
        crownHolderId: null,
        startedAt: now,
        endsAt: now + 60_000,
        secondsLeft: 60,
        roundNumber: 1,
        players: members.map((m) => ({
          id: m.snapshot.id,
          name: m.snapshot.name,
          colorHex: m.snapshot.colorHex,
          role: "runner",
          caught: false,
          score: 0,
        })),
        orbs: generateCoinPartyItems(room.roundSeed, true),
        wordPrompt: null,
        lastHint: "Rebut Koin Emas, Permata di lantai atas & Mahkota Raja di tengah plaza!",
        winnerSummary: null,
      };
      broadcastMiniGameState(room);
      emitRoomNotice(
        room,
        "Pesta Koin & Mahkota dimulai! Rebut Mahkota Raja (+3 pt/dtk) & koin bertingkat!",
        "score",
      );
      return;
    }

    if (kind === "parkour_race") {
      room.minigame = {
        matchId: `mg_${now}_${crypto.randomUUID().slice(0, 4)}`,
        kind: "parkour_race",
        phase: "active",
        soloMode,
        hostId,
        seekerId: null,
        checkpoints: PARKOUR_CHECKPOINTS,
        startedAt: now,
        endsAt: now + 90_000,
        secondsLeft: 90,
        roundNumber: 1,
        players: members.map((m) => ({
          id: m.snapshot.id,
          name: m.snapshot.name,
          colorHex: m.snapshot.colorHex,
          role: "runner",
          caught: false,
          score: 0,
          checkpointIdx: 0,
        })),
        orbs: [],
        wordPrompt: null,
        lastHint: `Balap 6 Pos! Mulai menuju ${PARKOUR_CHECKPOINTS[0].label}`,
        winnerSummary: null,
      };
      broadcastMiniGameState(room);
      emitRoomNotice(
        room,
        "Balap Parkour Kampus dimulai! Pakai Trampolin & tangga untuk menaklukkan 6 pos!",
        "info",
      );
      return;
    }

    if (kind === "orb_rush") {
      room.minigame = {
        matchId: `mg_${now}_${crypto.randomUUID().slice(0, 4)}`,
        kind: "orb_rush",
        phase: "active",
        soloMode,
        hostId,
        seekerId: null,
        startedAt: now,
        endsAt: now + 60_000,
        secondsLeft: 60,
        roundNumber: 1,
        players: members.map((m) => ({
          id: m.snapshot.id,
          name: m.snapshot.name,
          colorHex: m.snapshot.colorHex,
          role: "runner",
          caught: false,
          score: 0,
        })),
        orbs: generateRaceOrbs(10, room.roundSeed),
        wordPrompt: null,
        lastHint: "Kumpulkan Bola Aksara emas tersebar di distrik Open World!",
        winnerSummary: null,
      };
      broadcastMiniGameState(room);
      emitRoomNotice(room, "Lomba Bola Aksara dimulai! Kumpulkan bola Hanzi tercepat.", "info", "夺宝开始！");
      return;
    }

    // word_dash
    const prompt = pickWordDashPrompt(undefined, room.roundSeed);
    room.minigame = {
      matchId: `mg_${now}_${crypto.randomUUID().slice(0, 4)}`,
      kind: "word_dash",
      phase: "active",
      soloMode,
      hostId,
      seekerId: null,
      startedAt: now,
      endsAt: now + 70_000,
      secondsLeft: 70,
      roundNumber: 1,
      players: members.map((m) => ({
        id: m.snapshot.id,
        name: m.snapshot.name,
        colorHex: m.snapshot.colorHex,
        role: "runner",
        caught: false,
        score: 0,
      })),
      orbs: [],
      wordPrompt: prompt,
      lastHint: `Tujuan Ronde 1: ${prompt.hanzi} (${prompt.pinyin}) — ${prompt.meaning}`,
      winnerSummary: null,
    };
    broadcastMiniGameState(room);
    emitRoomNotice(
      room,
      `Lari Kata Mandarin: Cari ${prompt.hanzi} (${prompt.meaning})!`,
      "info",
      prompt.pinyin,
    );
  };

  const evaluatePlayerInteractions = (room: ServerMpRoom, actor: ServerMpPlayer, explicitAction = false) => {
    const mg = room.minigame;
    if (!mg || mg.phase !== "active") return;

    const ax = actor.snapshot.x;
    const ay = actor.snapshot.y;
    const az = actor.snapshot.z;
    const now = Date.now();

    if (mg.kind === "hide_seek") {
      if (mg.soloMode) {
        const hitIdx = mg.orbs.findIndex(
          (o) => computeDistanceXZ(ax, az, o.x, o.z) <= 2.45 && isWithinVerticalReach(ay, o.y ?? 0, 2.35),
        );
        if (hitIdx !== -1) {
          const [orb] = mg.orbs.splice(hitIdx, 1);
          const pState = mg.players.find((p) => p.id === actor.snapshot.id);
          if (pState) pState.score += orb.points;
          emitRoomNotice(
            room,
            `Lampion "${orb.hanzi}" ditemukan! (${orb.meaning})`,
            "catch",
            orb.pinyin,
          );
          if (mg.orbs.length === 0) {
            finishMiniGame(
              room,
              `Hebat! Semua Lampion Rahasia ditemukan (${pState?.score ?? 60} poin)!`,
            );
          } else {
            mg.lastHint = `Tersisa ${mg.orbs.length} Lampion tersembunyi (cek lantai atas)!`;
            broadcastMiniGameState(room);
          }
        }
        return;
      }

      if (actor.snapshot.id !== mg.seekerId) return;
      const catchRadius = explicitAction ? 3.1 : 1.75;
      let anyCaught = false;
      for (const hp of mg.players) {
        if (hp.role !== "hider" || hp.caught) continue;
        const hiderRoomMember = room.players.get(hp.id);
        if (!hiderRoomMember) {
          hp.caught = true;
          anyCaught = true;
          continue;
        }
        const d = computeDistanceXZ(ax, az, hiderRoomMember.snapshot.x, hiderRoomMember.snapshot.z);
        if (d <= catchRadius && isWithinVerticalReach(ay, hiderRoomMember.snapshot.y, 2.35)) {
          hp.caught = true;
          const seekerState = mg.players.find((p) => p.id === mg.seekerId);
          if (seekerState) seekerState.score += 20;
          anyCaught = true;
          emitRoomNotice(room, `${hp.name} tertangkap oleh Pencari!`, "catch", "抓到了！· Zhuādào le!");
        }
      }

      if (anyCaught) {
        const remaining = mg.players.filter((p) => p.role === "hider" && !p.caught);
        if (remaining.length === 0) {
          const seekerName = mg.players.find((p) => p.id === mg.seekerId)?.name ?? "Pencari";
          finishMiniGame(room, `Pencari Menang! ${seekerName} menangkap semua persembunyi!`);
        } else {
          broadcastMiniGameState(room);
        }
      }
      return;
    }

    if (mg.kind === "tag_bomb") {
      if (mg.soloMode) {
        const hitIdx = mg.orbs.findIndex(
          (o) => computeDistanceXZ(ax, az, o.x, o.z) <= 2.45 && isWithinVerticalReach(ay, o.y ?? 0, 2.35),
        );
        if (hitIdx !== -1) {
          const [orb] = mg.orbs.splice(hitIdx, 1);
          const pState = mg.players.find((p) => p.id === actor.snapshot.id);
          if (pState) pState.score += orb.points;
          emitRoomNotice(room, `Bom di ${orb.pinyin} berhasil dijinakkan! (+${orb.points} pt)`, "score");
          if (mg.orbs.length === 0) {
            mg.roundNumber += 1;
            mg.orbs = generateDefuseBombs(3, room.roundSeed + mg.roundNumber);
            mg.lastHint = `Gelombang ${mg.roundNumber}: 3 Bom Waktu baru muncul!`;
          }
          broadcastMiniGameState(room);
        }
        return;
      }

      if (actor.snapshot.id !== mg.bombHolderId) return;
      if (now - room.lastBombPassMs < 1300) return;

      const passRadius = explicitAction ? 3.35 : 2.15;
      let targetPeer: ServerMpPlayer | null = null;
      let bestDist = Infinity;
      for (const peer of room.players.values()) {
        if (peer.snapshot.id === actor.snapshot.id) continue;
        const d = computeDistanceXZ(ax, az, peer.snapshot.x, peer.snapshot.z);
        if (d <= passRadius && isWithinVerticalReach(ay, peer.snapshot.y, 2.45) && d < bestDist) {
          bestDist = d;
          targetPeer = peer;
        }
      }

      if (targetPeer) {
        room.lastBombPassMs = now;
        mg.bombHolderId = targetPeer.snapshot.id;
        mg.lastHint = `${actor.snapshot.name} melempar bom ke ${targetPeer.snapshot.name}!`;
        emitRoomNotice(
          room,
          `💣 Bom berpindah ke ${targetPeer.snapshot.name}! Cepat oper ke pemain lain!`,
          "catch",
        );
        broadcastMiniGameState(room);
      }
      return;
    }

    if (mg.kind === "coin_party") {
      let stateChanged = false;
      const hitIdx = mg.orbs.findIndex(
        (o) => computeDistanceXZ(ax, az, o.x, o.z) <= 2.45 && isWithinVerticalReach(ay, o.y ?? 0, 2.35),
      );
      if (hitIdx !== -1) {
        const [item] = mg.orbs.splice(hitIdx, 1);
        const pState = mg.players.find((p) => p.id === actor.snapshot.id);
        if (pState) pState.score += item.points;
        stateChanged = true;

        if (item.kind === "crown") {
          mg.crownHolderId = actor.snapshot.id;
          room.lastCrownStealMs = now;
          mg.lastHint = `👑 ${actor.snapshot.name} memakai Mahkota Raja (+3 pt/dtk)!`;
          emitRoomNotice(
            room,
            `👑 ${actor.snapshot.name} merebut Mahkota Raja! (+50 pt & +3 pt/detik)`,
            "score",
          );
        } else {
          emitRoomNotice(
            room,
            `${actor.snapshot.name} ambil ${item.hanzi} di ${item.pinyin} (+${item.points} pt)`,
            "score",
          );
        }

        if (mg.orbs.length === 0) {
          mg.roundNumber += 1;
          mg.orbs = generateCoinPartyItems(room.roundSeed + mg.roundNumber, !mg.crownHolderId);
          mg.lastHint = `Gelombang ${mg.roundNumber}: Koin & Permata segar turun di kampus!`;
        }
      }

      // Stealing Crown by bumping into the Crown Holder
      if (
        !mg.soloMode &&
        mg.crownHolderId &&
        mg.crownHolderId !== actor.snapshot.id &&
        now - room.lastCrownStealMs >= 1600
      ) {
        const holder = room.players.get(mg.crownHolderId);
        if (
          holder &&
          computeDistanceXZ(ax, az, holder.snapshot.x, holder.snapshot.z) <= 2.1 &&
          isWithinVerticalReach(ay, holder.snapshot.y, 2.4)
        ) {
          room.lastCrownStealMs = now;
          mg.crownHolderId = actor.snapshot.id;
          const pState = mg.players.find((p) => p.id === actor.snapshot.id);
          if (pState) pState.score += 15;
          mg.lastHint = `👑 ${actor.snapshot.name} mencuri Mahkota Raja dari ${holder.snapshot.name}!`;
          emitRoomNotice(room, `👑 ${actor.snapshot.name} mencuri Mahkota Raja (+15 pt)!`, "catch");
          stateChanged = true;
        }
      }

      if (stateChanged) {
        broadcastMiniGameState(room);
      }
      return;
    }

    if (mg.kind === "parkour_race" && mg.checkpoints && mg.checkpoints.length > 0) {
      const pState = mg.players.find((p) => p.id === actor.snapshot.id);
      if (!pState) return;
      const cpIdx = pState.checkpointIdx ?? 0;
      const targetCp = mg.checkpoints[cpIdx];
      if (!targetCp) return;

      if (
        computeDistanceXZ(ax, az, targetCp.x, targetCp.z) <= 3.9 &&
        isWithinVerticalReach(ay, targetCp.y, 2.25)
      ) {
        pState.score += 25;
        pState.checkpointIdx = cpIdx + 1;
        if (pState.checkpointIdx >= mg.checkpoints.length) {
          pState.score += 40;
          finishMiniGame(
            room,
            `🏁 Juara Parkour! ${pState.name} menaklukkan semua ${mg.checkpoints.length} pos (${pState.score} pt)!`,
          );
          return;
        }
        const nextCp = mg.checkpoints[pState.checkpointIdx];
        mg.lastHint = `${pState.name} mencapai Pos ${cpIdx + 1}/${mg.checkpoints.length}! Lanjut: ${nextCp.label}`;
        emitRoomNotice(
          room,
          `🚩 ${pState.name} melewati ${targetCp.label} (+25 pt)!`,
          "score",
        );
        broadcastMiniGameState(room);
      }
      return;
    }

    if (mg.kind === "word_hunter") {
      const hitIdx = mg.orbs.findIndex(
        (o) => computeDistanceXZ(ax, az, o.x, o.z) <= 2.45 && isWithinVerticalReach(ay, o.y ?? 0, 2.4),
      );
      if (hitIdx !== -1) {
        const [orb] = mg.orbs.splice(hitIdx, 1);
        const pState = mg.players.find((p) => p.id === actor.snapshot.id);
        if (orb.points > 0) {
          if (pState) pState.score += orb.points;
          mg.roundNumber += 1;
          const nextWave = generateWordHunterWave(
            room.roundSeed + mg.roundNumber,
            mg.chapterFilter ?? "all",
            room.usedClueIds,
          );
          room.usedClueIds = [...room.usedClueIds.slice(-8), nextWave.clueId];
          mg.wordHunterPrompt = nextWave.prompt;
          mg.orbs = nextWave.orbs;
          mg.lastHint = `${nextWave.prompt.chapterLabel}: ${nextWave.prompt.clue}`;
          emitRoomNotice(
            room,
            `Benar! ${actor.snapshot.name} ambil "${orb.hanzi}" (${orb.pinyin} = ${orb.meaning}) (+${orb.points} pt & +15 XP)`,
            "score",
            `Lanjut: ${nextWave.prompt.clue}`,
            { rewardPlayerId: actor.snapshot.id, xpReward: 15 },
          );
        } else {
          if (pState) pState.score = Math.max(0, pState.score + orb.points);
          emitRoomNotice(
            room,
            `Ups! "${orb.hanzi}" (${orb.pinyin}) artinya "${orb.meaning}" (-5 pt). Cari yang tepat!`,
            "catch",
            mg.wordHunterPrompt?.clue,
          );
        }
        broadcastMiniGameState(room);
      }
      return;
    }

    if (mg.kind === "orb_rush") {
      const hitIdx = mg.orbs.findIndex(
        (o) => computeDistanceXZ(ax, az, o.x, o.z) <= 2.35 && isWithinVerticalReach(ay, o.y ?? 0, 2.4),
      );
      if (hitIdx !== -1) {
        const [orb] = mg.orbs.splice(hitIdx, 1);
        const pState = mg.players.find((p) => p.id === actor.snapshot.id);
        if (pState) pState.score += orb.points;
        emitRoomNotice(
          room,
          `${actor.snapshot.name} ambil "${orb.hanzi}" (+${orb.points} pt & +5 XP)`,
          "score",
          `${orb.pinyin} · ${orb.meaning}`,
          { rewardPlayerId: actor.snapshot.id, xpReward: 5 },
        );
        if (mg.orbs.length === 0) {
          mg.roundNumber += 1;
          mg.orbs = generateRaceOrbs(10, room.roundSeed + mg.roundNumber);
          mg.lastHint = `Gelombang ${mg.roundNumber}: 10 Bola Aksara baru muncul!`;
        }
        broadcastMiniGameState(room);
      }
      return;
    }

    if (mg.kind === "word_dash" && mg.wordPrompt) {
      const dist = computeDistanceXZ(ax, az, mg.wordPrompt.targetX, mg.wordPrompt.targetZ);
      if (dist <= 4.35) {
        const pState = mg.players.find((p) => p.id === actor.snapshot.id);
        if (pState) pState.score += 15;
        const solvedZone = mg.wordPrompt.zoneName;
        mg.roundNumber += 1;
        const nextPrompt = pickWordDashPrompt(solvedZone, room.roundSeed + mg.roundNumber);
        mg.wordPrompt = nextPrompt;
        mg.lastHint = `${actor.snapshot.name} sampai di ${solvedZone}! Tujuan baru: ${nextPrompt.hanzi}`;
        emitRoomNotice(
          room,
          `${actor.snapshot.name} tiba di ${solvedZone} (+15 pt & +10 XP)! Lanjut ke ${nextPrompt.hanzi}!`,
          "score",
          nextPrompt.pinyin,
          { rewardPlayerId: actor.snapshot.id, xpReward: 10 },
        );
        broadcastMiniGameState(room);
      }
    }
  };

  const server = http.createServer(app);
  const wss = new WebSocketServer({ noServer: true, maxPayload: 512 * 1024 });
  const mpWss = new WebSocketServer({ noServer: true, maxPayload: 32 * 1024 });

  // Authoritative 100ms shared soccer ball physics loop
  const mpBallTick = setInterval(() => {
    for (const room of mpRooms.values()) {
      if (room.players.size === 0) continue;
      let ballChanged = false;
      const b = room.ball;

      for (const member of room.players.values()) {
        if (member.snapshot.y > 1.2) continue;
        const dx = b.x - member.snapshot.x;
        const dz = b.z - member.snapshot.z;
        const d = Math.hypot(dx, dz);
        if (d < 1.35) {
          let nx = dx;
          let nz = dz;
          if (d < 0.05) {
            nx = Math.sin(member.snapshot.yaw);
            nz = Math.cos(member.snapshot.yaw);
          } else {
            nx /= d;
            nz /= d;
          }
          const kickPower = member.snapshot.isSprinting ? 11.5 : 7.8;
          b.vx = Number((nx * kickPower).toFixed(2));
          b.vz = Number((nz * kickPower).toFixed(2));
          b.x = Number((member.snapshot.x + nx * 1.42).toFixed(2));
          b.z = Number((member.snapshot.z + nz * 1.42).toFixed(2));
          b.lastKickerName = member.snapshot.name;
          ballChanged = true;
        }
      }

      if (Math.hypot(b.vx, b.vz) > 0.08) {
        b.x = Number((b.x + b.vx * 0.1).toFixed(2));
        b.z = Number((b.z + b.vz * 0.1).toFixed(2));
        b.vx = Number((b.vx * 0.89).toFixed(2));
        b.vz = Number((b.vz * 0.89).toFixed(2));
        ballChanged = true;
      } else if (b.vx !== 0 || b.vz !== 0) {
        b.vx = 0;
        b.vz = 0;
      }

      const inGoalZ = b.z >= SOCCER_GOALS.minZ && b.z <= SOCCER_GOALS.maxZ;
      if (b.x <= SOCCER_GOALS.westGoalX && inGoalZ) {
        b.eastGoals += 1;
        b.x = SOCCER_FIELD_CENTER.x;
        b.z = SOCCER_FIELD_CENTER.z;
        b.vx = 0;
        b.vz = 0;
        ballChanged = true;
        emitRoomNotice(
          room,
          `⚽ GOL ke Gawang Barat! (${b.lastKickerName ?? "Pemain"}) · Skor ${b.westGoals} - ${b.eastGoals}`,
          "score",
          "好球！· Hǎo qiú!",
        );
      } else if (b.x >= SOCCER_GOALS.eastGoalX && inGoalZ) {
        b.westGoals += 1;
        b.x = SOCCER_FIELD_CENTER.x;
        b.z = SOCCER_FIELD_CENTER.z;
        b.vx = 0;
        b.vz = 0;
        ballChanged = true;
        emitRoomNotice(
          room,
          `⚽ GOL ke Gawang Timur! (${b.lastKickerName ?? "Pemain"}) · Skor ${b.westGoals} - ${b.eastGoals}`,
          "score",
          "好球！· Hǎo qiú!",
        );
      } else {
        if (b.x < -13.5) {
          b.x = -13.5;
          b.vx = Math.abs(b.vx) * 0.65;
        } else if (b.x > 13.5) {
          b.x = 13.5;
          b.vx = -Math.abs(b.vx) * 0.65;
        }
        if (b.z < 38.2) {
          b.z = 38.2;
          b.vz = Math.abs(b.vz) * 0.65;
        } else if (b.z > 53.8) {
          b.z = 53.8;
          b.vz = -Math.abs(b.vz) * 0.65;
        }
      }

      if (ballChanged) {
        broadcastRoom(room, { type: "world:ball", ball: { ...b } });
      }
    }
  }, 100);

  // Authoritative 1-second server loop for mini-game timers, bombs, crown & hints
  const mpMiniGameTick = setInterval(() => {
    const now = Date.now();
    for (const room of mpRooms.values()) {
      const mg = room.minigame;
      if (!mg || mg.phase === "idle" || mg.phase === "ended") continue;

      const remainingSec = Math.max(0, Math.ceil((mg.endsAt - now) / 1000));
      mg.secondsLeft = remainingSec;

      if (mg.phase === "countdown") {
        if (now >= mg.endsAt) {
          mg.phase = "active";
          mg.startedAt = now;
          mg.endsAt = now + 75_000;
          mg.secondsLeft = 75;
          mg.lastHint = "Waktu sembunyi habis! Pencari mulai berburu!";
          broadcastMiniGameState(room);
          emitRoomNotice(room, "Pencari bergerak! Selamat berburu!", "info", "开始找人！· Kāishǐ zhǎo rén!");
        } else {
          broadcastMiniGameState(room);
        }
        continue;
      }

      if (mg.phase === "active") {
        // Multi-round Quiz Battle reveal & advance loop
        if (mg.kind === "quiz_battle" && mg.quizQuestion) {
          const totalRounds = mg.totalRounds ?? 6;
          if (mg.quizQuestion.revealActive) {
            if (now >= room.quizRevealUntil) {
              if (mg.roundNumber >= totalRounds) {
                const sorted = [...mg.players].sort((a, b) => b.score - a.score);
                const top = sorted[0];
                finishMiniGame(
                  room,
                  top
                    ? `Juara Cerdas Cermat: ${top.name} (${top.score} poin)!`
                    : "Cerdas Cermat Selesai!",
                );
              } else {
                mg.roundNumber += 1;
                const nextQ = pickQuizBattleQuestion(
                  mg.chapterFilter ?? "all",
                  room.usedQuizIds,
                  room.roundSeed + mg.roundNumber,
                );
                room.usedQuizIds = [...room.usedQuizIds.slice(-14), nextQ.id];
                mg.quizQuestion = nextQ;
                mg.endsAt = now + 16_000;
                mg.secondsLeft = 16;
                room.quizRevealUntil = 0;
                mg.lastHint = `${nextQ.chapterLabel} · Pertanyaan berikutnya — jawab cepat!`;
                broadcastMiniGameState(room);
              }
            } else {
              mg.secondsLeft = Math.max(0, Math.ceil((room.quizRevealUntil - now) / 1000));
              broadcastMiniGameState(room);
            }
            continue;
          }

          if (now >= mg.endsAt) {
            mg.quizQuestion.revealActive = true;
            room.quizRevealUntil = now + 2600;
            mg.secondsLeft = 3;
            mg.lastHint = `Jawaban: ${mg.quizQuestion.options[mg.quizQuestion.correctIdx]} — ${mg.quizQuestion.explain}`;
            broadcastMiniGameState(room);
            continue;
          }

          broadcastMiniGameState(room);
          continue;
        }

        if (now >= mg.endsAt) {
          if (mg.kind === "hide_seek") {
            if (mg.soloMode) {
              const found = 4 - mg.orbs.length;
              finishMiniGame(room, `Waktu habis! Kamu menemukan ${found}/4 Lampion Rahasia.`);
            } else {
              const survivors = mg.players.filter((p) => p.role === "hider" && !p.caught);
              for (const s of survivors) s.score += 25;
              const names = survivors.map((s) => s.name).join(", ");
              finishMiniGame(
                room,
                survivors.length > 0
                  ? `Persembunyi Menang! ${names} berhasil bersembunyi!`
                  : "Waktu habis! Pencari menang!",
              );
            }
          } else {
            const sorted = [...mg.players].sort((a, b) => b.score - a.score);
            const top = sorted[0];
            finishMiniGame(
              room,
              top ? `Selesai! Pemenang: ${top.name} (${top.score} poin)!` : "Permainan Selesai!",
            );
          }
          continue;
        }

        // Tag Bomb fuse detonation every 18s
        if (mg.kind === "tag_bomb" && !mg.soloMode) {
          const fuseLeft = Math.max(0, Math.ceil((room.bombFuseAt - now) / 1000));
          mg.bombFuseLeft = fuseLeft;
          if (now >= room.bombFuseAt) {
            const holderName =
              mg.players.find((p) => p.id === mg.bombHolderId)?.name ?? "Pemain";
            for (const mp of mg.players) {
              if (mp.id !== mg.bombHolderId) {
                mp.score += 25;
              }
            }
            const candidates = mg.players.filter((p) => p.id !== mg.bombHolderId);
            const nextHolder =
              candidates.length > 0
                ? candidates[(mg.roundNumber + room.roundSeed) % candidates.length]
                : mg.players[0];
            mg.roundNumber += 1;
            mg.bombHolderId = nextHolder?.id ?? null;
            mg.bombFuseLeft = 18;
            room.bombFuseAt = now + 18_000;
            mg.lastHint = `💥 DUAR di tangan ${holderName}! Bom baru pada ${nextHolder?.name ?? "Pemain"}!`;
            emitRoomNotice(
              room,
              `💥 DUAR! Bom meledak di tangan ${holderName}! Survivor +25 pt!`,
              "catch",
            );
          }
        }

        // Coin Party passive Crown bonus (+3 pt/s)
        if (mg.kind === "coin_party" && mg.crownHolderId) {
          const crownPlayer = mg.players.find((p) => p.id === mg.crownHolderId);
          if (crownPlayer) {
            crownPlayer.score += 3;
          }
        }

        // Periodic directional hint every 15s during PvP Hide & Seek (now includes floor hint!)
        if (mg.kind === "hide_seek" && !mg.soloMode) {
          if (remainingSec > 0 && remainingSec % 15 === 0 && room.lastHintSec !== remainingSec) {
            room.lastHintSec = remainingSec;
            const seekerMember = mg.seekerId ? room.players.get(mg.seekerId) : undefined;
            const activeHiders = mg.players
              .filter((p) => p.role === "hider" && !p.caught)
              .map((p) => room.players.get(p.id))
              .filter((m): m is ServerMpPlayer => Boolean(m))
              .map((m) => ({
                name: m.snapshot.name,
                x: m.snapshot.x,
                y: m.snapshot.y,
                z: m.snapshot.z,
              }));
            if (seekerMember && activeHiders.length > 0) {
              mg.lastHint = buildHideSeekDirectionHint(seekerMember.snapshot, activeHiders);
            }
          }
        }

        broadcastMiniGameState(room);
      }
    }
  }, 1000);

  // Heartbeat sweep removes disconnected ghost avatars within ~30s
  const mpHeartbeat = setInterval(() => {
    for (const room of mpRooms.values()) {
      for (const member of room.players.values()) {
        if (!member.isAlive) {
          member.ws.terminate();
          continue;
        }
        member.isAlive = false;
        if (member.ws.readyState === WebSocket.OPEN) {
          member.ws.ping();
        }
      }
    }
  }, 30000);
  mpWss.on("close", () => {
    clearInterval(mpHeartbeat);
    clearInterval(mpMiniGameTick);
    clearInterval(mpBallTick);
  });

  server.on("upgrade", (req, socket, head) => {
    const reqUrl = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    if (reqUrl.pathname === "/live") {
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit("connection", ws, req);
      });
    } else if (reqUrl.pathname === "/multiplayer") {
      mpWss.handleUpgrade(req, socket, head, (ws) => {
        mpWss.emit("connection", ws, req);
      });
    } else {
      socket.destroy();
    }
  });

  mpWss.on("connection", (clientWs: WebSocket, req) => {
    const reqUrl = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    const roomId = sanitizeRoomId(reqUrl.searchParams.get("room") || undefined);
    const room = getOrCreateRoom(roomId);

    if (room.players.size >= 40) {
      sendMp(clientWs, {
        type: "world:error",
        message: "Ruang kampus penuh (maksimal 40 mahasiswa). Coba buat kode ruang lain.",
      });
      clientWs.close(1013, "Room full");
      return;
    }

    const playerId = crypto.randomUUID().slice(0, 8);
    const spawnAngle = ((room.players.size % 8) / 8) * Math.PI * 2;
    const spawnOffsetX = room.players.size === 0 ? 0 : Math.cos(spawnAngle) * 2.2;
    const spawnOffsetZ = room.players.size === 0 ? 14 : 14 + Math.sin(spawnAngle) * 1.4;

    const player: ServerMpPlayer = {
      ws: clientWs,
      lastChatMs: 0,
      lastSocialMs: 0,
      isAlive: true,
      snapshot: {
        id: playerId,
        name: sanitizePlayerName(reqUrl.searchParams.get("name") || undefined),
        colorHex: sanitizeColorHex(reqUrl.searchParams.get("color") || undefined),
        gender: sanitizeAvatarGender(reqUrl.searchParams.get("gender") || undefined),
        x: Number(spawnOffsetX.toFixed(2)),
        y: 0,
        z: Number(spawnOffsetZ.toFixed(2)),
        yaw: Math.PI,
        isSprinting: false,
        activeChapterId: "bab1",
        xp: 0,
        starsTotal: 0,
      },
    };

    room.players.set(playerId, player);

    sendMp(clientWs, {
      type: "world:init",
      selfId: playerId,
      roomId: room.id,
      players: Array.from(room.players.values()).map((m) => m.snapshot),
      recentChats: room.recentChats,
      minigame: room.minigame,
      ball: room.ball,
    });

    broadcastRoom(room, { type: "player:joined", player: player.snapshot }, playerId);

    clientWs.on("pong", () => {
      player.isAlive = true;
    });

    clientWs.on("message", (raw) => {
      player.isAlive = true;
      try {
        const msg = JSON.parse(raw.toString()) as MultiplayerClientMessage;
        if (msg.type === "world:ping") {
          sendMp(clientWs, { type: "world:pong", ts: Date.now() });
          return;
        }

        if (msg.type === "player:update") {
          const coords = clampWorldCoords(msg.x, msg.y, msg.z, msg.yaw);
          player.snapshot.x = coords.x;
          player.snapshot.y = coords.y;
          player.snapshot.z = coords.z;
          player.snapshot.yaw = coords.yaw;
          player.snapshot.isSprinting = Boolean(msg.isSprinting);
          player.snapshot.activeChapterId = sanitizeChapterId(
            typeof msg.activeChapterId === "string"
              ? msg.activeChapterId
              : player.snapshot.activeChapterId,
          );
          player.snapshot.xp =
            typeof msg.xp === "number" && Number.isFinite(msg.xp)
              ? Math.max(0, Math.min(999999, Math.round(msg.xp)))
              : player.snapshot.xp;
          player.snapshot.starsTotal =
            typeof msg.starsTotal === "number" && Number.isFinite(msg.starsTotal)
              ? Math.max(0, Math.min(21, Math.round(msg.starsTotal)))
              : player.snapshot.starsTotal;

          broadcastRoom(
            room,
            {
              type: "player:moved",
              id: playerId,
              x: player.snapshot.x,
              y: player.snapshot.y,
              z: player.snapshot.z,
              yaw: player.snapshot.yaw,
              isSprinting: player.snapshot.isSprinting,
              activeChapterId: player.snapshot.activeChapterId,
              xp: player.snapshot.xp,
              starsTotal: player.snapshot.starsTotal,
            },
            playerId,
          );

          evaluatePlayerInteractions(room, player, false);
          return;
        }

        if (msg.type === "player:profile") {
          player.snapshot.name = sanitizePlayerName(msg.name);
          player.snapshot.colorHex = sanitizeColorHex(msg.colorHex);
          player.snapshot.gender = sanitizeAvatarGender(msg.gender ?? player.snapshot.gender);
          if (room.minigame) {
            const pState = room.minigame.players.find((p) => p.id === playerId);
            if (pState) {
              pState.name = player.snapshot.name;
              pState.colorHex = player.snapshot.colorHex;
              broadcastMiniGameState(room);
            }
          }
          broadcastRoom(
            room,
            {
              type: "player:profile",
              id: playerId,
              name: player.snapshot.name,
              colorHex: player.snapshot.colorHex,
              gender: player.snapshot.gender,
            },
            playerId,
          );
          return;
        }

        if (msg.type === "player:chat") {
          const now = Date.now();
          if (now - player.lastChatMs < 300) return;
          const cleanText = sanitizeChatText(msg.text);
          if (!cleanText) return;
          player.lastChatMs = now;
          const cleanPinyin =
            typeof msg.pinyin === "string" ? sanitizeChatText(msg.pinyin).slice(0, 90) : undefined;

          let cleanStudyCard: ChatStudyCard | undefined;
          if (
            msg.studyCard &&
            typeof msg.studyCard.hanzi === "string" &&
            typeof msg.studyCard.quizPrompt === "string" &&
            Array.isArray(msg.studyCard.options) &&
            msg.studyCard.options.length === 3 &&
            typeof msg.studyCard.correctIdx === "number"
          ) {
            cleanStudyCard = {
              hanzi: sanitizeChatText(msg.studyCard.hanzi).slice(0, 48),
              pinyin: sanitizeChatText(msg.studyCard.pinyin).slice(0, 60),
              meaning: sanitizeChatText(msg.studyCard.meaning).slice(0, 140),
              chapterLabel: sanitizeChatText(msg.studyCard.chapterLabel).slice(0, 18),
              quizPrompt: sanitizeChatText(msg.studyCard.quizPrompt).slice(0, 140),
              options: [
                sanitizeChatText(msg.studyCard.options[0]).slice(0, 64),
                sanitizeChatText(msg.studyCard.options[1]).slice(0, 64),
                sanitizeChatText(msg.studyCard.options[2]).slice(0, 64),
              ],
              correctIdx: Math.max(0, Math.min(2, Math.floor(msg.studyCard.correctIdx))),
            };
          }

          const entry: MultiplayerChatEntry = {
            id: `${playerId}_${now}_${crypto.randomUUID().slice(0, 4)}`,
            playerId,
            playerName: player.snapshot.name,
            colorHex: player.snapshot.colorHex,
            text: cleanText,
            pinyin: cleanPinyin,
            emoteOnly: Boolean(msg.emoteOnly),
            studyCard: cleanStudyCard,
            ts: now,
          };

          player.snapshot.lastChat = cleanText;
          player.snapshot.lastChatPinyin = cleanPinyin;
          player.snapshot.lastChatAt = now;

          room.recentChats.push(entry);
          if (room.recentChats.length > 50) {
            room.recentChats = room.recentChats.slice(-50);
          }

          broadcastRoom(room, { type: "player:chat", entry });
          return;
        }

        if (msg.type === "player:social") {
          const now = Date.now();
          if (now - player.lastSocialMs < 450) return;
          const validKind = SOCIAL_EMOTES.find((s) => s.kind === msg.kind)?.kind;
          if (!validKind) return;
          player.lastSocialMs = now;
          player.snapshot.lastSocial = validKind;
          player.snapshot.lastSocialAt = now;

          broadcastRoom(room, {
            type: "player:social",
            id: playerId,
            name: player.snapshot.name,
            kind: validKind,
            x: player.snapshot.x,
            y: player.snapshot.y,
            z: player.snapshot.z,
            ts: now,
          });

          if (validKind === "highfive") {
            for (const peer of room.players.values()) {
              if (peer.snapshot.id === playerId) continue;
              if (
                peer.snapshot.lastSocial === "highfive" &&
                peer.snapshot.lastSocialAt &&
                now - peer.snapshot.lastSocialAt <= 4500 &&
                computeDistanceXZ(player.snapshot.x, player.snapshot.z, peer.snapshot.x, peer.snapshot.z) <= 3.6 &&
                isWithinVerticalReach(player.snapshot.y, peer.snapshot.y, 2.2)
              ) {
                emitRoomNotice(
                  room,
                  `✋ Tos Kompak! ${player.snapshot.name} & ${peer.snapshot.name}!`,
                  "score",
                  "击掌成功！· Jīzhǎng chénggōng!",
                );
                break;
              }
            }
          }
          return;
        }

        if (msg.type === "minigame:start") {
          const validKinds: MiniGameKind[] = [
            "quiz_battle",
            "word_hunter",
            "hide_seek",
            "tag_bomb",
            "coin_party",
            "parkour_race",
            "orb_rush",
            "word_dash",
          ];
          const validKind: MiniGameKind = validKinds.includes(msg.kind) ? msg.kind : "hide_seek";
          startMiniGame(room, playerId, validKind, msg.chapterFilter || "all");
          return;
        }

        if (msg.type === "minigame:action") {
          if (msg.action === "stop") {
            room.minigame = null;
            broadcastMiniGameState(room);
            emitRoomNotice(room, `${player.snapshot.name} menghentikan mini-game.`, "info");
          } else if (msg.action === "answer_quiz") {
            const mg = room.minigame;
            const q = mg?.quizQuestion;
            if (
              !mg ||
              mg.kind !== "quiz_battle" ||
              mg.phase !== "active" ||
              !q ||
              q.revealActive
            ) {
              return;
            }
            if (q.answeredPlayerIds.includes(playerId)) return;
            const opt = typeof msg.optionIdx === "number" ? Math.floor(msg.optionIdx) : -1;
            if (opt < 0 || opt > 3) return;

            q.answeredPlayerIds.push(playerId);
            const isCorrect = opt === q.correctIdx;
            const isFirst = isCorrect && !q.firstSolverName;
            const pts = computeQuizRoundPoints(isCorrect, isFirst);
            if (isFirst) {
              q.firstSolverName = player.snapshot.name;
            }
            const pState = mg.players.find((p) => p.id === playerId);
            if (pState && pts > 0) {
              pState.score += pts;
            }

            if (isCorrect) {
              emitRoomNotice(
                room,
                `${player.snapshot.name} benar${isFirst ? " tercepat!" : "!"} (+${pts} pt & +15 XP)`,
                "score",
                q.options[q.correctIdx],
                { rewardPlayerId: playerId, xpReward: 15 },
              );
            } else {
              emitRoomNotice(
                room,
                `${player.snapshot.name} kurang tepat — jawaban benar: ${q.options[q.correctIdx]}`,
                "info",
                q.explain,
              );
            }

            const allAnswered = mg.players.every((p) => q.answeredPlayerIds.includes(p.id));
            if (allAnswered) {
              q.revealActive = true;
              room.quizRevealUntil = Date.now() + 2400;
              mg.secondsLeft = 2;
              mg.lastHint = `Semua menjawab! Benar: ${q.options[q.correctIdx]} — ${q.explain}`;
            }
            broadcastMiniGameState(room);
          } else if (msg.action === "catch" || msg.action === "pass_bomb") {
            evaluatePlayerInteractions(room, player, true);
          } else if (msg.action === "collect_orb" || msg.action === "reach_zone") {
            evaluatePlayerInteractions(room, player, false);
          }
        }
      } catch {
        // ignore malformed packets
      }
    });

    clientWs.on("close", () => {
      room.players.delete(playerId);
      broadcastRoom(room, { type: "player:left", id: playerId }, playerId);
      if (room.minigame && (room.minigame.phase === "countdown" || room.minigame.phase === "active")) {
        if (!room.minigame.soloMode && room.minigame.seekerId === playerId) {
          finishMiniGame(room, "Pencari keluar dari ruang! Persembunyi Menang!");
        } else {
          room.minigame.players = room.minigame.players.filter((p) => p.id !== playerId);
          if (room.minigame.bombHolderId === playerId && room.minigame.players.length > 0) {
            room.minigame.bombHolderId = room.minigame.players[0].id;
            room.bombFuseAt = Date.now() + 18_000;
          }
          if (room.minigame.crownHolderId === playerId) {
            room.minigame.crownHolderId = null;
          }
          broadcastMiniGameState(room);
        }
      }
      if (room.players.size === 0) {
        mpRooms.delete(room.id);
      }
    });
  });

  wss.on("connection", async (clientWs: WebSocket, req) => {
    const reqUrl = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    const chapterId = sanitizeChapterId(reqUrl.searchParams.get("chapter") || undefined);
    const scenario = reqUrl.searchParams.get("scenario")?.slice(0, 180) || undefined;

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === "MY_GEMINI_API_KEY") {
      clientWs.send(
        JSON.stringify({
          type: "error",
          message:
            "GEMINI_API_KEY belum dikonfigurasi di server. Tambahkan secret GEMINI_API_KEY di panel Secrets untuk mengaktifkan percakapan suara Live API.",
        }),
      );
      clientWs.close(1008, "Missing GEMINI_API_KEY");
      return;
    }

    const ai = new GoogleGenAI({
      apiKey,
      apiVersion: "v1beta",
      httpOptions: { headers: { "User-Agent": "aistudio-build" } },
    });

    let session: Awaited<ReturnType<typeof ai.live.connect>> | null = null;
    let setupReady = false;
    let closed = false;
    const pendingMessages: string[] = [];

    const sendSafe = (payload: unknown) => {
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(JSON.stringify(payload));
      }
    };

    const forwardClientPayload = (rawText: string) => {
      if (!session || closed) return;
      try {
        const msg = JSON.parse(rawText) as { audio?: string; text?: string };
        if (msg.audio) {
          session.sendRealtimeInput({
            audio: { data: msg.audio, mimeType: "audio/pcm;rate=16000" },
          });
        } else if (msg.text) {
          session.sendClientContent({
            turns: [{ role: "user", parts: [{ text: msg.text }] }],
            turnComplete: true,
          });
        }
      } catch {
        // ignore malformed frames
      }
    };

    clientWs.on("message", (raw) => {
      const str = raw.toString();
      if (!session || !setupReady) {
        if (pendingMessages.length < 25) {
          pendingMessages.push(str);
        }
        return;
      }
      forwardClientPayload(str);
    });

    clientWs.on("close", () => {
      closed = true;
      try {
        session?.close();
      } catch {
        // ignore close errors
      }
    });

    try {
      session = await ai.live.connect({
        model: "gemini-3.8-live",
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } },
          },
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          systemInstruction: buildSystemInstruction(chapterId, scenario),
        },
        callbacks: {
          onmessage: (message: LiveServerMessage) => {
            if (closed) return;
            if (message.setupComplete && !setupReady) {
              setupReady = true;
              sendSafe({ type: "ready", chapterId, model: "gemini-3.8-live" });
              while (pendingMessages.length > 0) {
                const next = pendingMessages.shift();
                if (next) forwardClientPayload(next);
              }
            }
            const content = message.serverContent;
            if (content?.inputTranscription?.text) {
              sendSafe({
                type: "inputTranscript",
                text: content.inputTranscription.text,
              });
            }
            if (content?.outputTranscription?.text) {
              sendSafe({
                type: "outputTranscript",
                text: content.outputTranscription.text,
              });
            }
            for (const part of content?.modelTurn?.parts ?? []) {
              if (part.inlineData?.data) {
                sendSafe({
                  type: "audio",
                  audio: part.inlineData.data,
                });
              }
            }
            if (content?.interrupted) {
              sendSafe({ type: "interrupted" });
            }
            if (content?.turnComplete) {
              sendSafe({ type: "turnComplete" });
            }
          },
          onerror: (err: unknown) => {
            const msg = err instanceof Error ? err.message : "Koneksi Gemini Live bermasalah.";
            sendSafe({ type: "error", message: msg });
          },
          onclose: () => {
            if (!closed) {
              sendSafe({ type: "closed" });
            }
          },
        },
      });
    } catch (err) {
      const msg =
        err instanceof Error
          ? `Gagal membuka sesi Gemini Live: ${err.message}`
          : "Gagal membuka sesi Gemini Live.";
      sendSafe({ type: "error", message: msg });
      clientWs.close(1011, "Live session error");
      return;
    }
  });

  if (process.env.NODE_ENV === "production") {
    const distPath = path.resolve(__dirname, "dist");
    app.use(express.static(distPath));
    app.get("/{*path}", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
    app.get("/{*path}", async (req, res, next) => {
      try {
        const template = fs.readFileSync(path.resolve(__dirname, "index.html"), "utf-8");
        const html = await vite.transformIndexHtml(req.originalUrl, template);
        res.status(200).set({ "Content-Type": "text/html" }).end(html);
      } catch (e) {
        next(e);
      }
    });
  }

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Kota & Kampus Hanyu server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
