import test from "node:test";
import assert from "node:assert/strict";
import {
  CAMERA_PRESETS,
  clampCameraDist,
  clampCameraPitch,
  computeAdaptivePixelRatio,
  computeOrbitCameraFrame,
  computeResponsiveFov,
  getBehindPlayerCameraYaw,
  getNextCameraPreset,
  minimapPxToWorld,
  normalizeAngleDelta,
} from "./cameraMath";
import { WORLD_BOUNDS } from "./worldLayout";

test("camera presets cycle cleanly and clamp pitch/distance bounds", () => {
  assert.equal(getNextCameraPreset("normal"), "dekat");
  assert.equal(getNextCameraPreset("dekat"), "luas");
  assert.equal(getNextCameraPreset("luas"), "normal");

  assert.equal(clampCameraPitch(0.01), 0.18);
  assert.equal(clampCameraPitch(2.5), 1.05);
  assert.equal(clampCameraDist(2), 6.2);
  assert.equal(clampCameraDist(40), 28.0);
});

test("computeResponsiveFov widens gracefully for portrait mobile screens", () => {
  assert.equal(computeResponsiveFov(390 / 844), 60);
  assert.equal(computeResponsiveFov(768 / 900), 54);
  assert.equal(computeResponsiveFov(1440 / 900), 48);
});

test("adaptive pixel ratio preserves quality while respecting performance bounds", () => {
  assert.equal(computeAdaptivePixelRatio(2, 40, 0.85, 2), 1.85);
  assert.equal(computeAdaptivePixelRatio(0.9, 12, 0.85, 1.5), 1);
  assert.equal(computeAdaptivePixelRatio(1.25, 22, 0.85, 1.5), 1.25);
  assert.equal(computeAdaptivePixelRatio(3, 40, 0.85, 1.5), 1.35);
  assert.equal(computeAdaptivePixelRatio(Number.NaN, 22, 1, 1.5), 1.5);
});

test("computeOrbitCameraFrame rotates look-ahead with camera yaw and prevents underground clipping", () => {
  // Camera at default yaw 0 sits south (+Z) looking north (-Z)
  const northFrame = computeOrbitCameraFrame({
    playerX: 0,
    playerY: 0,
    playerZ: 14,
    camYawOffset: 0,
    camPitch: CAMERA_PRESETS.normal.pitch,
    camDist: CAMERA_PRESETS.normal.dist,
    preset: "normal",
  });
  assert.ok(northFrame.camZ > 14);
  assert.ok(northFrame.targetZ < 14);
  assert.ok(northFrame.camY >= 1.85);

  // Rotating 180 deg places camera north (-Z) looking south (+Z)
  const southFrame = computeOrbitCameraFrame({
    playerX: 0,
    playerY: 0,
    playerZ: 14,
    camYawOffset: Math.PI,
    camPitch: CAMERA_PRESETS.normal.pitch,
    camDist: CAMERA_PRESETS.normal.dist,
    preset: "normal",
  });
  assert.ok(southFrame.camZ < 14);
  assert.ok(southFrame.targetZ > 14);

  // Behind-player reset for default facing north (playerYaw = Math.PI) aligns camera south (+Z)
  const behindYaw = getBehindPlayerCameraYaw(Math.PI);
  assert.ok(Math.abs(normalizeAngleDelta(behindYaw, 0)) < 1e-6);
});

test("minimapPxToWorld converts minimap clicks to clamped open-world campus coordinates", () => {
  const center = minimapPxToWorld(64, 64, 128);
  assert.equal(center.x, (WORLD_BOUNDS.minX + WORLD_BOUNDS.maxX) / 2);
  assert.equal(center.z, (WORLD_BOUNDS.minZ + WORLD_BOUNDS.maxZ) / 2);

  const topLeft = minimapPxToWorld(-10, -10, 128);
  assert.equal(topLeft.x, WORLD_BOUNDS.minX);
  assert.equal(topLeft.z, WORLD_BOUNDS.minZ);
});
