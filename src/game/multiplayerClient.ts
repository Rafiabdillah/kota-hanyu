import {
  applyMultiplayerServerEvent,
  clampWorldCoords,
  DEFAULT_MULTIPLAYER_ROOM,
  PLAYER_JACKET_COLORS,
  sanitizeAvatarGender,
  sanitizeChapterId,
  sanitizeChatText,
  sanitizeColorHex,
  sanitizePlayerName,
  sanitizeRoomId,
  shouldEmitMovementDelta,
  type AvatarGender,
  type ChatStudyCard,
  type MiniGameEventNotice,
  type MiniGameKind,
  type MiniGameSnapshot,
  type MultiplayerChatEntry,
  type MultiplayerClientMessage,
  type MultiplayerServerMessage,
  type RemotePlayerSnapshot,
  type SharedBallState,
  type SocialEmoteKind,
} from "./multiplayer";
import { SOCCER_FIELD_CENTER } from "./worldLayout";

export type MultiplayerStatus = "disconnected" | "connecting" | "connected" | "reconnecting";

export interface MultiplayerProfile {
  name: string;
  colorHex: string;
  gender: AvatarGender;
  roomId: string;
}

const MP_PROFILE_STORAGE_KEY = "hanyu_mp_profile_v1";

function defaultColorForName(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  return PLAYER_JACKET_COLORS[hash % PLAYER_JACKET_COLORS.length]?.hex ?? PLAYER_JACKET_COLORS[0].hex;
}

export function loadMultiplayerProfile(): MultiplayerProfile {
  try {
    if (typeof window === "undefined") {
      return {
        name: "Rafi",
        colorHex: PLAYER_JACKET_COLORS[0].hex,
        gender: "boy",
        roomId: DEFAULT_MULTIPLAYER_ROOM,
      };
    }
    const urlParams = new URLSearchParams(window.location.search);
    const urlRoom = urlParams.get("room");
    const urlName = urlParams.get("name");
    const urlGender = urlParams.get("gender");
    const raw = window.localStorage.getItem(MP_PROFILE_STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<MultiplayerProfile>) : {};
    const resolvedName = sanitizePlayerName(urlName || parsed.name || "Rafi");
    const resolvedGender = sanitizeAvatarGender(urlGender || parsed.gender);

    return {
      name: resolvedName,
      colorHex: sanitizeColorHex(
        parsed.colorHex || (resolvedGender === "girl" ? "#ec4899" : defaultColorForName(resolvedName)),
      ),
      gender: resolvedGender,
      roomId: sanitizeRoomId(urlRoom || parsed.roomId || DEFAULT_MULTIPLAYER_ROOM),
    };
  } catch {
    return {
      name: "Rafi",
      colorHex: PLAYER_JACKET_COLORS[0].hex,
      gender: "boy",
      roomId: DEFAULT_MULTIPLAYER_ROOM,
    };
  }
}

export function saveMultiplayerProfile(profile: MultiplayerProfile): void {
  try {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(
      MP_PROFILE_STORAGE_KEY,
      JSON.stringify({
        name: sanitizePlayerName(profile.name),
        colorHex: sanitizeColorHex(profile.colorHex),
        gender: sanitizeAvatarGender(profile.gender),
        roomId: sanitizeRoomId(profile.roomId),
      }),
    );
  } catch {
    // ignore storage restriction
  }
}

export interface MultiplayerClientCallbacks {
  onStatusChange?: (status: MultiplayerStatus) => void;
  onSyncState?: (payload: {
    selfId: string | null;
    roomId: string;
    players: RemotePlayerSnapshot[];
    chats: MultiplayerChatEntry[];
  }) => void;
  onChatReceived?: (entry: MultiplayerChatEntry) => void;
  onMiniGameState?: (minigame: MiniGameSnapshot | null) => void;
  onMiniGameEvent?: (notice: MiniGameEventNotice) => void;
  onBallUpdate?: (ball: SharedBallState) => void;
  onSocialEmote?: (ev: {
    id: string;
    name: string;
    kind: SocialEmoteKind;
    x: number;
    y: number;
    z: number;
    ts: number;
  }) => void;
}

