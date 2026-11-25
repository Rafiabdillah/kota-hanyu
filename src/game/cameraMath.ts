import { WORLD_BOUNDS } from "./worldLayout";

export type CameraPreset = "normal" | "dekat" | "luas";

export interface CameraPresetConfig {
  id: CameraPreset;
  label: string;
  dist: number;
  pitch: number;
  heightOffset: number;
  lookAhead: number;
}

export const CAMERA_PRESETS: Record<CameraPreset, CameraPresetConfig> = {
  normal: {
    id: "normal",
    label: "Normal",
    dist: 14.5,
    pitch: 0.42,
    heightOffset: 2.2,
    lookAhead: 2.2,
  },
  dekat: {
    id: "dekat",
    label: "Dekat",
    dist: 9.2,
    pitch: 0.28,
    heightOffset: 1.75,
    lookAhead: 2.6,
  },
  luas: {
    id: "luas",
    label: "Luas",
    dist: 21.5,
    pitch: 0.68,
    heightOffset: 3.0,
    lookAhead: 1.4,
  },
};

export const CAMERA_PRESET_ORDER: CameraPreset[] = ["normal", "dekat", "luas"];

export function getNextCameraPreset(current: CameraPreset): CameraPreset {
  const idx = CAMERA_PRESET_ORDER.indexOf(current);
  if (idx === -1) return "normal";
  return CAMERA_PRESET_ORDER[(idx + 1) % CAMERA_PRESET_ORDER.length];
}

export function clampCameraPitch(pitch: number): number {
  return Math.max(0.18, Math.min(1.05, pitch));
}

export function clampCameraDist(dist: number): number {
  return Math.max(6.2, Math.min(28.0, dist));
}

/**
 * Adapts vertical FOV gracefully on portrait mobile screens so horizontal
 * campus width remains legible without cropping side buildings.
 */
export function computeResponsiveFov(aspect: number): number {
  if (!Number.isFinite(aspect) || aspect <= 0) return 48;
  if (aspect < 0.72) return 60;
  if (aspect < 1.0) return 54;
  return 48;
}

export function computeAdaptivePixelRatio(
  current: number,
  averageFrameMs: number,
  min: number,
  max: number,
): number {
  const lower = Math.max(0.5, Math.min(min, max));
  const upper = Math.max(lower, max);
  const safeCurrent = Number.isFinite(current)
    ? Math.max(lower, Math.min(upper, current))
    : upper;
  if (!Number.isFinite(averageFrameMs) || averageFrameMs <= 0) return safeCurrent;
  if (averageFrameMs > 27) {
    return Math.max(lower, Math.round((safeCurrent - 0.15) * 100) / 100);
  }
  if (averageFrameMs < 18) {
    return Math.min(upper, Math.round((safeCurrent + 0.1) * 100) / 100);
  }
  return safeCurrent;
}

/**
 * Shortest signed angle delta from `from` to `to` in [-PI, PI].
 */
export function normalizeAngleDelta(from: number, to: number): number {
  let diff = to - from;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return diff;
}

/**
 * Computes the camera yaw offset that places the camera behind the character's
 * current facing direction (`playerYaw`, where facing north -Z is Math.PI).
 */
export function getBehindPlayerCameraYaw(playerYaw: number): number {
  return playerYaw + Math.PI;
}

export interface OrbitCameraInput {
  playerX: number;
  playerY: number;
  playerZ: number;
  camYawOffset: number;
  camPitch: number;
  camDist: number;
  preset: CameraPreset;
}

export interface OrbitCameraFrame {
  camX: number;
  camY: number;
  camZ: number;
  targetX: number;
  targetY: number;
  targetZ: number;
}

/**
 * Computes smooth 3D chase-orbit camera position and directional look target.
 * Look-ahead follows the camera's horizontal forward direction so 360° orbit
 * stays centered ahead of the character regardless of camera angle.
 */
export function computeOrbitCameraFrame(input: OrbitCameraInput): OrbitCameraFrame {
  const cfg = CAMERA_PRESETS[input.preset] ?? CAMERA_PRESETS.normal;
  const dist = clampCameraDist(input.camDist);
  const pitch = clampCameraPitch(input.camPitch);

  const horizDist = dist * Math.cos(pitch);
  const camX = input.playerX + Math.sin(input.camYawOffset) * horizDist;
  const camZ = input.playerZ + Math.cos(input.camYawOffset) * horizDist;
  const rawCamY = dist * Math.sin(pitch) + cfg.heightOffset + input.playerY * 0.45;
  const camY = Math.max(1.85, rawCamY);

  // Camera forward vector in XZ is (-sin(camYawOffset), -cos(camYawOffset))
  const targetX = input.playerX - Math.sin(input.camYawOffset) * cfg.lookAhead;
  const targetY = 1.75 + input.playerY * 0.5;
  const targetZ = input.playerZ - Math.cos(input.camYawOffset) * cfg.lookAhead;

  return { camX, camY, camZ, targetX, targetY, targetZ };
}

/**
 * Maps minimap click coordinates (0..size) to open-world campus (x, z).
 * Matches WORLD_BOUNDS: X in [-72, 72], Z in [-84, 58].
 */
export function minimapPxToWorld(px: number, py: number, mapSize = 128): { x: number; z: number } {
  const nx = Math.max(0, Math.min(1, px / mapSize));
  const ny = Math.max(0, Math.min(1, py / mapSize));
  const spanX = WORLD_BOUNDS.maxX - WORLD_BOUNDS.minX;
  const spanZ = WORLD_BOUNDS.maxZ - WORLD_BOUNDS.minZ;
  return {
    x: Math.max(WORLD_BOUNDS.minX, Math.min(WORLD_BOUNDS.maxX, nx * spanX + WORLD_BOUNDS.minX)),
    z: Math.max(WORLD_BOUNDS.minZ, Math.min(WORLD_BOUNDS.maxZ, ny * spanZ + WORLD_BOUNDS.minZ)),
  };
}
