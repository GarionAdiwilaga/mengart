"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Trophy, Palette, User, Plus } from "lucide-react";
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

  // Hide MobileBottomNav on focused task screens (Grill-Me Decision #3 & Blueprint v0.3)
  const isFocusedTaskScreen =
    pathname.startsWith("/artworks/") ||
    /^\/challenges\/[^/]+\/voting(\/.*)?$/.test(pathname) ||
    pathname === "/account-suspended";

  if (isFocusedTaskScreen) {
    return null;
  }

  const navItems = [
    { label: "Beranda", href: "/", icon: Home, exact: true },
    { label: "Challenge", href: "/challenges", icon: Trophy, exact: false },
    // Center button slot
    { label: "Galeri", href: "/gallery", icon: Palette, exact: false },
    {
      label: "Studio",
      href: user ? "/dashboard" : "/login",
      icon: User,
      exact: false,
    },
  ];

  const isTabActive = (item: (typeof navItems)[0]) => {
    if (item.exact) {
      return pathname === item.href;
    }
    if (item.label === "Studio") {
      return pathname === "/dashboard" || pathname.startsWith("/me");
    }
    return pathname.startsWith(item.href);
  };

  return (
    <nav
      aria-label="Navigasi Bawah Mobile"
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#0e1015]/95 backdrop-blur-2xl border-t border-white/10 px-2 py-1.5 pb-[max(0.375rem,env(safe-area-inset-bottom))]"
    >
      <div className="flex items-center justify-around h-14 max-w-lg mx-auto">
        {/* Destination 1: Beranda */}
        {(() => {
          const item = navItems[0];
          const active = isTabActive(item);
          const Icon = item.icon;
          return (
            <Link
              key={item.label}
              href={item.href}
              className={`flex flex-col items-center justify-center flex-1 h-full min-w-[44px] min-h-[44px] py-1 transition-all ${
                active ? "text-amber-400 font-semibold" : "text-zinc-400 active:text-white"
              }`}
            >
              <Icon className={`h-5 w-5 ${active ? "stroke-[2.5]" : "stroke-[1.75]"}`} />
              <span className="text-[10px] font-sans mt-0.5 tracking-tight">
                {item.label}
              </span>
              {active ? (
                <span className="w-1 h-1 rounded-full bg-amber-400 mt-0.5" />
              ) : (
                <span className="w-1 h-1 opacity-0 mt-0.5" />
              )}
            </Link>
          );
        })()}

        {/* Destination 2: Challenge */}
        {(() => {
          const item = navItems[1];
          const active = isTabActive(item);
          const Icon = item.icon;
          return (
            <Link
              key={item.label}
              href={item.href}
              className={`flex flex-col items-center justify-center flex-1 h-full min-w-[44px] min-h-[44px] py-1 transition-all ${
                active ? "text-amber-400 font-semibold" : "text-zinc-400 active:text-white"
              }`}
            >
              <Icon className={`h-5 w-5 ${active ? "stroke-[2.5]" : "stroke-[1.75]"}`} />
              <span className="text-[10px] font-sans mt-0.5 tracking-tight">
                {item.label}
              </span>
              {active ? (
                <span className="w-1 h-1 rounded-full bg-amber-400 mt-0.5" />
              ) : (
                <span className="w-1 h-1 opacity-0 mt-0.5" />
              )}
            </Link>
          );
        })()}

        {/* Center: Upload Action Button */}
        <div className="flex items-center justify-center flex-1">
          {user ? (
            <button
              onClick={openUploadModal}
              className="h-12 w-12 rounded-2xl bg-amber-500 hover:bg-amber-400 text-[#0e1015] flex items-center justify-center shadow-lg shadow-amber-500/25 active:scale-95 transition-all cursor-pointer min-h-[44px] min-w-[44px]"
              aria-label="Unggah Karya Baru"
            >
              <Plus className="h-6 w-6 stroke-[2.5]" />
            </button>
          ) : (
            <Link
              href="/login"
              className="h-10 px-3 min-h-[44px] rounded-xl bg-amber-500 text-black font-bold text-xs flex items-center justify-center shadow-md shadow-amber-500/20 active:scale-95 transition-transform"
            >
              Masuk
            </Link>
          )}
        </div>

        {/* Destination 3: Galeri */}
        {(() => {
          const item = navItems[2];
          const active = isTabActive(item);
          const Icon = item.icon;
          return (
            <Link
              key={item.label}
              href={item.href}
              className={`flex flex-col items-center justify-center flex-1 h-full min-w-[44px] min-h-[44px] py-1 transition-all ${
                active ? "text-amber-400 font-semibold" : "text-zinc-400 active:text-white"
              }`}
            >
              <Icon className={`h-5 w-5 ${active ? "stroke-[2.5]" : "stroke-[1.75]"}`} />
              <span className="text-[10px] font-sans mt-0.5 tracking-tight">
                {item.label}
              </span>
              {active ? (
                <span className="w-1 h-1 rounded-full bg-amber-400 mt-0.5" />
              ) : (
                <span className="w-1 h-1 opacity-0 mt-0.5" />
              )}
            </Link>
          );
        })()}

        {/* Destination 4: Studio */}
        {(() => {
          const item = navItems[3];
          const active = isTabActive(item);
          const Icon = item.icon;
          return (
            <Link
              key={item.label}
              href={item.href}
              className={`flex flex-col items-center justify-center flex-1 h-full min-w-[44px] min-h-[44px] py-1 transition-all ${
                active ? "text-amber-400 font-semibold" : "text-zinc-400 active:text-white"
              }`}
            >
              <Icon className={`h-5 w-5 ${active ? "stroke-[2.5]" : "stroke-[1.75]"}`} />
              <span className="text-[10px] font-sans mt-0.5 tracking-tight">
                {item.label}
              </span>
              {active ? (
                <span className="w-1 h-1 rounded-full bg-amber-400 mt-0.5" />
              ) : (
                <span className="w-1 h-1 opacity-0 mt-0.5" />
              )}
            </Link>
          );
        })()}
      </div>
    </nav>
  );
}
