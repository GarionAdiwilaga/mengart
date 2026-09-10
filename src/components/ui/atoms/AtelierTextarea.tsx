import React, { forwardRef } from "react";
import { cn } from "@/lib/utils";

export interface AtelierTextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: string | boolean;
  helperText?: string;
  charCount?: { current: number; max: number };
}

export const AtelierTextarea = forwardRef<HTMLTextAreaElement, AtelierTextareaProps>(
  ({ className, error, helperText, charCount, disabled, ...props }, ref) => {
    const hasError = Boolean(error);

    return (
      <div className="w-full flex flex-col gap-1.5">
        <textarea
          ref={ref}
          disabled={disabled}
          className={cn(
            "w-full min-h-[100px] rounded-xl bg-white/[0.04] border border-white/10 p-3.5 text-[#f6f2e9] placeholder:text-zinc-500 text-base sm:text-sm font-sans transition-all duration-150 resize-y",
            "focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/70",
            "disabled:opacity-50 disabled:cursor-not-allowed",
            hasError && "border-red-500/60 focus:ring-red-500/40 focus:border-red-500",
            className
          )}
          {...props}
        />
        {(helperText || charCount) && (
          <div className="flex items-center justify-between px-1 text-xs font-sans">
            {helperText ? (
              <span className={cn(hasError ? "text-red-400" : "text-zinc-500")}>
                {helperText}
              </span>
            ) : <span />}
            {charCount && (
              <span
                className={cn(
                  "font-mono text-[11px]",
                  charCount.current > charCount.max ? "text-red-400 font-bold" : "text-zinc-500"
                )}
              >
                {charCount.current} / {charCount.max}
              </span>
            )}
          </div>
        )}
      </div>
    );
  }
);

AtelierTextarea.displayName = "AtelierTextarea";
