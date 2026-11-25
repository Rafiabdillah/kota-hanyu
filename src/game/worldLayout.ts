import type { BuildingStyle } from "../data/types";

export const WORLD_BOUNDS = {
  minX: -78,
  maxX: 78,
  minZ: -88,
  maxZ: 68,
} as const;

export const WORLD_WIDTH = WORLD_BOUNDS.maxX - WORLD_BOUNDS.minX; // 156
export const WORLD_DEPTH = WORLD_BOUNDS.maxZ - WORLD_BOUNDS.minZ; // 156

export interface AabbCollider {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  minY?: number;
  maxY?: number;
}

export interface CircleCollider {
  x: number;
  z: number;
  r: number;
}

export interface ElevatedZone {
  id: string;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  y: number;
}

export interface StairRamp {
  id: string;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  axis: "x" | "z";
  startY: number;
  endY: number;
  /** Which end of the axis corresponds to startY ("min" or "max") */
  startAt: "min" | "max";
}

export interface JumpPadDef {
  id: string;
  x: number;
  y: number;
  z: number;
  radius: number;
  boostY: number;
  label: string;
}

export type FacilityActionKind =
  | "chapter"
  | "energy_cafe"
  | "studio"
  | "graduation"
  | "glossary"
  | "exam"
  | "minigames"
  | "hangout_rest"
  | "hangout_snack"
  | "hangout_show"
  | "hangout_maze"
  | "hangout_music"
  | "hangout_panda"
  | "hangout_dojo"
  | "hangout_gacha"
  | "hangout_observatory"
  | "hangout_scooter";

export type OpenWorldBuildingStyle =
  | BuildingStyle
  | "library"
  | "cafe"
  | "hall"
  | "gallery"
  | "tower"
  | "arcade"
  | "dorm"
  | "mall"
  | "cinema"
  | "maze"
  | "parkour"
  | "music"
  | "petcafe"
  | "dojo"
  | "mart"
  | "observatory"
  | "scooter";

export interface OpenWorldBuildingDef {
  id: string;
  title: string;
  hanziTitle: string;
  subtitle: string;
  style: OpenWorldBuildingStyle;
  accentHex: string;
  x: number;
  z: number;
  floors: 1 | 2 | 3;
  chapterId?: string;
  actionKind: FacilityActionKind;
  actionLabel: string;
  enterable: boolean;
  /** Half-extents of interior walkable floor centered at (x, z) */
  interiorHalfW: number;
  interiorMinZOffset: number;
  interiorMaxZOffset: number;
  /** World-space wall AABB colliders leaving front doorway clear */
  wallBoxes: AabbCollider[];
  /** Walkable upper floors & stair ramps for multi-story exploration */
  elevatedZones: ElevatedZone[];
  stairRamps: StairRamp[];
}

export interface OpenWorldDistrict {
  id: string;
  name: string;
  hanzi: string;
  centerX: number;
  centerZ: number;
  radius: number;
}

export const OPEN_WORLD_DISTRICTS: OpenWorldDistrict[] = [
  { id: "plaza", name: "Alun-Alun Utama", hanzi: "中心广场", centerX: 0, centerZ: 4, radius: 20 },
  { id: "west", name: "Distrik Akademik & Hiburan Barat", hanzi: "西文化区", centerX: -48, centerZ: -12, radius: 28 },
  { id: "east", name: "Distrik Kuliner, Arcade & Mall Timur", hanzi: "东娱乐区", centerX: 48, centerZ: -12, radius: 28 },
  { id: "north", name: "Taman Utara, Labirin & Wisuda", hanzi: "北校园", centerX: 0, centerZ: -62, radius: 32 },
  { id: "south", name: "Arena Bola, Danau & Menara Selatan", hanzi: "南湖公园", centerX: 0, centerZ: 40, radius: 30 },
];

export const CHAPTER_WORLD_COORDS: Record<string, [number, number, number]> = {
  bab1: [0, 0, -4],
  bab2: [-26, 0, 2],
  bab3: [26, 0, 2],
  bab4: [-34, 0, -32],
  bab5: [34, 0, -32],
  bab6: [-22, 0, -56],
  bab7: [22, 0, -56],
};

export const FLOOR_2_Y = 3.4;
export const FLOOR_3_Y = 6.8;

export const SOCCER_FIELD_CENTER = { x: 0, z: 46 } as const;
export const SOCCER_GOALS = {
  westGoalX: -12.5,
  eastGoalX: 12.5,
  minZ: 43.3,
  maxZ: 48.7,
} as const;

