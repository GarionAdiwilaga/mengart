import { Palette, KeyRound } from "lucide-react";
import Link from "next/link";
import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";

export default function ForgotPasswordPage() {
  return (
    <main className="min-h-screen flex items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-md glass-panel p-8 sm:p-10 rounded-3xl flex flex-col gap-6 relative overflow-hidden border border-white/10 shadow-2xl">
        <div className="flex flex-col items-center text-center gap-3">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-amber-500 to-amber-700 flex items-center justify-center shadow-lg shadow-amber-500/20">
              <Palette className="h-6 w-6 text-black" />
            </div>
          </Link>
          <div className="flex flex-col gap-1">
            <h1 className="font-display font-extrabold text-2xl text-[#f6f2e9] tracking-tight">
              Reset Password
            </h1>
            <p className="text-xs text-zinc-400 font-sans">
              Masukkan email akun Anda untuk menerima tautan pemulihan kata sandi.
            </p>
          </div>
        </div>

        <ForgotPasswordForm />

        <div className="pt-4 border-t border-white/10 flex flex-col items-center gap-2 text-center text-xs text-zinc-400">
          <span>Ingat kata sandi Anda?</span>
          <Link
            href="/login"
            className="font-mono text-amber-400 hover:text-amber-300 transition-colors"
          >
            Kembali ke Login →
          </Link>
        </div>
      </div>
    </main>
  );
}
