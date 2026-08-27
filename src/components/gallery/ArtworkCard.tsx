"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { MessageSquare, Sparkles, Tag, Eye } from "lucide-react";
import { ArtworkAdminMenu } from "./ArtworkAdminMenu";
import type { ArtworkListItem } from "@/hooks/useArtworks";

interface ArtworkCardProps {
  artwork: ArtworkListItem;
  currentUserRole?: string;
}

export function ArtworkCard({ artwork, currentUserRole }: ArtworkCardProps) {
  const isVideo = artwork.mediaType === "video";
  const isGif = artwork.mediaType === "gif";

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="group relative glass-panel rounded-3xl overflow-hidden flex flex-col border border-white/10 hover:border-amber-500/30 transition-all duration-300 shadow-lg hover:shadow-2xl hover:shadow-amber-500/5"
    >
      {/* Media Container with 4:3 Aspect Frame */}
      <Link href={`/artworks/${artwork.slug}`} className="relative aspect-[4/3] bg-black/40 overflow-hidden block">
        {artwork.thumbnailStorageKey ? (
          <img
            src={`/api/media/public/${artwork.thumbnailStorageKey}`}
            alt={artwork.title}
            loading="lazy"
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 ease-out"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-white/5 text-zinc-600 font-mono text-xs">
            Memproses Preview...
          </div>
        )}

        {/* Top Floating Badges: Media Type & Admin Menu */}
        <div className="absolute top-3 inset-x-3 flex items-center justify-between pointer-events-none">
          <div className="flex items-center gap-1.5 pointer-events-auto">
            {isVideo || isGif ? (
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-black/70 backdrop-blur-md text-amber-400 border border-white/15 uppercase">
                {artwork.mediaType}
              </span>
            ) : null}

            {artwork.critiqueMode === "open_for_critique" ? (
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-medium bg-black/70 backdrop-blur-md text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                <MessageSquare className="h-3 w-3 text-emerald-400" />
                <span className="hidden sm:inline">Kritik Terbuka</span>
              </span>
            ) : null}
          </div>

          <div className="pointer-events-auto">
            <ArtworkAdminMenu
              artworkId={artwork.id}
              artworkTitle={artwork.title}
              masterStorageKey={artwork.masterStorageKey}
              currentUserRole={currentUserRole}
            />
          </div>
        </div>

        {/* Hover Overlay Vignette */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
      </Link>

      {/* Card Body */}
      <div className="p-4 sm:p-5 flex flex-col justify-between gap-3 flex-1 bg-[#13161d]">
        <div className="flex flex-col gap-1">
          <Link
            href={`/artworks/${artwork.slug}`}
            className="font-display font-bold text-base text-[#f6f2e9] hover:text-amber-300 transition-colors line-clamp-1"
          >
            {artwork.title}
          </Link>
          {artwork.description ? (
            <p className="text-xs text-zinc-400 line-clamp-2 font-sans leading-relaxed">
              {artwork.description}
            </p>
          ) : null}
        </div>

        {/* Artist Profile Pill & Commission Status */}
        <div className="flex items-center justify-between pt-3 border-t border-white/5">
          <Link
            href={`/artists/${artwork.artistSlug}`}
            className="flex items-center gap-2 group/artist"
          >
            <div className="h-6 w-6 rounded-lg bg-amber-500/20 text-amber-400 font-bold font-mono flex items-center justify-center text-[10px] shrink-0 border border-amber-500/30">
              {artwork.artistName?.charAt(0) || "A"}
            </div>
            <span className="text-xs font-display font-medium text-zinc-300 group-hover/artist:text-amber-300 transition-colors truncate max-w-[120px]">
              {artwork.artistName}
            </span>
          </Link>

          <span
            className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded-full border ${
              artwork.artistCommissionStatus === "open"
                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                : artwork.artistCommissionStatus === "waitlist"
                ? "bg-amber-500/10 text-amber-400 border-amber-500/30"
                : "bg-zinc-500/10 text-zinc-400 border-zinc-500/30"
            }`}
          >
            {artwork.artistCommissionStatus}
          </span>
        </div>
      </div>
    </motion.div>
  );
}
