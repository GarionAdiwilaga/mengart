"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { Loader2, AlertCircle, ShieldCheck, ShieldAlert, Palette, UserPlus, Sparkles } from "lucide-react";
import { getSafeReturnUrl } from "@/lib/navigation/returnUrl";

interface LoginFormProps {
  initialError?: string;
  initialReturnTo?: string;
}

export function LoginForm({ initialError, initialReturnTo }: LoginFormProps) {
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [activeDevLogin, setActiveDevLogin] = useState<string | null>(null);

  const returnTo = initialReturnTo ? getSafeReturnUrl(initialReturnTo, "") : "";
  const callbackUrl = returnTo
    ? `/api/auth/redeem-callback?returnTo=${encodeURIComponent(returnTo)}`
    : "/api/auth/redeem-callback";

  const initialErrorMessage = (() => {
    if (initialError === "InviteRequired") {
      return "Undangan dibutuhkan. Mengart adalah komunitas berbasis undangan (invite-only). Silakan gunakan tautan undangan resmi untuk bergabung.";
    } else if (initialError === "AccountSuspended") {
      return "Akun Anda sedang ditangguhkan. Silakan hubungi moderator komunitas.";
    } else if (initialError === "AccountDeleted") {
      return "Akun telah dihapus oleh administrator.";
    } else if (initialError === "EmailUnverified") {
      return "Akun Google Anda belum memiliki email yang terverifikasi.";
    } else if (initialError === "AccountCollision") {
      return "Terjadi benturan identitas akun. Pastikan Anda masuk menggunakan akun Google yang terdaftar.";
    } else if (initialError === "AuthRequired") {
      return "Silakan masuk dengan akun Google Anda untuk melanjutkan.";
    }
    return initialError ? `Terjadi kesalahan saat masuk (${initialError}).` : null;
  })();

  const handleGoogleLogin = async () => {
    setIsGoogleLoading(true);
    try {
      await signIn("google", { callbackUrl });
    } catch (err: any) {
      setIsGoogleLoading(false);
    }
  };

  const handleDevLogin = async (email: string) => {
    setActiveDevLogin(email);
    try {
      await signIn("credentials", {
        email,
        callbackUrl,
      });
    } catch (err: any) {
      setActiveDevLogin(null);
    }
  };

  const isDev = process.env.NODE_ENV !== "production";

  return (
    <div className="flex flex-col gap-5">
      {initialErrorMessage ? (
        <div className="p-3.5 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs flex items-start gap-2.5">
          <AlertCircle className="h-4 w-4 shrink-0 text-red-400 mt-0.5" />
          <span className="leading-relaxed">{initialErrorMessage}</span>
        </div>
      ) : null}

      <div className="p-4 rounded-2xl bg-amber-500/[0.04] border border-amber-500/20 text-xs text-zinc-300 leading-relaxed">
        Masuk menggunakan akun Google Anda untuk mengakses ruang atelier, challenge aktif, galeri karya master, dan portofolio artist.
      </div>

      {/* Google OAuth Button */}
      <button
        type="button"
        onClick={handleGoogleLogin}
        disabled={isGoogleLoading || !!activeDevLogin}
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

      {/* Development Quick Role Switcher */}
      {isDev && (
        <div className="mt-2 pt-4 border-t border-white/10 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-[11px] font-mono text-amber-400 font-semibold tracking-wider">
              <Sparkles className="h-3.5 w-3.5" />
              <span>TESTING / DEV QUICK LOGIN</span>
            </div>
            <span className="text-[10px] font-mono text-zinc-500 uppercase">Local Mode</span>
          </div>

          <p className="text-[11px] text-zinc-400 leading-tight">
            Klik salah satu akun di bawah untuk simulasi login instan dengan berbagai role tanpa Google OAuth:
          </p>

          <div className="grid grid-cols-1 gap-2">
            {/* Admin */}
            <button
              type="button"
              onClick={() => handleDevLogin("admin@mengart.local")}
              disabled={isGoogleLoading || !!activeDevLogin}
              className="w-full py-2.5 px-3 rounded-lg bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-200 text-xs font-medium flex items-center justify-between transition-colors cursor-pointer disabled:opacity-50"
            >
              <div className="flex items-center gap-2">
                <ShieldAlert className="h-4 w-4 text-red-400" />
                <div className="text-left">
                  <div className="font-semibold text-white">Admin Atelier</div>
                  <div className="text-[10px] text-zinc-400">admin@mengart.local</div>
                </div>
              </div>
              {activeDevLogin === "admin@mengart.local" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-red-400" />
              ) : (
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-red-500/20 text-red-300 font-bold">
                  ADMIN
                </span>
              )}
            </button>

            {/* Moderator */}
            <button
              type="button"
              onClick={() => handleDevLogin("moderator@mengart.local")}
              disabled={isGoogleLoading || !!activeDevLogin}
              className="w-full py-2.5 px-3 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 text-blue-200 text-xs font-medium flex items-center justify-between transition-colors cursor-pointer disabled:opacity-50"
            >
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-blue-400" />
                <div className="text-left">
                  <div className="font-semibold text-white">Komorebi Moderator</div>
                  <div className="text-[10px] text-zinc-400">moderator@mengart.local</div>
                </div>
              </div>
              {activeDevLogin === "moderator@mengart.local" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-400" />
              ) : (
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 font-bold">
                  MODERATOR
                </span>
              )}
            </button>

            {/* Member */}
            <button
              type="button"
              onClick={() => handleDevLogin("member@mengart.local")}
              disabled={isGoogleLoading || !!activeDevLogin}
              className="w-full py-2.5 px-3 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-200 text-xs font-medium flex items-center justify-between transition-colors cursor-pointer disabled:opacity-50"
            >
              <div className="flex items-center gap-2">
                <Palette className="h-4 w-4 text-amber-400" />
                <div className="text-left">
                  <div className="font-semibold text-white">Luna Valerius (Artist)</div>
                  <div className="text-[10px] text-zinc-400">member@mengart.local</div>
                </div>
              </div>
              {activeDevLogin === "member@mengart.local" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-400" />
              ) : (
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-bold">
                  MEMBER
                </span>
              )}
            </button>

            {/* Visitor / Pending Invite */}
            <button
              type="button"
              onClick={() => handleDevLogin("pending@mengart.local")}
              disabled={isGoogleLoading || !!activeDevLogin}
              className="w-full py-2.5 px-3 rounded-lg bg-zinc-800/60 hover:bg-zinc-800 border border-zinc-700 text-zinc-300 text-xs font-medium flex items-center justify-between transition-colors cursor-pointer disabled:opacity-50"
            >
              <div className="flex items-center gap-2">
                <UserPlus className="h-4 w-4 text-zinc-400" />
                <div className="text-left">
                  <div className="font-semibold text-white">Pengunjung Baru (Pending Invite)</div>
                  <div className="text-[10px] text-zinc-400">pending@mengart.local</div>
                </div>
              </div>
              {activeDevLogin === "pending@mengart.local" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-zinc-400" />
              ) : (
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-700 text-zinc-300 font-bold">
                  UNVERIFIED
                </span>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

