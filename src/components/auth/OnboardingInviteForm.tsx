"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { redeemOnboardingInviteAction } from "@/app/actions/auth";
import { ArrowRight, Loader2, Key, AlertCircle } from "lucide-react";

interface OnboardingInviteFormProps {
  initialError?: string;
  userEmail: string;
  defaultName: string;
}

export function OnboardingInviteForm({
  initialError,
  userEmail,
  defaultName,
}: OnboardingInviteFormProps) {
  const router = useRouter();
  const [inviteCode, setInviteCode] = useState("");
  const [displayName, setDisplayName] = useState(defaultName);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(initialError || null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteCode.trim()) {
      setError("Kode undangan wajib diisi.");
      return;
    }

    setIsLoading(true);
    setError(null);

    const formData = new FormData();
    formData.append("inviteCode", inviteCode.trim());
    formData.append("displayName", displayName.trim());

    try {
      const res = await redeemOnboardingInviteAction(formData);
      if (!res.success) {
        setError(res.error || "Gagal menukarkan kode undangan.");
        setIsLoading(false);
      } else {
        router.push(res.redirectUrl || "/dashboard");
        router.refresh();
      }
    } catch (err: any) {
      setError(err?.message || "Terjadi kesalahan sistem.");
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {error ? (
        <div className="p-3.5 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs flex items-start gap-2.5">
          <AlertCircle className="h-4 w-4 shrink-0 text-red-400 mt-0.5" />
          <span className="leading-relaxed">{error}</span>
        </div>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-mono text-zinc-300">KODE ATAU TAUTAN UNDANGAN</label>
        <div className="relative">
          <Key className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
          <input
            type="text"
            value={inviteCode}
            onChange={(e) => setInviteCode(e.target.value)}
            placeholder="Contoh: inv_a7K9xQ2v atau https://mengart.id/invite/..."
            className="w-full py-2.5 pl-10 pr-3.5 rounded-xl bg-white/[0.04] border border-white/10 text-sm text-[#f6f2e9] placeholder:text-zinc-600 focus:outline-none focus:border-amber-500/50 transition-colors font-mono"
            required
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-mono text-zinc-300">NAMA ARTIST / DISPLAY NAME</label>
        <input
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="Nama tampilan di atelier"
          className="w-full py-2.5 px-3.5 rounded-xl bg-white/[0.04] border border-white/10 text-sm text-[#f6f2e9] placeholder:text-zinc-600 focus:outline-none focus:border-amber-500/50 transition-colors font-sans"
        />
      </div>

      <button
        type="submit"
        disabled={isLoading}
        className="w-full mt-2 py-3.5 px-4 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black text-sm font-semibold transition-all shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin text-black" />
        ) : (
          <>
            <span>Aktifkan Keanggotaan</span>
            <ArrowRight className="h-4 w-4 text-black" />
          </>
        )}
      </button>
    </form>
  );
}
