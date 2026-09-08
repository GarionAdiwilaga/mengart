"use client";

import { useState, useEffect, useTransition, Suspense } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useGalleryFilterStore } from "@/stores/useGalleryFilterStore";
import { useArtworksQuery } from "@/hooks/useArtworks";
import { ArtworkCard } from "./ArtworkCard";
import { SegmentedPill } from "@/components/ui/atoms/SegmentedPill";
import { AtelierBadge } from "@/components/ui/atoms/AtelierBadge";
import { motion } from "framer-motion";
import {
  Search,
  Palette,
  Sparkles,
  MessageSquare,
  Loader2,
  Trophy,
  SlidersHorizontal,
  ArrowUpDown,
  ExternalLink,
} from "lucide-react";
import Link from "next/link";

interface GalleryGridProps {
  currentUserRole?: string;
  initialTab?: "bebas" | "challenge";
}

function GalleryGridContent({ currentUserRole, initialTab }: GalleryGridProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const urlTab = searchParams.get("tab") === "challenge" ? "challenge" : "bebas";

  const {
    galleryTab,
    setGalleryTab,
    searchQuery,
    setSearchQuery,
    mediaType,
    setMediaType,
    critiqueMode,
    setCritiqueMode,
    sortBy,
    setSortBy,
    resetFilters,
  } = useGalleryFilterStore();

  const [localSearch, setLocalSearch] = useState(searchQuery);

  // Sync tab from URL on mount
  useEffect(() => {
    if (urlTab !== galleryTab) {
      setGalleryTab(urlTab);
    }
  }, [urlTab, galleryTab, setGalleryTab]);

  // Handle Tab Switch with URL query synchronization
  const handleTabChange = (newTabId: string) => {
    const tabValue = newTabId as "bebas" | "challenge";
    setGalleryTab(tabValue);
    startTransition(() => {
      const params = new URLSearchParams(searchParams.toString());
      if (tabValue === "challenge") {
        params.set("tab", "challenge");
      } else {
        params.delete("tab");
      }
      const newQuery = params.toString();
      router.replace(newQuery ? `${pathname}?${newQuery}` : pathname, { scroll: false });
    });
  };

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
    tab: galleryTab,
    sortBy,
  });

  return (
    <div className="flex flex-col gap-8">
      {/* Top Gallery Segmented Navigation & Commission Shortcut */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-white/10">
        <div className="flex items-center gap-3">
          <SegmentedPill
            items={[
              {
                id: "bebas",
                label: "Karya Bebas",
                count: galleryTab === "bebas" ? artworks.length : undefined,
              },
              {
                id: "challenge",
                label: "Karya Challenge",
                count: galleryTab === "challenge" ? artworks.length : undefined,
              },
            ]}
            value={galleryTab}
            onChange={handleTabChange}
            size="md"
          />
        </div>

        {/* Quick Commission Discovery Link */}
        <Link
          href="/commissions"
          className="inline-flex items-center gap-1.5 px-3.5 py-2 min-h-[44px] rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-300 hover:text-amber-300 text-xs font-mono transition-colors self-start sm:self-auto cursor-pointer"
        >
          <Sparkles className="h-3.5 w-3.5 text-amber-400" />
          <span>Layanan Komisi Komunitas</span>
          <ExternalLink className="h-3 w-3 text-zinc-500" />
        </Link>
      </div>

      {/* Search & Filter Control Bar */}
      <div className="glass-panel p-4 sm:p-5 rounded-3xl flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4 border border-white/10">
        {/* Search Bar */}
        <div className="relative w-full lg:w-80">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
          <input
            type="text"
            value={localSearch}
            onChange={(e) => setLocalSearch(e.target.value)}
            placeholder={
              galleryTab === "challenge"
                ? "Cari karya challenge..."
                : "Cari judul karya bebas..."
            }
            className="w-full pl-10 pr-4 py-2.5 min-h-[44px] rounded-2xl bg-white/5 border border-white/10 text-white placeholder:text-zinc-500 focus:outline-none focus:border-amber-500/60 text-base sm:text-xs font-sans"
          />
        </div>

        {/* Filter Chips & Sort Controls */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 lg:pb-0 no-scrollbar touch-pan-x">
          {/* Media Type Tabs */}
          <div className="flex items-center p-1 rounded-2xl bg-white/5 border border-white/10 shrink-0">
            {[
              { key: "all", label: "Semua" },
              { key: "image", label: "Gambar" },
              { key: "video", label: "Video" },
            ].map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setMediaType(tab.key as any)}
                className={`px-3 py-2 min-h-[40px] rounded-xl text-xs font-mono transition-all cursor-pointer whitespace-nowrap shrink-0 flex items-center justify-center ${
                  mediaType === tab.key
                    ? "bg-amber-500 text-black font-bold shadow-md shadow-amber-500/20"
                    : "text-zinc-400 hover:text-white"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Sort By Toggle */}
          <button
            type="button"
            onClick={() => setSortBy(sortBy === "latest" ? "oldest" : "latest")}
            className="px-3.5 py-2 min-h-[44px] rounded-2xl bg-white/5 border border-white/10 hover:border-white/20 text-xs font-mono text-zinc-300 hover:text-white transition-all flex items-center gap-1.5 cursor-pointer shrink-0 whitespace-nowrap"
          >
            <ArrowUpDown className="h-3.5 w-3.5 text-amber-400" />
            <span>{sortBy === "latest" ? "Terbaru" : "Terlama"}</span>
          </button>

          {/* Komentar Terbuka Toggle */}
          <button
            type="button"
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
            <span>Komentar Terbuka</span>
          </button>
        </div>
      </div>

      {/* Gallery Grid Display */}
      {isLoading ? (
        <div className="py-24 flex flex-col items-center justify-center text-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
          <span className="text-xs font-mono text-zinc-500">Memuat kurasi karya atelier...</span>
        </div>
      ) : error ? (
        <div className="glass-panel p-12 rounded-3xl text-center flex flex-col items-center gap-2 border border-rose-500/20">
          <span className="text-rose-400 font-mono text-xs">Gagal memuat galeri karya.</span>
        </div>
      ) : artworks.length === 0 ? (
        <div className="glass-panel p-16 rounded-3xl flex flex-col items-center justify-center text-center gap-3 border border-white/10">
          <Palette className="h-10 w-10 text-zinc-600" />
          <h3 className="font-display font-bold text-lg text-white">
            {galleryTab === "challenge"
              ? "Belum ada karya challenge yang sesuai"
              : "Belum ada karya bebas yang sesuai"}
          </h3>
          <p className="text-xs text-zinc-400 max-w-sm font-sans leading-relaxed">
            {searchQuery || mediaType !== "all" || critiqueMode !== "all"
              ? "Coba sesuaikan kata kunci pencarian atau reset filter untuk menjelajahi karya lainnya."
              : galleryTab === "challenge"
              ? "Karya challenge dari tantangan yang telah selesai akan tampil secara otomatis di sini."
              : "Jadilah yang pertama mengunggah karya bebas ke galeri komunitas!"}
          </p>
          {(searchQuery || mediaType !== "all" || critiqueMode !== "all") && (
            <button
              type="button"
              onClick={resetFilters}
              className="mt-2 px-4 py-2 min-h-[44px] rounded-xl bg-white/5 hover:bg-white/10 text-zinc-300 text-xs font-mono cursor-pointer flex items-center justify-center"
            >
              Reset Semua Filter
            </button>
          )}
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

export function GalleryGrid(props: GalleryGridProps) {
  return (
    <Suspense
      fallback={
        <div className="py-24 flex flex-col items-center justify-center text-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
          <span className="text-xs font-mono text-zinc-500">Memuat galeri...</span>
        </div>
      }
    >
      <GalleryGridContent {...props} />
    </Suspense>
  );
}

