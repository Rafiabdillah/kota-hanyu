import React, { useState } from "react";
import { Award, Download, GraduationCap, ArrowLeft, Volume2, Sparkles, Music } from "lucide-react";
import type { GraduationSummary } from "../game/engine";
import { speakMandarin } from "../game/audio";

interface GraduationOverlayProps {
  studentName: string;
  xp: number;
  summary: GraduationSummary;
  muted: boolean;
  bgmEnabled?: boolean;
  speechRate: number;
  naturalTtsEnabled: boolean;
  onToggleBgm?: () => void;
  onCelebrate: () => void;
  onExit: () => void;
}

function downloadDiplomaPng(studentName: string, xp: number, summary: GraduationSummary): void {
  const canvas = document.createElement("canvas");
  canvas.width = 1400;
  canvas.height = 960;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  // Ivory parchment background
  ctx.fillStyle = "#fdfbf5";
  ctx.fillRect(0, 0, 1400, 960);

  // Outer royal navy & gold frames
  ctx.strokeStyle = "#1e3a8a";
  ctx.lineWidth = 18;
  ctx.strokeRect(36, 36, 1328, 888);

  ctx.strokeStyle = "#d97706";
  ctx.lineWidth = 5;
  ctx.strokeRect(58, 58, 1284, 844);

  // Top Header
  ctx.fillStyle = "#991b1b";
  ctx.font = "900 44px 'Noto Sans SC', 'PingFang SC', sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("汉语学院 · 毕业证书", 700, 150);

  ctx.fillStyle = "#1e3a8a";
  ctx.font = "800 46px 'Plus Jakarta Sans', system-ui, sans-serif";
  ctx.fillText("SERTIFIKAT KELULUSAN", 700, 222);

  ctx.fillStyle = "#475569";
  ctx.font = "600 24px 'Plus Jakarta Sans', system-ui, sans-serif";
  ctx.fillText("Kota & Kampus Hanyu · Developing Chinese Elementary 1", 700, 272);

  // Divider line
  ctx.strokeStyle = "#cbd5e1";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(260, 315);
  ctx.lineTo(1140, 315);
  ctx.stroke();

  // Recipient
  ctx.fillStyle = "#64748b";
  ctx.font = "600 24px 'Plus Jakarta Sans', system-ui, sans-serif";
  ctx.fillText("Diberikan dengan bangga kepada:", 700, 380);

  ctx.fillStyle = "#0f172a";
  ctx.font = "800 62px 'Plus Jakarta Sans', system-ui, sans-serif";
  ctx.fillText(studentName.trim() || "Rafi", 700, 462);

  // Rank & Mandarin Praise
  ctx.fillStyle = "#b45309";
  ctx.font = "800 32px 'Plus Jakarta Sans', system-ui, sans-serif";
  ctx.fillText(`${summary.rankTitle} · ${summary.rankMandarin}`, 700, 540);

  // Stats Row
  const stats = [
    { label: "Zona Kampus", val: `${summary.completedChapters}/${summary.totalChapters} Bab` },
    { label: "Total Bintang", val: `${summary.totalStars}/${summary.maxStars} ★` },
    { label: "Total XP", val: `${Math.round(xp)} XP` },
    {
      label: "Skor Ujian Terbaik",
      val: summary.bestExamScore !== null ? `${summary.bestExamScore}%` : "Belum Ujian",
    },
  ];
  stats.forEach((st, idx) => {
    const x = 230 + idx * 313;
    ctx.fillStyle = "#f1f5f9";
    ctx.strokeStyle = "#cbd5e1";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(x - 130, 600, 260, 110, 14);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#64748b";
    ctx.font = "700 18px 'Plus Jakarta Sans', system-ui, sans-serif";
    ctx.fillText(st.label, x, 640);

    ctx.fillStyle = "#0f172a";
    ctx.font = "800 28px 'JetBrains Mono', monospace";
    ctx.fillText(st.val, x, 682);
  });

  // Footer Signature & Red Chinese Seal Stamp
  ctx.textAlign = "left";
  ctx.fillStyle = "#334155";
  ctx.font = "700 24px 'Plus Jakarta Sans', system-ui, sans-serif";
  ctx.fillText("Lǎoshī Lín (老师林)", 180, 815);
  ctx.fillStyle = "#64748b";
  ctx.font = "500 20px 'Plus Jakarta Sans', system-ui, sans-serif";
  ctx.fillText(
    `Tanggal: ${new Date().toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}`,
    180,
    850,
  );

  // Traditional Crimson Seal
  ctx.strokeStyle = "#b91c1c";
  ctx.lineWidth = 6;
  ctx.strokeRect(1085, 745, 130, 130);
  ctx.fillStyle = "#b91c1c";
  ctx.font = "900 34px 'Noto Sans SC', serif";
  ctx.textAlign = "center";
  ctx.fillText("汉语", 1150, 798);
  ctx.fillText("学院", 1150, 845);

  const link = document.createElement("a");
  link.download = `sertifikat-kelulusan-${(studentName || "hanyu").toLowerCase().replace(/\s+/g, "-")}.png`;
  link.href = canvas.toDataURL("image/png");
  link.click();
}

