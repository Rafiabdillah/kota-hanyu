import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Sparkles, X } from "lucide-react";
import { MATERI } from "./data/materi";
import type { ChapterStageId, GameMode, QuizQuestion } from "./data/types";
import {
  CAMPUS_ORBS,
  claimDailyQuestBonus,
  clearProgressState,
  computeChapterStars,
  computeGraduationEligibility,
  createEmptyChapterProgress,
  getChapterProgress,
  getDailyQuests,
  getQuizCorrectCount,
  getRecommendedStage,
  isBossMastered,
  isPracticeComplete,
  isQuizMastered,
  loadProgressState,
  MAX_DAILY_VOICE_REWARD_TURNS,
  recordChapterQuizOutcome,
  recordDynamicPracticeXp,
  recordFlashcardReview,
  recordHanziPractice,
  recordLiveVoiceTurn,
  recordOrbCollected,
  recordPracticeOutcome,
  recordQuizOutcome,
  recordToneDrillSolved,
  recordWorldInteractionReward,
  recoverEnergyFromBreak,
  saveProgressState,
  type PlayerProgressState,
} from "./game/engine";
import { playSfx, speakMandarin } from "./game/audio";
import { getAvatarStyle, sanitizeAvatarAppearance, type AvatarAppearance } from "./game/avatar";
import { syncBgmState, unlockBgmAudio } from "./game/bgm";
import { getNextCameraPreset, type CameraPreset } from "./game/cameraMath";
import {
  SOCIAL_EMOTES,
  type AvatarGender,
  type ChatStudyCard,
  type MiniGameKind,
  type MiniGameSnapshot,
  type MultiplayerChatEntry,
  type RemotePlayerSnapshot,
  type SharedBallState,
  type SocialEmoteKind,
} from "./game/multiplayer";
import {
  SOCCER_FIELD_CENTER,
  type InteractivePropDef,
  type OpenWorldBuildingDef,
} from "./game/worldLayout";
import {
  CampusMultiplayerClient,
  loadMultiplayerProfile,
  saveMultiplayerProfile,
  type MultiplayerProfile,
  type MultiplayerStatus,
} from "./game/multiplayerClient";
import { CampusScene3D, type SceneTelemetry } from "./components/CampusScene3D";
import { TitleOverlay } from "./components/TitleOverlay";
import { GameHud } from "./components/GameHud";
import { ChapterModal } from "./components/ChapterModal";
import { StudyToolsDrawer, type StudyToolsTabId } from "./components/StudyToolsDrawer";
import { LiveVoiceLab } from "./components/LiveVoiceLab";
import { MultiplayerDrawer, type MultiplayerDrawerTab } from "./components/MultiplayerDrawer";
import { PauseModal, VictoryModal } from "./components/PauseVictoryModals";
import { GraduationOverlay } from "./components/GraduationOverlay";

type GameShellState = "title" | "playing" | "paused" | "gameover";

interface ToastNotice {
  id: number;
  title: string;
  subtitle: string;
}