export const WORLD_JUMP_PADS: JumpPadDef[] = [
  { id: "jp_plaza_south", x: 0, y: 0.1, z: 32, radius: 1.45, boostY: 16.0, label: "Trampolin Taman" },
  { id: "jp_tower", x: 22.5, y: 0.1, z: 32, radius: 1.4, boostY: 16.5, label: "Trampolin Menara" },
  { id: "jp_arcade", x: 50.5, y: 0.1, z: 25.5, radius: 1.4, boostY: 16.2, label: "Trampolin Arcade" },
  { id: "jp_dorm", x: -50.5, y: 0.1, z: 25.5, radius: 1.4, boostY: 16.2, label: "Trampolin Asrama" },
  { id: "jp_parkour", x: -44, y: 0.1, z: -58.2, radius: 1.5, boostY: 17.0, label: "Trampolin Parkour" },
  { id: "jp_mall_north", x: 50.5, y: 0.1, z: -38, radius: 1.4, boostY: 16.2, label: "Trampolin Mall Utara" },
  { id: "jp_cinema_north", x: -50.5, y: 0.1, z: -38, radius: 1.4, boostY: 16.2, label: "Trampolin Bioskop" },
];

export interface BoostPadDef {
  id: string;
  x: number;
  z: number;
  radius: number;
  label: string;
}

export const WORLD_BOOST_PADS: BoostPadDef[] = [
  { id: "bp_center_north", x: 0, z: -20, radius: 1.35, label: "Jalur Kilat Utara" },
  { id: "bp_center_south", x: 0, z: 24, radius: 1.35, label: "Jalur Kilat Selatan" },
  { id: "bp_west_ave", x: -34, z: 4, radius: 1.35, label: "Jalur Kilat Barat" },
  { id: "bp_east_ave", x: 34, z: 4, radius: 1.35, label: "Jalur Kilat Timur" },
];

export type InteractivePropKind = "fountain" | "lantern_rack" | "scooter_dock" | "gacha_machine";

export interface InteractivePropDef {
  id: string;
  kind: InteractivePropKind;
  title: string;
  hanzi: string;
  actionLabel: string;
  x: number;
  z: number;
  radius: number;
}

export const WORLD_INTERACTIVE_PROPS: InteractivePropDef[] = [
  {
    id: "prop_fountain",
    kind: "fountain",
    title: "Air Mancur Harapan",
    hanzi: "许愿喷泉",
    actionLabel: "Lempar Koin Harapan (+10 XP)",
    x: -7.4,
    z: 14,
    radius: 2.6,
  },
  {
    id: "prop_scooter_plaza",
    kind: "scooter_dock",
    title: "Dermaga Skuter Listrik",
    hanzi: "滑板车站",
    actionLabel: "Naik / Turun Skuter Turbo",
    x: 7.4,
    z: 14,
    radius: 2.4,
  },
  {
    id: "prop_lantern_rack",
    kind: "lantern_rack",
    title: "Rak Lampion Harapan",
    hanzi: "许愿灯架",
    actionLabel: "Terbangkan Lampion (+12 XP)",
    x: -7.4,
    z: 22,
    radius: 2.4,
  },
  {
    id: "prop_gacha_plaza",
    kind: "gacha_machine",
    title: "Mesin Gacha Aksara",
    hanzi: "汉字扭蛋机",
    actionLabel: "Putar Kapsul Keberuntungan",
    x: 7.4,
    z: 22,
    radius: 2.4,
  },
];

export interface RoamingNpcDef {
  id: string;
  name: string;
  gender: "boy" | "girl";
  colorHex: string;
  greetingHanzi: string;
  greetingPinyin: string;
  waypoints: [number, number][];
  speed: number;
}

export const ROAMING_CITIZEN_NPCS: RoamingNpcDef[] = [
  {
    id: "npc_meimei",
    name: "Mei-Mei",
    gender: "girl",
    colorHex: "#ec4899",
    greetingHanzi: "欢迎来玩！",
    greetingPinyin: "Huānyíng lái wán!",
    waypoints: [[-8, 6], [8, 6], [8, 19], [-8, 19]],
    speed: 2.1,
  },
  {
    id: "npc_kai",
    name: "Kai",
    gender: "boy",
    colorHex: "#2563eb",
    greetingHanzi: "一起加油吧！",
    greetingPinyin: "Yìqǐ jiāyóu ba!",
    waypoints: [[-3, -24], [3, -24], [3, -8], [-3, -8]],
    speed: 2.35,
  },
  {
    id: "npc_xiao_yu",
    name: "Xiao Yu",
    gender: "girl",
    colorHex: "#8b5cf6",
    greetingHanzi: "这里风景真好！",
    greetingPinyin: "Zhèlǐ fēngjǐng zhēn hǎo!",
    waypoints: [[20, -10], [40, -10], [40, 2], [20, 2]],
    speed: 1.95,
  },
  {
    id: "npc_leo",
    name: "Leo",
    gender: "boy",
    colorHex: "#059669",
    greetingHanzi: "去踢足球吗？",
    greetingPinyin: "Qù tī zúqiú ma?",
    waypoints: [[-16, 36], [16, 36], [16, 54], [-16, 54]],
    speed: 2.5,
  },
  {
    id: "npc_yue",
    name: "Yue",
    gender: "girl",
    colorHex: "#f59e0b",
    greetingHanzi: "熊猫很可爱！",
    greetingPinyin: "Xióngmāo hěn kě'ài!",
    waypoints: [[-42, -18], [-20, -18], [-20, -6], [-42, -6]],
    speed: 2.05,
  },
];

