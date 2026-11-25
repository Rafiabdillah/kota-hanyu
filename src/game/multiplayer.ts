import { CAMPUS_FACILITIES, CHAPTER_WORLD_COORDS, FLOOR_2_Y, FLOOR_3_Y, WORLD_BOUNDS } from "./worldLayout";

export const DEFAULT_MULTIPLAYER_ROOM = "kampus-utama";

export type AvatarGender = "boy" | "girl";

export function sanitizeAvatarGender(raw?: unknown): AvatarGender {
  return raw === "girl" ? "girl" : "boy";
}

export const PLAYER_JACKET_COLORS = [
  { hex: "#2563eb", label: "Biru Kampus" },
  { hex: "#ec4899", label: "Pink Sakura" },
  { hex: "#8b5cf6", label: "Lavender Imut" },
  { hex: "#059669", label: "Hijau Giok" },
  { hex: "#e11d48", label: "Merah Lampion" },
  { hex: "#0f172a", label: "Hitam Keren" },
  { hex: "#d97706", label: "Emas Mentari" },
  { hex: "#06b6d4", label: "Cyan Neon" },
] as const;

export const QUICK_MANDARIN_EMOTES: {
  text: string;
  pinyin: string;
  meaning: string;
}[] = [
  { text: "你好！", pinyin: "nǐ hǎo!", meaning: "Halo!" },
  { text: "早上好！", pinyin: "zǎoshang hǎo!", meaning: "Selamat pagi!" },
  { text: "加油！", pinyin: "jiāyóu!", meaning: "Semangat!" },
  { text: "认识你很高兴！", pinyin: "rènshi nǐ hěn gāoxìng!", meaning: "Senang bertemu denganmu!" },
  { text: "我们AA制吧！", pinyin: "wǒmen AA zhì ba!", meaning: "Mari patungan!" },
  { text: "谢谢！", pinyin: "xièxie!", meaning: "Terima kasih!" },
];

export type SocialEmoteKind = "wave" | "dance" | "highfive" | "clap" | "firework";

export const SOCIAL_EMOTES: {
  kind: SocialEmoteKind;
  label: string;
  hanzi: string;
  toastText: string;
}[] = [
  { kind: "wave", label: "Sapa", hanzi: "挥手", toastText: "melambai menyapa!" },
  { kind: "dance", label: "Joget", hanzi: "跳舞", toastText: "berjoget ceria!" },
  { kind: "highfive", label: "Tos!", hanzi: "击掌", toastText: "mengajak tos!" },
  { kind: "clap", label: "Tepuk", hanzi: "鼓掌", toastText: "bertepuk tangan!" },
  { kind: "firework", label: "Kembang Api", hanzi: "烟花", toastText: "menyalakan kembang api!" },
];

export interface SharedBallState {
  x: number;
  z: number;
  vx: number;
  vz: number;
  lastKickerName?: string;
  westGoals: number;
  eastGoals: number;
}

export type MiniGameKind =
  | "quiz_battle"
  | "word_hunter"
  | "hide_seek"
  | "tag_bomb"
  | "coin_party"
  | "parkour_race"
  | "orb_rush"
  | "word_dash";
export type MiniGamePhase = "idle" | "countdown" | "active" | "ended";
export type MiniGameRole = "seeker" | "hider" | "runner";

export interface MiniGamePlayerState {
  id: string;
  name: string;
  colorHex: string;
  role: MiniGameRole;
  caught: boolean;
  score: number;
  checkpointIdx?: number;
}

export interface MiniGameOrb {
  id: string;
  x: number;
  y?: number;
  z: number;
  kind?: "orb" | "coin" | "gem" | "crown" | "bomb";
  hanzi: string;
  pinyin: string;
  meaning: string;
  points: number;
}

export interface MiniGameCheckpoint {
  x: number;
  y: number;
  z: number;
  label: string;
}

export interface MiniGameWordPrompt {
  hanzi: string;
  pinyin: string;
  meaning: string;
  zoneName: string;
  targetX: number;
  targetZ: number;
}

export interface QuizBattleQuestion {
  id: string;
  chapterId: string;
  chapterLabel: string;
  category: "kosakata" | "kalimat" | "tata_bahasa" | "mendengar";
  prompt: string;
  hanzi?: string;
  pinyin?: string;
  audioText?: string;
  options: [string, string, string, string];
  correctIdx: number;
  explain: string;
  answeredPlayerIds: string[];
  revealActive?: boolean;
  firstSolverName?: string | null;
}

export interface WordHunterPrompt {
  chapterId: string;
  chapterLabel: string;
  clue: string;
  targetHanzi: string;
  targetPinyin: string;
  targetMeaning: string;
  audioText: string;
}

export interface MiniGameSnapshot {
  matchId: string;
  kind: MiniGameKind;
  phase: MiniGamePhase;
  soloMode: boolean;
  hostId: string;
  chapterFilter?: string;
  seekerId: string | null;
  bombHolderId?: string | null;
  bombFuseLeft?: number;
  crownHolderId?: string | null;
  checkpoints?: MiniGameCheckpoint[];
  quizQuestion?: QuizBattleQuestion | null;
  wordHunterPrompt?: WordHunterPrompt | null;
  totalRounds?: number;
  startedAt: number;
  endsAt: number;
  secondsLeft: number;
  roundNumber: number;
  players: MiniGamePlayerState[];
  orbs: MiniGameOrb[];
  wordPrompt: MiniGameWordPrompt | null;
  lastHint: string | null;
  winnerSummary: string | null;
}

export interface RemotePlayerSnapshot {
  id: string;
  name: string;
  colorHex: string;
  gender?: AvatarGender;
  x: number;
  y: number;
  z: number;
  yaw: number;
  isSprinting: boolean;
  activeChapterId: string;
  xp: number;
  starsTotal: number;
  lastChat?: string;
  lastChatPinyin?: string;
  lastChatAt?: number;
  lastSocial?: SocialEmoteKind;
  lastSocialAt?: number;
}

export interface ChatStudyCard {
  hanzi: string;
  pinyin: string;
  meaning: string;
  chapterLabel: string;
  quizPrompt: string;
  options: [string, string, string];
  correctIdx: number;
}

export interface MultiplayerChatEntry {
  id: string;
  playerId: string;
  playerName: string;
  colorHex: string;
  text: string;
  pinyin?: string;
  emoteOnly?: boolean;
  studyCard?: ChatStudyCard;
  ts: number;
}

export interface MiniGameEventNotice {
  id: string;
  text: string;
  pinyin?: string;
  tone: "info" | "catch" | "score" | "win";
  rewardPlayerId?: string;
  xpReward?: number;
  ts: number;
}

