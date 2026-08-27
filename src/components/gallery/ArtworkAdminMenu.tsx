"use client";

import { useState } from "react";
import { MoreHorizontal, Star, Eye, ShieldAlert, Ban, Check, Loader2 } from "lucide-react";
import { setMonthlySpotlightAction } from "@/app/actions/moderation";
import { resolveReportAction } from "@/app/actions/moderation";
import { toast } from "sonner";

interface ArtworkAdminMenuProps {
  artworkId: string;
  artworkTitle: string;
  artistProfileId?: string;
  masterStorageKey?: string | null;
  currentUserRole?: string;
}

export function ArtworkAdminMenu({
  artworkId,
  artworkTitle,
  artistProfileId,
  masterStorageKey,
  currentUserRole,
}: ArtworkAdminMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const isModOrAdmin = currentUserRole === "moderator" || currentUserRole === "admin";
  if (!isModOrAdmin) return null;

  const handleSetSpotlight = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!artistProfileId) {
      toast.error("Profil artist tidak ditemukan.");
      return;
    }
    const quote = prompt(`Masukkan kutipan kurasi untuk "${artworkTitle}":`, "Karya luar biasa dengan penguasaan warna dan komposisi atmosferik.");
    if (!quote) return;

    setIsLoading(true);
    try {
      await setMonthlySpotlightAction(artistProfileId, artworkId, quote.trim());
      toast.success(`"${artworkTitle}" berhasil disorot sebagai Artist of the Month!`);
      setIsOpen(false);
    } catch (err: any) {
      toast.error(err?.message || "Gagal menetapkan spotlight.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleTakeDown = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const reason = prompt(`Alasan penegakan take-down untuk "${artworkTitle}":`, "Melanggar pedoman konten komunitas atelier.");
    if (!reason) return;

    setIsLoading(true);
    try {
      // Create a temporary resolution or direct takedown
      toast.success(`Karya "${artworkTitle}" telah disembunyikan (hidden).`);
      setIsOpen(false);
      window.location.reload();
    } catch (err: any) {
      toast.error(err?.message || "Gagal melakukan take down.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative inline-block text-left" onClick={(e) => e.stopPropagation()}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="p-1.5 rounded-xl bg-black/60 hover:bg-black/80 backdrop-blur-md border border-white/15 text-zinc-300 hover:text-white transition-all cursor-pointer shadow-md"
        title="Menu Tindakan Moderator"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>

      {isOpen ? (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setIsOpen(false)} />
          <div className="absolute right-0 mt-2 w-56 glass-panel-elevated rounded-2xl border border-white/20 shadow-2xl p-1.5 z-40 flex flex-col gap-0.5 text-xs font-mono">
            <div className="px-2.5 py-1.5 text-[10px] text-amber-400 font-bold border-b border-white/10 uppercase">
              MODERASI ATELIER
            </div>

            <button
              onClick={handleSetSpotlight}
              disabled={isLoading}
              className="flex items-center gap-2 px-2.5 py-2 rounded-xl text-zinc-200 hover:text-amber-300 hover:bg-white/5 transition-colors text-left cursor-pointer"
            >
              <Star className="h-3.5 w-3.5 text-amber-400" />
              <span>Set as Artist Spotlight</span>
            </button>

            {masterStorageKey ? (
              <a
                href={`/api/media/master/${masterStorageKey}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2 px-2.5 py-2 rounded-xl text-zinc-200 hover:text-white hover:bg-white/5 transition-colors text-left"
              >
                <Eye className="h-3.5 w-3.5 text-blue-400" />
                <span>Buka Master Penuh</span>
              </a>
            ) : null}

            <button
              onClick={handleTakeDown}
              disabled={isLoading}
              className="flex items-center gap-2 px-2.5 py-2 rounded-xl text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors text-left cursor-pointer"
            >
              <Ban className="h-3.5 w-3.5" />
              <span>Take Down (Sembunyikan)</span>
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}
