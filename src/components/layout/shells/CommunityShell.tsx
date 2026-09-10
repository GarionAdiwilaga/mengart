import React from "react";
import { cn } from "@/lib/utils";

export interface CommunityShellProps {
  children: React.ReactNode;
  className?: string;
  maxWidth?: "normal" | "wide" | "reading" | "full";
  noPadding?: boolean;
}

export function CommunityShell({
  children,
  className,
  maxWidth = "normal",
  noPadding = false,
}: CommunityShellProps) {
  const maxWidthStyles = {
    normal: "max-w-7xl",
    wide: "max-w-[1600px]",
    reading: "max-w-3xl",
    full: "max-w-full",
  };

  return (
    <div
      className={cn(
        "w-full mx-auto flex-1 flex flex-col",
        maxWidthStyles[maxWidth],
        !noPadding && "px-4 sm:px-6 lg:px-8 py-6 sm:py-8",
        className
      )}
    >
      {children}
    </div>
  );
}
