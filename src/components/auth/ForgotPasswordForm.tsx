"use client";

import { useState } from "react";
import { requestPasswordResetAction } from "@/app/actions/auth";
import { Loader2, Mail, CheckCircle2, AlertCircle, ArrowRight } from "lucide-react";
import Link from "next/link";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    setIsLoading(true);
    setError(null);

    const res = await requestPasswordResetAction(email.trim());
    setIsLoading(false);

    if (res.success) {
      setIsSuccess(true);
    } else {
      setError((res as any).error || "Gagal mengirimkan instruksi reset.");
    }
  };

  if (isSuccess) {
    return (
      <div className="flex flex-col items-center text-center gap-5 p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-zinc-200">
        <CheckCircle2 className="h-10 w-10 text-emerald-400" />
        <div className="flex flex-col gap-1">
          <h3 className="font-display font-bold text-lg text-emerald-300">Tautan Terkirim!</h3>
          <p className="text-xs text-zinc-300 leading-relaxed max-w-sm">
            Jika email <strong className="text-white">{email}</strong> terdaftar, kami telah mengirimkan instruksi dan tautan untuk memperbarui password Anda.
          </p>
        </div>
        <Link
          href="/login"
          className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs transition-all shadow-md shadow-amber-500/20"
        >
          Kembali ke Halaman Login
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {error ? (
        <div className="p-3.5 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
          <span>{error}</span>
        </div>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-mono text-zinc-300">ALAMAT EMAIL TERDAFTAR</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="artist@example.com"
          required
          className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-zinc-600 focus:outline-none focus:border-amber-500/60 text-sm font-sans"
        />
      </div>

      <button
        type="submit"
        disabled={isLoading}
        className="w-full mt-2 py-3.5 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-sm transition-all duration-200 shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
      >
        {isLoading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin text-black" />
            <span>Mengirim Instruksi...</span>
          </>
        ) : (
          <>
            <Mail className="h-4 w-4 text-black" />
            <span>Kirim Tautan Reset Password</span>
            <ArrowRight className="h-4 w-4 text-black" />
          </>
        )}
      </button>
    </form>
  );
}
