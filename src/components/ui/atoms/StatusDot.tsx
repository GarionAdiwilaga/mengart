import React from "react";
import { cn } from "@/lib/utils";

export interface StatusDotProps extends React.HTMLAttributes<HTMLSpanElement> {
  status: "success" | "warning" | "danger" | "paused" | "open" | "waitlist" | "closed";
  size?: "sm" | "md";
  pulse?: boolean;
  label?: string;
}

export function StatusDot({
  status,
  size = "sm",
  pulse = false,
  label,
  className,
  ...props
}: StatusDotProps) {
  // Map aliases
  const normalizedStatus =
    status === "open"
      ? "success"
      : status === "waitlist"
      ? "warning"
      : status === "closed"
      ? "paused"
      : status;

  const colorStyles = {
    success: "bg-[#75c985] text-[#75c985]",
    warning: "bg-[#e6a84a] text-[#e6a84a]",
    danger: "bg-[#e26767] text-[#e26767]",
    paused: "bg-[#9296a0] text-[#9296a0]",
  };

  const dotSizes = {
    sm: "h-2 w-2",
    md: "h-2.5 w-2.5",
  };

  return (
    <span
      className={cn("inline-flex items-center gap-1.5 select-none", className)}
      {...props}
    >
      <span className="relative flex items-center justify-center">
        {pulse && (
          <span
            className={cn(
              "absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping",
              colorStyles[normalizedStatus].split(" ")[0]
            )}
          />
        )}
        <span
          className={cn(
            "rounded-full shrink-0",
            dotSizes[size],
            colorStyles[normalizedStatus].split(" ")[0]
          )}
        />
      </span>
      {label && (
        <span className="font-sans text-xs font-medium text-zinc-300">
          {label}
        </span>
      )}
    </span>
  );
}
