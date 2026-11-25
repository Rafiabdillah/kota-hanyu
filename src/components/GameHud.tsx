import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Volume2,
  VolumeX,
  Sun,
  Moon,
  Mic,
  BookMarked,
  Pause,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  Sparkles,
  Play,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  MessageCircle,
  Trophy,
  PenTool,
  Zap,
  Users,
  Camera,
  ZoomIn,
  ZoomOut,
  Crosshair,
  Map as MapIcon,
  Menu,
  X,
  GraduationCap,
  Music,
  DoorOpen,
  Gamepad2,
  Hand,
  EyeOff,
  Bomb,
  Coins,
  Crown,
  Flag,
  Smile,
  Search,
} from "lucide-react";
import type { ChapterData, GameMode } from "../data/types";
import { speakMandarin } from "../game/audio";
import {
  CAMPUS_ORBS,
  getDailyQuests,
  getLevelProgress,
  MAX_ENERGY,
  type PlayerProgressState,
} from "../game/engine";
import { CAMERA_PRESETS, minimapPxToWorld, type CameraPreset } from "../game/cameraMath";
import {
  SOCIAL_EMOTES,
  type AvatarGender,
  type MiniGameSnapshot,
  type RemotePlayerSnapshot,
  type SocialEmoteKind,
} from "../game/multiplayer";
import type { MultiplayerStatus } from "../game/multiplayerClient";
import {
  CAMPUS_FACILITIES,
  FLOOR_2_Y,
  FLOOR_3_Y,
  SOCCER_FIELD_CENTER,
  WORLD_BOUNDS,
  WORLD_INTERACTIVE_PROPS,
  WORLD_JUMP_PADS,
  type InteractivePropDef,
  type OpenWorldBuildingDef,
} from "../game/worldLayout";
import type { SceneTelemetry } from "./CampusScene3D";
import type { StudyToolsTabId } from "./StudyToolsDrawer";

interface GameHudProps {
  state: PlayerProgressState;
  chapters: ChapterData[];
  nearbyChapterId?: string | null;
  insideBuilding?: OpenWorldBuildingDef | null;
  nearbyProp?: InteractivePropDef | null;
  onInteractProp?: (prop: InteractivePropDef) => void;
  onScooter?: boolean;
  onToggleScooter?: () => void;
  avatarGender?: AvatarGender;
  avatarStyleLabel?: string;
  onToggleAvatarGender?: () => void;
  onOpenCharacterCustomization?: () => void;
  virtualMoveRef?: React.MutableRefObject<{ x: number; z: number }>;
  virtualSprintRef?: React.MutableRefObject<boolean>;
  jumpTriggerRef?: React.MutableRefObject<number>;
  cameraPreset?: CameraPreset;
  onCycleCameraPreset?: () => void;
  onResetCamera?: () => void;
  onZoomCamera?: (delta: number) => void;
  telemetryRef?: React.MutableRefObject<SceneTelemetry>;
  remotePlayersRef?: React.MutableRefObject<Map<string, RemotePlayerSnapshot>>;
  mpStatus?: MultiplayerStatus;
  mpOnlineCount?: number;
  mpSelfId?: string | null;
  minigame?: MiniGameSnapshot | null;
  onSelectChapter: (chapterId: string, openModal: boolean) => void;
  onInteractBuilding?: (building: OpenWorldBuildingDef) => void;
  onWalkToPoint?: (x: number, z: number) => void;
  onEnterNearbyChapter?: (chapterId: string) => void;
  onCatchHider?: () => void;
  onPassBomb?: () => void;
  onAnswerQuiz?: (optionIdx: number) => void;
  onStopMiniGame?: () => void;
  onOpenMiniGamesLobby?: () => void;
  onSendSocialEmote?: (kind: SocialEmoteKind) => void;
  onOpenActiveMission: () => void;
  onChangeMode: (mode: GameMode) => void;
  onToggleMute: () => void;
  onToggleBgm?: () => void;
  onToggleTheme: () => void;
  onOpenVoiceLab: () => void;
  onOpenStudyTools: (tab?: StudyToolsTabId) => void;
  onOpenMultiplayer?: () => void;
  onOpenGraduation?: () => void;
  isGraduationEligible?: boolean;
  onPause: () => void;
  dockCollapsed: boolean;
  onToggleDock: () => void;
}

