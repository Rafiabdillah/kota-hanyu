import React, { useEffect, useRef } from "react";
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import type { ChapterData } from "../data/types";
import type { CampusOrbDef } from "../game/engine";
import type {
  AvatarGender,
  MiniGameSnapshot,
  RemotePlayerSnapshot,
  SharedBallState,
  SocialEmoteKind,
} from "../game/multiplayer";
import {
  buildAllOpenWorldBuildings,
  computeFloorSupportY,
  findInsideBuilding,
  FLOOR_2_Y,
  FLOOR_3_Y,
  getBuildingEntranceCoords,
  resolveOpenWorldCollision,
  ROAMING_CITIZEN_NPCS,
  SOCCER_FIELD_CENTER,
  WORLD_BOOST_PADS,
  WORLD_INTERACTIVE_PROPS,
  WORLD_JUMP_PADS,
  type CircleCollider,
  type InteractivePropDef,
  type OpenWorldBuildingDef,
  type OpenWorldBuildingStyle,
} from "../game/worldLayout";
import {
  CAMERA_PRESETS,
  clampCameraDist,
  clampCameraPitch,
  computeOrbitCameraFrame,
  computeResponsiveFov,
  getBehindPlayerCameraYaw,
  normalizeAngleDelta,
  type CameraPreset,
} from "../game/cameraMath";

export interface SceneTelemetry {
  playerX: number;
  playerY: number;
  playerZ: number;
  playerYaw: number;
  isSprinting: boolean;
  isGrounded: boolean;
}

interface CampusScene3DProps {
  gameState: "title" | "playing" | "paused" | "gameover";
  theme: "light" | "dark";
  chapters: ChapterData[];
  activeChapterId: string;
  chapterStars: Record<string, number>;
  orbs?: CampusOrbDef[];
  collectedOrbIds?: string[];
  localJacketHex?: string;
  localGender?: AvatarGender;
  onScooter?: boolean;
  remotePlayersRef?: React.MutableRefObject<Map<string, RemotePlayerSnapshot>>;
  ballStateRef?: React.MutableRefObject<SharedBallState>;
  localSocialBurst?: { kind: SocialEmoteKind; nonce: number } | null;
  walkToTargetRef?: React.MutableRefObject<{ x: number; z: number; nonce: number } | null>;
  onCollectOrb?: (orbId: string) => void;
  onSelectChapter: (chapterId: string, openModal: boolean) => void;
  onSelectBuilding?: (building: OpenWorldBuildingDef) => void;
  onInsideBuildingChange?: (building: OpenWorldBuildingDef | null) => void;
  onNearbyPropChange?: (prop: InteractivePropDef | null) => void;
  minigame?: MiniGameSnapshot | null;
  mpSelfId?: string | null;
  onStepSound?: () => void;
  virtualMoveRef?: React.MutableRefObject<{ x: number; z: number }>;
  virtualSprintRef?: React.MutableRefObject<boolean>;
  jumpTriggerRef?: React.MutableRefObject<number>;
  cameraPreset?: CameraPreset;
  cameraZoomDeltaRef?: React.MutableRefObject<number>;
  cameraResetTriggerRef?: React.MutableRefObject<number>;
  telemetryRef?: React.MutableRefObject<SceneTelemetry>;
  onTelemetryTick?: (t: SceneTelemetry) => void;
  onNearbyChapterChange?: (chapterId: string | null) => void;
  controlsDisabled?: boolean;
  graduationMode?: boolean;
  graduationCelebrateNonce?: number;
}

interface LandmarkMeta {
  building: OpenWorldBuildingDef;
  chapterId?: string;
  order: number;
  shortTitle: string;
  accentHex: string;
  pos: THREE.Vector3;
  roofGroup: THREE.Group;
  upperFloorGroup: THREE.Group | null;
  beaconMesh: THREE.Mesh;
  ringMesh: THREE.Mesh;
  lanterns: THREE.Object3D[];
  windowMats: THREE.MeshStandardMaterial[];
  npcGroup: THREE.Group | null;
  npcRightArm: THREE.Group | null;
  signSprite: THREE.Sprite;
  signCanvas: HTMLCanvasElement;
  signTex: THREE.CanvasTexture;
  lastRenderedStars: number;
}

interface OrbVisualMeta {
  def: CampusOrbDef;
  group: THREE.Group;
  coreMesh: THREE.Mesh;
  haloMesh: THREE.Mesh;
}

function createGroundTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = "#5a8f58";
  ctx.fillRect(0, 0, 512, 512);

  for (let i = 0; i < 2400; i += 1) {
    const x = (Math.sin(i * 12.9898) * 43758.5453) % 1;
    const y = (Math.cos(i * 78.233) * 19341.123) % 1;
    const px = Math.abs(x) * 512;
    const py = Math.abs(y) * 512;
    ctx.fillStyle =
      i % 3 === 0
        ? "rgba(67, 118, 66, 0.36)"
        : i % 3 === 1
          ? "rgba(128, 174, 108, 0.28)"
          : "rgba(96, 148, 84, 0.24)";
    ctx.fillRect(px, py, i % 4 === 0 ? 6 : 4, 4);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(18, 18);
  return tex;
}

function createPaverTextures(): {
  map: THREE.CanvasTexture;
  bumpMap: THREE.CanvasTexture;
} {
  const colorCanvas = document.createElement("canvas");
  colorCanvas.width = 256;
  colorCanvas.height = 256;
  const cCtx = colorCanvas.getContext("2d")!;

  const bumpCanvas = document.createElement("canvas");
  bumpCanvas.width = 256;
  bumpCanvas.height = 256;
  const bCtx = bumpCanvas.getContext("2d")!;

  cCtx.fillStyle = "#ddd6c7";
  cCtx.fillRect(0, 0, 256, 256);
  bCtx.fillStyle = "#dcdcdc";
  bCtx.fillRect(0, 0, 256, 256);

  // Subtle granite flecks
  for (let i = 0; i < 650; i += 1) {
    const px = Math.abs((Math.sin(i * 19.3) * 9123.7) % 1) * 256;
    const py = Math.abs((Math.cos(i * 41.7) * 5432.1) % 1) * 256;
    cCtx.fillStyle = i % 2 === 0 ? "rgba(160,150,134,0.22)" : "rgba(255,252,245,0.28)";
    cCtx.fillRect(px, py, 3, 3);
  }

  cCtx.strokeStyle = "#b0a796";
  cCtx.lineWidth = 3;
  bCtx.strokeStyle = "#484848";
  bCtx.lineWidth = 4;

  for (let row = 0; row < 4; row += 1) {
    const y = row * 64;
    cCtx.beginPath();
    cCtx.moveTo(0, y);
    cCtx.lineTo(256, y);
    cCtx.stroke();

    bCtx.beginPath();
    bCtx.moveTo(0, y);
    bCtx.lineTo(256, y);
    bCtx.stroke();

    const offset = row % 2 === 0 ? 0 : 32;
    for (let col = 0; col <= 4; col += 1) {
      const x = (col * 64 + offset) % 256;
      cCtx.beginPath();
      cCtx.moveTo(x, y);
      cCtx.lineTo(x, y + 64);
      cCtx.stroke();

      bCtx.beginPath();
      bCtx.moveTo(x, y);
      bCtx.lineTo(x, y + 64);
      bCtx.stroke();
    }
  }

  const map = new THREE.CanvasTexture(colorCanvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(6, 12);

  const bumpMap = new THREE.CanvasTexture(bumpCanvas);
  bumpMap.wrapS = THREE.RepeatWrapping;
  bumpMap.wrapT = THREE.RepeatWrapping;
  bumpMap.repeat.set(6, 12);

  return { map, bumpMap };
}

function createWallPlasterTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#f7f3ea";
  ctx.fillRect(0, 0, 256, 256);

  for (let i = 0; i < 900; i += 1) {
    const px = Math.abs((Math.sin(i * 31.1) * 4211.4) % 1) * 256;
    const py = Math.abs((Math.cos(i * 17.9) * 8192.3) % 1) * 256;
    ctx.fillStyle = i % 2 === 0 ? "rgba(205, 194, 174, 0.16)" : "rgba(255, 255, 255, 0.25)";
    ctx.fillRect(px, py, 4, 2);
  }
  ctx.fillStyle = "rgba(180, 168, 148, 0.22)";
  ctx.fillRect(0, 224, 256, 32);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function createRoofTileBumpTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#909090";
  ctx.fillRect(0, 0, 128, 128);
  for (let x = 0; x < 128; x += 16) {
    ctx.fillStyle = "#e6e6e6";
    ctx.fillRect(x, 0, 6, 128);
    ctx.fillStyle = "#525252";
    ctx.fillRect(x + 12, 0, 4, 128);
  }
  for (let y = 0; y < 128; y += 24) {
    ctx.fillStyle = "rgba(40,40,40,0.35)";
    ctx.fillRect(0, y, 128, 3);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 2);
  return tex;
}

function createContactShadowMaterial(): THREE.MeshBasicMaterial {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d")!;
  const grad = ctx.createRadialGradient(64, 64, 8, 64, 64, 62);
  grad.addColorStop(0, "rgba(15, 23, 42, 0.5)");
  grad.addColorStop(0.6, "rgba(15, 23, 42, 0.2)");
  grad.addColorStop(1, "rgba(15, 23, 42, 0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(canvas);
  return new THREE.MeshBasicMaterial({
    map: tex,
    transparent: true,
    depthWrite: false,
    opacity: 0.72,
  });
}

function buildOrbSprite(shortHanzi: string, accentHex: string): THREE.Sprite {
  const canvas = document.createElement("canvas");
  canvas.width = 160;
  canvas.height = 160;
  const ctx = canvas.getContext("2d")!;

  const grad = ctx.createRadialGradient(80, 80, 12, 80, 80, 74);
  grad.addColorStop(0, "rgba(255,255,255,0.98)");
  grad.addColorStop(0.62, accentHex);
  grad.addColorStop(1, "rgba(15,23,42,0)");
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(80, 80, 72, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#0f172a";
  ctx.font = "900 58px 'Noto Sans SC', 'PingFang SC', 'Microsoft YaHei', sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(shortHanzi, 80, 83);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(1.45, 1.45, 1);
  return sprite;
}

function drawRemoteNameplateCanvas(
  canvas: HTMLCanvasElement,
  name: string,
  colorHex: string,
  xp: number,
): void {
  const ctx = canvas.getContext("2d")!;
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  ctx.fillStyle = "rgba(15, 23, 42, 0.88)";
  ctx.strokeStyle = colorHex;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.roundRect(8, 8, w - 16, h - 16, 16);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = colorHex;
  ctx.beginPath();
  ctx.arc(32, h / 2, 10, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#ffffff";
  ctx.font = "800 24px 'Plus Jakarta Sans', 'Noto Sans SC', system-ui, sans-serif";
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  const level = Math.max(1, Math.floor(xp / 120) + 1);
  ctx.fillText(`${name.slice(0, 14)} · Lv.${level}`, 52, h / 2 + 1);
}

function drawSpeechBubbleCanvas(
  canvas: HTMLCanvasElement,
  text: string,
  pinyin?: string,
): void {
  const ctx = canvas.getContext("2d")!;
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = "#1e293b";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.roundRect(10, 10, w - 20, h - 30, 22);
  ctx.fill();
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(w / 2 - 14, h - 22);
  ctx.lineTo(w / 2, h - 4);
  ctx.lineTo(w / 2 + 14, h - 22);
  ctx.closePath();
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#0f172a";
  ctx.font = "800 28px 'Noto Sans SC', 'Plus Jakarta Sans', system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const clipped = text.length > 18 ? `${text.slice(0, 17)}…` : text;
  ctx.fillText(clipped, w / 2, pinyin ? h * 0.36 : h * 0.44);

  if (pinyin) {
    ctx.fillStyle = "#2563eb";
    ctx.font = "700 20px 'Plus Jakarta Sans', system-ui, sans-serif";
    const clippedPy = pinyin.length > 26 ? `${pinyin.slice(0, 25)}…` : pinyin;
    ctx.fillText(clippedPy, w / 2, h * 0.63);
  }
}

function buildPlayerAvatar(
  jacketHex = "#1d4ed8",
  initialGender: AvatarGender = "boy",
): {
  root: THREE.Group;
  leftLeg: THREE.Mesh;
  rightLeg: THREE.Mesh;
  leftArm: THREE.Mesh;
  rightArm: THREE.Mesh;
  bodyGroup: THREE.Group;
  jacketMat: THREE.MeshStandardMaterial;
  capCrown: THREE.Mesh;
  capBrim: THREE.Mesh;
  gradCapGroup: THREE.Group;
  gradTassel: THREE.Group;
  gradStole: THREE.Group;
  scooterGroup: THREE.Group;
  frontWheel: THREE.Mesh;
  rearWheel: THREE.Mesh;
  setGender: (g: AvatarGender, gradActive?: boolean) => void;
  setScooter: (active: boolean) => void;
  getGender: () => AvatarGender;
} {
  const root = new THREE.Group();
  const bodyGroup = new THREE.Group();
  root.add(bodyGroup);

  const skinMat = new THREE.MeshStandardMaterial({ color: 0xf6cbb0, roughness: 0.68, metalness: 0.02 });
  const jacketMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(jacketHex),
    roughness: 0.68,
    metalness: 0.06,
  });
  const trimMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.45, metalness: 0.18 });
  const pantsMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.85, metalness: 0.04 });
  const shoeMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.45, metalness: 0.08 });
  const bagMat = new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.6, metalness: 0.1 });
  const visorMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.18, metalness: 0.42 });

  // Shared Articulated Limbs
  const legGeo = new THREE.BoxGeometry(0.24, 0.68, 0.26);
  legGeo.translate(0, -0.34, 0);
  const leftLeg = new THREE.Mesh(legGeo, pantsMat);
  leftLeg.position.set(-0.17, 0.72, 0);
  leftLeg.castShadow = true;

  const rightLeg = new THREE.Mesh(legGeo, pantsMat);
  rightLeg.position.set(0.17, 0.72, 0);
  rightLeg.castShadow = true;

  const shoeGeo = new THREE.BoxGeometry(0.26, 0.12, 0.37);
  const leftShoe = new THREE.Mesh(shoeGeo, shoeMat);
  leftShoe.position.set(0, -0.66, 0.04);
  leftLeg.add(leftShoe);

  const rightShoe = new THREE.Mesh(shoeGeo, shoeMat);
  rightShoe.position.set(0, -0.66, 0.04);
  rightLeg.add(rightShoe);

  // Cute white ankle socks + Mary-Jane straps for Girl mode
  const sockMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.65 });
  const maryJaneMat = new THREE.MeshStandardMaterial({ color: 0xbe185d, roughness: 0.4, metalness: 0.12 });
  const girlLegTrim = new THREE.Group();
  const sockL = new THREE.Mesh(new THREE.BoxGeometry(0.255, 0.24, 0.275), sockMat);
  sockL.position.set(0, -0.5, 0);
  const mjL = new THREE.Mesh(new THREE.BoxGeometry(0.27, 0.11, 0.36), maryJaneMat);
  mjL.position.set(0, -0.65, 0.03);
  leftLeg.add(sockL, mjL);

  const sockR = new THREE.Mesh(new THREE.BoxGeometry(0.255, 0.24, 0.275), sockMat);
  sockR.position.set(0, -0.5, 0);
  const mjR = new THREE.Mesh(new THREE.BoxGeometry(0.27, 0.11, 0.36), maryJaneMat);
  mjR.position.set(0, -0.65, 0.03);
  rightLeg.add(sockR, mjR);
  void girlLegTrim;

  const armGeo = new THREE.BoxGeometry(0.16, 0.56, 0.18);
  armGeo.translate(0, -0.24, 0);
  const leftArm = new THREE.Mesh(armGeo, jacketMat);
  leftArm.position.set(-0.44, 1.42, 0);
  leftArm.castShadow = true;

  const rightArm = new THREE.Mesh(armGeo, jacketMat);
  rightArm.position.set(0.44, 1.42, 0);
  rightArm.castShadow = true;

  // Cute hands at sleeve ends
  const handGeo = new THREE.SphereGeometry(0.085, 8, 8);
  const handL = new THREE.Mesh(handGeo, skinMat);
  handL.position.set(0, -0.53, 0);
  leftArm.add(handL);
  const handR = new THREE.Mesh(handGeo, skinMat);
  handR.position.set(0, -0.53, 0);
  rightArm.add(handR);

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.78, 0.42), jacketMat);
  torso.position.set(0, 1.12, 0);
  torso.castShadow = true;

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.32, 18, 14), skinMat);
  head.position.set(0, 1.82, 0);
  head.castShadow = true;

  // =============================================
  // COWO KEREN (Cool Boy Visual Group)
  // =============================================
  const boyGroup = new THREE.Group();
  const boyHairMat = new THREE.MeshStandardMaterial({ color: 0x172033, roughness: 0.72 });

  const scarfCollar = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.14, 0.46), trimMat);
  scarfCollar.position.set(0, 1.49, 0);

  const varsityStripe = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.76, 0.44), shoeMat);
  varsityStripe.position.set(0, 1.12, 0);

  const backpack = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.56, 0.24), bagMat);
  backpack.position.set(0, 1.14, -0.31);
  backpack.castShadow = true;

  // Cool dark spiky hair + swept bangs
  const boyHairCrown = new THREE.Mesh(
    new THREE.SphereGeometry(0.335, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.56),
    boyHairMat,
  );
  boyHairCrown.position.set(0, 1.84, -0.02);
  const boyBangs = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.11, 0.16), boyHairMat);
  boyBangs.position.set(0, 1.98, 0.22);
  boyBangs.rotation.z = -0.1;

  const capCrown = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.35, 0.18, 16), bagMat);
  capCrown.position.set(0, 2.04, 0);

  const capBrim = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.05, 0.32), visorMat);
  capBrim.position.set(0, 1.98, 0.27);

  const glasses = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.11, 0.09), visorMat);
  glasses.position.set(0, 1.84, 0.29);

  boyGroup.add(scarfCollar, varsityStripe, backpack, boyHairCrown, boyBangs, capCrown, capBrim, glasses);

  // =============================================
  // CEWE LUCU IMUT CANTIK (Cute Girl Visual Group)
  // =============================================
  const girlGroup = new THREE.Group();
  const girlHairMat = new THREE.MeshStandardMaterial({ color: 0x3b2314, roughness: 0.58 });
  const ribbonMat = new THREE.MeshStandardMaterial({
    color: 0xf472b6,
    emissive: new THREE.Color(0xdb2777),
    emissiveIntensity: 0.18,
    roughness: 0.38,
  });
  const skirtMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.72 });
  const blushMat = new THREE.MeshBasicMaterial({ color: 0xfb7185, transparent: true, opacity: 0.62 });
  const eyeWhiteMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const eyePupilMat = new THREE.MeshBasicMaterial({ color: 0x1e1b4b });
  const laceMat = new THREE.MeshStandardMaterial({ color: 0xfff1f2, roughness: 0.5 });

  // Cute pleated flare skirt + lace hem
  const pleatedSkirt = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.52, 0.44, 16), skirtMat);
  pleatedSkirt.position.set(0, 0.76, 0);
  pleatedSkirt.castShadow = true;
  const skirtTrim = new THREE.Mesh(new THREE.CylinderGeometry(0.49, 0.53, 0.06, 16), laceMat);
  skirtTrim.position.set(0, 0.56, 0);

  // Cute white Peter-Pan collar + chest ribbon bow
  const girlCollar = new THREE.Mesh(new THREE.CylinderGeometry(0.31, 0.36, 0.1, 14), laceMat);
  girlCollar.position.set(0, 1.49, 0.02);
  const bowCenter = new THREE.Mesh(new THREE.SphereGeometry(0.065, 10, 8), ribbonMat);
  bowCenter.position.set(0, 1.42, 0.24);
  const bowWingL = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.09, 0.05), ribbonMat);
  bowWingL.position.set(-0.09, 1.42, 0.24);
  bowWingL.rotation.z = 0.24;
  const bowWingR = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.09, 0.05), ribbonMat);
  bowWingR.position.set(0.09, 1.42, 0.24);
  bowWingR.rotation.z = -0.24;

  // Cute heart-pastel backpack
  const cuteBag = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.44, 0.22), laceMat);
  cuteBag.position.set(0, 1.15, -0.3);
  cuteBag.castShadow = true;
  const bagHeart = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), ribbonMat);
  bagHeart.scale.set(1.2, 1.0, 0.5);
  bagHeart.position.set(0, 1.16, -0.41);

  // Cute Anime-Inspired Face: big sparkling eyes + rosy pink cheeks
  [-0.11, 0.11].forEach((ex) => {
    const eyeBg = new THREE.Mesh(new THREE.CircleGeometry(0.062, 12), eyePupilMat);
    eyeBg.position.set(ex, 1.83, 0.312);
    const glint = new THREE.Mesh(new THREE.CircleGeometry(0.022, 8), eyeWhiteMat);
    glint.position.set(ex - 0.018, 1.848, 0.318);
    const cheek = new THREE.Mesh(new THREE.CircleGeometry(0.055, 12), blushMat);
    cheek.scale.set(1.3, 0.85, 1);
    cheek.position.set(ex * 1.45, 1.75, 0.304);
    girlGroup.add(eyeBg, glint, cheek);
  });

  // Flowing silky hair cap + side locks + long back hair + twin buns with pink bows!
  const girlHairCap = new THREE.Mesh(
    new THREE.SphereGeometry(0.345, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.6),
    girlHairMat,
  );
  girlHairCap.position.set(0, 1.85, -0.02);

  const girlBangs = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.1, 0.16), girlHairMat);
  girlBangs.position.set(0, 1.98, 0.23);

  const backHair = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.66, 0.22), girlHairMat);
  backHair.position.set(0, 1.56, -0.22);
  backHair.castShadow = true;

  [-0.29, 0.29].forEach((sx, idx) => {
    const sideLock = new THREE.Mesh(new THREE.CylinderGeometry(0.068, 0.048, 0.44, 8), girlHairMat);
    sideLock.position.set(sx, 1.66, 0.1);
    const bun = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 10), girlHairMat);
    bun.position.set(sx * 1.05, 2.1, -0.08);
    const hairTie = new THREE.Mesh(new THREE.TorusGeometry(0.115, 0.032, 8, 12), ribbonMat);
    hairTie.position.set(sx * 1.08, 2.02, -0.14);
    hairTie.rotation.x = Math.PI / 2.4;
    const twinTail = new THREE.Mesh(new THREE.ConeGeometry(0.125, 0.5, 10), girlHairMat);
    twinTail.position.set(sx * 1.24, 1.82, -0.17);
    twinTail.rotation.z = idx === 0 ? -0.3 : 0.3;
    twinTail.rotation.x = -0.15;
    const ribbon = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.09, 0.08), ribbonMat);
    ribbon.position.set(sx * 1.08, 2.13, 0.02);
    ribbon.rotation.z = idx === 0 ? 0.25 : -0.25;
    // Back bow wings & hanging tails so ribbons shine from the rear camera view
    const backBowL = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 0.06), ribbonMat);
    backBowL.position.set(sx * 1.08 - 0.07, 2.05, -0.23);
    backBowL.rotation.z = 0.32;
    const backBowR = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 0.06), ribbonMat);
    backBowR.position.set(sx * 1.08 + 0.07, 2.05, -0.23);
    backBowR.rotation.z = -0.32;
    const backTail = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.2, 0.04), ribbonMat);
    backTail.position.set(sx * 1.12, 1.92, -0.24);
    backTail.rotation.z = idx === 0 ? 0.2 : -0.2;
    girlGroup.add(sideLock, bun, hairTie, twinTail, ribbon, backBowL, backBowR, backTail);
  });

  // Cute golden star hairpin on right bangs
  const starPin = new THREE.Mesh(new THREE.OctahedronGeometry(0.055, 0), trimMat);
  starPin.position.set(0.18, 2.02, 0.28);

  girlGroup.add(
    pleatedSkirt,
    skirtTrim,
    girlCollar,
    bowCenter,
    bowWingL,
    bowWingR,
    cuteBag,
    bagHeart,
    girlHairCap,
    girlBangs,
    backHair,
    starPin,
  );

  // =============================================
  // RIDEABLE SKUTER LISTRIK KAMPUS (Electric Scooter)
  // =============================================
  const scooterGroup = new THREE.Group();
  scooterGroup.visible = false;
  const deckMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.35, metalness: 0.65 });
  const neonMat = new THREE.MeshStandardMaterial({
    color: 0x22d3ee,
    emissive: new THREE.Color(0x06b6d4),
    emissiveIntensity: 0.95,
    roughness: 0.2,
  });
  const tailLightMat = new THREE.MeshStandardMaterial({
    color: 0xf43f5e,
    emissive: new THREE.Color(0xe11d48),
    emissiveIntensity: 0.95,
    roughness: 0.25,
  });
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.5, metalness: 0.4 });

  const scooterDeck = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.08, 1.24), deckMat);
  scooterDeck.position.set(0, 0.16, 0.04);
  const deckNeon = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.035, 1.12), neonMat);
  deckNeon.position.set(0, 0.135, 0.04);
  const rearFender = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.12, 0.22), deckMat);
  rearFender.position.set(0, 0.23, -0.52);
  const rearTailLight = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.06, 0.06), tailLightMat);
  rearTailLight.position.set(0, 0.23, -0.61);
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.048, 1.08, 8), neonMat);
  stem.position.set(0, 0.74, 0.52);
  stem.rotation.x = -0.15;
  const handleBar = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.034, 0.62, 8), deckMat);
  handleBar.rotation.z = Math.PI / 2;
  handleBar.position.set(0, 1.24, 0.44);
  const wheelGeo = new THREE.CylinderGeometry(0.15, 0.15, 0.12, 14);
  wheelGeo.rotateZ(Math.PI / 2);
  const frontWheel = new THREE.Mesh(wheelGeo, wheelMat);
  frontWheel.position.set(0, 0.15, 0.58);
  const rearWheel = new THREE.Mesh(wheelGeo, wheelMat);
  rearWheel.position.set(0, 0.15, -0.46);
  const headlight = new THREE.Mesh(new THREE.SphereGeometry(0.065, 8, 8), trimMat);
  headlight.position.set(0, 1.12, 0.5);

  scooterGroup.add(
    scooterDeck,
    deckNeon,
    rearFender,
    rearTailLight,
    stem,
    handleBar,
    frontWheel,
    rearWheel,
    headlight,
  );

  // Ceremonial Graduation Mortarboard Cap + Tassel + Gold Stole (hidden until graduationMode)
  const togaDarkMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.72, metalness: 0.08 });
  const togaGoldMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.25, metalness: 0.72 });
  const togaCrimsonMat = new THREE.MeshStandardMaterial({ color: 0xb91c1c, roughness: 0.55, metalness: 0.12 });

  const gradCapGroup = new THREE.Group();
  gradCapGroup.position.set(0, 2.02, 0);
  gradCapGroup.visible = false;

  const gradSkull = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.34, 0.16, 16), togaDarkMat);
  gradSkull.position.y = 0.02;
  const gradBoard = new THREE.Mesh(new THREE.BoxGeometry(0.84, 0.055, 0.84), togaDarkMat);
  gradBoard.position.y = 0.12;
  gradBoard.rotation.z = -0.04;
  gradBoard.castShadow = true;
  const gradBtn = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.04, 12), togaGoldMat);
  gradBtn.position.y = 0.16;

  const gradTassel = new THREE.Group();
  gradTassel.position.set(0.36, 0.12, 0.28);
  const tasselCord = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.24, 8), togaGoldMat);
  tasselCord.position.y = -0.12;
  const tasselTail = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.045, 0.14, 10), togaGoldMat);
  tasselTail.position.y = -0.25;
  gradTassel.add(tasselCord, tasselTail);
  gradCapGroup.add(gradSkull, gradBoard, gradBtn, gradTassel);

  const gradStole = new THREE.Group();
  gradStole.visible = false;
  const stoleLeft = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.58, 0.05), togaCrimsonMat);
  stoleLeft.position.set(-0.18, 1.24, 0.23);
  stoleLeft.rotation.z = 0.08;
  const stoleRight = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.58, 0.05), togaCrimsonMat);
  stoleRight.position.set(0.18, 1.24, 0.23);
  stoleRight.rotation.z = -0.08;
  const stoleTrimL = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.08, 0.055), togaGoldMat);
  stoleTrimL.position.set(-0.2, 0.96, 0.232);
  const stoleTrimR = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.08, 0.055), togaGoldMat);
  stoleTrimR.position.set(0.2, 0.96, 0.232);
  gradStole.add(stoleLeft, stoleRight, stoleTrimL, stoleTrimR);

  bodyGroup.add(
    leftLeg,
    rightLeg,
    leftArm,
    rightArm,
    torso,
    head,
    boyGroup,
    girlGroup,
    gradCapGroup,
    gradStole,
  );
  root.add(scooterGroup);

  let currentGender: AvatarGender = initialGender;
  const setGender = (g: AvatarGender, gradActive = false) => {
    currentGender = g;
    const isGirl = g === "girl";
    boyGroup.visible = !isGirl;
    girlGroup.visible = isGirl;
    sockL.visible = isGirl;
    mjL.visible = isGirl;
    sockR.visible = isGirl;
    mjR.visible = isGirl;
    leftShoe.visible = !isGirl;
    rightShoe.visible = !isGirl;
    capCrown.visible = !isGirl && !gradActive;
    capBrim.visible = !isGirl && !gradActive;
  };
  setGender(initialGender, false);

  const setScooter = (active: boolean) => {
    scooterGroup.visible = active;
  };

  return {
    root,
    leftLeg,
    rightLeg,
    leftArm,
    rightArm,
    bodyGroup,
    jacketMat,
    capCrown,
    capBrim,
    gradCapGroup,
    gradTassel,
    gradStole,
    scooterGroup,
    frontWheel,
    rearWheel,
    setGender,
    setScooter,
    getGender: () => currentGender,
  };
}

