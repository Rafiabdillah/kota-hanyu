export type AvatarGender = "boy" | "girl";

export type AvatarStyleId =
  | "boy_street"
  | "boy_scholar"
  | "boy_sporty"
  | "boy_rocker"
  | "girl_sakura"
  | "girl_idol"
  | "girl_sporty"
  | "girl_elegant";

export interface AvatarAppearance {
  styleId: AvatarStyleId;
  hairColor: string;
  skinTone: string;
}

export interface AvatarStylePreset {
  id: AvatarStyleId;
  gender: AvatarGender;
  label: string;
  hanzi: string;
  description: string;
  accentHex: string;
}

export const AVATAR_STYLE_PRESETS: readonly AvatarStylePreset[] = [
  {
    id: "boy_street",
    gender: "boy",
    label: "Street Star",
    hanzi: "街头少年",
    description: "Topi street, kacamata, dan jaket varsity.",
    accentHex: "#2563eb",
  },
  {
    id: "boy_scholar",
    gender: "boy",
    label: "Cerdas Kampus",
    hanzi: "学霸学长",
    description: "Rapih, kacamata, dan dasi akademik.",
    accentHex: "#0f766e",
  },
  {
    id: "boy_sporty",
    gender: "boy",
    label: "Atlet Kampus",
    hanzi: "运动少年",
    description: "Headband, tas olahraga, dan gaya atletis.",
    accentHex: "#ea580c",
  },
  {
    id: "boy_rocker",
    gender: "boy",
    label: "Rocker Keren",
    hanzi: "摇滚帅哥",
    description: "Rambut spike, jaket gelap, dan aksesori metal.",
    accentHex: "#7c3aed",
  },
  {
    id: "girl_sakura",
    gender: "girl",
    label: "Sakura Imut",
    hanzi: "樱花少女",
    description: "Pita kembar, mata besar, dan rok lipit.",
    accentHex: "#ec4899",
  },
  {
    id: "girl_idol",
    gender: "girl",
    label: "Idol Manis",
    hanzi: "甜美偶像",
    description: "Rambut panjang, bintang rambut, dan pita manis.",
    accentHex: "#db2777",
  },
  {
    id: "girl_sporty",
    gender: "girl",
    label: "Sporty Ceria",
    hanzi: "元气少女",
    description: "Ponytail, headband, dan gaya olahraga ceria.",
    accentHex: "#0891b2",
  },
  {
    id: "girl_elegant",
    gender: "girl",
    label: "Elegan Sakura",
    hanzi: "优雅女生",
    description: "Rambut bob, aksesori halus, dan tampilan anggun.",
    accentHex: "#a855f7",
  },
] as const;

export const AVATAR_HAIR_COLORS = [
  { hex: "#172033", label: "Hitam Malam" },
  { hex: "#3b2314", label: "Cokelat Hangat" },
  { hex: "#7c4a21", label: "Cokelat Madu" },
  { hex: "#b7793f", label: "Karamel" },
  { hex: "#6b21a8", label: "Ungu Fantasi" },
  { hex: "#be185d", label: "Pink Sakura" },
] as const;

export const AVATAR_SKIN_TONES = [
  { hex: "#f6cbb0", label: "Cerah" },
  { hex: "#e8b78f", label: "Sawo Matang" },
  { hex: "#c98b63", label: "Medium" },
  { hex: "#9a6245", label: "Gelap" },
] as const;

const DEFAULT_STYLE_BY_GENDER: Record<AvatarGender, AvatarStyleId> = {
  boy: "boy_street",
  girl: "girl_sakura",
};

export function getAvatarStyle(styleId?: unknown): AvatarStylePreset {
  return AVATAR_STYLE_PRESETS.find((preset) => preset.id === styleId) ?? AVATAR_STYLE_PRESETS[0];
}

export function sanitizeAvatarStyleId(raw?: unknown, gender: AvatarGender = "boy"): AvatarStyleId {
  const match = AVATAR_STYLE_PRESETS.find((preset) => preset.id === raw && preset.gender === gender);
  return match?.id ?? DEFAULT_STYLE_BY_GENDER[gender];
}

export function sanitizeHairColor(raw?: unknown): string {
  const candidate = typeof raw === "string" ? raw.toLowerCase() : "";
  return AVATAR_HAIR_COLORS.some((item) => item.hex === candidate)
    ? candidate
    : AVATAR_HAIR_COLORS[0].hex;
}

export function sanitizeSkinTone(raw?: unknown): string {
  const candidate = typeof raw === "string" ? raw.toLowerCase() : "";
  return AVATAR_SKIN_TONES.some((item) => item.hex === candidate)
    ? candidate
    : AVATAR_SKIN_TONES[0].hex;
}

export function sanitizeAvatarAppearance(
  raw?: unknown,
  gender: AvatarGender = "boy",
): AvatarAppearance {
  const candidate = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  return {
    styleId: sanitizeAvatarStyleId(candidate.styleId, gender),
    hairColor: sanitizeHairColor(candidate.hairColor),
    skinTone: sanitizeSkinTone(candidate.skinTone),
  };
}
