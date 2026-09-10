import React from "react";
import { cn } from "@/lib/utils";

export interface AtelierBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: "default" | "amber" | "success" | "danger" | "muted";
  size?: "sm" | "md";
  shape?: "pill" | "rounded";
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export function AtelierBadge({
  className,
  variant = "default",
  size = "sm",
  shape = "pill",
  leftIcon,
  rightIcon,
  children,
  ...props
}: AtelierBadgeProps) {
  const variantStyles = {
    default: "bg-white/5 text-zinc-300 border border-white/10",
    amber: "bg-amber-500/10 text-amber-400 border border-amber-500/25 shadow-xs shadow-amber-500/10",
    success: "bg-[#75c985]/10 text-[#75c985] border border-[#75c985]/25",
    danger: "bg-red-500/10 text-red-400 border border-red-500/25",
    muted: "bg-white/[0.03] text-zinc-500 border border-white/5",
  };

  const sizeStyles = {
    sm: "text-[11px] py-0.5 px-2 gap-1 font-mono",
    md: "text-xs py-1 px-2.5 gap-1.5 font-sans",
  };

  const shapeStyles = {
    pill: "rounded-full",
    rounded: "rounded-lg",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center font-medium leading-none select-none transition-colors",
        variantStyles[variant],
        sizeStyles[size],
        shapeStyles[shape],
        className
      )}
      {...props}
    >
      {leftIcon && <span className="shrink-0">{leftIcon}</span>}
      <span>{children}</span>
      {rightIcon && <span className="shrink-0">{rightIcon}</span>}
    </span>
  );
}