function buildTeacherNpc(accentHex: string): {
  group: THREE.Group;
  rightArm: THREE.Group;
} {
  const group = new THREE.Group();
  const coatMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(accentHex),
    roughness: 0.65,
    metalness: 0.08,
  });
  const skirtMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.8 });
  const skinMat = new THREE.MeshStandardMaterial({ color: 0xf7cfb0, roughness: 0.72 });
  const hairMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.75 });
  const scarfMat = new THREE.MeshStandardMaterial({ color: 0xfef3c7, roughness: 0.6 });
  const goldMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.3, metalness: 0.65 });

  const skirt = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.38, 0.85, 12), skirtMat);
  skirt.position.y = 0.425;
  skirt.castShadow = true;
  group.add(skirt);

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.7, 0.36), coatMat);
  torso.position.y = 1.18;
  torso.castShadow = true;
  group.add(torso);

  const scarf = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.16, 0.4), scarfMat);
  scarf.position.y = 1.5;
  group.add(scarf);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.29, 14, 12), skinMat);
  head.position.y = 1.82;
  head.castShadow = true;
  group.add(head);

  const hairCap = new THREE.Mesh(new THREE.SphereGeometry(0.305, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.62), hairMat);
  hairCap.position.y = 1.85;
  group.add(hairCap);

  const hairBun = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), hairMat);
  hairBun.position.set(0, 2.04, -0.2);
  group.add(hairBun);

  const hairPin = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), goldMat);
  hairPin.position.set(0, 2.08, -0.26);
  group.add(hairPin);

  const glasses = new THREE.Mesh(
    new THREE.BoxGeometry(0.38, 0.08, 0.06),
    new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.25, metalness: 0.4 }),
  );
  glasses.position.set(0, 1.84, 0.27);
  group.add(glasses);

  const leftArm = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.54, 0.18), coatMat);
  leftArm.position.set(-0.4, 1.16, 0.04);
  leftArm.rotation.z = 0.12;
  group.add(leftArm);

  const rightArm = new THREE.Group();
  rightArm.position.set(0.38, 1.44, 0);
  const rightSleeve = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.56, 0.18), coatMat);
  rightSleeve.position.set(0, -0.22, 0.06);
  const rightHand = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 8), skinMat);
  rightHand.position.set(0, -0.52, 0.06);
  rightArm.add(rightSleeve, rightHand);
  group.add(rightArm);

  return { group, rightArm };
}

function buildGraduationStage(sharedMats: {
  stoneMat: THREE.MeshStandardMaterial;
  timberMat: THREE.MeshStandardMaterial;
  goldMat: THREE.MeshStandardMaterial;
}): { group: THREE.Group; bannerTex: THREE.CanvasTexture } {
  const group = new THREE.Group();
  group.position.set(0, 0, 4.6);

  const velvetMat = new THREE.MeshStandardMaterial({
    color: 0x991b1b,
    roughness: 0.9,
    metalness: 0.03,
  });
  const lanternGlowMat = new THREE.MeshStandardMaterial({
    color: 0xfef3c7,
    emissive: new THREE.Color(0xf59e0b),
    emissiveIntensity: 0.9,
    roughness: 0.35,
  });

  // 1. Stone & crimson tiered ceremonial stage
  const stoneBase = new THREE.Mesh(new THREE.BoxGeometry(7.8, 0.18, 4.8), sharedMats.stoneMat);
  stoneBase.position.y = 0.09;
  stoneBase.receiveShadow = true;
  stoneBase.castShadow = true;

  const velvetDeck = new THREE.Mesh(new THREE.BoxGeometry(6.8, 0.16, 3.9), velvetMat);
  velvetDeck.position.y = 0.26;
  velvetDeck.receiveShadow = true;
  velvetDeck.castShadow = true;

  const goldTrim = new THREE.Mesh(new THREE.BoxGeometry(6.92, 0.06, 4.02), sharedMats.goldMat);
  goldTrim.position.y = 0.21;

  // Front carpet runner (offset >= 0.02 above road surface)
  const runner = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.04, 4.4), velvetMat);
  runner.position.set(0, 0.075, 4.2);
  runner.receiveShadow = true;
  group.add(stoneBase, velvetDeck, goldTrim, runner);

  // 2. Backdrop Banner Pillars & Procedural Banner
  const bannerCanvas = document.createElement("canvas");
  bannerCanvas.width = 512;
  bannerCanvas.height = 160;
  const bCtx = bannerCanvas.getContext("2d")!;
  bCtx.fillStyle = "#172554";
  bCtx.fillRect(0, 0, 512, 160);
  bCtx.strokeStyle = "#f59e0b";
  bCtx.lineWidth = 8;
  bCtx.strokeRect(8, 8, 496, 144);
  bCtx.fillStyle = "#fde68a";
  bCtx.font = "900 44px 'Noto Sans SC', 'PingFang SC', sans-serif";
  bCtx.textAlign = "center";
  bCtx.textBaseline = "middle";
  bCtx.fillText("汉语学院 · 毕业典礼", 256, 62);
  bCtx.fillStyle = "#ffffff";
  bCtx.font = "700 24px 'Plus Jakarta Sans', system-ui, sans-serif";
  bCtx.fillText("Upacara Kelulusan Kampus Hanyu", 256, 114);

  const bannerTex = new THREE.CanvasTexture(bannerCanvas);
  bannerTex.colorSpace = THREE.SRGBColorSpace;
  const bannerMat = new THREE.MeshStandardMaterial({
    map: bannerTex,
    roughness: 0.45,
    metalness: 0.1,
  });

  [-2.5, 2.5].forEach((px) => {
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.16, 3.6, 12), sharedMats.timberMat);
    col.position.set(px, 2.1, -1.55);
    col.castShadow = true;
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 10), sharedMats.goldMat);
    cap.position.set(px, 3.96, -1.55);
    group.add(col, cap);
  });

  const bannerBoard = new THREE.Mesh(new THREE.BoxGeometry(5.2, 1.55, 0.14), bannerMat);
  bannerBoard.position.set(0, 3.25, -1.55);
  bannerBoard.castShadow = true;
  group.add(bannerBoard);

  // 3. Honor Lectern & Rolled Diploma Scroll
  const lecternBase = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.12, 0.56), sharedMats.timberMat);
  lecternBase.position.set(1.9, 0.9, 0.55);
  lecternBase.castShadow = true;
  const lecternTop = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.1, 0.68), sharedMats.goldMat);
  lecternTop.position.set(1.9, 1.48, 0.55);
  const diplomaScroll = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.52, 12), lanternGlowMat);
  diplomaScroll.rotation.z = Math.PI / 2;
  diplomaScroll.position.set(1.9, 1.58, 0.55);
  const diplomaRibbon = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.095, 0.1, 12), velvetMat);
  diplomaRibbon.rotation.z = Math.PI / 2;
  diplomaRibbon.position.set(1.9, 1.58, 0.55);
  group.add(lecternBase, lecternTop, diplomaScroll, diplomaRibbon);

  // 4. Twin Front Ceremonial Lantern Stands
  [-2.9, 2.9].forEach((lx) => {
    const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 2.2, 10), sharedMats.timberMat);
    stand.position.set(lx, 1.42, 1.45);
    const globe = new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 10), lanternGlowMat);
    globe.position.set(lx, 2.68, 1.45);
    const crown = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.18, 10), sharedMats.goldMat);
    crown.position.set(lx, 3.04, 1.45);
    group.add(stand, globe, crown);
  });

  group.visible = false;
  return { group, bannerTex };
}

function drawSignboardCanvas(
  canvas: HTMLCanvasElement,
  order: number,
  shortTitle: string,
  accentHex: string,
  stars: number,
): void {
  const ctx = canvas.getContext("2d")!;
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  ctx.fillStyle = "rgba(15, 23, 42, 0.92)";
  ctx.strokeStyle = accentHex;
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.roundRect(6, 6, w - 12, h - 12, 20);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = accentHex;
  ctx.beginPath();
  ctx.roundRect(18, 18, 12, h - 36, 6);
  ctx.fill();

  ctx.fillStyle = "#f8fafc";
  ctx.font = "800 31px 'Plus Jakarta Sans', 'Noto Sans SC', system-ui, sans-serif";
  ctx.textBaseline = "middle";
  ctx.fillText(`Bab ${order} · ${shortTitle}`, 44, h * 0.38);

  const clamped = Math.max(0, Math.min(3, stars));
  ctx.font = "700 25px 'Plus Jakarta Sans', system-ui, sans-serif";
  ctx.fillStyle = clamped > 0 ? "#fbbf24" : "#cbd5e1";
  const starStr = `${"★".repeat(clamped)}${"☆".repeat(3 - clamped)}`;
  ctx.fillText(`${starStr}  ${clamped > 0 ? "Tuntas" : "Klik / Dekati"}`, 44, h * 0.72);
}

function buildSignboardSprite(
  order: number,
  shortTitle: string,
  accentHex: string,
  stars: number,
): { sprite: THREE.Sprite; canvas: HTMLCanvasElement; texture: THREE.CanvasTexture } {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 136;
  drawSignboardCanvas(canvas, order, shortTitle, accentHex, stars);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: true });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(4.8, 1.28, 1);
  return { sprite, canvas, texture };
}

function createGatePlaqueTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 96;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#7f1d1d";
  ctx.fillRect(0, 0, 256, 96);
  ctx.strokeStyle = "#fbbf24";
  ctx.lineWidth = 6;
  ctx.strokeRect(5, 5, 246, 86);
  ctx.fillStyle = "#fef3c7";
  ctx.font = "900 42px 'Noto Sans SC', 'PingFang SC', sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("汉语学院", 128, 50);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function buildCampusBuilding(
  style: OpenWorldBuildingStyle,
  accentHex: string,
  sharedMats: {
    stoneMat: THREE.MeshStandardMaterial;
    wallMat: THREE.MeshStandardMaterial;
    timberMat: THREE.MeshStandardMaterial;
    roofBump: THREE.CanvasTexture;
    goldMat: THREE.MeshStandardMaterial;
    gatePlaqueTex: THREE.CanvasTexture;
  },
  floors: 1 | 2 | 3 = 1,
): {
  group: THREE.Group;
  roofGroup: THREE.Group;
  upperFloorGroup: THREE.Group | null;
  lanterns: THREE.Object3D[];
  windowMats: THREE.MeshStandardMaterial[];
  clickProxy: THREE.Mesh;
} {
  const group = new THREE.Group();
  const roofGroup = new THREE.Group();
  let upperFloorGroup: THREE.Group | null = floors >= 2 ? new THREE.Group() : null;
  if (upperFloorGroup) {
    group.add(upperFloorGroup);
  }
  group.add(roofGroup);
  const lanterns: THREE.Object3D[] = [];
  const windowMats: THREE.MeshStandardMaterial[] = [];
  const accentColor = new THREE.Color(accentHex);

  const { stoneMat, wallMat, timberMat, roofBump, goldMat, gatePlaqueTex } = sharedMats;
  const roofMat = new THREE.MeshStandardMaterial({
    color: accentColor,
    roughness: 0.44,
    metalness: 0.14,
    bumpMap: roofBump,
    bumpScale: 0.04,
  });
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x38bdf8,
    emissive: new THREE.Color(0x0ea5e9),
    emissiveIntensity: 0.18,
    roughness: 0.14,
    metalness: 0.55,
  });
  windowMats.push(glassMat);

  const lanternMat = new THREE.MeshStandardMaterial({
    color: 0xef4444,
    emissive: new THREE.Color(0xdc2626),
    emissiveIntensity: 0.65,
    roughness: 0.35,
  });

  const floorWoodMat = new THREE.MeshStandardMaterial({ color: 0xa1623b, roughness: 0.8 });
  const rugMat = new THREE.MeshStandardMaterial({ color: accentColor, roughness: 0.85 });

  if (style === "maze") {
    upperFloorGroup = null;
    const hedgeMat = new THREE.MeshStandardMaterial({ color: 0x15803d, roughness: 0.85 });
    const base = new THREE.Mesh(new THREE.BoxGeometry(9.2, 0.1, 9.2), stoneMat);
    base.position.y = 0.05;
    base.receiveShadow = true;
    group.add(base);

    const wallSpecs: [number, number, number, number][] = [
      [-2.9, -4.25, 3.2, 0.5],
      [2.9, -4.25, 3.2, 0.5],
      [-4.25, 0, 0.5, 9.0],
      [4.25, 0, 0.5, 9.0],
      [-2.95, 4.25, 3.1, 0.5],
      [2.95, 4.25, 3.1, 0.5],
      [0, 1.65, 4.4, 0.5],
      [-1.95, 0, 0.5, 3.6],
      [1.95, -0.75, 0.5, 2.1],
      [0.95, -1.95, 2.5, 0.5],
    ];
    for (const [wx, wz, ww, wd] of wallSpecs) {
      const hedge = new THREE.Mesh(new THREE.BoxGeometry(ww, 2.45, wd), hedgeMat);
      hedge.position.set(wx, 1.28, wz);
      hedge.castShadow = true;
      hedge.receiveShadow = true;
      group.add(hedge);
    }

    const chestPedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.65, 0.75, 10), stoneMat);
    chestPedestal.position.set(0, 0.42, 0);
    const chest = new THREE.Mesh(new THREE.OctahedronGeometry(0.35, 0), goldMat);
    chest.position.set(0, 1.15, 0);
    group.add(chestPedestal, chest);
    lanterns.push(chest);

    const clickProxy = new THREE.Mesh(
      new THREE.BoxGeometry(9.2, 3.2, 9.2),
      new THREE.MeshBasicMaterial({ visible: false }),
    );
    clickProxy.position.set(0, 1.6, 0);
    group.add(clickProxy);
    return { group, roofGroup, upperFloorGroup: null, lanterns, windowMats, clickProxy };
  }

  if (style === "parkour") {
    upperFloorGroup = null;
    const padCyanMat = new THREE.MeshStandardMaterial({ color: 0x0891b2, roughness: 0.45 });
    const stepOrangeMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.5 });

    const base = new THREE.Mesh(new THREE.BoxGeometry(9.6, 0.1, 7.6), stoneMat);
    base.position.y = 0.05;
    base.receiveShadow = true;
    group.add(base);

    // Ramp 1 (x -4.0..-1.0, z 1.8..4.4, y 0->1.8)
    for (let s = 0; s < 7; s += 1) {
      const t = (s + 0.5) / 7;
      const tread = new THREE.Mesh(new THREE.BoxGeometry(2.9, 0.24, 0.42), stepOrangeMat);
      tread.position.set(-2.5, t * 1.8 - 0.08, 4.4 - t * 2.6);
      tread.castShadow = true;
      group.add(tread);
    }

    const deck1 = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.28, 4.0), padCyanMat);
    deck1.position.set(-2.5, 1.68, -0.2);
    deck1.receiveShadow = true;
    deck1.castShadow = true;
    group.add(deck1);

    // Ramp 2 (x -0.8..1.8, z -1.2..1.2, y 1.8->3.4)
    for (let s = 0; s < 6; s += 1) {
      const t = (s + 0.5) / 6;
      const tread = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.24, 2.3), stepOrangeMat);
      tread.position.set(-0.8 + t * 2.6, 1.8 + t * (FLOOR_2_Y - 1.8) - 0.08, 0);
      tread.castShadow = true;
      group.add(tread);
    }

    const deck2 = new THREE.Mesh(new THREE.BoxGeometry(4.7, 0.3, 4.6), padCyanMat);
    deck2.position.set(1.85, FLOOR_2_Y - 0.12, -0.1);
    deck2.receiveShadow = true;
    deck2.castShadow = true;
    group.add(deck2);

    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.6, 8), goldMat);
    pole.position.set(2.4, FLOOR_2_Y + 1.3, 0);
    const flag = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.65, 0.08), lanternMat);
    flag.position.set(2.95, FLOOR_2_Y + 2.2, 0);
    group.add(pole, flag);

    const clickProxy = new THREE.Mesh(
      new THREE.BoxGeometry(9.6, 5.2, 8.2),
      new THREE.MeshBasicMaterial({ visible: false }),
    );
    clickProxy.position.set(0, 2.4, 0);
    group.add(clickProxy);
    return { group, roofGroup, upperFloorGroup: null, lanterns, windowMats, clickProxy };
  }

  // Grounded stone plinth + front step
  const plinth = new THREE.Mesh(new THREE.BoxGeometry(7.2, 0.12, 5.4), stoneMat);
  plinth.position.y = 0.06;
  plinth.receiveShadow = true;
  group.add(plinth);

  const step1 = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.08, 0.75), stoneMat);
  step1.position.set(0, 0.04, 2.95);
  step1.receiveShadow = true;
  group.add(step1);

  if (style === "gate") {
    const pillarGeo = new THREE.CylinderGeometry(0.26, 0.32, 4.45, 14);
    [-2.45, -1.15, 1.15, 2.45].forEach((px, idx) => {
      const p = new THREE.Mesh(pillarGeo, lanternMat);
      p.position.set(px, 2.35, 0);
      p.castShadow = true;
      group.add(p);

      const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.42, 0.44, 14), stoneMat);
      collar.position.set(px, 0.36, 0);
      group.add(collar);

      if (idx === 0 || idx === 3) {
        const lionPedestal = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.52, 0.62), stoneMat);
        lionPedestal.position.set(px, 0.42, 1.35);
        lionPedestal.castShadow = true;
        const lionOrb = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 10), goldMat);
        lionOrb.position.set(px, 0.88, 1.35);
        group.add(lionPedestal, lionOrb);
      }
    });

    const beam1 = new THREE.Mesh(new THREE.BoxGeometry(6.6, 0.48, 0.84), timberMat);
    beam1.position.set(0, 4.35, 0);
    beam1.castShadow = true;
    roofGroup.add(beam1);

    const upperBeam = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.36, 0.68), timberMat);
    upperBeam.position.set(0, 5.15, 0);
    roofGroup.add(upperBeam);

    const centralRoof = new THREE.Mesh(new THREE.ConeGeometry(2.9, 1.25, 4), roofMat);
    centralRoof.rotation.y = Math.PI / 4;
    centralRoof.scale.set(1.3, 1, 0.65);
    centralRoof.position.set(0, 5.85, 0);
    centralRoof.castShadow = true;
    roofGroup.add(centralRoof);

    [-2.2, 2.2].forEach((ex) => {
      const sideEave = new THREE.Mesh(new THREE.ConeGeometry(1.3, 0.72, 4), roofMat);
      sideEave.rotation.y = Math.PI / 4;
      sideEave.scale.set(1.1, 1, 0.7);
      sideEave.position.set(ex, 4.82, 0);
      sideEave.castShadow = true;
      roofGroup.add(sideEave);
    });

    const plaqueMat = new THREE.MeshStandardMaterial({ map: gatePlaqueTex, roughness: 0.4, metalness: 0.2 });
    const plaque = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.72, 0.22), plaqueMat);
    plaque.position.set(0, 4.35, 0.44);
    roofGroup.add(plaque);

    [-1.72, 1.72].forEach((lx) => {
      const lGroup = new THREE.Group();
      lGroup.position.set(lx, 4.1, 0.5);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.27, 12, 10), lanternMat);
      bulb.position.y = -0.34;
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 0.12, 10), goldMat);
      cap.position.y = -0.1;
      const tassel = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.08, 0.26, 8), goldMat);
      tassel.position.y = -0.7;
      lGroup.add(bulb, cap, tassel);
      roofGroup.add(lGroup);
      lanterns.push(lGroup);
    });
  } else if (style === "market") {
    const backWall = new THREE.Mesh(new THREE.BoxGeometry(6.0, 3.0, 0.55), wallMat);
    backWall.position.set(0, 1.62, -1.75);
    backWall.castShadow = true;
    backWall.receiveShadow = true;
    group.add(backWall);

    const floor = new THREE.Mesh(new THREE.BoxGeometry(6.2, 0.04, 4.4), floorWoodMat);
    floor.position.set(0, 0.13, 0);
    group.add(floor);

    const counter = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.9, 0.9), timberMat);
    counter.position.set(0, 0.55, -0.95);
    counter.castShadow = true;
    group.add(counter);

    const crateColors = [0xef4444, 0xf59e0b, 0x22c55e];
    crateColors.forEach((col, i) => {
      const cx = -1.4 + i * 1.4;
      const crate = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.36, 0.7), timberMat);
      crate.position.set(cx, 1.18, -0.95);
      group.add(crate);

      const fruitMat = new THREE.MeshStandardMaterial({ color: col, roughness: 0.42 });
      for (let f = 0; f < 4; f += 1) {
        const fruit = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), fruitMat);
        fruit.position.set(cx + (f % 2 === 0 ? -0.22 : 0.22), 1.44, -0.95 + (f < 2 ? -0.16 : 0.16));
        group.add(fruit);
      }
    });

    [-2.7, 2.7].forEach((px) => {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.16, 3.3, 8), timberMat);
      post.position.set(px, 1.78, 1.85);
      post.castShadow = true;
      group.add(post);
    });

    const awning = new THREE.Mesh(new THREE.BoxGeometry(6.8, 0.26, 4.6), roofMat);
    awning.position.set(0, 3.55, 0.15);
    awning.rotation.x = 0.12;
    awning.castShadow = true;
    roofGroup.add(awning);

    const sign = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.65, 0.24), goldMat);
    sign.position.set(0, 4.05, 0.55);
    roofGroup.add(sign);
  } else if (style === "station") {
    const backWall = new THREE.Mesh(new THREE.BoxGeometry(6.0, 2.9, 0.5), wallMat);
    backWall.position.set(0, 1.56, -1.75);
    backWall.castShadow = true;
    group.add(backWall);

    const floor = new THREE.Mesh(new THREE.BoxGeometry(6.2, 0.04, 4.4), floorWoodMat);
    floor.position.set(0, 0.13, 0);
    group.add(floor);

    const routeBoard = new THREE.Mesh(new THREE.BoxGeometry(2.8, 1.25, 0.14), glassMat);
    routeBoard.position.set(0, 1.9, -1.42);
    group.add(routeBoard);

    const benchSeat = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.14, 0.55), timberMat);
    benchSeat.position.set(-1.35, 0.55, -0.75);
    const benchLegs = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.38, 0.35), stoneMat);
    benchLegs.position.set(-1.35, 0.32, -0.75);
    group.add(benchSeat, benchLegs);

    [-2.7, 2.7].forEach((px) => {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.16, 3.35, 10), stoneMat);
      post.position.set(px, 1.8, 1.82);
      group.add(post);
    });

    const canopy = new THREE.Mesh(new THREE.BoxGeometry(6.8, 0.26, 4.7), roofMat);
    canopy.position.set(0, 3.6, 0.05);
    canopy.castShadow = true;
    roofGroup.add(canopy);

    const beaconSign = new THREE.Mesh(new THREE.OctahedronGeometry(0.45, 0), goldMat);
    beaconSign.position.set(2.35, 4.45, 1.25);
    roofGroup.add(beaconSign);
    lanterns.push(beaconSign);
  } else {
    // Fully Enterable Hollow Architectural Buildings (1, 2, or 3 Floors!)
    const wallH = 3.2;
    const wallY = 1.72;
    const northWall = new THREE.Mesh(new THREE.BoxGeometry(6.6, wallH, 0.38), wallMat);
    northWall.position.set(0, wallY, -2.35);
    northWall.castShadow = true;
    northWall.receiveShadow = true;

    const westWall = new THREE.Mesh(new THREE.BoxGeometry(0.38, wallH, 4.55), wallMat);
    westWall.position.set(-3.25, wallY, -0.18);
    westWall.castShadow = true;
    westWall.receiveShadow = true;

    const eastWall = new THREE.Mesh(new THREE.BoxGeometry(0.38, wallH, 4.55), wallMat);
    eastWall.position.set(3.25, wallY, -0.18);
    eastWall.castShadow = true;
    eastWall.receiveShadow = true;

    const frontLeft = new THREE.Mesh(new THREE.BoxGeometry(1.9, wallH, 0.38), wallMat);
    frontLeft.position.set(-2.32, wallY, 1.95);
    frontLeft.castShadow = true;

    const frontRight = new THREE.Mesh(new THREE.BoxGeometry(1.9, wallH, 0.38), wallMat);
    frontRight.position.set(2.32, wallY, 1.95);
    frontRight.castShadow = true;

    const doorHeader = new THREE.Mesh(new THREE.BoxGeometry(2.85, 0.65, 0.42), timberMat);
    doorHeader.position.set(0, 3.0, 1.95);

    [-1.42, 1.42].forEach((dx) => {
      const jamb = new THREE.Mesh(new THREE.BoxGeometry(0.18, wallH, 0.46), timberMat);
      jamb.position.set(dx, wallY, 1.95);
      group.add(jamb);
    });

    [-3.32, 3.32].forEach((cx) => {
      [-2.4, 2.02].forEach((cz) => {
        const col = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.16, 3.35, 10), timberMat);
        col.position.set(cx, 1.8, cz);
        col.castShadow = true;
        group.add(col);
      });
    });

    [-2.32, 2.32].forEach((wx) => {
      const frame = new THREE.Mesh(new THREE.BoxGeometry(1.15, 1.15, 0.44), timberMat);
      frame.position.set(wx, 1.95, 1.96);
      const win = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.95, 0.48), glassMat);
      win.position.set(wx, 1.95, 1.96);
      group.add(frame, win);
    });

    const interiorFloor = new THREE.Mesh(new THREE.BoxGeometry(6.2, 0.04, 4.15), floorWoodMat);
    interiorFloor.position.set(0, 0.14, -0.2);
    interiorFloor.receiveShadow = true;

    const rug = new THREE.Mesh(new THREE.BoxGeometry(2.9, 0.02, 2.2), rugMat);
    rug.position.set(0, 0.165, -0.2);
    rug.receiveShadow = true;

    group.add(northWall, westWall, eastWall, frontLeft, frontRight, doorHeader, interiorFloor, rug);

    // Multi-story walkable exterior East staircase & upper decks
    if (floors >= 2 && upperFloorGroup) {
      // Exterior East staircase treads (always visible in `group` so player sees & climbs them!)
      for (let s = 0; s < 10; s += 1) {
        const t = (s + 0.5) / 10;
        const step = new THREE.Mesh(new THREE.BoxGeometry(1.68, 0.18, 0.44), timberMat);
        step.position.set(4.32, t * FLOOR_2_Y - 0.09, 2.65 - t * 4.35);
        step.castShadow = true;
        step.receiveShadow = true;
        group.add(step);
      }
      const eastRail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 4.6), goldMat);
      eastRail.position.set(5.12, FLOOR_2_Y * 0.55 + 0.65, 0.45);
      eastRail.rotation.x = 0.66;
      group.add(eastRail);

      // Floor 2 Deck + Balcony Guard Walls (cutaway together in `upperFloorGroup`)
      const f2Deck = new THREE.Mesh(new THREE.BoxGeometry(8.6, 0.22, 4.8), floorWoodMat);
      f2Deck.position.set(0.85, FLOOR_2_Y - 0.11, -0.15);
      f2Deck.receiveShadow = true;
      f2Deck.castShadow = true;
      upperFloorGroup.add(f2Deck);

      const f2Rug = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.03, 2.4), rugMat);
      f2Rug.position.set(0, FLOOR_2_Y + 0.015, -0.15);
      upperFloorGroup.add(f2Rug);

      const f2NorthWall = new THREE.Mesh(new THREE.BoxGeometry(6.7, 2.5, 0.34), wallMat);
      f2NorthWall.position.set(0, FLOOR_2_Y + 1.25, -2.35);
      f2NorthWall.castShadow = true;
      upperFloorGroup.add(f2NorthWall);

      // Floor 2 Front & West Glass/Timber Safety Railings
      const frontRail = new THREE.Mesh(new THREE.BoxGeometry(6.6, 0.12, 0.12), timberMat);
      frontRail.position.set(0, FLOOR_2_Y + 0.85, 2.15);
      const frontGlass = new THREE.Mesh(new THREE.BoxGeometry(6.4, 0.72, 0.06), glassMat);
      frontGlass.position.set(0, FLOOR_2_Y + 0.42, 2.15);
      const westRail = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.85, 4.4), timberMat);
      westRail.position.set(-3.35, FLOOR_2_Y + 0.45, -0.1);
      upperFloorGroup.add(frontRail, frontGlass, westRail);

      // Lantai 2 cozy lounge benches
      [-2.1, 2.1].forEach((bx) => {
        const sofa = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.48, 0.72), rugMat);
        sofa.position.set(bx, FLOOR_2_Y + 0.24, -1.65);
        upperFloorGroup!.add(sofa);
      });

      // Floor 3 West Staircase & Rooftop Panorama Deck for Menara Pandang
      if (floors === 3) {
        for (let s = 0; s < 10; s += 1) {
          const t = (s + 0.5) / 10;
          const step3 = new THREE.Mesh(new THREE.BoxGeometry(1.68, 0.18, 0.44), timberMat);
          step3.position.set(-4.32, FLOOR_2_Y + t * (FLOOR_3_Y - FLOOR_2_Y) - 0.09, 2.65 - t * 4.35);
          step3.castShadow = true;
          upperFloorGroup.add(step3);
        }
        const f3Deck = new THREE.Mesh(new THREE.BoxGeometry(8.5, 0.22, 4.7), stoneMat);
        f3Deck.position.set(-0.9, FLOOR_3_Y - 0.11, -0.15);
        f3Deck.receiveShadow = true;
        upperFloorGroup.add(f3Deck);

        const f3RailN = new THREE.Mesh(new THREE.BoxGeometry(6.6, 0.82, 0.1), goldMat);
        f3RailN.position.set(0, FLOOR_3_Y + 0.42, -2.38);
        const f3RailS = new THREE.Mesh(new THREE.BoxGeometry(6.6, 0.82, 0.1), goldMat);
        f3RailS.position.set(0, FLOOR_3_Y + 0.42, 2.1);
        const telescope = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 1.15, 8), goldMat);
        telescope.position.set(2.1, FLOOR_3_Y + 0.65, 1.5);
        telescope.rotation.x = 0.5;
        upperFloorGroup.add(f3RailN, f3RailS, telescope);
      }
    }

    const roofBaseY = floors === 3 ? FLOOR_3_Y + 2.65 : floors === 2 ? FLOOR_2_Y + 2.85 : 3.45;
    if (floors === 3) {
      // Open-air pagoda corner columns & spire canopy high above Floor 3 so rooftop is walkable!
      [-3.1, 3.1].forEach((px) => {
        [-2.2, 1.9].forEach((pz) => {
          const col = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 2.6, 8), timberMat);
          col.position.set(px, FLOOR_3_Y + 1.3, pz);
          roofGroup.add(col);
        });
      });
    }

    const lowerEave = new THREE.Mesh(new THREE.BoxGeometry(7.6, 0.22, 5.4), timberMat);
    lowerEave.position.set(0, roofBaseY, -0.2);
    lowerEave.castShadow = true;
    roofGroup.add(lowerEave);

    const roof = new THREE.Mesh(new THREE.ConeGeometry(5.2, 1.85, 4), roofMat);
    roof.rotation.y = Math.PI / 4;
    roof.scale.set(1.18, 1, 0.86);
    roof.position.set(0, roofBaseY + 1.0, -0.2);
    roof.castShadow = true;
    roofGroup.add(roof);

    const ceilingOrb = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 8), lanternMat);
    ceilingOrb.position.set(0, roofBaseY - 0.3, -0.2);
    roofGroup.add(ceilingOrb);

    // Tailored Interior Props & Furniture per building style
    if (style === "classroom") {
      const boardFrame = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.15, 0.12), timberMat);
      boardFrame.position.set(0, 1.85, -2.08);
      const boardFace = new THREE.Mesh(
        new THREE.BoxGeometry(2.35, 0.95, 0.14),
        new THREE.MeshStandardMaterial({ color: 0x064e3b, roughness: 0.8 }),
      );
      boardFace.position.set(0, 1.85, -2.06);
      group.add(boardFrame, boardFace);

      [-1.75, 1.75].forEach((dx) => {
        const desk = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.65, 0.65), timberMat);
        desk.position.set(dx, 0.48, -0.8);
        group.add(desk);
      });
    } else if (style === "clinic") {
      const crossH = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.25, 0.22), lanternMat);
      const crossV = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.9, 0.22), lanternMat);
      crossH.position.set(0, 3.8, 2.02);
      crossV.position.set(0, 3.8, 2.02);
      roofGroup.add(crossH, crossV);

      const desk = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.92, 0.72), stoneMat);
      desk.position.set(0, 0.62, -1.65);
      const medCab = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.5, 0.4), wallMat);
      medCab.position.set(-2.25, 0.92, -1.75);
      group.add(desk, medCab);
    } else if (style === "lab") {
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.14, 1.7, 8), goldMat);
      mast.position.set(1.5, 5.1, 0);
      const dish = new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), stoneMat);
      dish.position.set(1.5, 5.75, 0);
      dish.rotation.x = Math.PI * 0.75;
      roofGroup.add(mast, dish);

      const consoleDesk = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.85, 0.75), stoneMat);
      consoleDesk.position.set(0, 0.58, -1.65);
      const holoScreen = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.85, 0.1), glassMat);
      holoScreen.position.set(0, 1.48, -1.72);
      group.add(consoleDesk, holoScreen);
    } else if (style === "teahouse" || style === "cafe") {
      const finial = new THREE.Mesh(new THREE.SphereGeometry(0.34, 12, 10), goldMat);
      finial.position.set(0, roofBaseY + 2.0, -0.2);
      roofGroup.add(finial);

      const bar = new THREE.Mesh(new THREE.BoxGeometry(2.9, 0.92, 0.72), timberMat);
      bar.position.set(0, 0.62, -1.68);
      const kettle = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), goldMat);
      kettle.position.set(-0.55, 1.24, -1.65);
      const kettle2 = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 0.36, 10), lanternMat);
      kettle2.position.set(0.65, 1.26, -1.65);
      group.add(bar, kettle, kettle2);

      [-2.0, 2.0].forEach((tx) => {
        const table = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.08, 12), timberMat);
        table.position.set(tx, 0.72, -0.15);
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 0.55, 8), timberMat);
        leg.position.set(tx, 0.42, -0.15);
        group.add(table, leg);
      });
    } else if (style === "library") {
      const bookColors = [0x2563eb, 0xdc2626, 0x059669, 0xd97706];
      [-2.15, 0, 2.15].forEach((bx, idx) => {
        const shelf = new THREE.Mesh(new THREE.BoxGeometry(1.45, 2.1, 0.45), timberMat);
        shelf.position.set(bx, 1.2, -1.85);
        group.add(shelf);
        const stripe = new THREE.Mesh(
          new THREE.BoxGeometry(1.25, 0.35, 0.48),
          new THREE.MeshStandardMaterial({ color: bookColors[idx % bookColors.length], roughness: 0.7 }),
        );
        stripe.position.set(bx, 1.55, -1.85);
        group.add(stripe);
      });
    } else if (style === "hall") {
      const stageDais = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.32, 1.3), goldMat);
      stageDais.position.set(0, 0.3, -1.55);
      const lectern = new THREE.Mesh(new THREE.BoxGeometry(0.75, 1.05, 0.5), timberMat);
      lectern.position.set(0, 0.92, -1.25);
      group.add(stageDais, lectern);
    } else if (style === "gallery") {
      [-1.95, 0, 1.95].forEach((gx) => {
        const ped = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.0, 0.7), stoneMat);
        ped.position.set(gx, 0.65, -1.55);
        const art = new THREE.Mesh(new THREE.OctahedronGeometry(0.26, 0), goldMat);
        art.position.set(gx, 1.42, -1.55);
        group.add(ped, art);
        lanterns.push(art);
      });
    } else if (style === "tower") {
      const spire = new THREE.Mesh(new THREE.ConeGeometry(1.3, 2.2, 8), roofMat);
      spire.position.set(0, roofBaseY + 2.4, -0.2);
      roofGroup.add(spire);

      const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.72, 1.05, 12), stoneMat);
      pedestal.position.set(0, 0.68, -1.45);
      const globe = new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 10), goldMat);
      globe.position.set(0, 1.45, -1.45);
      group.add(pedestal, globe);
    } else if (style === "arcade") {
      // Glowing arcade cabinets on Lt.1
      [-1.85, 0, 1.85].forEach((ax) => {
        const cab = new THREE.Mesh(new THREE.BoxGeometry(0.85, 1.85, 0.68), timberMat);
        cab.position.set(ax, 1.05, -1.78);
        const screen = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.58, 0.08), glassMat);
        screen.position.set(ax, 1.35, -1.42);
        group.add(cab, screen);
      });
    } else if (style === "dorm") {
      [-1.95, 1.95].forEach((dx) => {
        const bed = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.5, 1.1), rugMat);
        bed.position.set(dx, 0.4, -1.5);
        group.add(bed);
      });
      const studyTable = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.75, 0.65), timberMat);
      studyTable.position.set(0, 0.52, -1.75);
      group.add(studyTable);
    } else if (style === "mall") {
      const bobaBar = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.95, 0.78), timberMat);
      bobaBar.position.set(0, 0.62, -1.7);
      const neonSign = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.5, 0.14), goldMat);
      neonSign.position.set(0, 2.2, -1.95);
      group.add(bobaBar, neonSign);
    } else if (style === "cinema") {
      const bigScreen = new THREE.Mesh(new THREE.BoxGeometry(4.4, 1.85, 0.12), glassMat);
      bigScreen.position.set(0, 1.65, -2.02);
      const seats = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.45, 0.72), lanternMat);
      seats.position.set(0, 0.36, -0.55);
      group.add(bigScreen, seats);
    } else if (style === "music") {
      const stage = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.28, 1.5), goldMat);
      stage.position.set(0, 0.28, -1.4);
      const synth = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.16, 0.58), glassMat);
      synth.position.set(0, 1.05, -1.4);
      const synthStand = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.62, 0.3), timberMat);
      synthStand.position.set(0, 0.66, -1.4);
      [-2.35, 2.35].forEach((sx) => {
        const spk = new THREE.Mesh(new THREE.BoxGeometry(0.75, 1.55, 0.65), stoneMat);
        spk.position.set(sx, 0.92, -1.65);
        group.add(spk);
      });
      group.add(stage, synth, synthStand);
    } else if (style === "petcafe") {
      const whiteFur = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.7 });
      const blackFur = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.7 });
      const pandaBody = new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 10), whiteFur);
      pandaBody.position.set(-1.35, 0.56, -1.25);
      const pandaHead = new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 10), whiteFur);
      pandaHead.position.set(-1.35, 1.12, -1.22);
      [-1.56, -1.14].forEach((ex) => {
        const ear = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8), blackFur);
        ear.position.set(ex, 1.38, -1.22);
        const patch = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), blackFur);
        patch.position.set(ex === -1.56 ? -1.46 : -1.24, 1.14, -0.94);
        group.add(ear, patch);
      });
      // Cute orange kitty on counter
      const catMat = new THREE.MeshStandardMaterial({ color: 0xfb923c, roughness: 0.6 });
      const counter = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.85, 0.72), timberMat);
      counter.position.set(1.2, 0.56, -1.45);
      const kitty = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 8), catMat);
      kitty.position.set(1.2, 1.2, -1.4);
      group.add(pandaBody, pandaHead, counter, kitty);
    } else if (style === "dojo") {
      const dummyPost = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 1.85, 10), timberMat);
      dummyPost.position.set(-1.2, 1.05, -1.4);
      const armPeg = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.1, 0.1), goldMat);
      armPeg.position.set(-1.2, 1.45, -1.3);
      const scrollWall = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.4, 0.12), lanternMat);
      scrollWall.position.set(1.2, 1.65, -2.05);
      group.add(dummyPost, armPeg, scrollWall);
    } else if (style === "mart") {
      const counter = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.92, 0.78), timberMat);
      counter.position.set(0, 0.6, -1.55);
      const capsuleCols = [0xec4899, 0xfbbf24, 0x38bdf8];
      [-1.05, 0, 1.05].forEach((gx, idx) => {
        const globe = new THREE.Mesh(
          new THREE.SphereGeometry(0.32, 12, 10),
          new THREE.MeshStandardMaterial({ color: capsuleCols[idx], roughness: 0.2, metalness: 0.2 }),
        );
        globe.position.set(gx, 1.38, -1.55);
        group.add(globe);
      });
      group.add(counter);
    } else if (style === "observatory") {
      const domeRing = new THREE.Mesh(new THREE.TorusGeometry(2.4, 0.18, 10, 24), goldMat);
      domeRing.rotation.x = Math.PI / 2;
      domeRing.position.set(0, FLOOR_3_Y + 2.6, -0.2);
      roofGroup.add(domeRing);

      const starTable = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.85, 14), stoneMat);
      starTable.position.set(0, 0.56, -1.4);
      const starGlobe = new THREE.Mesh(new THREE.SphereGeometry(0.36, 12, 10), glassMat);
      starGlobe.position.set(0, 1.3, -1.4);
      group.add(starTable, starGlobe);
      lanterns.push(starGlobe);
    } else if (style === "scooter") {
      [-1.4, 1.4].forEach((sx) => {
        const pad = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.12, 1.8), glassMat);
        pad.position.set(sx, 0.22, -1.2);
        const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.1, 8), goldMat);
        bar.position.set(sx, 0.82, -0.65);
        group.add(pad, bar);
      });
    }
  }

  const proxyH = floors === 3 ? 11.2 : floors === 2 ? 7.8 : 5.8;
  const clickProxy = new THREE.Mesh(
    new THREE.BoxGeometry(8.6, proxyH, 6.2),
    new THREE.MeshBasicMaterial({ visible: false }),
  );
  clickProxy.position.set(0, proxyH * 0.5, 0);
  group.add(clickProxy);

  return { group, roofGroup, upperFloorGroup, lanterns, windowMats, clickProxy };
}

