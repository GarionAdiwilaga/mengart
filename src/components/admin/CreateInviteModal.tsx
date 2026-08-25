"use client";

import { useState } from "react";
import { Plus, X, Copy, Check, Sparkles, Key, AlertCircle, Loader2 } from "lucide-react";
import { createInviteAction } from "@/app/actions/invites";
import type { InviteExpiryPreset } from "@/lib/invites";

export function CreateInviteModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [customCode, setCustomCode] = useState("");
  const [expiryPreset, setExpiryPreset] = useState<InviteExpiryPreset>("7d");
  const [maxUses, setMaxUses] = useState<number | "unlimited">(1);
  const [isLoading, setIsLoading] = useState(false);
  const [generatedInvite, setGeneratedInvite] = useState<{
    inviteUrl: string;
    tokenPrefix: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);
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
          inviteUrl: res.invite.inviteUrl,
          tokenPrefix: res.invite.tokenPrefix,
        });
      }
    } catch (err: any) {
      setError(err?.message || "Gagal membuat tautan undangan");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!generatedInvite) return;
    await navigator.clipboard.writeText(generatedInvite.inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleClose = () => {
    setIsOpen(false);
    setGeneratedInvite(null);
    setLabel("");
    setCustomCode("");
    setExpiryPreset("7d");
    setMaxUses(1);
    setError(null);
    setCopied(false);
  };

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-sm font-bold transition-all shadow-md shadow-amber-500/20 flex items-center gap-2 cursor-pointer"
      >
        <Plus className="h-4 w-4" />
        <span>Buat Undangan</span>
      </button>

      {isOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="w-full max-w-lg glass-panel-elevated p-6 sm:p-8 rounded-3xl relative flex flex-col gap-6">
            {/* Modal Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="h-9 w-9 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
                  <Key className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="font-display font-bold text-lg text-white">
                    {generatedInvite ? "Undangan Berhasil Dibuat!" : "Buat Undangan Keanggotaan"}
                  </h3>
                </div>
              </div>
              <button
                onClick={handleClose}
                className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Generated Invite Modal State (Show URL once) */}
            {generatedInvite ? (
              <div className="flex flex-col gap-5">
                <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-3 text-xs text-amber-200">
                  <Sparkles className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                  <p className="leading-relaxed">
                    <strong>Salin tautan ini sekarang.</strong> Demi keamanan, token mentah di-hash dengan SHA-256 dan tidak disimpan di database. Tautan lengkap ini tidak dapat dilihat lagi setelah jendela ditutup.
                  </p>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-mono text-zinc-400">TAUTAN UNDANGAN LENGKAP</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={generatedInvite.inviteUrl}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-black/50 border border-white/15 text-zinc-200 font-mono text-xs focus:outline-none select-all"
                    />
                    <button
                      onClick={handleCopy}
                      className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 cursor-pointer"
                    >
                      {copied ? (
                        <>
                          <Check className="h-4 w-4" />
                          <span>Tersalin</span>
                        </>
                      ) : (
                        <>
                          <Copy className="h-4 w-4" />
                          <span>Salin</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                <button
                  onClick={handleClose}
                  className="w-full py-3 px-4 rounded-xl bg-white/10 hover:bg-white/15 text-white text-sm font-semibold transition-colors mt-2 cursor-pointer"
                >
                  Selesai
                </button>
              </div>
            ) : (
              /* Create Invite Form */
              <form onSubmit={handleCreate} className="flex flex-col gap-4">
                {error ? (
                  <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-xs flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <span>{error}</span>
                  </div>
                ) : null}

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-mono text-zinc-300">LABEL UNDANGAN (OPSIONAL)</label>
                  <input
                    type="text"
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    placeholder="contoh: Komunitas Discord Batch #2, VIP Artist"
                    maxLength={100}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-zinc-600 focus:outline-none focus:border-amber-500/50 text-sm font-sans"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-mono text-zinc-300">KODE KUSTOM / VANITY (OPSIONAL)</label>
                    <span className="text-[10px] font-mono text-zinc-500">contoh: komorebi, vip-atelier</span>
                  </div>
                  <input
                    type="text"
                    value={customCode}
                    onChange={(e) => setCustomCode(e.target.value)}
                    placeholder="Kosongkan untuk kode acak 8 karakter (contoh: a7K9xQ2v)"
                    maxLength={32}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-zinc-600 focus:outline-none focus:border-amber-500/50 text-sm font-mono"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-mono text-zinc-300">MASA BERLAKU</label>
                    <select
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
                    <label className="text-xs font-mono text-zinc-300">BATAS PENGGUNAAN</label>
                    <select
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
                    className="px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-300 text-sm font-medium transition-colors cursor-pointer"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={isLoading}
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
                        <span>Buat Tautan</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
