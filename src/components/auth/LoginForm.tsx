"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { Loader2, ArrowRight, AlertCircle } from "lucide-react";
import Link from "next/link";
import { loginWithCredentialsAction } from "@/app/actions/auth";

interface LoginFormProps {
  initialError?: string;
}

export function LoginForm({ initialError }: LoginFormProps) {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(() => {
    if (initialError === "InviteRequired") {
      return "Undangan dibutuhkan. Mengart adalah komunitas berbasis undangan (invite-only). Silakan masukkan kode undangan untuk mendaftar.";
    } else if (initialError === "AccountSuspended") {
      return "Akun Anda sedang ditangguhkan. Silakan hubungi moderator komunitas.";
    } else if (initialError === "AccountRevoked") {
      return "Akses keanggotaan Anda telah dicabut.";
    } else if (initialError === "EmailNotVerified") {
      return "Email Anda belum diverifikasi. Silakan periksa email Anda atau buka halaman verifikasi.";
    } else if (initialError === "CredentialsSignin") {
      return "Email/Username atau password salah.";
    }
    return null;
  });

  const handleCredentialsLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!identifier.trim() || !password) return;

    setIsLoading(true);
    setError(null);

    const formData = new FormData();
    formData.append("identifier", identifier.trim());
    formData.append("password", password);

    try {
      const res = await loginWithCredentialsAction(formData);
      if (res && !res.success) {
        setError(res.error || "Email/username atau kata sandi tidak cocok.");
        setIsLoading(false);
      } else {
        window.location.href = "/dashboard";
      }
    } catch (err: any) {
      if (err?.message?.includes("NEXT_REDIRECT")) {
        window.location.href = "/dashboard";
        return;
      }
      setError(err?.message || "Gagal masuk. Silakan coba kembali.");
      setIsLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setIsGoogleLoading(true);
    setError(null);
    try {
      await signIn("google", { callbackUrl: "/dashboard" });
    } catch (err: any) {
      setError(err?.message || "Gagal menghubungkan Google.");
      setIsGoogleLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      {error ? (
        <div className="p-3.5 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs flex items-start gap-2.5">
          <AlertCircle className="h-4 w-4 shrink-0 text-red-400 mt-0.5" />
          <span className="leading-relaxed">{error}</span>
        </div>
      ) : null}

      {/* Google OAuth Button */}
      <button
        type="button"
        onClick={handleGoogleLogin}
        disabled={isGoogleLoading || isLoading}
        className="w-full py-3.5 px-4 rounded-xl bg-white text-zinc-900 font-semibold text-sm hover:bg-zinc-100 transition-all duration-200 shadow-md flex items-center justify-center gap-3 cursor-pointer disabled:opacity-50"
      >
        {isGoogleLoading ? (
          <Loader2 className="h-4 w-4 animate-spin text-zinc-800" />
        ) : (
          <svg className="h-4 w-4" viewBox="0 0 24 24">
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
            />
          </svg>
        )}
        <span>Masuk dengan Google</span>
      </button>

      {/* Divider */}
      <div className="flex items-center gap-3 my-1">
        <div className="flex-1 h-px bg-white/10" />
        <span className="text-[11px] font-mono text-zinc-500 uppercase">atau dengan email</span>
        <div className="flex-1 h-px bg-white/10" />
      </div>

      {/* Email & Password Form */}
      <form onSubmit={handleCredentialsLogin} className="flex flex-col gap-3.5">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-mono text-zinc-300">EMAIL ATAU USERNAME</label>
          <input
            type="text"
            name="identifier"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            placeholder="admin@mengart.local / admin_atelier"
            required
            className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-zinc-600 focus:outline-none focus:border-amber-500/60 text-sm font-sans"
          />
        </div>

        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <label className="text-xs font-mono text-zinc-300">PASSWORD</label>
            <Link
              href="/forgot-password"
              className="text-[11px] font-mono text-amber-400 hover:text-amber-300 transition-colors"
            >
              Lupa Password?
            </Link>
          </div>
          <input
            type="password"
            name="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required
            className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-zinc-600 focus:outline-none focus:border-amber-500/60 text-sm font-sans"
          />
        </div>

        <button
          type="submit"
          disabled={isLoading || isGoogleLoading}
          className="w-full mt-2 py-3.5 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-sm transition-all duration-200 shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
        >
          {isLoading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin text-black" />
              <span>Memverifikasi Akun...</span>
            </>
          ) : (
            <>
              <span>Masuk ke Atelier</span>
              <ArrowRight className="h-4 w-4 text-black" />
            </>
          )}
        </button>
      </form>
    </div>
  );
}
