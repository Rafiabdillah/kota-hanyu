import React, { useEffect, useState } from "react";
import { Volume2 } from "lucide-react";

export type TeacherMood =
  | "idle"
  | "explaining"
  | "speaking"
  | "happy"
  | "encouraging"
  | "thinking";

interface TeacherAvatarProps {
  mood?: TeacherMood;
  isSpeaking?: boolean;
  size?: "sm" | "md" | "lg";
  speakerName?: string;
}

export const TeacherAvatar: React.FC<TeacherAvatarProps> = ({
  mood = "idle",
  isSpeaking = false,
  size = "md",
  speakerName = "Lǎoshī Lín (林老师)",
}) => {
  const [blinking, setBlinking] = useState(false);
  const [mouthFrame, setMouthFrame] = useState(0);

  // Natural periodic blinking
  useEffect(() => {
    let blinkTimeout: number | null = null;
    const interval = window.setInterval(() => {
      setBlinking(true);
      blinkTimeout = window.setTimeout(() => setBlinking(false), 140);
    }, 3400);
    return () => {
      window.clearInterval(interval);
      if (blinkTimeout !== null) window.clearTimeout(blinkTimeout);
    };
  }, []);

  // Lip-sync mouth cadence while speaking or actively explaining
  useEffect(() => {
    if (!isSpeaking) {
      setMouthFrame(0);
      return;
    }
    const timer = window.setInterval(() => {
      setMouthFrame((f) => (f + 1) % 4);
    }, 130);
    return () => window.clearInterval(timer);
  }, [isSpeaking]);

  const dimClass =
    size === "sm"
      ? "h-12 w-12"
      : size === "lg"
        ? "h-24 w-24 sm:h-28 sm:w-28"
        : "h-16 w-16 sm:h-20 sm:w-20";

  const coatColor =
    mood === "happy"
      ? "#059669"
      : mood === "encouraging"
        ? "#d97706"
        : "#1d4ed8";

  const showPointer = mood === "explaining" || mood === "speaking" || isSpeaking;

  return (
    <div
      className="relative shrink-0 select-none"
      aria-label={`Karakter Guru ${speakerName}`}
      data-testid="teacher-avatar"
      data-speaking={String(isSpeaking)}
      data-mood={mood}
    >
      <div
        className={`${dimClass} overflow-hidden rounded-2xl border border-slate-300 bg-sky-50 shadow-sm dark:border-slate-700 dark:bg-slate-800`}
      >
        <svg viewBox="0 0 100 100" className="h-full w-full" aria-hidden="true">
          {/* Warm Classroom Backdrop */}
          <rect width="100" height="100" fill="currentColor" className="text-sky-100 dark:text-slate-800" />
          <rect x="8" y="10" width="84" height="44" rx="4" fill="#1e3a5f" opacity="0.16" />

          <g className="teacher-breathe">
            {/* Hair back bun */}
            <circle cx="50" cy="18" r="12" fill="#1e293b" />
            <circle cx="50" cy="18" r="5" fill="#f59e0b" />

            {/* Shoulders & Blazer */}
            <path
              d="M18 100 C18 76, 32 70, 50 70 C68 70, 82 76, 82 100 Z"
              fill={coatColor}
            />
            {/* Crisp White Collar */}
            <path d="M39 70 L50 83 L61 70 Z" fill="#f8fafc" />
            <path d="M48 79 L52 79 L50 92 Z" fill="#f59e0b" />

            {/* Neck & Face */}
            <rect x="44" y="59" width="12" height="14" rx="4" fill="#f2c49d" />
            <ellipse cx="50" cy="44" rx="19" ry="21" fill="#f7cfb0" />

            {/* Cheek blush */}
            <ellipse cx="37" cy="49" rx="3.4" ry="1.9" fill="#fb7185" opacity="0.32" />
            <ellipse cx="63" cy="49" rx="3.4" ry="1.9" fill="#fb7185" opacity="0.32" />

            {/* Hair bangs */}
            <path
              d="M30 41 C31 24, 41 20, 50 20 C60 20, 69 25, 70 41 C65 32, 58 29, 50 32 C42 29, 35 32, 30 41 Z"
              fill="#1e293b"
            />

            {/* Eyebrows */}
            {mood === "encouraging" || mood === "thinking" ? (
              <>
                <path d="M37 35 Q41 32 45 35" stroke="#1e293b" strokeWidth="2" fill="none" strokeLinecap="round" />
                <path d="M55 34 Q59 31 63 34" stroke="#1e293b" strokeWidth="2" fill="none" strokeLinecap="round" />
              </>
            ) : (
              <>
                <path d="M37 35 Q41 33 45 35" stroke="#1e293b" strokeWidth="2" fill="none" strokeLinecap="round" />
                <path d="M55 35 Q59 33 63 35" stroke="#1e293b" strokeWidth="2" fill="none" strokeLinecap="round" />
              </>
            )}

            {/* Eyes (Blinking or Happy Arc or Open) */}
            {blinking ? (
              <>
                <path d="M37 42 Q41 44 45 42" stroke="#0f172a" strokeWidth="2.2" fill="none" strokeLinecap="round" />
                <path d="M55 42 Q59 44 63 42" stroke="#0f172a" strokeWidth="2.2" fill="none" strokeLinecap="round" />
              </>
            ) : mood === "happy" ? (
              <>
                <path d="M37 43 Q41 38 45 43" stroke="#0f172a" strokeWidth="2.4" fill="none" strokeLinecap="round" />
                <path d="M55 43 Q59 38 63 43" stroke="#0f172a" strokeWidth="2.4" fill="none" strokeLinecap="round" />
              </>
            ) : (
              <>
                <circle cx="41" cy="42" r="2.7" fill="#0f172a" />
                <circle cx="59" cy="42" r="2.7" fill="#0f172a" />
                <circle cx="41.9" cy="41" r="0.9" fill="#ffffff" />
                <circle cx="59.9" cy="41" r="0.9" fill="#ffffff" />
              </>
            )}

            {/* Thin Academic Glasses */}
            <rect
              x="35"
              y="37.5"
              width="12"
              height="9"
              rx="3"
              fill="none"
              stroke="#334155"
              strokeWidth="1.5"
            />
            <rect
              x="53"
              y="37.5"
              width="12"
              height="9"
              rx="3"
              fill="none"
              stroke="#334155"
              strokeWidth="1.5"
            />
            <line x1="47" y1="42" x2="53" y2="42" stroke="#334155" strokeWidth="1.5" />

            {/* Mouth: Lip-synced when speaking, expressive smile otherwise */}
            {isSpeaking ? (
              mouthFrame === 1 ? (
                <ellipse cx="50" cy="54" rx="4.2" ry="3.4" fill="#9f1239" />
              ) : mouthFrame === 2 ? (
                <ellipse cx="50" cy="54" rx="5.2" ry="2.2" fill="#9f1239" />
              ) : mouthFrame === 3 ? (
                <ellipse cx="50" cy="54" rx="3.2" ry="4.1" fill="#9f1239" />
              ) : (
                <path d="M44 53 Q50 57 56 53" stroke="#9f1239" strokeWidth="2.2" fill="none" strokeLinecap="round" />
              )
            ) : mood === "happy" ? (
              <path d="M43 52 Q50 59 57 52 Z" fill="#9f1239" />
            ) : mood === "thinking" ? (
              <path d="M46 54 Q50 53 54 54" stroke="#9f1239" strokeWidth="2.1" fill="none" strokeLinecap="round" />
            ) : (
              <path d="M44 53 Q50 57 56 53" stroke="#9f1239" strokeWidth="2.2" fill="none" strokeLinecap="round" />
            )}
          </g>

          {/* Animated Teaching Pointer / Gesture */}
          {showPointer && (
            <g className="teacher-pointer">
              <line
                x1="72"
                y1="86"
                x2="89"
                y2="54"
                stroke="#f59e0b"
                strokeWidth="2.6"
                strokeLinecap="round"
              />
              <circle cx="89" cy="54" r="2.2" fill="#fbbf24" />
              <circle cx="72" cy="86" r="5" fill="#f7cfb0" />
            </g>
          )}
        </svg>
      </div>
    </div>
  );
};

