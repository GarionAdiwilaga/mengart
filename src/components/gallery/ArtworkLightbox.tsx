"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Sparkles,
  ShieldCheck,
  Maximize2,
  Minimize2,
  Film,
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
  width,
  height,
}: ArtworkLightboxProps) {
  const [zoomLevel, setZoomLevel] = useState(1);
  const [useMasterQuality, setUseMasterQuality] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const activeMediaUrl = useMasterQuality && masterMediaUrl ? masterMediaUrl : publicMediaUrl;

  const handleZoomIn = () => setZoomLevel((prev) => Math.min(prev + 0.5, 4));
  const handleZoomOut = () => setZoomLevel((prev) => Math.max(prev - 0.5, 0.5));
  const handleResetZoom = () => setZoomLevel(1);

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
        <div className="absolute top-4 left-4 z-10 flex items-center gap-2">
          {isMember && masterMediaUrl ? (
            <div className="flex items-center gap-1 p-1 rounded-2xl bg-black/80 backdrop-blur-md border border-white/15 text-xs font-mono">
              <button
                onClick={() => setUseMasterQuality(false)}
                className={`px-3 py-1 rounded-xl transition-all cursor-pointer ${
                  !useMasterQuality
                    ? "bg-amber-500 text-black font-bold shadow-sm"
                    : "text-zinc-400 hover:text-white"
                }`}
              >
                Watermarked Preview
              </button>
              <button
                onClick={() => setUseMasterQuality(true)}
                className={`px-3 py-1 rounded-xl transition-all flex items-center gap-1 cursor-pointer ${
                  useMasterQuality
                    ? "bg-amber-500 text-black font-bold shadow-sm"
                    : "text-zinc-400 hover:text-white"
                }`}
              >
                <Sparkles className="h-3 w-3" />
                <span>Master Quality</span>
              </button>
            </div>
          ) : (
            <span className="px-3.5 py-1.5 rounded-2xl bg-black/80 backdrop-blur-md border border-white/15 text-xs font-mono text-zinc-300 flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5 text-amber-400" />
              <span>Versi Publik · Watermarked</span>
            </span>
          )}
        </div>

        {/* Pan/Zoom & Fullscreen Controls (Bottom-Right) */}
        {mediaType === "image" ? (
          <div className="absolute bottom-4 right-4 z-10 flex items-center gap-1 p-1.5 rounded-2xl bg-black/80 backdrop-blur-md border border-white/15 text-xs">
            <button
              onClick={handleZoomOut}
              disabled={zoomLevel <= 0.5}
              title="Zoom Out"
              className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-40 cursor-pointer"
            >
              <ZoomOut className="h-4 w-4" />
            </button>
            <span className="font-mono text-xs text-zinc-300 px-2 tabular-nums">
              {Math.round(zoomLevel * 100)}%
            </span>
            <button
              onClick={handleZoomIn}
              disabled={zoomLevel >= 4}
              title="Zoom In"
              className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-40 cursor-pointer"
            >
              <ZoomIn className="h-4 w-4" />
            </button>
            <button
              onClick={handleResetZoom}
              title="Reset Zoom"
              className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            >
              <RotateCcw className="h-4 w-4" />
            </button>

            <div className="h-4 w-px bg-white/20 mx-1" />

            <button
              onClick={() => setIsFullscreen(!isFullscreen)}
              title={isFullscreen ? "Keluar Fullscreen" : "Mode Fullscreen"}
              className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            >
              {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