function makeEnclosedWalls(cx: number, cz: number, halfW = 3.25, doorHalfW = 1.38, minY = 0, maxY = 3.3): AabbCollider[] {
  const wallT = 0.42;
  const backZ = cz - 2.35;
  const frontZ = cz + 1.95;
  return [
    { minX: cx - halfW, maxX: cx + halfW, minZ: backZ - wallT * 0.5, maxZ: backZ + wallT * 0.5, minY, maxY },
    { minX: cx - halfW - wallT * 0.5, maxX: cx - halfW + wallT * 0.5, minZ: backZ, maxZ: frontZ, minY, maxY },
    { minX: cx + halfW - wallT * 0.5, maxX: cx + halfW + wallT * 0.5, minZ: backZ, maxZ: frontZ, minY, maxY },
    { minX: cx - halfW, maxX: cx - doorHalfW, minZ: frontZ - wallT * 0.5, maxZ: frontZ + wallT * 0.5, minY, maxY },
    { minX: cx + doorHalfW, maxX: cx + halfW, minZ: frontZ - wallT * 0.5, maxZ: frontZ + wallT * 0.5, minY, maxY },
  ];
}

function makeMultiFloorStructure(
  id: string,
  cx: number,
  cz: number,
  floors: 2 | 3,
): {
  wallBoxes: AabbCollider[];
  elevatedZones: ElevatedZone[];
  stairRamps: StairRamp[];
} {
  // Ground floor walls (halfW = 3.25) + open doorway [-1.38..1.38]
  const wallBoxes: AabbCollider[] = [
    ...makeEnclosedWalls(cx, cz, 3.25, 1.38, 0, 3.2),
  ];

  // Second floor deck covers [-3.3..3.3, -2.55..2.25] + east stair landing [3.3..5.2]
  const elevatedZones: ElevatedZone[] = [
    {
      id: `${id}_f2`,
      minX: cx - 3.45,
      maxX: cx + 5.15,
      minZ: cz - 2.55,
      maxZ: cz + 2.25,
      y: FLOOR_2_Y,
    },
  ];

  // East-side walkable stair ramp going from South front (z = cz + 2.6, y = 0) North up to Lantai 2 landing (z = cz - 1.7, y = 3.4)
  const stairRamps: StairRamp[] = [
    {
      id: `${id}_stair_1_2`,
      minX: cx + 3.48,
      maxX: cx + 5.15,
      minZ: cz - 1.7,
      maxZ: cz + 2.65,
      axis: "z",
      startY: 0,
      endY: FLOOR_2_Y,
      startAt: "max",
    },
  ];

  // Back guard wall on Lantai 2 so players can explore safely without clipping off the rear edge
  wallBoxes.push({
    minX: cx - 3.3,
    maxX: cx + 3.3,
    minZ: cz - 2.55,
    maxZ: cz - 2.15,
    minY: FLOOR_2_Y,
    maxY: FLOOR_2_Y + 3.0,
  });

  if (floors === 3) {
    // Third floor rooftop deck covers [-3.35..3.35, -2.5..2.2]
    elevatedZones.push({
      id: `${id}_f3`,
      minX: cx - 5.15,
      maxX: cx + 3.35,
      minZ: cz - 2.5,
      maxZ: cz + 2.2,
      y: FLOOR_3_Y,
    });
    // West-side stair ramp going from Lantai 2 (z = cz + 2.5, y = 3.4) North up to Lantai 3 Rooftop (z = cz - 1.7, y = 6.8)
    stairRamps.push({
      id: `${id}_stair_2_3`,
      minX: cx - 5.15,
      maxX: cx - 3.48,
      minZ: cz - 1.7,
      maxZ: cz + 2.65,
      axis: "z",
      startY: FLOOR_2_Y,
      endY: FLOOR_3_Y,
      startAt: "max",
    });
  }

  return { wallBoxes, elevatedZones, stairRamps };
}

