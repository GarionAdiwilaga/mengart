import { requireAuth } from "@/lib/rbac";
import { db } from "@/db";
import { profiles, artworks, challenges } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import Link from "next/link";
import {
  Palette,
  Sparkles,
  Briefcase,
  Trophy,
  User,
  ArrowRight,
  ShieldCheck,
  Plus,
} from "lucide-react";

export default async function DashboardPage() {
  const user = await requireAuth("/login");

  const [profile] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.userId, user.id))
    .limit(1);

  const isModOrAdmin = user.role === "moderator" || user.role === "admin";

  return (
    <main className="p-6 sm:p-12 max-w-7xl mx-auto flex flex-col gap-8 flex-1">
      {/* Member Greeting Banner */}
      <section className="glass-panel p-8 sm:p-10 rounded-3xl border border-white/10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
        <div className="flex items-center gap-5">
          <div className="h-16 w-16 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 font-display font-bold text-2xl shrink-0">
            {profile?.displayName?.charAt(0) || "A"}
          </div>
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2.5">
              <h1 className="font-display font-extrabold text-2xl sm:text-3xl text-[#f6f2e9]">
                {profile?.displayName || "Artist Atelier"}
              </h1>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase border bg-amber-500/10 text-amber-400 border-amber-500/30">
                {user.role}
              </span>
            </div>
            <p className="text-xs text-zinc-400 font-sans">
              @{profile?.slug || "artist"} · {user.email}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {isModOrAdmin ? (
            <Link
              href="/admin"
              className="px-4 py-2 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-300 text-xs font-mono font-bold transition-all flex items-center gap-1.5"
            >
              <ShieldCheck className="h-4 w-4" />
              <span>Admin Command Center</span>
            </Link>
          ) : null}

          <Link
            href="/me/profile"
            className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white text-xs font-mono transition-colors"
          >
            Edit Profil
          </Link>
        </div>
      </section>

      {/* Studio Workspaces Grid */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Workspace 1: Portofolio Vault */}
        <div className="glass-panel p-6 sm:p-8 rounded-3xl border border-white/10 flex flex-col justify-between gap-6 hover:border-amber-500/30 transition-all">
          <div className="flex flex-col gap-3">
            <div className="h-10 w-10 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Palette className="h-5 w-5" />
            </div>
            <h3 className="font-display font-bold text-lg text-[#f6f2e9]">Vault Portofolio</h3>
            <p className="text-xs text-zinc-400 font-sans leading-relaxed">
              Unggah karya resolusi master, kelola visibilitas publik vs khusus member, dan tinjau kritik konstruktif.
            </p>
          </div>

          <Link
            href="/me/portfolio"
            className="text-xs font-mono font-bold text-amber-400 hover:text-amber-300 inline-flex items-center gap-1.5 transition-colors"
          >
            <span>Buka Studio Portofolio</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        {/* Workspace 2: Layanan Komisi */}
        <div className="glass-panel p-6 sm:p-8 rounded-3xl border border-white/10 flex flex-col justify-between gap-6 hover:border-amber-500/30 transition-all">
          <div className="flex flex-col gap-3">
            <div className="h-10 w-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <Briefcase className="h-5 w-5" />
            </div>
            <h3 className="font-display font-bold text-lg text-[#f6f2e9]">Layanan Komisi</h3>
            <p className="text-xs text-zinc-400 font-sans leading-relaxed">
              Atur status ketersediaan slot (Open, Waitlist, Closed), daftar paket harga, dan ketentuan Do / Don't scope.
            </p>
          </div>

          <Link
            href="/me/commissions"
            className="text-xs font-mono font-bold text-emerald-400 hover:text-emerald-300 inline-flex items-center gap-1.5 transition-colors"
          >
            <span>Kelola Komisi Saya</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        {/* Workspace 3: Art Challenges */}
        <div className="glass-panel p-6 sm:p-8 rounded-3xl border border-white/10 flex flex-col justify-between gap-6 hover:border-amber-500/30 transition-all">
          <div className="flex flex-col gap-3">
            <div className="h-10 w-10 rounded-2xl bg-purple-500/10 border border-purple-500/30 flex items-center justify-center text-purple-400">
              <Trophy className="h-5 w-5" />
            </div>
            <h3 className="font-display font-bold text-lg text-[#f6f2e9]">Community Challenge</h3>
            <p className="text-xs text-zinc-400 font-sans leading-relaxed">
              Ikuti challenge bertema, kumpulkan alokasi Stars, dan lihat karya terpilih di Hall of Fame komunitas.
            </p>
          </div>

          <Link
            href="/challenges"
            className="text-xs font-mono font-bold text-purple-400 hover:text-purple-300 inline-flex items-center gap-1.5 transition-colors"
          >
            <span>Jelajahi Challenge</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </section>
    </main>
  );
}
