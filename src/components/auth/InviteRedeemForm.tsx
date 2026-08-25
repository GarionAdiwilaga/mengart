"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { ArrowRight, Loader2, Sparkles } from "lucide-react";

interface InviteRedeemFormProps {
  rawToken: string;
}

export function InviteRedeemForm({ rawToken }: InviteRedeemFormProps) {
  const [displayName, setDisplayName] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayName.trim()) {
      setError("Silakan masukkan nama alias atau nama kreator Anda.");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      sessionStorage.setItem("pending_invite_token", rawToken);
      sessionStorage.setItem("pending_artist_name", displayName.trim());

      await signIn("google", {
        callbackUrl: `/api/auth/redeem-callback?token=${encodeURIComponent(
          rawToken
        )}&name=${encodeURIComponent(displayName.trim())}`,
      });
    } catch (err: any) {
      setError(err?.message || "Gagal memulai autentikasi Google. Silakan coba kembali.");
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="displayName" className="text-xs font-mono text-zinc-300">
          ALIAS ARTIST / NAMA TAMPILAN
        </label>
        <input
          id="displayName"
          type="text"
          value={displayName}
          onChange={(e) => {
            setDisplayName(e.target.value);
            if (error) setError(null);
          }}
          placeholder="contoh: Ren Kisaragi, AuraArt"
          required
          maxLength={50}
          className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-zinc-600 focus:outline-none focus:border-amber-500/60 focus:ring-1 focus:ring-amber-500/30 transition-all text-sm font-sans"
        />
      </div>

      {error ? (
        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-xs">
          {error}
        </div>
      ) : null}

      <button
        type="submit"
        disabled={isLoading}
        className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black font-bold text-sm transition-all duration-200 shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isLoading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin text-black" />
            <span>Memverifikasi & Menghubungkan Google...</span>
          </>
        ) : (
          <>
            <Sparkles className="h-4 w-4 text-black" />
            <span>Lanjutkan dengan Google & Bergabung</span>
            <ArrowRight className="h-4 w-4 text-black" />
          </>
        )}
      </button>

      <p className="text-[11px] text-zinc-500 text-center font-sans">
        Dengan melanjutkan, Anda menyetujui panduan komunitas dan ketentuan portofolio.
      </p>
    </form>
  );
}
