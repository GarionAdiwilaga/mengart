"use client";

import { useState, useEffect } from "react";
import { useGalleryFilterStore } from "@/stores/useGalleryFilterStore";
import { useArtworksQuery } from "@/hooks/useArtworks";
import { ArtworkCard } from "./ArtworkCard";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Filter, Palette, Image as ImageIcon, Video, Sparkles, MessageSquare, Loader2 } from "lucide-react";

interface GalleryGridProps {
  currentUserRole?: string;
}

export function GalleryGrid({ currentUserRole }: GalleryGridProps) {
  const {
    searchQuery,
    setSearchQuery,
    mediaType,
    setMediaType,
    critiqueMode,
    setCritiqueMode,
    resetFilters,
  } = useGalleryFilterStore();

  const [localSearch, setLocalSearch] = useState(searchQuery);

  // Debounce search query updates by 300ms
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchQuery(localSearch);
    }, 300);
    return () => clearTimeout(timer);
  }, [localSearch, setSearchQuery]);

  const { data: artworks = [], isLoading, error } = useArtworksQuery({
    search: searchQuery,
    mediaType,
    critiqueMode,
  });

  return (
    <div className="flex flex-col gap-8">
      {/* Search & Filter Control Bar */}
      <div className="glass-panel p-4 sm:p-5 rounded-3xl flex flex-col md:flex-row items-center justify-between gap-4 border border-white/10">
        {/* Search Bar */}
        <div className="relative w-full md:w-80">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
          <input
            type="text"
            value={localSearch}
            onChange={(e) => setLocalSearch(e.target.value)}
            placeholder="Cari judul karya..."
            className="w-full pl-10 pr-4 py-2.5 min-h-[44px] rounded-2xl bg-white/5 border border-white/10 text-white placeholder:text-zinc-500 focus:outline-none focus:border-amber-500/60 text-base sm:text-xs font-sans"
          />
        </div>

        {/* Media & Critique Filters */}
        <div className="flex items-center gap-2 w-full md:w-auto overflow-x-auto pb-1 md:pb-0 no-scrollbar touch-pan-x">
          {/* Media Type Tabs */}
          <div className="flex items-center p-1 rounded-2xl bg-white/5 border border-white/10 shrink-0">
            {[
              { key: "all", label: "Semua" },
              { key: "image", label: "Gambar" },
              { key: "video", label: "Video" },
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => setMediaType(tab.key as any)}
                className={`px-3 py-2 min-h-[38px] rounded-xl text-xs font-mono transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                  mediaType === tab.key
                    ? "bg-amber-500 text-black font-bold shadow-md shadow-amber-500/20"
                    : "text-zinc-400 hover:text-white"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Critique Open Filter Toggle */}
          <button
            onClick={() =>
              setCritiqueMode(critiqueMode === "open_for_critique" ? "all" : "open_for_critique")
            }
            className={`px-3.5 py-2 min-h-[44px] rounded-2xl border text-xs font-mono transition-all flex items-center gap-1.5 cursor-pointer shrink-0 whitespace-nowrap ${
              critiqueMode === "open_for_critique"
                ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/40 font-bold"
                : "bg-white/5 border-white/10 text-zinc-400 hover:text-white"
            }`}
          >
            <MessageSquare className="h-3.5 w-3.5 text-emerald-400" />
            <span>Open Critique</span>
          </button>
        </div>
      </div>

      {/* Gallery Grid Display */}
      {isLoading ? (
        <div className="py-20 flex flex-col items-center justify-center text-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
          <span className="text-xs font-mono text-zinc-500">Memuat kurasi galeri atelier...</span>
        </div>
      ) : error ? (
        <div className="glass-panel p-12 rounded-3xl text-center flex flex-col items-center gap-2">
          <span className="text-red-400 font-mono text-xs">Gagal memuat galeri karya.</span>
        </div>
      ) : artworks.length === 0 ? (
        <div className="glass-panel p-16 rounded-3xl flex flex-col items-center justify-center text-center gap-3 border border-white/10">
          <Palette className="h-10 w-10 text-zinc-600" />
          <h3 className="font-display font-bold text-lg text-white">Belum ada karya yang sesuai</h3>
          <p className="text-xs text-zinc-400 max-w-sm">
            Coba ubah kata kunci pencarian atau reset filter untuk melihat karya lainnya.
          </p>
          <button
            onClick={resetFilters}
            className="mt-2 px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-300 text-xs font-mono"
          >
            Reset Semua Filter
          </button>
        </div>
      ) : (
        <motion.div
          layout
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6"
        >
          {artworks.map((art) => (
            <ArtworkCard
              key={art.id}
              artwork={art}
              currentUserRole={currentUserRole}
            />
          ))}
        </motion.div>
      )}
    </div>
  );
}