export type MultiplayerServerMessage =
  | {
      type: "world:init";
      selfId: string;
      roomId: string;
      players: RemotePlayerSnapshot[];
      recentChats: MultiplayerChatEntry[];
      minigame?: MiniGameSnapshot | null;
      ball?: SharedBallState;
    }
  | {
      type: "player:joined";
      player: RemotePlayerSnapshot;
    }
  | {
      type: "player:moved";
      id: string;
      x: number;
      y: number;
      z: number;
      yaw: number;
      isSprinting: boolean;
      activeChapterId: string;
      xp: number;
      starsTotal: number;
    }
  | {
      type: "player:profile";
      id: string;
      name: string;
      colorHex: string;
      gender?: AvatarGender;
    }
  | {
      type: "player:chat";
      entry: MultiplayerChatEntry;
    }
  | {
      type: "player:social";
      id: string;
      name: string;
      kind: SocialEmoteKind;
      x: number;
      y: number;
      z: number;
      ts: number;
    }
  | {
      type: "world:ball";
      ball: SharedBallState;
    }
  | {
      type: "player:left";
      id: string;
    }
  | {
      type: "minigame:state";
      minigame: MiniGameSnapshot | null;
    }
  | {
      type: "minigame:event";
      notice: MiniGameEventNotice;
    }
  | {
      type: "world:pong";
      ts: number;
    }
  | {
      type: "world:error";
      message: string;
    };

export type MultiplayerClientMessage =
  | {
      type: "player:update";
      x: number;
      y: number;
      z: number;
      yaw: number;
      isSprinting: boolean;
      activeChapterId: string;
      xp: number;
      starsTotal: number;
    }
  | {
      type: "player:profile";
      name: string;
      colorHex: string;
      gender?: AvatarGender;
    }
  | {
      type: "player:chat";
      text: string;
      pinyin?: string;
      emoteOnly?: boolean;
      studyCard?: ChatStudyCard;
    }
  | {
      type: "player:social";
      kind: SocialEmoteKind;
    }
  | {
      type: "minigame:start";
      kind: MiniGameKind;
      chapterFilter?: string;
    }
  | {
      type: "minigame:action";
      action: "catch" | "pass_bomb" | "collect_orb" | "reach_zone" | "answer_quiz" | "stop";
      targetId?: string;
      optionIdx?: number;
    }
  | {
      type: "world:ping";
    };

export function sanitizePlayerName(raw?: string): string {
  const cleaned = (raw ?? "")
    .replace(/[\u0000-\u001f\u007f<>]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 18);
  return cleaned || "Mahasiswa";
}

export function sanitizeRoomId(raw?: string): string {
  const cleaned = (raw ?? "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-_]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 24);
  return cleaned || DEFAULT_MULTIPLAYER_ROOM;
}

export const VALID_CHAPTER_IDS = ["bab1", "bab2", "bab3", "bab4", "bab5", "bab6", "bab7"] as const;

export function sanitizeChapterId(raw?: string): string {
  const candidate = (raw ?? "").trim().toLowerCase();
  return (VALID_CHAPTER_IDS as readonly string[]).includes(candidate) ? candidate : "bab1";
}

export function sanitizeColorHex(raw?: string): string {
  const candidate = (raw ?? "").trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(candidate)) {
    return candidate;
  }
  return "#059669";
}

export function sanitizeChatText(raw?: string): string {
  return (raw ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 90);
}

export function clampWorldCoords(
  x: unknown,
  y: unknown,
  z: unknown,
  yaw: unknown,
): { x: number; y: number; z: number; yaw: number } {
  const safeNum = (v: unknown, fallback: number) =>
    typeof v === "number" && Number.isFinite(v) ? v : fallback;
  const cx = Math.max(WORLD_BOUNDS.minX, Math.min(WORLD_BOUNDS.maxX, safeNum(x, 0)));
  const cy = Math.max(0, Math.min(12, safeNum(y, 0)));
  const cz = Math.max(WORLD_BOUNDS.minZ, Math.min(WORLD_BOUNDS.maxZ, safeNum(z, 14)));
  let cyaw = safeNum(yaw, Math.PI);
  if (cyaw > Math.PI * 4 || cyaw < -Math.PI * 4) {
    cyaw = Math.PI;
  }
  return { x: cx, y: cy, z: cz, yaw: cyaw };
}

export function shouldEmitMovementDelta(
  prev: {
    x: number;
    y: number;
    z: number;
    yaw: number;
    isSprinting: boolean;
    activeChapterId: string;
  } | null,
  next: {
    x: number;
    y: number;
    z: number;
    yaw: number;
    isSprinting: boolean;
    activeChapterId: string;
  },
  elapsedSinceLastEmitMs: number,
): boolean {
  if (!prev) return true;
  if (elapsedSinceLastEmitMs >= 1800) return true;
  const dist = Math.hypot(next.x - prev.x, next.z - prev.z) + Math.abs(next.y - prev.y);
  const yawDiff = Math.abs(next.yaw - prev.yaw);
  return (
    dist >= 0.04 ||
    yawDiff >= 0.05 ||
    next.isSprinting !== prev.isSprinting ||
    next.activeChapterId !== prev.activeChapterId
  );
}

export function applyMultiplayerServerEvent(
  players: Map<string, RemotePlayerSnapshot>,
  chats: MultiplayerChatEntry[],
  selfId: string | null,
  msg: MultiplayerServerMessage,
): { nextChats: MultiplayerChatEntry[]; nextSelfId: string | null } {
  if (msg.type === "world:init") {
    players.clear();
    for (const p of msg.players) {
      if (p.id !== msg.selfId) {
        players.set(p.id, p);
      }
    }
    const dedupedChats = msg.recentChats.slice(-50);
    return { nextChats: dedupedChats, nextSelfId: msg.selfId };
  }

  if (msg.type === "player:joined") {
    if (msg.player.id !== selfId) {
      players.set(msg.player.id, msg.player);
    }
    return { nextChats: chats, nextSelfId: selfId };
  }

  if (msg.type === "player:moved") {
    if (msg.id === selfId) return { nextChats: chats, nextSelfId: selfId };
    const existing = players.get(msg.id);
    if (existing) {
      existing.x = msg.x;
      existing.y = msg.y;
      existing.z = msg.z;
      existing.yaw = msg.yaw;
      existing.isSprinting = msg.isSprinting;
      existing.activeChapterId = msg.activeChapterId;
      existing.xp = msg.xp;
      existing.starsTotal = msg.starsTotal;
    } else {
      players.set(msg.id, {
        id: msg.id,
        name: "Mahasiswa",
        colorHex: "#059669",
        x: msg.x,
        y: msg.y,
        z: msg.z,
        yaw: msg.yaw,
        isSprinting: msg.isSprinting,
        activeChapterId: msg.activeChapterId,
        xp: msg.xp,
        starsTotal: msg.starsTotal,
      });
    }
    return { nextChats: chats, nextSelfId: selfId };
  }

  if (msg.type === "player:profile") {
    if (msg.id !== selfId) {
      const existing = players.get(msg.id);
      if (existing) {
        existing.name = msg.name;
        existing.colorHex = msg.colorHex;
        if (msg.gender) existing.gender = sanitizeAvatarGender(msg.gender);
      }
    }
    return { nextChats: chats, nextSelfId: selfId };
  }

  if (msg.type === "player:chat") {
    const existing = players.get(msg.entry.playerId);
    if (existing) {
      existing.lastChat = msg.entry.text;
      existing.lastChatPinyin = msg.entry.pinyin;
      existing.lastChatAt = msg.entry.ts;
    }
    if (chats.some((c) => c.id === msg.entry.id)) {
      return { nextChats: chats, nextSelfId: selfId };
    }
    return {
      nextChats: [...chats, msg.entry].slice(-50),
      nextSelfId: selfId,
    };
  }

  if (msg.type === "player:social") {
    const existing = players.get(msg.id);
    if (existing) {
      existing.lastSocial = msg.kind;
      existing.lastSocialAt = msg.ts;
    }
    return { nextChats: chats, nextSelfId: selfId };
  }

  if (msg.type === "player:left") {
    players.delete(msg.id);
    return { nextChats: chats, nextSelfId: selfId };
  }

  return { nextChats: chats, nextSelfId: selfId };
}

