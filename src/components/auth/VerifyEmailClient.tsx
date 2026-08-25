"use client";

import { useState, useEffect } from "react";
import { verifyEmailAction, resendVerificationEmailAction } from "@/app/actions/auth";
import { CheckCircle2, AlertCircle, Loader2, Mail, ArrowRight, RefreshCw } from "lucide-react";
import Link from "next/link";

interface VerifyEmailClientProps {
  initialToken?: string;
  initialEmail?: string;
}

export function VerifyEmailClient({ initialToken, initialEmail }: VerifyEmailClientProps) {
  const [token, setToken] = useState(initialToken || "");
  const [email, setEmail] = useState(initialEmail || "");
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Resend state
  const [resendEmail, setResendEmail] = useState(initialEmail || "");
  const [isResending, setIsResending] = useState(false);
  const [resendSuccess, setResendSuccess] = useState(false);
  const [resendError, setResendError] = useState<string | null>(null);

  useEffect(() => {
    if (initialToken && initialEmail) {
      handleAutoVerify(initialToken, initialEmail);
    }
  }, [initialToken, initialEmail]);

  const handleAutoVerify = async (tok: string, mail: string) => {
    setIsLoading(true);
    setError(null);

    const res = await verifyEmailAction(tok, mail);
    setIsLoading(false);

    if (res.success) {
      setIsSuccess(true);
    } else {
      setError(res.error || "Gagal memverifikasi email.");
    }
  };

  const handleManualVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    await handleAutoVerify(token, email);
  };

  const handleResend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resendEmail.trim()) return;

    setIsResending(true);
    setResendError(null);
    setResendSuccess(false);

    const res = await resendVerificationEmailAction(resendEmail.trim());
    setIsResending(false);

    if (res.success) {
      setResendSuccess(true);
    } else {
      setResendError(res.error || "Gagal mengirim ulang verifikasi.");
    }
  };

  if (isSuccess) {
    return (
      <div className="flex flex-col items-center text-center gap-6 p-6 rounded-3xl bg-emerald-500/10 border border-emerald-500/30 animate-in fade-in zoom-in-95 duration-200">
        <div className="h-16 w-16 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
          <CheckCircle2 className="h-8 w-8" />
        </div>

        <div className="flex flex-col gap-2">
          <h2 className="font-display font-bold text-2xl text-[#f6f2e9]">
            Email Berhasil Diverifikasi!
          </h2>
          <p className="text-xs text-zinc-300 max-w-sm leading-relaxed">
            Akun atelier Anda kini telah aktif. Anda dapat langsung masuk menggunakan email dan password Anda.
          </p>
        </div>

        <Link
          href="/login"
          className="w-full py-3.5 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-sm transition-all duration-200 shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2"
        >
          <span>Masuk ke Akun Sekarang</span>
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {isLoading ? (
        <div className="flex flex-col items-center justify-center p-8 gap-4 text-center">
          <Loader2 className="h-8 w-8 animate-spin text-amber-400" />
          <span className="text-xs font-mono text-zinc-300">Memverifikasi token email Anda...</span>
        </div>
      ) : (
        <>
          {error ? (
            <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs flex items-center gap-2.5">
              <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
              <span>{error}</span>
            </div>
          ) : null}

          {/* Form input token manually if not auto-verified */}
          {!initialToken ? (
            <form onSubmit={handleManualVerify} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-mono text-zinc-300">ALAMAT EMAIL</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="artist@example.com"
                  required
                  className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-zinc-600 focus:outline-none focus:border-amber-500/60 text-sm font-sans"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-mono text-zinc-300">KODE / TOKEN VERIFIKASI</label>
                <input
                  type="text"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="Masukkan token dari email..."
                  required
                  className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-zinc-600 focus:outline-none focus:border-amber-500/60 text-sm font-mono"
                />
              </div>

              <button
                type="submit"
                className="w-full py-3.5 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-sm transition-all duration-200 shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2 cursor-pointer"
              >
                <span>Verifikasi Email Saya</span>
                <ArrowRight className="h-4 w-4" />
              </button>
            </form>
          ) : null}

          {/* Resend Verification Section */}
          <div className="pt-6 border-t border-white/10 flex flex-col gap-4">
            <span className="text-xs font-mono text-zinc-400">
              Belum menerima email verifikasi atau token kedaluwarsa?
            </span>

            {resendSuccess ? (
              <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                <span>Tautan verifikasi baru telah dikirimkan!</span>
              </div>
            ) : null}

            {resendError ? (
              <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs">
                {resendError}
              </div>
            ) : null}

            <form onSubmit={handleResend} className="flex gap-2">
              <input
                type="email"
                value={resendEmail}
                onChange={(e) => setResendEmail(e.target.value)}
                placeholder="artist@example.com"
                required
                className="flex-1 px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-zinc-600 focus:outline-none focus:border-amber-500/60 text-xs font-sans"
              />
              <button
                type="submit"
                disabled={isResending}
                className="px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-zinc-200 hover:text-white text-xs font-mono transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {isResending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
                )}
                <span>Kirim Ulang</span>
              </button>
            </form>
          </div>
        </>
      )}
    </div>
  );
}
