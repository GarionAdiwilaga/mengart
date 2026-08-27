"use client";

import { useEffect, useState } from "react";
import { useModalStore } from "@/stores/useModalStore";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  X,
  Palette,
  Trophy,
  Users,
  Briefcase,
  ShieldAlert,
  Sparkles,
  ArrowRight,
} from "lucide-react";
import { useRouter } from "next/navigation";

export function GlobalCommandPalette() {
  const { isCommandPaletteOpen, closeCommandPalette, toggleCommandPalette } = useModalStore();
  const [query, setQuery] = useState("");
  const router = useRouter();

  // Keyboard shortcut listener: Cmd+K or Ctrl+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        toggleCommandPalette();
      } else if (e.key === "Escape" && isCommandPaletteOpen) {
        closeCommandPalette();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isCommandPaletteOpen, toggleCommandPalette, closeCommandPalette]);

  const navItems = [
    { label: "Jelajahi Galeri Karya", href: "/gallery", icon: Palette, category: "Navigasi Utama" },
    { label: "Direktori Artist & Kreator", href: "/artists", icon: Users, category: "Navigasi Utama" },
    { label: "Pusat Layanan Komisi", href: "/commissions", icon: Briefcase, category: "Navigasi Utama" },
    { label: "Community Art Challenge", href: "/challenges", icon: Trophy, category: "Navigasi Utama" },
    { label: "Studio Portofolio Saya", href: "/me/portfolio", icon: Sparkles, category: "Studio Kreator" },
    { label: "Kelola Layanan Komisi", href: "/me/commissions", icon: Briefcase, category: "Studio Kreator" },
    { label: "Admin Command Center", href: "/admin", icon: ShieldAlert, category: "Administrasi" },
  ];

  const filteredItems = navItems.filter((item) =>
    item.label.toLowerCase().includes(query.toLowerCase())
  );

  const handleSelect = (href: string) => {
    closeCommandPalette();
    setQuery("");
    router.push(href);
  };

  return (
    <AnimatePresence>
      {isCommandPaletteOpen ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 p-4 bg-black/80 backdrop-blur-md">
          {/* Backdrop click to close */}
          <div className="fixed inset-0" onClick={closeCommandPalette} />

          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -10 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="w-full max-w-xl glass-panel-elevated rounded-3xl border border-white/15 shadow-2xl overflow-hidden relative z-10 flex flex-col"
          >
            {/* Search Input Bar */}
            <div className="flex items-center gap-3 px-5 py-4 border-b border-white/10 bg-white/[0.02]">
              <Search className="h-5 w-5 text-amber-400 shrink-0" />
              <input
                autoFocus
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Cari navigasi, galeri, artist, atau challenge... (ESC untuk tutup)"
                className="w-full bg-transparent text-[#f6f2e9] placeholder:text-zinc-500 text-sm font-sans focus:outline-none"
              />
              <button
                onClick={closeCommandPalette}
                className="p-1.5 rounded-lg text-zinc-500 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Quick Results List */}
            <div className="max-h-80 overflow-y-auto p-3 flex flex-col gap-1 divide-y divide-white/5">
              {filteredItems.length === 0 ? (
                <div className="py-8 text-center text-xs font-mono text-zinc-500">
                  Tidak ada navigasi yang cocok dengan "{query}".
                </div>
              ) : (
                filteredItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.href}
                      onClick={() => handleSelect(item.href)}
                      className="w-full flex items-center justify-between p-3 rounded-2xl hover:bg-amber-500/10 text-left group transition-all cursor-pointer"
                    >
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-xl bg-white/5 group-hover:bg-amber-500/20 group-hover:text-amber-400 flex items-center justify-center text-zinc-400 transition-colors">
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="flex flex-col">
                          <span className="text-sm font-display font-medium text-[#f6f2e9] group-hover:text-amber-300 transition-colors">
                            {item.label}
                          </span>
                          <span className="text-[10px] font-mono text-zinc-500">
                            {item.category}
                          </span>
                        </div>
                      </div>

                      <ArrowRight className="h-4 w-4 text-zinc-600 group-hover:text-amber-400 group-hover:translate-x-0.5 transition-all" />
                    </button>
                  );
                })
              )}
            </div>

            {/* Footer Helper */}
            <div className="px-5 py-2.5 bg-white/[0.02] border-t border-white/10 flex items-center justify-between text-[11px] font-mono text-zinc-500">
              <span>Gunakan tombol panah atau klik untuk navigasi</span>
              <span className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10">ESC</span>
            </div>
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>
  );
}
