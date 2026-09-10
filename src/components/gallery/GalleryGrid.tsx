"use client";

import { useState, useEffect, useTransition, useCallback, useRef, Suspense } from "react";
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

function isMatchingGalleryUrl(savedUrlStr: string, currentPath: string): boolean {
  if (savedUrlStr === currentPath) return true;
  try {
    const saved = new URL(savedUrlStr, "https://mengart.local");
    const current = new URL(currentPath, "https://mengart.local");
    if (saved.pathname !== current.pathname) return false;
    const savedKeys = Array.from(saved.searchParams.keys()).sort();
    const currentKeys = Array.from(current.searchParams.keys()).sort();
    if (savedKeys.length !== currentKeys.length) return false;
    for (const key of savedKeys) {
      if (saved.searchParams.get(key) !== current.searchParams.get(key)) return false;
    }
    return true;
  } catch {
    return false;
  }
}

function GalleryGridContent({ currentUserRole, initialTab }: GalleryGridProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

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

  // Derive authoritative filter state directly from URL search params (G3 / R09)
  const authoritativeTab: "bebas" | "challenge" =
    searchParams.get("tab") === "challenge" ? "challenge" : "bebas";
  const urlSearch = searchParams.get("search") || searchParams.get("q") || "";
  const rawMedia = searchParams.get("media") || searchParams.get("mediaType");
  const authoritativeMedia: "all" | "image" | "video" =
    rawMedia === "image" || rawMedia === "video" ? rawMedia : "all";
  const rawCritique = searchParams.get("critique") || searchParams.get("critiqueMode");
  const authoritativeCritique: "all" | "open_for_critique" =
    rawCritique === "open_for_critique" ? "open_for_critique" : "all";
  const rawSort = searchParams.get("sort") || searchParams.get("sortBy");
  const authoritativeSort: "latest" | "oldest" =
    rawSort === "oldest" ? "oldest" : "latest";

  const [localSearch, setLocalSearch] = useState(urlSearch);
  const hasRestoredRef = useRef(false);

  // Sync state from URL parameters into Zustand store
  useEffect(() => {
    const state = useGalleryFilterStore.getState();
    if (authoritativeTab !== state.galleryTab) state.setGalleryTab(authoritativeTab);
    if (urlSearch !== state.searchQuery) {
      state.setSearchQuery(urlSearch);
      setLocalSearch(urlSearch);
    }
    if (authoritativeMedia !== state.mediaType) state.setMediaType(authoritativeMedia);
    if (authoritativeCritique !== state.critiqueMode) state.setCritiqueMode(authoritativeCritique);
    if (authoritativeSort !== state.sortBy) state.setSortBy(authoritativeSort);
  }, [searchParams, authoritativeTab, urlSearch, authoritativeMedia, authoritativeCritique, authoritativeSort]);

  // Synchronize all filters into URL search params
  const updateUrlFilters = useCallback(
    (overrides: {
      tab?: "bebas" | "challenge";
      search?: string;
      media?: "all" | "image" | "video";
      critique?: "all" | "open_for_critique";
      sort?: "latest" | "oldest";
    }) => {
      const activeTab = overrides.tab ?? authoritativeTab;
      const activeSearch = overrides.search !== undefined ? overrides.search : urlSearch;
      const activeMedia = overrides.media ?? authoritativeMedia;
      const activeCritique = overrides.critique ?? authoritativeCritique;
      const activeSort = overrides.sort ?? authoritativeSort;

      const params = new URLSearchParams();
      if (activeTab === "challenge") params.set("tab", "challenge");
      if (activeSearch && activeSearch.trim()) params.set("search", activeSearch.trim());
      if (activeMedia !== "all") params.set("media", activeMedia);
      if (activeCritique !== "all") params.set("critique", activeCritique);
      if (activeSort === "oldest") params.set("sort", "oldest");

      const qs = params.toString();
      const target = qs ? `${pathname}?${qs}` : pathname;
      startTransition(() => {
        router.replace(target, { scroll: false });
      });
    },
    [authoritativeTab, urlSearch, authoritativeMedia, authoritativeCritique, authoritativeSort, pathname, router]
  );

  // Debounce search query updates by 300ms
  useEffect(() => {
    const timer = setTimeout(() => {
      if (localSearch !== urlSearch) {
        setSearchQuery(localSearch);
        updateUrlFilters({ search: localSearch });
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [localSearch, urlSearch, setSearchQuery, updateUrlFilters]);

  // Handle Tab Switch
  const handleTabChange = (newTabId: string) => {
    const tabValue = newTabId as "bebas" | "challenge";
    setGalleryTab(tabValue);
    updateUrlFilters({ tab: tabValue });
  };

  // Handle Media Type Switch
  const handleMediaChange = (newMedia: "all" | "image" | "video") => {
    setMediaType(newMedia);
    updateUrlFilters({ media: newMedia });
  };

  // Handle Sort Switch
  const handleSortChange = () => {
    const nextSort = authoritativeSort === "latest" ? "oldest" : "latest";
    setSortBy(nextSort);
    updateUrlFilters({ sort: nextSort });
  };

  // Handle Critique Mode Switch
  const handleCritiqueChange = () => {
    const nextCritique = authoritativeCritique === "open_for_critique" ? "all" : "open_for_critique";
    setCritiqueMode(nextCritique);
    updateUrlFilters({ critique: nextCritique });
  };

  // Handle Reset Filters
  const handleResetAll = () => {
    resetFilters();
    setLocalSearch("");
    startTransition(() => {
      router.replace(pathname, { scroll: false });
    });
  };

  // Save composite navigation context to sessionStorage before opening artwork
  const handleCardNavigate = (artworkId: string) => {
    if (typeof window === "undefined") return;
    try {
      const qs = searchParams.toString();
      const currentUrl = qs ? `${pathname}?${qs}` : pathname;
      sessionStorage.setItem(
        "mengart_gallery_nav_context",
        JSON.stringify({
          url: currentUrl,
          artworkId,
          scrollY: window.scrollY || window.pageYOffset || 0,
          timestamp: Date.now(),
        })
      );
    } catch (_e) {
      // Ignore sessionStorage access exceptions
    }
  };

  const { data: artworks = [], isLoading, isFetching, error } = useArtworksQuery({
    search: urlSearch,
    mediaType: authoritativeMedia,
    critiqueMode: authoritativeCritique,
    tab: authoritativeTab,
    sortBy: authoritativeSort,
  });

  // Restore scroll offset and card focus after artworks finish rendering
  useEffect(() => {
    if (isLoading || isFetching || hasRestoredRef.current) return;
    if (typeof window === "undefined") return;

    try {
      const raw = sessionStorage.getItem("mengart_gallery_nav_context");
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!parsed || !parsed.url) return;

      // Expiry check: discard context older than 15 minutes (F5 / R09)
      if (parsed.timestamp && Date.now() - parsed.timestamp > 15 * 60 * 1000) {
        sessionStorage.removeItem("mengart_gallery_nav_context");
        return;
      }

      const qs = searchParams.toString();
      const currentPath = qs ? `${pathname}?${qs}` : pathname;

      // Ensure referring URL matches canonical query string (not pathname alone)
      if (!isMatchingGalleryUrl(parsed.url, currentPath)) {
        return;
      }

      // CRITICAL (G3): Ensure active query identity matches target URL before consuming or discarding context!
      const targetUrlObj = new URL(parsed.url, "https://mengart.internal");
      const targetTab = targetUrlObj.searchParams.get("tab") === "challenge" ? "challenge" : "bebas";
      if (authoritativeTab !== targetTab) {
        // Query identity does not match restored URL yet! Do not consume or discard context!
        return;
      }

      // Verify referring card existence in rendered DOM before consuming context
      const cardEl = parsed.artworkId
        ? document.getElementById(`artwork-card-${parsed.artworkId}`)
        : null;

      if (cardEl) {
        hasRestoredRef.current = true;
        sessionStorage.removeItem("mengart_gallery_nav_context");

        // Restore scroll and focus referent card without jump
        requestAnimationFrame(() => {
          if (typeof parsed.scrollY === "number") {
            window.scrollTo({ top: parsed.scrollY, behavior: "instant" });
          }
          cardEl.focus({ preventScroll: true });
        });
      } else {
        // Only conclude that an artwork is unavailable from the completed target query
        // Never from loading, fetching, or default/mismatched data
        if (artworks.length > 0) {
          const artworkInList = artworks.some((a) => a.id === parsed.artworkId);
          if (!artworkInList) {
            hasRestoredRef.current = true;
            sessionStorage.removeItem("mengart_gallery_nav_context");
          }
        }
      }
    } catch (_e) {
      // Ignore sessionStorage access exceptions
    }
  }, [isLoading, isFetching, artworks, pathname, searchParams, authoritativeTab]);

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
                count: authoritativeTab === "bebas" ? artworks.length : undefined,
              },
              {
                id: "challenge",
                label: "Karya Challenge",
                count: authoritativeTab === "challenge" ? artworks.length : undefined,
              },
            ]}
            value={authoritativeTab}
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
              authoritativeTab === "challenge"
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
                onClick={() => handleMediaChange(tab.key as any)}
                className={`px-3 py-2 min-h-[40px] rounded-xl text-xs font-mono transition-all cursor-pointer whitespace-nowrap shrink-0 flex items-center justify-center ${
                  authoritativeMedia === tab.key
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
            onClick={handleSortChange}
            className="px-3.5 py-2 min-h-[44px] rounded-2xl bg-white/5 border border-white/10 hover:border-white/20 text-xs font-mono text-zinc-300 hover:text-white transition-all flex items-center gap-1.5 cursor-pointer shrink-0 whitespace-nowrap"
          >
            <ArrowUpDown className="h-3.5 w-3.5 text-amber-400" />
            <span>{authoritativeSort === "latest" ? "Terbaru" : "Terlama"}</span>
          </button>

          {/* Komentar Terbuka Toggle */}
          <button
            type="button"
            onClick={handleCritiqueChange}
            className={`px-3.5 py-2 min-h-[44px] rounded-2xl border text-xs font-mono transition-all flex items-center gap-1.5 cursor-pointer shrink-0 whitespace-nowrap ${
              authoritativeCritique === "open_for_critique"
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
            {authoritativeTab === "challenge"
              ? "Belum ada karya challenge yang sesuai"
              : "Belum ada karya bebas yang sesuai"}
          </h3>
          <p className="text-xs text-zinc-400 max-w-sm font-sans leading-relaxed">
            {urlSearch || authoritativeMedia !== "all" || authoritativeCritique !== "all"
              ? "Coba sesuaikan kata kunci pencarian atau reset filter untuk menjelajahi karya lainnya."
              : authoritativeTab === "challenge"
              ? "Karya challenge dari tantangan yang telah selesai akan tampil secara otomatis di sini."
              : "Jadilah yang pertama mengunggah karya bebas ke galeri komunitas!"}
          </p>
          {(urlSearch || authoritativeMedia !== "all" || authoritativeCritique !== "all") && (
            <button
              type="button"
              onClick={handleResetAll}
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
          {artworks.map((art) => {
            const searchString = searchParams.toString();
            const currentPathWithQuery = searchString ? `${pathname}?${searchString}` : pathname;
            return (
              <ArtworkCard
                key={art.id}
                artwork={art}
                currentUserRole={currentUserRole}
                from={currentPathWithQuery}
                onNavigate={handleCardNavigate}
              />
            );
          })}
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

