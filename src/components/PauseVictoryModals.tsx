import React from "react";
import { Play, RotateCcw, Home, Award, ArrowRight, Sparkles, GraduationCap } from "lucide-react";
import type { ChapterData } from "../data/types";

interface PauseModalProps {
  onResume: () => void;
  onReturnTitle: () => void;
  onOpenActiveChapter: () => void;
}

export const PauseModal: React.FC<PauseModalProps> = ({
  onResume,
  onReturnTitle,
  onOpenActiveChapter,
}) => {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pause-modal-title"
    >
      <div className="w-full max-w-md rounded-2xl border border-slate-300 bg-white p-6 shadow-2xl dark:border-slate-700 dark:bg-slate-900">
        <div className="text-[11px] font-bold uppercase tracking-wider text-blue-700 dark:text-blue-400">
          汉语学院 · Jeda Eksplorasi
        </div>
        <h2
          id="pause-modal-title"
          className="mt-0.5 text-xl font-extrabold text-slate-900 dark:text-white"
        >
          Permainan Dijeda
        </h2>
        <p className="mt-1.5 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
          Progresmu otomatis tersimpan di perangkat. Kamu bisa lanjut kapan saja dari titik terakhir.
        </p>

        <div className="mt-5 flex flex-col gap-2.5">
          <button
            type="button"
            onClick={onResume}
            className="inline-flex min-h-[46px] items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-800"
          >
            <Play className="h-4 w-4 fill-current" />
            Lanjutkan Eksplorasi
          </button>
          <button
            type="button"
            onClick={onOpenActiveChapter}
            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-slate-300 bg-slate-50 px-4 py-2.5 text-sm font-semibold text-slate-800 hover:border-blue-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          >
            <RotateCcw className="h-4 w-4" />
            Buka Misi Bab Aktif
          </button>
          <button
            type="button"
            onClick={onReturnTitle}
            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <Home className="h-4 w-4" />
            Kembali ke Layar Judul
          </button>
        </div>
      </div>
    </div>
  );
};

interface VictoryModalProps {
  chapter: ChapterData;
  stars: number;
  quizCorrect: number;
  quizTotal: number;
  xpEarned: number;
  hasNextChapter: boolean;
  canGraduate?: boolean;
  onOpenGraduation?: () => void;
  onContinueCampus: () => void;
  onNextChapter: () => void;
}

export const VictoryModal: React.FC<VictoryModalProps> = ({
  chapter,
  stars,
  quizCorrect,
  quizTotal,
  xpEarned,
  hasNextChapter,
  canGraduate = false,
  onOpenGraduation,
  onContinueCampus,
  onNextChapter,
}) => {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="victory-modal-title"
    >
      <div className="animate-toast-pop relative w-full max-w-md overflow-hidden rounded-2xl border border-amber-400 bg-white p-6 shadow-2xl dark:border-amber-500/60 dark:bg-slate-900">
        {/* Decorative top accent strip */}
        <div
          className="absolute inset-x-0 top-0 h-1.5"
          style={{
            background: `linear-gradient(90deg, ${chapter.accentHex}, #f59e0b, #10b981)`,
          }}
          aria-hidden="true"
        />

        <div className="flex items-center gap-3 pt-1">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-amber-300 bg-amber-100 text-amber-700 dark:border-amber-700 dark:bg-amber-900/50 dark:text-amber-300">
            <Award className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="inline-flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">
              <Sparkles className="h-3.5 w-3.5" />
              Bab {chapter.order} Tuntas
            </div>
            <h2
              id="victory-modal-title"
              className="truncate text-xl font-extrabold text-slate-900 dark:text-white"
            >
              {chapter.shortTitle} Selesai!
            </h2>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-center dark:border-slate-700 dark:bg-slate-800">
          <div>
            <div className="text-[11px] font-bold uppercase text-slate-500 dark:text-slate-400">
              Bintang
            </div>
            <div className="font-mono-num mt-0.5 text-lg font-extrabold text-amber-600 dark:text-amber-400">
              {"★".repeat(stars)}
              {"☆".repeat(3 - stars)}
            </div>
          </div>
          <div>
            <div className="text-[11px] font-bold uppercase text-slate-500 dark:text-slate-400">
              Akurasi Kuis
            </div>
            <div className="font-mono-num mt-0.5 text-lg font-extrabold text-slate-900 dark:text-white">
              {quizCorrect}/{quizTotal}
            </div>
          </div>
          <div>
            <div className="text-[11px] font-bold uppercase text-slate-500 dark:text-slate-400">
              Bonus XP
            </div>
            <div className="font-mono-num mt-0.5 text-lg font-extrabold text-blue-700 dark:text-blue-400">
              +{Math.round(xpEarned)}
            </div>
          </div>
        </div>

        <p className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50/70 px-3 py-2 text-xs font-semibold text-emerald-950 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200 sm:text-sm">
          Lencana Paspor Terbuka: <strong>{chapter.badgeName}</strong>
        </p>

        <div className="mt-5 flex flex-wrap gap-2.5">
          {canGraduate && onOpenGraduation ? (
            <button
              type="button"
              data-start="true"
              onClick={onOpenGraduation}
              className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl bg-amber-600 px-4 py-2.5 text-sm font-extrabold text-white hover:bg-amber-700"
            >
              <GraduationCap className="h-4 w-4" />
              Hadiri Upacara Kelulusan!
            </button>
          ) : (
            hasNextChapter && (
              <button
                type="button"
                data-start="true"
                onClick={onNextChapter}
                className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-800"
              >
                Lanjut Bab Berikutnya
                <ArrowRight className="h-4 w-4" />
              </button>
            )
          )}
          <button
            type="button"
            onClick={onContinueCampus}
            className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-slate-50 px-4 py-2.5 text-sm font-semibold text-slate-800 hover:border-blue-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          >
            Kembali ke Kampus 3D
          </button>
        </div>
      </div>
    </div>
  );
};
