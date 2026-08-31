"use client";

import { useState, useTransition } from "react";
import { Eye, EyeOff, ShieldAlert, Edit3, Check, X, RotateCcw } from "lucide-react";
import {
  toggleArtworkPortfolioVisibilityAction,
  updatePortfolioCustomCaptionAction,
} from "@/app/actions/artworks";

interface PortfolioItemActionsProps {
  artworkId: string;
  initialIsVisible: boolean;
  isSpoiler: boolean;
  systemCaption?: string | null;
  initialCustomCaption?: string | null;
}

export function PortfolioItemActions({
  artworkId,
  initialIsVisible,
  isSpoiler,
  systemCaption = null,
  initialCustomCaption = null,
}: PortfolioItemActionsProps) {
  const [isVisible, setIsVisible] = useState(initialIsVisible);
  const [customCaption, setCustomCaption] = useState<string | null>(initialCustomCaption);
  const [isEditingCaption, setIsEditingCaption] = useState(false);
  const [captionDraft, setCaptionDraft] = useState(initialCustomCaption || "");
  const [isPending, startTransition] = useTransition();

  const effectiveCaption = customCaption?.trim() || systemCaption || null;

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

  const handleSaveCustomCaption = () => {
    startTransition(async () => {
      try {
        const payload = captionDraft.trim() ? captionDraft.trim() : null;
        await updatePortfolioCustomCaptionAction(artworkId, payload);
        setCustomCaption(payload);
        setIsEditingCaption(false);
      } catch (err: any) {
        alert(err.message || "Gagal memperbarui custom caption.");
      }
    });
  };

  const handleResetToSystemCaption = () => {
    startTransition(async () => {
      try {
        await updatePortfolioCustomCaptionAction(artworkId, null);
        setCustomCaption(null);
        setCaptionDraft("");
        setIsEditingCaption(false);
      } catch (err: any) {
        alert(err.message || "Gagal mereset custom caption.");
      }
    });
  };

  return (
    <div className="flex flex-col gap-2 w-full">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1.5">
          {isSpoiler && (
            <span className="px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 text-[10px] font-mono border border-amber-500/30 flex items-center gap-1">
              <ShieldAlert className="h-3 w-3" /> SPOILER
            </span>
          )}

          <button
            onClick={handleToggleVisibility}
            disabled={isPending}
            title={isVisible ? "Sembunyikan dari galeri/profil publik" : "Tampilkan di galeri/profil publik"}
            className={`px-2 py-1 rounded-md text-[11px] font-mono flex items-center gap-1 transition-colors ${
              isVisible
                ? "bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-white"
                : "bg-red-500/20 text-red-300 border border-red-500/30 hover:bg-red-500/30"
            }`}
          >
            {isVisible ? (
              <>
                <Eye className="h-3.5 w-3.5 text-emerald-400" /> Publik
              </>
            ) : (
              <>
                <EyeOff className="h-3.5 w-3.5 text-red-400" /> Tersembunyi
              </>
            )}
          </button>

          <button
            onClick={() => {
              setCaptionDraft(customCaption || "");
              setIsEditingCaption(!isEditingCaption);
            }}
            disabled={isPending}
            title="Edit teks keterangan / custom caption"
            className={`px-2 py-1 rounded-md text-[11px] font-mono flex items-center gap-1 transition-colors ${
              customCaption
                ? "bg-amber-500/20 text-amber-300 border border-amber-500/40 hover:bg-amber-500/30"
                : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200"
            }`}
          >
            <Edit3 className="h-3 w-3" /> {customCaption ? "Caption Kustom" : "Edit Caption"}
          </button>
        </div>
      </div>

      {/* Inline Custom Caption Editor */}
      {isEditingCaption && (
        <div className="mt-2 p-3 rounded-xl bg-black/60 border border-white/10 flex flex-col gap-2.5 text-xs">
          <div className="flex items-center justify-between">
            <span className="font-mono font-semibold text-[11px] text-zinc-300">
              Kustomisasi Teks Portofolio
            </span>
            <button
              onClick={() => setIsEditingCaption(false)}
              className="text-zinc-500 hover:text-zinc-300"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {systemCaption && (
            <div className="p-2 rounded-lg bg-zinc-900/80 border border-white/5 text-[11px] text-zinc-400">
              <span className="font-mono text-zinc-500 block text-[10px]">Teks Sistem / Penghargaan:</span>
              <span className="text-amber-400/90 font-medium">{systemCaption}</span>
            </div>
          )}

          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-zinc-400 font-mono">
              Custom Caption (Override oleh Artis):
            </label>
            <input
              type="text"
              value={captionDraft}
              onChange={(e) => setCaptionDraft(e.target.value)}
              placeholder={systemCaption || "Tulis keterangan portofolio Anda..."}
              maxLength={150}
              className="w-full px-2.5 py-1.5 rounded-lg bg-zinc-900 border border-white/10 text-white text-xs placeholder:text-zinc-600 focus:outline-none focus:border-amber-500/50"
            />
          </div>

          <div className="flex items-center justify-between pt-1">
            {customCaption ? (
              <button
                type="button"
                onClick={handleResetToSystemCaption}
                disabled={isPending}
                className="text-[11px] font-mono text-zinc-400 hover:text-red-300 flex items-center gap-1"
              >
                <RotateCcw className="h-3 w-3" /> Reset ke Sistem
              </button>
            ) : (
              <span className="text-[10px] font-mono text-zinc-500">Maksimal 150 karakter</span>
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsEditingCaption(false)}
                className="px-2.5 py-1 rounded-md text-[11px] font-mono text-zinc-400 hover:text-white"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleSaveCustomCaption}
                disabled={isPending}
                className="px-3 py-1 rounded-md bg-amber-500 text-zinc-950 font-bold text-[11px] font-mono hover:bg-amber-400 transition-colors flex items-center gap-1"
              >
                <Check className="h-3 w-3" /> Simpan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
