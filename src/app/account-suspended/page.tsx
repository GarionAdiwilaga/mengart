import { getCurrentUser } from "@/lib/rbac";
import { redirect } from "next/navigation";
import { ShieldAlert, LogOut, MessageSquare } from "lucide-react";
import { logoutAction } from "@/app/actions/auth";

export const metadata = {
  title: "Akun Ditangguhkan | Mengart Atelier",
  robots: { index: false, follow: false },
};

export default async function AccountSuspendedPage() {
  const user = await getCurrentUser();

  // If not logged in at all, go to login
  if (!user) {
    redirect("/login");
  }

  // If user is actually active, send to dashboard
  if (user.membershipStatus === "active") {
    redirect("/dashboard");
  }

  return (
    <div className="min-h-screen bg-[#0E1015] flex items-center justify-center p-4 relative overflow-hidden">
      {/* Subtle background ambient glow */}
      <div className="absolute -top-40 -left-40 w-96 h-96 bg-red-950/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-amber-950/15 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md relative z-10">
        <div className="rounded-2xl border border-white/10 bg-[#13161D]/90 backdrop-blur-xl p-8 shadow-2xl flex flex-col items-center text-center">
          {/* Status Icon */}
          <div className="h-16 w-16 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400 mb-6 shadow-inner">
            <ShieldAlert className="h-8 w-8" />
          </div>

          {/* Title & Badge */}
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-red-500/30 bg-red-500/10 text-red-300 text-xs font-mono mb-3">
            <span>STATUS: DITANGGUHKAN</span>
          </div>

          <h1 className="text-xl font-bold font-syne text-[#F6F2E9] mb-3">
            Akses Akun Dibatasi
          </h1>

          <p className="text-sm text-zinc-400 leading-relaxed mb-6">
            Akun Anda saat ini sedang ditangguhkan oleh pengurus atelier. Selama status ini aktif, akses terhadap pengunggahan karya, partisipasi voting, dan fitur komunitas dinonaktifkan.
          </p>

          <div className="w-full p-3.5 rounded-xl border border-white/5 bg-[#191C23] text-left mb-6 text-xs text-zinc-400 leading-relaxed">
            <div className="flex items-center gap-2 text-zinc-300 font-medium mb-1">
              <MessageSquare className="h-3.5 w-3.5 text-amber-400" />
              <span>Pengajuan Banding</span>
            </div>
            <p className="text-zinc-500">
              Jika Anda meyakini hal ini adalah kekeliruan, silakan hubungi tim moderator komunitas melalui kanal resmi Discord.
            </p>
          </div>

          {/* Sign Out Action */}
          <form action={logoutAction} className="w-full">
            <button
              type="submit"
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-sm font-medium text-zinc-200 hover:text-white transition-all cursor-pointer"
            >
              <LogOut className="h-4 w-4 text-zinc-400" />
              <span>Keluar dari Akun</span>
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
