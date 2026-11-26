import { DurableObject } from "cloudflare:workers";
import {
  buildHideSeekDirectionHint,
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
  sanitizeProgressUpdate,
  sanitizeRoomId,
  selectNextSeekerId,
  serializeMiniGameSnapshot,
  SOCIAL_EMOTES,
  type ChatStudyCard,
  type MiniGameKind,
  type MiniGamePlayerState,
  type MiniGameSnapshot,
  type MultiplayerChatEntry,
  type MultiplayerClientMessage,
  type MultiplayerServerMessage,
  type RemotePlayerSnapshot,
  type ServerMiniGameSnapshot,
  type SharedBallState,
  type SocialEmoteKind,
  validateMovementUpdate,
} from "../src/game/multiplayer";
import { sanitizeAvatarAppearance } from "../src/game/avatar";
import { SOCCER_FIELD_CENTER, SOCCER_GOALS } from "../src/game/worldLayout";

const MAX_ROOM_PLAYERS = 40;
const ROOM_IDLE_TIMEOUT_MS = 5 * 60_000;
const SOCCER_TICK_MS = 100;
const MINIGAME_TICK_MS = 1000;
const MAX_MESSAGE_BYTES = 32 * 1024;
const MESSAGE_LIMIT_PER_SECOND = 60;

interface ServerMpPlayer {
  playerId: string;
  snapshot: RemotePlayerSnapshot;
  lastChatMs: number;
  lastSocialMs: number;
  lastMovementMs: number;
  lastUpdateMs: number;
  messageWindowStartedAt: number;
  messageCount: number;
}

interface ServerMpRoom {
  id: string;
  hostId: string | null;
  players: Map<string, ServerMpPlayer>;
  recentChats: MultiplayerChatEntry[];
  minigame: ServerMiniGameSnapshot | null;
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
  lastActivityAt: number;
}

interface PersistedRoomSnapshot extends Omit<ServerMpRoom, "players"> {
  players: [string, ServerMpPlayer][];
}

interface WebSocketAttachment {
  playerId: string;
}

function createRoom(id: string): ServerMpRoom {
  return {
    id,
    hostId: null,
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
    lastActivityAt: Date.now(),
  };
}

export class RoomDurableObject extends DurableObject {
  private room: ServerMpRoom;
  private nextMiniGameTickAt = Date.now() + MINIGAME_TICK_MS;
  private persistenceQueue: Promise<void> = Promise.resolve();

  constructor(ctx: DurableObjectState, env: Cloudflare.Env) {
    super(ctx, env);
    this.room = createRoom("");

    // Startup is blocked until authoritative state and its alarm have been revived.
    this.ctx.blockConcurrencyWhile(async () => {
      const stored = await this.ctx.storage.get<PersistedRoomSnapshot>("room");
      if (stored) this.restoreRoom(stored);

      this.nextMiniGameTickAt = Date.now() + MINIGAME_TICK_MS;
      if (this.room.players.size > 0) {
        const existingAlarm = await this.ctx.storage.getAlarm();
        if (existingAlarm === null) {
          await this.ctx.storage.setAlarm(Date.now() + SOCCER_TICK_MS);
        }
      }

      if (
        typeof WebSocketRequestResponsePair !== "undefined" &&
        typeof this.ctx.setWebSocketAutoResponse === "function"
      ) {
        this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
      }
    });
  }