interface ToneContourExplorerProps {
  onSpeakTone: (sampleText: string) => void;
}

const TONES = [
  {
    num: 1,
    mark: "ˉ",
    label: "Nada 1 (55 · Datar Tinggi)",
    sample: "妈 mā",
    speakText: "妈",
    meaning: "Ibu",
    path: "M 8 14 L 72 14",
    color: "#2563eb",
  },
  {
    num: 2,
    mark: "ˊ",
    label: "Nada 2 (35 · Naik Tajam)",
    sample: "麻 má",
    speakText: "麻",
    meaning: "Rami / kebas",
    path: "M 8 34 Q 40 28 72 12",
    color: "#059669",
  },
  {
    num: 3,
    mark: "ˇ",
    label: "Nada 3 (214 · Turun-Naik)",
    sample: "马 mǎ",
    speakText: "马",
    meaning: "Kuda",
    path: "M 8 32 Q 36 48 72 18",
    color: "#d97706",
  },
  {
    num: 4,
    mark: "ˋ",
    label: "Nada 4 (51 · Turun Tegas)",
    sample: "骂 mà",
    speakText: "骂",
    meaning: "Memarahi",
    path: "M 8 12 Q 40 24 72 44",
    color: "#dc2626",
  },
];

export const ToneContourExplorer: React.FC<ToneContourExplorerProps> = ({ onSpeakTone }) => {
  const [activeTone, setActiveTone] = useState(1);
  const current = TONES.find((t) => t.num === activeTone) ?? TONES[0];

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 dark:border-slate-700 dark:bg-slate-800/70">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-xs font-extrabold uppercase tracking-wider text-blue-700 dark:text-blue-400">
            Lab 4 Nada Mandarin (四声) · Tambahan Visual
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-300">
            Ketuk nada untuk melihat kurva tinggi-rendah suara &amp; mendengar pelafalan langsung.
          </p>
        </div>
        <button
          type="button"
          onClick={() => onSpeakTone(current.speakText)}
          className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-1 text-xs font-bold text-white hover:bg-emerald-800"
        >
          <Volume2 className="h-3.5 w-3.5" />
          Dengar {current.sample}
        </button>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-4">
        {TONES.map((t) => {
          const active = t.num === activeTone;
          return (
            <button
              key={t.num}
              type="button"
              onClick={() => {
                setActiveTone(t.num);
                onSpeakTone(t.speakText);
              }}
              className={`flex flex-col items-start rounded-xl border p-2.5 text-left transition ${
                active
                  ? "border-blue-700 bg-white shadow-sm dark:border-blue-400 dark:bg-slate-900"
                  : "border-slate-200 bg-white/60 hover:border-slate-400 dark:border-slate-700 dark:bg-slate-900/50"
              }`}
            >
              <div className="flex w-full items-center justify-between">
                <span className="hanzi-text text-sm font-extrabold text-slate-900 dark:text-white">
                  {t.sample}
                </span>
                <span className="text-xs font-bold" style={{ color: t.color }}>
                  {t.mark}
                </span>
              </div>
              <svg viewBox="0 0 80 52" className="my-1 h-9 w-full" aria-hidden="true">
                <line x1="6" y1="12" x2="74" y2="12" stroke="#cbd5e1" strokeWidth="1" strokeDasharray="2 2" />
                <line x1="6" y1="28" x2="74" y2="28" stroke="#cbd5e1" strokeWidth="1" strokeDasharray="2 2" />
                <line x1="6" y1="44" x2="74" y2="44" stroke="#cbd5e1" strokeWidth="1" strokeDasharray="2 2" />
                <path
                  d={t.path}
                  fill="none"
                  stroke={t.color}
                  strokeWidth={active ? "4" : "2.5"}
                  strokeLinecap="round"
                />
              </svg>
              <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                {t.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
