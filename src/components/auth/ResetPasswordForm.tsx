"use client";

import { useState } from "react";
import { resetPasswordAction } from "@/app/actions/auth";
import { Loader2, Lock, CheckCircle2, AlertCircle, ArrowRight } from "lucide-react";
import Link from "next/link";

interface ResetPasswordFormProps {
  token: string;
  initialEmail?: string;
}

export function ResetPasswordForm({ token, initialEmail }: ResetPasswordFormProps) {
  const [email, setEmail] = useState(initialEmail || "");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      setError("Konfirmasi password baru tidak cocok.");
      return;
    }
    if (password.length < 8) {
      setError("Password baru minimal 8 karakter.");
      return;
    }

    setIsLoading(true);
    setError(null);

    const formData = new FormData();
    formData.append("token", token);
    formData.append("email", email.trim());
    formData.append("password", password);
    formData.append("confirmPassword", confirmPassword);

    const res = await resetPasswordAction(formData);
    setIsLoading(false);

    if (res.success) {
      setIsSuccess(true);
    } else {
      setError(res.error || "Gagal mereset password.");
    }
  };

  if (isSuccess) {
    return (
      <div className="flex flex-col items-center text-center gap-5 p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-zinc-200">
        <CheckCircle2 className="h-10 w-10 text-emerald-400" />
        <div className="flex flex-col gap-1">
          <h3 className="font-display font-bold text-lg text-emerald-300">
            Password Berhasil Diperbarui!
          </h3>
          <p className="text-xs text-zinc-300 leading-relaxed">
            Anda kini dapat masuk ke atelier Mengart dengan password baru Anda.
          </p>
        </div>
        <Link
          href="/login"
          className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs transition-all shadow-md shadow-amber-500/20"
        >
          Masuk Sekarang →
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
        <label className="text-xs font-mono text-zinc-300">PASSWORD BARU (MIN 8 KARAKTER)</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          required
          minLength={8}
          className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-zinc-600 focus:outline-none focus:border-amber-500/60 text-sm font-sans"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-mono text-zinc-300">KONFIRMASI PASSWORD BARU</label>
        <input
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          placeholder="••••••••"
          required
          minLength={8}
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
            <span>Menyimpan Password Baru...</span>
          </>
        ) : (
          <>
            <Lock className="h-4 w-4 text-black" />
            <span>Simpan Password Baru</span>
            <ArrowRight className="h-4 w-4 text-black" />
          </>
        )}
      </button>
    </form>
  );
}
