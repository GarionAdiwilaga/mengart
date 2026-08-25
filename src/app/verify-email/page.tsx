import { Palette, Mail, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { VerifyEmailClient } from "@/components/auth/VerifyEmailClient";

interface VerifyEmailPageProps {
  searchParams: Promise<{
    token?: string;
    email?: string;
  }>;
}

export default async function VerifyEmailPage({ searchParams }: VerifyEmailPageProps) {
  const { token, email } = await searchParams;

  return (
    <main className="min-h-screen flex items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-md glass-panel p-8 sm:p-10 rounded-3xl flex flex-col gap-6 relative overflow-hidden border border-white/10 shadow-2xl">
        {/* Top Glow */}
        <div className="absolute -top-16 -right-16 h-36 w-36 rounded-full bg-amber-500/10 blur-3xl pointer-events-none" />

        {/* Branding Header */}
        <div className="flex flex-col items-center text-center gap-3">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-amber-500 to-amber-700 flex items-center justify-center shadow-lg shadow-amber-500/20">
              <Palette className="h-6 w-6 text-black" />
            </div>
          </Link>
          <div className="flex flex-col gap-1">
            <h1 className="font-display font-extrabold text-2xl text-[#f6f2e9] tracking-tight">
              Verifikasi Email Akun
            </h1>
            <p className="text-xs text-zinc-400 font-sans">
              Verifikasi kepemilikan alamat email untuk mengaktifkan akun atelier Anda.
            </p>
          </div>
        </div>

        {/* Verification Client Component */}
        <VerifyEmailClient initialToken={token} initialEmail={email} />

        <div className="pt-4 border-t border-white/10 flex flex-col items-center gap-2 text-center text-xs text-zinc-400">
          <span>Sudah selesai verifikasi?</span>
          <Link
            href="/login"
            className="font-mono text-amber-400 hover:text-amber-300 transition-colors"
          >
            Halaman Masuk (Login) →
          </Link>
        </div>
      </div>
    </main>
  );
}