function buildLotusPondAndBridge(stoneMat: THREE.MeshStandardMaterial, timberMat: THREE.MeshStandardMaterial): {
  group: THREE.Group;
  waterUniforms: { time: { value: number } };
} {
  const group = new THREE.Group();

  // Stone pond rim
  const rim = new THREE.Mesh(new THREE.TorusGeometry(3.35, 0.28, 10, 28), stoneMat);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.18;
  rim.receiveShadow = true;
  rim.castShadow = true;
  group.add(rim);

  // Dark pond bed so water has rich depth
  const bed = new THREE.Mesh(
    new THREE.CircleGeometry(3.3, 28),
    new THREE.MeshStandardMaterial({ color: 0x0f2936, roughness: 0.9 }),
  );
  bed.rotation.x = -Math.PI / 2;
  bed.position.y = 0.06;
  group.add(bed);

  // Animated GLSL Water surface
  const waterUniforms = { time: { value: 0 } };
  const waterMat = new THREE.ShaderMaterial({
    uniforms: waterUniforms,
    transparent: true,
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec2 vUv;
      uniform float time;
      void main() {
        vec2 p = vUv - 0.5;
        float dist = length(p);
        float ripple = sin(dist * 34.0 - time * 2.4) * 0.5 + 0.5;
        float shimmer = sin(p.x * 22.0 + time * 1.5) * cos(p.y * 20.0 - time * 1.2) * 0.5 + 0.5;
        vec3 deepJade = vec3(0.07, 0.34, 0.42);
        vec3 surfaceAqua = vec3(0.22, 0.65, 0.72);
        vec3 col = mix(deepJade, surfaceAqua, ripple * 0.32 + shimmer * 0.24);
        float edgeFade = smoothstep(0.5, 0.44, dist);
        gl_FragColor = vec4(col, 0.86 * edgeFade);
      }
    `,
  });
  const water = new THREE.Mesh(new THREE.CircleGeometry(3.25, 28), waterMat);
  water.rotation.x = -Math.PI / 2;
  water.position.y = 0.16;
  group.add(water);

  // Floating lily pads & lotus blossoms
  const padMat = new THREE.MeshStandardMaterial({ color: 0x15803d, roughness: 0.75 });
  const lotusMat = new THREE.MeshStandardMaterial({
    color: 0xf472b6,
    emissive: new THREE.Color(0xbe185d),
    emissiveIntensity: 0.22,
    roughness: 0.45,
  });

  const padCoords: [number, number, boolean][] = [
    [-1.4, 1.1, true],
    [1.6, -0.9, true],
    [-1.7, -1.2, false],
    [1.2, 1.5, true],
    [0.2, -1.8, false],
  ];
  padCoords.forEach(([px, pz, hasLotus], i) => {
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.04, 14), padMat);
    pad.position.set(px, 0.19, pz);
    pad.rotation.y = i * 0.9;
    group.add(pad);
    if (hasLotus) {
      const bloom = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.26, 7), lotusMat);
      bloom.rotation.x = Math.PI;
      bloom.position.set(px, 0.32, pz);
      group.add(bloom);
    }
  });

  // Small arched wooden footbridge spanning the center
  const bridgeDeck = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.18, 1.25), timberMat);
  bridgeDeck.position.set(0, 0.58, 0);
  bridgeDeck.castShadow = true;
  group.add(bridgeDeck);

  [-0.55, 0.55].forEach((rz) => {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(5.0, 0.09, 0.09), timberMat);
    rail.position.set(0, 1.05, rz);
    group.add(rail);
    [-2.0, 0, 2.0].forEach((rx) => {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.54, 0.11), timberMat);
      post.position.set(rx, 0.82, rz);
      group.add(post);
    });
  });

  return { group, waterUniforms };
}

function buildBambooGazebo(
  stoneMat: THREE.MeshStandardMaterial,
  timberMat: THREE.MeshStandardMaterial,
  goldMat: THREE.MeshStandardMaterial,
): THREE.Group {
  const group = new THREE.Group();

  const base = new THREE.Mesh(new THREE.CylinderGeometry(2.55, 2.75, 0.34, 8), stoneMat);
  base.position.y = 0.17;
  base.receiveShadow = true;
  base.castShadow = true;
  group.add(base);

  const pillarMat = new THREE.MeshStandardMaterial({ color: 0xb91c1c, roughness: 0.65 });
  for (let i = 0; i < 4; i += 1) {
    const angle = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 2.8, 10), pillarMat);
    pillar.position.set(Math.cos(angle) * 1.7, 1.7, Math.sin(angle) * 1.7);
    pillar.castShadow = true;
    group.add(pillar);
  }

  const roofMat = new THREE.MeshStandardMaterial({ color: 0x0f766e, roughness: 0.45, metalness: 0.15 });
  const roof = new THREE.Mesh(new THREE.ConeGeometry(2.9, 1.3, 8), roofMat);
  roof.position.y = 3.7;
  roof.castShadow = true;
  group.add(roof);

  const finial = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 8), goldMat);
  finial.position.y = 4.42;
  group.add(finial);

  const benchRing = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, 0.45, 8), timberMat);
  benchRing.position.y = 0.56;
  group.add(benchRing);

  return group;
}

export const CampusScene3D: React.FC<CampusScene3DProps> = ({
  gameState,
  theme,
  chapters,
  activeChapterId,
  chapterStars,
  orbs = [],
  collectedOrbIds = [],
  localJacketHex = "#1d4ed8",
  localGender = "boy",
  onScooter = false,
  remotePlayersRef,
  ballStateRef,
  localSocialBurst = null,
  walkToTargetRef,
  onCollectOrb,
  onSelectChapter,
  onSelectBuilding,
  onInsideBuildingChange,
  onNearbyPropChange,
  minigame = null,
  mpSelfId = null,
  onStepSound,
  virtualMoveRef,
  virtualSprintRef,
  jumpTriggerRef,
  cameraPreset = "normal",
  cameraZoomDeltaRef,
  cameraResetTriggerRef,
  telemetryRef,
  onTelemetryTick,
  onNearbyChapterChange,
  controlsDisabled = false,
  graduationMode = false,
  graduationCelebrateNonce = 0,
}) => {
  const mountRef = useRef<HTMLDivElement>(null);

  const propsRef = useRef({
    gameState,
    theme,
    activeChapterId,
    chapterStars,
    orbs,
    collectedOrbIds,
    localJacketHex,
    localGender,
    onScooter,
    remotePlayersRef,
    ballStateRef,
    localSocialBurst,
    walkToTargetRef,
    onCollectOrb,
    onSelectChapter,
    onSelectBuilding,
    onInsideBuildingChange,
    onNearbyPropChange,
    minigame,
    mpSelfId,
    onStepSound,
    virtualMoveRef,
    virtualSprintRef,
    jumpTriggerRef,
    cameraPreset,
    cameraZoomDeltaRef,
    cameraResetTriggerRef,
    telemetryRef,
    onTelemetryTick,
    onNearbyChapterChange,
    controlsDisabled,
    graduationMode,
    graduationCelebrateNonce,
  });
  propsRef.current = {
    gameState,
    theme,
    activeChapterId,
    chapterStars,
    orbs,
    collectedOrbIds,
    localJacketHex,
    localGender,
    onScooter,
    remotePlayersRef,
    ballStateRef,
    localSocialBurst,
    walkToTargetRef,
    onCollectOrb,
    onSelectChapter,
    onSelectBuilding,
    onInsideBuildingChange,
    onNearbyPropChange,
    minigame,
    mpSelfId,
    onStepSound,
    virtualMoveRef,
    virtualSprintRef,
    jumpTriggerRef,
    cameraPreset,
    cameraZoomDeltaRef,
    cameraResetTriggerRef,
    telemetryRef,
    onTelemetryTick,
    onNearbyChapterChange,
    controlsDisabled,
    graduationMode,
    graduationCelebrateNonce,
  };

  const targetChapterWaypointRef = useRef<THREE.Vector3 | null>(null);
  const prevChapterIdRef = useRef(activeChapterId);

  useEffect(() => {
    if (prevChapterIdRef.current !== activeChapterId) {
      prevChapterIdRef.current = activeChapterId;
      const found = chapters.find((c) => c.id === activeChapterId);
      if (found) {
        targetChapterWaypointRef.current = new THREE.Vector3(
          found.worldPos[0],
          0,
          found.worldPos[2] + 4.4,
        );
      }
    }
  }, [activeChapterId, chapters]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const isSoftwareGl = (() => {
      try {
        const probe = document.createElement("canvas");
        const gl = probe.getContext("webgl2") || probe.getContext("webgl");
        if (!gl) return true;
        const ext = gl.getExtension("WEBGL_debug_renderer_info");
        const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
        const gpu = String(gl.getParameter(param));
        gl.getExtension("WEBGL_lose_context")?.loseContext();
        return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
      } catch {
        return true;
      }
    })();

    const scene = new THREE.Scene();
    const initialBg = propsRef.current.theme === "dark" ? 0x0e172a : 0xd5e9fa;
    scene.background = new THREE.Color(initialBg);
    scene.fog = new THREE.FogExp2(initialBg, 0.0042);

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;
    const initialAspect = width / Math.max(1, height);
    const camera = new THREE.PerspectiveCamera(
      computeResponsiveFov(initialAspect),
      initialAspect,
      0.2,
      360,
    );
    camera.position.set(0, 12, 29);

    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: "high-performance",
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    renderer.domElement.style.display = "block";
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    renderer.domElement.style.touchAction = "none";
    renderer.domElement.style.cursor = "grab";
    renderer.domElement.setAttribute("data-testid", "campus-canvas");
    container.appendChild(renderer.domElement);

    const pmrem = new THREE.PMREMGenerator(renderer);
    const envTexture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTexture;
    pmrem.dispose();

    // Dynamic Gradient Sky Dome + Night Starfield + Moon
    const skyUniforms = {
      topColor: { value: new THREE.Color(0x5fa8e8) },
      bottomColor: { value: new THREE.Color(0xe6f2fc) },
      sunDir: { value: new THREE.Vector3(0.45, 0.62, 0.42).normalize() },
      sunGlowColor: { value: new THREE.Color(0xfff1c9) },
      sunStrength: { value: 0.42 },
    };
    const skyDome = new THREE.Mesh(
      new THREE.SphereGeometry(240, 24, 16),
      new THREE.ShaderMaterial({
        uniforms: skyUniforms,
        side: THREE.BackSide,
        depthWrite: false,
        vertexShader: `
          varying vec3 vWorldDir;
          void main() {
            vec4 wp = modelMatrix * vec4(position, 1.0);
            vWorldDir = normalize(wp.xyz);
            gl_Position = projectionMatrix * viewMatrix * wp;
          }
        `,
        fragmentShader: `
          varying vec3 vWorldDir;
          uniform vec3 topColor;
          uniform vec3 bottomColor;
          uniform vec3 sunDir;
          uniform vec3 sunGlowColor;
          uniform float sunStrength;
          void main() {
            float h = clamp(vWorldDir.y, 0.0, 1.0);
            vec3 sky = mix(bottomColor, topColor, pow(h, 0.62));
            float sunAmt = max(dot(normalize(vWorldDir), sunDir), 0.0);
            sky += sunGlowColor * pow(sunAmt, 14.0) * sunStrength;
            gl_FragColor = vec4(sky, 1.0);
          }
        `,
      }),
    );
    scene.add(skyDome);

    // Subtle Starfield + Moon (revealed in Dark Mode)
    const starPositions = new Float32Array(260 * 3);
    for (let i = 0; i < 260; i += 1) {
      const theta = ((i * 137.5) % 360) * (Math.PI / 180);
      const phi = 0.15 + ((i * 37) % 100) / 115;
      const r = 210;
      starPositions[i * 3] = Math.cos(theta) * Math.cos(phi) * r;
      starPositions[i * 3 + 1] = Math.sin(phi) * r + 15;
      starPositions[i * 3 + 2] = Math.sin(theta) * Math.cos(phi) * r;
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute("position", new THREE.BufferAttribute(starPositions, 3));
    const starMat = new THREE.PointsMaterial({ color: 0xf8fafc, size: 1.35, transparent: true, opacity: 0 });
    const starField = new THREE.Points(starGeo, starMat);
    scene.add(starField);

    const moonMesh = new THREE.Mesh(
      new THREE.SphereGeometry(5.6, 16, 12),
      new THREE.MeshBasicMaterial({ color: 0xfef3c7, transparent: true, opacity: 0 }),
    );
    moonMesh.position.set(-76, 82, -135);
    scene.add(moonMesh);

    // Three-point contrast lighting
    const hemiLight = new THREE.HemisphereLight(0x9bd2ff, 0x4c6b53, 1.05);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfff3db, 2.05);
    keyLight.position.set(42, 68, 38);
    keyLight.castShadow = !isSoftwareGl;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.near = 5;
    keyLight.shadow.camera.far = 190;
    keyLight.shadow.camera.left = -82;
    keyLight.shadow.camera.right = 82;
    keyLight.shadow.camera.top = 82;
    keyLight.shadow.camera.bottom = -82;
    keyLight.shadow.bias = -0.0005;
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0xc7d2fe, 0.45);
    rimLight.position.set(-34, 24, -46);
    scene.add(rimLight);

    // Shared procedural textures & materials
    const maxAniso = renderer.capabilities.getMaxAnisotropy();
    const groundTex = createGroundTexture();
    groundTex.repeat.set(34, 34);
    groundTex.anisotropy = maxAniso;
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(420, 420),
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        map: groundTex,
        roughness: 0.92,
        metalness: 0.02,
      }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    const { map: paverMap, bumpMap: paverBump } = createPaverTextures();
    paverMap.anisotropy = maxAniso;
    paverBump.anisotropy = maxAniso;
    const plazaMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: paverMap,
      bumpMap: paverBump,
      bumpScale: 0.035,
      roughness: 0.84,
      metalness: 0.04,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });

    // Expanded Open-World Stone Boulevard Network
    const roadSpecs: [number, number, number, number][] = [
      [0, -10, 8.0, 128],   // Main N-S Spine
      [0, 4, 118, 5.8],     // Central E-W Avenue
      [0, -30, 96, 5.4],    // Mid-North Avenue (Station & Clinic)
      [0, -42, 122, 5.2],   // Mall & Cinema E-W Avenue
      [0, -60, 98, 5.4],    // Upper North Avenue (Lab, Teahouse, Hall, Maze & Parkour)
      [0, 22, 122, 5.2],    // South Dorm & Arcade E-W Avenue
      [0, 32, 76, 5.2],     // South Lakeside Avenue (Gallery & Tower)
      [-46, -12, 5.2, 52],  // West Library Connector
      [46, -12, 5.2, 52],   // East Cafe Connector
      [-56, -10, 5.2, 74],  // Outer West Dorm-Cinema Connector
      [56, -10, 5.2, 74],   // Outer East Arcade-Mall Connector
    ];
    roadSpecs.forEach(([rx, rz, rw, rd], idx) => {
      const road = new THREE.Mesh(new THREE.BoxGeometry(rw, 0.055, rd), plazaMat);
      road.position.set(rx, 0.028 + idx * 0.0005, rz);
      road.receiveShadow = true;
      scene.add(road);
    });

    const stoneMat = new THREE.MeshStandardMaterial({ color: 0xd6d3cd, roughness: 0.88, metalness: 0.03 });
    const wallTex = createWallPlasterTexture();
    const wallMat = new THREE.MeshStandardMaterial({ color: 0xffffff, map: wallTex, roughness: 0.78, metalness: 0.03 });
    const timberMat = new THREE.MeshStandardMaterial({ color: 0x6b3f24, roughness: 0.72, metalness: 0.05 });
    const roofBump = createRoofTileBumpTexture();
    const goldMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.25, metalness: 0.75 });
    const gatePlaqueTex = createGatePlaqueTexture();

    // Central Campus Compass Medallion
    const compassOuter = new THREE.Mesh(
      new THREE.RingGeometry(2.5, 3.0, 32),
      new THREE.MeshStandardMaterial({ color: 0x0f766e, roughness: 0.7 }),
    );
    compassOuter.rotation.x = -Math.PI / 2;
    compassOuter.position.set(0, 0.065, 8.0);
    const compassInner = new THREE.Mesh(
      new THREE.RingGeometry(1.0, 1.35, 24),
      new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.5 }),
    );
    compassInner.rotation.x = -Math.PI / 2;
    compassInner.position.set(0, 0.067, 8.0);
    scene.add(compassOuter, compassInner);

    // Scenic Lotus Pond & Multiple Park Gazebos (hiding nooks across Open World)
    const { group: lotusPondGroup, waterUniforms } = buildLotusPondAndBridge(stoneMat, timberMat);
    lotusPondGroup.position.set(-14, 0, -16);
    scene.add(lotusPondGroup);

    const gazeboCoords: [number, number][] = [
      [14, -16],
      [-42, -48],
      [42, -48],
      [0, 34],
    ];
    gazeboCoords.forEach(([gx, gz]) => {
      const gzGroup = buildBambooGazebo(stoneMat, timberMat, goldMat);
      gzGroup.position.set(gx, 0, gz);
      scene.add(gzGroup);
    });

    // Distant Perimeter Rolling Hills Ring around expanded 144x142 world
    const hillMat = new THREE.MeshStandardMaterial({ color: 0x4b7750, roughness: 0.94, metalness: 0.01 });
    const hillCount = 26;
    for (let i = 0; i < hillCount; i += 1) {
      const a = (i / hillCount) * Math.PI * 2;
      const dist = 124 + (i % 3) * 18;
      const hRad = 22 + (i % 4) * 6;
      const hScaleY = 0.36 + (i % 3) * 0.14;
      const hill = new THREE.Mesh(new THREE.SphereGeometry(hRad, 14, 10), hillMat);
      hill.position.set(Math.cos(a) * dist, -hRad * hScaleY * 0.45, Math.sin(a) * dist - 14);
      hill.scale.set(1.45, hScaleY, 1.15);
      hill.rotation.y = a;
      scene.add(hill);
    }

    // South Campus Mini Soccer Field + Server-Synced Ball
    const soccerGroup = new THREE.Group();
    soccerGroup.position.set(SOCCER_FIELD_CENTER.x, 0, SOCCER_FIELD_CENTER.z);
    const turfMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(26, 12.6),
      new THREE.MeshStandardMaterial({ color: 0x2f855a, roughness: 0.9 }),
    );
    turfMesh.rotation.x = -Math.PI / 2;
    turfMesh.position.y = 0.04;
    turfMesh.receiveShadow = true;
    soccerGroup.add(turfMesh);

    const lineMat = new THREE.MeshBasicMaterial({ color: 0xf8fafc });
    const midLine = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 12.2), lineMat);
    midLine.rotation.x = -Math.PI / 2;
    midLine.position.y = 0.052;
    const centerCircle = new THREE.Mesh(new THREE.RingGeometry(2.1, 2.28, 32), lineMat);
    centerCircle.rotation.x = -Math.PI / 2;
    centerCircle.position.y = 0.052;
    const northLine = new THREE.Mesh(new THREE.PlaneGeometry(25.2, 0.16), lineMat);
    northLine.rotation.x = -Math.PI / 2;
    northLine.position.set(0, 0.052, -6.1);
    const southLine = northLine.clone();
    southLine.position.set(0, 0.052, 6.1);
    const westLine = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 12.2), lineMat);
    westLine.rotation.x = -Math.PI / 2;
    westLine.position.set(-12.5, 0.052, 0);
    const eastLine = westLine.clone();
    eastLine.position.set(12.5, 0.052, 0);
    soccerGroup.add(midLine, centerCircle, northLine, southLine, westLine, eastLine);

    const postGoalMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35, metalness: 0.25 });
    [-12.6, 12.6].forEach((gx) => {
      const postA = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 2.2, 8), postGoalMat);
      postA.position.set(gx, 1.1, -2.7);
      const postB = postA.clone();
      postB.position.set(gx, 1.1, 2.7);
      const cross = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 5.6, 8), postGoalMat);
      cross.rotation.x = Math.PI / 2;
      cross.position.set(gx, 2.15, 0);
      soccerGroup.add(postA, postB, cross);
    });
    scene.add(soccerGroup);

    const ballMesh = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.45, 1),
      new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.45, metalness: 0.1 }),
    );
    ballMesh.position.set(SOCCER_FIELD_CENTER.x, 0.45, SOCCER_FIELD_CENTER.z);
    ballMesh.castShadow = !isSoftwareGl;
    const ballPatch = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.455, 0),
      new THREE.MeshStandardMaterial({ color: 0x0f172a, wireframe: true }),
    );
    ballMesh.add(ballPatch);
    scene.add(ballMesh);

    // 7 Cyan Launch Jump Pads (Trampolin Kampus)
    const jumpPadRings: THREE.Mesh[] = [];
    for (const jp of WORLD_JUMP_PADS) {
      const padGroup = new THREE.Group();
      padGroup.position.set(jp.x, 0.06, jp.z);
      const baseDisc = new THREE.Mesh(
        new THREE.CylinderGeometry(jp.radius, jp.radius * 1.12, 0.18, 24),
        new THREE.MeshStandardMaterial({
          color: 0x06b6d4,
          emissive: new THREE.Color(0x0891b2),
          emissiveIntensity: 0.7,
          roughness: 0.25,
        }),
      );
      baseDisc.position.y = 0.08;
      const haloRing = new THREE.Mesh(
        new THREE.TorusGeometry(jp.radius * 0.88, 0.07, 8, 28),
        new THREE.MeshBasicMaterial({ color: 0x67e8f9, transparent: true, opacity: 0.85 }),
      );
      haloRing.rotation.x = Math.PI / 2;
      haloRing.position.y = 0.48;
      jumpPadRings.push(haloRing);
      padGroup.add(baseDisc, haloRing);
      scene.add(padGroup);
    }

    // 4 Golden Speed Boost Pads (Jalur Kilat)
    const boostPadChevrons: THREE.Mesh[] = [];
    for (const bp of WORLD_BOOST_PADS) {
      const padGroup = new THREE.Group();
      padGroup.position.set(bp.x, 0.065, bp.z);
      const padBase = new THREE.Mesh(
        new THREE.BoxGeometry(2.4, 0.08, 2.4),
        new THREE.MeshStandardMaterial({
          color: 0xf59e0b,
          emissive: new THREE.Color(0xd97706),
          emissiveIntensity: 0.65,
          roughness: 0.25,
        }),
      );
      const chevron = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.32, 0),
        new THREE.MeshBasicMaterial({ color: 0xfef08a }),
      );
      chevron.position.y = 0.48;
      boostPadChevrons.push(chevron);
      padGroup.add(padBase, chevron);
      scene.add(padGroup);
    }

    // 4 Interactive Plaza Landmarks (Fountain, Scooter Dock, Lantern Rack, Gacha Machine)
    let fountainWaterJet: THREE.Group | null = null;
    const gachaGlobes: THREE.Mesh[] = [];
    const propLanterns: THREE.Object3D[] = [];
    for (const prop of WORLD_INTERACTIVE_PROPS) {
      const pGroup = new THREE.Group();
      pGroup.position.set(prop.x, 0, prop.z);

      const glowRing = new THREE.Mesh(
        new THREE.RingGeometry(1.55, 1.85, 28),
        new THREE.MeshBasicMaterial({
          color: prop.kind === "scooter_dock" ? 0x22d3ee : prop.kind === "fountain" ? 0x38bdf8 : 0xfbbf24,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.62,
        }),
      );
      glowRing.rotation.x = -Math.PI / 2;
      glowRing.position.y = 0.075;
      pGroup.add(glowRing);

      if (prop.kind === "fountain") {
        const basinRim = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.22, 10, 24), stoneMat);
        basinRim.rotation.x = Math.PI / 2;
        basinRim.position.y = 0.24;
        const pool = new THREE.Mesh(
          new THREE.CircleGeometry(1.45, 24),
          new THREE.MeshStandardMaterial({
            color: 0x0ea5e9,
            emissive: new THREE.Color(0x0284c7),
            emissiveIntensity: 0.35,
            roughness: 0.15,
          }),
        );
        pool.rotation.x = -Math.PI / 2;
        pool.position.y = 0.22;
        const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.36, 1.35, 12), stoneMat);
        spire.position.y = 0.72;
        const topBowl = new THREE.Mesh(new THREE.CylinderGeometry(0.68, 0.26, 0.28, 16), goldMat);
        topBowl.position.y = 1.42;

        const sprayGroup = new THREE.Group();
        sprayGroup.position.y = 1.54;
        const sprayMat = new THREE.MeshBasicMaterial({ color: 0xbae6fd, transparent: true, opacity: 0.72 });
        const foamMat = new THREE.MeshBasicMaterial({ color: 0xf0f9ff, transparent: true, opacity: 0.85 });
        const innerColumn = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.22, 0.88, 14), sprayMat);
        innerColumn.position.y = 0.44;
        const waterDome = new THREE.Mesh(
          new THREE.SphereGeometry(0.48, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.56),
          sprayMat,
        );
        waterDome.position.y = 0.58;
        const rippleRing = new THREE.Mesh(new THREE.TorusGeometry(0.88, 0.04, 8, 22), foamMat);
        rippleRing.rotation.x = Math.PI / 2;
        rippleRing.position.y = -1.26;
        sprayGroup.add(innerColumn, waterDome, rippleRing);
        for (let b = 0; b < 6; b += 1) {
          const ang = (b / 6) * Math.PI * 2;
          const bead = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8), foamMat);
          bead.position.set(Math.cos(ang) * 0.46, 0.28 + (b % 2) * 0.22, Math.sin(ang) * 0.46);
          sprayGroup.add(bead);
        }
        fountainWaterJet = sprayGroup;
        pGroup.add(basinRim, pool, spire, topBowl, sprayGroup);
      } else if (prop.kind === "scooter_dock") {
        const dockDeck = new THREE.Mesh(
          new THREE.BoxGeometry(2.6, 0.12, 1.8),
          new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.4, metalness: 0.5 }),
        );
        dockDeck.position.y = 0.08;
        const neonBorder = new THREE.Mesh(
          new THREE.BoxGeometry(2.7, 0.05, 1.9),
          new THREE.MeshBasicMaterial({ color: 0x22d3ee }),
        );
        neonBorder.position.y = 0.06;
        [-0.55, 0.55].forEach((sx) => {
          const sBoard = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.08, 1.0), goldMat);
          sBoard.position.set(sx, 0.24, 0);
          const sStem = new THREE.Mesh(
            new THREE.CylinderGeometry(0.04, 0.04, 0.95, 8),
            new THREE.MeshBasicMaterial({ color: 0x38bdf8 }),
          );
          sStem.position.set(sx, 0.72, 0.36);
          pGroup.add(sBoard, sStem);
        });
        pGroup.add(dockDeck, neonBorder);
      } else if (prop.kind === "lantern_rack") {
        [-1.1, 1.1].forEach((lx) => {
          const post = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 2.7, 8), timberMat);
          post.position.set(lx, 1.35, 0);
          pGroup.add(post);
        });
        const topBeam = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.22, 0.28), timberMat);
        topBeam.position.set(0, 2.68, 0);
        pGroup.add(topBeam);
        const lMat = new THREE.MeshStandardMaterial({
          color: 0xef4444,
          emissive: new THREE.Color(0xdc2626),
          emissiveIntensity: 0.75,
        });
        [-0.7, 0, 0.7].forEach((lx) => {
          const lan = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 8), lMat);
          lan.position.set(lx, 2.2, 0);
          pGroup.add(lan);
          propLanterns.push(lan);
        });
      } else if (prop.kind === "gacha_machine") {
        const body = new THREE.Mesh(
          new THREE.BoxGeometry(1.15, 1.35, 0.95),
          new THREE.MeshStandardMaterial({ color: 0xec4899, roughness: 0.35 }),
        );
        body.position.y = 0.72;
        const glassGlobe = new THREE.Mesh(
          new THREE.SphereGeometry(0.58, 14, 12),
          new THREE.MeshStandardMaterial({
            color: 0xfef3c7,
            emissive: new THREE.Color(0xfbbf24),
            emissiveIntensity: 0.38,
            roughness: 0.15,
          }),
        );
        glassGlobe.position.y = 1.92;
        gachaGlobes.push(glassGlobe);
        const cap = new THREE.Mesh(new THREE.ConeGeometry(0.38, 0.34, 12), goldMat);
        cap.position.y = 2.6;
        pGroup.add(body, glassGlobe, cap);
      }

      scene.add(pGroup);
    }

    // 5 Autonomous Roaming Campus NPCs (Cowo & Cewe lively citizens!)
    const roamingNpcs = ROAMING_CITIZEN_NPCS.map((def) => {
      const av = buildPlayerAvatar(def.colorHex, def.gender);
      const startPt = def.waypoints[0];
      av.root.position.set(startPt[0], 0, startPt[1]);

      const nCanvas = document.createElement("canvas");
      nCanvas.width = 320;
      nCanvas.height = 60;
      const nCtx = nCanvas.getContext("2d")!;
      nCtx.fillStyle = "rgba(15, 23, 42, 0.84)";
      nCtx.strokeStyle = def.colorHex;
      nCtx.lineWidth = 4;
      nCtx.beginPath();
      nCtx.roundRect(6, 6, 308, 48, 14);
      nCtx.fill();
      nCtx.stroke();
      nCtx.fillStyle = "#ffffff";
      nCtx.font = "800 22px 'Plus Jakarta Sans', 'Noto Sans SC', sans-serif";
      nCtx.textAlign = "center";
      nCtx.textBaseline = "middle";
      nCtx.fillText(`${def.name} · ${def.greetingHanzi}`, 160, 31);
      const nTex = new THREE.CanvasTexture(nCanvas);
      nTex.colorSpace = THREE.SRGBColorSpace;
      const nSprite = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: nTex, transparent: true, depthWrite: false }),
      );
      nSprite.scale.set(2.35, 0.44, 1);
      nSprite.position.set(0, 2.52, 0);
      av.root.add(nSprite);
      scene.add(av.root);

      return {
        def,
        av,
        wpIdx: 1 % def.waypoints.length,
        walkDist: 0,
        yaw: 0,
      };
    });

    // Ambient Gliding Campus Shuttle Bus & Floating Sky Wish Lanterns
    const tramGroup = new THREE.Group();
    const tramBody = new THREE.Mesh(
      new THREE.BoxGeometry(2.2, 1.35, 4.4),
      new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.35, metalness: 0.2 }),
    );
    tramBody.position.y = 0.95;
    tramBody.castShadow = true;
    const tramStripe = new THREE.Mesh(new THREE.BoxGeometry(2.26, 0.28, 4.44), goldMat);
    tramStripe.position.y = 0.85;
    const tramWindow = new THREE.Mesh(
      new THREE.BoxGeometry(2.24, 0.52, 3.6),
      new THREE.MeshStandardMaterial({ color: 0xbae6fd, emissive: new THREE.Color(0x38bdf8), emissiveIntensity: 0.3 }),
    );
    tramWindow.position.y = 1.25;
    tramGroup.add(tramBody, tramStripe, tramWindow);
    scene.add(tramGroup);

    const skyLanterns = Array.from({ length: 10 }, (_, idx) => {
      const lm = new THREE.Mesh(
        new THREE.CylinderGeometry(0.24, 0.16, 0.42, 8),
        new THREE.MeshStandardMaterial({
          color: 0xfef3c7,
          emissive: new THREE.Color(0xf59e0b),
          emissiveIntensity: 0.95,
          roughness: 0.3,
        }),
      );
      const angle = (idx / 10) * Math.PI * 2;
      const rad = 16 + (idx % 3) * 8;
      lm.position.set(Math.cos(angle) * rad, 4 + (idx % 5) * 3.2, Math.sin(angle) * rad - 8);
      scene.add(lm);
      return { mesh: lm, baseX: lm.position.x, baseZ: lm.position.z, speed: 0.55 + (idx % 4) * 0.15 };
    });

    // Build ALL 24 Enterable Open-World Buildings (7 Chapters + 17 Campus Facilities)
    const openWorldBuildings = buildAllOpenWorldBuildings(chapters);
    const allWallBoxes = openWorldBuildings.flatMap((b) => b.wallBoxes);
    const allElevatedZones = openWorldBuildings.flatMap((b) => b.elevatedZones);
    const allStairRamps = openWorldBuildings.flatMap((b) => b.stairRamps);
    const contactShadowMat = createContactShadowMaterial();
    const landmarks: LandmarkMeta[] = [];
    const clickProxies: THREE.Mesh[] = [];

    for (let bIdx = 0; bIdx < openWorldBuildings.length; bIdx += 1) {
      const b = openWorldBuildings[bIdx];
      const ch = b.chapterId ? chapters.find((c) => c.id === b.chapterId) : undefined;
      const { group, roofGroup, upperFloorGroup, lanterns, windowMats, clickProxy } = buildCampusBuilding(
        b.style,
        b.accentHex,
        {
          stoneMat,
          wallMat,
          timberMat,
          roofBump,
          goldMat,
          gatePlaqueTex,
        },
        b.floors,
      );
      group.position.set(b.x, 0, b.z);
      scene.add(group);

      clickProxy.userData.buildingId = b.id;
      clickProxy.userData.chapterId = b.chapterId;
      clickProxies.push(clickProxy);

      const shadowDisc = new THREE.Mesh(new THREE.CircleGeometry(4.8, 24), contactShadowMat);
      shadowDisc.rotation.x = -Math.PI / 2;
      shadowDisc.position.set(b.x, 0.062, b.z);
      scene.add(shadowDisc);

      const ringGeo = new THREE.RingGeometry(4.05, 4.38, 32);
      const ringMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(b.accentHex),
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.48,
      });
      const ringMesh = new THREE.Mesh(ringGeo, ringMat);
      ringMesh.rotation.x = -Math.PI / 2;
      ringMesh.position.set(b.x, 0.072, b.z);
      scene.add(ringMesh);

      const extraFloorH = b.floors === 3 ? 6.0 : b.floors === 2 ? 2.9 : 0;
      const beaconMesh = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.45, 0),
        new THREE.MeshStandardMaterial({
          color: new THREE.Color(b.accentHex),
          emissive: new THREE.Color(b.accentHex),
          emissiveIntensity: 0.55,
          roughness: 0.25,
          metalness: 0.35,
        }),
      );
      beaconMesh.position.set(b.x, 7.6 + extraFloorH, b.z);
      scene.add(beaconMesh);

      let npcGroup: THREE.Group | null = null;
      let npcRightArm: THREE.Group | null = null;
      if (ch) {
        const npcBuilt = buildTeacherNpc(b.accentHex);
        npcGroup = npcBuilt.group;
        npcRightArm = npcBuilt.rightArm;
        npcGroup.position.set(b.x + 2.85, 0, b.z + 3.4);
        scene.add(npcGroup);

        const npcShadow = new THREE.Mesh(new THREE.CircleGeometry(0.55, 16), contactShadowMat);
        npcShadow.rotation.x = -Math.PI / 2;
        npcShadow.position.set(b.x + 2.85, 0.068, b.z + 3.4);
        scene.add(npcShadow);
      }

      const orderNum = ch ? ch.order : bIdx + 1;
      const shortLabel = ch ? ch.shortTitle : b.title;
      const initialStars = ch ? propsRef.current.chapterStars[ch.id] ?? 0 : 0;
      const { sprite: signSprite, canvas: signCanvas, texture: signTex } = buildSignboardSprite(
        orderNum,
        shortLabel,
        b.accentHex,
        ch ? initialStars : 0,
      );
      signSprite.position.set(b.x, 6.05 + extraFloorH, b.z + 1.5);
      scene.add(signSprite);

      landmarks.push({
        building: b,
        chapterId: b.chapterId,
        order: orderNum,
        shortTitle: shortLabel,
        accentHex: b.accentHex,
        pos: new THREE.Vector3(b.x, 0, b.z),
        roofGroup,
        upperFloorGroup,
        beaconMesh,
        ringMesh,
        lanterns,
        windowMats,
        npcGroup,
        npcRightArm,
        signSprite,
        signCanvas,
        signTex,
        lastRenderedStars: initialStars,
      });
    }

    // Instanced Campus Trees across expanded parks & perimeter
    const treeCount = 110;
    const trunkGeo = new THREE.CylinderGeometry(0.24, 0.36, 2.2, 8);
    trunkGeo.translate(0, 1.1, 0);
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6b4423, roughness: 0.9 });
    const trunkInst = new THREE.InstancedMesh(trunkGeo, trunkMat, treeCount);
    trunkInst.castShadow = !isSoftwareGl;

    const crownGeo = new THREE.DodecahedronGeometry(1.55, 0);
    crownGeo.translate(0, 3.2, 0);
    const crownMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.82 });
    const crownInst = new THREE.InstancedMesh(crownGeo, crownMat, treeCount);
    crownInst.castShadow = !isSoftwareGl;

    const dummy = new THREE.Object3D();
    const tintColor = new THREE.Color();
    for (let i = 0; i < treeCount; i += 1) {
      const angle = (i / treeCount) * Math.PI * 2;
      const ringRadius = i < 40 ? 60 + (i % 4) * 5 : 78 + (i % 5) * 6;
      const tx = Math.cos(angle) * ringRadius + Math.sin(i * 3.1) * 4;
      const tz = Math.sin(angle) * ringRadius - 12 + Math.cos(i * 2.7) * 4;
      const s = 0.88 + ((i * 17) % 32) / 100;
      dummy.position.set(tx, 0, tz);
      dummy.rotation.y = i * 1.1;
      dummy.scale.set(s, s * (0.95 + (i % 4) * 0.08), s);
      dummy.updateMatrix();
      trunkInst.setMatrixAt(i, dummy.matrix);
      crownInst.setMatrixAt(i, dummy.matrix);
      if (i % 6 === 0) {
        tintColor.setHSL(0.94, 0.58, 0.74);
      } else {
        tintColor.setHSL(0.32 + ((i % 5) - 2) * 0.015, 0.44, 0.36 + (i % 3) * 0.04);
      }
      crownInst.setColorAt(i, tintColor);
    }
    trunkInst.computeBoundingSphere();
    crownInst.computeBoundingSphere();
    scene.add(trunkInst, crownInst);

    // Instanced Bamboo Groves around gazebos & pond (great hiding spots!)
    const bambooCount = 72;
    const bambooGeo = new THREE.CylinderGeometry(0.08, 0.11, 4.2, 6);
    bambooGeo.translate(0, 2.1, 0);
    const bambooMat = new THREE.MeshStandardMaterial({ color: 0x22c55e, roughness: 0.6 });
    const bambooInst = new THREE.InstancedMesh(bambooGeo, bambooMat, bambooCount);
    bambooInst.castShadow = !isSoftwareGl;
    const groveCenters: [number, number][] = [
      [-18, -16],
      [18, -16],
      [-48, -48],
      [48, -48],
      [-10, 36],
      [10, 36],
    ];
    for (let i = 0; i < bambooCount; i += 1) {
      const [gcx, gcz] = groveCenters[i % groveCenters.length];
      const cx = gcx + Math.cos(i * 2.1) * 2.5;
      const cz = gcz + Math.sin(i * 1.7) * 2.5;
      dummy.position.set(cx, 0, cz);
      dummy.rotation.set(Math.sin(i) * 0.05, i * 0.8, Math.cos(i) * 0.05);
      const bh = 0.78 + (i % 5) * 0.15;
      dummy.scale.set(1, bh, 1);
      dummy.updateMatrix();
      bambooInst.setMatrixAt(i, dummy.matrix);
    }
    bambooInst.computeBoundingSphere();
    scene.add(bambooInst);

    // Instanced Campus Lamp Posts lining avenues
    const lampPositions: [number, number][] = [];
    for (let z = -66; z <= 42; z += 12) {
      lampPositions.push([-5.1, z], [5.1, z]);
    }
    for (let x = -48; x <= 48; x += 16) {
      if (Math.abs(x) > 8) {
        lampPositions.push([x, 7.6], [x, -26.8]);
      }
    }
    const postGeo = new THREE.CylinderGeometry(0.08, 0.12, 3.5, 8);
    postGeo.translate(0, 1.75, 0);
    const postMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.45, metalness: 0.6 });
    const postInst = new THREE.InstancedMesh(postGeo, postMat, lampPositions.length);

    const bulbGeo = new THREE.SphereGeometry(0.22, 10, 8);
    bulbGeo.translate(0, 3.65, 0);
    const bulbMat = new THREE.MeshStandardMaterial({
      color: 0xfef08a,
      emissive: new THREE.Color(0xfbbf24),
      emissiveIntensity: 0.75,
      roughness: 0.25,
    });
    const bulbInst = new THREE.InstancedMesh(bulbGeo, bulbMat, lampPositions.length);

    lampPositions.forEach(([lx, lz], i) => {
      dummy.position.set(lx, 0, lz);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      postInst.setMatrixAt(i, dummy.matrix);
      bulbInst.setMatrixAt(i, dummy.matrix);
    });
    postInst.computeBoundingSphere();
    bulbInst.computeBoundingSphere();
    scene.add(postInst, bulbInst);

    // Multiplayer Mini-Game 3D Visuals: Dynamic Orbs / Coins / Gems / Crown / Bomb / Parkour Ring
    const mgOrbVisuals = new Map<string, { group: THREE.Group; core: THREE.Mesh; ring: THREE.Mesh }>();
    const createMgOrbGroup = (
      hanzi: string,
      kind: "lantern" | "orb" | "coin" | "gem" | "crown" | "bomb",
    ) => {
      const g = new THREE.Group();
      const geo =
        kind === "coin"
          ? new THREE.CylinderGeometry(0.48, 0.48, 0.14, 18)
          : kind === "gem" || kind === "orb"
            ? new THREE.OctahedronGeometry(0.46, 0)
            : kind === "crown"
              ? new THREE.ConeGeometry(0.5, 0.65, 6)
              : new THREE.SphereGeometry(0.45, 14, 12);

      const mainHex =
        kind === "coin" || kind === "crown"
          ? 0xfacc15
          : kind === "gem"
            ? 0x38bdf8
            : kind === "bomb" || kind === "lantern"
              ? 0xef4444
              : 0xf59e0b;
      const core = new THREE.Mesh(
        geo,
        new THREE.MeshStandardMaterial({
          color: mainHex,
          emissive: new THREE.Color(kind === "bomb" ? 0xdc2626 : mainHex),
          emissiveIntensity: kind === "crown" ? 1.1 : 0.85,
          roughness: 0.2,
          metalness: kind === "coin" || kind === "crown" ? 0.72 : 0.35,
        }),
      );
      if (kind === "coin") {
        core.rotation.x = Math.PI / 2;
      }
      core.position.y = 1.35;
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.62, 0.88, 24),
        new THREE.MeshBasicMaterial({
          color: mainHex,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.75,
        }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.22;

      const c = document.createElement("canvas");
      const isWide = hanzi.length >= 2;
      c.width = isWide ? 192 : 128;
      c.height = 128;
      const cCtx = c.getContext("2d")!;
      cCtx.fillStyle =
        kind === "bomb" || kind === "lantern"
          ? "rgba(185,28,28,0.92)"
          : kind === "gem"
            ? "rgba(3,105,161,0.92)"
            : "rgba(180,83,9,0.92)";
      if (isWide) {
        cCtx.beginPath();
        cCtx.roundRect(10, 20, 172, 88, 44);
        cCtx.fill();
        cCtx.strokeStyle = "#fde68a";
        cCtx.lineWidth = 6;
        cCtx.stroke();
      } else {
        cCtx.beginPath();
        cCtx.arc(64, 64, 52, 0, Math.PI * 2);
        cCtx.fill();
        cCtx.strokeStyle = "#fde68a";
        cCtx.lineWidth = 6;
        cCtx.stroke();
      }
      cCtx.fillStyle = "#ffffff";
      cCtx.font =
        hanzi.length >= 3
          ? "900 34px 'Noto Sans SC', sans-serif"
          : hanzi.length === 2
            ? "900 42px 'Noto Sans SC', sans-serif"
            : "900 54px 'Noto Sans SC', sans-serif";
      cCtx.textAlign = "center";
      cCtx.textBaseline = "middle";
      cCtx.fillText(hanzi, c.width / 2, 66);
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
      sp.scale.set(isWide ? 1.65 : 1.2, 1.2, 1);
      sp.position.y = 2.45;
      g.add(core, ring, sp);
      return { group: g, core, ring };
    };

    const crownHolderMesh = new THREE.Group();
    const crownBase = new THREE.Mesh(
      new THREE.ConeGeometry(0.42, 0.55, 6),
      new THREE.MeshStandardMaterial({
        color: 0xfacc15,
        emissive: new THREE.Color(0xf59e0b),
        emissiveIntensity: 0.85,
        metalness: 0.75,
        roughness: 0.2,
      }),
    );
    crownBase.rotation.x = Math.PI;
    crownHolderMesh.add(crownBase);
    crownHolderMesh.visible = false;
    scene.add(crownHolderMesh);

    const bombHolderMesh = new THREE.Group();
    const bombSphere = new THREE.Mesh(
      new THREE.SphereGeometry(0.42, 14, 12),
      new THREE.MeshStandardMaterial({
        color: 0x1e293b,
        emissive: new THREE.Color(0xef4444),
        emissiveIntensity: 0.9,
        roughness: 0.3,
      }),
    );
    const bombWarningRing = new THREE.Mesh(
      new THREE.RingGeometry(1.1, 1.45, 28),
      new THREE.MeshBasicMaterial({ color: 0xef4444, side: THREE.DoubleSide, transparent: true, opacity: 0.78 }),
    );
    bombWarningRing.rotation.x = -Math.PI / 2;
    bombWarningRing.position.y = -2.75;
    bombHolderMesh.add(bombSphere, bombWarningRing);
    bombHolderMesh.visible = false;
    scene.add(bombHolderMesh);

    const parkourRing = new THREE.Group();
    const parkourTorus = new THREE.Mesh(
      new THREE.TorusGeometry(1.65, 0.14, 10, 30),
      new THREE.MeshStandardMaterial({
        color: 0x22d3ee,
        emissive: new THREE.Color(0x06b6d4),
        emissiveIntensity: 0.95,
      }),
    );
    parkourTorus.position.y = 1.6;
    const parkourFloorDisc = new THREE.Mesh(
      new THREE.RingGeometry(1.2, 1.85, 28),
      new THREE.MeshBasicMaterial({ color: 0x67e8f9, side: THREE.DoubleSide, transparent: true, opacity: 0.68 }),
    );
    parkourFloorDisc.rotation.x = -Math.PI / 2;
    parkourFloorDisc.position.y = 0.12;
    parkourRing.add(parkourTorus, parkourFloorDisc);
    parkourRing.visible = false;
    scene.add(parkourRing);

    const wordDashBeacon = new THREE.Mesh(
      new THREE.CylinderGeometry(0.75, 1.45, 22, 18, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.32,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    wordDashBeacon.visible = false;
    scene.add(wordDashBeacon);

    const localSeekerRing = new THREE.Mesh(
      new THREE.RingGeometry(0.95, 1.25, 28),
      new THREE.MeshBasicMaterial({
        color: 0xef4444,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.85,
      }),
    );
    localSeekerRing.rotation.x = -Math.PI / 2;
    localSeekerRing.visible = false;
    scene.add(localSeekerRing);

    // Collectible 3D Hanzi Knowledge Orbs
    const orbVisuals: OrbVisualMeta[] = [];
    for (const orbDef of propsRef.current.orbs) {
      const group = new THREE.Group();
      group.position.set(orbDef.worldPos[0], 0, orbDef.worldPos[2]);

      const coreMesh = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.46, 0),
        new THREE.MeshStandardMaterial({
          color: new THREE.Color(orbDef.accentHex),
          emissive: new THREE.Color(orbDef.accentHex),
          emissiveIntensity: 0.85,
          roughness: 0.2,
          metalness: 0.4,
        }),
      );
      coreMesh.position.y = 1.4;

      const haloMesh = new THREE.Mesh(
        new THREE.RingGeometry(0.75, 0.92, 24),
        new THREE.MeshBasicMaterial({
          color: 0xfbbf24,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.65,
        }),
      );
      haloMesh.rotation.x = -Math.PI / 2;
      haloMesh.position.y = 0.08;

      const sprite = buildOrbSprite(orbDef.shortHanzi, orbDef.accentHex);
      sprite.position.y = 2.45;

      group.add(coreMesh, haloMesh, sprite);
      scene.add(group);
      orbVisuals.push({ def: orbDef, group, coreMesh, haloMesh });
    }

    // Pooled InstancedMesh Particles (40 ambient petals/embers + 20 burst particles)
    const AMBIENT_PARTICLES = 40;
    const BURST_PARTICLES = 20;
    const TOTAL_PARTICLES = AMBIENT_PARTICLES + BURST_PARTICLES;
    const particleGeo = new THREE.DodecahedronGeometry(0.11, 0);
    const particleMat = new THREE.MeshBasicMaterial({ color: 0xf9a8d4, transparent: true, opacity: 0.85 });
    const particleInst = new THREE.InstancedMesh(particleGeo, particleMat, TOTAL_PARTICLES);
    scene.add(particleInst);

    const pData = Array.from({ length: TOTAL_PARTICLES }, (_, i) => ({
      x: ((i * 19) % 50) - 25,
      y: 0.8 + ((i * 7) % 6),
      z: ((i * 23) % 50) - 32,
      vx: (Math.sin(i * 1.7) * 0.55),
      vy: -0.25 - (i % 3) * 0.12,
      vz: (Math.cos(i * 2.3) * 0.45),
      life: i < AMBIENT_PARTICLES ? 1 : 0,
    }));

    const triggerOrbBurst = (bx: number, bz: number) => {
      for (let i = AMBIENT_PARTICLES; i < TOTAL_PARTICLES; i += 1) {
        const a = ((i - AMBIENT_PARTICLES) / BURST_PARTICLES) * Math.PI * 2;
        const speed = 4.2 + (i % 4) * 1.1;
        pData[i].x = bx;
        pData[i].y = 1.25;
        pData[i].z = bz;
        pData[i].vx = Math.cos(a) * speed;
        pData[i].vy = 4.5 + (i % 3) * 1.2;
        pData[i].vz = Math.sin(a) * speed;
        pData[i].life = 1.0;
      }
    };

    // Ceremonial Graduation Stage + 36 InstancedMesh Multi-Color Confetti Ribbons
    const graduationStage = buildGraduationStage({ stoneMat, timberMat, goldMat });
    scene.add(graduationStage.group);

    const CONFETTI_COUNT = 36;
    const confettiGeo = new THREE.BoxGeometry(0.16, 0.04, 0.24);
    const confettiMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const confettiInst = new THREE.InstancedMesh(confettiGeo, confettiMat, CONFETTI_COUNT);
    confettiInst.frustumCulled = false;
    confettiInst.visible = false;
    const confettiColors = [0xf59e0b, 0xef4444, 0x3b82f6, 0x10b981, 0xf472b6, 0xfde047];
    const tmpColor = new THREE.Color();
    const confettiData = Array.from({ length: CONFETTI_COUNT }, (_, i) => {
      tmpColor.setHex(confettiColors[i % confettiColors.length]);
      confettiInst.setColorAt(i, tmpColor);
      return {
        x: ((i % 9) - 4) * 0.9,
        y: 1.5 + (i % 5) * 0.9,
        z: 3.5 + ((i % 4) - 1.5) * 0.85,
        vx: Math.sin(i * 1.9) * 0.8,
        vy: -1.2 - (i % 3) * 0.35,
        vz: Math.cos(i * 2.3) * 0.7,
        rotSpeed: 2.4 + (i % 4) * 0.9,
      };
    });
    if (confettiInst.instanceColor) confettiInst.instanceColor.needsUpdate = true;
    scene.add(confettiInst);

    const triggerConfettiBurst = () => {
      for (let i = 0; i < CONFETTI_COUNT; i += 1) {
        const angle = (i / CONFETTI_COUNT) * Math.PI * 2;
        const spread = 1.8 + (i % 5) * 0.75;
        confettiData[i].x = Math.cos(angle) * 0.4;
        confettiData[i].y = 1.8;
        confettiData[i].z = 4.6 + Math.sin(angle) * 0.4;
        confettiData[i].vx = Math.cos(angle) * spread;
        confettiData[i].vy = 4.8 + (i % 6) * 0.85;
        confettiData[i].vz = Math.sin(angle) * spread;
      }
    };

    // Player Avatar (Local)
    let lastAppliedJacket = propsRef.current.localJacketHex || "#1d4ed8";
    let lastAppliedGender: AvatarGender = propsRef.current.localGender === "girl" ? "girl" : "boy";
    let lastAppliedScooter = Boolean(propsRef.current.onScooter);
    const player = buildPlayerAvatar(lastAppliedJacket, lastAppliedGender);
    player.setScooter(lastAppliedScooter);
    // Offset spawn slightly when named multiplayer query params are used so peers don't spawn overlapped
    let spawnOffsetX = 0;
    let spawnOffsetZ = 0;
    if (typeof window !== "undefined") {
      const sp = new URLSearchParams(window.location.search);
      const mpName = sp.get("name");
      if (mpName) {
        let h = 0;
        for (let i = 0; i < mpName.length; i += 1) {
          h = (h * 33 + mpName.charCodeAt(i)) >>> 0;
        }
        spawnOffsetX = ((h % 7) - 3) * 0.75;
        spawnOffsetZ = ((h % 3) - 1) * 0.7;
      }
    }
    const playerPos = new THREE.Vector3(spawnOffsetX, 0, 14 + spawnOffsetZ);
    let playerVelY = 0;
    let isGrounded = true;
    let squashAmount = 0;
    let playerYaw = Math.PI;
    let speedBoostTimer = 0;
    player.root.position.copy(playerPos);
    player.root.rotation.y = playerYaw;
    scene.add(player.root);
    container.setAttribute("data-avatar-gender", lastAppliedGender);
    container.setAttribute("data-on-scooter", String(lastAppliedScooter));

    const playerShadow = new THREE.Mesh(new THREE.CircleGeometry(0.7, 16), contactShadowMat);
    playerShadow.rotation.x = -Math.PI / 2;
    playerShadow.position.set(playerPos.x, 0.068, playerPos.z);
    scene.add(playerShadow);

    // Remote Multiplayer Avatars Pool
    interface RemoteAvatarVisual {
      id: string;
      avatar: ReturnType<typeof buildPlayerAvatar>;
      shadow: THREE.Mesh;
      nameCanvas: HTMLCanvasElement;
      nameTex: THREE.CanvasTexture;
      nameSprite: THREE.Sprite;
      bubbleCanvas: HTMLCanvasElement;
      bubbleTex: THREE.CanvasTexture;
      bubbleSprite: THREE.Sprite;
      curPos: THREE.Vector3;
      curYaw: number;
      walkDist: number;
      renderedName: string;
      renderedColor: string;
      renderedGender: AvatarGender;
      renderedXp: number;
      renderedChatAt: number;
    }
    const remoteVisuals = new Map<string, RemoteAvatarVisual>();
    let lastWalkToNonce = propsRef.current.walkToTargetRef?.current?.nonce ?? 0;

    const initialPresetCfg = CAMERA_PRESETS[propsRef.current.cameraPreset || "normal"];
    let camYawOffset = 0;
    let camYawTarget = 0;
    let camPitch = initialPresetCfg.pitch;
    let camPitchTarget = initialPresetCfg.pitch;
    let camDist = initialPresetCfg.dist;
    let camDistTarget = initialPresetCfg.dist;
    let lastAppliedPreset: CameraPreset = propsRef.current.cameraPreset || "normal";
    let lastResetTrig = propsRef.current.cameraResetTriggerRef?.current ?? 0;

    let isDragging = false;
    let dragMoved = false;
    let lastPointerX = 0;
    let lastPointerY = 0;
    let lastPinchDist: number | null = null;
    const activePointers = new Map<number, { x: number; y: number }>();

    let walkDistance = 0;
    let lastStepTrigger = 0;
    let lastJumpTrig = propsRef.current.jumpTriggerRef?.current ?? 0;
    let lastSocialNonce = propsRef.current.localSocialBurst?.nonce ?? 0;
    let activeSocialKind: SocialEmoteKind | null = null;
    let activeSocialTimer = 0;
    let lastBallX: number = SOCCER_FIELD_CENTER.x;
    let lastBallZ: number = SOCCER_FIELD_CENTER.z;

    const keysPressed = new Set<string>();
    const raycaster = new THREE.Raycaster();
    const pointerVec = new THREE.Vector2();
    const _moveVec = new THREE.Vector3();
    const _camDesired = new THREE.Vector3();
    const _lookTarget = new THREE.Vector3(0, 1.75, 11.8);
    const _lookDesired = new THREE.Vector3();
    const _flyPos = new THREE.Vector3();

    const applyThemeColors = (currentTheme: "light" | "dark") => {
      const targetBg = currentTheme === "dark" ? 0x0e172a : 0xd5e9fa;
      (scene.background as THREE.Color).setHex(targetBg);
      if (scene.fog instanceof THREE.FogExp2) {
        scene.fog.color.setHex(targetBg);
      }
      if (currentTheme === "dark") {
        skyUniforms.topColor.value.setHex(0x091124);
        skyUniforms.bottomColor.value.setHex(0x1b2b48);
        skyUniforms.sunGlowColor.value.setHex(0x3b82f6);
        skyUniforms.sunStrength.value = 0.16;
        starMat.opacity = 0.88;
        (moonMesh.material as THREE.MeshBasicMaterial).opacity = 0.92;
        hemiLight.color.setHex(0x5272a8);
        hemiLight.groundColor.setHex(0x1e293b);
        hemiLight.intensity = 0.88;
        keyLight.color.setHex(0xffdfb0);
        keyLight.intensity = 1.55;
        bulbMat.emissiveIntensity = 1.55;
        particleMat.color.setHex(0xfbbf24);
        landmarks.forEach((l) => l.windowMats.forEach((m) => (m.emissiveIntensity = 0.65)));
      } else {
        skyUniforms.topColor.value.setHex(0x5fa8e8);
        skyUniforms.bottomColor.value.setHex(0xe6f2fc);
        skyUniforms.sunGlowColor.value.setHex(0xfff1c9);
        skyUniforms.sunStrength.value = 0.42;
        starMat.opacity = 0;
        (moonMesh.material as THREE.MeshBasicMaterial).opacity = 0;
        hemiLight.color.setHex(0x9bd2ff);
        hemiLight.groundColor.setHex(0x4c6b53);
        hemiLight.intensity = 1.08;
        keyLight.color.setHex(0xfff3db);
        keyLight.intensity = 2.05;
        bulbMat.emissiveIntensity = 0.45;
        particleMat.color.setHex(0xf9a8d4);
        landmarks.forEach((l) => l.windowMats.forEach((m) => (m.emissiveIntensity = 0.18)));
      }
    };
    let lastAppliedTheme = propsRef.current.theme;
    applyThemeColors(lastAppliedTheme);

    const onKeyDown = (e: KeyboardEvent) => {
      if (propsRef.current.controlsDisabled || propsRef.current.gameState !== "playing") return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      keysPressed.add(e.code);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      keysPressed.delete(e.code);
    };
    const clearInputs = () => {
      keysPressed.clear();
      isDragging = false;
      lastPinchDist = null;
      activePointers.clear();
      canvas.style.cursor = "grab";
    };

    const canvas = renderer.domElement;
    const computePinchDistance = (): number | null => {
      if (activePointers.size < 2) return null;
      const pts = Array.from(activePointers.values());
      return Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
    };

    const onPointerDown = (e: PointerEvent) => {
      if (propsRef.current.gameState !== "playing" || propsRef.current.controlsDisabled) return;
      activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (activePointers.size === 1) {
        isDragging = true;
        dragMoved = false;
        lastPointerX = e.clientX;
        lastPointerY = e.clientY;
        lastPinchDist = null;
        canvas.style.cursor = "grabbing";
      } else if (activePointers.size >= 2) {
        isDragging = false;
        dragMoved = true;
        lastPinchDist = computePinchDistance();
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!activePointers.has(e.pointerId)) return;
      activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (propsRef.current.gameState !== "playing" || propsRef.current.controlsDisabled) return;

      if (activePointers.size >= 2) {
        const nextPinch = computePinchDistance();
        if (nextPinch !== null && lastPinchDist !== null) {
          const pinchDelta = nextPinch - lastPinchDist;
          camDistTarget = clampCameraDist(camDistTarget - pinchDelta * 0.045);
        }
        lastPinchDist = nextPinch;
        dragMoved = true;
        return;
      }

      if (!isDragging) return;
      const dx = e.clientX - lastPointerX;
      const dy = e.clientY - lastPointerY;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) dragMoved = true;
      camYawTarget -= dx * 0.0068;
      camPitchTarget = clampCameraPitch(camPitchTarget + dy * 0.0048);
      lastPointerX = e.clientX;
      lastPointerY = e.clientY;
    };

    const onPointerUp = (e: PointerEvent) => {
      const wasSingle = activePointers.size === 1 && activePointers.has(e.pointerId);
      activePointers.delete(e.pointerId);

      if (activePointers.size < 2) {
        lastPinchDist = null;
      }
      if (activePointers.size === 1) {
        const remaining = Array.from(activePointers.values())[0];
        lastPointerX = remaining.x;
        lastPointerY = remaining.y;
        isDragging = true;
      } else {
        isDragging = false;
        canvas.style.cursor = "grab";
      }

      if (
        wasSingle &&
        !dragMoved &&
        propsRef.current.gameState === "playing" &&
        !propsRef.current.controlsDisabled &&
        !propsRef.current.graduationMode
      ) {
        const rect = canvas.getBoundingClientRect();
        pointerVec.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        pointerVec.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(pointerVec, camera);
        const hits = raycaster.intersectObjects(clickProxies, false);
        if (hits.length > 0) {
          const bId = hits[0].object.userData.buildingId as string | undefined;
          const chId = hits[0].object.userData.chapterId as string | undefined;
          const target = landmarks.find((l) => l.building.id === bId);
          if (target) {
            const entrance = getBuildingEntranceCoords(target.building);
            targetChapterWaypointRef.current = new THREE.Vector3(entrance.x, 0, entrance.z);
            if (chId) {
              propsRef.current.onSelectChapter(chId, true);
            } else {
              propsRef.current.onSelectBuilding?.(target.building);
            }
          }
        }
      }
    };

    const onDoubleClick = (e: MouseEvent) => {
      if (propsRef.current.gameState !== "playing" || propsRef.current.controlsDisabled) return;
      const rect = canvas.getBoundingClientRect();
      pointerVec.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointerVec.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointerVec, camera);
      const hits = raycaster.intersectObjects(clickProxies, false);
      if (hits.length === 0) {
        const presetCfg = CAMERA_PRESETS[propsRef.current.cameraPreset || "normal"];
        camYawTarget = camYawOffset + normalizeAngleDelta(camYawOffset, getBehindPlayerCameraYaw(playerYaw));
        camPitchTarget = presetCfg.pitch;
        camDistTarget = presetCfg.dist;
      }
    };

    const onWheel = (e: WheelEvent) => {
      if (propsRef.current.gameState !== "playing" || propsRef.current.controlsDisabled) return;
      camDistTarget = clampCameraDist(camDistTarget + e.deltaY * 0.013);
    };

    let contextLost = false;

    const handleResize = () => {
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || window.innerHeight;
      const aspect = w / Math.max(1, h);
      camera.fov = computeResponsiveFov(aspect);
      camera.aspect = aspect;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      if (!contextLost) {
        renderer.render(scene, camera);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", clearInputs);
    document.addEventListener("visibilitychange", clearInputs);
    window.addEventListener("resize", handleResize);
    canvas.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
    canvas.addEventListener("dblclick", onDoubleClick);
    canvas.addEventListener("wheel", onWheel, { passive: true });

    const onContextLost = (ev: Event) => {
      ev.preventDefault();
      contextLost = true;
    };
    const onContextRestored = () => {
      contextLost = false;
    };
    canvas.addEventListener("webglcontextlost", onContextLost);
    canvas.addEventListener("webglcontextrestored", onContextRestored);

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    container.setAttribute("data-scene-ready", "true");
    container.setAttribute("data-software-gl", String(isSoftwareGl));

    let frameId = 0;
    let disposed = false;
    let lastTime = performance.now();
    let totalElapsed = 0;

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync?.(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      if (!sync) {
        frameId = window.setTimeout(cb, 80);
        return;
      }
      gl.flush();
      const poll = () => {
        if (disposed) {
          gl.deleteSync(sync);
          return;
        }
        const status = gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (status === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    }

    let lastNearbyId: string | null = null;
    let lastInsideId: string | null = null;
    let lastNearbyPropId: string | null = null;
    let wasGraduationMode = false;
    let capTossTimer = 0;
    let lastGradCelebrateNonce = propsRef.current.graduationCelebrateNonce ?? 0;
    const savedPreGrad = {
      x: 0,
      z: 14,
      yaw: Math.PI,
      camYawTarget: 0,
      camPitchTarget: initialPresetCfg.pitch,
      camDistTarget: initialPresetCfg.dist,
    };
    const solidProps: CircleCollider[] = [
      { x: -14, z: -16, r: 3.45 }, // Lotus Pond rim
      { x: -7.4, z: 14, r: 1.4 },  // Air Mancur Harapan rim
      { x: 14, z: -16, r: 1.0 },   // Gazebo bench center (walkable under pillars!)
      { x: -42, z: -48, r: 1.0 },
      { x: 42, z: -48, r: 1.0 },
      { x: 0, z: 34, r: 1.0 },
    ];

    const tick = () => {
      if (disposed) return;
      const now = performance.now();
      const dt = Math.min((now - lastTime) / 1000, isSoftwareGl ? 0.14 : 0.05);
      lastTime = now;
      totalElapsed += dt;
      waterUniforms.time.value = totalElapsed;

      const {
        gameState: gs,
        theme: curTheme,
        activeChapterId: activeCh,
        chapterStars: starsMap,
        collectedOrbIds: collectedIds,
        onCollectOrb: collectOrbCb,
        onInsideBuildingChange: notifyInsideBuilding,
        minigame: activeMg,
        mpSelfId: selfMpId,
        onStepSound: stepSfx,
        virtualMoveRef: vMoveRef,
        virtualSprintRef: vSprintRef,
        jumpTriggerRef: jTrigRef,
        telemetryRef: tRef,
        onNearbyChapterChange: notifyNearby,
      } = propsRef.current;

      if (curTheme !== lastAppliedTheme) {
        lastAppliedTheme = curTheme;
        applyThemeColors(curTheme);
      }

      // Animate pooled particles
      for (let i = 0; i < TOTAL_PARTICLES; i += 1) {
        const p = pData[i];
        if (i < AMBIENT_PARTICLES) {
          p.x += (p.vx + Math.sin(totalElapsed * 0.7 + i) * 0.35) * dt;
          p.y += p.vy * dt;
          p.z += (p.vz + Math.cos(totalElapsed * 0.5 + i) * 0.25) * dt;
          if (p.y < 0.15) {
            p.y = 5.5 + (i % 4);
            p.x = ((i * 19 + totalElapsed * 2) % 90) - 45;
            p.z = ((i * 23) % 90) - 55;
          }
          dummy.position.set(p.x, p.y, p.z);
          dummy.rotation.set(totalElapsed + i, totalElapsed * 0.7, 0);
          dummy.scale.setScalar(0.85);
        } else if (p.life > 0) {
          p.life = Math.max(0, p.life - dt * 1.35);
          p.vy -= 11.5 * dt;
          p.x += p.vx * dt;
          p.y = Math.max(0.1, p.y + p.vy * dt);
          p.z += p.vz * dt;
          dummy.position.set(p.x, p.y, p.z);
          dummy.rotation.set(totalElapsed * 3, i, 0);
          dummy.scale.setScalar(p.life * 1.4);
        } else {
          dummy.position.set(0, -10, 0);
          dummy.scale.setScalar(0.001);
        }
        dummy.updateMatrix();
        particleInst.setMatrixAt(i, dummy.matrix);
      }
      particleInst.instanceMatrix.needsUpdate = true;

      // Animate Jump Pad floating rings & Boost Pads
      jumpPadRings.forEach((ring, i) => {
        const pulse = 1 + Math.sin(totalElapsed * 4.2 + i) * 0.1;
        ring.scale.set(pulse, pulse, 1);
        ring.position.y = 0.42 + Math.sin(totalElapsed * 3.5 + i) * 0.14;
      });
      boostPadChevrons.forEach((chev, i) => {
        chev.rotation.y += dt * 3.2;
        chev.position.y = 0.48 + Math.sin(totalElapsed * 5 + i) * 0.1;
      });

      // Animate Interactive Plaza Props, Floating Lanterns, Tram & Roaming Citizen NPCs
      if (fountainWaterJet) {
        fountainWaterJet.scale.y = 0.9 + Math.sin(totalElapsed * 8) * 0.14;
        fountainWaterJet.rotation.y += dt * 1.5;
      }
      gachaGlobes.forEach((g) => {
        g.rotation.y += dt * 0.9;
      });
      propLanterns.forEach((lan, i) => {
        lan.rotation.z = Math.sin(totalElapsed * 2.4 + i) * 0.12;
      });
      skyLanterns.forEach((sl, i) => {
        sl.mesh.position.y += sl.speed * dt;
        sl.mesh.position.x = sl.baseX + Math.sin(totalElapsed * 0.6 + i) * 0.7;
        sl.mesh.position.z = sl.baseZ + Math.cos(totalElapsed * 0.5 + i) * 0.7;
        if (sl.mesh.position.y > 24) {
          sl.mesh.position.y = 3.2;
        }
      });

      // Campus Shuttle Tram smooth figure loop on central E-W & outer boulevard
      const tramAngle = totalElapsed * 0.12;
      const nextTramX = Math.sin(tramAngle) * 44;
      const nextTramZ = Math.cos(tramAngle) * 32 - 8;
      const tramDx = nextTramX - tramGroup.position.x;
      const tramDz = nextTramZ - tramGroup.position.z;
      tramGroup.position.set(nextTramX, 0.06, nextTramZ);
      if (Math.abs(tramDx) + Math.abs(tramDz) > 0.001) {
        tramGroup.rotation.y = Math.atan2(tramDx, tramDz);
      }

      // Autonomous Roaming Citizen NPCs
      for (const npc of roamingNpcs) {
        const wp = npc.def.waypoints[npc.wpIdx];
        const dxN = wp[0] - npc.av.root.position.x;
        const dzN = wp[1] - npc.av.root.position.z;
        const distN = Math.hypot(dxN, dzN);
        if (distN < 0.45) {
          npc.wpIdx = (npc.wpIdx + 1) % npc.def.waypoints.length;
        } else {
          const stepN = Math.min(distN, npc.def.speed * dt);
          npc.av.root.position.x += (dxN / distN) * stepN;
          npc.av.root.position.z += (dzN / distN) * stepN;
          npc.walkDist += stepN;
          const desiredYaw = Math.atan2(dxN, dzN);
          let yDiff = desiredYaw - npc.yaw;
          while (yDiff > Math.PI) yDiff -= Math.PI * 2;
          while (yDiff < -Math.PI) yDiff += Math.PI * 2;
          npc.yaw += yDiff * (1 - Math.exp(-8 * dt));
          npc.av.root.rotation.y = npc.yaw;
          const swingN = Math.sin(npc.walkDist * 2.6) * 0.45;
          npc.av.leftLeg.rotation.x = swingN;
          npc.av.rightLeg.rotation.x = -swingN;
          npc.av.leftArm.rotation.x = -swingN * 0.65;
          npc.av.rightArm.rotation.x = swingN * 0.65;
          npc.av.bodyGroup.position.y = Math.abs(Math.sin(npc.walkDist * 2.6)) * 0.06;
        }
      }

      // Smoothly animate Soccer Ball from server-synced ballStateRef
      const bState = propsRef.current.ballStateRef?.current;
      if (bState) {
        const bAlpha = 1 - Math.exp(-14 * dt);
        const nx = THREE.MathUtils.lerp(ballMesh.position.x, bState.x, bAlpha);
        const nz = THREE.MathUtils.lerp(ballMesh.position.z, bState.z, bAlpha);
        const dxBall = nx - lastBallX;
        const dzBall = nz - lastBallZ;
        ballMesh.position.set(nx, 0.45 + Math.abs(Math.sin((nx + nz) * 1.6)) * 0.06, nz);
        ballMesh.rotation.z -= dxBall * 2.2;
        ballMesh.rotation.x += dzBall * 2.2;
        lastBallX = nx;
        lastBallZ = nz;
      }

      // Animate landmarks, floor-aware cutaway roofs & NPCs
      const insideBuilding =
        gs === "playing"
          ? findInsideBuilding(playerPos.x, playerPos.z, openWorldBuildings, playerPos.y)
          : null;
      let nearestId: string | null = null;
      let nearestDist = 7.2;

      for (const lm of landmarks) {
        const isActive = Boolean(lm.chapterId && lm.chapterId === activeCh);
        const stars = lm.chapterId ? starsMap[lm.chapterId] ?? 0 : 0;
        const playerIsInsideThis = insideBuilding?.id === lm.building.id;
        if (lm.building.style === "gate" || lm.building.style === "maze" || lm.building.style === "parkour") {
          lm.roofGroup.visible = true;
          if (lm.upperFloorGroup) lm.upperFloorGroup.visible = true;
        } else if (playerIsInsideThis) {
          if (playerPos.y < FLOOR_2_Y - 0.8) {
            // Ground floor: hide both roof and floor 2 deck so room interior is unobstructed
            lm.roofGroup.visible = false;
            if (lm.upperFloorGroup) lm.upperFloorGroup.visible = false;
          } else if (playerPos.y < FLOOR_3_Y - 0.8) {
            // Floor 2: keep floor 2 deck visible, hide roof
            if (lm.upperFloorGroup) lm.upperFloorGroup.visible = true;
            lm.roofGroup.visible = false;
          } else {
            // Floor 3 rooftop: keep all decks & railings visible
            if (lm.upperFloorGroup) lm.upperFloorGroup.visible = true;
            lm.roofGroup.visible = true;
          }
        } else {
          lm.roofGroup.visible = true;
          if (lm.upperFloorGroup) lm.upperFloorGroup.visible = true;
        }

        if (lm.chapterId && stars !== lm.lastRenderedStars) {
          lm.lastRenderedStars = stars;
          drawSignboardCanvas(lm.signCanvas, lm.order, lm.shortTitle, lm.accentHex, stars);
          lm.signTex.needsUpdate = true;
        }

        const extraH = lm.building.floors === 3 ? 6.0 : lm.building.floors === 2 ? 2.9 : 0;
        lm.beaconMesh.rotation.y += dt * (isActive ? 2.2 : 1.0);
        lm.beaconMesh.position.y = (isActive ? 7.95 : 7.5) + extraH + Math.sin(totalElapsed * 2.4 + lm.pos.x) * 0.25;
        const mat = lm.beaconMesh.material as THREE.MeshStandardMaterial;
        mat.emissiveIntensity = isActive ? 1.15 : stars > 0 ? 0.75 : 0.45;
        const ringMat = lm.ringMesh.material as THREE.MeshBasicMaterial;
        ringMat.opacity = playerIsInsideThis ? 0.92 : isActive ? 0.85 : 0.35;
        for (const lantern of lm.lanterns) {
          lantern.rotation.z = Math.sin(totalElapsed * 1.9 + lm.pos.x) * 0.08;
        }

        if (lm.chapterId) {
          const distToEntrance = Math.hypot(playerPos.x - lm.pos.x, playerPos.z - (lm.pos.z + 2.8));
          if (distToEntrance < nearestDist) {
            nearestDist = distToEntrance;
            nearestId = lm.chapterId;
          }

          if (lm.npcGroup && lm.npcRightArm) {
            const isNearNpc = distToEntrance < 8.5;
            lm.npcGroup.position.y = Math.sin(totalElapsed * 2.2 + lm.order) * 0.035;
            if (isNearNpc || isActive) {
              lm.npcRightArm.rotation.z = 2.35 + Math.sin(totalElapsed * 6.5 + lm.order) * 0.38;
            } else {
              lm.npcRightArm.rotation.z = 0.25 + Math.sin(totalElapsed * 2.0 + lm.order) * 0.1;
            }
            const targetNpcYaw = isNearNpc
              ? Math.atan2(playerPos.x - lm.npcGroup.position.x, playerPos.z - lm.npcGroup.position.z)
              : 0;
            let yawDiff = targetNpcYaw - lm.npcGroup.rotation.y;
            while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
            while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;
            lm.npcGroup.rotation.y += yawDiff * (1 - Math.exp(-6 * dt));
          }
        }
      }

      if ((insideBuilding?.id ?? null) !== lastInsideId) {
        lastInsideId = insideBuilding?.id ?? null;
        notifyInsideBuilding?.(insideBuilding);
      }

      // Sync 3D Multiplayer Mini-Game Orbs, Coins, Crown, Bomb & Parkour Ring
      const mgShowOrbs =
        activeMg && (activeMg.phase === "active" || activeMg.phase === "countdown")
          ? activeMg.orbs
          : [];
      const wantedOrbIds = new Set(mgShowOrbs.map((o) => o.id));
      for (const [oid, vis] of mgOrbVisuals) {
        if (!wantedOrbIds.has(oid)) {
          scene.remove(vis.group);
          mgOrbVisuals.delete(oid);
        }
      }
      const isLanternMode = activeMg?.kind === "hide_seek";
      for (const o of mgShowOrbs) {
        let vis = mgOrbVisuals.get(o.id);
        const visualKind = o.kind ?? (isLanternMode ? "lantern" : "orb");
        if (!vis) {
          vis = createMgOrbGroup(o.hanzi, visualKind);
          vis.group.position.set(o.x, o.y ?? 0, o.z);
          scene.add(vis.group);
          mgOrbVisuals.set(o.id, vis);
        }
        vis.core.rotation.y += dt * 2.4;
        vis.core.position.y = 1.35 + Math.sin(totalElapsed * 3.1 + o.x) * 0.18;
        const pScale = 1 + Math.sin(totalElapsed * 3.5) * 0.12;
        vis.ring.scale.set(pScale, pScale, 1);
      }

      if (activeMg?.kind === "word_dash" && activeMg.phase === "active" && activeMg.wordPrompt) {
        wordDashBeacon.visible = true;
        wordDashBeacon.position.set(activeMg.wordPrompt.targetX, 11, activeMg.wordPrompt.targetZ);
        wordDashBeacon.rotation.y += dt * 1.4;
      } else {
        wordDashBeacon.visible = false;
      }

      const localIsSeeker = Boolean(
        activeMg?.kind === "hide_seek" &&
          (activeMg.phase === "countdown" || activeMg.phase === "active") &&
          selfMpId &&
          activeMg.seekerId === selfMpId,
      );
      localSeekerRing.visible = localIsSeeker;
      if (localIsSeeker) {
        localSeekerRing.position.set(playerPos.x, playerPos.y + 0.11, playerPos.z);
        const sPulse = 1 + Math.sin(totalElapsed * 5) * 0.14;
        localSeekerRing.scale.set(sPulse, sPulse, 1);
      }

      // Crown holder indicator (Pesta Koin & Mahkota)
      const cHolderId = activeMg?.kind === "coin_party" && activeMg.phase === "active" ? activeMg.crownHolderId : null;
      if (cHolderId) {
        let cPos: THREE.Vector3 | null = null;
        if (cHolderId === selfMpId) {
          cPos = playerPos;
        } else {
          const peerV = remoteVisuals.get(cHolderId);
          if (peerV) cPos = peerV.curPos;
        }
        if (cPos) {
          crownHolderMesh.visible = true;
          crownHolderMesh.position.set(cPos.x, cPos.y + 2.85 + Math.sin(totalElapsed * 4) * 0.1, cPos.z);
          crownHolderMesh.rotation.y += dt * 2.5;
        } else {
          crownHolderMesh.visible = false;
        }
      } else {
        crownHolderMesh.visible = false;
      }

      // Bomb holder indicator (Estafet Bom Waktu)
      const bHolderId = activeMg?.kind === "tag_bomb" && activeMg.phase === "active" ? activeMg.bombHolderId : null;
      if (bHolderId) {
        let bPos: THREE.Vector3 | null = null;
        if (bHolderId === selfMpId) {
          bPos = playerPos;
        } else {
          const peerV = remoteVisuals.get(bHolderId);
          if (peerV) bPos = peerV.curPos;
        }
        if (bPos) {
          bombHolderMesh.visible = true;
          bombHolderMesh.position.set(bPos.x, bPos.y + 2.85, bPos.z);
          const pulse = 1 + Math.sin(totalElapsed * 12) * 0.18;
          bombSphere.scale.setScalar(pulse);
        } else {
          bombHolderMesh.visible = false;
        }
      } else {
        bombHolderMesh.visible = false;
      }

      // Parkour Race next checkpoint ring for local player
      if (activeMg?.kind === "parkour_race" && activeMg.phase === "active" && activeMg.checkpoints) {
        const selfState = activeMg.players.find((p) => p.id === selfMpId);
        const cpIdx = selfState?.checkpointIdx ?? 0;
        const cp = activeMg.checkpoints[cpIdx];
        if (cp) {
          parkourRing.visible = true;
          parkourRing.position.set(cp.x, cp.y, cp.z);
          parkourTorus.rotation.y += dt * 1.8;
        } else {
          parkourRing.visible = false;
        }
      } else {
        parkourRing.visible = false;
      }

      const gradMode = Boolean(propsRef.current.graduationMode);

      // Animate & check Collectible Hanzi Orbs (hidden and paused during graduation ceremony)
      const collectedSet = new Set(collectedIds);
      for (const ov of orbVisuals) {
        const isDone = collectedSet.has(ov.def.id);
        ov.group.visible = !isDone && !gradMode;
        if (!isDone && !gradMode) {
          ov.coreMesh.rotation.y += dt * 2.1;
          ov.coreMesh.position.y = 1.4 + Math.sin(totalElapsed * 2.8 + ov.def.worldPos[0]) * 0.2;
          const pulse = 1 + Math.sin(totalElapsed * 3.2) * 0.12;
          ov.haloMesh.scale.set(pulse, pulse, 1);

          if (gs === "playing") {
            const d = Math.hypot(playerPos.x - ov.def.worldPos[0], playerPos.z - ov.def.worldPos[2]);
            if (d < 2.25) {
              triggerOrbBurst(ov.def.worldPos[0], ov.def.worldPos[2]);
              collectOrbCb?.(ov.def.id);
            }
          }
        }
      }

      if (gradMode !== wasGraduationMode) {
        wasGraduationMode = gradMode;
        for (const lm of landmarks) {
          lm.signSprite.visible = !gradMode;
          lm.beaconMesh.visible = !gradMode;
        }
        if (gradMode) {
          savedPreGrad.x = playerPos.x;
          savedPreGrad.z = playerPos.z;
          savedPreGrad.yaw = playerYaw;
          savedPreGrad.camYawTarget = camYawTarget;
          savedPreGrad.camPitchTarget = camPitchTarget;
          savedPreGrad.camDistTarget = camDistTarget;

          graduationStage.group.visible = true;
          confettiInst.visible = true;
          player.setScooter(false);
          player.capCrown.visible = false;
          player.capBrim.visible = false;
          player.gradCapGroup.visible = true;
          player.gradStole.visible = true;

          playerPos.set(0, 0.34, 4.6);
          playerYaw = 0;
          playerVelY = 0;
          isGrounded = true;
          targetChapterWaypointRef.current = null;
          camYawTarget = 0.18;
          camPitchTarget = 0.19;
          camDistTarget = camera.aspect < 0.92 ? 12.6 : 8.9;
          capTossTimer = 1.4;
          triggerConfettiBurst();
        } else {
          graduationStage.group.visible = false;
          confettiInst.visible = false;
          player.setGender(lastAppliedGender, false);
          player.setScooter(lastAppliedScooter);
          player.gradCapGroup.visible = false;
          player.gradStole.visible = false;
          player.gradCapGroup.position.set(0, 2.02, 0);
          player.gradCapGroup.rotation.set(0, 0, 0);
          player.leftArm.rotation.set(0, 0, 0);
          player.rightArm.rotation.set(0, 0, 0);

          playerPos.set(savedPreGrad.x, 0, savedPreGrad.z);
          playerYaw = savedPreGrad.yaw;
          camYawTarget = savedPreGrad.camYawTarget;
          camPitchTarget = savedPreGrad.camPitchTarget;
          camDistTarget = savedPreGrad.camDistTarget;
          capTossTimer = 0;
        }
      }

      if (gradMode) {
        const celebNonce = propsRef.current.graduationCelebrateNonce ?? 0;
        if (celebNonce !== lastGradCelebrateNonce) {
          lastGradCelebrateNonce = celebNonce;
          capTossTimer = 1.5;
          triggerConfettiBurst();
        }
      } else {
        lastGradCelebrateNonce = propsRef.current.graduationCelebrateNonce ?? 0;
      }

      if (gs === "playing" && !gradMode && nearestId !== lastNearbyId) {
        lastNearbyId = nearestId;
        notifyNearby?.(nearestId);
      } else if ((gs !== "playing" || gradMode) && lastNearbyId !== null) {
        lastNearbyId = null;
        notifyNearby?.(null);
      }

      // Check proximity to interactive Plaza Props (Fountain, Scooter Dock, Lantern Rack, Gacha)
      let nearestProp: InteractivePropDef | null = null;
      if (gs === "playing" && !gradMode) {
        let bestPropDist = Infinity;
        for (const pr of WORLD_INTERACTIVE_PROPS) {
          const dProp = Math.hypot(playerPos.x - pr.x, playerPos.z - pr.z);
          if (dProp <= pr.radius + 0.45 && dProp < bestPropDist) {
            bestPropDist = dProp;
            nearestProp = pr;
          }
        }
      }
      if ((nearestProp?.id ?? null) !== lastNearbyPropId) {
        lastNearbyPropId = nearestProp?.id ?? null;
        propsRef.current.onNearbyPropChange?.(nearestProp);
      }

      if (gs === "title") {
        const orbitAngle = Math.sin(totalElapsed * 0.24) * 0.45;
        const portraitMobile = camera.aspect < 0.92;
        _flyPos.set(
          Math.sin(orbitAngle) * (portraitMobile ? 14 : 18) + (portraitMobile ? 0 : -4),
          portraitMobile ? 13.5 : 12.2,
          (portraitMobile ? 29 : 26) - Math.cos(orbitAngle) * 4,
        );
        camera.position.lerp(_flyPos, 1 - Math.exp(-3.5 * dt));
        _lookTarget.set(portraitMobile ? 0 : -4.5, 1.8, -6);
        camera.lookAt(_lookTarget);
      } else if (gradMode) {
        // Animate confetti falling & swirling over the stage
        for (let i = 0; i < CONFETTI_COUNT; i += 1) {
          const c = confettiData[i];
          c.vy = Math.max(-1.45, c.vy - 4.6 * dt);
          c.x += c.vx * dt;
          c.y += c.vy * dt;
          c.z += c.vz * dt;
          c.vx *= Math.exp(-0.9 * dt);
          c.vz *= Math.exp(-0.9 * dt);
          if (c.y < 0.12) {
            c.x = ((i % 9) - 4) * 0.85 + Math.sin(totalElapsed + i) * 0.35;
            c.y = 4.8 + (i % 4) * 0.55;
            c.z = 4.6 + ((i % 4) - 1.5) * 0.95;
            c.vx = Math.sin(totalElapsed * 1.3 + i) * 0.55;
            c.vy = -1.05 - (i % 3) * 0.25;
            c.vz = Math.cos(totalElapsed * 1.1 + i) * 0.45;
          }
          dummy.position.set(c.x, c.y, c.z);
          dummy.rotation.set(totalElapsed * c.rotSpeed, i * 0.7, totalElapsed * 1.8);
          dummy.scale.setScalar(1);
          dummy.updateMatrix();
          confettiInst.setMatrixAt(i, dummy.matrix);
        }
        confettiInst.instanceMatrix.needsUpdate = true;

        // Animate graduate cheerful pose & 3D graduation cap toss
        if (capTossTimer > 0) {
          capTossTimer = Math.max(0, capTossTimer - dt);
          const norm = 1 - capTossTimer / 1.5;
          const arc = Math.sin(norm * Math.PI);
          playerPos.y = 0.34 + Math.max(0, Math.sin(Math.min(1, norm * 1.35) * Math.PI)) * 0.72;
          player.gradCapGroup.position.set(0, 2.02 + arc * 2.15, 0);
          player.gradCapGroup.rotation.set(arc * 0.4, norm * Math.PI * 2, 0);
          player.leftArm.rotation.z = -2.35 + Math.sin(totalElapsed * 8) * 0.2;
          player.rightArm.rotation.z = 2.35 - Math.sin(totalElapsed * 8) * 0.2;
        } else {
          playerPos.y = 0.34 + Math.sin(totalElapsed * 2.4) * 0.025;
          player.gradCapGroup.position.set(0, 2.02, 0);
          player.gradCapGroup.rotation.set(0, 0, 0);
          player.leftArm.rotation.z = -0.25 + Math.sin(totalElapsed * 2.5) * 0.12;
          player.rightArm.rotation.z = 2.15 + Math.sin(totalElapsed * 4.5) * 0.32;
        }
        player.gradTassel.rotation.z = Math.sin(totalElapsed * 3.8) * 0.22;
        player.leftLeg.rotation.x *= 0.85;
        player.rightLeg.rotation.x *= 0.85;
        player.bodyGroup.scale.set(1, 1, 1);
        player.root.position.copy(playerPos);
        player.root.rotation.y = playerYaw;
        playerShadow.position.set(playerPos.x, 0.348, playerPos.z);
        playerShadow.scale.setScalar(Math.max(0.55, 1 - (playerPos.y - 0.34) * 0.22));

        // Gentle celebratory camera pan (respecting manual drag orbit!)
        if (!isDragging) {
          camYawTarget += dt * 0.14;
        }
        const camDamp = 1 - Math.exp(-8 * dt);
        camYawOffset += normalizeAngleDelta(camYawOffset, camYawTarget) * camDamp;
        camPitch += (camPitchTarget - camPitch) * camDamp;
        camDist += (camDistTarget - camDist) * camDamp;

        const isMobilePortrait = camera.aspect < 0.92;
        const targetGraduationDist = isMobilePortrait ? 12.6 : 8.9;
        if (!isDragging && Math.abs(camDistTarget - targetGraduationDist) > 1.2) {
          camDistTarget = targetGraduationDist;
        }

        const camX = playerPos.x + Math.sin(camYawOffset) * Math.cos(camPitch) * camDist;
        const camY = Math.max(1.2, playerPos.y + 1.55 + Math.sin(camPitch) * camDist);
        const camZ = playerPos.z + Math.cos(camYawOffset) * Math.cos(camPitch) * camDist;
        _camDesired.set(camX, camY, camZ);
        _lookDesired.set(
          playerPos.x + (isMobilePortrait ? 0 : 1.05),
          playerPos.y + (isMobilePortrait ? 0.9 : 1.48),
          playerPos.z,
        );
        camera.position.lerp(_camDesired, 1 - Math.exp(-7 * dt));
        _lookTarget.lerp(_lookDesired, 1 - Math.exp(-10 * dt));
        camera.lookAt(_lookTarget);
      } else if (gs === "playing") {
        const seekerLockedInCountdown = Boolean(
          activeMg?.kind === "hide_seek" &&
            !activeMg.soloMode &&
            activeMg.phase === "countdown" &&
            selfMpId &&
            activeMg.seekerId === selfMpId,
        );
        const disabled = Boolean(propsRef.current.controlsDisabled) || seekerLockedInCountdown;
        if (disabled && keysPressed.size > 0) {
          keysPressed.clear();
        }
        let moveX = disabled ? 0 : (vMoveRef?.current.x ?? 0);
        let moveZ = disabled ? 0 : (vMoveRef?.current.z ?? 0);
        if (!disabled) {
          if (keysPressed.has("KeyW") || keysPressed.has("ArrowUp")) moveZ -= 1;
          if (keysPressed.has("KeyS") || keysPressed.has("ArrowDown")) moveZ += 1;
          if (keysPressed.has("KeyA") || keysPressed.has("ArrowLeft")) moveX -= 1;
          if (keysPressed.has("KeyD") || keysPressed.has("ArrowRight")) moveX += 1;
        }

        const isSprinting =
          !disabled &&
          (keysPressed.has("ShiftLeft") ||
            keysPressed.has("ShiftRight") ||
            Boolean(vSprintRef?.current));

        // Trigger jump from Space or mobile jump button
        const trigNow = jTrigRef?.current ?? 0;
        const wantsJump = !disabled && (keysPressed.has("Space") || trigNow !== lastJumpTrig);
        lastJumpTrig = trigNow;
        if (wantsJump && isGrounded) {
          playerVelY = 9.2;
          isGrounded = false;
          squashAmount = -0.16;
        }

        speedBoostTimer = Math.max(0, speedBoostTimer - dt);
        if (!disabled) {
          for (const bp of WORLD_BOOST_PADS) {
            if (Math.hypot(playerPos.x - bp.x, playerPos.z - bp.z) <= bp.radius && playerPos.y < 1.2) {
              if (speedBoostTimer < 1.8) {
                triggerOrbBurst(bp.x, bp.z);
                stepSfx?.();
              }
              speedBoostTimer = 2.6;
              break;
            }
          }
        }

        const ridingScooter = Boolean(propsRef.current.onScooter) && !gradMode;
        const speed =
          (isSprinting ? 14.5 : 9.2) *
          (ridingScooter ? 1.45 : 1.0) *
          (speedBoostTimer > 0 ? 1.45 : 1.0);
        let movedDist = 0;

        if (moveX !== 0 || moveZ !== 0) {
          targetChapterWaypointRef.current = null;
          _moveVec.set(moveX, 0, moveZ);
          if (_moveVec.lengthSq() > 1) {
            _moveVec.normalize();
          }
          const mag = Math.min(1, Math.hypot(moveX, moveZ));
          _moveVec.normalize();
          const sinYaw = Math.sin(camYawOffset);
          const cosYaw = Math.cos(camYawOffset);
          const rx = _moveVec.x * cosYaw + _moveVec.z * sinYaw;
          const rz = -_moveVec.x * sinYaw + _moveVec.z * cosYaw;
          _moveVec.set(rx, 0, rz).normalize();

          const stepSpeed = speed * mag;
          playerPos.x += _moveVec.x * stepSpeed * dt;
          playerPos.z += _moveVec.z * stepSpeed * dt;
          movedDist = stepSpeed * dt;

          const desiredYaw = Math.atan2(_moveVec.x, _moveVec.z);
          let diff = desiredYaw - playerYaw;
          while (diff > Math.PI) diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;
          playerYaw += diff * (1 - Math.exp(-12 * dt));
        } else if (!disabled && targetChapterWaypointRef.current) {
          const wp = targetChapterWaypointRef.current;
          _moveVec.set(wp.x - playerPos.x, 0, wp.z - playerPos.z);
          const dist = _moveVec.length();
          if (dist > 0.35) {
            _moveVec.normalize();
            const step = Math.min(dist, 10.8 * dt);
            playerPos.x += _moveVec.x * step;
            playerPos.z += _moveVec.z * step;
            movedDist = step;
            const desiredYaw = Math.atan2(_moveVec.x, _moveVec.z);
            let diff = desiredYaw - playerYaw;
            while (diff > Math.PI) diff -= Math.PI * 2;
            while (diff < -Math.PI) diff += Math.PI * 2;
            playerYaw += diff * (1 - Math.exp(-12 * dt));
          } else {
            targetChapterWaypointRef.current = null;
          }
        }

        // Jump Pad Launch (Trampolin Kampus)
        if (!disabled) {
          for (const jp of WORLD_JUMP_PADS) {
            if (
              Math.hypot(playerPos.x - jp.x, playerPos.z - jp.z) <= jp.radius &&
              playerPos.y <= jp.y + 0.95 &&
              playerVelY <= 1.5
            ) {
              playerVelY = jp.boostY;
              isGrounded = false;
              squashAmount = -0.22;
              triggerOrbBurst(jp.x, jp.z);
              stepSfx?.();
              break;
            }
          }
        }

        // Open-World 3D AABB wall collision (walk freely through doorways, stairs & upper floors!)
        const resolved = resolveOpenWorldCollision(
          playerPos.x,
          playerPos.z,
          allWallBoxes,
          solidProps,
          0.42,
          playerPos.y,
        );
        playerPos.x = resolved.x;
        playerPos.z = resolved.z;

        // Multi-floor Stair Ramps, Elevated Balconies & Jump Physics
        const supportY = computeFloorSupportY(
          playerPos.x,
          playerPos.z,
          playerPos.y,
          allElevatedZones,
          allStairRamps,
        );
        if (!isGrounded) {
          playerVelY -= 25 * dt;
          playerPos.y += playerVelY * dt;
          if (playerPos.y <= supportY && playerVelY <= 0) {
            playerPos.y = supportY;
            playerVelY = 0;
            isGrounded = true;
            squashAmount = 0.22;
            stepSfx?.();
          }
        } else if (playerPos.y > supportY + 0.35) {
          isGrounded = false;
        } else {
          playerPos.y = supportY;
        }
        squashAmount *= Math.exp(-12 * dt);
        player.bodyGroup.scale.set(
          1 + squashAmount * 0.45,
          1 - squashAmount,
          1 + squashAmount * 0.45,
        );

        // Local Social Emote Burst Trigger
        const socialBurst = propsRef.current.localSocialBurst;
        if (socialBurst && socialBurst.nonce !== lastSocialNonce) {
          lastSocialNonce = socialBurst.nonce;
          activeSocialKind = socialBurst.kind;
          activeSocialTimer = 2.4;
          if (socialBurst.kind === "firework" || socialBurst.kind === "highfive") {
            triggerOrbBurst(playerPos.x, playerPos.z);
          }
        }
        if (activeSocialTimer > 0) {
          activeSocialTimer = Math.max(0, activeSocialTimer - dt);
          if (activeSocialTimer === 0) activeSocialKind = null;
        }

        // Stride swing, scooter riding stance, social emote pose & sprint lean
        const ridingActive = Boolean(propsRef.current.onScooter) && !gradMode;
        if (ridingActive) {
          walkDistance += movedDist;
          player.leftLeg.rotation.x = 0.08;
          player.rightLeg.rotation.x = -0.14;
          player.leftArm.rotation.x = -0.95;
          player.rightArm.rotation.x = -0.95;
          player.leftArm.rotation.z = 0.14;
          player.rightArm.rotation.z = -0.14;
          player.bodyGroup.position.y = 0.21 + Math.sin(totalElapsed * 7) * (movedDist > 0.001 ? 0.015 : 0.004);
          player.bodyGroup.rotation.x = THREE.MathUtils.lerp(
            player.bodyGroup.rotation.x,
            movedDist > 0.001 ? 0.12 : 0.03,
            1 - Math.exp(-10 * dt),
          );
          player.frontWheel.rotation.x += movedDist * 5.2;
          player.rearWheel.rotation.x += movedDist * 5.2;
        } else if (movedDist > 0.001 && isGrounded) {
          walkDistance += movedDist;
          const swing = Math.sin(walkDistance * 2.8) * (isSprinting ? 0.72 : 0.55);
          player.leftLeg.rotation.x = swing;
          player.rightLeg.rotation.x = -swing;
          player.leftArm.rotation.x = -swing * 0.7;
          player.rightArm.rotation.x = swing * 0.7;
          player.leftArm.rotation.z *= 0.8;
          player.rightArm.rotation.z *= 0.8;
          player.bodyGroup.position.y = Math.abs(Math.sin(walkDistance * 2.8)) * (isSprinting ? 0.12 : 0.08);
          player.bodyGroup.rotation.x = THREE.MathUtils.lerp(
            player.bodyGroup.rotation.x,
            isSprinting ? 0.14 : 0.05,
            1 - Math.exp(-10 * dt),
          );
          if (walkDistance - lastStepTrigger > (isSprinting ? 1.8 : 2.2)) {
            lastStepTrigger = walkDistance;
            stepSfx?.();
          }
        } else {
          player.leftLeg.rotation.x *= 0.8;
          player.rightLeg.rotation.x *= 0.8;
          player.leftArm.rotation.x *= 0.8;
          player.rightArm.rotation.x *= 0.8;
          player.bodyGroup.position.y *= 0.8;
          player.bodyGroup.rotation.x *= 0.82;
          if (activeSocialKind === "wave") {
            player.rightArm.rotation.z = 2.25 + Math.sin(totalElapsed * 12) * 0.45;
            player.leftArm.rotation.z *= 0.8;
          } else if (activeSocialKind === "dance") {
            player.leftArm.rotation.z = -1.6 + Math.sin(totalElapsed * 11) * 0.75;
            player.rightArm.rotation.z = 1.6 + Math.sin(totalElapsed * 11) * 0.75;
            player.bodyGroup.position.y = Math.abs(Math.sin(totalElapsed * 11)) * 0.22;
          } else if (activeSocialKind === "highfive") {
            player.rightArm.rotation.z = 2.6;
            player.leftArm.rotation.z *= 0.8;
          } else if (activeSocialKind === "clap") {
            player.leftArm.rotation.x = -1.2;
            player.rightArm.rotation.x = -1.2;
            player.leftArm.rotation.z = 0.35 + Math.sin(totalElapsed * 16) * 0.25;
            player.rightArm.rotation.z = -0.35 - Math.sin(totalElapsed * 16) * 0.25;
          } else if (activeSocialKind === "firework") {
            player.leftArm.rotation.z = -2.4;
            player.rightArm.rotation.z = 2.4;
          } else {
            player.leftArm.rotation.z *= 0.82;
            player.rightArm.rotation.z *= 0.82;
          }
        }

        player.root.position.copy(playerPos);
        player.root.rotation.y = playerYaw;
        playerShadow.position.set(playerPos.x, supportY + 0.068, playerPos.z);
        const shadowScale = Math.max(0.55, 1 - Math.max(0, playerPos.y - supportY) * 0.14);
        playerShadow.scale.setScalar(shadowScale);

        if (tRef) {
          tRef.current.playerX = playerPos.x;
          tRef.current.playerY = playerPos.y;
          tRef.current.playerZ = playerPos.z;
          tRef.current.playerYaw = playerYaw;
          tRef.current.isSprinting = isSprinting;
          tRef.current.isGrounded = isGrounded;
          propsRef.current.onTelemetryTick?.(tRef.current);
        }

        // Apply camera presets, HUD zoom deltas, and camera reset behind player
        const activePreset = propsRef.current.cameraPreset || "normal";
        if (activePreset !== lastAppliedPreset) {
          lastAppliedPreset = activePreset;
          const cfg = CAMERA_PRESETS[activePreset];
          camDistTarget = cfg.dist;
          camPitchTarget = cfg.pitch;
        }
        const zoomRef = propsRef.current.cameraZoomDeltaRef;
        if (zoomRef && zoomRef.current !== 0) {
          camDistTarget = clampCameraDist(camDistTarget + zoomRef.current);
          zoomRef.current = 0;
        }
        const resetTrig = propsRef.current.cameraResetTriggerRef?.current ?? 0;
        if (resetTrig !== lastResetTrig) {
          lastResetTrig = resetTrig;
          const cfg = CAMERA_PRESETS[activePreset];
          camYawTarget = camYawOffset + normalizeAngleDelta(camYawOffset, getBehindPlayerCameraYaw(playerYaw));
          camPitchTarget = cfg.pitch;
          camDistTarget = cfg.dist;
        }

        // Smooth exponential damping + slightly tighter cutaway framing when inside a building
        const camDamp = 1 - Math.exp(-11 * dt);
        camYawOffset += normalizeAngleDelta(camYawOffset, camYawTarget) * camDamp;
        const effectivePitchTarget = insideBuilding ? Math.max(camPitchTarget, 0.56) : camPitchTarget;
        const effectiveDistTarget = insideBuilding ? Math.min(camDistTarget, 10.5) : camDistTarget;
        camPitch += (effectivePitchTarget - camPitch) * camDamp;
        camDist += (effectiveDistTarget - camDist) * camDamp;

        const camFrame = computeOrbitCameraFrame({
          playerX: playerPos.x,
          playerY: playerPos.y,
          playerZ: playerPos.z,
          camYawOffset,
          camPitch,
          camDist,
          preset: activePreset,
        });
        _camDesired.set(camFrame.camX, camFrame.camY, camFrame.camZ);
        _lookDesired.set(camFrame.targetX, camFrame.targetY, camFrame.targetZ);
        const followDamp = 1 - Math.exp(-9 * dt);
        camera.position.lerp(_camDesired, followDamp);
        _lookTarget.lerp(_lookDesired, 1 - Math.exp(-12 * dt));
        camera.lookAt(_lookTarget);
      }

      // Update local jacket tint, character gender, and scooter mode live!
      const targetJacket = propsRef.current.localJacketHex || "#1d4ed8";
      if (targetJacket !== lastAppliedJacket) {
        lastAppliedJacket = targetJacket;
        player.jacketMat.color.set(targetJacket);
      }
      const targetGender: AvatarGender = propsRef.current.localGender === "girl" ? "girl" : "boy";
      if (targetGender !== lastAppliedGender) {
        lastAppliedGender = targetGender;
        player.setGender(targetGender, gradMode);
        container.setAttribute("data-avatar-gender", targetGender);
      }
      const targetScooter = Boolean(propsRef.current.onScooter) && !gradMode;
      if (targetScooter !== lastAppliedScooter) {
        lastAppliedScooter = targetScooter;
        player.setScooter(targetScooter);
        container.setAttribute("data-on-scooter", String(targetScooter));
      }

      // Handle walk-to-friend waypoint trigger
      const wt = propsRef.current.walkToTargetRef?.current;
      if (wt && wt.nonce !== lastWalkToNonce) {
        lastWalkToNonce = wt.nonce;
        targetChapterWaypointRef.current = new THREE.Vector3(wt.x, 0, wt.z);
      }

      // Sync & animate Open-World Remote Multiplayer Avatars
      const remoteMap = propsRef.current.remotePlayersRef?.current;
      const nowEpoch = Date.now();
      if (remoteMap) {
        for (const [rid, rv] of remoteVisuals) {
          if (!remoteMap.has(rid)) {
            scene.remove(rv.avatar.root);
            scene.remove(rv.shadow);
            rv.shadow.geometry.dispose();
            rv.avatar.root.traverse((obj) => {
              if (obj instanceof THREE.Mesh) {
                obj.geometry.dispose();
                if (Array.isArray(obj.material)) {
                  obj.material.forEach((m) => m.dispose());
                } else {
                  obj.material.dispose();
                }
              }
            });
            rv.nameTex.dispose();
            (rv.nameSprite.material as THREE.SpriteMaterial).dispose();
            rv.bubbleTex.dispose();
            (rv.bubbleSprite.material as THREE.SpriteMaterial).dispose();
            remoteVisuals.delete(rid);
          }
        }

        for (const [rid, snap] of remoteMap) {
          let rv = remoteVisuals.get(rid);
          if (!rv) {
            const snapGender: AvatarGender = snap.gender === "girl" ? "girl" : "boy";
            const av = buildPlayerAvatar(snap.colorHex, snapGender);
            const sh = new THREE.Mesh(new THREE.CircleGeometry(0.68, 16), contactShadowMat);
            sh.rotation.x = -Math.PI / 2;

            const nCanvas = document.createElement("canvas");
            nCanvas.width = 360;
            nCanvas.height = 68;
            drawRemoteNameplateCanvas(nCanvas, snap.name, snap.colorHex, snap.xp);
            const nTex = new THREE.CanvasTexture(nCanvas);
            nTex.colorSpace = THREE.SRGBColorSpace;
            const nSprite = new THREE.Sprite(
              new THREE.SpriteMaterial({ map: nTex, transparent: true, depthWrite: false }),
            );
            nSprite.scale.set(2.5, 0.48, 1);
            nSprite.position.set(0, 2.55, 0);
            av.root.add(nSprite);

            const bCanvas = document.createElement("canvas");
            bCanvas.width = 420;
            bCanvas.height = 136;
            const bTex = new THREE.CanvasTexture(bCanvas);
            bTex.colorSpace = THREE.SRGBColorSpace;
            const bSprite = new THREE.Sprite(
              new THREE.SpriteMaterial({ map: bTex, transparent: true, depthWrite: false }),
            );
            bSprite.scale.set(3.2, 1.04, 1);
            bSprite.position.set(0, 3.35, 0);
            bSprite.visible = false;
            av.root.add(bSprite);

            av.root.position.set(snap.x, snap.y, snap.z);
            av.root.rotation.y = snap.yaw;
            sh.position.set(snap.x, 0.068, snap.z);
            scene.add(av.root);
            scene.add(sh);

            rv = {
              id: rid,
              avatar: av,
              shadow: sh,
              nameCanvas: nCanvas,
              nameTex: nTex,
              nameSprite: nSprite,
              bubbleCanvas: bCanvas,
              bubbleTex: bTex,
              bubbleSprite: bSprite,
              curPos: new THREE.Vector3(snap.x, snap.y, snap.z),
              curYaw: snap.yaw,
              walkDist: 0,
              renderedName: snap.name,
              renderedColor: snap.colorHex,
              renderedGender: snapGender,
              renderedXp: snap.xp,
              renderedChatAt: 0,
            };
            remoteVisuals.set(rid, rv);
          }

          const nextRemoteGender: AvatarGender = snap.gender === "girl" ? "girl" : "boy";
          if (rv.renderedGender !== nextRemoteGender) {
            rv.renderedGender = nextRemoteGender;
            rv.avatar.setGender(nextRemoteGender, false);
          }
          if (
            rv.renderedName !== snap.name ||
            rv.renderedColor !== snap.colorHex ||
            rv.renderedXp !== snap.xp
          ) {
            rv.renderedName = snap.name;
            rv.renderedColor = snap.colorHex;
            rv.renderedXp = snap.xp;
            rv.avatar.jacketMat.color.set(snap.colorHex);
            drawRemoteNameplateCanvas(rv.nameCanvas, snap.name, snap.colorHex, snap.xp);
            rv.nameTex.needsUpdate = true;
          }

          if (snap.lastChat && snap.lastChatAt && nowEpoch - snap.lastChatAt < 6500) {
            if (rv.renderedChatAt !== snap.lastChatAt) {
              rv.renderedChatAt = snap.lastChatAt;
              drawSpeechBubbleCanvas(rv.bubbleCanvas, snap.lastChat, snap.lastChatPinyin);
              rv.bubbleTex.needsUpdate = true;
            }
            rv.bubbleSprite.visible = true;
          } else {
            rv.bubbleSprite.visible = false;
          }

          const prevX = rv.curPos.x;
          const prevZ = rv.curPos.z;
          const alpha = 1 - Math.exp(-12 * dt);
          rv.curPos.x = THREE.MathUtils.lerp(rv.curPos.x, snap.x, alpha);
          rv.curPos.y = THREE.MathUtils.lerp(rv.curPos.y, snap.y, alpha);
          rv.curPos.z = THREE.MathUtils.lerp(rv.curPos.z, snap.z, alpha);

          let yawDiff = snap.yaw - rv.curYaw;
          while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
          while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;
          rv.curYaw += yawDiff * alpha;

          const frameDist = Math.hypot(rv.curPos.x - prevX, rv.curPos.z - prevZ);
          const remoteEmoteActive = Boolean(snap.lastSocial && snap.lastSocialAt && nowEpoch - snap.lastSocialAt < 2500);
          if (frameDist > 0.004 && rv.curPos.y < 0.08) {
            rv.walkDist += frameDist;
            const swing = Math.sin(rv.walkDist * 2.8) * (snap.isSprinting ? 0.72 : 0.55);
            rv.avatar.leftLeg.rotation.x = swing;
            rv.avatar.rightLeg.rotation.x = -swing;
            rv.avatar.leftArm.rotation.x = -swing * 0.7;
            rv.avatar.rightArm.rotation.x = swing * 0.7;
            rv.avatar.leftArm.rotation.z *= 0.8;
            rv.avatar.rightArm.rotation.z *= 0.8;
            rv.avatar.bodyGroup.position.y = Math.abs(Math.sin(rv.walkDist * 2.8)) * 0.08;
          } else {
            rv.avatar.leftLeg.rotation.x *= 0.8;
            rv.avatar.rightLeg.rotation.x *= 0.8;
            rv.avatar.leftArm.rotation.x *= 0.8;
            rv.avatar.rightArm.rotation.x *= 0.8;
            rv.avatar.bodyGroup.position.y *= 0.8;
            if (remoteEmoteActive && snap.lastSocial === "wave") {
              rv.avatar.rightArm.rotation.z = 2.25 + Math.sin(totalElapsed * 12) * 0.45;
            } else if (remoteEmoteActive && snap.lastSocial === "dance") {
              rv.avatar.leftArm.rotation.z = -1.6 + Math.sin(totalElapsed * 11) * 0.75;
              rv.avatar.rightArm.rotation.z = 1.6 + Math.sin(totalElapsed * 11) * 0.75;
              rv.avatar.bodyGroup.position.y = Math.abs(Math.sin(totalElapsed * 11)) * 0.22;
            } else if (remoteEmoteActive && snap.lastSocial === "highfive") {
              rv.avatar.rightArm.rotation.z = 2.6;
            } else if (remoteEmoteActive && snap.lastSocial === "firework") {
              rv.avatar.leftArm.rotation.z = -2.4;
              rv.avatar.rightArm.rotation.z = 2.4;
            } else {
              rv.avatar.leftArm.rotation.z *= 0.82;
              rv.avatar.rightArm.rotation.z *= 0.82;
            }
          }

          rv.avatar.root.position.copy(rv.curPos);
          rv.avatar.root.rotation.y = rv.curYaw;
          const peerSupportY = computeFloorSupportY(
            rv.curPos.x,
            rv.curPos.z,
            rv.curPos.y,
            allElevatedZones,
            allStairRamps,
          );
          rv.shadow.position.set(rv.curPos.x, peerSupportY + 0.068, rv.curPos.z);
          rv.shadow.scale.setScalar(Math.max(0.55, 1 - Math.max(0, rv.curPos.y - peerSupportY) * 0.14));

          // Petak Umpet stealth: hide distant hider nameplates when local player is the Seeker!
          const curMg = propsRef.current.minigame;
          const curSelf = propsRef.current.mpSelfId;
          const isHideSeekActive =
            curMg?.kind === "hide_seek" && !curMg.soloMode && curMg.phase === "active";
          if (isHideSeekActive && curSelf && curMg?.seekerId === curSelf) {
            const dToPeer = Math.hypot(playerPos.x - rv.curPos.x, playerPos.z - rv.curPos.z);
            const peerInside = findInsideBuilding(rv.curPos.x, rv.curPos.z, openWorldBuildings, rv.curPos.y);
            const selfInside = findInsideBuilding(playerPos.x, playerPos.z, openWorldBuildings, playerPos.y);
            const occluded = peerInside && selfInside?.id !== peerInside.id;
            rv.nameSprite.visible = dToPeer <= 8.5 && !occluded;
          } else {
            rv.nameSprite.visible = true;
          }
        }
      }

      if (!contextLost) {
        renderer.render(scene, camera);
      }

      if (isSoftwareGl) {
        afterDraw(tick);
      } else {
        frameId = requestAnimationFrame(tick);
      }
    };

    tick();

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", clearInputs);
      document.removeEventListener("visibilitychange", clearInputs);
      window.removeEventListener("resize", handleResize);
      canvas.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
      canvas.removeEventListener("dblclick", onDoubleClick);
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("webglcontextlost", onContextLost);
      canvas.removeEventListener("webglcontextrestored", onContextRestored);

      envTexture.dispose();
      groundTex.dispose();
      paverMap.dispose();
      paverBump.dispose();
      wallTex.dispose();
      roofBump.dispose();
      gatePlaqueTex.dispose();
      graduationStage.bannerTex.dispose();
      for (const lm of landmarks) {
        lm.signTex.dispose();
      }
      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh || obj instanceof THREE.InstancedMesh || obj instanceof THREE.Points) {
          obj.geometry?.dispose();
          if (Array.isArray(obj.material)) {
            obj.material.forEach((m) => m.dispose());
          } else {
            obj.material?.dispose();
          }
        } else if (obj instanceof THREE.Sprite) {
          obj.material.map?.dispose();
          obj.material.dispose();
        }
      });
      renderer.dispose();
      if (canvas.parentElement === container) {
        container.removeChild(canvas);
      }
    };
  }, [chapters]);

  return (
    <div
      ref={mountRef}
      className="fixed inset-0 z-0 h-full w-full select-none overflow-hidden bg-sky-100 dark:bg-slate-950"
      aria-label="Dunia 3D Kota dan Kampus Hanyu"
    />
  );
};