function makeMazeWalls(cx: number, cz: number): AabbCollider[] {
  // Open-top hedged bamboo labyrinth (9x9m) with south entrance & north exit + twisting interior corridors
  return [
    // North outer (split for back exit)
    { minX: cx - 4.5, maxX: cx - 1.3, minZ: cz - 4.5, maxZ: cz - 4.0 },
    { minX: cx + 1.3, maxX: cx + 4.5, minZ: cz - 4.5, maxZ: cz - 4.0 },
    // West & East outer
    { minX: cx - 4.5, maxX: cx - 4.0, minZ: cz - 4.5, maxZ: cz + 4.5 },
    { minX: cx + 4.0, maxX: cx + 4.5, minZ: cz - 4.5, maxZ: cz + 4.5 },
    // South outer (wide entrance)
    { minX: cx - 4.5, maxX: cx - 1.4, minZ: cz + 4.0, maxZ: cz + 4.5 },
    { minX: cx + 1.4, maxX: cx + 4.5, minZ: cz + 4.0, maxZ: cz + 4.5 },
    // Inner maze hedges
    { minX: cx - 2.2, maxX: cx + 2.2, minZ: cz + 1.4, maxZ: cz + 1.9 },
    { minX: cx - 2.2, maxX: cx - 1.7, minZ: cz - 1.8, maxZ: cz + 1.8 },
    { minX: cx + 1.7, maxX: cx + 2.2, minZ: cz - 1.8, maxZ: cz + 0.3 },
    { minX: cx - 0.3, maxX: cx + 2.2, minZ: cz - 2.2, maxZ: cz - 1.7 },
  ];
}

function makeParkourStructure(
  id: string,
  cx: number,
  cz: number,
): {
  wallBoxes: AabbCollider[];
  elevatedZones: ElevatedZone[];
  stairRamps: StairRamp[];
} {
  return {
    wallBoxes: [],
    elevatedZones: [
      { id: `${id}_step1`, minX: cx - 4.2, maxX: cx - 0.8, minZ: cz - 2.2, maxZ: cz + 1.8, y: 1.8 },
      { id: `${id}_top`, minX: cx - 0.5, maxX: cx + 4.2, minZ: cz - 2.4, maxZ: cz + 2.2, y: FLOOR_2_Y },
    ],
    stairRamps: [
      {
        id: `${id}_ramp1`,
        minX: cx - 4.0,
        maxX: cx - 1.0,
        minZ: cz + 1.8,
        maxZ: cz + 4.4,
        axis: "z",
        startY: 0,
        endY: 1.8,
        startAt: "max",
      },
      {
        id: `${id}_ramp2`,
        minX: cx - 0.8,
        maxX: cx + 1.8,
        minZ: cz - 1.2,
        maxZ: cz + 1.2,
        axis: "x",
        startY: 1.8,
        endY: FLOOR_2_Y,
        startAt: "min",
      },
    ],
  };
}

function makeGatePillars(cx: number, cz: number): AabbCollider[] {
  return [-2.45, -1.15, 1.15, 2.45].map((px) => ({
    minX: cx + px - 0.34,
    maxX: cx + px + 0.34,
    minZ: cz - 0.38,
    maxZ: cz + 0.38,
  }));
}

function makeOpenPavilionWalls(cx: number, cz: number): AabbCollider[] {
  return [
    { minX: cx - 3.0, maxX: cx + 3.0, minZ: cz - 2.15, maxZ: cz - 1.35 },
    { minX: cx - 3.0, maxX: cx - 2.35, minZ: cz + 1.5, maxZ: cz + 2.15 },
    { minX: cx + 2.35, maxX: cx + 3.0, minZ: cz + 1.5, maxZ: cz + 2.15 },
  ];
}

const towerMulti = makeMultiFloorStructure("facility-tower", 28, 30, 3);
const libMulti = makeMultiFloorStructure("facility-library", -46, -14, 2);
const arcadeMulti = makeMultiFloorStructure("facility-arcade", 56, 22, 2);
const dormMulti = makeMultiFloorStructure("facility-dorm", -56, 22, 2);
const mallMulti = makeMultiFloorStructure("facility-mall", 56, -42, 2);
const cinemaMulti = makeMultiFloorStructure("facility-cinema", -56, -42, 2);
const parkourMulti = makeParkourStructure("facility-parkour", -44, -64);
const musicMulti = makeMultiFloorStructure("facility-music", -26, -14, 2);
const dojoMulti = makeMultiFloorStructure("facility-dojo", -56, -4, 2);
const obsMulti = makeMultiFloorStructure("facility-observatory", -24, 54, 3);

