import { requireAuth } from "@/lib/rbac";
import { db } from "@/db";
import { profiles, users, notifications } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { signOut } from "@/auth";
import Link from "next/link";
import {
  Palette,
  Key,
  LogOut,
  Sparkles,
  Image,
  Trophy,
  UserCircle,
  Briefcase,
  User,
  ArrowRight,
  ShieldCheck,
} from "lucide-react";
import { NotificationBell } from "@/components/notifications/NotificationBell";

export default async function DashboardPage() {
  const user = await requireAuth("/login");

  const [profile] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.userId, user.id))
    .limit(1);

  const userNotifications = await db
    .select()
    .from(notifications)
    .where(eq(notifications.userId, user.id))
    .orderBy(desc(notifications.createdAt))
    .limit(10);

  const isModOrAdmin = user.role === "moderator" || user.role === "admin";

  return (
    <main className="min-h-screen p-6 sm:p-12 max-w-7xl mx-auto flex flex-col justify-between gap-12">
      <div className="flex flex-col gap-8">
        {/* Navigation Bar */}
        <header className="flex items-center justify-between border-b border-white/10 pb-4">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-2.5">
              <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-amber-500 to-amber-700 flex items-center justify-center shadow-lg shadow-amber-500/20">
                <Palette className="h-4 w-4 text-black" />
              </div>
              <span className="font-display font-bold text-xl text-[#f6f2e9]">Mengart</span>
            </Link>

            <nav className="hidden md:flex items-center gap-6 ml-6 text-sm">
              <Link href="/gallery" className="text-zinc-400 hover:text-white transition-colors">
                Galeri
              </Link>
              <Link href="/artists" className="text-zinc-400 hover:text-white transition-colors">
                Artist
              </Link>
              <Link href="/commissions" className="text-zinc-400 hover:text-white transition-colors">
                Komisi
              </Link>
            </nav>
          </div>

          <div className="flex items-center gap-3">
            <NotificationBell notifications={userNotifications} />

            {isModOrAdmin ? (
              <>
                <Link
                  href="/admin/challenges"
                  className="px-3.5 py-1.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-400 text-xs font-mono transition-colors flex items-center gap-1.5"
                >
                  <Trophy className="h-3.5 w-3.5" />
                  <span>Kelola Challenge</span>
                </Link>
                <Link
                  href="/admin/invites"
                  className="px-3.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white text-xs font-mono transition-colors flex items-center gap-1.5"
                >
                  <Key className="h-3.5 w-3.5" />
                  <span>Kelola Undangan</span>
                </Link>
              </>
            ) : null}

            <Link
              href="/me/profile"
              className="px-3.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white text-xs font-mono transition-colors flex items-center gap-1.5"
            >
              <User className="h-3.5 w-3.5 text-amber-400" />
              <span>Profil Saya</span>
            </Link>

            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/" });
              }}
            >
              <button
                type="submit"
                className="px-3.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white text-xs font-mono transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <LogOut className="h-3.5 w-3.5" />
                <span>Keluar</span>
              </button>
            </form>
          </div>
        </header>

        {/* Member Greeting Banner */}
        <section className="glass-panel p-8 rounded-3xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
          <div className="flex items-center gap-5">
            <div className="h-16 w-16 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 font-display font-bold text-2xl">
              {profile?.displayName?.charAt(0) || "A"}
            </div>
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2.5">
                <h1 className="font-display font-extrabold text-2xl sm:text-3xl text-[#f6f2e9] tracking-tight">
                  Selamat datang kembali, {profile?.displayName || "Artist"}
                </h1>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-mono uppercase bg-amber-500/10 text-amber-400 border border-amber-500/30">
                  {user.role}
                </span>
              </div>
              <p className="text-xs font-mono text-zinc-400">
                Email: {user.email} • Status: {user.membershipStatus} • Profil: {profile?.profileStatus || "incomplete"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {profile?.slug ? (
              <Link
                href={`/artists/${profile.slug}`}
                className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold transition-all shadow-md shadow-amber-500/20 flex items-center gap-1.5"
              >
                <span>Lihat Profil Publik</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            ) : null}
          </div>
        </section>

        {/* Quick Navigation Cards */}
        <section className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          <div className="glass-panel p-6 rounded-2xl flex flex-col justify-between gap-4">
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs text-zinc-500">VAULT KARYA</span>
              <Image className="h-4 w-4 text-amber-400" />
            </div>
            <div>
              <h3 className="font-display font-bold text-lg text-[#f6f2e9]">Portofolio Saya</h3>
              <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
                Unggah karya digital, hasilkan versi clean master & watermark, dan atur susunan showcase profil.
              </p>
            </div>
            <Link
              href="/me/portfolio"
              className="mt-2 text-xs font-mono text-amber-400 hover:text-amber-300 transition-colors inline-flex items-center gap-1"
            >
              Buka Portofolio →
            </Link>
          </div>

          <div className="glass-panel p-6 rounded-2xl flex flex-col justify-between gap-4">
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs text-zinc-500">LAYANAN KOMISI</span>
              <Briefcase className="h-4 w-4 text-amber-400" />
            </div>
            <div>
              <h3 className="font-display font-bold text-lg text-[#f6f2e9]">Pusat Komisi</h3>
              <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
                Kelola kartu layanan, rentang harga, ketersediaan slot antrean, dan preferensi kontak WhatsApp.
              </p>
            </div>
            <Link
              href="/me/commissions"
              className="mt-2 text-xs font-mono text-amber-400 hover:text-amber-300 transition-colors inline-flex items-center gap-1"
            >
              Kelola Layanan →
            </Link>
          </div>

          <div className="glass-panel p-6 rounded-2xl flex flex-col justify-between gap-4">
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs text-zinc-500">EVENT KOMUNITAS</span>
              <Trophy className="h-4 w-4 text-amber-400" />
            </div>
            <div>
              <h3 className="font-display font-bold text-lg text-[#f6f2e9]">Art Challenge</h3>
              <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
                Kirim karya submisi, gunakan alokasi Stars saat voting dibuka, dan lihat daftar pemenang Hall of Fame.
              </p>
            </div>
            <Link
              href="/challenges"
              className="mt-2 text-xs font-mono text-amber-400 hover:text-amber-300 transition-colors inline-flex items-center gap-1"
            >
              Lihat Challenge →
            </Link>
          </div>
        </section>
      </div>

      <footer className="py-4 border-t border-white/10 text-xs font-mono text-zinc-500 flex justify-between items-center">
        <span>Platform Mengart Atelier</span>
        <span>Zona Waktu: Asia/Makassar (WITA)</span>
      </footer>
    </main>
  );
}
