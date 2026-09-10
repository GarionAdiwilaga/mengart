"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { MessageSquare, Sparkles, Trophy, EyeOff } from "lucide-react";
import { ArtworkAdminMenu } from "./ArtworkAdminMenu";
import { AtelierBadge } from "@/components/ui/atoms/AtelierBadge";
import type { ArtworkListItem } from "@/hooks/useArtworks";

interface ArtworkCardProps {
  artwork: ArtworkListItem;
  currentUserRole?: string;
  from?: string;
  onNavigate?: (artworkId: string) => void;
}

export function ArtworkCard({ artwork, currentUserRole, from, onNavigate }: ArtworkCardProps) {
  const [isRevealed, setIsRevealed] = useState(false);
  const isVideo = artwork.mediaType === "video";
  const isObscured = Boolean(artwork.isSpoiler && !isRevealed);
  const artworkHref = from
    ? `/artworks/${artwork.slug}?from=${encodeURIComponent(from)}`
    : `/artworks/${artwork.slug}`;

  const handleCardClick = () => {
    onNavigate?.(artwork.id);
  };

  return (
    <motion.div
      id={`artwork-card-${artwork.id}`}
      tabIndex={-1}
      data-artwork-id={artwork.id}
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="group relative glass-panel rounded-3xl overflow-hidden flex flex-col border border-white/10 hover:border-amber-500/30 focus:outline-none focus:ring-2 focus:ring-amber-500/50 transition-all duration-300 shadow-lg hover:shadow-2xl hover:shadow-amber-500/5"
    >
      {/* Media Container with 4:3 Aspect Frame */}
      <Link
        href={artworkHref}
        onClick={handleCardClick}
        className="relative aspect-[4/3] bg-black/40 overflow-hidden block"
      >
        {artwork.thumbnailStorageKey ? (
          <img
            src={`/api/media/public/${artwork.thumbnailStorageKey}`}
            alt={isObscured ? "Konten spoiler tersembunyi" : artwork.title}
            loading="lazy"
            className={`w-full h-full object-cover transition-all duration-500 ease-out ${
              isObscured
                ? "blur-xl scale-105 select-none pointer-events-none"
                : "group-hover:scale-105"
            }`}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-white/5 text-zinc-600 font-mono text-xs">
            Memproses Pratinjau...
          </div>
        )}

        {/* Obscured Spoiler Overlay */}
        {isObscured && (
          <div className="absolute inset-0 bg-black/80 backdrop-blur-md flex flex-col items-center justify-center p-4 text-center z-10 gap-2.5">
            <div className="h-9 w-9 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <EyeOff className="h-4 w-4" />
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-xs font-mono font-bold text-amber-300 uppercase tracking-wider">
                Konten Spoiler
              </span>
              <span className="text-[11px] text-zinc-400 font-sans">
                Karya ditandai spoiler oleh artist
              </span>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setIsRevealed(true);
              }}
              className="mt-1 px-3.5 py-2 min-h-[44px] rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold font-mono transition-all duration-200 shadow-md shadow-amber-500/20 cursor-pointer pointer-events-auto flex items-center justify-center"
            >
              Buka Konten
            </button>
          </div>
        )}

        {/* Top Floating Badges: Media Type, Spoiler & Admin Menu */}
        <div className="absolute top-3 inset-x-3 flex items-center justify-between pointer-events-none z-20">
          <div className="flex flex-wrap items-center gap-1.5 pointer-events-auto">
            {artwork.isSpoiler ? (
              <AtelierBadge variant="amber" size="sm" leftIcon={<EyeOff className="h-3 w-3" />}>
                Spoiler
              </AtelierBadge>
            ) : null}

            {isVideo ? (
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-black/70 backdrop-blur-md text-amber-400 border border-white/15 uppercase">
                Video
              </span>
            ) : null}

            {artwork.critiqueMode === "open_for_critique" ? (
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-medium bg-black/70 backdrop-blur-md text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                <MessageSquare className="h-3 w-3 text-emerald-400" />
                <span className="hidden sm:inline">Komentar Terbuka</span>
              </span>
            ) : null}
          </div>

          <div className="pointer-events-auto">
            <ArtworkAdminMenu
              artworkId={artwork.id}
              artworkTitle={artwork.title}
              masterStorageKey={artwork.masterStorageKey}
              currentUserRole={currentUserRole}
              challengeSubmissionId={artwork.challengeSubmissionId}
              challengeTitle={artwork.challengeTitle}
            />
          </div>
        </div>

        {/* Hover Overlay Vignette */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
      </Link>

      {/* Card Body */}
      <div className="p-4 sm:p-5 flex flex-col justify-between gap-3 flex-1 bg-[#13161d]">
        <div className="flex flex-col gap-1.5">
          {/* Challenge Provenance Badge if applicable */}
          {(artwork.origin === "challenge" || artwork.challengeTitle) && (
            <div className="flex items-center gap-1.5">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[10px] font-mono font-medium truncate max-w-full">
                <Trophy className="h-2.5 w-2.5 shrink-0" />
                <span className="truncate">
                  {artwork.challengeTitle ? `Challenge: ${artwork.challengeTitle}` : "Karya Challenge"}
                </span>
              </span>
            </div>
          )}

          <Link
            href={artworkHref}
            onClick={handleCardClick}
            className="font-display font-bold text-base text-[#f6f2e9] hover:text-amber-300 transition-colors line-clamp-1"
          >
            {artwork.title}
          </Link>
          {artwork.effectiveCaption ? (
            <p className="text-xs text-amber-300/80 font-mono line-clamp-1">
              ★ {artwork.effectiveCaption}
            </p>
          ) : artwork.description ? (
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
            <div className="h-7 w-7 rounded-xl bg-amber-500/20 text-amber-400 font-bold font-mono flex items-center justify-center text-[10px] shrink-0 border border-amber-500/30 overflow-hidden">
              {artwork.artistAvatar ? (
                <img
                  src={artwork.artistAvatar}
                  alt={artwork.artistName}
                  className="w-full h-full object-cover"
                />
              ) : (
                artwork.artistName?.charAt(0) || "A"
              )}
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