export const GraduationOverlay: React.FC<GraduationOverlayProps> = ({
  studentName,
  xp,
  summary,
  muted,
  bgmEnabled = true,
  speechRate,
  naturalTtsEnabled,
  onToggleBgm,
  onCelebrate,
  onExit,
}) => {
  const [speechStatus, setSpeechStatus] = useState<string | null>(null);
  const [downloaded, setDownloaded] = useState(false);

  const playSpeech = () => {
    speakMandarin(summary.ceremonySpeech, {
      muted,
      rate: speechRate,
      naturalTts: naturalTtsEnabled,
      onStatus: setSpeechStatus,
    });
  };

  return (
    <div
      data-testid="graduation-overlay"
      className="pointer-events-none fixed inset-0 z-20 flex flex-col justify-between p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:p-5"
    >
      {/* Top Ceremonial Header (leaves center 3D graduate & stage open) */}
      <div className="flex items-start justify-between gap-2 sm:gap-3">
        <div className="pointer-events-auto min-w-0 flex-1 rounded-2xl border border-amber-400/80 bg-white/95 px-3 py-2 shadow-lg dark:border-amber-500/60 dark:bg-slate-900/95 sm:flex-none sm:px-4 sm:py-2.5">
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] font-bold text-amber-700 dark:text-amber-400 sm:text-xs">
            <GraduationCap className="h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4" />
            <span className="whitespace-nowrap">汉语学院 · 毕业典礼</span>
            <span aria-hidden="true" className="hidden sm:inline">·</span>
            <span className="hidden sm:inline">{summary.statusLabel}</span>
          </div>
          <h1 className="mt-0.5 truncate text-sm font-extrabold tracking-tight text-slate-900 dark:text-white sm:text-xl">
            Upacara Kelulusan Kampus Hanyu
          </h1>
        </div>

        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          {onToggleBgm && (
            <button
              type="button"
              data-testid="grad-bgm-btn"
              onClick={onToggleBgm}
              aria-label={bgmEnabled ? "Matikan musik wisuda" : "Nyalakan musik wisuda"}
              title={bgmEnabled ? "Musik Wisuda: Aktif" : "Musik Wisuda: Mati"}
              className={`pointer-events-auto inline-flex min-h-[42px] shrink-0 items-center justify-center rounded-xl border px-3 py-2 text-xs font-bold shadow-md ${
                bgmEnabled && !muted
                  ? "border-amber-400 bg-white/95 text-amber-700 hover:border-amber-600 dark:border-amber-500/60 dark:bg-slate-900/95 dark:text-amber-300"
                  : "border-slate-300 bg-white/95 text-slate-500 hover:border-blue-600 dark:border-slate-700 dark:bg-slate-900/95 dark:text-slate-400"
              }`}
            >
              <Music className="h-4 w-4" />
            </button>
          )}
          <button
            type="button"
            data-testid="grad-exit-btn"
            onClick={onExit}
            className="pointer-events-auto inline-flex min-h-[42px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl border border-slate-300 bg-white/95 px-3 py-2 text-xs font-bold text-slate-800 shadow-md hover:border-blue-600 dark:border-slate-700 dark:bg-slate-900/95 dark:text-slate-100 sm:px-3.5"
          >
            <ArrowLeft className="h-4 w-4 shrink-0" />
            <span className="hidden sm:inline">Kembali ke Kampus</span>
            <span className="sm:hidden">Kembali</span>
          </button>
        </div>
      </div>

      {/* Right-Docked on Desktop / Bottom-Docked on Mobile Diploma Card */}
      <div className="pointer-events-auto w-full self-end rounded-2xl border border-amber-400/80 bg-white/95 p-4 shadow-2xl dark:border-amber-500/50 dark:bg-slate-900/95 lg:my-auto lg:w-80 lg:p-5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-[11px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">
              {summary.isEligible ? "Ijazah Resmi" : "Pratinjau Wisuda"}
            </div>
            <h2 className="truncate text-base font-extrabold text-slate-900 dark:text-white sm:text-lg">
              {studentName || "Rafi"}
            </h2>
            <p className="text-xs font-semibold text-blue-800 dark:text-blue-300">
              {summary.rankTitle} · <span className="hanzi-text">{summary.rankMandarin}</span>
            </p>
          </div>
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-amber-300 bg-amber-100 text-amber-700 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-300">
            <Award className="h-5 w-5" />
          </div>
        </div>

        {/* Crisp Tabular Stats */}
        <div className="mt-3 grid grid-cols-4 gap-1.5 border-y border-slate-200 py-2.5 text-center dark:border-slate-800 lg:grid-cols-2 lg:gap-2.5">
          <div>
            <div className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">Zona</div>
            <div className="font-mono-num text-xs font-extrabold text-slate-900 dark:text-white sm:text-sm">
              {summary.completedChapters}/{summary.totalChapters}
            </div>
          </div>
          <div>
            <div className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">Bintang</div>
            <div className="font-mono-num text-xs font-extrabold text-amber-600 dark:text-amber-400 sm:text-sm">
              {summary.totalStars}/{summary.maxStars} ★
            </div>
          </div>
          <div>
            <div className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">Total XP</div>
            <div className="font-mono-num text-xs font-extrabold text-blue-700 dark:text-blue-400 sm:text-sm">
              {Math.round(xp)}
            </div>
          </div>
          <div>
            <div className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">Ujian</div>
            <div className="font-mono-num text-xs font-extrabold text-emerald-700 dark:text-emerald-400 sm:text-sm">
              {summary.bestExamScore !== null ? `${summary.bestExamScore}%` : "—"}
            </div>
          </div>
        </div>

        {!summary.isEligible && (
          <p className="mt-2.5 hidden text-xs leading-relaxed text-slate-600 dark:text-slate-300 sm:block">
            Selesaikan Boss di semua {summary.totalChapters} zona kampus untuk membuka predikat kelulusan penuh. Seret layar untuk memutar kamera panggung 3D.
          </p>
        )}

        {/* Primary & Secondary Ceremonial Actions */}
        <div className="mt-3 flex flex-col gap-2">
          <button
            type="button"
            data-testid="grad-toss-btn"
            onClick={() => {
              onCelebrate();
              speakMandarin("干杯！毕业快乐！", {
                muted,
                rate: speechRate,
                naturalTts: naturalTtsEnabled,
              });
            }}
            className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-amber-600 px-4 py-2 text-xs font-extrabold text-white shadow-md hover:bg-amber-700 sm:text-sm"
          >
            <Sparkles className="h-4 w-4" />
            Lempar Topi Toga!
          </button>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              data-testid="grad-speech-btn"
              onClick={playSpeech}
              className="inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-slate-50 px-2.5 text-xs font-bold text-slate-800 hover:border-blue-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            >
              <Volume2 className="h-3.5 w-3.5 shrink-0 text-blue-700 dark:text-blue-400" />
              <span>Ucapan Lǎoshī</span>
            </button>

            <button
              type="button"
              data-testid="grad-download-btn"
              onClick={() => {
                downloadDiplomaPng(studentName, xp, summary);
                setDownloaded(true);
              }}
              className="inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-slate-50 px-2.5 text-xs font-bold text-slate-800 hover:border-emerald-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            >
              <Download className="h-3.5 w-3.5 shrink-0 text-emerald-700 dark:text-emerald-400" />
              <span>{downloaded ? "Tersimpan!" : "Unduh Ijazah"}</span>
            </button>
          </div>
        </div>

        {speechStatus && (
          <p className="mt-2 truncate text-[11px] font-medium text-slate-500 dark:text-slate-400">
            {speechStatus}
          </p>
        )}
      </div>
    </div>
  );
};
