import React, { useEffect, useRef, useState } from "react";
import {
  Bomb,
  BookOpen,
  Check,
  Coins,
  Compass,
  Copy,
  Crown,
  EyeOff,
  Flag,
  Gamepad2,
  GraduationCap,
  Navigation,
  Search,
  Send,
  Sparkles,
  Trophy,
  Users,
  Volume2,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";
import type { ChapterData } from "../data/types";
import {
  buildRandomChatStudyCard,
  PLAYER_JACKET_COLORS,
  QUICK_MANDARIN_EMOTES,
  SOCIAL_EMOTES,
  sanitizePlayerName,
  sanitizeRoomId,
  type AvatarGender,
  type ChatStudyCard,
  type MiniGameKind,
  type MiniGameSnapshot,
  type MultiplayerChatEntry,
  type RemotePlayerSnapshot,
  type SocialEmoteKind,
} from "../game/multiplayer";
import type { MultiplayerProfile, MultiplayerStatus } from "../game/multiplayerClient";
import {
  AVATAR_HAIR_COLORS,
  AVATAR_SKIN_TONES,
  AVATAR_STYLE_PRESETS,
  getAvatarStyle,
  sanitizeAvatarAppearance,
  type AvatarAppearance,
} from "../game/avatar";
import { speakMandarin } from "../game/audio";

export type MultiplayerDrawerTab = "chat" | "players" | "games" | "room";

interface MultiplayerDrawerProps {
  isOpen: boolean;
  initialTab?: MultiplayerDrawerTab;
  enabled: boolean;
  status: MultiplayerStatus;
  selfId: string | null;
  profile: MultiplayerProfile;
  remotePlayers: RemotePlayerSnapshot[];
  chats: MultiplayerChatEntry[];
  minigame: MiniGameSnapshot | null;
  chapters: ChapterData[];
  muted: boolean;
  naturalTtsEnabled: boolean;
  speechRate: number;
  onClose: () => void;
  onToggleEnabled: (nextEnabled: boolean) => void;
  onSaveProfile: (next: MultiplayerProfile) => void;
  onSendChat: (
    text: string,
    pinyin?: string,
    emoteOnly?: boolean,
    studyCard?: ChatStudyCard,
  ) => boolean;
  onSendSocialEmote?: (kind: SocialEmoteKind) => void;
  onSolveStudyCard?: (entryId: string, isCorrect: boolean) => void;
  onWalkToPlayer: (player: RemotePlayerSnapshot) => void;
  onStartMiniGame: (kind: MiniGameKind, chapterFilter?: string) => void;
  onStopMiniGame: () => void;
}

export const MultiplayerDrawer: React.FC<MultiplayerDrawerProps> = ({
  isOpen,
  initialTab,
  enabled,
  status,
  selfId,
  profile,
  remotePlayers,
  chats,
  minigame,
  chapters,
  muted,
  naturalTtsEnabled,
  speechRate,
  onClose,
  onToggleEnabled,
  onSaveProfile,
  onSendChat,
  onSendSocialEmote,
  onSolveStudyCard,
  onWalkToPlayer,
  onStartMiniGame,
  onStopMiniGame,
}) => {
  const [nameDraft, setNameDraft] = useState(profile.name);
  const [roomDraft, setRoomDraft] = useState(profile.roomId);
  const [colorDraft, setColorDraft] = useState(profile.colorHex);
  const [genderDraft, setGenderDraft] = useState<AvatarGender>(profile.gender ?? "boy");
  const [appearanceDraft, setAppearanceDraft] = useState<AvatarAppearance>(() =>
    sanitizeAvatarAppearance(
      profile.appearance,
      profile.gender ?? "boy",
    ),
  );
  const [chatDraft, setChatDraft] = useState("");
  const [copiedLink, setCopiedLink] = useState(false);
  const [chapterFilter, setChapterFilter] = useState<string>("all");
  const [solvedCards, setSolvedCards] = useState<Record<string, number>>({});
  const [tab, setTab] = useState<MultiplayerDrawerTab>(initialTab ?? "chat");
  const chatScrollRef = useRef<HTMLDivElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (isOpen && initialTab) {
      setTab(initialTab);
    }
  }, [isOpen, initialTab]);

  useEffect(() => {
    setNameDraft(profile.name);
    setRoomDraft(profile.roomId);
    setColorDraft(profile.colorHex);
    setGenderDraft(profile.gender ?? "boy");
    setAppearanceDraft(
      sanitizeAvatarAppearance(
        profile.appearance,
        profile.gender ?? "boy",
      ),
    );
  }, [profile]);

  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [chats, isOpen, tab]);

  useEffect(() => {
    if (!isOpen) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = dialogRef.current;
    const focusableSelector =
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const focusFirst = () => dialog?.querySelector<HTMLElement>(focusableSelector)?.focus();
    focusFirst();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !dialog) return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(focusableSelector));
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previousFocus?.focus();
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const onlineTotal = enabled && status === "connected" ? remotePlayers.length + 1 : 0;
  const availableStyles = AVATAR_STYLE_PRESETS.filter((preset) => preset.gender === genderDraft);
  const updateAppearance = (patch: Partial<AvatarAppearance>) => {
    setAppearanceDraft((prev) => sanitizeAvatarAppearance({ ...prev, ...patch }, genderDraft));
  };
  const changeGender = (gender: AvatarGender) => {
    setGenderDraft(gender);
    setAppearanceDraft((prev) =>
      sanitizeAvatarAppearance({ hairColor: prev.hairColor, skinTone: prev.skinTone }, gender),
    );
  };

  const miniGameTitle = (kind: MiniGameKind) => {
    if (kind === "quiz_battle") return "Cerdas Cermat Live (汉语抢答赛)";
    if (kind === "word_hunter") return "Berburu Terjemahan 3D (寻词大冒险)";
    if (kind === "hide_seek") return "Petak Umpet 3D (捉迷藏)";
    if (kind === "tag_bomb") return "Estafet Bom Waktu (传炸弹)";
    if (kind === "coin_party") return "Pesta Koin & Mahkota (抢金币皇冠)";
    if (kind === "parkour_race") return "Balap Parkour Kampus (屋顶跑酷赛)";
    if (kind === "orb_rush") return "Lomba Bola Aksara (汉字夺宝)";
    return "Lari Kata Mandarin (抢词大作战)";
  };

  const handleSendStudyCard = () => {
    if (status !== "connected") return;
    const card = buildRandomChatStudyCard(chapterFilter, Date.now() + chats.length * 7);
    onSendChat(
      `Tantangan ${card.chapterLabel}: ${card.hanzi}`,
      card.pinyin,
      false,
      card,
    );
  };

  const handleApplyProfile = (e: React.FormEvent) => {
    e.preventDefault();
    const next: MultiplayerProfile = {
      name: sanitizePlayerName(nameDraft),
      colorHex: colorDraft,
      roomId: sanitizeRoomId(roomDraft),
      gender: genderDraft,
      appearance: sanitizeAvatarAppearance(appearanceDraft, genderDraft),
    };
    onSaveProfile(next);
    if (!enabled) {
      onToggleEnabled(true);
    }
  };

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatDraft.trim() || status !== "connected") return;
    if (onSendChat(chatDraft, undefined, false)) {
      setChatDraft("");
    }
  };

  const handleCopyInviteLink = async () => {
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("autostart", "1");
      url.searchParams.set("mp", "1");
      url.searchParams.set("room", sanitizeRoomId(profile.roomId));
      await navigator.clipboard.writeText(url.toString());
      setCopiedLink(true);
      window.setTimeout(() => setCopiedLink(false), 2200);
    } catch {
      // ignore clipboard restriction
    }
  };

  const chapterLabel = (id: string) => {
    const ch = chapters.find((c) => c.id === id);
    return ch ? `Bab ${ch.order}` : "Kampus";
  };

  return (
    <div
      ref={dialogRef}
      className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/60 p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="mp-modal-title"
      data-testid="multiplayer-drawer"
    >
      <div className="flex max-h-[92dvh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-300 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900">
        {/* Header */}
        <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-4 py-3 dark:border-slate-800 sm:gap-3 sm:px-6">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
              {status === "connected" ? (
                <Wifi className="h-3.5 w-3.5 shrink-0" />
              ) : (
                <WifiOff className="h-3.5 w-3.5 shrink-0 text-slate-400" />
              )}
              <span className="truncate">
                {status === "connected"
                  ? `Terhubung · Ruang ${profile.roomId}`
                  : status === "connecting" || status === "reconnecting"
                    ? "Menghubungkan..."
                    : "Mode Offline (Solo)"}
              </span>
            </div>
            <h2
              id="mp-modal-title"
              className="truncate text-base font-extrabold text-slate-900 dark:text-white sm:text-lg"
            >
              Kampus Open World Multiplayer
            </h2>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              data-testid="mp-toggle-btn"
              onClick={() => onToggleEnabled(!enabled)}
              className={`min-h-[38px] whitespace-nowrap rounded-xl px-3 text-xs font-extrabold text-white transition sm:px-3.5 ${
                enabled
                  ? "bg-rose-700 hover:bg-rose-800"
                  : "bg-emerald-700 hover:bg-emerald-800"
              }`}
            >
              {enabled ? "Keluar Online" : "Gabung Online"}
            </button>

            <button
              type="button"
              data-testid="mp-close-btn"
              data-mp-close
              onClick={onClose}
              aria-label="Tutup Panel Multiplayer"
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Subtabs */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2 dark:border-slate-800 dark:bg-slate-950/60 sm:px-6">
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              data-testid="mp-tab-chat"
              onClick={() => setTab("chat")}
              className={`min-h-[34px] rounded-lg border px-2.5 text-xs font-bold transition ${
                tab === "chat"
                  ? "border-blue-700 bg-blue-700 text-white"
                  : "border-slate-200 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              }`}
            >
              Obrolan 3D
            </button>
            <button
              type="button"
              data-testid="mp-tab-players"
              onClick={() => setTab("players")}
              className={`min-h-[34px] rounded-lg border px-2.5 text-xs font-bold transition ${
                tab === "players"
                  ? "border-blue-700 bg-blue-700 text-white"
                  : "border-slate-200 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              }`}
            >
              Pemain ({onlineTotal})
            </button>
            <button
              type="button"
              data-testid="mp-tab-games"
              onClick={() => setTab("games")}
              className={`inline-flex min-h-[34px] items-center gap-1.5 rounded-lg border px-2.5 text-xs font-bold transition ${
                tab === "games"
                  ? "border-blue-700 bg-blue-700 text-white"
                  : "border-slate-200 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              }`}
            >
              <Gamepad2 className="h-3.5 w-3.5" />
              Mini-Game
              {minigame && minigame.phase !== "ended" && (
                <span className="h-2 w-2 rounded-full bg-emerald-400" aria-hidden="true" />
              )}
            </button>
            <button
              type="button"
              data-testid="mp-tab-room"
              onClick={() => setTab("room")}
              className={`min-h-[34px] rounded-lg border px-2.5 text-xs font-bold transition ${
                tab === "room"
                  ? "border-blue-700 bg-blue-700 text-white"
                  : "border-slate-200 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              }`}
            >
              Profil &amp; Ruang
            </button>
          </div>

          <button
            type="button"
            onClick={handleCopyInviteLink}
            className="hidden items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-[11px] font-bold text-slate-700 hover:border-blue-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 sm:inline-flex"
          >
            {copiedLink ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
            {copiedLink ? "Tautan Disalin!" : "Salin Undangan"}
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-1 flex-col overflow-hidden p-4 sm:p-5">
          {tab === "chat" && (
            <div className="flex flex-1 flex-col gap-3 overflow-hidden">
              {!enabled && (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs text-emerald-950 dark:border-emerald-800/70 dark:bg-emerald-950/50 dark:text-emerald-200">
                  <span>
                    Aktifkan <strong>Mode Open World</strong> untuk berjalan bersama pelajar lain secara real-time di halaman kampus 3D.
                  </span>
                  <button
                    type="button"
                    onClick={() => onToggleEnabled(true)}
                    className="rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-extrabold text-white hover:bg-emerald-800"
                  >
                    Gabung Sekarang
                  </button>
                </div>
              )}

              {/* Quick Mandarin Greeting Emotes & Study Card Drop */}
              <div>
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Salam Cepat &amp; Kuis Teman (3D)
                  </span>
                  <button
                    type="button"
                    disabled={status !== "connected"}
                    data-testid="mp-send-study-card-btn"
                    onClick={handleSendStudyCard}
                    className="inline-flex items-center gap-1 rounded-lg border border-indigo-300 bg-indigo-50 px-2.5 py-1 text-[11px] font-extrabold text-indigo-800 hover:bg-indigo-100 disabled:opacity-50 dark:border-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-200"
                  >
                    <BookOpen className="h-3 w-3" />
                    Lempar Kartu Kuis
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {QUICK_MANDARIN_EMOTES.map((q) => (
                    <button
                      key={q.text}
                      type="button"
                      disabled={status !== "connected"}
                      data-testid={`mp-emote-${q.text}`}
                      onClick={() => onSendChat(q.text, q.pinyin, true)}
                      title={`${q.pinyin} — ${q.meaning}`}
                      className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-bold text-slate-800 transition hover:border-blue-600 hover:bg-blue-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                    >
                      <span className="hanzi-text">{q.text}</span>{" "}
                      <span className="text-[11px] font-normal text-slate-500 dark:text-slate-400">
                        {q.meaning}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {onSendSocialEmote && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="mr-1 text-[11px] font-bold text-slate-500 dark:text-slate-400">Aksi 3D:</span>
                  {SOCIAL_EMOTES.map((emote) => (
                    <button
                      key={emote.kind}
                      type="button"
                      disabled={status !== "connected"}
                      onClick={() => onSendSocialEmote(emote.kind)}
                      className="rounded-lg border border-pink-200 bg-pink-50 px-2.5 py-1 text-[11px] font-bold text-pink-800 transition hover:border-pink-500 hover:bg-pink-100 disabled:opacity-50 dark:border-pink-900 dark:bg-pink-950/40 dark:text-pink-200"
                    >
                      {emote.label} <span className="hanzi-text opacity-70">{emote.hanzi}</span>
                    </button>
                  ))}
                </div>
              )}

              {/* Chat Log */}
              <div
                ref={chatScrollRef}
                data-testid="mp-chat-feed"
                className="custom-scroll flex-1 space-y-2 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950"
              >
                {chats.length === 0 ? (
                  <p className="py-8 text-center text-xs text-slate-500 dark:text-slate-400">
                    Belum ada obrolan di ruang <strong>{profile.roomId}</strong>. Kirim salam Mandarin atau lempar Kartu Kuis ke teman!
                  </p>
                ) : (
                  chats.map((entry) => {
                    const isSelf = entry.playerId === selfId;
                    const chosenIdx = solvedCards[entry.id];
                    return (
                      <div
                        key={entry.id}
                        className={`flex ${isSelf ? "justify-end" : "justify-start"}`}
                      >
                        <div
                          className={`max-w-[88%] rounded-xl px-3 py-2 text-xs shadow-sm ${
                            isSelf
                              ? "bg-blue-700 text-white"
                              : "border border-slate-200 bg-white text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                          }`}
                        >
                          <div className="mb-0.5 flex items-center justify-between gap-2 text-[10px] font-bold opacity-85">
                            <span className="inline-flex items-center gap-1.5">
                              <span
                                className="inline-block h-2 w-2 rounded-full"
                                style={{ backgroundColor: entry.colorHex }}
                              />
                              {entry.playerName} {isSelf ? "(Kamu)" : ""}
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                speakMandarin(entry.studyCard?.hanzi || entry.text, {
                                  muted,
                                  rate: speechRate,
                                  naturalTts: naturalTtsEnabled,
                                })
                              }
                              aria-label="Putar suara pesan"
                              className="rounded p-0.5 hover:bg-black/10"
                            >
                              <Volume2 className="h-3 w-3" />
                            </button>
                          </div>
                          <div className="hanzi-text text-sm font-bold leading-snug">
                            {entry.text}
                          </div>
                          {entry.pinyin && (
                            <div className="mt-0.5 text-[11px] opacity-85">{entry.pinyin}</div>
                          )}

                          {entry.studyCard && (
                            <div
                              data-testid={`chat-study-card-${entry.id}`}
                              className={`mt-2 rounded-lg border p-2 text-[11px] ${
                                isSelf
                                  ? "border-blue-500 bg-blue-800/70 text-white"
                                  : "border-indigo-200 bg-indigo-50 text-slate-900 dark:border-indigo-800 dark:bg-indigo-950/60 dark:text-slate-100"
                              }`}
                            >
                              <div className="mb-1 font-bold">{entry.studyCard.quizPrompt}</div>
                              <div className="space-y-1">
                                {entry.studyCard.options.map((opt, idx) => {
                                  const isPicked = chosenIdx === idx;
                                  const isRight = idx === entry.studyCard!.correctIdx;
                                  const revealed = chosenIdx !== undefined;
                                  return (
                                    <button
                                      key={idx}
                                      type="button"
                                      disabled={revealed}
                                      onClick={() => {
                                        setSolvedCards((prev) => ({ ...prev, [entry.id]: idx }));
                                        onSolveStudyCard?.(entry.id, isRight);
                                      }}
                                      className={`block w-full rounded-md border px-2 py-1 text-left font-semibold transition ${
                                        revealed
                                          ? isRight
                                            ? "border-emerald-500 bg-emerald-600 text-white"
                                            : isPicked
                                              ? "border-rose-500 bg-rose-600 text-white"
                                              : "border-transparent bg-black/10 opacity-70"
                                          : isSelf
                                            ? "border-blue-400/50 bg-blue-900/40 hover:bg-blue-900/70"
                                            : "border-indigo-200 bg-white hover:border-indigo-500 dark:border-slate-700 dark:bg-slate-800"
                                      }`}
                                    >
                                      {opt}
                                    </button>
                                  );
                                })}
                              </div>
                              {chosenIdx !== undefined && (
                                <div className="mt-1.5 text-[10px] font-medium opacity-95">
                                  {chosenIdx === entry.studyCard.correctIdx
                                    ? "Benar! +8 XP · "
                                    : "Jawaban tepat di hijau · "}
                                  {entry.studyCard.meaning}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Chat Input */}
              <form onSubmit={handleSend} className="flex gap-2">
                <input
                  type="text"
                  data-testid="mp-chat-input"
                  value={chatDraft}
                  onChange={(e) => setChatDraft(e.target.value)}
                  disabled={status !== "connected"}
                  placeholder={
                    status === "connected"
                      ? "Tulis pesan (contoh: 你好！)..."
                      : "Gabung Open World dulu..."
                  }
                  className="min-h-[42px] min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-blue-600 focus:outline-none disabled:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
                <button
                  type="submit"
                  data-testid="mp-chat-send-btn"
                  disabled={status !== "connected" || !chatDraft.trim()}
                  className="inline-flex min-h-[42px] items-center gap-1.5 rounded-xl bg-blue-700 px-4 text-xs font-extrabold text-white hover:bg-blue-800 disabled:opacity-50"
                >
                  <Send className="h-4 w-4" />
                  Kirim
                </button>
              </form>
            </div>
          )}

          {tab === "players" && (
            <div className="custom-scroll flex-1 space-y-2.5 overflow-y-auto">
              <div className="flex items-center justify-between rounded-xl border border-blue-200 bg-blue-50 px-3.5 py-2.5 dark:border-blue-800 dark:bg-blue-950/50">
                <div className="flex items-center gap-2.5">
                  <span
                    className="h-3.5 w-3.5 rounded-full border-2 border-white shadow-sm"
                    style={{ backgroundColor: profile.colorHex }}
                  />
                  <div>
                    <div className="text-xs font-extrabold text-slate-900 dark:text-white">
                      {profile.name} (Kamu)
                    </div>
                    <div className="text-[11px] text-slate-600 dark:text-slate-300">
                      Ruang {profile.roomId} · {status === "connected" ? "Sedang Online" : "Offline"}
                    </div>
                  </div>
                </div>
                <span className="rounded-lg bg-blue-700 px-2 py-0.5 text-[11px] font-bold text-white">
                  Host Lokal
                </span>
              </div>

              {remotePlayers.length === 0 ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-6 text-center dark:border-slate-800 dark:bg-slate-950">
                  <Users className="mx-auto mb-2 h-6 w-6 text-slate-400" />
                  <p className="text-xs font-bold text-slate-700 dark:text-slate-200">
                    Belum ada pelajar lain di ruang "{profile.roomId}".
                  </p>
                  <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                    Bagikan tautan undangan atau buka tab browser baru dengan ruang yang sama untuk bertemu di halaman kampus 3D!
                  </p>
                </div>
              ) : (
                remotePlayers.map((rp) => (
                  <div
                    key={rp.id}
                    data-testid={`mp-player-${rp.id}`}
                    className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 dark:border-slate-700 dark:bg-slate-800/70"
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span
                        className="h-3.5 w-3.5 shrink-0 rounded-full border-2 border-white shadow-sm"
                        style={{ backgroundColor: rp.colorHex }}
                      />
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 truncate text-xs font-extrabold text-slate-900 dark:text-white">
                          <span>{rp.name}</span>
                          <span
                            className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                              rp.gender === "girl"
                                ? "bg-pink-100 text-pink-800 dark:bg-pink-950/60 dark:text-pink-300"
                                : "bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300"
                            }`}
                          >
                            {rp.gender === "girl" ? "Cewe" : "Cowo"}
                          </span>
                        </div>
                        <div className="font-mono-num text-[11px] text-slate-500 dark:text-slate-400">
                          {getAvatarStyle(rp.appearance?.styleId).label}{" "}
                          · {chapterLabel(rp.activeChapterId)} · {rp.xp} XP · {rp.starsTotal}★
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        onWalkToPlayer(rp);
                        onClose();
                      }}
                      className="inline-flex min-h-[34px] shrink-0 items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-2.5 text-xs font-bold text-blue-800 hover:bg-blue-100 dark:border-blue-800 dark:bg-blue-950/60 dark:text-blue-200"
                    >
                      <Navigation className="h-3.5 w-3.5" />
                      Hampiri
                    </button>
                  </div>
                ))
              )}
            </div>
          )}

          {tab === "games" && (
            <div className="custom-scroll flex-1 space-y-3 overflow-y-auto">
              {status !== "connected" && (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs text-emerald-950 dark:border-emerald-800/70 dark:bg-emerald-950/50 dark:text-emerald-200">
                  <span>
                    Gabung <strong>Open World Online</strong> untuk bermain Estafet Bom, Pesta Koin, Balap Parkour, dan Petak Umpet bersama teman!
                  </span>
                  <button
                    type="button"
                    onClick={() => onToggleEnabled(true)}
                    className="rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-extrabold text-white hover:bg-emerald-800"
                  >
                    Gabung Sekarang
                  </button>
                </div>
              )}

              {minigame && (
                <div
                  data-testid="mp-minigame-status-card"
                  className="rounded-xl border border-amber-300 bg-amber-50 p-3 dark:border-amber-700/70 dark:bg-amber-950/40"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="text-[11px] font-bold uppercase tracking-wider text-amber-800 dark:text-amber-300">
                        {minigame.phase === "countdown"
                          ? "Hitung Mundur"
                          : minigame.phase === "active"
                            ? "Sedang Berlangsung"
                            : "Ronde Selesai"}{" "}
                        · {minigame.secondsLeft}d
                      </div>
                      <div className="text-sm font-extrabold text-slate-900 dark:text-white">
                        {miniGameTitle(minigame.kind)}
                      </div>
                    </div>

                    {minigame.phase !== "ended" && minigame.hostId === selfId && (
                      <button
                        type="button"
                        data-testid="mp-stop-minigame-btn"
                        onClick={onStopMiniGame}
                        className="rounded-lg border border-rose-300 bg-white px-2.5 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-50 dark:border-rose-800 dark:bg-slate-900 dark:text-rose-300"
                      >
                        Hentikan Game
                      </button>
                    )}
                  </div>

                  {minigame.winnerSummary && (
                    <p className="mt-1.5 text-xs font-bold text-emerald-800 dark:text-emerald-300">
                      {minigame.winnerSummary}
                    </p>
                  )}
                  {minigame.lastHint && !minigame.winnerSummary && (
                    <p className="mt-1.5 text-xs text-slate-700 dark:text-slate-200">
                      {minigame.lastHint}
                    </p>
                  )}

                  {minigame.players.length > 0 && (
                    <div className="mt-2.5 space-y-1 border-t border-amber-200 pt-2 dark:border-amber-800/60">
                      {[...minigame.players]
                        .sort((a, b) => b.score - a.score)
                        .map((mp) => (
                          <div
                            key={mp.id}
                            className="flex items-center justify-between text-xs"
                          >
                            <span className="inline-flex items-center gap-1.5 font-bold text-slate-800 dark:text-slate-100">
                              <span
                                className="h-2.5 w-2.5 rounded-full"
                                style={{ backgroundColor: mp.colorHex }}
                              />
                              {mp.name} {mp.id === selfId ? "(Kamu)" : ""}
                              {minigame.kind === "hide_seek" && !minigame.soloMode && (
                                <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                                  {mp.role === "seeker"
                                    ? "Pencari"
                                    : mp.caught
                                      ? "Tertangkap"
                                      : "Bersembunyi"}
                                </span>
                              )}
                              {minigame.kind === "tag_bomb" &&
                                !minigame.soloMode &&
                                minigame.bombHolderId === mp.id && (
                                  <span className="rounded bg-rose-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                                    Bawa Bom! ({minigame.bombFuseLeft ?? 0}d)
                                  </span>
                                )}
                              {minigame.kind === "coin_party" &&
                                minigame.crownHolderId === mp.id && (
                                  <span className="inline-flex items-center gap-0.5 rounded bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                                    <Crown className="h-3 w-3" /> Raja
                                  </span>
                                )}
                              {minigame.kind === "parkour_race" && (
                                <span className="rounded bg-cyan-700 px-1.5 py-0.5 text-[10px] font-bold text-white">
                                  Pos {mp.checkpointIdx ?? 0}/{minigame.checkpoints?.length ?? 6}
                                </span>
                              )}
                            </span>
                            <span className="font-mono-num font-extrabold text-amber-800 dark:text-amber-300">
                              {mp.score} poin
                            </span>
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              )}

              <div>
                <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                  <div className="text-[11px] font-extrabold uppercase tracking-wider text-blue-700 dark:text-blue-400">
                    Belajar Bareng Online (Seru &amp; Dapat XP!)
                  </div>
                  <select
                    aria-label="Filter Materi Bab"
                    data-testid="mp-chapter-filter"
                    value={chapterFilter}
                    onChange={(e) => setChapterFilter(e.target.value)}
                    className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-[11px] font-bold text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  >
                    <option value="all">Semua Bab (1–7)</option>
                    {chapters.map((ch) => (
                      <option key={ch.id} value={ch.id}>
                        Bab {ch.order} · {ch.shortTitle}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid gap-2">
                  {/* 1. Cerdas Cermat Live */}
                  <div className="rounded-xl border border-indigo-200 bg-indigo-50/60 p-3 dark:border-indigo-800/70 dark:bg-indigo-950/30">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="inline-flex items-center gap-1.5 text-sm font-extrabold text-slate-900 dark:text-white">
                          <GraduationCap className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                          Cerdas Cermat Live <span className="hanzi-text text-indigo-700 dark:text-indigo-300">汉语抢答赛</span>
                        </div>
                        <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                          Adu cepat 6 ronde kuis Mandarin (kosakata, tata bahasa &amp; audio) serentak bersama teman! Tercepat dapat +30 pt &amp; +15 XP nyata.
                        </p>
                      </div>
                      <button
                        type="button"
                        disabled={status !== "connected"}
                        data-testid="mp-start-quiz_battle"
                        onClick={() => {
                          onStartMiniGame("quiz_battle", chapterFilter);
                          onClose();
                        }}
                        className="shrink-0 rounded-xl bg-indigo-700 px-3.5 py-2 text-xs font-extrabold text-white hover:bg-indigo-800 disabled:opacity-50"
                      >
                        Mainkan
                      </button>
                    </div>
                  </div>

                  {/* 2. Berburu Terjemahan 3D */}
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3 dark:border-emerald-800/70 dark:bg-emerald-950/30">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="inline-flex items-center gap-1.5 text-sm font-extrabold text-slate-900 dark:text-white">
                          <Search className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                          Berburu Terjemahan 3D <span className="hanzi-text text-emerald-700 dark:text-emerald-300">寻词大冒险</span>
                        </div>
                        <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                          Baca petunjuk &amp; dengar suaranya, lalu lari secepatnya di plaza 3D untuk mengambil 1 Bola Hanzi yang tepat di antara 4 pilihan (+30 pt &amp; +15 XP)!
                        </p>
                      </div>
                      <button
                        type="button"
                        disabled={status !== "connected"}
                        data-testid="mp-start-word_hunter"
                        onClick={() => {
                          onStartMiniGame("word_hunter", chapterFilter);
                          onClose();
                        }}
                        className="shrink-0 rounded-xl bg-emerald-700 px-3.5 py-2 text-xs font-extrabold text-white hover:bg-emerald-800 disabled:opacity-50"
                      >
                        Mainkan
                      </button>
                    </div>
                  </div>

                  {/* 3. Lomba Bola Aksara */}
                  <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-800/70">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="inline-flex items-center gap-1.5 text-sm font-extrabold text-slate-900 dark:text-white">
                          <Sparkles className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                          Lomba Bola Aksara <span className="hanzi-text text-amber-700 dark:text-amber-300">汉字夺宝</span>
                        </div>
                        <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                          Kumpulkan gelombang Bola Aksara Hanzi sebanyak mungkin di seluruh distrik kota (+5 XP/bola)!
                        </p>
                      </div>
                      <button
                        type="button"
                        disabled={status !== "connected"}
                        data-testid="mp-start-orb_rush"
                        onClick={() => {
                          onStartMiniGame("orb_rush", chapterFilter);
                          onClose();
                        }}
                        className="shrink-0 rounded-xl bg-amber-600 px-3.5 py-2 text-xs font-extrabold text-white hover:bg-amber-700 disabled:opacity-50"
                      >
                        Mainkan
                      </button>
                    </div>
                  </div>

                  {/* 4. Lari Kata Mandarin */}
                  <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-800/70">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="inline-flex items-center gap-1.5 text-sm font-extrabold text-slate-900 dark:text-white">
                          <Compass className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                          Lari Kata Mandarin <span className="hanzi-text text-blue-700 dark:text-blue-300">抢词大作战</span>
                        </div>
                        <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                          Server mengumumkan nama tempat dalam Mandarin — lari ke bangunan tujuan (+10 XP/ronde)!
                        </p>
                      </div>
                      <button
                        type="button"
                        disabled={status !== "connected"}
                        data-testid="mp-start-word_dash"
                        onClick={() => {
                          onStartMiniGame("word_dash", chapterFilter);
                          onClose();
                        }}
                        className="shrink-0 rounded-xl bg-blue-700 px-3.5 py-2 text-xs font-extrabold text-white hover:bg-blue-800 disabled:opacity-50"
                      >
                        Mainkan
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <div className="mb-1.5 text-[11px] font-extrabold uppercase tracking-wider text-rose-700 dark:text-rose-400">
                  Seru &amp; Party (2+ Pemain — Non-Belajar)
                </div>
                <div className="grid gap-2">
                  {/* 1. Petak Umpet 3D */}
                  <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-800/70">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="inline-flex items-center gap-1.5 text-sm font-extrabold text-slate-900 dark:text-white">
                          <EyeOff className="h-4 w-4 text-rose-600 dark:text-rose-400" />
                          Petak Umpet 3D (Multi-Lantai)
                        </div>
                        <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                          {onlineTotal >= 2
                            ? "Sembunyi di 18 ruangan termasuk gedung 2-3 lantai (Menara, Arcade, Mall, Asrama) & Labirin Bambu! Petunjuk memberitahu jika target di lantai atas/bawah."
                            : "Mode Solo: Cari Lampion tersembunyi di lantai atas gedung & labirin, atau undang teman untuk PvP Petak Umpet!"}
                        </p>
                      </div>
                      <button
                        type="button"
                        disabled={status !== "connected"}
                        data-testid="mp-start-hide_seek"
                        onClick={() => {
                          onStartMiniGame("hide_seek");
                          onClose();
                        }}
                        className="shrink-0 rounded-xl bg-rose-700 px-3.5 py-2 text-xs font-extrabold text-white hover:bg-rose-800 disabled:opacity-50"
                      >
                        Mainkan
                      </button>
                    </div>
                  </div>

                  {/* 2. Estafet Bom Waktu */}
                  <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-800/70">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="inline-flex items-center gap-1.5 text-sm font-extrabold text-slate-900 dark:text-white">
                          <Bomb className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                          Estafet Bom Waktu
                        </div>
                        <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                          {onlineTotal >= 2
                            ? "Pegang bom 18 detik — kejar temanmu & sentuh atau tekan [F] untuk mengoper sebelum meledak! Yang selamat dapat +25 poin."
                            : "Mode Solo: Lari kejar & jinakkan bom waktu merah di atap dan halaman kampus sebelum 60 detik berakhir!"}
                        </p>
                      </div>
                      <button
                        type="button"
                        disabled={status !== "connected"}
                        data-testid="mp-start-tag_bomb"
                        onClick={() => {
                          onStartMiniGame("tag_bomb");
                          onClose();
                        }}
                        className="shrink-0 rounded-xl bg-orange-600 px-3.5 py-2 text-xs font-extrabold text-white hover:bg-orange-700 disabled:opacity-50"
                      >
                        Mainkan
                      </button>
                    </div>
                  </div>

                  {/* 3. Pesta Koin & Mahkota Raja */}
                  <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-800/70">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="inline-flex items-center gap-1.5 text-sm font-extrabold text-slate-900 dark:text-white">
                          <Coins className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                          Pesta Koin &amp; Mahkota Raja
                        </div>
                        <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                          Rebut Koin (+10), Permata di balkon lantai 2/3 (+25), &amp; Mahkota Raja (+50 + 3 poin/detik) yang bisa direbut jika teman menabrakmu!
                        </p>
                      </div>
                      <button
                        type="button"
                        disabled={status !== "connected"}
                        data-testid="mp-start-coin_party"
                        onClick={() => {
                          onStartMiniGame("coin_party");
                          onClose();
                        }}
                        className="shrink-0 rounded-xl bg-amber-600 px-3.5 py-2 text-xs font-extrabold text-white hover:bg-amber-700 disabled:opacity-50"
                      >
                        Mainkan
                      </button>
                    </div>
                  </div>

                  {/* 4. Balap Parkour Kampus */}
                  <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-800/70">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="inline-flex items-center gap-1.5 text-sm font-extrabold text-slate-900 dark:text-white">
                          <Flag className="h-4 w-4 text-cyan-600 dark:text-cyan-400" />
                          Balap Parkour Kampus
                        </div>
                        <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                          Lomba melompat lewat Trampolin, atap Menara Lt.3, Arcade Lt.2, dan Labirin Bambu melewati 6 pos menuju garis Finish!
                        </p>
                      </div>
                      <button
                        type="button"
                        disabled={status !== "connected"}
                        data-testid="mp-start-parkour_race"
                        onClick={() => {
                          onStartMiniGame("parkour_race");
                          onClose();
                        }}
                        className="shrink-0 rounded-xl bg-cyan-700 px-3.5 py-2 text-xs font-extrabold text-white hover:bg-cyan-800 disabled:opacity-50"
                      >
                        Mainkan
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs dark:border-slate-800 dark:bg-slate-950">
                <span className="inline-flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                  <Trophy className="h-3.5 w-3.5 text-amber-600" />
                  Ingin main PvP beramai-ramai?
                </span>
                <button
                  type="button"
                  onClick={handleCopyInviteLink}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-700 hover:border-blue-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                >
                  {copiedLink ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
                  {copiedLink ? "Disalin!" : "Salin Tautan Ruang"}
                </button>
              </div>
            </div>
          )}

          {tab === "room" && (
            <form onSubmit={handleApplyProfile} className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-200">
                  Nama Karakter di Kampus:
                  <input
                    type="text"
                    maxLength={18}
                    data-testid="mp-name-input"
                    value={nameDraft}
                    onChange={(e) => setNameDraft(e.target.value)}
                    className="mt-1 block min-h-[40px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                </label>

                <label className="text-xs font-bold text-slate-700 dark:text-slate-200">
                  Kode Ruang Kampus:
                  <input
                    type="text"
                    maxLength={24}
                    data-testid="mp-room-input"
                    value={roomDraft}
                    onChange={(e) => setRoomDraft(e.target.value)}
                    placeholder="kampus-utama"
                    className="mt-1 block min-h-[40px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                </label>
              </div>

              <div>
                <div className="mb-1.5 text-xs font-bold text-slate-700 dark:text-slate-200">
                  Karakter &amp; Gaya:
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    data-testid="mp-gender-boy"
                    onClick={() => changeGender("boy")}
                    className={`rounded-xl border px-3 py-2 text-left text-xs font-bold transition ${
                      genderDraft === "boy"
                        ? "border-blue-700 bg-blue-50 text-blue-950 dark:border-blue-400 dark:bg-blue-950/60 dark:text-white"
                        : "border-slate-200 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                    }`}
                  >
                    <div>Cowo Keren</div>
                    <div className="text-[10px] font-normal opacity-80">Topi street &amp; jaket varsity</div>
                  </button>
                  <button
                    type="button"
                    data-testid="mp-gender-girl"
                    onClick={() => changeGender("girl")}
                    className={`rounded-xl border px-3 py-2 text-left text-xs font-bold transition ${
                      genderDraft === "girl"
                        ? "border-pink-600 bg-pink-50 text-pink-950 dark:border-pink-400 dark:bg-pink-950/50 dark:text-white"
                        : "border-slate-200 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                    }`}
                  >
                    <div>Cewe Imut</div>
                    <div className="text-[10px] font-normal opacity-80">Pita kembar &amp; rok lipit</div>
                  </button>
                </div>
              </div>

              <div>
                <div className="mb-1.5 text-xs font-bold text-slate-700 dark:text-slate-200">
                  Pilih gaya ({availableStyles.length} pilihan):
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {availableStyles.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      data-testid={`mp-style-${preset.id}`}
                      onClick={() => updateAppearance({ styleId: preset.id })}
                      className={`rounded-xl border px-3 py-2 text-left transition ${
                        appearanceDraft.styleId === preset.id
                          ? "border-amber-500 bg-amber-50 ring-1 ring-amber-400 dark:bg-amber-950/40"
                          : "border-slate-200 bg-white hover:border-amber-400 dark:border-slate-700 dark:bg-slate-800"
                      }`}
                    >
                      <span className="block text-xs font-extrabold text-slate-800 dark:text-slate-100">
                        {preset.label} <span className="hanzi-text opacity-70">{preset.hanzi}</span>
                      </span>
                      <span className="mt-0.5 block text-[10px] leading-snug text-slate-500 dark:text-slate-400">
                        {preset.description}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <div className="mb-1.5 text-xs font-bold text-slate-700 dark:text-slate-200">Warna rambut:</div>
                  <div className="flex flex-wrap gap-2">
                    {AVATAR_HAIR_COLORS.map((color) => (
                      <button
                        key={color.hex}
                        type="button"
                        aria-label={`Pilih rambut ${color.label}`}
                        title={color.label}
                        onClick={() => updateAppearance({ hairColor: color.hex })}
                        className={`h-6 w-6 rounded-full border-2 ${
                          appearanceDraft.hairColor === color.hex
                            ? "scale-110 border-amber-500 ring-2 ring-amber-300"
                            : "border-white/90"
                        }`}
                        style={{ backgroundColor: color.hex }}
                      />
                    ))}
                  </div>
                </div>
                <div>
                  <div className="mb-1.5 text-xs font-bold text-slate-700 dark:text-slate-200">Warna kulit:</div>
                  <div className="flex flex-wrap gap-2">
                    {AVATAR_SKIN_TONES.map((tone) => (
                      <button
                        key={tone.hex}
                        type="button"
                        aria-label={`Pilih kulit ${tone.label}`}
                        title={tone.label}
                        onClick={() => updateAppearance({ skinTone: tone.hex })}
                        className={`h-6 w-6 rounded-full border-2 ${
                          appearanceDraft.skinTone === tone.hex
                            ? "scale-110 border-amber-500 ring-2 ring-amber-300"
                            : "border-white/90"
                        }`}
                        style={{ backgroundColor: tone.hex }}
                      />
                    ))}
                  </div>
                </div>
              </div>

              <div>
                <div className="mb-1.5 text-xs font-bold text-slate-700 dark:text-slate-200">
                  Warna Jaket / Pakaian:
                </div>
                <div className="flex flex-wrap gap-2">
                  {PLAYER_JACKET_COLORS.map((c) => (
                    <button
                      key={c.hex}
                      type="button"
                      onClick={() => setColorDraft(c.hex)}
                      className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold transition ${
                        colorDraft === c.hex
                          ? "border-blue-700 bg-blue-50 text-blue-900 dark:border-blue-400 dark:bg-blue-950/60 dark:text-blue-200"
                          : "border-slate-200 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                      }`}
                    >
                      <span
                        className="h-3.5 w-3.5 rounded-full"
                        style={{ backgroundColor: c.hex }}
                      />
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
                <button
                  type="button"
                  onClick={handleCopyInviteLink}
                  className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-slate-300 bg-slate-50 px-3.5 text-xs font-bold text-slate-800 hover:border-blue-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                >
                  {copiedLink ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                  {copiedLink ? "Tautan Undangan Disalin!" : "Salin Tautan Undang Teman"}
                </button>

                <button
                  type="submit"
                  data-testid="mp-save-profile-btn"
                  className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-blue-700 px-5 text-xs font-extrabold text-white hover:bg-blue-800"
                >
                  Simpan &amp; Terapkan
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
