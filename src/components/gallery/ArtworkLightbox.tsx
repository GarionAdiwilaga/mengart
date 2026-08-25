"use client";

import { useState } from "react";
import { ZoomIn, ZoomOut, RotateCcw, Maximize2, ShieldCheck, Sparkles, Film } from "lucide-react";

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
    <div className="flex flex-col gap-3">
      {/* Lightbox Canvas Container */}
      <div className="relative w-full min-h-[400px] max-h-[75vh] bg-black/60 rounded-3xl overflow-hidden flex items-center justify-center border border-white/10 select-none">
        {mediaType === "video" ? (
          <video
            src={activeMediaUrl}
            controls
            autoPlay
            muted
            loop
            playsInline
            className="max-h-[70vh] w-auto max-w-full rounded-xl object-contain"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center p-4 overflow-auto">
            <img
              src={activeMediaUrl}
              alt={title}
              style={{ transform: `scale(${zoomLevel})`, transition: "transform 0.2s ease-out" }}
              className="max-h-[70vh] w-auto max-w-full object-contain rounded-lg shadow-2xl"
              draggable={false}
            />
          </div>
        )}

        {/* Quality Variant Capsule (Top-Left) */}
        <div className="absolute top-4 left-4 z-10 flex items-center gap-2">
          {isMember && masterMediaUrl ? (
            <div className="flex items-center gap-1.5 p-1 rounded-full bg-black/80 backdrop-blur-md border border-white/15 text-xs font-mono">
              <button
                onClick={() => setUseMasterQuality(false)}
                className={`px-3 py-1 rounded-full transition-all cursor-pointer ${
                  !useMasterQuality
                    ? "bg-amber-500 text-black font-bold"
                    : "text-zinc-400 hover:text-white"
                }`}
              >
                Watermarked Preview
              </button>
              <button
                onClick={() => setUseMasterQuality(true)}
                className={`px-3 py-1 rounded-full transition-all flex items-center gap-1 cursor-pointer ${
                  useMasterQuality
                    ? "bg-amber-500 text-black font-bold"
                    : "text-zinc-400 hover:text-white"
                }`}
              >
                <Sparkles className="h-3 w-3" />
                <span>Master Quality</span>
              </button>
            </div>
          ) : (
            <span className="px-3 py-1.5 rounded-full bg-black/80 backdrop-blur-md border border-white/15 text-xs font-mono text-zinc-300 flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5 text-amber-400" />
              <span>Versi Publik · Watermarked</span>
            </span>
          )}
        </div>

        {/* Pan/Zoom Controls (Bottom-Right) */}
        {mediaType === "image" ? (
          <div className="absolute bottom-4 right-4 z-10 flex items-center gap-1.5 p-1.5 rounded-2xl bg-black/80 backdrop-blur-md border border-white/15 text-xs">
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
          </div>
        ) : null}
      </div>
    </div>
  );
}
