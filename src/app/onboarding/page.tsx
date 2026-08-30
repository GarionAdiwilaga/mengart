import { Metadata } from "next";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { Palette, Sparkles, Key, LogOut } from "lucide-react";
import { OnboardingInviteForm } from "@/components/auth/OnboardingInviteForm";
import { logoutAction } from "@/app/actions/auth";

export const metadata: Metadata = {
  title: "Onboarding Anggota — Mengart",
  robots: {
    index: false,
    follow: false,
  },
};

interface OnboardingPageProps {
  searchParams: Promise<{ error?: string }>;
}

export default async function OnboardingPage({ searchParams }: OnboardingPageProps) {
  const session = await auth();
  const { error } = await searchParams;

  if (!session?.user || !session.user.id) {
    redirect("/login?error=AuthRequired");
  }

  if (session.user.membershipStatus === "active") {
    redirect("/dashboard");
  }

  if (session.user.membershipStatus === "suspended") {
    redirect("/dashboard?error=AccountSuspended");
  }

  return (
    <main className="min-h-screen flex flex-col justify-center items-center p-6 relative overflow-hidden">
      {/* Ambient background glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Atelier Onboarding Card */}
      <div className="w-full max-w-lg glass-panel-elevated p-8 sm:p-10 rounded-3xl relative z-10 flex flex-col gap-6 border border-white/10 shadow-2xl">
        {/* Brand Header */}
        <div className="flex flex-col items-center text-center gap-3">
          <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-amber-500 to-amber-700 flex items-center justify-center shadow-lg shadow-amber-500/20">
            <Palette className="h-6 w-6 text-black" />
          </div>
          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-400 text-xs font-mono mb-2">
              <Sparkles className="h-3.5 w-3.5" />
              <span>ONBOARDING KEANGGOTAAN</span>
            </div>
            <h1 className="font-display font-extrabold text-2xl sm:text-3xl text-[#f6f2e9] tracking-tight">
              Selamat Datang di Mengart
            </h1>
            <p className="text-xs text-zinc-400 mt-1">
              Akun Google Anda terhubung ({session.user.email}). Masukkan kode undangan untuk mengaktifkan keanggotaan studio.
            </p>
          </div>
        </div>

        {/* Onboarding Form */}
        <OnboardingInviteForm initialError={error} userEmail={session.user.email || ""} defaultName={session.user.name || ""} />

        {/* Sign out footer */}
        <div className="pt-4 border-t border-white/10 flex items-center justify-between text-xs text-zinc-500">
          <span>Bukan akun Anda?</span>
          <form action={logoutAction}>
            <button
              type="submit"
              className="font-mono text-zinc-400 hover:text-red-400 transition-colors inline-flex items-center gap-1 cursor-pointer"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span>Keluar</span>
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
