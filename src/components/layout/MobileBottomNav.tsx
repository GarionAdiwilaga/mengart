"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Palette,
  Users,
  Briefcase,
  Trophy,
  User,
  Plus,
  Compass,
} from "lucide-react";
import { useModalStore } from "@/stores/useModalStore";

interface MobileBottomNavProps {
  user?: {
    id: string;
    email: string;
    role: "member" | "moderator" | "admin";
    displayName?: string | null;
    slug?: string | null;
    avatarUrl?: string | null;
  } | null;
}

export function MobileBottomNav({ user }: MobileBottomNavProps) {
  const pathname = usePathname();
  const { openUploadModal } = useModalStore();

  const tabs = [
    { label: "Galeri", href: "/gallery", icon: Compass },
    { label: "Artist", href: "/artists", icon: Users },
    { label: "Komisi", href: "/commissions", icon: Briefcase },
    { label: "Challenge", href: "/challenges", icon: Trophy },
  ];

  return (
    <nav
      aria-label="Navigasi Bawah Mobile"
      className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-[#0e1015]/95 backdrop-blur-2xl border-t border-white/10 px-2 py-1.5 pb-[max(0.375rem,env(safe-area-inset-bottom))]"
    >
      <div className="flex items-center justify-around h-14 max-w-lg mx-auto">
        {/* Tab 1: Galeri */}
        {tabs.slice(0, 2).map((tab) => {
          const isActive = pathname.startsWith(tab.href);
          const Icon = tab.icon;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`flex flex-col items-center justify-center flex-1 h-full min-w-[48px] py-1 transition-all ${
                isActive ? "text-amber-400" : "text-zinc-400 active:text-white"
              }`}
            >
              <Icon className={`h-5 w-5 ${isActive ? "stroke-[2.5]" : "stroke-[1.75]"}`} />
              <span className="text-[10px] font-sans mt-0.5 font-medium tracking-tight">
                {tab.label}
              </span>
              {isActive ? (
                <span className="w-1 h-1 rounded-full bg-amber-400 mt-0.5" />
              ) : (
                <span className="w-1 h-1 opacity-0 mt-0.5" />
              )}
            </Link>
          );
        })}

        {/* Center: Upload Action Button */}
        <div className="flex items-center justify-center flex-1">
          {user ? (
            <button
              onClick={openUploadModal}
              className="h-12 w-12 rounded-2xl bg-gradient-to-tr from-amber-500 to-amber-400 text-black flex items-center justify-center shadow-lg shadow-amber-500/30 active:scale-95 transition-transform cursor-pointer"
              aria-label="Unggah Karya Baru"
            >
              <Plus className="h-6 w-6 stroke-[2.5]" />
            </button>
          ) : (
            <Link
              href="/login"
              className="h-10 px-3.5 rounded-xl bg-amber-500 text-black font-bold text-xs flex items-center justify-center shadow-md shadow-amber-500/20 active:scale-95 transition-transform"
            >
              Masuk
            </Link>
          )}
        </div>

        {/* Tabs 3 & 4: Komisi & Challenge */}
        {tabs.slice(2).map((tab) => {
          const isActive = pathname.startsWith(tab.href);
          const Icon = tab.icon;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`flex flex-col items-center justify-center flex-1 h-full min-w-[48px] py-1 transition-all ${
                isActive ? "text-amber-400" : "text-zinc-400 active:text-white"
              }`}
            >
              <Icon className={`h-5 w-5 ${isActive ? "stroke-[2.5]" : "stroke-[1.75]"}`} />
              <span className="text-[10px] font-sans mt-0.5 font-medium tracking-tight">
                {tab.label}
              </span>
              {isActive ? (
                <span className="w-1 h-1 rounded-full bg-amber-400 mt-0.5" />
              ) : (
                <span className="w-1 h-1 opacity-0 mt-0.5" />
              )}
            </Link>
          );
        })}

        {/* Account / Studio Tab */}
        {user ? (
          <Link
            href="/dashboard"
            className={`flex flex-col items-center justify-center flex-1 h-full min-w-[48px] py-1 transition-all ${
              pathname === "/dashboard" || pathname.startsWith("/me")
                ? "text-amber-400"
                : "text-zinc-400 active:text-white"
            }`}
          >
            <User className={`h-5 w-5 ${pathname === "/dashboard" || pathname.startsWith("/me") ? "stroke-[2.5]" : "stroke-[1.75]"}`} />
            <span className="text-[10px] font-sans mt-0.5 font-medium tracking-tight">
              Studio
            </span>
            {pathname === "/dashboard" || pathname.startsWith("/me") ? (
              <span className="w-1 h-1 rounded-full bg-amber-400 mt-0.5" />
            ) : (
              <span className="w-1 h-1 opacity-0 mt-0.5" />
            )}
          </Link>
        ) : null}
      </div>
    </nav>
  );
}
