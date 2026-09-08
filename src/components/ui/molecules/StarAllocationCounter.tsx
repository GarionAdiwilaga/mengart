"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { Star, Check, Loader2, AlertCircle } from "lucide-react";

export interface StarAllocationCounterProps {
  allocatedStars: number;
  maxStars: number;
  saveStatus?: "idle" | "saving" | "saved" | "error";
  className?: string;
  errorMessage?: string;
  onReset?: () => void;
}

export function StarAllocationCounter({
  allocatedStars,
  maxStars,
  saveStatus = "idle",
  className,
  errorMessage,
  onReset,
}: StarAllocationCounterProps) {
  const remaining = Math.max(0, maxStars - allocatedStars);
  const isExhausted = remaining === 0;

  return (
    <div
      className={cn(
        "inline-flex items-center gap-3 px-4 py-2 rounded-2xl bg-[#13161d]/90 backdrop-blur-xl border border-white/15 shadow-xl transition-all",
        isExhausted && "border-amber-500/40 bg-amber-500/[0.04]",
        className
      )}
    >
      {/* Star Count Capsule */}
      <div className="flex items-center gap-1.5 font-mono text-sm">
        <Star
          className={cn(
            "h-4 w-4 transition-colors",
            allocatedStars > 0 ? "fill-amber-400 text-amber-400" : "text-zinc-500"
          )}
        />
        <span className="font-bold text-[#f6f2e9] tabular-nums">
          {allocatedStars}
        </span>
        <span className="text-zinc-500">/</span>
        <span className="text-zinc-400 tabular-nums">{maxStars}</span>
        <span className="text-xs font-sans text-zinc-400 ml-0.5">
          {maxStars > 1 ? "Star" : "Star"}
        </span>
      </div>

      {/* Vertical divider */}
      <div className="h-4 w-px bg-white/10" />

      {/* Save Status or Guidance */}
      <div className="flex items-center gap-1.5 text-xs font-sans">
        {saveStatus === "saving" ? (
          <span className="inline-flex items-center gap-1.5 text-amber-400">
            <Loader2 className="h-3 w-3 animate-spin" />
            <span>Menyimpan...</span>
          </span>
        ) : saveStatus === "saved" ? (
          <span className="inline-flex items-center gap-1.5 text-[#75c985]">
            <Check className="h-3 w-3 stroke-[2.5]" />
            <span>Tersimpan</span>
          </span>
        ) : saveStatus === "error" ? (
          <span className="inline-flex items-center gap-1.5 text-red-400">
            <AlertCircle className="h-3 w-3" />
            <span>{errorMessage || "Gagal menyimpan"}</span>
          </span>
        ) : isExhausted ? (
          <span className="text-amber-400/90 font-medium">
            Semua Star terpakai
          </span>
        ) : (
          <span className="text-zinc-400">
            Sisa <span className="font-mono text-zinc-200">{remaining}</span> Star
          </span>
        )}
      </div>

      {/* Reset button if votes exist and handler provided */}
      {onReset && allocatedStars > 0 && (
        <>
          <div className="h-4 w-px bg-white/10" />
          <button
            type="button"
            onClick={onReset}
            className="text-xs font-sans text-zinc-400 hover:text-red-400 transition-colors cursor-pointer"
          >
            Hapus
          </button>
        </>
      )}
    </div>
  );
}
