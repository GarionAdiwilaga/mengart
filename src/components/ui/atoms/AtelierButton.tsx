"use client";

import React, { forwardRef } from "react";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

export interface AtelierButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "surface" | "ghost" | "danger" | "outline-amber";
  size?: "sm" | "md" | "lg";
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  fullWidth?: boolean;
}

export const AtelierButton = forwardRef<HTMLButtonElement, AtelierButtonProps>(
  (
    {
      className,
      variant = "surface",
      size = "md",
      isLoading = false,
      leftIcon,
      rightIcon,
      fullWidth = false,
      disabled,
      children,
      ...props
    },
    ref
  ) => {
    const baseStyles =
      "inline-flex items-center justify-center font-sans font-medium rounded-xl transition-all duration-150 select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/50 disabled:opacity-50 disabled:pointer-events-none active:scale-[0.98] cursor-pointer";

    const variantStyles = {
      primary:
        "bg-amber-500 hover:bg-amber-400 text-[#0e1015] font-semibold shadow-md shadow-amber-500/20 active:shadow-none",
      surface:
        "bg-white/5 hover:bg-white/10 text-[#f6f2e9] border border-white/10 hover:border-white/20 active:bg-white/[0.08]",
      ghost:
        "text-zinc-400 hover:text-[#f6f2e9] hover:bg-white/5 active:bg-white/10",
      danger:
        "bg-red-500/10 hover:bg-red-500/20 text-red-300 border border-red-500/30 hover:border-red-500/50 active:bg-red-500/25",
      "outline-amber":
        "bg-amber-500/10 hover:bg-amber-500/15 text-amber-400 border border-amber-500/30 hover:border-amber-500/50 active:bg-amber-500/20",
    };

    const sizeStyles = {
      sm: "h-9 min-h-[36px] px-3 text-xs gap-1.5",
      md: "h-11 min-h-[44px] px-4 text-sm gap-2",
      lg: "h-13 min-h-[48px] px-6 text-base gap-2.5",
    };

    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={cn(
          baseStyles,
          variantStyles[variant],
          sizeStyles[size],
          fullWidth && "w-full",
          className
        )}
        {...props}
      >
        {isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin text-current shrink-0" />
        ) : (
          leftIcon && <span className="shrink-0">{leftIcon}</span>
        )}
        <span>{children}</span>
        {!isLoading && rightIcon && (
          <span className="shrink-0">{rightIcon}</span>
        )}
      </button>
    );
  }
);

AtelierButton.displayName = "AtelierButton";
