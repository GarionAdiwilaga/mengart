"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Eye, Image as ImageIcon, Briefcase, UserPen } from "lucide-react";

export interface StudioShellProps {
  children: React.ReactNode;
  className?: string;
  headerTitle?: string;
  headerSubtitle?: string;
  rightAction?: React.ReactNode;
}

export function StudioShell({
  children,
  className,
  headerTitle,
  headerSubtitle,
  rightAction,
}: StudioShellProps) {
  const pathname = usePathname();

  const studioTabs = [
    { label: "Pratinjau", href: "/dashboard", icon: Eye },
    { label: "Portofolio", href: "/me/portfolio", icon: ImageIcon },
    { label: "Layanan Komisi", href: "/me/commissions", icon: Briefcase },
    { label: "Edit Profil", href: "/me/profile", icon: UserPen },
  ];

  return (
    <div className={cn("w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 flex-1 flex flex-col gap-6", className)}>
      {/* Studio Header & Sub-Navigation */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-white/10">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-[#f6f2e9]">
            {headerTitle || "Studio Kreator"}
          </h1>
          {headerSubtitle && (
            <p className="mt-1 text-xs sm:text-sm text-zinc-400 font-sans">
              {headerSubtitle}
            </p>
          )}
        </div>

        {rightAction && <div className="flex items-center gap-2">{rightAction}</div>}
      </div>

      {/* Studio Sub-Nav Rail */}
      <nav
        aria-label="Sub-navigasi Studio"
        className="w-full flex items-center gap-1.5 overflow-x-auto pb-2 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
      >
        {studioTabs.map((tab) => {
          const isActive =
            tab.href === "/dashboard"
              ? pathname === "/dashboard"
              : pathname.startsWith(tab.href);
          const Icon = tab.icon;

          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                "inline-flex items-center gap-2 px-4 py-2 min-h-[44px] rounded-xl text-xs sm:text-sm font-sans font-medium whitespace-nowrap transition-all duration-150 border",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/50",
                isActive
                  ? "bg-amber-500/15 text-amber-300 border-amber-500/35 shadow-xs shadow-amber-500/10 font-semibold"
                  : "bg-white/[0.03] text-zinc-400 border-white/10 hover:bg-white/[0.07] hover:text-zinc-200"
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span>{tab.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Main Studio Viewport Content */}
      <div className="flex-1 flex flex-col">{children}</div>
    </div>
  );
}