export default function App() {
  const [progress, setProgress] = useState<PlayerProgressState>(() => loadProgressState());
  const [gameState, setGameState] = useState<GameShellState>(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("autostart") === "1") return "playing";
    }
    return "title";
  });

  const [dockCollapsed, setDockCollapsed] = useState(true);
  const [nearbyChapterId, setNearbyChapterId] = useState<string | null>(null);
  const [insideBuilding, setInsideBuilding] = useState<OpenWorldBuildingDef | null>(null);
  const [nearbyProp, setNearbyProp] = useState<InteractivePropDef | null>(null);
  const [onScooter, setOnScooter] = useState(false);
  const propCooldownRef = useRef<Record<string, number>>({});
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>("normal");
  const virtualMoveRef = useRef({ x: 0, z: 0 });
  const virtualSprintRef = useRef(false);
  const jumpTriggerRef = useRef(0);
  const cameraZoomDeltaRef = useRef(0);
  const cameraResetTriggerRef = useRef(0);
  const telemetryRef = useRef<SceneTelemetry>({
    playerX: 0,
    playerY: 0,
    playerZ: 14,
    playerYaw: Math.PI,
    isSprinting: false,
    isGrounded: true,
  });

  const [mpProfile, setMpProfile] = useState<MultiplayerProfile>(() => loadMultiplayerProfile());
  const [mpEnabled, setMpEnabled] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      return params.get("mp") === "1";
    }
    return false;
  });
  const [mpOpen, setMpOpen] = useState(false);
  const [mpInitialTab, setMpInitialTab] = useState<MultiplayerDrawerTab>("chat");
  const [mpStatus, setMpStatus] = useState<MultiplayerStatus>("disconnected");
  const [mpSelfId, setMpSelfId] = useState<string | null>(null);
  const [mpPlayers, setMpPlayers] = useState<RemotePlayerSnapshot[]>([]);
  const [mpChats, setMpChats] = useState<MultiplayerChatEntry[]>([]);
  const [mpMiniGame, setMpMiniGame] = useState<MiniGameSnapshot | null>(null);
  const mpClientRef = useRef<CampusMultiplayerClient | null>(null);
  const pendingMiniGameRef = useRef<{ kind: MiniGameKind; chapterFilter?: string } | null>(null);
  const solvedStudyCardIdsRef = useRef<Set<string>>(new Set());
  const remotePlayersRef = useRef<Map<string, RemotePlayerSnapshot>>(new Map());
  const ballStateRef = useRef<SharedBallState>({
    x: SOCCER_FIELD_CENTER.x,
    z: SOCCER_FIELD_CENTER.z,
    vx: 0,
    vz: 0,
    westGoals: 0,
    eastGoals: 0,
  });
  const [localSocialBurst, setLocalSocialBurst] = useState<{
    kind: SocialEmoteKind;
    nonce: number;
  } | null>(null);
  const walkToTargetRef = useRef<{ x: number; z: number; nonce: number } | null>(null);
  const mpOpenRef = useRef(mpOpen);
  mpOpenRef.current = mpOpen;

  const [openChapterModalId, setOpenChapterModalId] = useState<string | null>(null);
  const [chapterModalStage, setChapterModalStage] = useState<ChapterStageId>("pembuka");
  const [studyToolsTab, setStudyToolsTab] = useState<StudyToolsTabId | null>(null);
  const [voiceLabOpen, setVoiceLabOpen] = useState(false);
  const [graduationMode, setGraduationMode] = useState(false);
  const [graduationCelebrateNonce, setGraduationCelebrateNonce] = useState(0);
  const [toast, setToast] = useState<ToastNotice | null>(null);
  const [victoryInfo, setVictoryInfo] = useState<{
    chapterId: string;
    stars: number;
    quizCorrect: number;
    quizTotal: number;
    xpEarned: number;
  } | null>(null);

  const showToast = useCallback((title: string, subtitle: string) => {
    const id = Date.now();
    setToast({ id, title, subtitle });
    window.setTimeout(() => {
      setToast((curr) => (curr?.id === id ? null : curr));
    }, 4500);
  }, []);

  // Sync document.body.dataset.state & theme class
  useEffect(() => {
    document.body.dataset.state = victoryInfo ? "gameover" : gameState;
  }, [gameState, victoryInfo]);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", progress.theme === "dark");
  }, [progress.theme]);

  useEffect(() => {
    saveProgressState(progress);
  }, [progress]);

  const startGame = useCallback(() => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    unlockBgmAudio();
    setVictoryInfo(null);
    setGameState("playing");
    document.body.dataset.state = "playing";
    playSfx("click", progress.muted);
  }, [progress.muted]);

  const handleOpenChapter = useCallback(
    (chapterId: string, openModal: boolean) => {
      setProgress((prev) => ({ ...prev, activeChapterId: chapterId }));
      playSfx("click", progress.muted);
      if (openModal) {
        const ch = MATERI.chapters.find((c) => c.id === chapterId) ?? MATERI.chapters[0];
        const cp = getChapterProgress(progress, chapterId);
        setChapterModalStage(getRecommendedStage(cp, ch));
        setOpenChapterModalId(chapterId);
      }
    },
    [progress],
  );

  // Real-time Open-World Multiplayer WebSocket lifecycle
  useEffect(() => {
    if (!mpEnabled || gameState === "title") {
      if (mpClientRef.current) {
        mpClientRef.current.disconnect();
        mpClientRef.current = null;
      }
      remotePlayersRef.current.clear();
      setMpStatus("disconnected");
      setMpSelfId(null);
      setMpPlayers([]);
      setMpChats([]);
      setMpMiniGame(null);
      return;
    }

    const client = new CampusMultiplayerClient(mpProfile, {
      onStatusChange: (nextStatus) => {
        setMpStatus(nextStatus);
        if (nextStatus === "connected" && pendingMiniGameRef.current) {
          const queued = pendingMiniGameRef.current;
          pendingMiniGameRef.current = null;
          client.startMiniGame(queued.kind, queued.chapterFilter);
        }
      },
      onSyncState: ({ selfId, players, chats }) => {
        setMpSelfId(selfId);
        setMpPlayers(players);
        setMpChats(chats);
      },
      onChatReceived: (entry) => {
        if (!mpOpenRef.current && entry.playerId !== client.getSelfId()) {
          showToast(
            `${entry.playerName}: ${entry.text}`,
            entry.pinyin ? `${entry.pinyin} · Obrolan Kampus` : "Obrolan Kampus Online",
          );
        }
      },
      onBallUpdate: (nextBall) => {
        ballStateRef.current = nextBall;
      },
      onSocialEmote: (ev) => {
        if (ev.id !== client.getSelfId()) {
          const meta = SOCIAL_EMOTES.find((s) => s.kind === ev.kind);
          if (meta) {
            showToast(`${ev.name} ${meta.toastText}`, `${meta.hanzi} · Aksi Sosial Kampus`);
          }
        }
      },
      onMiniGameState: (nextGame) => {
        setMpMiniGame(nextGame);
      },
      onMiniGameEvent: (notice) => {
        const sfxKind =
          notice.tone === "win"
            ? "victory"
            : notice.tone === "score"
              ? "orb"
              : notice.tone === "catch"
                ? "correct"
                : "click";
        playSfx(sfxKind, progress.muted);
        if (
          notice.xpReward &&
          notice.xpReward > 0 &&
          (!notice.rewardPlayerId || notice.rewardPlayerId === client.getSelfId())
        ) {
          setProgress((prev) => ({
            ...prev,
            xp: prev.xp + notice.xpReward!,
            dailyStats: {
              ...prev.dailyStats,
              quizzesSolved: prev.dailyStats.quizzesSolved + 1,
            },
          }));
        }
        showToast(notice.text, notice.pinyin || "Mini-Game Kampus Online");
      },
    });
    mpClientRef.current = client;
    remotePlayersRef.current = client.remotePlayers;
    client.connect();

    return () => {
      client.disconnect();
      if (mpClientRef.current === client) {
        mpClientRef.current = null;
      }
    };
    // Intentionally only recreate socket when mpEnabled or gameState transitions away from title; profile edits call client.updateProfile()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mpEnabled, gameState === "title"]);

  const openGraduationScene = useCallback(() => {
    setOpenChapterModalId(null);
    setStudyToolsTab(null);
    setVoiceLabOpen(false);
    setMpOpen(false);
    setVictoryInfo(null);
    setGameState("playing");
    setGraduationMode(true);
    setGraduationCelebrateNonce((n) => n + 1);
    playSfx("graduation", progress.muted);
  }, [progress.muted]);

  const handleSendSocialEmote = useCallback(
    (kind: SocialEmoteKind) => {
      setLocalSocialBurst({ kind, nonce: Date.now() });
      const meta = SOCIAL_EMOTES.find((s) => s.kind === kind);
      playSfx(kind === "firework" ? "victory" : kind === "highfive" ? "orb" : "click", progress.muted);
      if (mpEnabled && mpStatus === "connected") {
        mpClientRef.current?.sendSocialEmote(kind);
      }
      if (meta) {
        showToast(`${meta.label} (${meta.hanzi})`, `Kamu ${meta.toastText}`);
      }
    },
    [mpEnabled, mpStatus, progress.muted, showToast],
  );

  const handleSelectAppearance = useCallback(
    (appearance: AvatarAppearance) => {
      playSfx("click", progress.muted);
      setMpProfile((prev) => {
        const clean = sanitizeAvatarAppearance(appearance, prev.gender);
        const gender = getAvatarStyle(clean.styleId).gender;
        const next: MultiplayerProfile = { ...prev, gender, appearance: clean };
        saveMultiplayerProfile(next);
        mpClientRef.current?.updateProfile(next);
        return next;
      });
    },
    [progress.muted],
  );

  const handleSelectGender = useCallback(
    (gender: AvatarGender) => {
      playSfx("click", progress.muted);
      setMpProfile((prev) => {
        let colorHex = prev.colorHex;
        if (gender === "girl" && colorHex === "#2563eb") {
          colorHex = "#ec4899";
        } else if (gender === "boy" && colorHex === "#ec4899") {
          colorHex = "#2563eb";
        }
        const next: MultiplayerProfile = {
          ...prev,
          gender,
          colorHex,
          appearance: sanitizeAvatarAppearance(
            { hairColor: prev.appearance.hairColor, skinTone: prev.appearance.skinTone },
            gender,
          ),
        };
        saveMultiplayerProfile(next);
        mpClientRef.current?.updateProfile(next);
        return next;
      });
    },
    [progress.muted],
  );

  const handleSelectColor = useCallback(
    (colorHex: string) => {
      playSfx("click", progress.muted);
      setMpProfile((prev) => {
        const next: MultiplayerProfile = { ...prev, colorHex };
        saveMultiplayerProfile(next);
        mpClientRef.current?.updateProfile(next);
        return next;
      });
    },
    [progress.muted],
  );

  const handleToggleScooter = useCallback(() => {
    setOnScooter((prev) => {
      const next = !prev;
      playSfx(next ? "orb" : "click", progress.muted);
      showToast(
        next ? "Skuter Listrik Kampus Aktif!" : "Turun dari Skuter Listrik",
        next
          ? "Kecepatan jelajah +45% — melesat keliling kota kampus!"
          : "Kembali berjalan kaki santai.",
      );
      return next;
    });
  }, [progress.muted, showToast]);

  const handleInteractProp = useCallback(
    (prop: InteractivePropDef) => {
      if (prop.kind === "scooter_dock") {
        handleToggleScooter();
        return;
      }
      const now = Date.now();
      const lastUsed = propCooldownRef.current[prop.id] ?? 0;
      if (now - lastUsed < 6000) {
        const waitSec = Math.ceil((6000 - (now - lastUsed)) / 1000);
        showToast(prop.title, `Tunggu ${waitSec} detik lagi untuk berinteraksi kembali.`);
        return;
      }
      propCooldownRef.current[prop.id] = now;

      if (prop.kind === "fountain") {
        const reward = recordWorldInteractionReward(progress, prop.id, 10);
        setProgress((prev) => recordWorldInteractionReward(prev, prop.id, 10).nextState);
        if (!reward.newlyClaimed) {
          showToast(prop.title, "Hadiah pertama kali sudah diklaim. Kamu tetap bisa menikmati tempat ini.");
          return;
        }
        playSfx("orb", progress.muted);
        setLocalSocialBurst({ kind: "highfive", nonce: now });
        speakMandarin("万事如意", {
          muted: progress.muted,
          rate: progress.speechRate,
          naturalTts: progress.naturalTtsEnabled,
        });
        showToast("Air Mancur Harapan (许愿喷泉)", "万事如意 Wànshì rúyì · Semoga semua lancar! +10 XP");
        return;
      }
      if (prop.kind === "lantern_rack") {
        const reward = recordWorldInteractionReward(progress, prop.id, 12);
        setProgress((prev) => recordWorldInteractionReward(prev, prop.id, 12).nextState);
        if (!reward.newlyClaimed) {
          showToast(prop.title, "Hadiah pertama kali sudah diklaim. Lampion tetap bisa dinikmati.");
          return;
        }
        playSfx("victory", progress.muted);
        setLocalSocialBurst({ kind: "firework", nonce: now });
        speakMandarin("步步高升", {
          muted: progress.muted,
          rate: progress.speechRate,
          naturalTts: progress.naturalTtsEnabled,
        });
        showToast("Rak Lampion Harapan (许愿灯架)", "步步高升 Bùbù gāoshēng · Makin sukses! +12 XP");
        return;
      }
      if (prop.kind === "gacha_machine") {
        const fortunes = [
          { hz: "天天开心", py: "Tiāntiān kāixīn", id: "Bahagia setiap hari!", xp: 15 },
          { hz: "好好学习", py: "Hǎohǎo xuéxí", id: "Semangat belajar rajin!", xp: 20 },
          { hz: "心想事成", py: "Xīnxiǎng shìchéng", id: "Impian segera terwujud!", xp: 25 },
        ];
        const pick = fortunes[Math.floor(Math.random() * fortunes.length)];
        const reward = recordWorldInteractionReward(progress, prop.id, pick.xp);
        setProgress((prev) => recordWorldInteractionReward(prev, prop.id, pick.xp).nextState);
        if (!reward.newlyClaimed) {
          showToast("Gacha Aksara", "Kapsul pertama sudah diklaim. Tidak ada bonus XP tambahan.");
          return;
        }
        playSfx("achievement", progress.muted);
        setLocalSocialBurst({ kind: "clap", nonce: now });
        speakMandarin(pick.hz, {
          muted: progress.muted,
          rate: progress.speechRate,
          naturalTts: progress.naturalTtsEnabled,
        });
        showToast(`Gacha Aksara: ${pick.hz} (${pick.py})`, `${pick.id} · Bonus +${pick.xp} XP`);
      }
    },
    [
      handleToggleScooter,
      progress,
      showToast,
    ],
  );

  const handleInteractBuilding = useCallback(
    (building: OpenWorldBuildingDef) => {
      if (building.actionKind === "chapter" && building.chapterId) {
        handleOpenChapter(building.chapterId, true);
        return;
      }
      if (building.actionKind === "energy_cafe" || building.actionKind === "hangout_rest") {
        const reward = recordWorldInteractionReward(progress, building.id, 10, 2);
        setProgress((prev) => recordWorldInteractionReward(prev, building.id, 10, 2).nextState);
        if (!reward.newlyClaimed) {
          showToast(building.title, "Hadiah pertama kali sudah diklaim. Energi akan pulih secara alami.");
          return;
        }
        playSfx("correct", progress.muted);
        showToast(
          `${building.title} (${building.hanziTitle})`,
          `Energi Pulih +${reward.energyGained} & +${reward.xpGained} XP · Waktunya santai sejenak!`,
        );
        return;
      }
      if (building.actionKind === "hangout_snack") {
        const reward = recordWorldInteractionReward(progress, building.id, 15, 1);
        setProgress((prev) => recordWorldInteractionReward(prev, building.id, 15, 1).nextState);
        if (!reward.newlyClaimed) {
          showToast(building.title, "Hadiah pertama kali sudah diklaim. Tidak ada XP atau energi tambahan.");
          return;
        }
        playSfx("orb", progress.muted);
        showToast(
          `${building.title} (${building.hanziTitle})`,
          `Jajan Boba & Camilan Lezat! +${reward.xpGained} XP & +${reward.energyGained} Energi`,
        );
        return;
      }
      if (building.actionKind === "hangout_panda") {
        const reward = recordWorldInteractionReward(progress, building.id, 15, 2);
        setProgress((prev) => recordWorldInteractionReward(prev, building.id, 15, 2).nextState);
        if (!reward.newlyClaimed) {
          showToast(building.title, "Hadiah pertama kali sudah diklaim. Panda tetap menyambutmu!");
          return;
        }
        playSfx("orb", progress.muted);
        setLocalSocialBurst({ kind: "highfive", nonce: Date.now() });
        speakMandarin("熊猫很可爱", {
          muted: progress.muted,
          rate: progress.speechRate,
          naturalTts: progress.naturalTtsEnabled,
        });
        showToast(
          `${building.title} (${building.hanziTitle})`,
          `Panda lucu menyapamu! +${reward.energyGained} Energi & +${reward.xpGained} XP`,
        );
        return;
      }
      if (building.actionKind === "hangout_music") {
        const reward = recordWorldInteractionReward(progress, building.id, 15);
        setProgress((prev) => recordWorldInteractionReward(prev, building.id, 15).nextState);
        if (!reward.newlyClaimed) {
          showToast(building.title, "Konser sudah dinikmati; bonus pertama kali sudah diklaim.");
          return;
        }
        handleSendSocialEmote("dance");
        showToast(
          `${building.title} (${building.hanziTitle})`,
          `Pertunjukan musik kampus dimulai! +${reward.xpGained} XP`,
        );
        return;
      }
      if (building.actionKind === "hangout_dojo") {
        const reward = recordWorldInteractionReward(progress, building.id, 20);
        setProgress((prev) => recordWorldInteractionReward(prev, building.id, 20).nextState);
        if (!reward.newlyClaimed) {
          showToast(building.title, "Latihan sudah diselesaikan; bonus pertama kali sudah diklaim.");
          return;
        }
        playSfx("correct", progress.muted);
        setLocalSocialBurst({ kind: "clap", nonce: Date.now() });
        showToast(
          `${building.title} (${building.hanziTitle})`,
          `Latihan fokus & seni bela diri selesai! +${reward.xpGained} XP`,
        );
        return;
      }
      if (building.actionKind === "hangout_gacha") {
        const reward = recordWorldInteractionReward(progress, building.id, 20);
        setProgress((prev) => recordWorldInteractionReward(prev, building.id, 20).nextState);
        if (!reward.newlyClaimed) {
          showToast(building.title, "Suvenir pertama sudah diklaim. Tidak ada bonus XP tambahan.");
          return;
        }
        playSfx("achievement", progress.muted);
        showToast(
          `${building.title} (${building.hanziTitle})`,
          `Dapat Suvenir Kapsul Aksara Langka! +${reward.xpGained} XP`,
        );
        return;
      }
      if (building.actionKind === "hangout_observatory") {
        const reward = recordWorldInteractionReward(progress, building.id, 18);
        setProgress((prev) => recordWorldInteractionReward(prev, building.id, 18).nextState);
        if (!reward.newlyClaimed) {
          showToast(building.title, "Pemandangan sudah dinikmati; bonus pertama kali sudah diklaim.");
          return;
        }
        playSfx("victory", progress.muted);
        setLocalSocialBurst({ kind: "firework", nonce: Date.now() });
        speakMandarin("看星星", {
          muted: progress.muted,
          rate: progress.speechRate,
          naturalTts: progress.naturalTtsEnabled,
        });
        showToast(
          `${building.title} (${building.hanziTitle})`,
          `Meneropong bintang di atap Lt.3! +${reward.xpGained} XP`,
        );
        return;
      }
      if (building.actionKind === "hangout_scooter") {
        handleToggleScooter();
        return;
      }
      if (building.actionKind === "hangout_maze") {
        const reward = recordWorldInteractionReward(progress, building.id, 20);
        setProgress((prev) => recordWorldInteractionReward(prev, building.id, 20).nextState);
        if (!reward.newlyClaimed) {
          showToast(building.title, "Harta pertama sudah diklaim. Tidak ada bonus XP tambahan.");
          return;
        }
        playSfx("victory", progress.muted);
        setLocalSocialBurst({ kind: "firework", nonce: Date.now() });
        showToast(
          "Harta Taman Labirin Bambu (竹林迷宫)",
          `Berhasil menembus labirin! Bonus +${reward.xpGained} XP!`,
        );
        return;
      }
      if (building.actionKind === "hangout_show") {
        handleSendSocialEmote("firework");
        return;
      }
      playSfx("click", progress.muted);
      if (building.actionKind === "minigames") {
        setMpInitialTab("games");
        setMpOpen(true);
      } else if (building.actionKind === "studio") {
        setStudyToolsTab("studio");
      } else if (building.actionKind === "glossary") {
        setStudyToolsTab("glosarium");
      } else if (building.actionKind === "exam") {
        setStudyToolsTab("ujian");
      } else if (building.actionKind === "graduation") {
        openGraduationScene();
      }
    },
    [
      handleOpenChapter,
      handleSendSocialEmote,
      handleToggleScooter,
      openGraduationScene,
      progress,
      showToast,
    ],
  );

  // Global keyboard controls (Enter/Space on title, P/Esc pause, M mute, H dock, V live voice, O online, E enter, F catch)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if ((tag === "BUTTON" || tag === "A") && (e.code === "Space" || e.code === "Enter")) return;

      if (gameState === "title" && (e.code === "Enter" || e.code === "Space")) {
        e.preventDefault();
        startGame();
        return;
      }

      if (e.code === "Escape" || e.code === "KeyP") {
        if (openChapterModalId || studyToolsTab || voiceLabOpen || mpOpen) {
          if (e.code === "Escape") {
            setOpenChapterModalId(null);
            setStudyToolsTab(null);
            setVoiceLabOpen(false);
            setMpOpen(false);
          }
          return;
        }
        if (graduationMode) {
          if (e.code === "Escape") {
            setGraduationMode(false);
          }
          return;
        }
        if (gameState === "playing") {
          setGameState("paused");
        } else if (gameState === "paused") {
          setGameState("playing");
        }
        return;
      }

      if (
        gameState === "playing" &&
        !graduationMode &&
        !openChapterModalId &&
        !studyToolsTab &&
        !voiceLabOpen &&
        !mpOpen
      ) {
        if (e.code === "KeyM") {
          setProgress((prev) => ({ ...prev, muted: !prev.muted }));
        } else if (e.code === "KeyH") {
          setDockCollapsed((c) => !c);
        } else if (e.code === "KeyV") {
          setVoiceLabOpen(true);
        } else if (e.code === "KeyO") {
          setMpInitialTab("chat");
          setMpOpen(true);
        } else if (e.code === "KeyC") {
          setCameraPreset((p) => getNextCameraPreset(p));
        } else if (e.code === "KeyR") {
          cameraResetTriggerRef.current += 1;
        } else if (e.code === "Equal" || e.code === "NumpadAdd") {
          cameraZoomDeltaRef.current -= 2.2;
        } else if (e.code === "Minus" || e.code === "NumpadSubtract") {
          cameraZoomDeltaRef.current += 2.2;
        } else if (e.code === "KeyF") {
          if (
            mpMiniGame &&
            mpMiniGame.kind === "hide_seek" &&
            !mpMiniGame.soloMode &&
            mpMiniGame.phase === "active" &&
            mpMiniGame.seekerId === mpSelfId
          ) {
            mpClientRef.current?.sendMiniGameAction("catch");
          } else if (
            mpMiniGame &&
            mpMiniGame.kind === "tag_bomb" &&
            !mpMiniGame.soloMode &&
            mpMiniGame.phase === "active" &&
            mpMiniGame.bombHolderId === mpSelfId
          ) {
            mpClientRef.current?.sendMiniGameAction("pass_bomb");
          }
        } else if (e.code === "KeyE") {
          if (insideBuilding) {
            handleInteractBuilding(insideBuilding);
          } else if (nearbyProp) {
            handleInteractProp(nearbyProp);
          } else if (nearbyChapterId) {
            handleOpenChapter(nearbyChapterId, true);
          }
        } else if (
          (e.code === "Digit1" || e.code === "Digit2" || e.code === "Digit3" || e.code === "Digit4") &&
          mpMiniGame?.kind === "quiz_battle" &&
          mpMiniGame.phase === "active" &&
          mpMiniGame.quizQuestion &&
          !mpMiniGame.quizQuestion.revealActive
        ) {
          e.preventDefault();
          const optionIdx = Number(e.code.replace("Digit", "")) - 1;
          mpClientRef.current?.sendMiniGameAction("answer_quiz", { optionIdx });
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    gameState,
    graduationMode,
    openChapterModalId,
    studyToolsTab,
    voiceLabOpen,
    mpOpen,
    insideBuilding,
    nearbyProp,
    nearbyChapterId,
    mpMiniGame,
    mpSelfId,
    startGame,
    handleOpenChapter,
    handleInteractBuilding,
    handleInteractProp,
  ]);

  useEffect(() => {
    const onFirstGesture = () => unlockBgmAudio();
    window.addEventListener("pointerdown", onFirstGesture, { passive: true, once: true });
    window.addEventListener("keydown", onFirstGesture, { passive: true, once: true });
    return () => {
      window.removeEventListener("pointerdown", onFirstGesture);
      window.removeEventListener("keydown", onFirstGesture);
    };
  }, []);

  useEffect(() => {
    syncBgmState({
      enabled: progress.bgmEnabled,
      muted: progress.muted,
      gameState: victoryInfo ? "gameover" : gameState,
      graduationMode,
      studyOpen: Boolean(openChapterModalId || studyToolsTab),
      voiceLabOpen,
    });
  }, [
    progress.bgmEnabled,
    progress.muted,
    gameState,
    victoryInfo,
    graduationMode,
    openChapterModalId,
    studyToolsTab,
    voiceLabOpen,
  ]);

  const chapterStarsMap = useMemo(() => {
    const map: Record<string, number> = {};
    for (const ch of MATERI.chapters) {
      map[ch.id] = computeChapterStars(getChapterProgress(progress, ch.id), ch);
    }
    return map;
  }, [progress.chapters]);

  const completedChaptersCount = useMemo(
    () =>
      MATERI.chapters.filter((chapter) =>
        isBossMastered(getChapterProgress(progress, chapter.id), chapter),
      ).length,
    [progress.chapters],
  );

  const hasSavedProgress =
    progress.xp > 0 ||
    Object.keys(progress.chapters).length > 0 ||
    progress.reviewQueue.length > 0 ||
    progress.collectedOrbIds.length > 0;

  const activeChapterObj =
    MATERI.chapters.find((c) => c.id === (openChapterModalId || progress.activeChapterId)) ??
    MATERI.chapters[0];

  const handleCollectOrb = useCallback(
    (orbId: string) => {
      const orb = CAMPUS_ORBS.find((o) => o.id === orbId);
      if (!orb) return;
      playSfx("orb", progress.muted);
      setProgress((prev) => recordOrbCollected(prev, orbId).nextState);
      speakMandarin(orb.phrase, {
        muted: progress.muted,
        rate: progress.speechRate,
        naturalTts: progress.naturalTtsEnabled,
      });
      showToast(
        `Bola Aksara Terkumpul: ${orb.phrase} (${orb.pinyin})`,
        `"${orb.meaning}" · +${orb.xpReward} XP`,
      );
    },
    [progress.muted, progress.speechRate, progress.naturalTtsEnabled, showToast],
  );

  const handleMarkPembukaDone = (chapterId: string) => {
    playSfx("click", progress.muted);
    setProgress((prev) => {
      const cp = prev.chapters[chapterId] ?? createEmptyChapterProgress();
      return {
        ...prev,
        chapters: {
          ...prev.chapters,
          [chapterId]: { ...cp, pembukaDone: true },
        },
      };
    });
  };

  const handleMarkPenjelasanDone = (chapterId: string) => {
    playSfx("click", progress.muted);
    setProgress((prev) => {
      const cp = prev.chapters[chapterId] ?? createEmptyChapterProgress();
      return {
        ...prev,
        chapters: {
          ...prev.chapters,
          [chapterId]: { ...cp, penjelasanDone: true },
        },
      };
    });
  };

  const handleRecordPracticeOutcome = (
    chapterId: string,
    taskId: string,
    conceptTag: string,
    topic: string,
    isCorrect: boolean,
    hintLevel: number,
  ) => {
    playSfx(isCorrect ? "correct" : "wrong", progress.muted);
    setProgress((prev) =>
      recordPracticeOutcome(prev, {
        questionId: taskId,
        chapterId,
        conceptTag,
        topic,
        isCorrect,
        hintLevel,
      }).nextState,
    );
  };

  const handleRecordQuizOutcome = (
    chapterId: string,
    questionId: string,
    conceptTag: string,
    topic: string,
    isCorrect: boolean,
    hintLevel: number,
  ) => {
    playSfx(isCorrect ? "correct" : "wrong", progress.muted);
    setProgress((prev) =>
      recordChapterQuizOutcome(prev, {
        questionId,
        chapterId,
        conceptTag,
        topic,
        isCorrect,
        hintLevel,
      }).nextState,
    );
  };

  const handleRecordBossStep = (
    chapterId: string,
    stepId: string,
    isCorrect: boolean,
    isLastStep: boolean,
  ) => {
    const ch = MATERI.chapters.find((c) => c.id === chapterId)!;
    const prevCp = progress.chapters[chapterId] ?? createEmptyChapterProgress();
    const wasAlreadyMastered = isBossMastered(prevCp, ch);
    const previewResults = { ...(prevCp.bossResults ?? {}), [stepId]: isCorrect };
    const willMaster =
      isQuizMastered(prevCp, ch) &&
      isCorrect &&
      ch.boss.steps.every((s) => previewResults[s.id] === true);

    playSfx(!wasAlreadyMastered && willMaster ? "victory" : isCorrect ? "correct" : "wrong", progress.muted);

    setProgress((prev) => {
      const cp = prev.chapters[chapterId] ?? createEmptyChapterProgress();
      if (!isQuizMastered(cp, ch)) return prev;
      const wasMasteredBefore = isBossMastered(cp, ch);
      const nextBossResults = { ...(cp.bossResults ?? {}), [stepId]: isCorrect };
      const nextSteps =
        isCorrect && !cp.bossStepDoneIds.includes(stepId)
          ? [...cp.bossStepDoneIds, stepId]
          : cp.bossStepDoneIds;
      const allCorrect = ch.boss.steps.every((s) => nextBossResults[s.id] === true);
      const bossCompleted = cp.bossCompleted || allCorrect;
      const nextCp = {
        ...cp,
        bossStepDoneIds: nextSteps,
        bossResults: nextBossResults,
        bossCompleted,
      };
      nextCp.stars = computeChapterStars(nextCp, ch);
      const mastered = isBossMastered(nextCp, ch);
      const badges =
        mastered && !prev.badges.includes(ch.badgeName)
          ? [...prev.badges, ch.badgeName]
          : prev.badges;
      const alreadySolved = cp.bossResults?.[stepId] === true;
      const xpGain = isCorrect && !alreadySolved ? 35 : 0;

      if (mastered && !wasMasteredBefore) {
        setVictoryInfo({
          chapterId,
          stars: nextCp.stars,
          quizCorrect: getQuizCorrectCount(nextCp, ch),
          quizTotal: ch.kuis.length,
          xpEarned: xpGain || 35,
        });
      }

      return {
        ...prev,
        xp: prev.xp + xpGain,
        badges,
        chapters: {
          ...prev.chapters,
          [chapterId]: nextCp,
        },
      };
    });
  };

  const handleResolveReviewOutcome = (
    q: QuizQuestion,
    isCorrect: boolean,
    hintLevel: number,
  ) => {
    playSfx(isCorrect ? "correct" : "wrong", progress.muted);
    setProgress((prev) => {
      const { nextState } = recordQuizOutcome(prev, {
        questionId: q.id,
        chapterId: q.chapterId,
        conceptTag: q.conceptTag,
        topic: q.topic,
        isCorrect,
        hintLevel,
      });
      const chapter = MATERI.chapters.find((ch) => ch.id === q.chapterId);
      if (!chapter || !chapter.kuis.some((quiz) => quiz.id === q.id)) return nextState;
      const cp = nextState.chapters[q.chapterId] ?? createEmptyChapterProgress();
      const nextCp = {
        ...cp,
        kuisResults: { ...cp.kuisResults, [q.id]: isCorrect },
      };
      nextCp.stars = computeChapterStars(nextCp, chapter);
      return {
        ...nextState,
        chapters: { ...nextState.chapters, [q.chapterId]: nextCp },
      };
    });
  };

  const handleFlashcardReview = (vocabId: string, knewIt: boolean) => {
    playSfx(knewIt ? "correct" : "click", progress.muted);
    setProgress((prev) => recordFlashcardReview(prev, vocabId, knewIt).nextState);
  };

  const handleHanziPractice = (hanziChar: string) => {
    playSfx("correct", progress.muted);
    setProgress((prev) => recordHanziPractice(prev, hanziChar).nextState);
  };

  const handleToneDrillSolved = (isCorrect: boolean) => {
    playSfx(isCorrect ? "correct" : "wrong", progress.muted);
    setProgress((prev) => recordToneDrillSolved(prev, isCorrect).nextState);
  };

  const handleClaimDailyQuest = (questId: string) => {
    const qInfo = getDailyQuests(progress).find((q) => q.id === questId);
    if (!qInfo?.completed || qInfo.claimed) return;
    playSfx("achievement", progress.muted);
    setProgress((prev) => claimDailyQuestBonus(prev, questId).nextState);
    showToast(`Target Harian Selesai: ${qInfo.title}`, `Bonus +${qInfo.rewardXp} XP masuk ke akunmu`);
  };

  const victoryChapter = victoryInfo
    ? MATERI.chapters.find((c) => c.id === victoryInfo.chapterId) ?? null
    : null;
  const nextAfterVictory =
    victoryChapter &&
    MATERI.chapters.find((c) => c.order === victoryChapter.order + 1);

  const totalStarsEarned = useMemo(
    () => Object.values(chapterStarsMap).reduce((sum, s) => sum + s, 0),
    [chapterStarsMap],
  );

  const handleTelemetryTick = useCallback(
    (t: SceneTelemetry) => {
      mpClientRef.current?.updateLocalState({
        x: t.playerX,
        y: t.playerY,
        z: t.playerZ,
        yaw: t.playerYaw,
        isSprinting: t.isSprinting,
        activeChapterId: progress.activeChapterId,
        xp: progress.xp,
        starsTotal: totalStarsEarned,
      });
    },
    [progress.activeChapterId, progress.xp, totalStarsEarned],
  );

  const graduationSummary = useMemo(
    () => computeGraduationEligibility(progress, MATERI),
    [progress],
  );

  const anyModalOpen = Boolean(openChapterModalId || studyToolsTab || voiceLabOpen || mpOpen);

  return (
    <main className="relative h-[100dvh] w-screen overflow-hidden bg-sky-100 dark:bg-slate-950">
      {/* Persistent Full-Viewport 3D Campus World */}
      <CampusScene3D
        gameState={victoryInfo ? "gameover" : gameState}
        theme={progress.theme}
        chapters={MATERI.chapters}
        activeChapterId={progress.activeChapterId}
        chapterStars={chapterStarsMap}
        orbs={CAMPUS_ORBS}
        collectedOrbIds={progress.collectedOrbIds}
        localJacketHex={mpProfile.colorHex}
        localGender={mpProfile.gender}
        localAppearance={mpProfile.appearance}
        onScooter={onScooter}
        remotePlayersRef={remotePlayersRef}
        ballStateRef={ballStateRef}
        localSocialBurst={localSocialBurst}
        walkToTargetRef={walkToTargetRef}
        onCollectOrb={handleCollectOrb}
        onSelectChapter={handleOpenChapter}
        onSelectBuilding={handleInteractBuilding}
        onInsideBuildingChange={setInsideBuilding}
        onNearbyPropChange={setNearbyProp}
        minigame={mpMiniGame}
        mpSelfId={mpSelfId}
        onStepSound={() => playSfx("step", progress.muted)}
        virtualMoveRef={virtualMoveRef}
        virtualSprintRef={virtualSprintRef}
        jumpTriggerRef={jumpTriggerRef}
        cameraPreset={cameraPreset}
        cameraZoomDeltaRef={cameraZoomDeltaRef}
        cameraResetTriggerRef={cameraResetTriggerRef}
        telemetryRef={telemetryRef}
        onTelemetryTick={handleTelemetryTick}
        onNearbyChapterChange={setNearbyChapterId}
        controlsDisabled={anyModalOpen}
        graduationMode={graduationMode}
        graduationCelebrateNonce={graduationCelebrateNonce}
      />

      {/* Floating Discovery / Daily Quest Toast Banner */}
      {toast && (
        <div
          data-testid="campus-toast"
          className={`animate-toast-pop pointer-events-auto fixed left-1/2 z-40 flex max-w-[calc(100vw-20px)] -translate-x-1/2 items-center gap-3 rounded-xl border border-amber-400 bg-slate-900 px-3.5 py-2 text-white shadow-xl sm:px-4 sm:py-2.5 ${
            mpMiniGame ? "top-32 sm:top-[114px]" : "top-16"
          }`}
        >
          <Sparkles className="h-4 w-4 shrink-0 text-amber-400" />
          <div className="min-w-0">
            <div className="truncate text-xs font-extrabold text-amber-300">{toast.title}</div>
            <div className="truncate text-[11px] font-medium text-slate-200">{toast.subtitle}</div>
          </div>
          <button
            type="button"
            onClick={() => setToast(null)}
            aria-label="Tutup pemberitahuan"
            className="ml-1 rounded p-1 text-slate-400 hover:text-white"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Title Screen */}
      {gameState === "title" && (
        <TitleOverlay
          hasSavedProgress={hasSavedProgress}
          xp={progress.xp}
          completedChaptersCount={completedChaptersCount}
          collectedOrbsCount={progress.collectedOrbIds.length}
          totalOrbsCount={CAMPUS_ORBS.length}
          selectedGender={mpProfile.gender}
          selectedColorHex={mpProfile.colorHex}
          selectedAppearance={mpProfile.appearance}
          onSelectGender={handleSelectGender}
          onSelectAppearance={handleSelectAppearance}
          onSelectColor={handleSelectColor}
          onStart={startGame}
          onOpenCurriculumInfo={() => {
            startGame();
            setStudyToolsTab("profil");
          }}
        />
      )}

      {/* Active Playing HUD */}
      {gameState !== "title" && !graduationMode && (
        <GameHud
          state={progress}
          chapters={MATERI.chapters}
          nearbyChapterId={nearbyChapterId}
          insideBuilding={insideBuilding}
          nearbyProp={nearbyProp}
          onInteractProp={handleInteractProp}
          onScooter={onScooter}
          onToggleScooter={handleToggleScooter}
          avatarGender={mpProfile.gender}
          avatarStyleLabel={getAvatarStyle(mpProfile.appearance.styleId).label}
          onOpenCharacterCustomization={() => {
            setMpInitialTab("room");
            setMpOpen(true);
          }}
          onToggleAvatarGender={() =>
            handleSelectGender(mpProfile.gender === "girl" ? "boy" : "girl")
          }
          virtualMoveRef={virtualMoveRef}
          virtualSprintRef={virtualSprintRef}
          jumpTriggerRef={jumpTriggerRef}
          cameraPreset={cameraPreset}
          onCycleCameraPreset={() => {
            playSfx("click", progress.muted);
            setCameraPreset((p) => getNextCameraPreset(p));
          }}
          onResetCamera={() => {
            playSfx("click", progress.muted);
            cameraResetTriggerRef.current += 1;
          }}
          onZoomCamera={(delta) => {
            cameraZoomDeltaRef.current += delta;
          }}
          telemetryRef={telemetryRef}
          remotePlayersRef={remotePlayersRef}
          mpStatus={mpStatus}
          mpOnlineCount={mpStatus === "connected" ? mpPlayers.length + 1 : 0}
          mpSelfId={mpSelfId}
          minigame={mpMiniGame}
          onSelectChapter={handleOpenChapter}
          onInteractBuilding={handleInteractBuilding}
          onWalkToPoint={(x, z) => {
            playSfx("click", progress.muted);
            walkToTargetRef.current = { x, z, nonce: Date.now() };
          }}
          onEnterNearbyChapter={(id) => handleOpenChapter(id, true)}
          onCatchHider={() => {
            mpClientRef.current?.sendMiniGameAction("catch");
          }}
          onPassBomb={() => {
            mpClientRef.current?.sendMiniGameAction("pass_bomb");
          }}
          onAnswerQuiz={(optionIdx) => {
            mpClientRef.current?.sendMiniGameAction("answer_quiz", { optionIdx });
          }}
          onStopMiniGame={() => {
            mpClientRef.current?.sendMiniGameAction("stop");
          }}
          onOpenMiniGamesLobby={() => {
            setMpInitialTab("games");
            setMpOpen(true);
          }}
          onSendSocialEmote={handleSendSocialEmote}
          onOpenActiveMission={() => handleOpenChapter(progress.activeChapterId, true)}
          onChangeMode={(mode: GameMode) =>
            setProgress((prev) => ({ ...prev, mode }))
          }
          onToggleMute={() =>
            setProgress((prev) => ({ ...prev, muted: !prev.muted }))
          }
          onToggleBgm={() =>
            setProgress((prev) => ({ ...prev, bgmEnabled: !prev.bgmEnabled }))
          }
          onToggleTheme={() =>
            setProgress((prev) => ({
              ...prev,
              theme: prev.theme === "dark" ? "light" : "dark",
            }))
          }
          onOpenVoiceLab={() => setVoiceLabOpen(true)}
          onOpenStudyTools={(tab = "lemah") => setStudyToolsTab(tab)}
          onOpenMultiplayer={() => {
            setMpInitialTab("chat");
            setMpOpen(true);
          }}
          onOpenGraduation={openGraduationScene}
          isGraduationEligible={graduationSummary.isEligible}
          onPause={() => setGameState("paused")}
          dockCollapsed={dockCollapsed}
          onToggleDock={() => setDockCollapsed((c) => !c)}
        />
      )}

      {/* 3D Graduation Ceremony Overlay */}
      {gameState !== "title" && graduationMode && (
        <GraduationOverlay
          studentName={mpProfile.name || "Rafi"}
          xp={progress.xp}
          summary={graduationSummary}
          muted={progress.muted}
          bgmEnabled={progress.bgmEnabled}
          speechRate={progress.speechRate}
          naturalTtsEnabled={progress.naturalTtsEnabled}
          onToggleBgm={() =>
            setProgress((prev) => ({ ...prev, bgmEnabled: !prev.bgmEnabled }))
          }
          onCelebrate={() => {
            setGraduationCelebrateNonce((n) => n + 1);
            playSfx("graduation", progress.muted);
          }}
          onExit={() => {
            playSfx("click", progress.muted);
            setGraduationMode(false);
          }}
        />
      )}

      {/* 5-Stage Chapter Mission Modal */}
      {openChapterModalId && (
        <ChapterModal
          chapter={activeChapterObj}
          allChapters={MATERI.chapters}
          state={progress}
          initialStage={chapterModalStage}
          onClose={() => setOpenChapterModalId(null)}
          onMarkPembukaDone={handleMarkPembukaDone}
          onMarkPenjelasanDone={handleMarkPenjelasanDone}
          onRecordPracticeOutcome={handleRecordPracticeOutcome}
          onRecordQuizOutcome={handleRecordQuizOutcome}
          onRecordBossStep={handleRecordBossStep}
          onChangeSpeechRate={(rate) =>
            setProgress((prev) => ({ ...prev, speechRate: rate }))
          }
          onRecoverEnergy={() => {
            playSfx("correct", progress.muted);
            setProgress((prev) => recoverEnergyFromBreak(prev, 2));
          }}
          onAwardDynamicXp={(amount) => {
            const reward = recordDynamicPracticeXp(progress, amount);
            setProgress((prev) => recordDynamicPracticeXp(prev, amount).nextState);
            return reward.xpGained;
          }}
          onResolveReviewOutcome={handleResolveReviewOutcome}
        />
      )}

      {/* Study Tools Drawer: Weak Spots, Studio, Glossary, 15-Q Exam, Passport & Curriculum */}
      {studyToolsTab && (
        <StudyToolsDrawer
          initialTab={studyToolsTab}
          materi={MATERI}
          state={progress}
          onClose={() => setStudyToolsTab(null)}
          onResolveReviewOutcome={handleResolveReviewOutcome}
          onJumpToChapter={(chapterId) => {
            setStudyToolsTab(null);
            handleOpenChapter(chapterId, true);
          }}
          onSaveExamScore={(scorePct) =>
            setProgress((prev) => ({
              ...prev,
              lastExamScore: scorePct,
              bestExamScore: Math.max(prev.bestExamScore ?? 0, scorePct),
            }))
          }
          onFlashcardReview={handleFlashcardReview}
          onHanziPractice={handleHanziPractice}
          onToneDrillSolved={handleToneDrillSolved}
          onClaimDailyQuest={handleClaimDailyQuest}
          onToggleNaturalTts={() =>
            setProgress((prev) => ({
              ...prev,
              naturalTtsEnabled: !prev.naturalTtsEnabled,
            }))
          }
          onToggleBgm={() =>
            setProgress((prev) => ({
              ...prev,
              bgmEnabled: !prev.bgmEnabled,
            }))
          }
          onOpenGraduation={openGraduationScene}
          onResetProgress={() => {
            const fresh = clearProgressState();
            setProgress(fresh);
            setVictoryInfo(null);
          }}
        />
      )}

      {/* Gemini 3.8 Live Real-Time Voice Conversation */}
      {voiceLabOpen && (
        <LiveVoiceLab
          chapters={MATERI.chapters}
          initialChapterId={progress.activeChapterId}
          naturalTtsEnabled={progress.naturalTtsEnabled}
          voiceRewardsRemaining={Math.max(
            0,
            MAX_DAILY_VOICE_REWARD_TURNS - progress.dailyStats.voiceTurns,
          )}
          onClose={() => setVoiceLabOpen(false)}
          onTurnAwardXp={() =>
            setProgress((prev) => recordLiveVoiceTurn(prev).nextState)
          }
        />
      )}

      {/* Open-World Multiplayer Lobby, Mini-Games & Mandarin Chat Drawer */}
      <MultiplayerDrawer
        isOpen={mpOpen}
        initialTab={mpInitialTab}
        enabled={mpEnabled}
        status={mpStatus}
        selfId={mpSelfId}
        profile={mpProfile}
        remotePlayers={mpPlayers}
        chats={mpChats}
        minigame={mpMiniGame}
        chapters={MATERI.chapters}
        muted={progress.muted}
        naturalTtsEnabled={progress.naturalTtsEnabled}
        speechRate={progress.speechRate}
        onClose={() => setMpOpen(false)}
        onToggleEnabled={(next) => {
          playSfx("click", progress.muted);
          setMpEnabled(next);
        }}
        onSaveProfile={(nextProfile) => {
          setMpProfile(nextProfile);
          saveMultiplayerProfile(nextProfile);
          mpClientRef.current?.updateProfile(nextProfile);
          showToast("Profil Kampus Diperbarui", `${nextProfile.name} · Ruang ${nextProfile.roomId}`);
        }}
        onSendSocialEmote={handleSendSocialEmote}
        onSendChat={(text, pinyin, emoteOnly, studyCard?: ChatStudyCard) => {
          const ok = mpClientRef.current?.sendChat(text, pinyin, emoteOnly, studyCard) ?? false;
          if (ok) playSfx("click", progress.muted);
          return ok;
        }}
        onSolveStudyCard={(entryId, isCorrect) => {
          playSfx(isCorrect ? "correct" : "wrong", progress.muted);
          if (isCorrect && !solvedStudyCardIdsRef.current.has(entryId)) {
            solvedStudyCardIdsRef.current.add(entryId);
            setProgress((prev) => ({
              ...prev,
              xp: prev.xp + 8,
              dailyStats: {
                ...prev.dailyStats,
                quizzesSolved: prev.dailyStats.quizzesSolved + 1,
              },
            }));
            showToast("Kartu Kuis Terjawab Benar!", "+8 XP ditambahkan ke progres belajarmu");
          }
        }}
        onWalkToPlayer={(rp) => {
          walkToTargetRef.current = { x: rp.x, z: rp.z + 1.8, nonce: Date.now() };
          showToast(`Berjalan Menuju ${rp.name}`, "Karaktermu bergerak menghampiri teman online");
        }}
        onStartMiniGame={(kind: MiniGameKind, chapterFilter?: string) => {
          playSfx("click", progress.muted);
          if (!mpEnabled || mpStatus !== "connected") {
            pendingMiniGameRef.current = { kind, chapterFilter };
            setMpEnabled(true);
            return;
          }
          mpClientRef.current?.startMiniGame(kind, chapterFilter);
        }}
        onStopMiniGame={() => {
          playSfx("click", progress.muted);
          mpClientRef.current?.sendMiniGameAction("stop");
        }}
      />

      {/* Pause Modal */}
      {gameState === "paused" && !victoryInfo && (
        <PauseModal
          onResume={() => setGameState("playing")}
          onOpenActiveChapter={() => {
            setGameState("playing");
            handleOpenChapter(progress.activeChapterId, true);
          }}
          onReturnTitle={() => {
            setOpenChapterModalId(null);
            setStudyToolsTab(null);
            setVoiceLabOpen(false);
            setMpOpen(false);
            setGameState("title");
          }}
        />
      )}

      {/* Chapter Victory Modal */}
      {victoryInfo && victoryChapter && !openChapterModalId && (
        <VictoryModal
          chapter={victoryChapter}
          stars={victoryInfo.stars}
          quizCorrect={victoryInfo.quizCorrect}
          quizTotal={victoryInfo.quizTotal}
          xpEarned={victoryInfo.xpEarned}
          hasNextChapter={Boolean(nextAfterVictory)}
          canGraduate={graduationSummary.isEligible}
          onOpenGraduation={openGraduationScene}
          onContinueCampus={() => setVictoryInfo(null)}
          onNextChapter={() => {
            setVictoryInfo(null);
            if (nextAfterVictory) {
              handleOpenChapter(nextAfterVictory.id, true);
            }
          }}
        />
      )}
    </main>
  );
}
