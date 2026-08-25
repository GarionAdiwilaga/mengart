"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import {
  ArrowRight,
  Loader2,
  Sparkles,
  Mail,
  Lock,
  User,
  CheckCircle2,
  AlertCircle,
  AtSign,
} from "lucide-react";
import { registerWithCredentialsAction } from "@/app/actions/auth";
import Link from "next/link";

interface InviteRedeemFormProps {
  rawToken: string;
}

export function InviteRedeemForm({ rawToken }: InviteRedeemFormProps) {
  const [tab, setTab] = useState<"google" | "credentials">("google");

  // Google flow state
  const [googleDisplayName, setGoogleDisplayName] = useState("");
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);

  // Credentials flow state
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isCredsLoading, setIsCredsLoading] = useState(false);

  const [registeredEmail, setRegisteredEmail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Handle Google OAuth registration
  const handleGoogleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!googleDisplayName.trim()) {
      setError("Silakan masukkan nama alias atau nama kreator Anda.");
      return;
    }

    setIsGoogleLoading(true);
    setError(null);

    try {
      sessionStorage.setItem("pending_invite_token", rawToken);
      sessionStorage.setItem("pending_artist_name", googleDisplayName.trim());

      await signIn("google", {
        callbackUrl: `/api/auth/redeem-callback?token=${encodeURIComponent(
          rawToken
        )}&name=${encodeURIComponent(googleDisplayName.trim())}`,
      });
    } catch (err: any) {
      setError(err?.message || "Gagal memulai autentikasi Google. Silakan coba kembali.");
      setIsGoogleLoading(false);
    }
  };

  // Handle Credentials registration
  const handleCredentialsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsCredsLoading(true);
    setError(null);

    const formData = new FormData();
    formData.append("inviteInput", rawToken);
    formData.append("displayName", displayName.trim());
    formData.append("username", username.trim());
    formData.append("email", email.trim());
    formData.append("password", password);
    formData.append("confirmPassword", confirmPassword);

    const res = await registerWithCredentialsAction(formData);

    setIsCredsLoading(false);
    if (!res.success) {
      setError(res.error || "Gagal mendaftar.");
    } else {
      setRegisteredEmail(res.email || email);
    }
  };

  if (registeredEmail) {
    return (
      <div className="flex flex-col items-center text-center gap-5 p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-zinc-200 animate-in fade-in zoom-in-95 duration-200">
        <div className="h-12 w-12 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
          <CheckCircle2 className="h-6 w-6" />
        </div>
        <div className="flex flex-col gap-1.5">
          <h3 className="font-display font-bold text-lg text-emerald-300">
            Registrasi Berhasil!
          </h3>
          <p className="text-xs text-zinc-300 leading-relaxed max-w-sm">
            Tautan verifikasi telah dikirimkan ke <strong className="text-white">{registeredEmail}</strong>. Silakan periksa kotak masuk atau spam email Anda untuk mengaktifkan akun.
          </p>
        </div>

        <Link
          href={`/verify-email?email=${encodeURIComponent(registeredEmail)}`}
          className="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-xs transition-all shadow-md shadow-emerald-500/20"
        >
          Buka Halaman Verifikasi Email
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Registration Mode Selector */}
      <div className="grid grid-cols-2 p-1 rounded-2xl bg-white/5 border border-white/10 text-xs font-mono">
        <button
          type="button"
          onClick={() => {
            setTab("google");
            setError(null);
          }}
          className={`py-2 rounded-xl transition-all font-semibold cursor-pointer ${
            tab === "google"
              ? "bg-amber-500 text-black shadow-md shadow-amber-500/20"
              : "text-zinc-400 hover:text-white"
          }`}
        >
          Google OAuth
        </button>
        <button
          type="button"
          onClick={() => {
            setTab("credentials");
            setError(null);
          }}
          className={`py-2 rounded-xl transition-all font-semibold cursor-pointer ${
            tab === "credentials"
              ? "bg-amber-500 text-black shadow-md shadow-amber-500/20"
              : "text-zinc-400 hover:text-white"
          }`}
        >
          Email & Password
        </button>
      </div>

      {error ? (
        <div className="p-3.5 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
          <span>{error}</span>
        </div>
      ) : null}

      {/* Mode A: Google OAuth Flow */}
      {tab === "google" ? (
        <form onSubmit={handleGoogleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="googleDisplayName" className="text-xs font-mono text-zinc-300">
              ALIAS ARTIST / NAMA TAMPILAN
            </label>
            <input
              id="googleDisplayName"
              type="text"
              value={googleDisplayName}
              onChange={(e) => setGoogleDisplayName(e.target.value)}
              placeholder="contoh: Ren Kisaragi, AuraArt"
              required
              maxLength={50}
              className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-zinc-600 focus:outline-none focus:border-amber-500/60 text-sm font-sans"
            />
          </div>

          <button
            type="submit"
            disabled={isGoogleLoading}
            className="w-full mt-2 py-3.5 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-sm transition-all duration-200 shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {isGoogleLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin text-black" />
                <span>Menghubungkan Google...</span>
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4 text-black" />
                <span>Lanjutkan dengan Google & Bergabung</span>
                <ArrowRight className="h-4 w-4 text-black" />
              </>
            )}
          </button>
        </form>
      ) : (
        /* Mode B: Manual Email & Password Flow */
        <form onSubmit={handleCredentialsSubmit} className="flex flex-col gap-3.5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-mono text-zinc-300">NAMA DISPLAY ARTIST</label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Ren Kisaragi"
                required
                maxLength={50}
                className="w-full px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-zinc-600 focus:outline-none focus:border-amber-500/60 text-xs font-sans"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-mono text-zinc-300">USERNAME (OPSIONAL)</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="renkisaragi"
                maxLength={30}
                className="w-full px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-zinc-600 focus:outline-none focus:border-amber-500/60 text-xs font-mono"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-mono text-zinc-300">ALAMAT EMAIL</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="artist@example.com"
              required
              className="w-full px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-zinc-600 focus:outline-none focus:border-amber-500/60 text-xs font-sans"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-mono text-zinc-300">PASSWORD (MIN 8 KARAKTER)</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                minLength={8}
                className="w-full px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-zinc-600 focus:outline-none focus:border-amber-500/60 text-xs font-sans"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-mono text-zinc-300">KONFIRMASI PASSWORD</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                required
                minLength={8}
                className="w-full px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-zinc-600 focus:outline-none focus:border-amber-500/60 text-xs font-sans"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isCredsLoading}
            className="w-full mt-2 py-3.5 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-sm transition-all duration-200 shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {isCredsLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin text-black" />
                <span>Membuat Akun & Mengirim Email Verifikasi...</span>
              </>
            ) : (
              <>
                <Mail className="h-4 w-4 text-black" />
                <span>Daftar dengan Email & Password</span>
                <ArrowRight className="h-4 w-4 text-black" />
              </>
            )}
          </button>
        </form>
      )}

      <p className="text-[11px] text-zinc-500 text-center font-sans">
        Dengan mendaftar, Anda menyetujui kode etik atelier dan kebijakan perlindungan karya.
      </p>
    </div>
  );
}