export const CAMPUS_FACILITIES: OpenWorldBuildingDef[] = [
  {
    id: "facility-library",
    title: "Perpustakaan Aksara (2 Lt)",
    hanziTitle: "汉字图书馆",
    subtitle: "Studio Kaligrafi, Flashcard & Balkon Baca Lt.2",
    style: "library",
    accentHex: "#0284c7",
    x: -46,
    z: -14,
    floors: 2,
    actionKind: "studio",
    actionLabel: "Buka Studio Kaligrafi & Flashcard",
    enterable: true,
    interiorHalfW: 3.1,
    interiorMinZOffset: -2.2,
    interiorMaxZOffset: 1.85,
    wallBoxes: libMulti.wallBoxes,
    elevatedZones: libMulti.elevatedZones,
    stairRamps: libMulti.stairRamps,
  },
  {
    id: "facility-cafe",
    title: "Kedai Teh & Mie Bambu",
    hanziTitle: "竹林面馆",
    subtitle: "Istirahat, Pulihkan +2 Energi & Ngobrol",
    style: "cafe",
    accentHex: "#ea580c",
    x: 46,
    z: -14,
    floors: 1,
    actionKind: "energy_cafe",
    actionLabel: "Pulihkan +2 Energi & Minum Teh",
    enterable: true,
    interiorHalfW: 3.1,
    interiorMinZOffset: -2.2,
    interiorMaxZOffset: 1.85,
    wallBoxes: makeEnclosedWalls(46, -14),
    elevatedZones: [],
    stairRamps: [],
  },
  {
    id: "facility-hall",
    title: "Aula Wisuda Agung",
    hanziTitle: "毕业大礼堂",
    subtitle: "Panggung Kelulusan & Sertifikat 3D",
    style: "hall",
    accentHex: "#d97706",
    x: 0,
    z: -66,
    floors: 1,
    actionKind: "graduation",
    actionLabel: "Masuk Panggung Wisuda 3D",
    enterable: true,
    interiorHalfW: 3.1,
    interiorMinZOffset: -2.2,
    interiorMaxZOffset: 1.85,
    wallBoxes: makeEnclosedWalls(0, -66),
    elevatedZones: [],
    stairRamps: [],
  },
  {
    id: "facility-gallery",
    title: "Galeri Budaya & Kosakata",
    hanziTitle: "文化陈列馆",
    subtitle: "Jelajahi Glosarium & Paspor Prestasi",
    style: "gallery",
    accentHex: "#7c3aed",
    x: -28,
    z: 30,
    floors: 1,
    actionKind: "glossary",
    actionLabel: "Buka Glosarium & Paspor",
    enterable: true,
    interiorHalfW: 3.1,
    interiorMinZOffset: -2.2,
    interiorMaxZOffset: 1.85,
    wallBoxes: makeEnclosedWalls(-28, 30),
    elevatedZones: [],
    stairRamps: [],
  },
  {
    id: "facility-tower",
    title: "Menara Pandang Selatan (3 Lt)",
    hanziTitle: "南湖观景塔",
    subtitle: "Naik Tangga ke Lt.2 & Atap Panorama Lt.3!",
    style: "tower",
    accentHex: "#059669",
    x: 28,
    z: 30,
    floors: 3,
    actionKind: "exam",
    actionLabel: "Buka Simulasi Ujian Kampus",
    enterable: true,
    interiorHalfW: 3.1,
    interiorMinZOffset: -2.2,
    interiorMaxZOffset: 1.85,
    wallBoxes: towerMulti.wallBoxes,
    elevatedZones: towerMulti.elevatedZones,
    stairRamps: towerMulti.stairRamps,
  },
  {
    id: "facility-arcade",
    title: "Gedung Arcade & Party (2 Lt)",
    hanziTitle: "游乐场中心",
    subtitle: "Pusat Mini-Game Berdua: Bom, Koin & Petak Umpet!",
    style: "arcade",
    accentHex: "#ec4899",
    x: 56,
    z: 22,
    floors: 2,
    actionKind: "minigames",
    actionLabel: "Buka Lobi Mini-Game Online",
    enterable: true,
    interiorHalfW: 3.1,
    interiorMinZOffset: -2.2,
    interiorMaxZOffset: 1.85,
    wallBoxes: arcadeMulti.wallBoxes,
    elevatedZones: arcadeMulti.elevatedZones,
    stairRamps: arcadeMulti.stairRamps,
  },
  {
    id: "facility-dorm",
    title: "Asrama Mahasiswa (2 Lt)",
    hanziTitle: "学生宿舍楼",
    subtitle: "Ruang Tamu, Kamar & Balkon Sembunyi Lt.2",
    style: "dorm",
    accentHex: "#6366f1",
    x: -56,
    z: 22,
    floors: 2,
    actionKind: "hangout_rest",
    actionLabel: "Santai di Asrama (+2 Energi)",
    enterable: true,
    interiorHalfW: 3.1,
    interiorMinZOffset: -2.2,
    interiorMaxZOffset: 1.85,
    wallBoxes: dormMulti.wallBoxes,
    elevatedZones: dormMulti.elevatedZones,
    stairRamps: dormMulti.stairRamps,
  },
  {
    id: "facility-mall",
    title: "Plaza Mall & Food Court (2 Lt)",
    hanziTitle: "美食广场",
    subtitle: "Toko Boba Lt.1 & Teras Santai Lt.2",
    style: "mall",
    accentHex: "#f59e0b",
    x: 56,
    z: -42,
    floors: 2,
    actionKind: "hangout_snack",
    actionLabel: "Jajan Boba & Camilan (+15 XP & +1 Energi)",
    enterable: true,
    interiorHalfW: 3.1,
    interiorMinZOffset: -2.2,
    interiorMaxZOffset: 1.85,
    wallBoxes: mallMulti.wallBoxes,
    elevatedZones: mallMulti.elevatedZones,
    stairRamps: mallMulti.stairRamps,
  },
  {
    id: "facility-cinema",
    title: "Bioskop & Panggung Musik (2 Lt)",
    hanziTitle: "校园电影院",
    subtitle: "Teater Layar Lebar & Balkon VIP Lt.2",
    style: "cinema",
    accentHex: "#e11d48",
    x: -56,
    z: -42,
    floors: 2,
    actionKind: "hangout_show",
    actionLabel: "Nyalakan Pesta Kembang Api & Musik",
    enterable: true,
    interiorHalfW: 3.1,
    interiorMinZOffset: -2.2,
    interiorMaxZOffset: 1.85,
    wallBoxes: cinemaMulti.wallBoxes,
    elevatedZones: cinemaMulti.elevatedZones,
    stairRamps: cinemaMulti.stairRamps,
  },
  {
    id: "facility-maze",
    title: "Taman Labirin Bambu",
    hanziTitle: "竹林迷宫",
    subtitle: "Lorong Bercabang Seru untuk Petak Umpet!",
    style: "maze",
    accentHex: "#16a34a",
    x: 44,
    z: -64,
    floors: 1,
    actionKind: "hangout_maze",
    actionLabel: "Klaim Harta Labirin (+20 XP)",
    enterable: true,
    interiorHalfW: 4.1,
    interiorMinZOffset: -4.1,
    interiorMaxZOffset: 4.1,
    wallBoxes: makeMazeWalls(44, -64),
    elevatedZones: [],
    stairRamps: [],
  },
  {
    id: "facility-parkour",
    title: "Arena Parkour & Trampolin (2 Lt)",
    hanziTitle: "跑酷乐园",
    subtitle: "Lompat ke Platform Tinggi & Mulai Balapan!",
    style: "parkour",
    accentHex: "#0891b2",
    x: -44,
    z: -64,
    floors: 2,
    actionKind: "minigames",
    actionLabel: "Mulai Balap Parkour Kampus",
    enterable: true,
    interiorHalfW: 4.3,
    interiorMinZOffset: -2.6,
    interiorMaxZOffset: 2.6,
    wallBoxes: parkourMulti.wallBoxes,
    elevatedZones: parkourMulti.elevatedZones,
    stairRamps: parkourMulti.stairRamps,
  },
  {
    id: "facility-music",
    title: "Panggung Konser Musik (2 Lt)",
    hanziTitle: "校园音乐厅",
    subtitle: "Keyboard Panggung, Lampu Disko & Balkon VIP Lt.2",
    style: "music",
    accentHex: "#c026d3",
    x: -26,
    z: -14,
    floors: 2,
    actionKind: "hangout_music",
    actionLabel: "Gelar Konser Kembang Api (+15 XP)",
    enterable: true,
    interiorHalfW: 3.1,
    interiorMinZOffset: -2.2,
    interiorMaxZOffset: 1.85,
    wallBoxes: musicMulti.wallBoxes,
    elevatedZones: musicMulti.elevatedZones,
    stairRamps: musicMulti.stairRamps,
  },
  {
    id: "facility-pet",
    title: "Taman Kafe Panda & Kucing",
    hanziTitle: "熊猫猫咖馆",
    subtitle: "Elus Panda Lucu & Pulihkan Energi Kampus!",
    style: "petcafe",
    accentHex: "#f43f5e",
    x: 26,
    z: -14,
    floors: 1,
    actionKind: "hangout_panda",
    actionLabel: "Elus Panda & Kucing (+2 Energi & +15 XP)",
    enterable: true,
    interiorHalfW: 3.1,
    interiorMinZOffset: -2.2,
    interiorMaxZOffset: 1.85,
    wallBoxes: makeEnclosedWalls(26, -14),
    elevatedZones: [],
    stairRamps: [],
  },
  {
    id: "facility-dojo",
    title: "Paviliun Kungfu & Seni (2 Lt)",
    hanziTitle: "功夫武术馆",
    subtitle: "Arena Latihan Wushu & Teras Meditasi Lt.2",
    style: "dojo",
    accentHex: "#b91c1c",
    x: -56,
    z: -4,
    floors: 2,
    actionKind: "hangout_dojo",
    actionLabel: "Latihan Jurus Fokus (+20 XP)",
    enterable: true,
    interiorHalfW: 3.1,
    interiorMinZOffset: -2.2,
    interiorMaxZOffset: 1.85,
    wallBoxes: dojoMulti.wallBoxes,
    elevatedZones: dojoMulti.elevatedZones,
    stairRamps: dojoMulti.stairRamps,
  },
  {
    id: "facility-mart",
    title: "Toko Suvenir & Gacha Aksara",
    hanziTitle: "幸运扭蛋店",
    subtitle: "Buka Kapsul Peribahasa & Hadiah XP Acak!",
    style: "mart",
    accentHex: "#eab308",
    x: 56,
    z: -4,
    floors: 1,
    actionKind: "hangout_gacha",
    actionLabel: "Putar Gacha Keberuntungan (+XP Acak)",
    enterable: true,
    interiorHalfW: 3.1,
    interiorMinZOffset: -2.2,
    interiorMaxZOffset: 1.85,
    wallBoxes: makeEnclosedWalls(56, -4),
    elevatedZones: [],
    stairRamps: [],
  },
  {
    id: "facility-observatory",
    title: "Observatorium Bintang (3 Lt)",
    hanziTitle: "星空天文台",
    subtitle: "Teleskop Panorama Lantai 3 & Rasi Bintang!",
    style: "observatory",
    accentHex: "#4f46e5",
    x: -24,
    z: 54,
    floors: 3,
    actionKind: "hangout_observatory",
    actionLabel: "Teropong Bintang & Bonus (+18 XP)",
    enterable: true,
    interiorHalfW: 3.1,
    interiorMinZOffset: -2.2,
    interiorMaxZOffset: 1.85,
    wallBoxes: obsMulti.wallBoxes,
    elevatedZones: obsMulti.elevatedZones,
    stairRamps: obsMulti.stairRamps,
  },
  {
    id: "facility-skydock",
    title: "Garasi Skuter & Balon Selatan",
    hanziTitle: "校园滑板港",
    subtitle: "Sewa Skuter Listrik Turbo Keliling Kota!",
    style: "scooter",
    accentHex: "#06b6d4",
    x: 24,
    z: 54,
    floors: 1,
    actionKind: "hangout_scooter",
    actionLabel: "Naik / Turun Skuter Listrik Kampus",
    enterable: true,
    interiorHalfW: 3.1,
    interiorMinZOffset: -2.2,
    interiorMaxZOffset: 1.85,
    wallBoxes: makeEnclosedWalls(24, 54),
    elevatedZones: [],
    stairRamps: [],
  },
];

