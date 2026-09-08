"use client";

import React, { useRef } from "react";
import { cn } from "@/lib/utils";

export interface SegmentedPillItem {
  id: string;
  label: string;
  count?: number;
  icon?: React.ReactNode;
}

export interface SegmentedPillProps {
  items: SegmentedPillItem[];
  value: string;
  onChange: (id: string) => void;
  size?: "sm" | "md";
  className?: string;
  fullWidth?: boolean;
  activeVariant?: "amber" | "surface";
}

export function SegmentedPill({
  items,
  value,
  onChange,
  size = "md",
  className,
  fullWidth = false,
  activeVariant = "surface",
}: SegmentedPillProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const sizeStyles = {
    sm: "p-0.5 text-xs",
    md: "p-1 text-sm min-h-[44px]",
  };

  const itemSizeStyles = {
    sm: "py-1.5 px-3 min-h-[36px]",
    md: "py-2 px-4 min-h-[40px]",
  };

  const handleKeyDown = (e: React.KeyboardEvent, currentIndex: number) => {
    let nextIndex = currentIndex;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault();
      nextIndex = (currentIndex + 1) % items.length;
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      nextIndex = (currentIndex - 1 + items.length) % items.length;
    }

    if (nextIndex !== currentIndex) {
      onChange(items[nextIndex].id);
      const buttons = containerRef.current?.querySelectorAll<HTMLButtonElement>("[role='tab']");
      buttons?.[nextIndex]?.focus();
    }
  };

  return (
    <div
      ref={containerRef}
      role="tablist"
      aria-label="Pilihan Kategori"
      className={cn(
        "inline-flex items-center rounded-2xl bg-white/[0.04] border border-white/10 p-1 backdrop-blur-md",
        fullWidth && "w-full flex",
        sizeStyles[size],
        className
      )}
    >
      {items.map((item, index) => {
        const isSelected = item.id === value;

        const activeStyles =
          activeVariant === "amber"
            ? "bg-amber-500/15 text-amber-400 border-amber-500/30 shadow-xs shadow-amber-500/10"
            : "bg-white/10 text-[#f6f2e9] border-white/15 shadow-sm";

        const inactiveStyles =
          "text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.03] border-transparent";

        return (
          <button
            key={item.id}
            role="tab"
            type="button"
            aria-selected={isSelected}
            tabIndex={isSelected ? 0 : -1}
            onClick={() => onChange(item.id)}
            onKeyDown={(e) => handleKeyDown(e, index)}
            className={cn(
              "relative flex items-center justify-center gap-2 rounded-xl font-sans font-medium transition-all duration-150 select-none cursor-pointer border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/50",
              itemSizeStyles[size],
              fullWidth && "flex-1",
              isSelected ? activeStyles : inactiveStyles
            )}
          >
            {item.icon && <span className="shrink-0">{item.icon}</span>}
            <span>{item.label}</span>
            {item.count !== undefined && (
              <span
                className={cn(
                  "px-1.5 py-0.5 rounded-md text-[10px] font-mono leading-none",
                  isSelected
                    ? activeVariant === "amber"
                      ? "bg-amber-500/25 text-amber-300"
                      : "bg-white/15 text-white"
                    : "bg-white/5 text-zinc-500"
                )}
              >
                {item.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
