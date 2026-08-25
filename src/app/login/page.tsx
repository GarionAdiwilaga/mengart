import { signIn } from "@/auth";
import Link from "next/link";
import { Palette, ShieldAlert, Sparkles, ArrowLeft } from "lucide-react";

interface LoginPageProps {
  searchParams: Promise<{ error?: string; callbackUrl?: string }>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { error } = await searchParams;

  let errorMessage: string | null = null;
  if (error === "InviteRequired") {
    errorMessage =
      "Undangan dibutuhkan. Mengart adalah komunitas art berbasis undangan (invite-only). Silakan buka tautan undangan resmi untuk mendaftar.";
  } else if (error === "AccountSuspended") {
    errorMessage =
      "Akun Anda sedang ditangguhkan. Silakan hubungi moderator komunitas untuk bantuan.";
  } else if (error === "AccountRevoked") {
    errorMessage =
      "Status keanggotaan Anda telah dicabut. Akses fitur khusus anggota telah dinonaktifkan.";
  } else if (error === "OAuthSignin" || error === "OAuthCallback") {
    errorMessage = "Gagal melakukan autentikasi dengan Google. Silakan coba kembali.";
  }

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
      <div className="w-full max-w-md glass-panel-elevated p-8 sm:p-10 rounded-3xl relative z-10 flex flex-col gap-6">
        {/* Brand Header */}
        <div className="flex flex-col items-center text-center gap-3">
          <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-amber-500 to-amber-700 flex items-center justify-center shadow-lg shadow-amber-500/20">
            <Palette className="h-6 w-6 text-black" />
          </div>
          <div>
            <h1 className="font-display font-extrabold text-2xl sm:text-3xl text-[#f6f2e9] tracking-tight">
              Masuk Anggota
            </h1>
            <p className="text-sm text-zinc-400 mt-1">
              Akses atelier, vault karya master, dan voting challenge.
            </p>
          </div>
        </div>

        {/* Error Alert */}
        {error ? (
          <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs flex items-start gap-3">
            <ShieldAlert className="h-4 w-4 shrink-0 text-red-400 mt-0.5" />
            <div className="leading-relaxed">{errorMessage || "Terjadi kesalahan saat masuk."}</div>
          </div>
        ) : null}

        {/* Google OAuth Form */}
        <form
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: "/dashboard" });
          }}
          className="flex flex-col gap-4"
        >
          <button
            type="submit"
            className="w-full py-3.5 px-4 rounded-xl bg-white text-zinc-900 font-semibold text-sm hover:bg-zinc-100 transition-all duration-200 shadow-md flex items-center justify-center gap-3 cursor-pointer"
          >
            {/* Google G SVG */}
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
            <span>Masuk dengan Google</span>
          </button>
        </form>

        {/* Invite-Only Explainer Banner */}
        <div className="p-4 rounded-xl bg-white/[0.03] border border-white/10 flex flex-col gap-2">
          <div className="flex items-center gap-2 text-xs font-mono text-amber-400">
            <Sparkles className="h-3.5 w-3.5" />
            <span>KHUSUS UNDANGAN</span>
          </div>
          <p className="text-xs text-zinc-400 leading-relaxed">
            Pendaftaran pertama kali memerlukan tautan undangan resmi. Jika Anda memiliki link undangan, buka langsung tautan tersebut di peramban Anda.
          </p>
        </div>
      </div>
    </main>
  );
}