export function buildAllOpenWorldBuildings(
  chapters: {
    id: string;
    order: number;
    shortTitle: string;
    buildingStyle: BuildingStyle;
    accentHex: string;
    worldPos: [number, number, number];
  }[],
): OpenWorldBuildingDef[] {
  const chapterDefs: OpenWorldBuildingDef[] = chapters.map((ch) => {
    const cx = ch.worldPos[0];
    const cz = ch.worldPos[2];
    const wallBoxes =
      ch.buildingStyle === "gate"
        ? makeGatePillars(cx, cz)
        : ch.buildingStyle === "market" || ch.buildingStyle === "station"
          ? makeOpenPavilionWalls(cx, cz)
          : makeEnclosedWalls(cx, cz);

    return {
      id: ch.id,
      title: `Bab ${ch.order}: ${ch.shortTitle}`,
      hanziTitle: `第${ch.order}课`,
      subtitle: "Ruang Kelas & Misi Interaktif",
      style: ch.buildingStyle,
      accentHex: ch.accentHex,
      x: cx,
      z: cz,
      floors: 1,
      chapterId: ch.id,
      actionKind: "chapter",
      actionLabel: `Mulai Misi Bab ${ch.order}`,
      enterable: true,
      interiorHalfW: ch.buildingStyle === "gate" ? 2.2 : 3.05,
      interiorMinZOffset: ch.buildingStyle === "gate" ? -1.4 : -2.1,
      interiorMaxZOffset: ch.buildingStyle === "gate" ? 1.4 : 1.8,
      wallBoxes,
      elevatedZones: [],
      stairRamps: [],
    };
  });

  return [...chapterDefs, ...CAMPUS_FACILITIES];
}