// ---------- Server-Authoritative Multiplayer Mini-Game Helpers ----------

export const RACE_ORBS_VOCAB: { hanzi: string; pinyin: string; meaning: string }[] = [
  { hanzi: "好", pinyin: "hǎo", meaning: "Baik / Halo" },
  { hanzi: "学", pinyin: "xué", meaning: "Belajar" },
  { hanzi: "茶", pinyin: "chá", meaning: "Teh" },
  { hanzi: "友", pinyin: "yǒu", meaning: "Teman" },
  { hanzi: "书", pinyin: "shū", meaning: "Buku" },
  { hanzi: "车", pinyin: "chē", meaning: "Kereta / Mobil" },
  { hanzi: "飞", pinyin: "fēi", meaning: "Terbang / Cepat" },
  { hanzi: "星", pinyin: "xīng", meaning: "Bintang" },
  { hanzi: "福", pinyin: "fú", meaning: "Keberuntungan" },
  { hanzi: "梦", pinyin: "mèng", meaning: "Impian" },
];

export const OPEN_WORLD_ORBS_SPAWNS: [number, number][] = [
  [-14, 10],
  [14, 10],
  [-26, -6],
  [26, -6],
  [-38, -20],
  [38, -20],
  [-18, -40],
  [18, -40],
  [0, -48],
  [-24, 24],
  [24, 24],
  [0, 34],
  [-56, 2],
  [56, 2],
];

export const HIDDEN_LANTERN_SPOTS: {
  x: number;
  y?: number;
  z: number;
  hanzi: string;
  pinyin: string;
  meaning: string;
}[] = [
  { x: -46, y: 0, z: -14.2, hanzi: "书", pinyin: "shū", meaning: "Di Perpustakaan Aksara Lt.1!" },
  { x: 46, y: 0, z: -14.2, hanzi: "面", pinyin: "miàn", meaning: "Di Kedai Teh & Mie Bambu!" },
  { x: 28, y: FLOOR_2_Y, z: 30, hanzi: "楼", pinyin: "lóu", meaning: "Di Menara Pandang Lantai 2!" },
  { x: 28, y: FLOOR_3_Y, z: 30, hanzi: "顶", pinyin: "dǐng", meaning: "Di Atap Menara Pandang Lantai 3!" },
  { x: 56, y: FLOOR_2_Y, z: 22, hanzi: "玩", pinyin: "wán", meaning: "Di Gedung Arcade Lantai 2!" },
  { x: -56, y: FLOOR_2_Y, z: 22, hanzi: "宿", pinyin: "sù", meaning: "Di Balkon Asrama Lantai 2!" },
  { x: 56, y: FLOOR_2_Y, z: -42, hanzi: "茶", pinyin: "chá", meaning: "Di Teras Plaza Mall Lantai 2!" },
  { x: 44, y: 0, z: -64, hanzi: "迷", pinyin: "mí", meaning: "Di Tengah Labirin Bambu!" },
  { x: 0, y: 0, z: -66.2, hanzi: "礼", pinyin: "lǐ", meaning: "Di Aula Wisuda Agung!" },
  { x: -28, y: 0, z: 29.5, hanzi: "画", pinyin: "huà", meaning: "Di Galeri Budaya Selatan!" },
];

export const COIN_PARTY_SPAWNS: {
  x: number;
  y: number;
  z: number;
  kind: "coin" | "gem";
  points: number;
  label: string;
}[] = [
  { x: 0, y: 0, z: 8, kind: "coin", points: 10, label: "Kompas Plaza" },
  { x: -16, y: 0, z: 16, kind: "coin", points: 10, label: "Boulevard Barat" },
  { x: 16, y: 0, z: 16, kind: "coin", points: 10, label: "Boulevard Timur" },
  { x: 0, y: 0, z: 46, kind: "gem", points: 25, label: "Tengah Lapangan Bola" },
  { x: 28, y: FLOOR_2_Y, z: 30, kind: "gem", points: 25, label: "Menara Pandang Lt.2" },
  { x: 28, y: FLOOR_3_Y, z: 30, kind: "gem", points: 25, label: "Atap Menara Lt.3" },
  { x: 56, y: FLOOR_2_Y, z: 22, kind: "gem", points: 25, label: "Arcade Lt.2" },
  { x: -56, y: FLOOR_2_Y, z: 22, kind: "coin", points: 10, label: "Asrama Lt.2" },
  { x: 56, y: FLOOR_2_Y, z: -42, kind: "gem", points: 25, label: "Plaza Mall Lt.2" },
  { x: -56, y: FLOOR_2_Y, z: -42, kind: "coin", points: 10, label: "Bioskop Lt.2" },
  { x: 44, y: 0, z: -64, kind: "gem", points: 25, label: "Labirin Bambu" },
  { x: -44, y: FLOOR_2_Y, z: -64, kind: "gem", points: 25, label: "Puncak Parkour" },
  { x: -46, y: FLOOR_2_Y, z: -14, kind: "coin", points: 10, label: "Perpustakaan Lt.2" },
  { x: 0, y: 0, z: -40, kind: "coin", points: 10, label: "Taman Utara" },
];

export const PARKOUR_CHECKPOINTS: MiniGameCheckpoint[] = [
  { x: 0, y: 0, z: 32, label: "Pos 1: Trampolin Taman Selatan" },
  { x: 28, y: FLOOR_2_Y, z: 30, label: "Pos 2: Menara Pandang Lantai 2" },
  { x: 28, y: FLOOR_3_Y, z: 30, label: "Pos 3: Atap Menara Lantai 3" },
  { x: 56, y: FLOOR_2_Y, z: 22, label: "Pos 4: Gedung Arcade Lantai 2" },
  { x: 44, y: 0, z: -64, label: "Pos 5: Tengah Labirin Bambu" },
  { x: -44, y: FLOOR_2_Y, z: -64, label: "Finish: Puncak Arena Parkour!" },
];

