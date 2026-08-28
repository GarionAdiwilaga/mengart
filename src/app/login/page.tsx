import { Metadata } from "next";
import Link from "next/link";
import { Palette, Sparkles, ArrowLeft, Key } from "lucide-react";
import { LoginForm } from "@/components/auth/LoginForm";

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
  },
};

interface LoginPageProps {
  searchParams: Promise<{ error?: string; callbackUrl?: string }>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { error } = await searchParams;

  return (
    <main className="min-h-screen flex flex-col justify-center items-center p-6 relative overflow-hidden">
      {/* Ambient background glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Back to Home button */}
      <div className="w-full max-w-md mb-6">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-xs font-mono text-zinc-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Kembali ke Beranda
        </Link>
      </div>

      {/* Atelier Auth Card */}
      <div className="w-full max-w-md glass-panel-elevated p-8 sm:p-10 rounded-3xl relative z-10 flex flex-col gap-6 border border-white/10 shadow-2xl">
        {/* Brand Header */}
        <div className="flex flex-col items-center text-center gap-3">
          <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-amber-500 to-amber-700 flex items-center justify-center shadow-lg shadow-amber-500/20">
            <Palette className="h-6 w-6 text-black" />
          </div>
          <div>
            <h1 className="font-display font-extrabold text-2xl sm:text-3xl text-[#f6f2e9] tracking-tight">
              Masuk Anggota
            </h1>
            <p className="text-xs text-zinc-400 mt-1">
              Akses atelier, vault karya master, dan voting challenge.
            </p>
          </div>
        </div>

        {/* Dual Login Form */}
        <LoginForm initialError={error} />

        {/* Invitation Link Section */}
        <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-mono text-amber-400">
              <Key className="h-3.5 w-3.5" />
              <span>BELUM TERDAFTAR?</span>
            </div>
            <Link
              href="/invite"
              className="text-xs font-mono text-amber-400 hover:text-amber-300 transition-colors inline-flex items-center gap-1 font-semibold"
            >
              <span>Masukkan Kode</span>
              <span>→</span>
            </Link>
          </div>
          <p className="text-xs text-zinc-400 leading-relaxed">
            Mengart adalah komunitas privat berbasis undangan. Punya kode atau tautan undangan dari rekan? Masukkan untuk membuat akun.
          </p>
        </div>
      </div>
    </main>
  );
}