  private restoreRoom(stored: PersistedRoomSnapshot): void {
    const fallback = createRoom(typeof stored.id === "string" ? stored.id : "");
    const players = new Map<string, ServerMpPlayer>();
    if (Array.isArray(stored.players)) {
      for (const entry of stored.players) {
        if (!Array.isArray(entry) || entry.length !== 2 || !entry[1]) continue;
        const [playerId, member] = entry;
        if (typeof playerId !== "string" || !member.snapshot) continue;
        players.set(playerId, {
          ...member,
          playerId,
          messageWindowStartedAt:
            typeof member.messageWindowStartedAt === "number"
              ? member.messageWindowStartedAt
              : Date.now(),
          messageCount:
            typeof member.messageCount === "number" ? member.messageCount : 0,
        });
      }
    }

    this.room = {
      ...fallback,
      id: typeof stored.id === "string" ? stored.id : fallback.id,
      hostId:
        typeof stored.hostId === "string" && players.has(stored.hostId)
          ? stored.hostId
          : players.keys().next().value ?? null,
      players,
      recentChats: Array.isArray(stored.recentChats) ? stored.recentChats : [],
      minigame:
        stored.minigame && typeof stored.minigame === "object"
          ? stored.minigame
          : null,
      ball:
        stored.ball && typeof stored.ball === "object"
          ? stored.ball
          : fallback.ball,
      lastSeekerId:
        typeof stored.lastSeekerId === "string" ? stored.lastSeekerId : null,
      roundSeed:
        typeof stored.roundSeed === "number" && Number.isFinite(stored.roundSeed)
          ? stored.roundSeed
          : fallback.roundSeed,
      lastHintSec:
        typeof stored.lastHintSec === "number" ? stored.lastHintSec : -1,
      bombFuseAt:
        typeof stored.bombFuseAt === "number" ? stored.bombFuseAt : 0,
      lastBombPassMs:
        typeof stored.lastBombPassMs === "number" ? stored.lastBombPassMs : 0,
      lastCrownStealMs:
        typeof stored.lastCrownStealMs === "number"
          ? stored.lastCrownStealMs
          : 0,
      usedQuizIds: Array.isArray(stored.usedQuizIds) ? stored.usedQuizIds : [],
      usedClueIds: Array.isArray(stored.usedClueIds) ? stored.usedClueIds : [],
      quizRevealUntil:
        typeof stored.quizRevealUntil === "number" ? stored.quizRevealUntil : 0,
      lastActivityAt:
        typeof stored.lastActivityAt === "number"
          ? stored.lastActivityAt
          : Date.now(),
    };
  }

  private serializeRoom(): PersistedRoomSnapshot {
    return {
      ...this.room,
      players: Array.from(this.room.players.entries()),
    };
  }

  private persistRoom(): Promise<void> {
    const operation = this.persistenceQueue.then(async () => {
      if (this.room.players.size === 0) {
        await this.ctx.storage.delete("room");
        await this.ctx.storage.deleteAlarm();
        return;
      }
      await this.ctx.storage.put("room", this.serializeRoom());
    });
    this.persistenceQueue = operation.catch(() => undefined);
    return operation;
  }

  private async clearEmptyRoom(): Promise<void> {
    const roomId = this.room.id;
    this.room = createRoom(roomId);
    this.nextMiniGameTickAt = Date.now() + MINIGAME_TICK_MS;
    await this.persistRoom();
  }

  private async scheduleAlarm(): Promise<void> {
    if (this.room.players.size === 0) {
      await this.ctx.storage.deleteAlarm();
      return;
    }
    await this.ctx.storage.setAlarm(Date.now() + SOCCER_TICK_MS);
  }

  private getAttachment(ws: WebSocket): WebSocketAttachment | null {
    try {
      const attachment = ws.deserializeAttachment() as Partial<WebSocketAttachment> | null;
      if (attachment && typeof attachment.playerId === "string") {
        return { playerId: attachment.playerId };
      }
    } catch {
      // A socket without a usable attachment cannot address a room player.
    }
    return null;
  }

  private findPlayerSocket(playerId: string): WebSocket | null {
    for (const ws of this.ctx.getWebSockets()) {
      if (this.getAttachment(ws)?.playerId === playerId) return ws;
    }
    return null;
  }

  private sendSerializedMp(ws: WebSocket, serialized: string): void {
    if (ws.readyState !== WebSocket.OPEN) return;
    try {
      ws.send(serialized);
    } catch {
      try {
        ws.close(1011, "Send failed");
      } catch {
        // The platform will deliver the close/error event if the socket is gone.
      }
    }
  }

  private sendMp(ws: WebSocket, payload: MultiplayerServerMessage): void {
    this.sendSerializedMp(ws, JSON.stringify(payload));
  }

  private sendToPlayer(playerId: string, payload: MultiplayerServerMessage): void {
    const ws = this.findPlayerSocket(playerId);
    if (ws) this.sendMp(ws, payload);
  }

  private broadcastRoom(
    payload: MultiplayerServerMessage,
    excludePlayerId?: string,
  ): void {
    const serialized = JSON.stringify(payload);
    for (const ws of this.ctx.getWebSockets()) {
      const playerId = this.getAttachment(ws)?.playerId;
      if (!playerId || !this.room.players.has(playerId)) continue;
      if (excludePlayerId && playerId === excludePlayerId) continue;
      this.sendSerializedMp(ws, serialized);
    }
  }