export const WORD_DASH_DESTINATIONS: MiniGameWordPrompt[] = [
  {
    hanzi: "汉字图书馆",
    pinyin: "Hànzì Túshūguǎn",
    meaning: "Perpustakaan Aksara (Barat)",
    zoneName: "Perpustakaan Aksara",
    targetX: CAMPUS_FACILITIES[0].x,
    targetZ: CAMPUS_FACILITIES[0].z,
  },
  {
    hanzi: "竹林面馆",
    pinyin: "Zhúlín Miànguǎn",
    meaning: "Kedai Teh & Mie Bambu (Timur)",
    zoneName: "Kedai Mie Bambu",
    targetX: CAMPUS_FACILITIES[1].x,
    targetZ: CAMPUS_FACILITIES[1].z,
  },
  {
    hanzi: "毕业大礼堂",
    pinyin: "Bìyè Dàlǐtáng",
    meaning: "Aula Wisuda Agung (Utara)",
    zoneName: "Aula Wisuda",
    targetX: CAMPUS_FACILITIES[2].x,
    targetZ: CAMPUS_FACILITIES[2].z,
  },
  {
    hanzi: "游乐场中心",
    pinyin: "Yóulèchǎng Zhōngxīn",
    meaning: "Gedung Arcade & Party (Tenggara)",
    zoneName: "Gedung Arcade",
    targetX: CAMPUS_FACILITIES[5].x,
    targetZ: CAMPUS_FACILITIES[5].z,
  },
  {
    hanzi: "美食广场",
    pinyin: "Měishí Guǎngchǎng",
    meaning: "Plaza Mall & Food Court (Timur Laut)",
    zoneName: "Plaza Mall",
    targetX: CAMPUS_FACILITIES[7].x,
    targetZ: CAMPUS_FACILITIES[7].z,
  },
  {
    hanzi: "校园电影院",
    pinyin: "Xiàoyuán Diànyǐngyuàn",
    meaning: "Bioskop & Panggung Musik (Barat Laut)",
    zoneName: "Bioskop Kampus",
    targetX: CAMPUS_FACILITIES[8].x,
    targetZ: CAMPUS_FACILITIES[8].z,
  },
  {
    hanzi: "医院",
    pinyin: "Yīyuàn",
    meaning: "Klinik Sehat Bab 5",
    zoneName: "Klinik Sehat",
    targetX: CHAPTER_WORLD_COORDS.bab5[0],
    targetZ: CHAPTER_WORLD_COORDS.bab5[2],
  },
  {
    hanzi: "地铁站",
    pinyin: "Dìtiězhàn",
    meaning: "Stasiun MRT Kota Bab 4",
    zoneName: "Stasiun MRT",
    targetX: CHAPTER_WORLD_COORDS.bab4[0],
    targetZ: CHAPTER_WORLD_COORDS.bab4[2],
  },
  {
    hanzi: "南湖观景塔",
    pinyin: "Nánhú Guānjǐngtǎ",
    meaning: "Menara Pandang Selatan",
    zoneName: "Menara Pandang",
    targetX: CAMPUS_FACILITIES[4].x,
    targetZ: CAMPUS_FACILITIES[4].z,
  },
];

export function computeDistanceXZ(ax: number, az: number, bx: number, bz: number): number {
  return Math.hypot(ax - bx, az - bz);
}

export function isWithinVerticalReach(ay: number, by: number, maxDiff = 2.35): boolean {
  return Math.abs(ay - by) <= maxDiff;
}

export function selectNextSeekerId(playerIds: string[], previousSeekerId: string | null): string | null {
  if (playerIds.length === 0) return null;
  if (playerIds.length === 1) return playerIds[0];
  const sorted = [...playerIds].sort();
  if (!previousSeekerId) return sorted[0];
  const idx = sorted.indexOf(previousSeekerId);
  if (idx === -1) return sorted[0];
  return sorted[(idx + 1) % sorted.length];
}

export function generateRaceOrbs(count: number, roundSeed: number): MiniGameOrb[] {
  const result: MiniGameOrb[] = [];
  const totalSpots = OPEN_WORLD_ORBS_SPAWNS.length;
  for (let i = 0; i < count; i += 1) {
    const spotIdx = (i + roundSeed * 3) % totalSpots;
    const vocab = RACE_ORBS_VOCAB[(i + roundSeed) % RACE_ORBS_VOCAB.length];
    const [sx, sz] = OPEN_WORLD_ORBS_SPAWNS[spotIdx];
    result.push({
      id: `mg_orb_${roundSeed}_${i}`,
      x: sx,
      y: 0,
      z: sz,
      kind: "orb",
      hanzi: vocab.hanzi,
      pinyin: vocab.pinyin,
      meaning: vocab.meaning,
      points: 10,
    });
  }
  return result;
}

export function generateHiddenLanternOrbs(count = 4, roundSeed = 1): MiniGameOrb[] {
  const chosen: MiniGameOrb[] = [];
  const total = HIDDEN_LANTERN_SPOTS.length;
  for (let i = 0; i < count; i += 1) {
    const spot = HIDDEN_LANTERN_SPOTS[(i * 2 + roundSeed) % total];
    chosen.push({
      id: `lantern_${roundSeed}_${i}`,
      x: spot.x,
      y: spot.y ?? 0,
      z: spot.z,
      kind: "orb",
      hanzi: spot.hanzi,
      pinyin: spot.pinyin,
      meaning: spot.meaning,
      points: 15,
    });
  }
  return chosen;
}

export function generateCoinPartyItems(roundSeed: number, includeCrown = true): MiniGameOrb[] {
  const items: MiniGameOrb[] = [];
  const count = 9;
  for (let i = 0; i < count; i += 1) {
    const spot = COIN_PARTY_SPAWNS[(i * 2 + roundSeed) % COIN_PARTY_SPAWNS.length];
    items.push({
      id: `coin_${roundSeed}_${i}`,
      x: spot.x,
      y: spot.y,
      z: spot.z,
      kind: spot.kind,
      hanzi: spot.kind === "gem" ? "💎" : "★",
      pinyin: spot.label,
      meaning: spot.kind === "gem" ? `Permata (+${spot.points} pt)` : `Koin (+${spot.points} pt)`,
      points: spot.points,
    });
  }
  if (includeCrown) {
    items.push({
      id: `crown_${roundSeed}`,
      x: 0,
      y: 0,
      z: 18,
      kind: "crown",
      hanzi: "👑",
      pinyin: "Mahkota Raja",
      meaning: "+50 pt & +3 pt/detik!",
      points: 50,
    });
  }
  return items;
}

export function generateDefuseBombs(count = 3, roundSeed = 1): MiniGameOrb[] {
  const bombs: MiniGameOrb[] = [];
  for (let i = 0; i < count; i += 1) {
    const spot = COIN_PARTY_SPAWNS[(i * 3 + roundSeed) % COIN_PARTY_SPAWNS.length];
    bombs.push({
      id: `bomb_${roundSeed}_${i}`,
      x: spot.x,
      y: spot.y,
      z: spot.z,
      kind: "bomb",
      hanzi: "💣",
      pinyin: spot.label,
      meaning: "Jinakkan Bom Waktu!",
      points: 20,
    });
  }
  return bombs;
}

export function pickWordDashPrompt(prevZoneName?: string, seed = 0): MiniGameWordPrompt {
  const candidates = WORD_DASH_DESTINATIONS.filter((d) => d.zoneName !== prevZoneName);
  const list = candidates.length > 0 ? candidates : WORD_DASH_DESTINATIONS;
  return list[Math.abs(seed) % list.length];
}

