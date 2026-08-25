"use client";

import { useState } from "react";
import { Ban, AlertTriangle, Loader2, X } from "lucide-react";
import { revokeInviteAction } from "@/app/actions/invites";

interface RevokeInviteButtonProps {
  inviteId: string;
  tokenPrefix: string;
}

export function RevokeInviteButton({ inviteId, tokenPrefix }: RevokeInviteButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRevoke = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) {
      setError("Silakan berikan alasan pencabutan (wajib untuk pencatatan audit log).");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      await revokeInviteAction({
        inviteId,
        reason: reason.trim(),
      });
      setIsOpen(false);
    } catch (err: any) {
      setError(err?.message || "Gagal mencabut undangan");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        title="Cabut Undangan"
        className="px-2.5 py-1 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs font-mono transition-colors inline-flex items-center gap-1 border border-red-500/20 cursor-pointer"
      >
        <Ban className="h-3 w-3" />
        <span>Cabut</span>
      </button>

      {isOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="w-full max-w-md glass-panel-elevated p-6 rounded-3xl flex flex-col gap-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-red-400">
                <AlertTriangle className="h-5 w-5" />
                <h3 className="font-display font-bold text-base text-white">
                  Cabut Undangan ({tokenPrefix}...)
                </h3>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1.5 rounded-lg text-zinc-400 hover:text-white transition-colors cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="text-xs text-zinc-400 leading-relaxed">
              Mencabut undangan ini akan langsung menonaktifkannya. Anggota yang telah terdaftar sebelumnya tetap memiliki akun aktif, tetapi tidak ada pendaftaran baru yang dapat menggunakan tautan ini.
            </p>

            <form onSubmit={handleRevoke} className="flex flex-col gap-4">
              {error ? (
                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-xs">
                  {error}
                </div>
              ) : null}

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-mono text-zinc-300">
                  ALASAN PENCABUTAN (TERCATAT DI AUDIT LOG)
                </label>
                <input
                  type="text"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="contoh: Event berakhir, Tautan tersebar publik secara tidak sengaja"
                  required
                  maxLength={500}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-zinc-600 focus:outline-none focus:border-red-500/50 text-sm font-sans"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 mt-2">
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-300 text-xs font-medium transition-colors cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="px-4 py-2 rounded-xl bg-red-500 hover:bg-red-600 text-white text-xs font-bold transition-all shadow-md shadow-red-500/20 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      <span>Mencabut...</span>
                    </>
                  ) : (
                    <>
                      <Ban className="h-3.5 w-3.5" />
                      <span>Konfirmasi Pencabutan</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
