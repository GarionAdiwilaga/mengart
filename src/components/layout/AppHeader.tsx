"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Palette,
  Search,
  Upload,
  Menu,
  X,
  Users,
  Briefcase,
} from "lucide-react";
import { useModalStore } from "@/stores/useModalStore";
import { UserDropdown } from "./UserDropdown";
import { NotificationDrawer, type NotificationItem } from "./NotificationDrawer";
import { motion, AnimatePresence } from "framer-motion";

interface AppHeaderProps {
  user?: {
    id: string;
    email: string;
    role: "member" | "moderator" | "admin";
    displayName?: string | null;
    slug?: string | null;
    avatarUrl?: string | null;
  } | null;
  notifications?: NotificationItem[];
}

export function AppHeader({ user, notifications = [] }: AppHeaderProps) {
  const pathname = usePathname();
  const { openUploadModal, toggleCommandPalette } = useModalStore();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // 4 Primary Persistent Destinations (Blueprint v0.3 & Grill-Me Decisions)
  const navLinks = [
    { label: "Beranda", href: "/", exact: true },
    { label: "Challenge", href: "/challenges", exact: false },
    { label: "Galeri", href: "/gallery", exact: false },
    { label: "Studio", href: user ? "/dashboard" : "/login", exact: false },
  ];

  const isLinkActive = (link: (typeof navLinks)[0]) => {
    if (link.exact) {
      return pathname === link.href;
    }
    if (link.label === "Studio") {
      return pathname === "/dashboard" || pathname.startsWith("/me");
    }
    return pathname.startsWith(link.href);
  };

  return (
    <header className="sticky top-0 z-40 w-full bg-[#0e1015]/85 backdrop-blur-xl border-b border-white/10 transition-all">
      <div className="max-w-7xl mx-auto px-4 sm:px-8 h-16 flex items-center justify-between gap-4">
        {/* Left: Brand & Main Navigation Links */}
        <div className="flex items-center gap-8">
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-amber-500 to-amber-700 flex items-center justify-center shadow-lg shadow-amber-500/20 group-hover:scale-105 transition-transform">
              <Palette className="h-4.5 w-4.5 text-black" />
            </div>
            <span className="font-display font-extrabold text-xl text-[#f6f2e9] tracking-tight group-hover:text-amber-300 transition-colors">
              Mengart
            </span>
          </Link>

          {/* Desktop Navigation Links (4 Destinations) */}
          <nav className="hidden md:flex items-center gap-1">
            {navLinks.map((link) => {
              const active = isLinkActive(link);
              return (
                <Link
                  key={link.label}
                  href={link.href}
                  className={`px-3.5 py-1.5 min-h-[36px] flex items-center rounded-xl text-xs font-sans font-medium transition-all ${
                    active
                      ? "bg-white/10 text-white font-semibold"
                      : "text-zinc-400 hover:text-white hover:bg-white/5"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Center: Command Palette Trigger */}
        <button
          onClick={toggleCommandPalette}
          className="hidden lg:flex items-center justify-between w-64 px-3.5 py-2 min-h-[40px] rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-sans text-zinc-400 transition-all cursor-pointer group"
        >
          <div className="flex items-center gap-2">
            <Search className="h-3.5 w-3.5 text-zinc-500 group-hover:text-amber-400 transition-colors" />
            <span>Pintasan cepat...</span>
          </div>
          <span className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-[10px] font-mono text-zinc-400">
            ⌘K
          </span>
        </button>

        {/* Right: Actions, Notifications, & User Profile / Login */}
        <div className="flex items-center gap-3">
          {/* Quick Search Mobile Icon */}
          <button
            onClick={toggleCommandPalette}
            className="lg:hidden p-2 min-h-[44px] min-w-[44px] rounded-xl bg-white/5 hover:bg-white/10 text-zinc-300 transition-colors cursor-pointer flex items-center justify-center"
            aria-label="Buka Pintasan Cepat"
          >
            <Search className="h-4 w-4" />
          </button>

          {user ? (
            <>
              {/* Quick Upload Button */}
              <button
                onClick={openUploadModal}
                className="hidden sm:flex items-center gap-1.5 px-3.5 py-2 min-h-[40px] rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-semibold text-xs font-sans transition-all shadow-md shadow-amber-500/20 cursor-pointer"
              >
                <Upload className="h-3.5 w-3.5" />
                <span>Unggah Karya</span>
              </button>

              {/* Notifications Bell */}
              <NotificationDrawer notifications={notifications} />

              {/* User Dropdown Menu */}
              <UserDropdown user={user} />
            </>
          ) : (
            <div className="flex items-center gap-2">
              <Link
                href="/invite"
                className="hidden sm:inline-flex px-3 py-1.5 min-h-[40px] items-center text-xs font-sans text-amber-400 hover:text-amber-300 transition-colors"
              >
                Aktivasi Undangan
              </Link>
              <Link
                href="/login"
                className="px-4 py-2 min-h-[40px] inline-flex items-center rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-semibold text-xs font-sans transition-all shadow-md shadow-amber-500/20"
              >
                Masuk
              </Link>
            </div>
          )}

          {/* Mobile Hamburger Toggle */}
          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="md:hidden p-2 min-h-[44px] min-w-[44px] rounded-xl bg-white/5 text-zinc-300 hover:text-white flex items-center justify-center cursor-pointer"
            aria-label="Buka Menu Navigasi"
          >
            {isMobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer Menu */}
      <AnimatePresence>
        {isMobileMenuOpen ? (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="md:hidden border-t border-white/10 bg-[#13161d] px-6 py-4 flex flex-col gap-2"
          >
            {navLinks.map((link) => (
              <Link
                key={link.label}
                href={link.href}
                onClick={() => setIsMobileMenuOpen(false)}
                className={`px-3 py-2.5 min-h-[44px] flex items-center rounded-xl text-sm font-sans font-medium ${
                  isLinkActive(link)
                    ? "bg-white/10 text-white font-semibold"
                    : "text-zinc-300 hover:bg-white/5"
                }`}
              >
                {link.label}
              </Link>
            ))}

            <div className="my-1 border-t border-white/10" />

            {/* Sub-discovery links */}
            <Link
              href="/artists"
              onClick={() => setIsMobileMenuOpen(false)}
              className="px-3 py-2 min-h-[44px] flex items-center gap-2 rounded-xl text-xs font-sans text-zinc-400 hover:text-white hover:bg-white/5"
            >
              <Users className="h-4 w-4" />
              <span>Direktori Artist</span>
            </Link>
            <Link
              href="/commissions"
              onClick={() => setIsMobileMenuOpen(false)}
              className="px-3 py-2 min-h-[44px] flex items-center gap-2 rounded-xl text-xs font-sans text-zinc-400 hover:text-white hover:bg-white/5"
            >
              <Briefcase className="h-4 w-4" />
              <span>Pusat Layanan Komisi</span>
            </Link>

            {user ? (
              <button
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  openUploadModal();
                }}
                className="w-full mt-2 py-3 min-h-[44px] rounded-xl bg-amber-500 text-black font-semibold text-xs font-sans flex items-center justify-center gap-2 cursor-pointer"
              >
                <Upload className="h-4 w-4" />
                <span>Unggah Karya Baru</span>
              </button>
            ) : null}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </header>
  );
}