export const GameHud: React.FC<GameHudProps> = ({
  state,
  chapters,
  nearbyChapterId,
  insideBuilding = null,
  nearbyProp = null,
  onInteractProp,
  onScooter = false,
  onToggleScooter,
  avatarGender = "boy",
  avatarStyleLabel,
  onToggleAvatarGender,
  onOpenCharacterCustomization,
  virtualMoveRef,
  virtualSprintRef,
  jumpTriggerRef,
  cameraPreset = "normal",
  onCycleCameraPreset,
  onResetCamera,
  onZoomCamera,
  telemetryRef,
  remotePlayersRef,
  mpStatus = "disconnected",
  mpOnlineCount = 0,
  mpSelfId = null,
  minigame = null,
  onSelectChapter,
  onInteractBuilding,
  onWalkToPoint,
  onEnterNearbyChapter,
  onCatchHider,
  onPassBomb,
  onAnswerQuiz,
  onStopMiniGame,
  onOpenMiniGamesLobby,
  onSendSocialEmote,
  onOpenActiveMission,
  onChangeMode,
  onToggleMute,
  onToggleBgm,
  onToggleTheme,
  onOpenVoiceLab,
  onOpenStudyTools,
  onOpenMultiplayer,
  onOpenGraduation,
  isGraduationEligible = false,
  onPause,
  dockCollapsed,
  onToggleDock,
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const [emoteOpen, setEmoteOpen] = useState(false);
  const [pickedQuizChoice, setPickedQuizChoice] = useState<{ qId: string; idx: number } | null>(null);
  const [mobileSprinting, setMobileSprinting] = useState(false);
  const [joyOffset, setJoyOffset] = useState({ x: 0, y: 0 });
  const joyActivePointerRef = useRef<number | null>(null);
  const minimapCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const topRightClusterRef = useRef<HTMLDivElement | null>(null);
  const bottomBarRef = useRef<HTMLDivElement | null>(null);

  const lvlInfo = getLevelProgress(state.xp);
  const activeChapter = chapters.find((c) => c.id === state.activeChapterId) ?? chapters[0];
  const nearbyChapter = nearbyChapterId
    ? chapters.find((c) => c.id === nearbyChapterId) ?? null
    : null;
  const presetLabel = CAMERA_PRESETS[cameraPreset]?.label ?? "Normal";

  const unclaimedQuestCount = useMemo(
    () => getDailyQuests(state).filter((q) => q.completed && !q.claimed).length,
    [state],
  );
  const menuNoticeCount = state.reviewQueue.length + unclaimedQuestCount;

  // Close menu & emote popovers when clicking outside or pressing Escape
  useEffect(() => {
    if (!menuOpen && !emoteOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (menuOpen && topRightClusterRef.current && !topRightClusterRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
      if (emoteOpen && bottomBarRef.current && !bottomBarRef.current.contains(e.target as Node)) {
        setEmoteOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Escape") {
        setMenuOpen(false);
        setEmoteOpen(false);
      }
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen, emoteOpen]);

  const setVirtualMove = (x: number, z: number) => {
    if (virtualMoveRef) {
      virtualMoveRef.current = { x, z };
    }
  };

  const updateJoystickFromEvent = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const maxR = rect.width * 0.34;
    const dx = e.clientX - cx;
    const dy = e.clientY - cy;
    const dist = Math.hypot(dx, dy);
    const clampedDist = Math.min(maxR, dist);
    const angle = Math.atan2(dy, dx);
    const ox = dist > 2 ? Math.cos(angle) * clampedDist : 0;
    const oy = dist > 2 ? Math.sin(angle) * clampedDist : 0;
    setJoyOffset({ x: ox, y: oy });
    const nx = dist > 4 ? ox / maxR : 0;
    const ny = dist > 4 ? oy / maxR : 0;
    setVirtualMove(nx, ny);
  };

  const resetJoystick = () => {
    joyActivePointerRef.current = null;
    setJoyOffset({ x: 0, y: 0 });
    setVirtualMove(0, 0);
  };

  const toggleMobileSprint = () => {
    setMobileSprinting((prev) => {
      const next = !prev;
      if (virtualSprintRef) {
        virtualSprintRef.current = next;
      }
      return next;
    });
  };

  const triggerMobileJump = () => {
    if (jumpTriggerRef) {
      jumpTriggerRef.current += 1;
    }
  };

  // Live 2D Corner Open-World Minimap canvas (runs only when Peta popover is open)
  useEffect(() => {
    if (!mapOpen) return;
    const canvas = minimapCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let rafId = 0;
    let lastDraw = 0;

    // World bounds mapped into 128x128 from WORLD_BOUNDS (144 x 142)
    const size = 128;
    const spanX = WORLD_BOUNDS.maxX - WORLD_BOUNDS.minX;
    const spanZ = WORLD_BOUNDS.maxZ - WORLD_BOUNDS.minZ;
    const toMapX = (wx: number) => ((wx - WORLD_BOUNDS.minX) / spanX) * size;
    const toMapY = (wz: number) => ((wz - WORLD_BOUNDS.minZ) / spanZ) * size;

    const draw = (ts: number) => {
      rafId = requestAnimationFrame(draw);
      if (ts - lastDraw < 65) return;
      lastDraw = ts;

      const dark = state.theme === "dark";
      ctx.clearRect(0, 0, size, size);

      ctx.fillStyle = dark ? "#0f172a" : "#e8f2e6";
      ctx.fillRect(0, 0, size, size);

      // Expanded Open-World stone avenue grid
      ctx.strokeStyle = dark ? "#334155" : "#cbd5c0";
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      // Main North-South avenue & outer district spines
      ctx.moveTo(toMapX(0), toMapY(44));
      ctx.lineTo(toMapX(0), toMapY(-68));
      ctx.moveTo(toMapX(-46), toMapY(-40));
      ctx.lineTo(toMapX(-46), toMapY(20));
      ctx.moveTo(toMapX(46), toMapY(-40));
      ctx.lineTo(toMapX(46), toMapY(20));
      ctx.moveTo(toMapX(-56), toMapY(-46));
      ctx.lineTo(toMapX(-56), toMapY(26));
      ctx.moveTo(toMapX(56), toMapY(-46));
      ctx.lineTo(toMapX(56), toMapY(26));
      // Horizontal East-West avenues
      ctx.moveTo(toMapX(-58), toMapY(4));
      ctx.lineTo(toMapX(58), toMapY(4));
      ctx.moveTo(toMapX(-58), toMapY(-42));
      ctx.lineTo(toMapX(58), toMapY(-42));
      ctx.moveTo(toMapX(-48), toMapY(-60));
      ctx.lineTo(toMapX(48), toMapY(-60));
      ctx.moveTo(toMapX(-58), toMapY(22));
      ctx.lineTo(toMapX(58), toMapY(22));
      ctx.moveTo(toMapX(-36), toMapY(30));
      ctx.lineTo(toMapX(36), toMapY(30));
      ctx.stroke();

      // South Soccer Field
      const sfX = toMapX(SOCCER_FIELD_CENTER.x - 13);
      const sfY = toMapY(SOCCER_FIELD_CENTER.z - 6.3);
      const sfW = toMapX(SOCCER_FIELD_CENTER.x + 13) - sfX;
      const sfH = toMapY(SOCCER_FIELD_CENTER.z + 6.3) - sfY;
      ctx.fillStyle = dark ? "#14532d" : "#22c55e";
      ctx.fillRect(sfX, sfY, sfW, sfH);
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 0.8;
      ctx.strokeRect(sfX, sfY, sfW, sfH);

      // Lotus Pond
      ctx.fillStyle = dark ? "#0ea5e9" : "#38bdf8";
      ctx.beginPath();
      ctx.arc(toMapX(-14), toMapY(-16), 4.2, 0, Math.PI * 2);
      ctx.fill();

      // Jump Pads (Cyan dots)
      ctx.fillStyle = "#06b6d4";
      for (const jp of WORLD_JUMP_PADS) {
        ctx.beginPath();
        ctx.arc(toMapX(jp.x), toMapY(jp.z), 2.1, 0, Math.PI * 2);
        ctx.fill();
      }

      // Campus Orbs
      for (const orb of CAMPUS_ORBS) {
        if (state.collectedOrbIds.includes(orb.id)) continue;
        ctx.fillStyle = "#f59e0b";
        ctx.beginPath();
        ctx.arc(toMapX(orb.worldPos[0]), toMapY(orb.worldPos[2]), 2.2, 0, Math.PI * 2);
        ctx.fill();
      }

      // Active Mini-Game Markers (Orbs, Coins, Bombs, Parkour Checkpoint & Word Dash Target)
      if (minigame && minigame.phase !== "ended") {
        for (const mOrb of minigame.orbs) {
          ctx.fillStyle =
            mOrb.kind === "crown"
              ? "#facc15"
              : mOrb.kind === "gem"
                ? "#38bdf8"
                : minigame.kind === "hide_seek" || mOrb.kind === "bomb"
                  ? "#f43f5e"
                  : "#f59e0b";
          ctx.strokeStyle = "#ffffff";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(toMapX(mOrb.x), toMapY(mOrb.z), 3.1, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }
        if (minigame.wordPrompt) {
          ctx.strokeStyle = "#ef4444";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(
            toMapX(minigame.wordPrompt.targetX),
            toMapY(minigame.wordPrompt.targetZ),
            7.5,
            0,
            Math.PI * 2,
          );
          ctx.stroke();
        }
        if (minigame.kind === "parkour_race" && minigame.checkpoints) {
          const selfP = minigame.players.find((p) => p.id === mpSelfId);
          const cp = minigame.checkpoints[selfP?.checkpointIdx ?? 0];
          if (cp) {
            ctx.strokeStyle = "#06b6d4";
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(toMapX(cp.x), toMapY(cp.z), 6.5, 0, Math.PI * 2);
            ctx.stroke();
          }
        }
      }

      // Interactive Plaza Props (Pink dots)
      ctx.fillStyle = "#ec4899";
      for (const prop of WORLD_INTERACTIVE_PROPS) {
        ctx.beginPath();
        ctx.arc(toMapX(prop.x), toMapY(prop.z), 2.1, 0, Math.PI * 2);
        ctx.fill();
      }

      // All 17 Enterable Campus Facilities (Squares)
      for (const fac of CAMPUS_FACILITIES) {
        const fx = toMapX(fac.x);
        const fy = toMapY(fac.z);
        ctx.fillStyle = fac.accentHex;
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 1;
        ctx.fillRect(fx - 3.3, fy - 3.3, 6.6, 6.6);
        ctx.strokeRect(fx - 3.3, fy - 3.3, 6.6, 6.6);
      }

      // 7 Chapter Buildings (Numbered Circles)
      for (const ch of chapters) {
        const bx = toMapX(ch.worldPos[0]);
        const by = toMapY(ch.worldPos[2]);
        const isActive = ch.id === state.activeChapterId;
        const stars = state.chapters[ch.id]?.stars ?? 0;

        if (isActive) {
          ctx.strokeStyle = "#f59e0b";
          ctx.lineWidth = 1.8;
          ctx.beginPath();
          ctx.arc(bx, by, 6.8, 0, Math.PI * 2);
          ctx.stroke();
        }

        ctx.fillStyle = stars > 0 ? "#10b981" : ch.accentHex;
        ctx.beginPath();
        ctx.arc(bx, by, 4.6, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 7px 'Plus Jakarta Sans', sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(String(ch.order), bx, by + 0.4);
      }

      // Remote Players (Hidden if local player is Seeker in active PvP Petak Umpet)
      const hidePeersOnMap =
        minigame?.kind === "hide_seek" &&
        !minigame.soloMode &&
        minigame.phase !== "ended" &&
        minigame.seekerId === mpSelfId;

      if (!hidePeersOnMap && remotePlayersRef?.current) {
        for (const rp of remotePlayersRef.current.values()) {
          ctx.fillStyle = rp.colorHex;
          ctx.strokeStyle = "#ffffff";
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.arc(toMapX(rp.x), toMapY(rp.z), 3.3, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }
      }

      const px = telemetryRef?.current.playerX ?? 0;
      const pz = telemetryRef?.current.playerZ ?? 14;
      const yaw = telemetryRef?.current.playerYaw ?? Math.PI;
      const mx = toMapX(px);
      const my = toMapY(pz);

      ctx.save();
      ctx.translate(mx, my);
      ctx.rotate(Math.atan2(Math.sin(yaw), -Math.cos(yaw)));
      ctx.fillStyle = "rgba(37, 99, 235, 0.32)";
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-5.5, 11);
      ctx.lineTo(5.5, 11);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      ctx.fillStyle = "#2563eb";
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(mx, my, 3.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    };

    rafId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafId);
  }, [
    chapters,
    mapOpen,
    minigame,
    mpSelfId,
    remotePlayersRef,
    state.activeChapterId,
    state.chapters,
    state.collectedOrbIds,
    state.theme,
    telemetryRef,
  ]);

  const handleMinimapClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const size = 128;
    const clickX = ((e.clientX - rect.left) / rect.width) * size;
    const clickY = ((e.clientY - rect.top) / rect.height) * size;
    const spanX = WORLD_BOUNDS.maxX - WORLD_BOUNDS.minX;
    const spanZ = WORLD_BOUNDS.maxZ - WORLD_BOUNDS.minZ;
    const toMapX = (wx: number) => ((wx - WORLD_BOUNDS.minX) / spanX) * size;
    const toMapY = (wz: number) => ((wz - WORLD_BOUNDS.minZ) / spanZ) * size;

    let closestChapter: ChapterData | null = null;
    let minChapterDist = 11;
    for (const ch of chapters) {
      const d = Math.hypot(clickX - toMapX(ch.worldPos[0]), clickY - toMapY(ch.worldPos[2]));
      if (d < minChapterDist) {
        minChapterDist = d;
        closestChapter = ch;
      }
    }
    if (closestChapter) {
      onSelectChapter(closestChapter.id, false);
      return;
    }

    let closestFacility: OpenWorldBuildingDef | null = null;
    let minFacDist = 11;
    for (const fac of CAMPUS_FACILITIES) {
      const d = Math.hypot(clickX - toMapX(fac.x), clickY - toMapY(fac.z));
      if (d < minFacDist) {
        minFacDist = d;
        closestFacility = fac;
      }
    }
    if (closestFacility && onWalkToPoint) {
      onWalkToPoint(closestFacility.x, closestFacility.z + 3.8);
      return;
    }

    if (onWalkToPoint) {
      const worldPt = minimapPxToWorld(clickX, clickY, size);
      onWalkToPoint(worldPt.x, worldPt.z);
    }
  };

  return (
    <div className="pointer-events-none fixed inset-0 z-10 flex flex-col justify-between p-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] sm:p-4">
      <div className="flex flex-col items-stretch gap-1.5">
        {/* Slim Single-Row Top Edge: Essential Readout (Left) + Essential Actions (Right) */}
        <div className="flex flex-wrap items-start justify-between gap-2">
        {/* Top-Left Minimal Status Chip */}
        <div className="pointer-events-auto flex flex-col gap-1 rounded-xl border border-slate-300/85 bg-white/92 px-3 py-1.5 shadow-sm dark:border-slate-700/85 dark:bg-slate-900/92">
          <div className="flex items-center gap-2 whitespace-nowrap">
            <span className="font-mono-num text-xs font-bold text-blue-700 dark:text-blue-400">
              Lv.{lvlInfo.level}
            </span>
            <span className="text-slate-300 dark:text-slate-700" aria-hidden="true">
              ·
            </span>
            <span
              className="font-mono-num text-xs font-extrabold text-slate-900 dark:text-white sm:text-sm"
              data-testid="hud-xp"
            >
              {Math.round(state.xp)} XP
            </span>
            {state.consecutiveCorrect >= 2 && (
              <>
                <span className="text-slate-300 dark:text-slate-700" aria-hidden="true">
                  ·
                </span>
                <span className="font-mono-num text-xs font-extrabold text-amber-700 dark:text-amber-400">
                  {state.consecutiveCorrect}x
                </span>
              </>
            )}
            <span className="text-slate-300 dark:text-slate-700" aria-hidden="true">
              ·
            </span>
            <span
              className="inline-flex items-center gap-1"
              title={`Energi ${state.energy}/${MAX_ENERGY}`}
              aria-label={`Energi ${state.energy} dari ${MAX_ENERGY}`}
            >
              <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 shrink-0" aria-hidden="true">
                <polygon
                  points="8,1 14,5 12,14 4,14 2,5"
                  fill="#f59e0b"
                  stroke="#b45309"
                  strokeWidth="1.5"
                />
              </svg>
              <span className="font-mono-num text-xs font-bold text-slate-800 dark:text-slate-200">
                {state.energy}/{MAX_ENERGY}
              </span>
            </span>
          </div>
          <div className="h-0.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
            <div
              className="h-full rounded-full bg-blue-600 transition-all duration-300"
              style={{ width: `${Math.max(4, lvlInfo.pct)}%` }}
            />
          </div>
        </div>

        {/* Top-Right Compact 4-Button Cluster + Optional Popovers */}
        <div ref={topRightClusterRef} className="relative flex flex-col items-end gap-2">
          <div className="pointer-events-auto flex items-center gap-1 rounded-xl border border-slate-300/85 bg-white/92 p-1 shadow-sm dark:border-slate-700/85 dark:bg-slate-900/92">
            <button
              type="button"
              onClick={(e) => {
                e.currentTarget.blur();
                setMenuOpen(false);
                onOpenVoiceLab();
              }}
              aria-label="Buka Latihan Suara Live (V)"
              title="Suara Live Gemini [V]"
              className="inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg bg-emerald-700 px-2.5 text-xs font-bold text-white hover:bg-emerald-800 sm:px-3"
            >
              <Mic className="h-4 w-4" />
              <span className="hidden sm:inline">Suara Live</span>
            </button>

            {onOpenMultiplayer && (
              <button
                type="button"
                  data-testid="open-multiplayer-btn"
                onClick={(e) => {
                  e.currentTarget.blur();
                  setMenuOpen(false);
                  onOpenMultiplayer();
                }}
                aria-label="Buka Mode Open World Multiplayer (O)"
                title="Kampus Open World Multiplayer [O]"
                className={`inline-flex h-9 shrink-0 items-center gap-1 whitespace-nowrap rounded-lg border px-2 text-xs font-bold sm:px-2.5 ${
                  mpStatus === "connected"
                    ? "border-emerald-600 bg-emerald-50 text-emerald-900 dark:border-emerald-500 dark:bg-emerald-950/70 dark:text-emerald-200"
                    : "border-slate-300 bg-slate-50 text-slate-800 hover:border-blue-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                }`}
              >
                <Users className="h-4 w-4 text-emerald-700 dark:text-emerald-400" />
                <span className="hidden md:inline">Online</span>
                {mpStatus === "connected" && (
                  <span
                    data-testid="mp-online-badge"
                    className="font-mono-num inline-flex h-4 min-w-[16px] items-center justify-center rounded bg-emerald-700 px-1 text-[10px] font-extrabold text-white"
                  >
                    {mpOnlineCount}
                  </span>
                )}
              </button>
            )}

            <button
              type="button"
              data-testid="toggle-map-btn"
              onClick={(e) => {
                e.currentTarget.blur();
                setMenuOpen(false);
                setMapOpen((v) => !v);
              }}
              aria-label={mapOpen ? "Tutup Peta Mini & Kamera" : "Buka Peta Mini & Kamera"}
              title="Peta Mini & Kontrol Kamera"
              className={`inline-flex h-9 shrink-0 items-center gap-1 whitespace-nowrap rounded-lg border px-2 text-xs font-bold sm:px-2.5 ${
                mapOpen
                  ? "border-blue-700 bg-blue-700 text-white"
                  : "border-slate-300 bg-slate-50 text-slate-800 hover:border-blue-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              }`}
            >
              <MapIcon className="h-4 w-4" />
              <span className="hidden md:inline">Peta</span>
            </button>

            <button
              type="button"
              data-testid="hud-menu-btn"
              onClick={(e) => {
                e.currentTarget.blur();
                setMapOpen(false);
                setMenuOpen((v) => !v);
              }}
              aria-label="Buka Menu Kampus"
              aria-expanded={menuOpen}
              title="Menu Belajar, Pengaturan & Jeda"
              className={`inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border px-2.5 text-xs font-bold ${
                menuOpen
                  ? "border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900"
                  : "border-slate-300 bg-slate-50 text-slate-800 hover:border-blue-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              }`}
            >
              {menuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
              <span className="hidden sm:inline">Menu</span>
              {menuNoticeCount > 0 && !menuOpen && (
                <span className="font-mono-num inline-flex h-4 min-w-[16px] items-center justify-center rounded bg-amber-600 px-1 text-[10px] font-extrabold text-white">
                  {menuNoticeCount}
                </span>
              )}
            </button>
          </div>

          {/* On-Demand Minimap + Camera Controls Popover */}
          {mapOpen && (
            <div className="pointer-events-auto absolute right-0 top-12 z-20 flex flex-col items-center gap-1.5 rounded-xl border border-slate-300 bg-white/95 p-2 shadow-xl dark:border-slate-700 dark:bg-slate-900/95">
              <div className="flex w-full items-center justify-between text-[11px] font-bold text-slate-700 dark:text-slate-200">
                <span>Peta Kampus</span>
                <button
                  type="button"
                  onClick={() => setMapOpen(false)}
                  aria-label="Tutup Peta Mini"
                  className="rounded p-0.5 text-slate-500 hover:text-slate-900 dark:hover:text-white"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <canvas
                ref={minimapCanvasRef}
                width={128}
                height={128}
                data-testid="campus-minimap"
                onClick={handleMinimapClick}
                title="Klik gedung atau titik mana saja untuk berjalan"
                className="h-[128px] w-[128px] cursor-pointer rounded-lg border border-slate-200 dark:border-slate-800"
              />
              {onCycleCameraPreset && onResetCamera && onZoomCamera && (
                <div
                  data-testid="camera-controls"
                  className="flex w-full items-center justify-between gap-1 pt-0.5"
                >
                  <button
                    type="button"
                          onClick={(e) => {
                      e.currentTarget.blur();
                      onZoomCamera(-2.2);
                    }}
                    aria-label="Perdekat Kamera (+)"
                    title="Perdekat Kamera [+]"
                    className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-slate-100 text-slate-700 hover:bg-blue-50 hover:text-blue-700 dark:bg-slate-800 dark:text-slate-200"
                  >
                    <ZoomIn className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                          data-testid="camera-preset-btn"
                    onClick={(e) => {
                      e.currentTarget.blur();
                      onCycleCameraPreset();
                    }}
                    aria-label={`Sudut Kamera: ${presetLabel} (C)`}
                    title="Ganti Sudut Kamera [C]"
                    className="inline-flex h-7 flex-1 items-center justify-center gap-1 rounded-md bg-slate-100 px-1 text-[11px] font-bold text-slate-800 hover:bg-blue-50 hover:text-blue-700 dark:bg-slate-800 dark:text-slate-100"
                  >
                    <Camera className="h-3 w-3" />
                    <span>{presetLabel}</span>
                  </button>
                  <button
                    type="button"
                          onClick={(e) => {
                      e.currentTarget.blur();
                      onZoomCamera(2.2);
                    }}
                    aria-label="Perjauh Kamera (-)"
                    title="Perjauh Kamera [-]"
                    className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-slate-100 text-slate-700 hover:bg-blue-50 hover:text-blue-700 dark:bg-slate-800 dark:text-slate-200"
                  >
                    <ZoomOut className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                          data-testid="camera-reset-btn"
                    onClick={(e) => {
                      e.currentTarget.blur();
                      onResetCamera();
                    }}
                    aria-label="Reset Kamera ke Belakang Karakter (R)"
                    title="Reset Arah Kamera [R]"
                    className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-slate-100 text-slate-700 hover:bg-blue-50 hover:text-blue-700 dark:bg-slate-800 dark:text-slate-200"
                  >
                    <Crosshair className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Clean Collapsible Menu Popover (Secondary Features & Settings) */}
          {menuOpen && (
            <div
              data-testid="hud-menu-panel"
              className="pointer-events-auto absolute right-0 top-12 z-20 w-72 max-w-[calc(100vw-20px)] rounded-2xl border border-slate-300 bg-white/95 p-3 shadow-2xl dark:border-slate-700 dark:bg-slate-900/95"
            >
              {/* Compact Progress Summary */}
              <div className="mb-2.5 flex items-center justify-between border-b border-slate-200 pb-2 text-xs font-semibold text-slate-600 dark:border-slate-800 dark:text-slate-300">
                <span className="font-mono-num">Streak {state.streak}h</span>
                <span aria-hidden="true">·</span>
                <span className="font-mono-num text-amber-700 dark:text-amber-400">
                  Orb {state.collectedOrbIds.length}/{CAMPUS_ORBS.length}
                </span>
                <span aria-hidden="true">·</span>
                <span>{state.mode === "belajar" ? "Mode Belajar" : "Mode Tantangan"}</span>
              </div>

              {/* Study & Progression Actions */}
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  data-testid="open-studio-btn"
                  onClick={() => {
                    setMenuOpen(false);
                    onOpenStudyTools("studio");
                  }}
                  className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-2.5 text-xs font-bold text-slate-800 hover:border-blue-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                >
                  <PenTool className="h-3.5 w-3.5 shrink-0 text-blue-700 dark:text-blue-400" />
                  <span className="truncate">Studio</span>
                </button>

                <button
                  type="button"
                  data-testid="open-paspor-btn"
                  onClick={() => {
                    setMenuOpen(false);
                    onOpenStudyTools("paspor");
                  }}
                  className="inline-flex min-h-[38px] items-center justify-between gap-1 rounded-xl border border-slate-200 bg-slate-50 px-2.5 text-xs font-bold text-slate-800 hover:border-amber-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                >
                  <span className="inline-flex items-center gap-1.5 truncate">
                    <Trophy className="h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
                    Paspor
                  </span>
                  {unclaimedQuestCount > 0 && (
                    <span className="font-mono-num rounded bg-amber-600 px-1 text-[10px] text-white">
                      {unclaimedQuestCount}
                    </span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    onOpenStudyTools("ujian");
                  }}
                  className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-2.5 text-xs font-bold text-slate-800 hover:border-blue-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                >
                  <Sparkles className="h-3.5 w-3.5 shrink-0 text-indigo-600 dark:text-indigo-400" />
                  <span className="truncate">Siap Ujian</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    onOpenStudyTools("lemah");
                  }}
                  className="inline-flex min-h-[38px] items-center justify-between gap-1 rounded-xl border border-slate-200 bg-slate-50 px-2.5 text-xs font-bold text-slate-800 hover:border-blue-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                >
                  <span className="inline-flex items-center gap-1.5 truncate">
                    <BookMarked className="h-3.5 w-3.5 shrink-0" />
                    Alat &amp; Ulang
                  </span>
                  {state.reviewQueue.length > 0 && (
                    <span
                      data-testid="review-count-badge"
                      className="font-mono-num rounded bg-rose-600 px-1 text-[10px] text-white"
                    >
                      {state.reviewQueue.length}
                    </span>
                  )}
                </button>
              </div>

              {onOpenMiniGamesLobby && (
                <button
                  type="button"
                  data-testid="hud-menu-minigame-btn"
                  onClick={() => {
                    setMenuOpen(false);
                    onOpenMiniGamesLobby();
                  }}
                  className="mt-2 flex min-h-[38px] w-full items-center justify-between gap-2 rounded-xl border border-rose-300 bg-rose-50 px-3 text-xs font-extrabold text-rose-900 hover:bg-rose-100 dark:border-rose-800 dark:bg-rose-950/60 dark:text-rose-200"
                >
                  <span className="inline-flex items-center gap-1.5">
                    <Gamepad2 className="h-4 w-4 text-rose-600 dark:text-rose-400" />
                    Mini-Game Online (Petak Umpet)
                  </span>
                  <span className="text-[10px] font-bold text-rose-700 dark:text-rose-300">
                    Buka
                  </span>
                </button>
              )}

              {onOpenGraduation && (
                <button
                  type="button"
                  data-testid="open-graduation-btn"
                  onClick={() => {
                    setMenuOpen(false);
                    onOpenGraduation();
                  }}
                  className={`mt-2 flex min-h-[38px] w-full items-center justify-between gap-2 rounded-xl border px-3 text-xs font-extrabold ${
                    isGraduationEligible
                      ? "border-amber-500 bg-amber-50 text-amber-900 hover:bg-amber-100 dark:border-amber-600 dark:bg-amber-950/60 dark:text-amber-200"
                      : "border-slate-200 bg-slate-50 text-slate-800 hover:border-amber-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  }`}
                >
                  <span className="inline-flex items-center gap-1.5">
                    <GraduationCap className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                    Upacara Kelulusan
                  </span>
                  <span className="text-[10px] font-bold text-amber-700 dark:text-amber-400">
                    {isGraduationEligible ? "Siap Wisuda!" : "Pratinjau"}
                  </span>
                </button>
              )}

              {(onOpenCharacterCustomization || onToggleAvatarGender) && (
                <button
                  type="button"
                  data-testid="hud-toggle-gender-btn"
                  onClick={onOpenCharacterCustomization ?? onToggleAvatarGender}
                  className="mt-2 flex min-h-[38px] w-full items-center justify-between gap-2 rounded-xl border border-pink-200 bg-pink-50/70 px-3 text-xs font-extrabold text-pink-950 hover:bg-pink-100 dark:border-pink-800/70 dark:bg-pink-950/40 dark:text-pink-200"
                >
                  <span className="inline-flex items-center gap-1.5">
                    <Sparkles className="h-4 w-4 text-pink-600 dark:text-pink-400" />
                    Karakter: {avatarStyleLabel ?? (avatarGender === "girl" ? "Cewe Imut" : "Cowo Keren")}
                  </span>
                  <span className="text-[10px] font-bold text-pink-700 dark:text-pink-300">
                    Ganti
                  </span>
                </button>
              )}

              {/* Mode Switcher */}
              <div className="mt-2.5 border-t border-slate-200 pt-2.5 dark:border-slate-800">
                <div className="mb-1 flex items-center justify-between text-[11px] font-bold text-slate-600 dark:text-slate-400">
                  <span>Mode Latihan</span>
                  <span>
                    {state.mode === "belajar" ? "Hint & bebas energi" : "Timer & energi/salah"}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
                  <button
                    type="button"
                    onClick={() => onChangeMode("belajar")}
                    className={`min-h-[32px] rounded-md text-xs font-bold ${
                      state.mode === "belajar"
                        ? "bg-blue-700 text-white"
                        : "text-slate-700 hover:text-slate-900 dark:text-slate-300"
                    }`}
                  >
                    Belajar
                  </button>
                  <button
                    type="button"
                    onClick={() => onChangeMode("tantangan")}
                    className={`min-h-[32px] rounded-md text-xs font-bold ${
                      state.mode === "tantangan"
                        ? "bg-amber-600 text-white"
                        : "text-slate-700 hover:text-slate-900 dark:text-slate-300"
                    }`}
                  >
                    Tantangan
                  </button>
                </div>
              </div>

              {/* Quick Utilities: Mute, BGM, Theme, Pause */}
              <div className="mt-2.5 grid grid-cols-2 gap-1.5 border-t border-slate-200 pt-2.5 dark:border-slate-800">
                <button
                  type="button"
                  onClick={onToggleMute}
                  className="inline-flex min-h-[36px] items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2 text-xs font-semibold text-slate-800 hover:border-blue-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                >
                  {state.muted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
                  {state.muted ? "Bisu" : "Suara"}
                </button>
                {onToggleBgm && (
                  <button
                    type="button"
                    data-testid="hud-bgm-btn"
                    onClick={onToggleBgm}
                    className={`inline-flex min-h-[36px] items-center justify-center gap-1.5 rounded-lg border px-2 text-xs font-semibold ${
                      state.bgmEnabled
                        ? "border-emerald-300 bg-emerald-50 text-emerald-800 hover:border-emerald-500 dark:border-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300"
                        : "border-slate-200 bg-slate-50 text-slate-600 hover:border-blue-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                    }`}
                  >
                    <Music className="h-3.5 w-3.5" />
                    {state.bgmEnabled ? "Musik: ON" : "Musik: OFF"}
                  </button>
                )}
                <button
                  type="button"
                  onClick={onToggleTheme}
                  className="inline-flex min-h-[36px] items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2 text-xs font-semibold text-slate-800 hover:border-blue-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                >
                  {state.theme === "dark" ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
                  {state.theme === "dark" ? "Terang" : "Gelap"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    onPause();
                  }}
                  className="inline-flex min-h-[36px] items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2 text-xs font-semibold text-slate-800 hover:border-blue-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                >
                  <Pause className="h-3.5 w-3.5" />
                  Jeda
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Sleek Peripheral Online Mini-Game Bar (Top-Center, Zero Center Clutter) */}
      {minigame && (
        <div
          data-testid="minigame-hud"
          className="pointer-events-auto mx-auto flex max-w-[calc(100vw-20px)] flex-wrap items-center justify-center gap-2 rounded-xl border border-amber-400/80 bg-slate-900/95 px-3 py-1.5 text-xs text-white shadow-lg"
        >
          <span className="inline-flex items-center gap-1.5 font-extrabold text-amber-300">
            {minigame.kind === "quiz_battle" ? (
              <GraduationCap className="h-3.5 w-3.5 text-indigo-400" />
            ) : minigame.kind === "word_hunter" ? (
              <Search className="h-3.5 w-3.5 text-emerald-400" />
            ) : minigame.kind === "hide_seek" ? (
              <EyeOff className="h-3.5 w-3.5 text-rose-400" />
            ) : minigame.kind === "tag_bomb" ? (
              <Bomb className="h-3.5 w-3.5 text-orange-400" />
            ) : minigame.kind === "coin_party" ? (
              <Coins className="h-3.5 w-3.5 text-yellow-400" />
            ) : minigame.kind === "parkour_race" ? (
              <Flag className="h-3.5 w-3.5 text-cyan-400" />
            ) : (
              <Gamepad2 className="h-3.5 w-3.5 text-amber-400" />
            )}
            {minigame.kind === "quiz_battle"
              ? "Cerdas Cermat"
              : minigame.kind === "word_hunter"
                ? "Berburu Kata 3D"
                : minigame.kind === "hide_seek"
                  ? "Petak Umpet 3D"
                  : minigame.kind === "tag_bomb"
                    ? "Estafet Bom"
                    : minigame.kind === "coin_party"
                      ? "Pesta Koin"
                      : minigame.kind === "parkour_race"
                        ? "Balap Parkour"
                        : minigame.kind === "orb_rush"
                          ? "Bola Aksara"
                          : "Lari Kata"}
          </span>

          <span
            data-testid="minigame-timer"
            className="font-mono-num rounded bg-slate-800 px-1.5 py-0.5 font-extrabold text-emerald-300"
          >
            {minigame.secondsLeft}d
          </span>

          {minigame.kind === "quiz_battle" && minigame.phase === "active" && (
            <span className="rounded bg-indigo-700 px-2 py-0.5 text-[11px] font-extrabold text-white">
              Ronde {minigame.roundNumber}/{minigame.totalRounds ?? 6}
            </span>
          )}

          {minigame.kind === "word_hunter" && minigame.phase === "active" && minigame.wordHunterPrompt && (
            <span className="rounded bg-emerald-800 px-2 py-0.5 text-[11px] font-extrabold text-emerald-100">
              {minigame.wordHunterPrompt.chapterLabel}
            </span>
          )}

          {minigame.kind === "hide_seek" && !minigame.soloMode && minigame.phase !== "ended" && (
            <span
              data-testid="minigame-role-badge"
              className={`rounded px-2 py-0.5 text-[11px] font-extrabold ${
                minigame.seekerId === mpSelfId
                  ? "bg-rose-700 text-white"
                  : minigame.players.find((p) => p.id === mpSelfId)?.caught
                    ? "bg-slate-700 text-slate-300"
                    : "bg-emerald-700 text-white"
              }`}
            >
              {minigame.seekerId === mpSelfId
                ? minigame.phase === "countdown"
                  ? "Pencari · Tunggu!"
                  : "Pencari"
                : minigame.players.find((p) => p.id === mpSelfId)?.caught
                  ? "Tertangkap"
                  : "Bersembunyi"}
            </span>
          )}

          {minigame.kind === "tag_bomb" && !minigame.soloMode && minigame.phase === "active" && (
            <span
              className={`rounded px-2 py-0.5 text-[11px] font-extrabold ${
                minigame.bombHolderId === mpSelfId
                  ? "bg-rose-600 text-white"
                  : "bg-slate-800 text-amber-300"
              }`}
            >
              {minigame.bombHolderId === mpSelfId
                ? `Bawa Bom! (${minigame.bombFuseLeft ?? 0}d)`
                : `Bom: ${minigame.players.find((p) => p.id === minigame.bombHolderId)?.name ?? "-"} (${minigame.bombFuseLeft ?? 0}d)`}
            </span>
          )}

          {minigame.kind === "coin_party" && minigame.phase === "active" && minigame.crownHolderId && (
            <span className="inline-flex items-center gap-1 rounded bg-amber-600 px-2 py-0.5 text-[11px] font-extrabold text-white">
              <Crown className="h-3 w-3" />
              {minigame.crownHolderId === mpSelfId
                ? "Kamu Pegang Mahkota!"
                : `Raja: ${minigame.players.find((p) => p.id === minigame.crownHolderId)?.name ?? "-"}`}
            </span>
          )}

          {minigame.kind === "parkour_race" && minigame.phase === "active" && minigame.checkpoints && (
            <span className="rounded bg-cyan-800 px-2 py-0.5 text-[11px] font-extrabold text-cyan-100">
              Pos {Math.min(minigame.checkpoints.length, (minigame.players.find((p) => p.id === mpSelfId)?.checkpointIdx ?? 0) + 1)}/{minigame.checkpoints.length}
            </span>
          )}

          {minigame.wordPrompt && minigame.phase !== "ended" ? (
            <span className="inline-flex items-center gap-1.5 truncate font-bold text-slate-100">
              Ke:{" "}
              <span className="hanzi-text text-amber-300">{minigame.wordPrompt.hanzi}</span>{" "}
              <span className="text-slate-300">({minigame.wordPrompt.zoneName})</span>
              <button
                type="button"
                aria-label="Dengar Pengucapan"
                onClick={() =>
                  speakMandarin(minigame.wordPrompt!.hanzi, {
                    muted: state.muted,
                    rate: state.speechRate,
                    naturalTts: state.naturalTtsEnabled,
                  })
                }
                className="rounded bg-slate-800 p-1 text-amber-300 hover:bg-slate-700"
              >
                <Volume2 className="h-3 w-3" />
              </button>
            </span>
          ) : minigame.kind === "word_hunter" && minigame.wordHunterPrompt && minigame.phase !== "ended" ? (
            <span className="inline-flex items-center gap-1.5 truncate font-bold text-slate-100">
              <span className="max-w-[240px] truncate sm:max-w-sm">
                {minigame.wordHunterPrompt.clue}
              </span>
              <button
                type="button"
                aria-label="Dengar Petunjuk Mandarin"
                data-testid="word-hunter-audio-btn"
                onClick={() =>
                  speakMandarin(minigame.wordHunterPrompt!.audioText, {
                    muted: state.muted,
                    rate: state.speechRate,
                    naturalTts: state.naturalTtsEnabled,
                  })
                }
                className="inline-flex items-center gap-1 rounded bg-emerald-700 px-1.5 py-0.5 text-[10px] font-extrabold text-white hover:bg-emerald-600"
              >
                <Volume2 className="h-3 w-3" />
                Suara
              </button>
            </span>
          ) : minigame.winnerSummary ? (
            <span data-testid="minigame-winner" className="truncate font-bold text-emerald-300">
              {minigame.winnerSummary}
            </span>
          ) : minigame.lastHint ? (
            <span className="max-w-[260px] truncate text-[11px] text-slate-200 sm:max-w-xs">
              {minigame.lastHint}
            </span>
          ) : null}

          <span className="font-mono-num rounded bg-slate-800 px-1.5 py-0.5 text-[11px] font-bold text-amber-300">
            {minigame.players.find((p) => p.id === mpSelfId)?.score ?? 0} pt
          </span>

          {minigame.kind === "hide_seek" &&
            !minigame.soloMode &&
            minigame.phase === "active" &&
            minigame.seekerId === mpSelfId &&
            onCatchHider && (
              <button
                type="button"
                data-testid="minigame-catch-btn"
                onClick={onCatchHider}
                className="inline-flex items-center gap-1 rounded-lg bg-rose-600 px-2.5 py-1 text-[11px] font-extrabold text-white hover:bg-rose-500"
              >
                <Hand className="h-3.5 w-3.5" />
                Tangkap! [F]
              </button>
            )}

          {minigame.kind === "tag_bomb" &&
            !minigame.soloMode &&
            minigame.phase === "active" &&
            minigame.bombHolderId === mpSelfId &&
            onPassBomb && (
              <button
                type="button"
                data-testid="minigame-pass-bomb-btn"
                onClick={onPassBomb}
                className="inline-flex items-center gap-1 rounded-lg bg-orange-600 px-2.5 py-1 text-[11px] font-extrabold text-white hover:bg-orange-500"
              >
                <Bomb className="h-3.5 w-3.5" />
                Lempar! [F]
              </button>
            )}

          {onOpenMiniGamesLobby && (
            <button
              type="button"
              onClick={onOpenMiniGamesLobby}
              className="rounded-lg border border-slate-700 bg-slate-800 px-2 py-1 text-[11px] font-bold text-slate-200 hover:bg-slate-700"
            >
              Skor
            </button>
          )}

          {minigame.phase !== "ended" && onStopMiniGame && (
            <button
              type="button"
              onClick={onStopMiniGame}
              aria-label="Hentikan Mini-Game"
              className="rounded-lg bg-slate-800 p-1 text-slate-300 hover:bg-rose-700 hover:text-white"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
          </div>
        )}
      </div>

      {/* Live Cerdas Cermat Online Quiz Card (compact, responsive, non-blocking edges) */}
      {minigame?.kind === "quiz_battle" &&
        minigame.phase === "active" &&
        minigame.quizQuestion && (() => {
          const q = minigame.quizQuestion;
          const alreadyAnswered = Boolean(mpSelfId && q.answeredPlayerIds.includes(mpSelfId));
          const reveal = Boolean(q.revealActive);
          const localChoice = pickedQuizChoice?.qId === q.id ? pickedQuizChoice.idx : null;
          const catLabel =
            q.category === "mendengar"
              ? "Mendengar"
              : q.category === "tata_bahasa"
                ? "Tata Bahasa"
                : q.category === "kalimat"
                  ? "Kalimat"
                  : "Kosakata";
          return (
            <div
              data-testid="quiz-battle-card"
              className="pointer-events-auto mx-auto my-auto w-full max-w-lg rounded-2xl border border-indigo-300 bg-white/95 p-3.5 shadow-2xl dark:border-indigo-700 dark:bg-slate-900/95 sm:p-4"
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-extrabold">
                  <span className="rounded bg-indigo-700 px-2 py-0.5 text-white">
                    Ronde {minigame.roundNumber}/{minigame.totalRounds ?? 6}
                  </span>
                  <span className="rounded bg-indigo-100 px-2 py-0.5 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-200">
                    {q.chapterLabel} · {catLabel}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  {q.audioText && (
                    <button
                      type="button"
                      data-testid="quiz-battle-audio-btn"
                      onClick={() =>
                        speakMandarin(q.audioText!, {
                          muted: state.muted,
                          rate: state.speechRate,
                          naturalTts: state.naturalTtsEnabled,
                        })
                      }
                      className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50 px-2 py-1 text-[11px] font-extrabold text-indigo-800 hover:bg-indigo-100 dark:border-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-200"
                    >
                      <Volume2 className="h-3.5 w-3.5" />
                      Dengar
                    </button>
                  )}
                  <span className="font-mono-num rounded bg-slate-900 px-2 py-0.5 text-xs font-extrabold text-emerald-300">
                    {minigame.secondsLeft}d
                  </span>
                </div>
              </div>

              <p className="text-xs font-bold leading-snug text-slate-900 dark:text-white sm:text-sm">
                {q.prompt}
              </p>
              {q.hanzi && (
                <div className="hanzi-text mt-1 rounded-lg bg-slate-100 px-3 py-1.5 text-center text-base font-extrabold text-indigo-900 dark:bg-slate-800 dark:text-indigo-200">
                  {q.hanzi}
                </div>
              )}

              <div className="mt-2.5 grid gap-1.5 sm:grid-cols-2">
                {q.options.map((opt, idx) => {
                  const isCorrectOpt = idx === q.correctIdx;
                  const isPicked = localChoice === idx;
                  let btnCls =
                    "border-slate-200 bg-slate-50 text-slate-900 hover:border-indigo-600 hover:bg-indigo-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100";
                  if (reveal) {
                    if (isCorrectOpt) {
                      btnCls = "border-emerald-600 bg-emerald-600 text-white";
                    } else if (isPicked) {
                      btnCls = "border-rose-600 bg-rose-600 text-white";
                    } else {
                      btnCls = "border-slate-200 bg-slate-100 text-slate-400 opacity-70 dark:border-slate-800 dark:bg-slate-800/50";
                    }
                  } else if (isPicked) {
                    btnCls = "border-indigo-700 bg-indigo-700 text-white";
                  }
                  return (
                    <button
                      key={idx}
                      type="button"
                      data-testid={`quiz-battle-opt-${idx}`}
                      disabled={alreadyAnswered || reveal}
                      onClick={() => {
                        setPickedQuizChoice({ qId: q.id, idx });
                        onAnswerQuiz?.(idx);
                      }}
                      className={`flex min-h-[40px] items-center gap-2 rounded-xl border px-3 py-1.5 text-left text-xs font-bold transition disabled:cursor-default ${btnCls}`}
                    >
                      <span className="font-mono-num inline-flex h-5 w-5 shrink-0 items-center justify-center rounded bg-black/10 text-[11px] font-extrabold">
                        {idx + 1}
                      </span>
                      <span className="leading-snug">{opt}</span>
                    </button>
                  );
                })}
              </div>

              <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 text-[11px]">
                {reveal ? (
                  <span className="font-bold text-emerald-700 dark:text-emerald-300">
                    {q.explain}
                  </span>
                ) : alreadyAnswered ? (
                  <span className="font-bold text-indigo-700 dark:text-indigo-300">
                    Jawaban terkirim! Menunggu teman ({q.answeredPlayerIds.length}/{minigame.players.length})...
                  </span>
                ) : (
                  <span className="font-semibold text-slate-500 dark:text-slate-400">
                    Pilih jawaban atau tekan angka 1–4 · Tercepat +30 pt &amp; +15 XP!
                  </span>
                )}
                {q.firstSolverName && (
                  <span className="rounded bg-amber-100 px-1.5 py-0.5 font-extrabold text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                    Tercepat: {q.firstSolverName}
                  </span>
                )}
              </div>
            </div>
          );
        })()}

      {/* Bottom Edge: Clean Context-First Controls */}
      <div className="flex flex-col items-center gap-2">
        {/* Mobile 360° Touch Analog Stick (bottom-left) + Jump & Sprint (bottom-right) */}
        {virtualMoveRef && (
          <div className="flex w-full items-end justify-between px-0.5 md:hidden">
            <div
              data-testid="mobile-dpad"
              role="application"
              aria-label="Stik Gerak 360 Derajat"
              onPointerDown={(e) => {
                joyActivePointerRef.current = e.pointerId;
                e.currentTarget.setPointerCapture(e.pointerId);
                updateJoystickFromEvent(e);
              }}
              onPointerMove={(e) => {
                if (joyActivePointerRef.current !== e.pointerId) return;
                updateJoystickFromEvent(e);
              }}
              onPointerUp={(e) => {
                if (joyActivePointerRef.current !== e.pointerId) return;
                if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                  e.currentTarget.releasePointerCapture(e.pointerId);
                }
                resetJoystick();
              }}
              onPointerCancel={resetJoystick}
              className="pointer-events-auto relative flex h-24 w-24 shrink-0 touch-none select-none items-center justify-center rounded-full border-2 border-slate-300/80 bg-white/80 shadow-md dark:border-slate-600 dark:bg-slate-900/80"
            >
              <ArrowUp className="pointer-events-none absolute top-1.5 h-3 w-3 text-slate-400" />
              <ArrowDown className="pointer-events-none absolute bottom-1.5 h-3 w-3 text-slate-400" />
              <ArrowLeft className="pointer-events-none absolute left-1.5 h-3 w-3 text-slate-400" />
              <ArrowRight className="pointer-events-none absolute right-1.5 h-3 w-3 text-slate-400" />
              <div className="pointer-events-none h-14 w-14 rounded-full border border-dashed border-slate-300/80 dark:border-slate-700" />
              <div
                className="pointer-events-none absolute flex h-10 w-10 items-center justify-center rounded-full border-2 border-white bg-blue-700 shadow"
                style={{
                  transform: `translate(${joyOffset.x}px, ${joyOffset.y}px)`,
                }}
              >
                <div className="h-2.5 w-2.5 rounded-full bg-white/85" />
              </div>
            </div>

            <div className="pointer-events-auto flex shrink-0 items-center gap-1.5">
              <button
                type="button"
                onClick={triggerMobileJump}
                aria-label="Lompat"
                className="flex min-h-[44px] min-w-[68px] items-center justify-center rounded-xl border border-slate-300/90 bg-white/90 px-3 text-xs font-extrabold text-slate-800 shadow-sm active:bg-blue-700 active:text-white dark:border-slate-700 dark:bg-slate-900/90 dark:text-slate-100"
              >
                Lompat
              </button>
              <button
                type="button"
                onClick={toggleMobileSprint}
                aria-label="Mode Lari"
                className={`flex min-h-[44px] min-w-[64px] items-center justify-center gap-1 rounded-xl border px-2.5 text-xs font-extrabold shadow-sm ${
                  mobileSprinting
                    ? "border-amber-600 bg-amber-600 text-white"
                    : "border-slate-300/90 bg-white/90 text-slate-800 dark:border-slate-700 dark:bg-slate-900/90 dark:text-slate-100"
                }`}
              >
                <Zap className="h-3.5 w-3.5" />
                Lari
              </button>
            </div>
          </div>
        )}

        {/* Contextual Single-Line Action Bar (Inside Building > Nearby Teacher > Active Chapter) + Compact Aksi Seru */}
        <div ref={bottomBarRef} className="relative flex max-w-[calc(100vw-20px)] items-center gap-1.5">
          {insideBuilding ? (
            <div className="pointer-events-auto flex min-w-0 items-center gap-1.5 rounded-xl border border-emerald-500 bg-slate-900/95 p-1 pl-3 text-white shadow-lg">
              <button
                type="button"
                data-testid="inside-building-prompt"
                onClick={() => onInteractBuilding?.(insideBuilding)}
                className="inline-flex min-h-[38px] min-w-0 items-center gap-2 pr-2 text-xs font-extrabold text-white"
              >
                <DoorOpen className="h-4 w-4 shrink-0 text-emerald-400" />
                <span className="truncate">
                  Di Dalam: {insideBuilding.title}
                  {(telemetryRef?.current.playerY ?? 0) >= FLOOR_3_Y - 0.6
                    ? " · Lt.3"
                    : (telemetryRef?.current.playerY ?? 0) >= FLOOR_2_Y - 0.6
                      ? " · Lt.2"
                      : ""}{" "}
                  ({insideBuilding.hanziTitle}) ·{" "}
                  <span className="text-amber-300">{insideBuilding.actionLabel} [E]</span>
                </span>
              </button>
              <button
                type="button"
                onClick={onToggleDock}
                aria-label={dockCollapsed ? "Pilih Bab Lain" : "Tutup Daftar Bab"}
                title="Daftar 7 Bab [H]"
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-800 text-slate-200 hover:bg-slate-700"
              >
                {dockCollapsed ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>
            </div>
          ) : nearbyProp ? (
            <div className="pointer-events-auto flex min-w-0 items-center gap-1.5 rounded-xl border border-cyan-400 bg-slate-900/95 p-1 pl-3 text-white shadow-lg">
              <button
                type="button"
                data-testid="nearby-prop-prompt"
                onClick={() => onInteractProp?.(nearbyProp)}
                className="inline-flex min-h-[38px] min-w-0 items-center gap-2 pr-2 text-xs font-extrabold text-white"
              >
                <Sparkles className="h-4 w-4 shrink-0 text-cyan-300" />
                <span className="truncate">
                  {nearbyProp.title} ({nearbyProp.hanzi}) ·{" "}
                  <span className="text-amber-300">{nearbyProp.actionLabel} [E]</span>
                </span>
              </button>
              <button
                type="button"
                onClick={onToggleDock}
                aria-label={dockCollapsed ? "Pilih Bab Lain" : "Tutup Daftar Bab"}
                title="Daftar 7 Bab [H]"
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-800 text-slate-200 hover:bg-slate-700"
              >
                {dockCollapsed ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>
            </div>
          ) : nearbyChapter ? (
            <div className="pointer-events-auto flex min-w-0 items-center gap-1.5 rounded-xl border border-blue-500 bg-slate-900/95 p-1 pl-3 text-white shadow-lg">
              <button
                type="button"
                data-testid="nearby-teacher-prompt"
                onClick={() =>
                  onEnterNearbyChapter
                    ? onEnterNearbyChapter(nearbyChapter.id)
                    : onSelectChapter(nearbyChapter.id, true)
                }
                className="inline-flex min-h-[38px] min-w-0 items-center gap-2 pr-2 text-xs font-extrabold text-white"
              >
                <MessageCircle className="h-4 w-4 shrink-0 text-amber-400" />
                <span className="truncate">
                  {nearbyChapter.npcName} · Masuk Bab {nearbyChapter.order} [E]
                </span>
              </button>
              <button
                type="button"
                onClick={onToggleDock}
                aria-label={dockCollapsed ? "Pilih Bab Lain" : "Tutup Daftar Bab"}
                title="Daftar 7 Bab [H]"
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-800 text-slate-200 hover:bg-slate-700"
              >
                {dockCollapsed ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>
            </div>
          ) : (
            <div className="pointer-events-auto flex min-w-0 items-center gap-1.5 rounded-xl border border-slate-300/85 bg-white/92 p-1 pl-3 shadow-sm dark:border-slate-700/85 dark:bg-slate-900/92">
              <span className="truncate text-xs font-bold text-slate-800 dark:text-slate-100">
                Bab {activeChapter.order} · {activeChapter.shortTitle}
              </span>
              <button
                type="button"
                data-testid="enter-chapter-btn"
                onClick={onOpenActiveMission}
                className="inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg bg-blue-700 px-3 text-xs font-extrabold text-white hover:bg-blue-800"
              >
                <Play className="h-3.5 w-3.5 fill-current" />
                Masuk Bab {activeChapter.order}
              </button>
              <button
                type="button"
                data-testid="toggle-chapters-btn"
                onClick={onToggleDock}
                aria-label={dockCollapsed ? "Tampilkan Daftar 7 Bab" : "Sembunyikan Daftar 7 Bab"}
                title="Daftar 7 Bab [H]"
                className="inline-flex h-9 shrink-0 items-center gap-1 whitespace-nowrap rounded-lg border border-slate-200 bg-slate-50 px-2 text-xs font-bold text-slate-700 hover:border-blue-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                <span className="hidden sm:inline">7 Bab</span>
                {dockCollapsed ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              </button>
            </div>
          )}

          {onToggleScooter && (
            <button
              type="button"
              data-testid="toggle-scooter-btn"
              onClick={(e) => {
                e.currentTarget.blur();
                onToggleScooter();
              }}
              aria-label={onScooter ? "Turun dari Skuter Listrik" : "Naik Skuter Listrik Kampus"}
              title="Skuter Listrik Turbo (+45% Kecepatan)"
              className={`pointer-events-auto inline-flex h-[46px] shrink-0 items-center gap-1.5 rounded-xl border px-3 text-xs font-extrabold shadow-sm ${
                onScooter
                  ? "border-cyan-500 bg-cyan-600 text-white"
                  : "border-slate-300/85 bg-white/92 text-slate-800 hover:border-cyan-500 dark:border-slate-700/85 dark:bg-slate-900/92 dark:text-slate-100"
              }`}
            >
              <Zap className={`h-4 w-4 ${onScooter ? "text-amber-300" : "text-cyan-600 dark:text-cyan-400"}`} />
              <span className="hidden sm:inline">{onScooter ? "Skuter ON" : "Skuter"}</span>
            </button>
          )}

          {onSendSocialEmote && (
            <button
              type="button"
              data-testid="toggle-emote-btn"
              onClick={(e) => {
                e.currentTarget.blur();
                setEmoteOpen((v) => !v);
              }}
              aria-label="Ekspresi & Aksi Seru"
              aria-expanded={emoteOpen}
              title="Aksi Seru Berdua (Sapa, Joget, Tos, Kembang Api)"
              className={`pointer-events-auto inline-flex h-[46px] shrink-0 items-center gap-1.5 rounded-xl border px-3 text-xs font-extrabold shadow-sm ${
                emoteOpen
                  ? "border-pink-600 bg-pink-600 text-white"
                  : "border-slate-300/85 bg-white/92 text-slate-800 hover:border-pink-500 dark:border-slate-700/85 dark:bg-slate-900/92 dark:text-slate-100"
              }`}
            >
              <Smile className="h-4 w-4 text-pink-600 dark:text-pink-400" />
              <span className="hidden sm:inline">Aksi</span>
            </button>
          )}

          {emoteOpen && onSendSocialEmote && (
            <div
              data-testid="social-emote-popover"
              className="pointer-events-auto absolute bottom-14 right-0 z-20 flex flex-wrap gap-1.5 rounded-2xl border border-slate-300 bg-white/95 p-2 shadow-2xl dark:border-slate-700 dark:bg-slate-900/95"
            >
              {SOCIAL_EMOTES.map((em) => (
                <button
                  key={em.kind}
                  type="button"
                  data-testid={`emote-btn-${em.kind}`}
                  onClick={() => {
                    onSendSocialEmote(em.kind);
                    setEmoteOpen(false);
                  }}
                  className="inline-flex min-h-[36px] items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 px-2.5 text-xs font-bold text-slate-800 hover:border-pink-500 hover:bg-pink-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                >
                  <span>{em.label}</span>
                  <span className="hanzi-text text-[11px] text-slate-500 dark:text-slate-400">
                    {em.hanzi}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Expandable 7-Chapter Quick Selector (Hidden by default; toggles cleanly on demand) */}
        {!dockCollapsed && (
          <div className="pointer-events-auto w-full max-w-[960px] rounded-2xl border border-slate-300/90 bg-white/95 p-2 shadow-xl dark:border-slate-700 dark:bg-slate-900/95">
            <div className="custom-scroll flex items-stretch gap-1.5 overflow-x-auto pb-0.5 lg:grid lg:grid-cols-7 lg:overflow-visible lg:pb-0">
              {chapters.map((ch) => {
                const cp = state.chapters[ch.id];
                const stars = cp?.stars ?? 0;
                const isSelected = ch.id === state.activeChapterId;
                return (
                  <button
                    key={ch.id}
                    type="button"
                    data-testid={`chapter-chip-${ch.id}`}
                    onClick={() => onSelectChapter(ch.id, false)}
                    onDoubleClick={() => onSelectChapter(ch.id, true)}
                    className={`flex min-h-[42px] shrink-0 items-center gap-1.5 rounded-xl border px-2.5 py-1 text-left lg:min-w-0 ${
                      isSelected
                        ? "border-blue-700 bg-blue-50 text-blue-900 dark:border-blue-400 dark:bg-blue-950/70 dark:text-blue-100"
                        : "border-slate-200 bg-slate-50 text-slate-800 hover:border-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                    }`}
                  >
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: ch.accentHex }}
                      aria-hidden="true"
                    />
                    <div className="min-w-0">
                      <div className="truncate text-[11px] font-extrabold leading-tight">
                        Bab {ch.order} · {ch.shortTitle}
                      </div>
                      <div className="font-mono-num text-[10px] font-semibold text-amber-600 dark:text-amber-400">
                        {"★".repeat(stars)}
                        {"☆".repeat(3 - stars)}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