export function buildHideSeekDirectionHint(
  seeker: { x: number; y?: number; z: number },
  hiders: { name: string; x: number; y?: number; z: number }[],
): string | null {
  if (hiders.length === 0) return null;
  let closest = hiders[0];
  let bestDist = computeDistanceXZ(seeker.x, seeker.z, closest.x, closest.z);
  for (let i = 1; i < hiders.length; i += 1) {
    const d = computeDistanceXZ(seeker.x, seeker.z, hiders[i].x, hiders[i].z);
    if (d < bestDist) {
      bestDist = d;
      closest = hiders[i];
    }
  }
  const dx = closest.x - seeker.x;
  const dz = closest.z - seeker.z;
  const ns = Math.abs(dz) > 6 ? (dz < 0 ? "Utara" : "Selatan") : "";
  const ew = Math.abs(dx) > 6 ? (dx > 0 ? "Timur" : "Barat") : "";
  const dir = [ns, ew].filter(Boolean).join(" ") || "Sekitarmu";
  const meter = Math.max(2, Math.round(bestDist));
  const dy = (closest.y ?? 0) - (seeker.y ?? 0);
  const verticalCue =
    dy > 2.2 ? " (di lantai atas!)" : dy < -2.2 ? " (di lantai bawah!)" : "";
  return `提示 Petunjuk: Persembunyi terdekat ~${meter}m ke arah ${dir}${verticalCue}`;
}

// ---------- Online Mandarin Learning Systems (Cerdas Cermat, Berburu Terjemahan, Kartu Belajar) ----------

export interface QuizBattleBankItem {
  id: string;
  chapterId: string;
  chapterLabel: string;
  category: "kosakata" | "kalimat" | "tata_bahasa" | "mendengar";
  prompt: string;
  hanzi?: string;
  pinyin?: string;
  audioText?: string;
  options: [string, string, string, string];
  correctIdx: number;
  explain: string;
}

