"use client";

import { useState } from "react";
import { Plus, X, Copy, Check, Sparkles, Key, AlertCircle, Loader2 } from "lucide-react";
import { createInviteAction } from "@/app/actions/invites";
import type { InviteExpiryPreset } from "@/lib/invites";

export function CreateInviteModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [label, setLabel] = useState("");
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
      setError(err?.message || "Failed to create invitation");
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
        <span>Generate Invite</span>
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
                    {generatedInvite ? "Invitation Generated!" : "Create Membership Invitation"}
                  </h3>
                </div>
              </div>
              <button
                onClick={handleClose}
                className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"
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
                    <strong>Save this URL now.</strong> For maximum security, the raw token is hashed with SHA-256 and never stored in the database. This link cannot be viewed again once closed.
                  </p>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-mono text-zinc-400">FULL INVITATION URL</label>
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
                          <span>Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="h-4 w-4" />
                          <span>Copy</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                <button
                  onClick={handleClose}
                  className="w-full py-3 px-4 rounded-xl bg-white/10 hover:bg-white/15 text-white text-sm font-semibold transition-colors mt-2"
                >
                  Done
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
                  <label className="text-xs font-mono text-zinc-300">OPTIONAL LABEL</label>
                  <input
                    type="text"
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    placeholder="e.g. Artist Cohort #2, Discord VIP"
                    maxLength={100}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-zinc-600 focus:outline-none focus:border-amber-500/50 text-sm font-sans"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-mono text-zinc-300">EXPIRATION PRESET</label>
                    <select
                      value={expiryPreset}
                      onChange={(e) => setExpiryPreset(e.target.value as InviteExpiryPreset)}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-[#181c26] border border-white/10 text-white focus:outline-none focus:border-amber-500/50 text-sm font-sans"
                    >
                      <option value="30m">30 Minutes</option>
                      <option value="1h">1 Hour</option>
                      <option value="6h">6 Hours</option>
                      <option value="12h">12 Hours</option>
                      <option value="1d">1 Day</option>
                      <option value="7d">7 Days (Default)</option>
                      <option value="never">No Expiry</option>
                    </select>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-mono text-zinc-300">MAX REDEMPTIONS</label>
                    <select
                      value={maxUses}
                      onChange={(e) =>
                        setMaxUses(
                          e.target.value === "unlimited" ? "unlimited" : Number(e.target.value)
                        )
                      }
                      className="w-full px-3.5 py-2.5 rounded-xl bg-[#181c26] border border-white/10 text-white focus:outline-none focus:border-amber-500/50 text-sm font-sans"
                    >
                      <option value={1}>1 Use (Single-use)</option>
                      <option value={5}>5 Uses</option>
                      <option value={10}>10 Uses</option>
                      <option value={25}>25 Uses</option>
                      <option value={50}>50 Uses</option>
                      <option value="unlimited">Unlimited Uses</option>
                    </select>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3 mt-4">
                  <button
                    type="button"
                    onClick={handleClose}
                    className="px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-300 text-sm font-medium transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-sm font-bold transition-all shadow-md shadow-amber-500/20 flex items-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin text-black" />
                        <span>Generating...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-4 w-4" />
                        <span>Create Link</span>
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
