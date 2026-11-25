import React from "react";
import { Play, BookOpen, Compass, Sparkles } from "lucide-react";
import { PLAYER_JACKET_COLORS, type AvatarGender } from "../game/multiplayer";

interface TitleOverlayProps {
  hasSavedProgress: boolean;
  xp: number;
  completedChaptersCount: number;
  collectedOrbsCount?: number;
  totalOrbsCount?: number;
  selectedGender: AvatarGender;
  selectedColorHex: string;
  onSelectGender: (gender: AvatarGender) => void;
  onSelectColor: (hex: string) => void;
  onStart: () => void;
  onOpenCurriculumInfo: () => void;
}

export const TitleOverlay: React.FC<TitleOverlayProps> = ({
  hasSavedProgress,
  xp,
  completedChaptersCount,
  collectedOrbsCount = 0,
  totalOrbsCount = 7,
  selectedGender,
  selectedColorHex,
  onSelectGender,
  onSelectColor,
  onStart,
  onOpenCurriculumInfo,
}) => {
  return (
    <div className="pointer-events-none fixed inset-0 z-20 flex flex-col justify-between p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:p-8">
      {/* Upper-Left Calm Negative-Space Lockup */}
      <div className="custom-scroll pointer-events-auto max-h-[calc(100dvh-76px)] max-w-xl overflow-y-auto rounded-2xl border border-stone-300 bg-white p-5 shadow-2xl dark:border-slate-700 dark:bg-slate-900 sm:p-7">
        <div className="mb-3.5 flex items-center gap-3.5">
          <svg
            viewBox="0 0 64 64"
            className="h-14 w-14 shrink-0"
            aria-hidden="true"
          >
            <rect
              x="4"
              y="6"
              width="56"
              height="52"
              rx="14"
              fill="#1e3a8a"
              stroke="#f59e0b"
              strokeWidth="2.5"
            />
            <path
              d="M14 23 L32 14 L50 23"
              fill="none"
              stroke="#fbbf24"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <line x1="20" y1="24" x2="20" y2="48" stroke="#fef3c7" strokeWidth="3" strokeLinecap="round" />
            <line x1="44" y1="24" x2="44" y2="48" stroke="#fef3c7" strokeWidth="3" strokeLinecap="round" />
            <text
              x="32"
              y="43"
              textAnchor="middle"
              fill="#ffffff"
              fontSize="20"
              fontWeight="700"
            >
              汉
            </text>
          </svg>
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-amber-700 dark:text-amber-400">
              汉语学院 · Open World Kampus 3D
            </div>
            <h1 className="mt-0.5 text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white sm:text-3xl">
              Kota &amp; Kampus Hanyu
            </h1>
            <p className="mt-0.5 text-xs font-medium text-slate-600 dark:text-slate-300 sm:text-sm">
              24 Bangunan · Mode Skuter · Mini-Game Online · Suara Live
            </p>
          </div>
        </div>

        <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-200">
          Jelajahi 24 bangunan interaktif, kendarai skuter listrik, temui warga &amp; teman online, dan kuasai materi{" "}
          <em className="italic pr-0.5">Developing Chinese Elementary 1</em>{" "}
          lewat misi 3D dan percakapan lisan.
        </p>

        {/* Character Gender & Style Selector */}
        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/90 p-3 dark:border-slate-700 dark:bg-slate-800/70">
          <div className="mb-2 flex items-center justify-between text-xs font-extrabold text-slate-700 dark:text-slate-200">
            <span className="inline-flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-pink-600 dark:text-pink-400" />
              Pilih Karakter &amp; Gaya
            </span>
            <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
              Bisa diganti kapan saja
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              data-testid="title-gender-boy"
              onClick={() => onSelectGender("boy")}
              className={`flex min-h-[46px] flex-col items-start justify-center rounded-xl border px-3 py-2 text-left transition ${
                selectedGender === "boy"
                  ? "border-blue-700 bg-blue-50 text-blue-950 ring-2 ring-blue-500/30 dark:border-blue-400 dark:bg-blue-950/60 dark:text-white"
                  : "border-slate-200 bg-white text-slate-700 hover:border-blue-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              }`}
            >
              <span className="text-xs font-extrabold">Cowo Keren (帅气男生)</span>
              <span className="text-[10px] font-medium opacity-80">Topi street, kacamata &amp; jaket varsity</span>
            </button>

            <button
              type="button"
              data-testid="title-gender-girl"
              onClick={() => onSelectGender("girl")}
              className={`flex min-h-[46px] flex-col items-start justify-center rounded-xl border px-3 py-2 text-left transition ${
                selectedGender === "girl"
                  ? "border-pink-600 bg-pink-50 text-pink-950 ring-2 ring-pink-500/30 dark:border-pink-400 dark:bg-pink-950/50 dark:text-white"
                  : "border-slate-200 bg-white text-slate-700 hover:border-pink-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              }`}
            >
              <span className="text-xs font-extrabold">Cewe Imut (可爱女生)</span>
              <span className="text-[10px] font-medium opacity-80">Pita kembar, rok lipit &amp; wajah manis</span>
            </button>
          </div>

          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-[11px] font-bold text-slate-600 dark:text-slate-300">Warna:</span>
            {PLAYER_JACKET_COLORS.map((c) => (
              <button
                key={c.hex}
                type="button"
                aria-label={`Pilih warna ${c.label}`}
                title={c.label}
                data-testid={`title-color-${c.hex}`}
                onClick={() => onSelectColor(c.hex)}
                className={`h-6 w-6 rounded-full border-2 transition ${
                  selectedColorHex === c.hex
                    ? "scale-110 border-slate-900 ring-2 ring-amber-400 dark:border-white"
                    : "border-white/90 opacity-85 hover:opacity-100"
                }`}
                style={{ backgroundColor: c.hex }}
              />
            ))}
          </div>
        </div>

        {hasSavedProgress && (
          <div className="mt-3.5 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-blue-200/80 bg-blue-50/80 px-3.5 py-2 text-xs font-bold text-blue-900 dark:border-blue-800/70 dark:bg-blue-950/60 dark:text-blue-200">
            <span className="font-mono-num">{Math.round(xp)} XP</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono-num">{completedChaptersCount}/7 bab berbintang</span>
            <span aria-hidden="true">·</span>
            <span className="inline-flex items-center gap-1 font-mono-num">
              <Compass className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
              {collectedOrbsCount}/{totalOrbsCount} Orb Kampus
            </span>
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            data-start="true"
            onClick={onStart}
            className="inline-flex min-h-[46px] items-center gap-2 rounded-xl bg-blue-700 px-6 py-3 text-sm font-bold text-white shadow-md transition hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <Play className="h-4 w-4 fill-current" />
            {hasSavedProgress ? "Lanjutkan Petualangan" : "Mulai Petualangan"}
          </button>

          <button
            type="button"
            onClick={onOpenCurriculumInfo}
            className="inline-flex min-h-[46px] items-center gap-2 rounded-xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-800 transition hover:border-blue-600 hover:text-blue-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:border-blue-400"
          >
            <BookOpen className="h-4 w-4" />
            Cek Kurikulum
          </button>
        </div>
      </div>

      {/* Flat, borderless control hint line along bottom safe margin */}
      <div className="flex justify-center">
        <p className="hidden rounded-lg bg-slate-900/85 px-4 py-1.5 text-center text-xs font-medium text-white sm:block">
          WASD Gerak · Shift Lari · Space Lompat · Seret Putar Kamera · Scroll Zoom · C/R Kamera · Enter Mulai
        </p>
        <p className="rounded-lg bg-slate-900/85 px-3 py-1.5 text-center text-[11px] font-medium text-white sm:hidden">
          Geser Stik Gerak · Seret Putar Kamera · Cubit Zoom
        </p>
      </div>
    </div>
  );
};

