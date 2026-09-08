"use client";

import React, { useRef } from "react";
import { cn } from "@/lib/utils";

export interface FilterPillOption {
  id: string;
  label: string;
  count?: number;
}

export interface FilterPillsProps {
  options: FilterPillOption[];
  selectedId: string;
  onSelect: (id: string) => void;
  className?: string;
}

export function FilterPills({
  options,
  selectedId,
  onSelect,
  className,
}: FilterPillsProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={containerRef}
      className={cn(
        "w-full flex items-center gap-2 overflow-x-auto py-1 scroll-smooth",
        "[scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden",
        className
      )}
    >
      {options.map((opt) => {
        const isSelected = opt.id === selectedId;

        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => onSelect(opt.id)}
            className={cn(
              "inline-flex items-center gap-1.5 px-3.5 py-2 min-h-[44px] rounded-xl font-sans text-xs font-medium whitespace-nowrap select-none transition-all duration-150 cursor-pointer border",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/50",
              isSelected
                ? "bg-amber-500/15 text-amber-300 border-amber-500/35 shadow-xs shadow-amber-500/10 font-semibold"
                : "bg-white/[0.04] text-zinc-400 border-white/10 hover:bg-white/[0.08] hover:text-zinc-200"
            )}
          >
            <span>{opt.label}</span>
            {opt.count !== undefined && (
              <span
                className={cn(
                  "px-1.5 py-0.5 rounded text-[10px] font-mono leading-none",
                  isSelected
                    ? "bg-amber-500/25 text-amber-200"
                    : "bg-white/10 text-zinc-500"
                )}
              >
                {opt.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
