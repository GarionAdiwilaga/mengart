"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  Palette,
  Trophy,
  KeyRound,
  ShieldAlert,
  History,
  ArrowLeft,
  ShieldCheck,
} from "lucide-react";
import { motion } from "framer-motion";

interface AdminSidebarProps {
  userRole: "admin" | "moderator";
  userEmail: string;
}

export function AdminSidebar({ userRole, userEmail }: AdminSidebarProps) {
  const pathname = usePathname();

  const navItems = [
    { label: "Ikhtisar & Metrik", href: "/admin", icon: LayoutDashboard, exact: true },
    { label: "Manajemen Pengguna", href: "/admin/users", icon: Users },
    { label: "Kurasi Galeri", href: "/admin/artworks", icon: Palette },
    { label: "Pusat Challenge", href: "/admin/challenges", icon: Trophy },
    { label: "Kunci Undangan", href: "/admin/invites", icon: KeyRound },
    { label: "Moderasi & Keamanan", href: "/admin/moderation", icon: ShieldAlert },
    { label: "Audit Log Explorer", href: "/admin/audit-logs", icon: History },
  ];

  return (
    <aside className="w-full lg:w-64 shrink-0 flex flex-col gap-4 lg:gap-6 p-4 sm:p-6 glass-panel rounded-3xl border border-white/10 h-fit lg:sticky lg:top-24">
      {/* Sidebar Header */}
      <div className="flex items-center justify-between pb-3 lg:pb-4 border-b border-white/10">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center border border-amber-500/30 shrink-0">
            <ShieldCheck className="h-4 w-4" />
          </div>
          <div>
            <h2 className="font-display font-bold text-sm text-[#f6f2e9]">System Admin</h2>
            <span className="text-[10px] font-mono text-amber-400 uppercase font-semibold">
              {userRole} command portal
            </span>
          </div>
        </div>

        <Link
          href="/gallery"
          className="lg:hidden flex items-center gap-1.5 text-[11px] font-mono text-zinc-400 hover:text-amber-400 transition-colors px-2 py-1 rounded-lg bg-white/5 border border-white/10"
        >
          <ArrowLeft className="h-3 w-3" />
          <span>Galeri</span>
        </Link>
      </div>

      {/* Navigation List: Horizontal scroll on mobile, Vertical stack on desktop */}
      <nav className="flex lg:flex-col gap-1.5 overflow-x-auto pb-1 lg:pb-0 no-scrollbar touch-pan-x">
        {navItems.map((item) => {
          const isActive = item.exact ? pathname === item.href : pathname.startsWith(item.href);
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-2xl text-xs font-mono font-medium transition-all whitespace-nowrap shrink-0 ${
                isActive
                  ? "bg-amber-500 text-black font-bold shadow-md shadow-amber-500/20"
                  : "text-zinc-400 hover:text-white hover:bg-white/5 bg-white/[0.02] lg:bg-transparent"
              }`}
            >
              <Icon className={`h-4 w-4 ${isActive ? "text-black" : "text-zinc-400"}`} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Back to Public Atelier (Desktop only) */}
      <div className="hidden lg:block pt-4 border-t border-white/10">
        <Link
          href="/gallery"
          className="flex items-center gap-2 text-xs font-mono text-zinc-400 hover:text-amber-400 transition-colors px-2 py-1.5"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Kembali ke Galeri Publik</span>
        </Link>
      </div>
    </aside>
  );
}