export function computeFloorSupportY(
  x: number,
  z: number,
  currentY: number,
  elevatedZones: ElevatedZone[],
  stairRamps: StairRamp[],
): number {
  let supportY = 0;

  for (const r of stairRamps) {
    if (x >= r.minX - 0.25 && x <= r.maxX + 0.25 && z >= r.minZ - 0.25 && z <= r.maxZ + 0.25) {
      let t = 0;
      if (r.axis === "z") {
        const span = Math.max(0.01, r.maxZ - r.minZ);
        t = r.startAt === "min" ? (z - r.minZ) / span : (r.maxZ - z) / span;
      } else {
        const span = Math.max(0.01, r.maxX - r.minX);
        t = r.startAt === "min" ? (x - r.minX) / span : (r.maxX - x) / span;
      }
      t = Math.max(0, Math.min(1, t));
      const rampY = r.startY + (r.endY - r.startY) * t;
      // Only snap to stairs if player is within step-on tolerance of the ramp surface
      if (rampY <= currentY + 1.35 && rampY > supportY) {
        supportY = rampY;
      }
    }
  }

  for (const ez of elevatedZones) {
    if (x >= ez.minX && x <= ez.maxX && z >= ez.minZ && z <= ez.maxZ) {
      if (ez.y <= currentY + 1.05 && ez.y > supportY) {
        supportY = ez.y;
      }
    }
  }

  return supportY;
}

