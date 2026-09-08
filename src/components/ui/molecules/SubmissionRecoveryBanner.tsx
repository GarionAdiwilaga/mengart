"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { RotateCcw, Trash2 } from "lucide-react";

export interface SubmissionRecoveryBannerProps {
  onDiscard: () => void;
  className?: string;
  message?: string;
}

export function SubmissionRecoveryBanner({
  onDiscard,
  className,
  message = "Teks dipulihkan. Pilih kembali berkas karya untuk melanjutkan.",
}: SubmissionRecoveryBannerProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "w-full flex items-center justify-between gap-3 p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/25 text-amber-200 text-xs font-sans shadow-md",
        className
      )}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="h-7 w-7 rounded-xl bg-amber-500/20 flex items-center justify-center text-amber-400 shrink-0">
          <RotateCcw className="h-3.5 w-3.5" />
        </div>
        <span className="font-medium leading-relaxed truncate">
          {message}
        </span>
      </div>

      <button
        type="button"
        onClick={onDiscard}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 min-h-[36px] rounded-xl bg-white/5 hover:bg-red-500/20 text-zinc-300 hover:text-red-300 border border-white/10 hover:border-red-500/30 text-xs font-sans transition-all shrink-0 cursor-pointer"
      >
        <Trash2 className="h-3 w-3" />
        <span>Buang draf</span>
      </button>
    </div>
  );
}