export class CampusMultiplayerClient {
  public readonly remotePlayers = new Map<string, RemotePlayerSnapshot>();
  public minigame: MiniGameSnapshot | null = null;
  public ball: SharedBallState = {
    x: SOCCER_FIELD_CENTER.x,
    z: SOCCER_FIELD_CENTER.z,
    vx: 0,
    vz: 0,
    westGoals: 0,
    eastGoals: 0,
  };
  private chats: MultiplayerChatEntry[] = [];
  private selfId: string | null = null;
  private roomId = DEFAULT_MULTIPLAYER_ROOM;
  private profile: MultiplayerProfile;
  private callbacks: MultiplayerClientCallbacks;
  private ws: WebSocket | null = null;
  private intentionallyClosed = false;
  private reconnectAttempt = 0;
  private reconnectTimer: number | null = null;
  private lastEmitAt = 0;
  private lastEmitSnapshot: {
    x: number;
    y: number;
    z: number;
    yaw: number;
    isSprinting: boolean;
    activeChapterId: string;
    xp: number;
    starsTotal: number;
  } | null = null;

  constructor(profile: MultiplayerProfile, callbacks: MultiplayerClientCallbacks) {
    this.profile = {
      name: sanitizePlayerName(profile.name),
      colorHex: sanitizeColorHex(profile.colorHex),
      gender: sanitizeAvatarGender(profile.gender),
      roomId: sanitizeRoomId(profile.roomId),
    };
    this.roomId = this.profile.roomId;
    this.callbacks = callbacks;
  }

  public getSelfId(): string | null {
    return this.selfId;
  }

  public getRoomId(): string {
    return this.roomId;
  }

  public connect(): void {
    this.intentionallyClosed = false;
    this.clearReconnectTimer();
    this.openSocket();
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer !== null && typeof window !== "undefined") {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private openSocket(): void {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const params = new URLSearchParams({
      room: this.profile.roomId,
      name: this.profile.name,
      color: this.profile.colorHex,
      gender: this.profile.gender,
    });
    const url = `${proto}//${window.location.host}/multiplayer?${params.toString()}`;

    this.callbacks.onStatusChange?.(this.reconnectAttempt > 0 ? "reconnecting" : "connecting");

    const ws = new WebSocket(url);
    this.ws = ws;

    ws.onopen = () => {
      this.reconnectAttempt = 0;
      this.callbacks.onStatusChange?.("connected");
      if (this.lastEmitSnapshot) {
        this.sendRaw({
          type: "player:update",
          ...this.lastEmitSnapshot,
        });
      }
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(String(event.data)) as MultiplayerServerMessage;
        const { nextChats, nextSelfId } = applyMultiplayerServerEvent(
          this.remotePlayers,
          this.chats,
          this.selfId,
          msg,
        );
        this.chats = nextChats;
        this.selfId = nextSelfId;

        if (msg.type === "world:init") {
          this.roomId = msg.roomId;
          this.minigame = msg.minigame ?? null;
          if (msg.ball) {
            this.ball = msg.ball;
            this.callbacks.onBallUpdate?.(this.ball);
          }
          this.callbacks.onMiniGameState?.(this.minigame);
        } else if (msg.type === "minigame:state") {
          this.minigame = msg.minigame;
          this.callbacks.onMiniGameState?.(this.minigame);
        } else if (msg.type === "minigame:event") {
          this.callbacks.onMiniGameEvent?.(msg.notice);
        } else if (msg.type === "world:ball") {
          this.ball = msg.ball;
          this.callbacks.onBallUpdate?.(this.ball);
        } else if (msg.type === "player:social") {
          this.callbacks.onSocialEmote?.({
            id: msg.id,
            name: msg.name,
            kind: msg.kind,
            x: msg.x,
            y: msg.y,
            z: msg.z,
            ts: msg.ts,
          });
        } else if (msg.type === "player:chat") {
          this.callbacks.onChatReceived?.(msg.entry);
        }

        if (
          msg.type === "world:init" ||
          msg.type === "player:joined" ||
          msg.type === "player:profile" ||
          msg.type === "player:chat" ||
          msg.type === "player:left"
        ) {
          this.emitSync();
        }
      } catch {
        // ignore malformed packets
      }
    };

    ws.onclose = () => {
      if (this.ws === ws) {
        this.ws = null;
      }
      if (this.intentionallyClosed) {
        this.callbacks.onStatusChange?.("disconnected");
        return;
      }
      this.reconnectAttempt += 1;
      const delayMs = Math.min(5000, 650 * Math.pow(1.6, Math.min(4, this.reconnectAttempt - 1)));
      this.callbacks.onStatusChange?.("reconnecting");
      this.clearReconnectTimer();
      this.reconnectTimer = window.setTimeout(() => {
        if (!this.intentionallyClosed) {
          this.openSocket();
        }
      }, delayMs);
    };
  }

  private emitSync(): void {
    this.callbacks.onSyncState?.({
      selfId: this.selfId,
      roomId: this.roomId,
      players: Array.from(this.remotePlayers.values()),
      chats: this.chats,
    });
  }