  private emitRoomNotice(
    text: string,
    tone: "info" | "catch" | "score" | "win",
    pinyin?: string,
    extra?: { rewardPlayerId?: string; xpReward?: number },
  ): void {
    this.broadcastRoom({
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
  }

  private broadcastMiniGameState(): void {
    this.broadcastRoom({
      type: "minigame:state",
      minigame: serializeMiniGameSnapshot(this.room.minigame),
    });
  }

  private finishMiniGame(summary: string): void {
    const mg = this.room.minigame;
    if (!mg || mg.phase === "ended") return;
    mg.phase = "ended";
    mg.secondsLeft = 0;
    mg.winnerSummary = summary;
    mg.endsAt = Date.now();
    if (mg.kind === "quiz_battle" && mg.quizQuestion) {
      mg.quizQuestion.revealActive = true;
      const q = mg.quizQuestion;
      mg.lastHint = `Jawaban: ${q.options[q.correctIdx]} — ${q.explain}`;
    }
    this.broadcastMiniGameState();
    this.emitRoomNotice(summary, "win", "游戏结束 · Yóuxì jiéshù");
  }

  private startMiniGame(
    hostId: string,
    kind: MiniGameKind,
    chapterFilter = "all",
  ): void {
    const room = this.room;
    if (room.hostId !== hostId || !room.players.has(hostId)) return;
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
      this.broadcastMiniGameState();
      this.emitRoomNotice(
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
      this.broadcastMiniGameState();
      this.emitRoomNotice(
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
        this.broadcastMiniGameState();
        this.emitRoomNotice(
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
      this.broadcastMiniGameState();
      this.emitRoomNotice(
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
        this.broadcastMiniGameState();
        this.emitRoomNotice("Estafet Bom Waktu (Solo): Jinakkan bom sebelum waktu habis!", "info");
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
      this.broadcastMiniGameState();
      this.emitRoomNotice(
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
      this.broadcastMiniGameState();
      this.emitRoomNotice(
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
      this.broadcastMiniGameState();
      this.emitRoomNotice(
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
      this.broadcastMiniGameState();
      this.emitRoomNotice("Lomba Bola Aksara dimulai! Kumpulkan bola Hanzi tercepat.", "info", "夺宝开始！");
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
    this.broadcastMiniGameState();
    this.emitRoomNotice(
      `Lari Kata Mandarin: Cari ${prompt.hanzi} (${prompt.meaning})!`,
      "info",
      prompt.pinyin,
    );
  }

  private evaluatePlayerInteractions(
    actor: ServerMpPlayer,
    explicitAction = false,
  ): boolean {
    const room = this.room;
    const mg = room.minigame;
    if (!mg || mg.phase !== "active") return false;

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
          this.emitRoomNotice(
                `Lampion "${orb.hanzi}" ditemukan! (${orb.meaning})`,
            "catch",
            orb.pinyin,
          );
          if (mg.orbs.length === 0) {
            this.finishMiniGame(
              `Hebat! Semua Lampion Rahasia ditemukan (${pState?.score ?? 60} poin)!`,
            );
          } else {
            mg.lastHint = `Tersisa ${mg.orbs.length} Lampion tersembunyi (cek lantai atas)!`;
            this.broadcastMiniGameState();
          }
          return true;
        }
        return false;
      }

      if (actor.snapshot.id !== mg.seekerId) return false;
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
          this.emitRoomNotice(`${hp.name} tertangkap oleh Pencari!`, "catch", "抓到了！· Zhuādào le!");
        }
      }

      if (anyCaught) {
        const remaining = mg.players.filter((p) => p.role === "hider" && !p.caught);
        if (remaining.length === 0) {
          const seekerName = mg.players.find((p) => p.id === mg.seekerId)?.name ?? "Pencari";
          this.finishMiniGame(`Pencari Menang! ${seekerName} menangkap semua persembunyi!`);
        } else {
          this.broadcastMiniGameState();
        }
        return true;
      }
      return false;
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
          this.emitRoomNotice(
                `Bom di ${orb.pinyin} berhasil dijinakkan! (+${orb.points} pt)`,
            "score",
          );
          if (mg.orbs.length === 0) {
            mg.roundNumber += 1;
            mg.orbs = generateDefuseBombs(3, room.roundSeed + mg.roundNumber);
            mg.lastHint = `Gelombang ${mg.roundNumber}: 3 Bom Waktu baru muncul!`;
          }
          this.broadcastMiniGameState();
          return true;
        }
        return false;
      }

      if (actor.snapshot.id !== mg.bombHolderId) return false;
      if (now - room.lastBombPassMs < 1300) return false;

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
        this.emitRoomNotice(
            `💣 Bom berpindah ke ${targetPeer.snapshot.name}! Cepat oper ke pemain lain!`,
          "catch",
        );
        this.broadcastMiniGameState();
        return true;
      }
      return false;
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
          this.emitRoomNotice(
                `👑 ${actor.snapshot.name} merebut Mahkota Raja! (+50 pt & +3 pt/detik)`,
            "score",
          );
        } else {
          this.emitRoomNotice(
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
          this.emitRoomNotice(`👑 ${actor.snapshot.name} mencuri Mahkota Raja (+15 pt)!`, "catch");
          stateChanged = true;
        }
      }

      if (stateChanged) this.broadcastMiniGameState();
      return stateChanged;
    }

    if (mg.kind === "parkour_race" && mg.checkpoints && mg.checkpoints.length > 0) {
      const pState = mg.players.find((p) => p.id === actor.snapshot.id);
      if (!pState) return false;
      const cpIdx = pState.checkpointIdx ?? 0;
      const targetCp = mg.checkpoints[cpIdx];
      if (!targetCp) return false;

      if (
        computeDistanceXZ(ax, az, targetCp.x, targetCp.z) <= 3.9 &&
        isWithinVerticalReach(ay, targetCp.y, 2.25)
      ) {
        pState.score += 25;
        pState.checkpointIdx = cpIdx + 1;
        if (pState.checkpointIdx >= mg.checkpoints.length) {
          pState.score += 40;
          this.finishMiniGame(
            `🏁 Juara Parkour! ${pState.name} menaklukkan semua ${mg.checkpoints.length} pos (${pState.score} pt)!`,
          );
          return true;
        }
        const nextCp = mg.checkpoints[pState.checkpointIdx];
        mg.lastHint = `${pState.name} mencapai Pos ${cpIdx + 1}/${mg.checkpoints.length}! Lanjut: ${nextCp.label}`;
        this.emitRoomNotice(
            `🚩 ${pState.name} melewati ${targetCp.label} (+25 pt)!`,
          "score",
        );
        this.broadcastMiniGameState();
        return true;
      }
      return false;
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
          this.emitRoomNotice(
                `Benar! ${actor.snapshot.name} ambil "${orb.hanzi}" (${orb.pinyin} = ${orb.meaning}) (+${orb.points} pt & +15 XP)`,
            "score",
            `Lanjut: ${nextWave.prompt.clue}`,
            { rewardPlayerId: actor.snapshot.id, xpReward: 15 },
          );
        } else {
          if (pState) pState.score = Math.max(0, pState.score + orb.points);
          this.emitRoomNotice(
                `Ups! "${orb.hanzi}" (${orb.pinyin}) artinya "${orb.meaning}" (-5 pt). Cari yang tepat!`,
            "catch",
            mg.wordHunterPrompt?.clue,
          );
        }
        this.broadcastMiniGameState();
        return true;
      }
      return false;
    }

    if (mg.kind === "orb_rush") {
      const hitIdx = mg.orbs.findIndex(
        (o) => computeDistanceXZ(ax, az, o.x, o.z) <= 2.35 && isWithinVerticalReach(ay, o.y ?? 0, 2.4),
      );
      if (hitIdx !== -1) {
        const [orb] = mg.orbs.splice(hitIdx, 1);
        const pState = mg.players.find((p) => p.id === actor.snapshot.id);
        if (pState) pState.score += orb.points;
        this.emitRoomNotice(
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
        this.broadcastMiniGameState();
        return true;
      }
      return false;
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
        this.emitRoomNotice(
            `${actor.snapshot.name} tiba di ${solvedZone} (+15 pt & +10 XP)! Lanjut ke ${nextPrompt.hanzi}!`,
          "score",
          nextPrompt.pinyin,
          { rewardPlayerId: actor.snapshot.id, xpReward: 10 },
        );
        this.broadcastMiniGameState();
        return true;
      }
    }

    return false;
  }

  private tickSoccer(): void {
    let ballChanged = false;
    const b = this.room.ball;

    for (const member of this.room.players.values()) {
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
      this.emitRoomNotice(
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
      this.emitRoomNotice(
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
      this.broadcastRoom({ type: "world:ball", ball: { ...b } });
    }
  }

  private tickMiniGame(now: number): void {
    const room = this.room;
    const mg = room.minigame;
    if (!mg || mg.phase === "idle" || mg.phase === "ended") return;

    const remainingSec = Math.max(0, Math.ceil((mg.endsAt - now) / 1000));
    mg.secondsLeft = remainingSec;

    if (mg.phase === "countdown") {
      if (now >= mg.endsAt) {
        mg.phase = "active";
        mg.startedAt = now;
        mg.endsAt = now + 75_000;
        mg.secondsLeft = 75;
        mg.lastHint = "Waktu sembunyi habis! Pencari mulai berburu!";
        this.broadcastMiniGameState();
        this.emitRoomNotice("Pencari bergerak! Selamat berburu!", "info", "开始找人！· Kāishǐ zhǎo rén!");
      } else {
        this.broadcastMiniGameState();
      }
      return;
    }

    if (mg.phase === "active") {
      if (mg.kind === "quiz_battle" && mg.quizQuestion) {
        const totalRounds = mg.totalRounds ?? 6;
        if (mg.quizQuestion.revealActive) {
          if (now >= room.quizRevealUntil) {
            if (mg.roundNumber >= totalRounds) {
              const sorted = [...mg.players].sort((a, b) => b.score - a.score);
              const top = sorted[0];
              this.finishMiniGame(
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
              this.broadcastMiniGameState();
            }
          } else {
            mg.secondsLeft = Math.max(0, Math.ceil((room.quizRevealUntil - now) / 1000));
            this.broadcastMiniGameState();
          }
          return;
        }

        if (now >= mg.endsAt) {
          mg.quizQuestion.revealActive = true;
          room.quizRevealUntil = now + 2600;
          mg.secondsLeft = 3;
          mg.lastHint = `Jawaban: ${mg.quizQuestion.options[mg.quizQuestion.correctIdx]} — ${mg.quizQuestion.explain}`;
          this.broadcastMiniGameState();
          return;
        }

        this.broadcastMiniGameState();
        return;
      }

      if (now >= mg.endsAt) {
        if (mg.kind === "hide_seek") {
          if (mg.soloMode) {
            const found = 4 - mg.orbs.length;
            this.finishMiniGame(`Waktu habis! Kamu menemukan ${found}/4 Lampion Rahasia.`);
          } else {
            const survivors = mg.players.filter((p) => p.role === "hider" && !p.caught);
            for (const s of survivors) s.score += 25;
            const names = survivors.map((s) => s.name).join(", ");
            this.finishMiniGame(
              survivors.length > 0
                ? `Persembunyi Menang! ${names} berhasil bersembunyi!`
                : "Waktu habis! Pencari menang!",
            );
          }
        } else {
          const sorted = [...mg.players].sort((a, b) => b.score - a.score);
          const top = sorted[0];
          this.finishMiniGame(
            top ? `Selesai! Pemenang: ${top.name} (${top.score} poin)!` : "Permainan Selesai!",
          );
        }
        return;
      }

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
          this.emitRoomNotice(
            `💥 DUAR! Bom meledak di tangan ${holderName}! Survivor +25 pt!`,
            "catch",
          );
        }
      }

      if (mg.kind === "coin_party" && mg.crownHolderId) {
        const crownPlayer = mg.players.find((p) => p.id === mg.crownHolderId);
        if (crownPlayer) {
          crownPlayer.score += 3;
        }
      }

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

      this.broadcastMiniGameState();
    }
  }

  async alarm(): Promise<void> {
    const now = Date.now();
    if (this.room.players.size === 0) {
      await this.clearEmptyRoom();
      return;
    }

    this.tickSoccer();

    if (now >= this.nextMiniGameTickAt) {
      this.nextMiniGameTickAt = now + MINIGAME_TICK_MS;
      this.tickMiniGame(now);
      await this.persistRoom();
    }

    if (now - this.room.lastActivityAt > ROOM_IDLE_TIMEOUT_MS) {
      for (const ws of this.ctx.getWebSockets()) {
        try {
          ws.close(1000, "Room idle");
        } catch {
          // Closing an already-closed socket is harmless.
        }
      }
      await this.clearEmptyRoom();
      return;
    }

    await this.scheduleAlarm();
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin");
    if (origin !== null) {
      let allowed = false;
      try {
        const originUrl = new URL(origin);
        allowed =
          (originUrl.protocol === "http:" || originUrl.protocol === "https:") &&
          originUrl.host.toLowerCase() === url.host.toLowerCase();
      } catch {
        allowed = false;
      }
      if (!allowed) {
        return Response.json({ error: "Origin tidak diizinkan." }, { status: 403 });
      }
    }

    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return Response.json({ error: "WebSocket upgrade diperlukan." }, { status: 426 });
    }

    const roomId = sanitizeRoomId(url.searchParams.get("room") || undefined);
    this.room.id = roomId;
    if (this.room.players.size >= MAX_ROOM_PLAYERS) {
      return Response.json(
        {
          error: `Ruang kampus penuh (maksimal ${MAX_ROOM_PLAYERS} mahasiswa). Coba buat kode ruang lain.`,
        },
        { status: 503, headers: { "Retry-After": "1" } },
      );
    }

    const pair = new WebSocketPair();
    const clientSocket = pair[0];
    const serverSocket = pair[1];
    const now = Date.now();
    const playerId = crypto.randomUUID().slice(0, 8);
    const spawnAngle = ((this.room.players.size % 8) / 8) * Math.PI * 2;
    const spawnOffsetX = this.room.players.size === 0 ? 0 : Math.cos(spawnAngle) * 2.2;
    const spawnOffsetZ = this.room.players.size === 0 ? 14 : 14 + Math.sin(spawnAngle) * 1.4;
    const gender = sanitizeAvatarGender(url.searchParams.get("gender") || undefined);

    const player: ServerMpPlayer = {
      playerId,
      lastChatMs: 0,
      lastSocialMs: 0,
      lastMovementMs: now,
      lastUpdateMs: 0,
      messageWindowStartedAt: now,
      messageCount: 0,
      snapshot: {
        id: playerId,
        name: sanitizePlayerName(url.searchParams.get("name") || undefined),
        colorHex: sanitizeColorHex(url.searchParams.get("color") || undefined),
        gender,
        appearance: sanitizeAvatarAppearance(
          {
            styleId: url.searchParams.get("style") || undefined,
            hairColor: url.searchParams.get("hair") || undefined,
            skinTone: url.searchParams.get("skin") || undefined,
          },
          gender,
        ),
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

    serverSocket.serializeAttachment({ playerId } satisfies WebSocketAttachment);
    this.ctx.acceptWebSocket(serverSocket);

    if (!this.room.hostId) this.room.hostId = playerId;
    this.room.players.set(playerId, player);
    this.room.lastActivityAt = now;

    this.sendMp(serverSocket, {
      type: "world:init",
      selfId: playerId,
      roomId: this.room.id,
      hostId: this.room.hostId,
      players: Array.from(this.room.players.values()).map((m) => m.snapshot),
      recentChats: this.room.recentChats,
      minigame: serializeMiniGameSnapshot(this.room.minigame),
      ball: this.room.ball,
    });

    this.broadcastRoom({ type: "player:joined", player: player.snapshot }, playerId);

    await this.persistRoom();
    await this.scheduleAlarm();
    return new Response(null, { status: 101, webSocket: clientSocket });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const attachment = this.getAttachment(ws);
    if (!attachment) return;
    const playerId = attachment.playerId;
    const player = this.room.players.get(playerId);
    // Hibernation can restore a socket before its old player entry is available.
    if (!player) return;

    const now = Date.now();
    if (now - player.messageWindowStartedAt >= 1000) {
      player.messageWindowStartedAt = now;
      player.messageCount = 0;
    }
    if (player.messageCount >= MESSAGE_LIMIT_PER_SECOND) {
      this.sendMp(ws, { type: "world:error", message: "Pesan terlalu cepat. Koneksi ditutup." });
      ws.close(1008, "Message rate limit");
      await this.persistRoom();
      return;
    }
    player.messageCount += 1;
    this.room.lastActivityAt = now;

    const messageSize =
      typeof message === "string"
        ? new TextEncoder().encode(message).byteLength
        : message.byteLength;
    if (messageSize > MAX_MESSAGE_BYTES) {
      ws.close(1009, "Message too large");
      await this.persistRoom();
      return;
    }

    try {
      const text = typeof message === "string" ? message : new TextDecoder().decode(message);
      const msg = JSON.parse(text) as MultiplayerClientMessage;
      if (msg.type === "world:ping") {
        this.sendMp(ws, { type: "world:pong", ts: Date.now() });
        return;
      }

      if (msg.type === "player:update") {
        if (now - player.lastUpdateMs < 33) return;
        const movement = validateMovementUpdate(player.snapshot, msg, now - player.lastMovementMs);
        player.lastMovementMs = now;
        if (!movement) {
          this.sendMp(ws, { type: "world:error", message: "Gerakan terlalu cepat atau tidak valid." });
          return;
        }
        player.lastUpdateMs = now;
        Object.assign(player.snapshot, movement);
        Object.assign(player.snapshot, sanitizeProgressUpdate(player.snapshot, msg.xp, msg.starsTotal));

        this.broadcastRoom(
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

        if (this.evaluatePlayerInteractions(player, false)) {
          await this.persistRoom();
        }
        return;
      }

      if (msg.type === "player:profile") {
        player.snapshot.name = sanitizePlayerName(msg.name);
        player.snapshot.colorHex = sanitizeColorHex(msg.colorHex);
        player.snapshot.gender = sanitizeAvatarGender(msg.gender ?? player.snapshot.gender);
        player.snapshot.appearance = sanitizeAvatarAppearance(
          msg.appearance ?? player.snapshot.appearance,
          player.snapshot.gender,
        );
        if (this.room.minigame) {
          const pState = this.room.minigame.players.find((p) => p.id === playerId);
          if (pState) {
            pState.name = player.snapshot.name;
            pState.colorHex = player.snapshot.colorHex;
            this.broadcastMiniGameState();
          }
        }
        this.broadcastRoom(
          {
            type: "player:profile",
            id: playerId,
            name: player.snapshot.name,
            colorHex: player.snapshot.colorHex,
            gender: player.snapshot.gender,
            appearance: player.snapshot.appearance,
          },
          playerId,
        );
        await this.persistRoom();
        return;
      }

      if (msg.type === "player:chat") {
        const chatNow = Date.now();
        if (chatNow - player.lastChatMs < 300) return;
        const cleanText = sanitizeChatText(msg.text);
        if (!cleanText) return;
        player.lastChatMs = chatNow;
        const cleanPinyin =
          typeof msg.pinyin === "string" ? sanitizeChatText(msg.pinyin).slice(0, 90) : undefined;

        let cleanStudyCard: ChatStudyCard | undefined;
        if (
          msg.studyCard &&
          typeof msg.studyCard.hanzi === "string" &&
          typeof msg.studyCard.quizPrompt === "string" &&
          Array.isArray(msg.studyCard.options) &&
          msg.studyCard.options.length === 3 &&
          typeof msg.studyCard.correctIdx === "number" &&
          Number.isFinite(msg.studyCard.correctIdx) &&
          Number.isInteger(msg.studyCard.correctIdx)
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
          id: `${playerId}_${chatNow}_${crypto.randomUUID().slice(0, 4)}`,
          playerId,
          playerName: player.snapshot.name,
          colorHex: player.snapshot.colorHex,
          text: cleanText,
          pinyin: cleanPinyin,
          emoteOnly: Boolean(msg.emoteOnly),
          studyCard: cleanStudyCard,
          ts: chatNow,
        };

        player.snapshot.lastChat = cleanText;
        player.snapshot.lastChatPinyin = cleanPinyin;
        player.snapshot.lastChatAt = chatNow;

        this.room.recentChats.push(entry);
        if (this.room.recentChats.length > 50) {
          this.room.recentChats = this.room.recentChats.slice(-50);
        }

        this.broadcastRoom({ type: "player:chat", entry });
        await this.persistRoom();
        return;
      }

      if (msg.type === "player:social") {
        const socialNow = Date.now();
        if (socialNow - player.lastSocialMs < 450) return;
        const validKind = SOCIAL_EMOTES.find((s) => s.kind === msg.kind)?.kind;
        if (!validKind) return;
        player.lastSocialMs = socialNow;
        player.snapshot.lastSocial = validKind;
        player.snapshot.lastSocialAt = socialNow;

        this.broadcastRoom({
          type: "player:social",
          id: playerId,
          name: player.snapshot.name,
          kind: validKind,
          x: player.snapshot.x,
          y: player.snapshot.y,
          z: player.snapshot.z,
          ts: socialNow,
        });

        if (validKind === "highfive") {
          for (const peer of this.room.players.values()) {
            if (peer.snapshot.id === playerId) continue;
            if (
              peer.snapshot.lastSocial === "highfive" &&
              peer.snapshot.lastSocialAt &&
              socialNow - peer.snapshot.lastSocialAt <= 4500 &&
              computeDistanceXZ(player.snapshot.x, player.snapshot.z, peer.snapshot.x, peer.snapshot.z) <= 3.6 &&
              isWithinVerticalReach(player.snapshot.y, peer.snapshot.y, 2.2)
            ) {
              this.emitRoomNotice(
                `✋ Tos Kompak! ${player.snapshot.name} & ${peer.snapshot.name}!`,
                "score",
                "击掌成功！· Jīzhǎng chénggōng!",
              );
              break;
            }
          }
        }
        await this.persistRoom();
        return;
      }

      if (msg.type === "minigame:start") {
        if (this.room.hostId !== playerId) {
          this.sendMp(ws, { type: "world:error", message: "Hanya host ruang yang dapat memulai mini-game." });
          return;
        }
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
        const validKind = validKinds.find((kind) => kind === msg.kind);
        if (!validKind) {
          this.sendMp(ws, { type: "world:error", message: "Jenis mini-game tidak valid." });
          return;
        }
        this.startMiniGame(playerId, validKind, msg.chapterFilter || "all");
        await this.persistRoom();
        return;
      }

      if (msg.type === "minigame:action") {
        if (msg.action === "stop") {
          if (this.room.hostId !== playerId) {
            this.sendMp(ws, { type: "world:error", message: "Hanya host ruang yang dapat menghentikan mini-game." });
            return;
          }
          this.room.minigame = null;
          this.broadcastMiniGameState();
          this.emitRoomNotice(`${player.snapshot.name} menghentikan mini-game.`, "info");
        } else if (msg.action === "answer_quiz") {
          const mg = this.room.minigame;
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
          const opt =
            typeof msg.optionIdx === "number" && Number.isFinite(msg.optionIdx)
              ? Math.floor(msg.optionIdx)
              : -1;
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
            this.emitRoomNotice(
              `${player.snapshot.name} benar${isFirst ? " tercepat!" : "!"} (+${pts} pt & +15 XP)`,
              "score",
              "答对了 · Dáduì le",
              { rewardPlayerId: playerId, xpReward: 15 },
            );
          } else {
            this.emitRoomNotice(
              `${player.snapshot.name} kurang tepat. Jawaban akan diumumkan saat reveal.`,
              "info",
            );
          }

          const allAnswered = mg.players.every((p) => q.answeredPlayerIds.includes(p.id));
          if (allAnswered) {
            q.revealActive = true;
            this.room.quizRevealUntil = Date.now() + 2400;
            mg.secondsLeft = 2;
            mg.lastHint = `Semua menjawab! Benar: ${q.options[q.correctIdx]} — ${q.explain}`;
          }
          this.broadcastMiniGameState();
        } else if (msg.action === "catch" || msg.action === "pass_bomb") {
          this.evaluatePlayerInteractions(player, true);
        } else if (msg.action === "collect_orb" || msg.action === "reach_zone") {
          this.evaluatePlayerInteractions(player, false);
        }
        await this.persistRoom();
      }
    } catch {
      // Ignore malformed packets, matching the Node room implementation.
    }
  }

  async webSocketClose(
    ws: WebSocket,
    _code: number,
    _reason: string,
    _wasClean: boolean,
  ): Promise<void> {
    const attachment = this.getAttachment(ws);
    if (!attachment) return;
    const playerId = attachment.playerId;
    if (!this.room.players.has(playerId)) return;

    this.room.players.delete(playerId);
    this.room.lastActivityAt = Date.now();
    if (this.room.hostId === playerId) {
      this.room.hostId = this.room.players.keys().next().value ?? null;
      if (this.room.minigame?.hostId === playerId && this.room.hostId) {
        this.room.minigame.hostId = this.room.hostId;
        this.broadcastMiniGameState();
      }
    }
    this.broadcastRoom({ type: "player:left", id: playerId }, playerId);
    if (
      this.room.minigame &&
      (this.room.minigame.phase === "countdown" || this.room.minigame.phase === "active")
    ) {
      if (!this.room.minigame.soloMode && this.room.minigame.seekerId === playerId) {
        this.finishMiniGame("Pencari keluar dari ruang! Persembunyi Menang!");
      } else {
        this.room.minigame.players = this.room.minigame.players.filter((p) => p.id !== playerId);
        if (this.room.minigame.bombHolderId === playerId && this.room.minigame.players.length > 0) {
          this.room.minigame.bombHolderId = this.room.minigame.players[0].id;
          this.room.bombFuseAt = Date.now() + 18_000;
        }
        if (this.room.minigame.crownHolderId === playerId) {
          this.room.minigame.crownHolderId = null;
        }
        this.broadcastMiniGameState();
      }
    }

    if (this.room.players.size === 0) {
      await this.clearEmptyRoom();
    } else {
      await this.persistRoom();
    }
  }

  async webSocketError(ws: WebSocket, _error: unknown): Promise<void> {
    await this.webSocketClose(ws, 1006, "WebSocket error", false);
  }
}
