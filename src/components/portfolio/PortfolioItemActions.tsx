"use client";

import { useState, useTransition } from "react";
import { Eye, EyeOff, ShieldAlert } from "lucide-react";
import { toggleArtworkPortfolioVisibilityAction } from "@/app/actions/artworks";

interface PortfolioItemActionsProps {
  artworkId: string;
  initialIsVisible: boolean;
  isSpoiler: boolean;
}

export function PortfolioItemActions({
  artworkId,
  initialIsVisible,
  isSpoiler,
}: PortfolioItemActionsProps) {
  const [isVisible, setIsVisible] = useState(initialIsVisible);
  const [isPending, startTransition] = useTransition();

  const handleToggleVisibility = () => {
    startTransition(async () => {
      try {
        const nextState = !isVisible;
        await toggleArtworkPortfolioVisibilityAction(artworkId, nextState);
        setIsVisible(nextState);
      } catch (err: any) {
        alert(err.message || "Gagal mengubah visibilitas portofolio.");
      }
    });
  };

  return (
    <div className="flex items-center gap-2">
      {isSpoiler && (
        <span className="px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 text-[10px] font-mono border border-amber-500/30 flex items-center gap-1">
          <ShieldAlert className="h-3 w-3" /> SPOILER
        </span>
      )}
      <button
        onClick={handleToggleVisibility}
        disabled={isPending}
        title={isVisible ? "Sembunyikan dari profil publik" : "Tampilkan di profil publik"}
        className={`px-2 py-1 rounded-md text-[11px] font-mono flex items-center gap-1 transition-colors ${
          isVisible
            ? "bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-white"
            : "bg-red-500/20 text-red-300 border border-red-500/30 hover:bg-red-500/30"
        }`}
      >
        {isVisible ? (
          <>
            <Eye className="h-3.5 w-3.5" /> Publik
          </>
        ) : (
          <>
            <EyeOff className="h-3.5 w-3.5" /> Tersembunyi
          </>
        )}
      </button>
    </div>
  );
}