export function resolveOpenWorldCollision(
  x: number,
  z: number,
  wallBoxes: AabbCollider[],
  solidCircles: CircleCollider[],
  playerRadius = 0.42,
  playerY = 0,
): { x: number; z: number } {
  let px = Math.max(WORLD_BOUNDS.minX, Math.min(WORLD_BOUNDS.maxX, x));
  let pz = Math.max(WORLD_BOUNDS.minZ, Math.min(WORLD_BOUNDS.maxZ, z));

  for (let pass = 0; pass < 2; pass += 1) {
    for (const box of wallBoxes) {
      const bMinY = box.minY ?? 0;
      const bMaxY = box.maxY ?? 3.4;
      // Ignore colliders on a different floor height
      if (playerY >= bMaxY - 0.15 || playerY + 1.65 <= bMinY) {
        continue;
      }

      const closestX = Math.max(box.minX, Math.min(px, box.maxX));
      const closestZ = Math.max(box.minZ, Math.min(pz, box.maxZ));
      const dx = px - closestX;
      const dz = pz - closestZ;
      const distSq = dx * dx + dz * dz;
      if (distSq < playerRadius * playerRadius) {
        if (distSq > 1e-6) {
          const dist = Math.sqrt(distSq);
          const push = playerRadius - dist;
          px += (dx / dist) * push;
          pz += (dz / dist) * push;
        } else {
          const dLeft = Math.abs(px - box.minX);
          const dRight = Math.abs(box.maxX - px);
          const dTop = Math.abs(pz - box.minZ);
          const dBottom = Math.abs(box.maxZ - pz);
          const minEdge = Math.min(dLeft, dRight, dTop, dBottom);
          if (minEdge === dLeft) px = box.minX - playerRadius;
          else if (minEdge === dRight) px = box.maxX + playerRadius;
          else if (minEdge === dTop) pz = box.minZ - playerRadius;
          else pz = box.maxZ + playerRadius;
        }
      }
    }

    // Solid ground trees/lamps only block when near ground level
    if (playerY < 2.2) {
      for (const c of solidCircles) {
        const dx = px - c.x;
        const dz = pz - c.z;
        const d = Math.hypot(dx, dz);
        const minDist = c.r + playerRadius * 0.5;
        if (d < minDist && d > 1e-4) {
          px = c.x + (dx / d) * minDist;
          pz = c.z + (dz / d) * minDist;
        }
      }
    }
  }

  return {
    x: Math.max(WORLD_BOUNDS.minX, Math.min(WORLD_BOUNDS.maxX, px)),
    z: Math.max(WORLD_BOUNDS.minZ, Math.min(WORLD_BOUNDS.maxZ, pz)),
  };
}

export function findInsideBuilding(
  x: number,
  z: number,
  buildings: OpenWorldBuildingDef[],
  y = 0,
): OpenWorldBuildingDef | null {
  for (const b of buildings) {
    if (!b.enterable) continue;
    const dx = x - b.x;
    const dz = z - b.z;
    const padX = y >= 2.5 && b.floors >= 2 ? Math.max(b.interiorHalfW, 4.9) : b.interiorHalfW;
    if (
      Math.abs(dx) <= padX &&
      dz >= b.interiorMinZOffset &&
      dz <= b.interiorMaxZOffset
    ) {
      return b;
    }
  }
  return null;
}

export function getBuildingEntranceCoords(b: OpenWorldBuildingDef): { x: number; z: number } {
  return { x: b.x, z: b.z + 3.8 };
}

export function describeWorldLocation(
  x: number,
  z: number,
  buildings: OpenWorldBuildingDef[],
  y = 0,
): string {
  const inside = findInsideBuilding(x, z, buildings, y);
  if (inside) {
    const floorTag = y >= FLOOR_3_Y - 0.6 ? " · Lt.3" : y >= FLOOR_2_Y - 0.6 ? " · Lt.2" : "";
    return `${inside.title}${floorTag} (${inside.hanziTitle})`;
  }
  let closestDistrict = OPEN_WORLD_DISTRICTS[0];
  let bestDist = Infinity;
  for (const d of OPEN_WORLD_DISTRICTS) {
    const dist = Math.hypot(x - d.centerX, z - d.centerZ);
    if (dist < bestDist) {
      bestDist = dist;
      closestDistrict = d;
    }
  }
  return `${closestDistrict.name} (${closestDistrict.hanzi})`;
}