export const QUIZ_BATTLE_BANK: QuizBattleBankItem[] = [
  // Bab 1
  {
    id: "qb_1_1",
    chapterId: "bab1",
    chapterLabel: "Bab 1",
    category: "kosakata",
    prompt: "Bagaimana cara menyapa dosen atau orang yang lebih tua dengan sopan?",
    hanzi: "老师，___！",
    audioText: "老师，您好！",
    options: ["你好 (nǐ hǎo)", "您好 (nín hǎo)", "没关系 (méi guānxi)", "不客气 (bú kèqi)"],
    correctIdx: 1,
    explain: "您好 (nín hǎo) memakai kata hormat 您 untuk dosen atau orang yang dihormati.",
  },
  {
    id: "qb_1_2",
    chapterId: "bab1",
    chapterLabel: "Bab 1",
    category: "tata_bahasa",
    prompt: "Pada kata '不客气', kata 不 dibaca dengan nada ke berapa?",
    hanzi: "不客气",
    pinyin: "bú kèqi",
    audioText: "不客气",
    options: [
      "Nada ke-2 (bú) karena diikuti nada ke-4",
      "Tetap nada ke-4 (bù)",
      "Nada ke-1 (bū)",
      "Nada ke-3 (bǔ)",
    ],
    correctIdx: 0,
    explain: "Aturan sandhi 不: sebelum nada ke-4 (客 kè), 不 (bù) naik menjadi nada ke-2 (bú).",
  },
  {
    id: "qb_1_3",
    chapterId: "bab1",
    chapterLabel: "Bab 1",
    category: "mendengar",
    prompt: "Dengarkan ucapan sapaan berikut — apa artinya?",
    hanzi: "认识你很高兴！",
    audioText: "认识你很高兴！",
    options: [
      "Permisi, marga Anda siapa?",
      "Maaf, tidak apa-apa",
      "Senang berkenalan denganmu!",
      "Sampai jumpa besok pagi!",
    ],
    correctIdx: 2,
    explain: "认识你很高兴 (rènshi nǐ hěn gāoxìng) berarti 'Senang berkenalan denganmu'.",
  },
  // Bab 2
  {
    id: "qb_2_1",
    chapterId: "bab2",
    chapterLabel: "Bab 2",
    category: "tata_bahasa",
    prompt: "Pilih kata satuan yang tepat untuk 'dua buah buku': 两___书",
    hanzi: "两___书",
    audioText: "两本书",
    options: ["口 (kǒu)", "本 (běn)", "位 (wèi)", "张 (zhāng)"],
    correctIdx: 1,
    explain: "本 (běn) adalah kata satuan khusus benda berjilid seperti buku dan kamus (两本书).",
  },
  {
    id: "qb_2_2",
    chapterId: "bab2",
    chapterLabel: "Bab 2",
    category: "tata_bahasa",
    prompt: "Bagaimana cara menyangkal kepemilikan 'tidak punya kamus Mandarin'?",
    hanzi: "我___汉语词典。",
    audioText: "我没有汉语词典。",
    options: ["不有 (bù yǒu)", "没有 (méiyǒu)", "不是 (bú shì)", "几有 (jǐ yǒu)"],
    correctIdx: 1,
    explain: "Kata kerja 有 (memiliki/ada) wajib dinegasikan dengan 没 menjadi 没有 (bukan 不有).",
  },
  {
    id: "qb_2_3",
    chapterId: "bab2",
    chapterLabel: "Bab 2",
    category: "kosakata",
    prompt: "Jika bertanya jumlah anggota keluarga (< 10 orang), ungkapan yang baku adalah...",
    hanzi: "你家有___口人？",
    audioText: "你家有几口人？",
    options: ["几 (jǐ)", "多少 (duōshao)", "什么 (shénme)", "谁 (shéi)"],
    correctIdx: 0,
    explain: "几 (jǐ) dipakai untuk menanyakan jumlah kecil (< 10) dan diikuti kata satuan 口.",
  },
  // Bab 3
  {
    id: "qb_3_1",
    chapterId: "bab3",
    chapterLabel: "Bab 3",
    category: "kalimat",
    prompt: "Apa arti kalimat '差一刻八点' pada jadwal kelas?",
    hanzi: "差一刻八点",
    audioText: "差一刻八点",
    options: ["Jam 08:15", "Jam 07:45 (8 kurang seperempat)", "Jam 08:30", "Jam 07:15"],
    correctIdx: 1,
    explain: "差 (kurang) + 一刻 (15 menit) + 八点 (jam 8) = jam 07:45.",
  },
  {
    id: "qb_3_2",
    chapterId: "bab3",
    chapterLabel: "Bab 3",
    category: "kosakata",
    prompt: "Saat belanja buah di kantin, '多少钱一斤？' menanyakan...",
    hanzi: "多少钱一斤？",
    audioText: "多少钱一斤？",
    options: [
      "Totalnya berapa botol?",
      "Jam berapa toko buka?",
      "Berapa harganya per setengah kilo (500g)?",
      "Tanggal berapa hari ini?",
    ],
    correctIdx: 2,
    explain: "多少钱 menanyakan harga, dan 1 斤 (jīn) di Tiongkok setara 500 gram.",
  },
  {
    id: "qb_3_3",
    chapterId: "bab3",
    chapterLabel: "Bab 3",
    category: "tata_bahasa",
    prompt: "Urutan penulisan tanggal yang benar dalam bahasa Mandarin adalah...",
    hanzi: "今天是十月五号。",
    audioText: "今天是十月五号。",
    options: [
      "Tanggal → Bulan → Tahun",
      "Tahun → Bulan → Tanggal",
      "Hari → Tahun → Bulan",
      "Bulan → Tahun → Tanggal",
    ],
    correctIdx: 1,
    explain: "Bahasa Mandarin selalu mengurutkan waktu dari unit terbesar ke terkecil (Tahun-Bulan-Tanggal).",
  },
  // Bab 4
  {
    id: "qb_4_1",
    chapterId: "bab4",
    chapterLabel: "Bab 4",
    category: "tata_bahasa",
    prompt: "Lengkapi pertanyaan pilihan: '坐地铁快，___坐公共汽车快？'",
    hanzi: "坐地铁快，___坐公共汽车快？",
    audioText: "坐地铁快，还是坐公共汽车快？",
    options: ["或者 (huòzhě)", "还是 (háishì)", "一边 (yìbiān)", "一直 (yìzhí)"],
    correctIdx: 1,
    explain: "还是 (háishì) digunakan untuk kata 'atau' di dalam kalimat tanya pilihan.",
  },
  {
    id: "qb_4_2",
    chapterId: "bab4",
    chapterLabel: "Bab 4",
    category: "mendengar",
    prompt: "Dengarkan petunjuk arah ini — di manakah bank berada?",
    hanzi: "一直往前走，银行在图书馆对面。",
    audioText: "一直往前走，银行在图书馆对面。",
    options: [
      "Di seberang perpustakaan",
      "Di belakang perpustakaan",
      "Di lantai 3 perpustakaan",
      "Di samping stasiun MRT",
    ],
    correctIdx: 0,
    explain: "对面 (duìmiàn) berarti 'di seberang', dan 一直往前走 berarti 'jalan lurus ke depan'.",
  },
  {
    id: "qb_4_3",
    chapterId: "bab4",
    chapterLabel: "Bab 4",
    category: "kosakata",
    prompt: "Apa arti frasa '从宿舍到教室'?",
    hanzi: "从宿舍到教室",
    audioText: "从宿舍到教室",
    options: [
      "Dari kantin sampai taman",
      "Dari asrama sampai ruang kelas",
      "Di sebelah stasiun kereta",
      "Bersepeda lebih ramah lingkungan",
    ],
    correctIdx: 1,
    explain: "从...到... berarti 'dari... sampai...'; 宿舍 (sùshè) = asrama, 教室 (jiàoshì) = ruang kelas.",
  },
  // Bab 5
  {
    id: "qb_5_1",
    chapterId: "bab5",
    chapterLabel: "Bab 5",
    category: "tata_bahasa",
    prompt: "Bentuk negatif yang benar dari '他感冒了' (Dia masuk angin) adalah...",
    hanzi: "他___感冒。",
    audioText: "他没感冒。",
    options: ["没...了", "没 (tanpa 了)", "不...了", "别...了"],
    correctIdx: 1,
    explain: "Saat menyangkal kejadian lampau dengan 没(有), partikel 了 di akhir kalimat harus dibuang!",
  },
  {
    id: "qb_5_2",
    chapterId: "bab5",
    chapterLabel: "Bab 5",
    category: "kalimat",
    prompt: "Apa maksud pola kalimat '他一到冬天就感冒'?",
    hanzi: "他一到冬天就感冒",
    audioText: "他一到冬天就感冒",
    options: [
      "Dia agak sakit kepala hari ini",
      "Begitu masuk musim dingin dia langsung flu",
      "Dia belum minum obat sejak kemarin",
      "Sambil minum teh sambil memakai jaket",
    ],
    correctIdx: 1,
    explain: "Pola 一……就…… berarti 'begitu ... langsung ...', menunjukkan kejadian beruntun atau kondisi langsung.",
  },
  {
    id: "qb_5_3",
    chapterId: "bab5",
    chapterLabel: "Bab 5",
    category: "kosakata",
    prompt: "Dokter di Klinik menyarankan: '多穿点儿衣服！' Maksudnya adalah...",
    hanzi: "多穿点儿衣服！",
    audioText: "多穿点儿衣服！",
    options: [
      "Pakailah baju yang lebih tebal/banyak!",
      "Minumlah air hangat yang banyak!",
      "Berbaringlah dan tarik napas!",
      "Jangan makan makanan pedas!",
    ],
    correctIdx: 0,
    explain: "多穿点儿衣服 (duō chuān diǎnr yīfu) = pakailah baju lebih tebal/hangat saat cuaca dingin.",
  },
  // Bab 6
  {
    id: "qb_6_1",
    chapterId: "bab6",
    chapterLabel: "Bab 6",
    category: "tata_bahasa",
    prompt: "Manakah kalimat struktur 把 yang paling tepat untuk 'Menempelkan foto di dinding'?",
    hanzi: "___贴在墙上。",
    audioText: "把照片贴在墙上。",
    options: [
      "把照片贴在墙上",
      "贴照片把在墙上",
      "在墙上照片把贴",
      "照片把贴在墙上",
    ],
    correctIdx: 0,
    explain: "Rumus kalimat 把: Subjek + 把 + Objek (照片) + Kata Kerja (贴) + Posisi/Hasil (在墙上).",
  },
  {
    id: "qb_6_2",
    chapterId: "bab6",
    chapterLabel: "Bab 6",
    category: "kalimat",
    prompt: "Apa arti ungkapan '一边听音乐一边做作业'?",
    hanzi: "一边听音乐一边做作业",
    audioText: "一边听音乐一边做作业",
    options: [
      "Pertama dengar musik lalu tidur",
      "Sambil mendengarkan musik sambil mengerjakan PR",
      "Musik terdengar semakin jelas",
      "Berhasil menemukan headset di kelas",
    ],
    correctIdx: 1,
    explain: "Pola 一边……一边…… dipakai untuk dua aktivitas yang dilakukan bersamaan ('sambil... sambil...').",
  },
  {
    id: "qb_6_3",
    chapterId: "bab6",
    chapterLabel: "Bab 6",
    category: "kosakata",
    prompt: "Jika sepedamu selesai diperbaiki mekanik, dalam Mandarin disebut...",
    hanzi: "自行车___！",
    audioText: "自行车修好了！",
    options: ["听清楚了", "修好了", "找到了", "贴好了"],
    correctIdx: 1,
    explain: "修 (xiū, memperbaiki) + 好 (hǎo, selesai dengan baik) + 了 = 修好了 (selesai diperbaiki).",
  },
  // Bab 7
  {
    id: "qb_7_1",
    chapterId: "bab7",
    chapterLabel: "Bab 7",
    category: "kosakata",
    prompt: "Saat kartu bank hilang, langkah pertama di bank adalah '先去挂失'. Apa arti 挂失?",
    hanzi: "银行卡丢了，先去挂失。",
    audioText: "银行卡丢了，先去挂失。",
    options: [
      "Pesan makan antar (外卖)",
      "Bayar patungan (AA制)",
      "Lapor kehilangan / blokir kartu",
      "Menukar buku kamus baru",
    ],
    correctIdx: 2,
    explain: "挂失 (guàshī) berarti melaporkan kehilangan kartu/dokumen resmi agar diblokir dengan aman.",
  },
  {
    id: "qb_7_2",
    chapterId: "bab7",
    chapterLabel: "Bab 7",
    category: "kalimat",
    prompt: "Teman mengajak makan siang dan berkata: '今天我们AA制吧！' Artinya...",
    hanzi: "今天我们AA制吧！",
    audioText: "今天我们AA制吧！",
    options: [
      "Hari ini aku yang traktir semua!",
      "Hari ini kita bayar patungan masing-masing ya!",
      "Hari ini kita makan masakan Barat!",
      "Ayo kita pesan antar ke asrama!",
    ],
    correctIdx: 1,
    explain: "AA制 (AA zhì) adalah ungkapan populer di kampus Tiongkok untuk membayar tagihan masing-masing.",
  },
  {
    id: "qb_7_3",
    chapterId: "bab7",
    chapterLabel: "Bab 7",
    category: "tata_bahasa",
    prompt: "Untuk menyatakan 'pernah belajar di Tiongkok', partikel yang ditambahkan setelah 留学 adalah...",
    hanzi: "我去中国留学___。",
    audioText: "我去中国留学过。",
    options: ["了 (le)", "过 (guo)", "呢 (ne)", "吗 (ma)"],
    correctIdx: 1,
    explain: "Partikel 过 (guo) tepat di belakang kata kerja menyatakan pengalaman yang pernah dilakukan.",
  },
];

