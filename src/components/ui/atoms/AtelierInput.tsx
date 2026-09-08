import React, { forwardRef } from "react";
import { cn } from "@/lib/utils";

export interface AtelierInputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: string | boolean;
  leftIcon?: React.ReactNode;
  rightElement?: React.ReactNode;
}

export const AtelierInput = forwardRef<HTMLInputElement, AtelierInputProps>(
  ({ className, error, leftIcon, rightElement, disabled, ...props }, ref) => {
    const hasError = Boolean(error);

    return (
      <div className="relative w-full flex items-center">
        {leftIcon && (
          <div className="absolute left-3.5 flex items-center pointer-events-none text-zinc-500">
            {leftIcon}
          </div>
        )}
        <input
          ref={ref}
          disabled={disabled}
          className={cn(
            "w-full h-11 min-h-[44px] rounded-xl bg-white/[0.04] border border-white/10 px-3.5 text-[#f6f2e9] placeholder:text-zinc-500 text-base sm:text-sm font-sans transition-all duration-150",
            "focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/70",
            "disabled:opacity-50 disabled:cursor-not-allowed",
            leftIcon && "pl-10",
            rightElement && "pr-10",
            hasError && "border-red-500/60 focus:ring-red-500/40 focus:border-red-500",
            className
          )}
          {...props}
        />
        {rightElement && (
          <div className="absolute right-3.5 flex items-center">
            {rightElement}
          </div>
        )}
      </div>
    );
  }
);

AtelierInput.displayName = "AtelierInput";
