"use client";

import { useState } from "react";
import { Plus, Copy, Check, Sparkles, Key, AlertCircle, Loader2, KeyRound } from "lucide-react";
import { createInviteAction } from "@/app/actions/invites";
import type { InviteExpiryPreset } from "@/lib/invites";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/AccessibleDialog";

export function CreateInviteModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [customCode, setCustomCode] = useState("");
  const [expiryPreset, setExpiryPreset] = useState<InviteExpiryPreset>("7d");
  const [maxUses, setMaxUses] = useState<number | "unlimited">(1);
  const [isLoading, setIsLoading] = useState(false);
  const [generatedInvite, setGeneratedInvite] = useState<{
    code: string;
    inviteUrl: string;
  } | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const res = await createInviteAction({
        label: label.trim() || undefined,
        customCode: customCode.trim() || undefined,
        expiryPreset,
        maxUses: maxUses === "unlimited" ? null : Number(maxUses),
      });

      if (res.success && res.invite) {
        setGeneratedInvite({
          code: res.invite.code,
          inviteUrl: res.invite.inviteUrl,
        });
      }
    } catch (err: any) {
      setError(err?.message || "Gagal membuat undangan");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyLink = async () => {
    if (!generatedInvite) return;
    await navigator.clipboard.writeText(generatedInvite.inviteUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleCopyCode = async () => {
    if (!generatedInvite) return;
    await navigator.clipboard.writeText(generatedInvite.code);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleClose = () => {
    setIsOpen(false);
    setGeneratedInvite(null);
    setLabel("");
    setCustomCode("");
    setExpiryPreset("7d");
    setMaxUses(1);
    setError(null);
    setCopiedLink(false);
    setCopiedCode(false);
  };

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        aria-label="Buka dialog pembuatan tautan undangan anggota baru"
        className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-sm font-bold transition-all shadow-md shadow-amber-500/20 flex items-center gap-2 cursor-pointer"
      >
        <Plus className="h-4 w-4" />
        <span>Buat Undangan</span>
      </button>

      <Dialog open={isOpen} onOpenChange={(open) => (!open ? handleClose() : setIsOpen(true))}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <div className="flex items-center gap-2.5">
              <div className="h-9 w-9 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
                <Key className="h-4 w-4" />
              </div>
              <div>
                <DialogTitle>
                  {generatedInvite ? "Undangan Berhasil Dibuat!" : "Buat Undangan Keanggotaan"}
                </DialogTitle>
                <DialogDescription>
                  {generatedInvite
                    ? "Salin kode atau tautan undangan untuk dibagikan kepada calon anggota."
                    : "Buat kode acak 8-karakter atau kustomisasi kode undangan (vanity code)."}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {/* Generated Invite Modal State */}
          {generatedInvite ? (
            <div className="flex flex-col gap-5 pt-2">
              <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-3 text-xs text-amber-200">
                <Sparkles className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                <p className="leading-relaxed">
                  Undangan aktif dan tersimpan. Anda dapat menyalin kode atau membagikan tautan undangan langsung ke calon anggota atelier.
                </p>
              </div>

              {/* Code display */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-mono text-zinc-400">
                  KODE UNDANGAN
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={generatedInvite.code}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-black/50 border border-white/15 text-amber-300 font-mono font-bold text-sm focus:outline-none select-all tracking-wider"
                  />
                  <button
                    onClick={handleCopyCode}
                    aria-label="Salin kode undangan"
                    className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 cursor-pointer"
                  >
                    {copiedCode ? (
                      <>
                        <Check className="h-4 w-4" />
                        <span>Tersalin</span>
                      </>
                    ) : (
                      <>
                        <KeyRound className="h-4 w-4" />
                        <span>Salin Kode</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* URL display */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-mono text-zinc-400">
                  TAUTAN LENGKAP
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={generatedInvite.inviteUrl}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-black/50 border border-white/15 text-zinc-200 font-mono text-xs focus:outline-none select-all"
                  />
                  <button
                    onClick={handleCopyLink}
                    aria-label="Salin tautan undangan ke clipboard"
                    className="px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 cursor-pointer"
                  >
                    {copiedLink ? (
                      <>
                        <Check className="h-4 w-4" />
                        <span>Tersalin</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-4 w-4" />
                        <span>Salin Tautan</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              <button
                onClick={handleClose}
                aria-label="Tutup jendela undangan"
                className="w-full py-3 px-4 rounded-xl bg-white/10 hover:bg-white/15 text-white text-sm font-semibold transition-colors mt-2 cursor-pointer"
              >
                Selesai
              </button>
            </div>
          ) : (
            /* Create Invite Form */
            <form onSubmit={handleCreate} className="flex flex-col gap-4 pt-2">
              {error ? (
                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-xs flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </div>
              ) : null}

              <div className="flex flex-col gap-1.5">
                <label htmlFor="invite-code" className="text-xs font-mono text-zinc-300">
                  KODE KUSTOM / VANITY (OPSIONAL)
                </label>
                <input
                  id="invite-code"
                  type="text"
                  value={customCode}
                  onChange={(e) => setCustomCode(e.target.value)}
                  placeholder="Kosongkan untuk auto-generate kode 8 karakter (misal: mengart-bali)"
                  maxLength={25}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-zinc-600 focus:outline-none focus:border-amber-500/50 text-sm font-mono"
                />
                <p className="text-[11px] text-zinc-500 font-sans">
                  Huruf kecil, angka, tanda hubung (-) hingga 25 karakter. Jika kosong, kode 8-karakter CSPRNG akan digenerate otomatis.
                </p>
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="invite-label" className="text-xs font-mono text-zinc-300">
                  LABEL PERUNTUKAN (OPSIONAL)
                </label>
                <input
                  id="invite-label"
                  type="text"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="contoh: Komunitas Discord Batch #2, Bali Art Summit 2026"
                  maxLength={100}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-zinc-600 focus:outline-none focus:border-amber-500/50 text-sm font-sans"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="invite-expiry-preset" className="text-xs font-mono text-zinc-300">
                    MASA BERLAKU
                  </label>
                  <select
                    id="invite-expiry-preset"
                    value={expiryPreset}
                    onChange={(e) => setExpiryPreset(e.target.value as InviteExpiryPreset)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#181c26] border border-white/10 text-white focus:outline-none focus:border-amber-500/50 text-sm font-sans"
                  >
                    <option value="30m">30 Menit</option>
                    <option value="1h">1 Jam</option>
                    <option value="6h">6 Jam</option>
                    <option value="12h">12 Jam</option>
                    <option value="1d">1 Hari</option>
                    <option value="7d">7 Hari (Default)</option>
                    <option value="never">Tanpa Kedaluwarsa</option>
                  </select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label htmlFor="invite-max-uses" className="text-xs font-mono text-zinc-300">
                    BATAS PENGGUNAAN
                  </label>
                  <select
                    id="invite-max-uses"
                    value={maxUses}
                    onChange={(e) =>
                      setMaxUses(
                        e.target.value === "unlimited" ? "unlimited" : Number(e.target.value)
                      )
                    }
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#181c26] border border-white/10 text-white focus:outline-none focus:border-amber-500/50 text-sm font-sans"
                  >
                    <option value={1}>1 Kali Pakai (Single-use)</option>
                    <option value={5}>5 Kali</option>
                    <option value={10}>10 Kali</option>
                    <option value={25}>25 Kali</option>
                    <option value={50}>50 Kali</option>
                    <option value="unlimited">Tanpa Batas (Unlimited)</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 mt-4">
                <button
                  type="button"
                  onClick={handleClose}
                  aria-label="Batalkan pembuatan undangan"
                  className="px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-300 text-sm font-medium transition-colors cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isLoading}
                  aria-label="Kirim formulir pembuatan tautan undangan"
                  className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-sm font-bold transition-all shadow-md shadow-amber-500/20 flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin text-black" />
                      <span>Membuat...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4" />
                      <span>Buat Undangan</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