export interface WordHunterClueItem {
  id: string;
  chapterId: string;
  chapterLabel: string;
  clue: string;
  targetHanzi: string;
  targetPinyin: string;
  targetMeaning: string;
  audioText: string;
  distractors: [
    { hanzi: string; pinyin: string; meaning: string },
    { hanzi: string; pinyin: string; meaning: string },
    { hanzi: string; pinyin: string; meaning: string },
  ];
}

export const WORD_HUNTER_CLUES: WordHunterClueItem[] = [
  {
    id: "wh_1",
    chapterId: "bab1",
    chapterLabel: "Bab 1",
    clue: "Cari Hanzi yang berarti 'Terima kasih'!",
    targetHanzi: "谢谢",
    targetPinyin: "xièxie",
    targetMeaning: "Terima kasih",
    audioText: "谢谢",
    distractors: [
      { hanzi: "对不起", pinyin: "duìbuqǐ", meaning: "Maaf" },
      { hanzi: "你好", pinyin: "nǐ hǎo", meaning: "Halo" },
      { hanzi: "再见", pinyin: "zàijiàn", meaning: "Sampai jumpa" },
    ],
  },
  {
    id: "wh_2",
    chapterId: "bab1",
    chapterLabel: "Bab 1",
    clue: "Seseorang minta maaf ke kamu — cari balasan 'Tidak apa-apa'!",
    targetHanzi: "没关系",
    targetPinyin: "méi guānxi",
    targetMeaning: "Tidak apa-apa",
    audioText: "没关系",
    distractors: [
      { hanzi: "早上好", pinyin: "zǎoshang hǎo", meaning: "Selamat pagi" },
      { hanzi: "贵姓", pinyin: "guìxìng", meaning: "Marga terhormat" },
      { hanzi: "谢谢", pinyin: "xièxie", meaning: "Terima kasih" },
    ],
  },
  {
    id: "wh_3",
    chapterId: "bab2",
    chapterLabel: "Bab 2",
    clue: "Kamu butuh buku referensi arti kata — cari Hanzi untuk 'Kamus'!",
    targetHanzi: "词典",
    targetPinyin: "cídiǎn",
    targetMeaning: "Kamus",
    audioText: "词典",
    distractors: [
      { hanzi: "同学", pinyin: "tóngxué", meaning: "Teman sekelas" },
      { hanzi: "老师", pinyin: "lǎoshī", meaning: "Guru / Dosen" },
      { hanzi: "苹果", pinyin: "píngguǒ", meaning: "Apel" },
    ],
  },
  {
    id: "wh_4",
    chapterId: "bab3",
    chapterLabel: "Bab 3",
    clue: "Di toko buah, kamu ingin menanyakan 'Berapa harganya?'",
    targetHanzi: "多少钱",
    targetPinyin: "duōshao qián",
    targetMeaning: "Berapa harganya?",
    audioText: "多少钱",
    distractors: [
      { hanzi: "星期", pinyin: "xīngqī", meaning: "Hari / Pekan" },
      { hanzi: "睡觉", pinyin: "shuìjiào", meaning: "Tidur" },
      { hanzi: "一斤", pinyin: "yì jīn", meaning: "Setengah kilo" },
    ],
  },
  {
    id: "wh_5",
    chapterId: "bab4",
    chapterLabel: "Bab 4",
    clue: "Cari kata penunjuk arah yang berarti 'Di seberang'!",
    targetHanzi: "对面",
    targetPinyin: "duìmiàn",
    targetMeaning: "Di seberang",
    audioText: "对面",
    distractors: [
      { hanzi: "旁边", pinyin: "pángbiān", meaning: "Di samping" },
      { hanzi: "地铁", pinyin: "dìtiě", meaning: "Kereta bawah tanah (MRT)" },
      { hanzi: "环保", pinyin: "huánbǎo", meaning: "Ramah lingkungan" },
    ],
  },
  {
    id: "wh_6",
    chapterId: "bab4",
    chapterLabel: "Bab 4",
    clue: "Kamu mau naik kereta cepat bawah tanah — cari Hanzi 'MRT / Subway'!",
    targetHanzi: "地铁",
    targetPinyin: "dìtiě",
    targetMeaning: "MRT / Kereta bawah tanah",
    audioText: "地铁",
    distractors: [
      { hanzi: "医院", pinyin: "yīyuàn", meaning: "Rumah sakit / Klinik" },
      { hanzi: "银行", pinyin: "yínháng", meaning: "Bank" },
      { hanzi: "宿舍", pinyin: "sùshè", meaning: "Asrama" },
    ],
  },
  {
    id: "wh_7",
    chapterId: "bab5",
    chapterLabel: "Bab 5",
    clue: "Cuaca dingin membuat temanmu demam! Cari Hanzi 'Demam'!",
    targetHanzi: "发烧",
    targetPinyin: "fāshāo",
    targetMeaning: "Demam",
    audioText: "发烧",
    distractors: [
      { hanzi: "头疼", pinyin: "tóuténg", meaning: "Sakit kepala" },
      { hanzi: "多穿", pinyin: "duō chuān", meaning: "Pakai baju hangat" },
      { hanzi: "呼吸", pinyin: "hūxī", meaning: "Bernapas" },
    ],
  },
  {
    id: "wh_8",
    chapterId: "bab6",
    chapterLabel: "Bab 6",
    clue: "Sepedamu sudah selesai diperbaiki — cari pelengkap hasil 'Selesai diperbaiki'!",
    targetHanzi: "修好了",
    targetPinyin: "xiū hǎo le",
    targetMeaning: "Selesai diperbaiki",
    audioText: "修好了",
    distractors: [
      { hanzi: "找到了", pinyin: "zhǎodào le", meaning: "Berhasil ditemukan" },
      { hanzi: "听清楚", pinyin: "tīng qīngchu", meaning: "Terdengar jelas" },
      { hanzi: "一边", pinyin: "yìbiān", meaning: "Sambil" },
    ],
  },
  {
    id: "wh_9",
    chapterId: "bab7",
    chapterLabel: "Bab 7",
    clue: "Kartu bankmu hilang! Cari Hanzi untuk 'Lapor kehilangan kartu'!",
    targetHanzi: "挂失",
    targetPinyin: "guàshī",
    targetMeaning: "Lapor kehilangan / blokir kartu",
    audioText: "挂失",
    distractors: [
      { hanzi: "护照", pinyin: "hùzhào", meaning: "Paspor" },
      { hanzi: "密码", pinyin: "mìmǎ", meaning: "Kata sandi" },
      { hanzi: "外卖", pinyin: "wàimài", meaning: "Pesan antar makanan" },
    ],
  },
  {
    id: "wh_10",
    chapterId: "bab7",
    chapterLabel: "Bab 7",
    clue: "Kamu dan teman mau bayar patungan makan — cari Hanzi 'Bayar patungan'!",
    targetHanzi: "AA制",
    targetPinyin: "AA zhì",
    targetMeaning: "Bayar patungan masing-masing",
    audioText: "AA制",
    distractors: [
      { hanzi: "中餐", pinyin: "zhōngcān", meaning: "Masakan Tiongkok" },
      { hanzi: "西餐", pinyin: "xīcān", meaning: "Masakan Barat" },
      { hanzi: "填表", pinyin: "tián biǎo", meaning: "Mengisi formulir" },
    ],
  },
];

