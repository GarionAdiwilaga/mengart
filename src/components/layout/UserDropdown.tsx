"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  User,
  Palette,
  Briefcase,
  Settings,
  ShieldCheck,
  LogOut,
  ChevronDown,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { signOut } from "next-auth/react";

interface UserDropdownProps {
  user: {
    id: string;
    email: string;
    role: "member" | "moderator" | "admin";
    displayName?: string | null;
    slug?: string | null;
    avatarUrl?: string | null;
  };
}

export function UserDropdown({ user }: UserDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const isModOrAdmin = user.role === "moderator" || user.role === "admin";

  const getRoleBadge = (role: string) => {
    switch (role) {
      case "admin":
        return "bg-red-500/10 text-red-400 border-red-500/30";
      case "moderator":
        return "bg-amber-500/10 text-amber-400 border-amber-500/30";
      default:
        return "bg-emerald-500/10 text-emerald-400 border-emerald-500/30";
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 p-1.5 sm:px-3 sm:py-1.5 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-200 transition-all cursor-pointer group"
      >
        <div className="h-7 w-7 rounded-xl bg-amber-500/20 text-amber-400 font-bold font-mono flex items-center justify-center text-xs border border-amber-500/30 shrink-0">
          {user.displayName?.charAt(0) || user.email.charAt(0).toUpperCase()}
        </div>

        <div className="hidden sm:flex flex-col text-left">
          <span className="text-xs font-display font-bold text-[#f6f2e9] leading-tight truncate max-w-[110px]">
            {user.displayName || "Artist"}
          </span>
          <span className="text-[10px] font-mono text-zinc-500 capitalize">
            {user.role}
          </span>
        </div>

        <ChevronDown className="h-3.5 w-3.5 text-zinc-500 group-hover:text-zinc-300 transition-transform duration-150" />
      </button>

      <AnimatePresence>
        {isOpen ? (
          <>
            {/* Backdrop */}
            <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />

            {/* Dropdown Menu */}
            <motion.div
              initial={{ opacity: 0, y: 8, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.95 }}
              transition={{ duration: 0.12 }}
              className="absolute right-0 mt-3 w-64 glass-panel-elevated rounded-3xl border border-white/15 shadow-2xl p-2 z-50 flex flex-col gap-1"
            >
              {/* Profile Header */}
              <div className="p-3 border-b border-white/10 flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <span className="font-display font-bold text-sm text-[#f6f2e9] truncate">
                    {user.displayName || "Artist Atelier"}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold border uppercase ${getRoleBadge(
                      user.role
                    )}`}
                  >
                    {user.role}
                  </span>
                </div>
                <span className="text-[11px] font-mono text-zinc-400 truncate">
                  {user.email}
                </span>
              </div>

              {/* Member Studio Nav */}
              <div className="flex flex-col py-1">
                <Link
                  href="/me/portfolio"
                  onClick={() => setIsOpen(false)}
                  className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-sans text-zinc-300 hover:text-white hover:bg-white/5 transition-colors"
                >
                  <Palette className="h-4 w-4 text-amber-400" />
                  <span>Studio Portofolio Saya</span>
                </Link>

                <Link
                  href="/me/commissions"
                  onClick={() => setIsOpen(false)}
                  className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-sans text-zinc-300 hover:text-white hover:bg-white/5 transition-colors"
                >
                  <Briefcase className="h-4 w-4 text-amber-400" />
                  <span>Kelola Layanan Komisi</span>
                </Link>

                <Link
                  href="/me/profile"
                  onClick={() => setIsOpen(false)}
                  className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-sans text-zinc-300 hover:text-white hover:bg-white/5 transition-colors"
                >
                  <Settings className="h-4 w-4 text-amber-400" />
                  <span>Pengaturan Profil</span>
                </Link>
              </div>

              {/* Admin Portal Switcher */}
              {isModOrAdmin ? (
                <div className="pt-1 border-t border-white/10">
                  <Link
                    href="/admin"
                    onClick={() => setIsOpen(false)}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-mono font-semibold text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 transition-colors"
                  >
                    <ShieldCheck className="h-4 w-4 text-amber-400" />
                    <span>Admin Command Center</span>
                  </Link>
                </div>
              ) : null}

              {/* Logout Action */}
              <div className="pt-1 border-t border-white/10">
                <button
                  onClick={() => signOut({ callbackUrl: "/" })}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-sans text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors cursor-pointer"
                >
                  <LogOut className="h-4 w-4" />
                  <span>Keluar Akun</span>
                </button>
              </div>
            </motion.div>
          </>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
