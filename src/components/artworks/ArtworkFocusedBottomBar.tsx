"use client";

import React from "react";
import Link from "next/link";
import { MessageSquare, Share2, User } from "lucide-react";
import { toast } from "sonner";

interface ArtworkFocusedBottomBarProps {
  artworkTitle: string;
  artistName: string;
  artistSlug: string;
  artistAvatar: string | null;
  commentsCount: number;
}

export function ArtworkFocusedBottomBar({
  artworkTitle,
  artistName,
  artistSlug,
  artistAvatar,
  commentsCount,
}: ArtworkFocusedBottomBarProps) {
  const handleShare = async () => {
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({
          title: artworkTitle,
          text: `Lihat karya "${artworkTitle}" oleh ${artistName} di Mengart Atelier`,
          url: window.location.href,
        });
        return;
      } catch (err: any) {
        if (err.name === "AbortError") return;
      }
    }

    // Fallback: Copy link to clipboard
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      await navigator.clipboard.writeText(window.location.href);
      toast.success("Tautan karya berhasil disalin ke clipboard!");
    }
  };

  const scrollToComments = () => {
    const el = document.getElementById("comments");
    if (el) {
      el.scrollIntoView({ behavior: "smooth" });
    }
  };

  return (
    <div className="w-full flex items-center justify-between gap-3">
      {/* Artist Identity Pill */}
      <Link
        href={`/artists/${artistSlug}`}
        className="flex items-center gap-2.5 min-h-[44px] px-2 py-1 -ml-1 rounded-xl hover:bg-white/5 transition-colors group min-w-0"
      >
        <div className="h-8 w-8 rounded-xl bg-amber-500/20 text-amber-400 font-bold font-mono flex items-center justify-center text-xs shrink-0 border border-amber-500/30 overflow-hidden">
          {artistAvatar ? (
            <img src={artistAvatar} alt={artistName} className="w-full h-full object-cover" />
          ) : (
            artistName.charAt(0).toUpperCase()
          )}
        </div>
        <div className="flex flex-col min-w-0">
          <span className="text-xs font-display font-medium text-zinc-200 group-hover:text-amber-300 transition-colors truncate">
            {artistName}
          </span>
          <span className="text-[10px] font-mono text-zinc-500">Lihat Profil</span>
        </div>
      </Link>

      {/* Action Buttons: Jump to Comments & Share */}
      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={scrollToComments}
          aria-label={`Buka komentar (${commentsCount})`}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 min-h-[44px] rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-mono text-zinc-300 hover:text-white transition-colors cursor-pointer"
        >
          <MessageSquare className="h-4 w-4 text-amber-400" />
          <span>Komentar</span>
          <span className="px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-[10px] font-bold">
            {commentsCount}
          </span>
        </button>

        <button
          type="button"
          onClick={handleShare}
          aria-label="Bagikan karya ini"
          className="inline-flex items-center justify-center p-2.5 min-h-[44px] min-w-[44px] rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-300 hover:text-white transition-colors cursor-pointer"
        >
          <Share2 className="h-4 w-4 text-zinc-300" />
        </button>
      </div>
    </div>
  );
}
