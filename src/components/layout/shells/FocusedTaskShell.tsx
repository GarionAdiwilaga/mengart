"use client";

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { ArrowLeft } from "lucide-react";

export interface FocusedTaskShellProps {
  children: React.ReactNode;
  backHref?: string;
  backLabel?: string;
  title?: string;
  rightAction?: React.ReactNode;
  bottomBar?: React.ReactNode;
  className?: string;
  contentClassName?: string;
}

export function FocusedTaskShell({
  children,
  backHref,
  backLabel = "Kembali",
  title,
  rightAction,
  bottomBar,
  className,
  contentClassName,
}: FocusedTaskShellProps) {
  const router = useRouter();

  const handleBack = () => {
    if (backHref) {
      router.push(backHref);
    } else {
      router.back();
    }
  };

  return (
    <div className={cn("relative w-full flex-1 flex flex-col bg-[#0e1015]", className)}>
      {/* Top Action & Breadcrumb Bar */}
      <div className="sticky top-16 z-30 w-full bg-[#0e1015]/90 backdrop-blur-xl border-b border-white/10 px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          {backHref ? (
            <Link
              href={backHref}
              className="inline-flex items-center gap-2 p-2 min-h-[44px] min-w-[44px] -ml-2 rounded-xl text-zinc-400 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
              aria-label={backLabel}
            >
              <ArrowLeft className="h-5 w-5 shrink-0" />
              <span className="hidden sm:inline text-xs font-sans font-medium">
                {backLabel}
              </span>
            </Link>
          ) : (
            <button
              type="button"
              onClick={handleBack}
              className="inline-flex items-center gap-2 p-2 min-h-[44px] min-w-[44px] -ml-2 rounded-xl text-zinc-400 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
              aria-label={backLabel}
            >
              <ArrowLeft className="h-5 w-5 shrink-0" />
              <span className="hidden sm:inline text-xs font-sans font-medium">
                {backLabel}
              </span>
            </button>
          )}

          {title && (
            <h2 className="font-display font-semibold text-sm sm:text-base text-[#f6f2e9] truncate">
              {title}
            </h2>
          )}
        </div>

        {rightAction && (
          <div className="flex items-center gap-2 shrink-0">{rightAction}</div>
        )}
      </div>

      {/* Main Focused Viewport */}
      <div
        className={cn(
          "w-full flex-1 flex flex-col",
          bottomBar && "pb-24 sm:pb-8",
          contentClassName
        )}
      >
        {children}
      </div>

      {/* Bottom Contextual Thumb Bar */}
      {bottomBar && (
        <aside
          aria-label="Aksi Kontekstual Layar Fokus"
          className="fixed bottom-0 left-0 right-0 z-40 bg-[#13161d]/95 backdrop-blur-2xl border-t border-white/10 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-2xl"
        >
          <div className="max-w-4xl mx-auto flex items-center justify-between gap-3">
            {bottomBar}
          </div>
        </aside>
      )}
    </div>
  );
}
