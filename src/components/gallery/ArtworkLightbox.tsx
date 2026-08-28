"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Sparkles,
  ShieldCheck,
  Maximize2,
  Minimize2,
} from "lucide-react";

interface ArtworkLightboxProps {
  publicMediaUrl: string;
  masterMediaUrl?: string | null;
  isMember: boolean;
  title: string;
  mediaType: "image" | "gif" | "video";
  width?: number | null;
  height?: number | null;
}

export function ArtworkLightbox({
  publicMediaUrl,
  masterMediaUrl,
  isMember,
  title,
  mediaType,
}: ArtworkLightboxProps) {
  const [zoomLevel, setZoomLevel] = useState(1);
  const [useMasterQuality, setUseMasterQuality] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const activeMediaUrl = useMasterQuality && masterMediaUrl ? masterMediaUrl : publicMediaUrl;

  const handleZoomIn = () => setZoomLevel((prev) => Math.min(prev + 0.5, 4));
  const handleZoomOut = () => setZoomLevel((prev) => Math.max(prev - 0.5, 0.5));
  const handleResetZoom = () => setZoomLevel(1);

  // Accessible keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.key === "+" || e.key === "=") {
        e.preventDefault();
        handleZoomIn();
      } else if (e.key === "-" || e.key === "_") {
        e.preventDefault();
        handleZoomOut();
      } else if (e.key === "0") {
        e.preventDefault();
        handleResetZoom();
      } else if (e.key === "Escape" && isFullscreen) {
        setIsFullscreen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isFullscreen]);

  return (
    <div
      className={`flex flex-col gap-3 transition-all ${
        isFullscreen ? "fixed inset-0 z-50 bg-black/95 p-6 flex items-center justify-center" : ""
      }`}
    >
      {/* Lightbox Canvas Container */}
      <div className="relative w-full min-h-[420px] max-h-[78vh] bg-black/70 rounded-3xl overflow-hidden flex items-center justify-center border border-white/10 select-none shadow-2xl">
        {mediaType === "video" ? (
          <video
            src={activeMediaUrl}
            controls
            autoPlay
            muted
            loop
            playsInline
            aria-label={`Pemutar video karya: ${title}`}
            className="max-h-[72vh] w-auto max-w-full rounded-2xl object-contain"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center p-4 overflow-hidden cursor-grab active:cursor-grabbing">
            <motion.img
              src={activeMediaUrl}
              alt={title}
              drag={zoomLevel > 1}
              dragConstraints={{ left: -300, right: 300, top: -200, bottom: 200 }}
              animate={{ scale: zoomLevel }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="max-h-[72vh] w-auto max-w-full object-contain rounded-xl shadow-2xl pointer-events-auto"
              draggable={false}
            />
          </div>
        )}

        {/* Quality Variant Capsule (Top-Left) */}
        <div className="absolute top-3 left-3 sm:top-4 sm:left-4 z-10 flex items-center gap-2">
          {isMember && masterMediaUrl ? (
            <div className="flex items-center gap-1 p-1 rounded-2xl bg-black/80 backdrop-blur-md border border-white/15 text-xs font-mono">
              <button
                type="button"
                onClick={() => setUseMasterQuality(false)}
                className={`px-3 py-2 min-h-[44px] rounded-xl transition-all cursor-pointer ${
                  !useMasterQuality
                    ? "bg-amber-500 text-black font-bold shadow-sm"
                    : "text-zinc-400 hover:text-white"
                }`}
              >
                <span className="hidden sm:inline">Watermarked Preview</span>
                <span className="sm:hidden">Preview</span>
              </button>
              <button
                type="button"
                onClick={() => setUseMasterQuality(true)}
                className={`px-3 py-2 min-h-[44px] rounded-xl transition-all flex items-center gap-1.5 cursor-pointer ${
                  useMasterQuality
                    ? "bg-amber-500 text-black font-bold shadow-sm"
                    : "text-zinc-400 hover:text-white"
                }`}
              >
                <Sparkles className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Master Quality</span>
                <span className="sm:hidden">Master</span>
              </button>
            </div>
          ) : (
            <span className="px-3 py-2 min-h-[44px] rounded-2xl bg-black/80 backdrop-blur-md border border-white/15 text-xs font-mono text-zinc-300 flex items-center gap-1.5">
              <ShieldCheck className="h-4 w-4 text-amber-400" />
              <span className="hidden sm:inline">Versi Publik · Watermarked</span>
              <span className="sm:hidden">Watermarked</span>
            </span>
          )}
        </div>

        {/* Pan/Zoom & Fullscreen Controls (Bottom-Right) */}
        {mediaType === "image" ? (
          <div className="absolute bottom-3 right-3 sm:bottom-4 sm:right-4 z-10 flex items-center gap-1 p-1 rounded-2xl bg-black/80 backdrop-blur-md border border-white/15 text-xs">
            <button
              type="button"
              onClick={handleZoomOut}
              disabled={zoomLevel <= 0.5}
              aria-label="Perkecil zoom tampilan (-)"
              className="p-2.5 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-zinc-400 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-40 cursor-pointer"
            >
              <ZoomOut className="h-4 w-4" />
            </button>
            <span className="font-mono text-xs text-zinc-300 px-2 tabular-nums">
              {Math.round(zoomLevel * 100)}%
            </span>
            <button
              type="button"
              onClick={handleZoomIn}
              disabled={zoomLevel >= 4}
              aria-label="Perbesar zoom tampilan (+)"
              className="p-2.5 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-zinc-400 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-40 cursor-pointer"
            >
              <ZoomIn className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={handleResetZoom}
              aria-label="Reset zoom tampilan (0)"
              className="p-2.5 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-zinc-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            >
              <RotateCcw className="h-4 w-4" />
            </button>

            <div className="h-5 w-px bg-white/20 mx-1" />

            <button
              type="button"
              onClick={() => setIsFullscreen(!isFullscreen)}
              aria-label={isFullscreen ? "Keluar layar penuh" : "Masuk mode layar penuh"}
              className="p-2.5 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-zinc-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            >
              {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
