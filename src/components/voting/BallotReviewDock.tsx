"use client";

import { Star, Sparkles, Loader2, RotateCcw, CheckCircle2 } from "lucide-react";
import type { CandidateArtwork } from "@/lib/voting";

interface BallotReviewDockProps {
  remainingStars: number;
  maxStars: number;
  allocations: { [submissionId: string]: number };
  candidates: CandidateArtwork[];
  isLoading: boolean;
  onReset: () => void;
  onSubmit: () => void;
}

export function BallotReviewDock({
  remainingStars,
  maxStars,
  allocations,
  candidates,
  isLoading,
  onReset,
  onSubmit,
}: BallotReviewDockProps) {
  const totalAllocated = maxStars - remainingStars;
  const activeSubmissionIds = Object.keys(allocations).filter((id) => allocations[id] > 0);

  return (
    <aside aria-label="Ringkasan Alokasi Bintang" className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 w-full max-w-2xl px-4 animate-in slide-in-from-bottom-5 duration-200">
      <div className="glass-panel-elevated p-3 sm:p-4 rounded-3xl border border-amber-500/40 shadow-2xl flex items-center justify-between gap-3 sm:gap-4 backdrop-blur-xl">
        {/* Stars Counter Capsule */}
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 sm:h-11 sm:w-11 rounded-2xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center shadow-lg shadow-amber-500/20 shrink-0">
            <Star className="h-5 w-5 sm:h-6 sm:w-6 fill-black text-black" />
          </div>

          <div className="flex flex-col">
            <span className="text-[10px] font-mono uppercase text-zinc-400">ALOKASI STARS</span>
            <div className="flex items-center gap-1.5 font-mono text-sm sm:text-base font-bold text-[#f6f2e9]">
              <span className="text-amber-400">{remainingStars}</span>
              <span className="text-zinc-500">/</span>
              <span>{maxStars}</span>
              <span className="text-xs font-normal text-zinc-400 ml-1">tersisa</span>
            </div>
          </div>
        </div>

        {/* Assigned Candidates Mini Thumbnails (Hidden on very small screens) */}
        <div className="hidden sm:flex items-center gap-2 overflow-x-auto max-w-[200px] py-1">
          {activeSubmissionIds.map((subId) => {
            const candidate = candidates.find((c) => c.submissionId === subId);
            const stars = allocations[subId];
            if (!candidate) return null;

            return (
              <div
                key={subId}
                className="relative h-9 w-9 rounded-xl overflow-hidden border border-amber-400/60 shrink-0 bg-black/50"
                title={`${candidate.title} (${stars} Star)`}
              >
                {candidate.thumbnailStorageKey ? (
                  <img
                    src={`/api/media/public/${candidate.thumbnailStorageKey}`}
                    alt={candidate.title}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-[10px] font-bold text-amber-400">
                    ★
                  </div>
                )}
                <span className="absolute bottom-0 right-0 px-1 rounded-tl bg-black/80 text-[9px] font-mono font-bold text-amber-400">
                  {stars}
                </span>
              </div>
            );
          })}
        </div>

        {/* Actions (Reset + Submit) */}
        <div className="flex items-center gap-2">
          {totalAllocated > 0 ? (
            <button
              onClick={onReset}
              disabled={isLoading}
              title="Reset alokasi Stars"
              className="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white transition-colors cursor-pointer disabled:opacity-50"
            >
              <RotateCcw className="h-4 w-4" />
            </button>
          ) : null}

          <button
            onClick={onSubmit}
            disabled={isLoading || totalAllocated === 0}
            className="px-4 sm:px-6 py-2.5 sm:py-3 rounded-2xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs sm:text-sm font-sans transition-all duration-200 shadow-lg shadow-amber-500/20 flex items-center gap-2 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin text-black" />
                <span className="hidden sm:inline">Menyimpan...</span>
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4 text-black" />
                <span>Simpan Suara</span>
              </>
            )}
          </button>
        </div>
      </div>
    </aside>
  );
}