  private sendRaw(payload: MultiplayerClientMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
    }
  }

  public updateLocalState(input: {
    x: number;
    y: number;
    z: number;
    yaw: number;
    isSprinting: boolean;
    activeChapterId: string;
    xp: number;
    starsTotal: number;
  }): void {
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    const now = performance.now();
    if (now - this.lastEmitAt < 60) return;

    const coords = clampWorldCoords(input.x, input.y, input.z, input.yaw);
    const safeChapterId = sanitizeChapterId(input.activeChapterId);
    const safeXp = Number.isFinite(input.xp) ? Math.max(0, Math.round(input.xp)) : 0;
    const safeStars = Number.isFinite(input.starsTotal)
      ? Math.max(0, Math.min(21, Math.round(input.starsTotal)))
      : 0;
    const nextSnapshot = {
      ...coords,
      isSprinting: Boolean(input.isSprinting),
      activeChapterId: safeChapterId,
      xp: safeXp,
      starsTotal: safeStars,
    };

    if (!shouldEmitMovementDelta(this.lastEmitSnapshot, nextSnapshot, now - this.lastEmitAt)) {
      return;
    }

    this.lastEmitAt = now;
    this.lastEmitSnapshot = nextSnapshot;
    this.sendRaw({
      type: "player:update",
      ...nextSnapshot,
    });
  }

  public updateProfile(next: MultiplayerProfile): void {
    const cleanRoom = sanitizeRoomId(next.roomId);
    const cleanName = sanitizePlayerName(next.name);
    const cleanColor = sanitizeColorHex(next.colorHex);
    const cleanGender = sanitizeAvatarGender(next.gender);
    const roomChanged = cleanRoom !== this.profile.roomId;

    this.profile = { name: cleanName, colorHex: cleanColor, gender: cleanGender, roomId: cleanRoom };
    saveMultiplayerProfile(this.profile);

    if (roomChanged) {
      this.remotePlayers.clear();
      this.chats = [];
      this.minigame = null;
      this.selfId = null;
      this.callbacks.onMiniGameState?.(null);
      this.emitSync();
      this.ws?.close(1000, "Switching room");
      this.ws = null;
      if (!this.intentionallyClosed) {
        this.openSocket();
      }
      return;
    }

    this.sendRaw({
      type: "player:profile",
      name: cleanName,
      colorHex: cleanColor,
      gender: cleanGender,
    });
  }

  public sendChat(
    rawText: string,
    pinyin?: string,
    emoteOnly = false,
    studyCard?: ChatStudyCard,
  ): boolean {
    const clean = sanitizeChatText(rawText);
    if (!clean) return false;
    this.sendRaw({
      type: "player:chat",
      text: clean,
      pinyin,
      emoteOnly,
      studyCard,
    });
    return true;
  }

  public startMiniGame(kind: MiniGameKind, chapterFilter?: string): boolean {
    if (this.ws?.readyState !== WebSocket.OPEN) return false;
    this.sendRaw({
      type: "minigame:start",
      kind,
      chapterFilter,
    });
    return true;
  }

  public sendSocialEmote(kind: SocialEmoteKind): boolean {
    if (this.ws?.readyState !== WebSocket.OPEN) return false;
    this.sendRaw({
      type: "player:social",
      kind,
    });
    return true;
  }

  public sendMiniGameAction(
    action: "catch" | "pass_bomb" | "collect_orb" | "reach_zone" | "answer_quiz" | "stop",
    targetOrExtra?: string | { targetId?: string; optionIdx?: number },
  ): boolean {
    if (this.ws?.readyState !== WebSocket.OPEN) return false;
    const targetId = typeof targetOrExtra === "string" ? targetOrExtra : targetOrExtra?.targetId;
    const optionIdx = typeof targetOrExtra === "object" ? targetOrExtra.optionIdx : undefined;
    this.sendRaw({
      type: "minigame:action",
      action,
      targetId,
      optionIdx,
    });
    return true;
  }

  public disconnect(): void {
    this.intentionallyClosed = true;
    this.clearReconnectTimer();
    this.remotePlayers.clear();
    this.chats = [];
    this.minigame = null;
    this.selfId = null;
    if (this.ws) {
      try {
        this.ws.close(1000, "Client left multiplayer");
      } catch {
        // ignore close error
      }
      this.ws = null;
    }
    this.callbacks.onMiniGameState?.(null);
    this.emitSync();
    this.callbacks.onStatusChange?.("disconnected");
  }
}
