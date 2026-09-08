"use client";

import React, { useState } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { Eye, EyeOff, Play } from "lucide-react";
import { AtelierBadge } from "../atoms/AtelierBadge";

export interface ArtworkMediaFrameProps {
  artworkId?: string;
  src: string;
  thumbnailSrc?: string | null;
  mediaType?: "image" | "video";
  alt: string;
  aspectRatio?: number | string; // e.g. 16/9, "4/3", "1/1"
  isSpoiler?: boolean;
  className?: string;
  priority?: boolean;
  fill?: boolean;
  onClick?: () => void;
  showPlayIndicator?: boolean;
}

export function ArtworkMediaFrame({
  artworkId,
  src,
  thumbnailSrc,
  mediaType = "image",
  alt,
  aspectRatio,
  isSpoiler = false,
  className,
  priority = false,
  fill = false,
  onClick,
  showPlayIndicator = true,
}: ArtworkMediaFrameProps) {
  const currentIdentity = artworkId || src;
  const [prevIdentity, setPrevIdentity] = useState(currentIdentity);
  const [isRevealed, setIsRevealed] = useState(false);
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const videoRef = React.useRef<HTMLVideoElement | null>(null);

  // Synchronously reset spoiler conceal and video playback when artwork identity changes
  if (prevIdentity !== currentIdentity) {
    setPrevIdentity(currentIdentity);
    setIsRevealed(false);
    setIsVideoPlaying(false);
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
    }
  }

  const shouldBlur = isSpoiler && !isRevealed;
  const displayAlt = shouldBlur ? "Konten spoiler tersembunyi" : alt;

  const handleRevealClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsRevealed(true);
  };

  const handleHideClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsRevealed(false);
  };

  return (
    <div
      onClick={shouldBlur ? undefined : onClick}
      role={onClick && !shouldBlur ? "button" : undefined}
      tabIndex={onClick && !shouldBlur ? 0 : undefined}
      onKeyDown={
        onClick && !shouldBlur
          ? (e) => {
              if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      style={aspectRatio && !fill ? { aspectRatio } : undefined}
      className={cn(
        "relative w-full overflow-hidden bg-[#0a0c10] select-none rounded-2xl flex items-center justify-center",
        onClick && !shouldBlur && "cursor-pointer group focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500",
        fill && "h-full",
        className
      )}
    >
      {/* Media Element */}
      {mediaType === "video" ? (
        <div className="relative w-full h-full flex items-center justify-center">
          <video
            ref={videoRef}
            src={src}
            poster={thumbnailSrc || undefined}
            playsInline
            muted
            loop
            controls={isRevealed || !isSpoiler}
            onPlay={() => setIsVideoPlaying(true)}
            onPause={() => setIsVideoPlaying(false)}
            className={cn(
              "w-full h-full object-contain transition-all duration-300",
              shouldBlur && "blur-2xl scale-105 pointer-events-none opacity-40"
            )}
          />
          {showPlayIndicator && !isVideoPlaying && !shouldBlur && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="h-12 w-12 rounded-full bg-black/60 backdrop-blur-md border border-white/20 flex items-center justify-center text-white shadow-xl group-hover:scale-110 transition-transform">
                <Play className="h-5 w-5 fill-current ml-0.5" />
              </div>
            </div>
          )}
        </div>
      ) : fill ? (
        <Image
          src={src}
          alt={displayAlt}
          fill
          priority={priority}
          sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
          className={cn(
            "object-contain transition-all duration-300",
            shouldBlur && "blur-2xl scale-105 opacity-40",
            onClick && !shouldBlur && "group-hover:scale-[1.02]"
          )}
        />
      ) : (
        <img
          src={src}
          alt={displayAlt}
          className={cn(
            "w-full h-auto max-h-[85vh] object-contain transition-all duration-300 mx-auto",
            shouldBlur && "blur-2xl scale-105 opacity-40",
            onClick && !shouldBlur && "group-hover:scale-[1.02]"
          )}
        />
      )}

      {/* Top Badges (e.g. Spoiler Tag) */}
      {isSpoiler && (
        <div className="absolute top-3 left-3 z-10">
          <AtelierBadge
            variant={isRevealed ? "muted" : "amber"}
            size="sm"
            leftIcon={<EyeOff className="h-3 w-3" />}
          >
            Spoiler
          </AtelierBadge>
        </div>
      )}

      {/* Spoiler Blur Mask & Reveal Control */}
      {shouldBlur && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center p-4 bg-black/50 backdrop-blur-md text-center">
          <div className="flex flex-col items-center max-w-xs gap-2.5">
            <div className="h-11 w-11 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 shadow-lg">
              <EyeOff className="h-5 w-5" />
            </div>
            <p className="text-xs font-sans font-medium text-zinc-200">
              Karya ini ditandai mengandung spoiler
            </p>
            <button
              type="button"
              onClick={handleRevealClick}
              className="mt-1 inline-flex items-center justify-center gap-1.5 px-4 py-2 min-h-[44px] min-w-[44px] rounded-xl bg-white/10 hover:bg-white/15 text-[#f6f2e9] text-xs font-sans font-medium border border-white/15 transition-all active:scale-98 cursor-pointer"
            >
              <Eye className="h-3.5 w-3.5" />
              <span>Buka Konten</span>
            </button>
          </div>
        </div>
      )}

      {/* Re-hide button when revealed */}
      {isSpoiler && isRevealed && (
        <button
          type="button"
          onClick={handleHideClick}
          aria-label="Sembunyikan kembali spoiler"
          className="absolute top-3 right-3 z-10 p-2 min-h-[44px] min-w-[44px] rounded-xl bg-black/60 hover:bg-black/80 backdrop-blur-md text-zinc-400 hover:text-white border border-white/10 transition-colors flex items-center justify-center cursor-pointer"
        >
          <EyeOff className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