export const WORD_HUNTER_ARENA_SPOTS: [number, number][] = [
  [-5.5, 9.5],
  [5.5, 9.5],
  [-4.8, 3.5],
  [4.8, 3.5],
  [-7.5, -2.5],
  [7.5, -2.5],
];

export function computeQuizRoundPoints(isCorrect: boolean, isFirstCorrect: boolean): number {
  if (!isCorrect) return 0;
  return isFirstCorrect ? 30 : 20;
}

export function pickQuizBattleQuestion(
  chapterFilter = "all",
  usedIds: string[] = [],
  seed = 0,
): QuizBattleQuestion {
  const normalizedFilter = chapterFilter === "all" ? "all" : sanitizeChapterId(chapterFilter);
  const byChapter =
    normalizedFilter === "all"
      ? QUIZ_BATTLE_BANK
      : QUIZ_BATTLE_BANK.filter((q) => q.chapterId === normalizedFilter);
  const pool = byChapter.length > 0 ? byChapter : QUIZ_BATTLE_BANK;
  const fresh = pool.filter((q) => !usedIds.includes(q.id));
  const candidates = fresh.length > 0 ? fresh : pool;
  const picked = candidates[Math.abs(seed) % candidates.length];
  return {
    ...picked,
    options: [...picked.options] as [string, string, string, string],
    answeredPlayerIds: [],
    revealActive: false,
    firstSolverName: null,
  };
}

export function generateWordHunterWave(
  roundSeed = 1,
  chapterFilter = "all",
  usedClueIds: string[] = [],
): { prompt: WordHunterPrompt; orbs: MiniGameOrb[]; clueId: string } {
  const normalizedFilter = chapterFilter === "all" ? "all" : sanitizeChapterId(chapterFilter);
  const byChapter =
    normalizedFilter === "all"
      ? WORD_HUNTER_CLUES
      : WORD_HUNTER_CLUES.filter((c) => c.chapterId === normalizedFilter);
  const pool = byChapter.length > 0 ? byChapter : WORD_HUNTER_CLUES;
  const fresh = pool.filter((c) => !usedClueIds.includes(c.id));
  const candidates = fresh.length > 0 ? fresh : pool;
  const clueItem = candidates[Math.abs(roundSeed) % candidates.length];

  const entries: {
    hanzi: string;
    pinyin: string;
    meaning: string;
    points: number;
  }[] = [
    {
      hanzi: clueItem.targetHanzi,
      pinyin: clueItem.targetPinyin,
      meaning: clueItem.targetMeaning,
      points: 30,
    },
    ...clueItem.distractors.map((d) => ({
      hanzi: d.hanzi,
      pinyin: d.pinyin,
      meaning: d.meaning,
      points: -5,
    })),
  ];

  // Deterministic permutation of both spots and options per roundSeed
  const spotsCount = WORD_HUNTER_ARENA_SPOTS.length;
  const startSpot = Math.abs(roundSeed * 2) % spotsCount;
  const optionShift = Math.abs(roundSeed) % entries.length;
  const rotatedEntries = entries.map((_, i) => entries[(i + optionShift) % entries.length]);

  const orbs: MiniGameOrb[] = rotatedEntries.map((item, i) => {
    const [sx, sz] = WORD_HUNTER_ARENA_SPOTS[(startSpot + i) % spotsCount];
    return {
      id: `wh_orb_${roundSeed}_${i}`,
      x: sx,
      y: 0,
      z: sz,
      kind: "orb",
      hanzi: item.hanzi,
      pinyin: item.pinyin,
      meaning: item.meaning,
      points: item.points,
    };
  });

  return {
    clueId: clueItem.id,
    prompt: {
      chapterId: clueItem.chapterId,
      chapterLabel: clueItem.chapterLabel,
      clue: clueItem.clue,
      targetHanzi: clueItem.targetHanzi,
      targetPinyin: clueItem.targetPinyin,
      targetMeaning: clueItem.targetMeaning,
      audioText: clueItem.audioText,
    },
    orbs,
  };
}

export function buildRandomChatStudyCard(chapterFilter = "all", seed = 0): ChatStudyCard {
  const q = pickQuizBattleQuestion(chapterFilter, [], seed);
  const correctText = q.options[q.correctIdx];
  const wrongTexts = q.options.filter((_, idx) => idx !== q.correctIdx).slice(0, 2);
  const rawOptions = [correctText, ...wrongTexts];
  const shift = Math.abs(seed) % 3;
  const options = rawOptions.map((_, i) => rawOptions[(i + shift) % 3]) as [string, string, string];
  const correctIdx = options.indexOf(correctText);
  return {
    hanzi: q.hanzi || q.audioText || "你好",
    pinyin: q.pinyin || q.chapterLabel,
    meaning: q.explain,
    chapterLabel: q.chapterLabel,
    quizPrompt: q.prompt,
    options,
    correctIdx: correctIdx >= 0 ? correctIdx : 0,
  };
}

