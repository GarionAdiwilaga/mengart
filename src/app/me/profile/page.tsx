import { requireAuth } from "@/lib/rbac";
import { db } from "@/db";
import { profiles } from "@/db/schema";
import { eq } from "drizzle-orm";
import Link from "next/link";
import { Palette, ArrowLeft, Eye, Sparkles } from "lucide-react";
import { ProfileEditForm } from "@/components/profile/ProfileEditForm";

export default async function ProfileSettingsPage() {
  const user = await requireAuth("/login");

  const [profile] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.userId, user.id))
    .limit(1);

  if (!profile) {
    return (
      <main className="min-h-screen p-6 sm:p-12 max-w-4xl mx-auto flex flex-col gap-6">
        <p className="text-zinc-400 text-sm font-mono">Profil tidak ditemukan.</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen p-6 sm:p-12 max-w-4xl mx-auto flex flex-col gap-8">
      {/* Top Header */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-6">
        <div className="flex flex-col gap-2">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1.5 text-xs font-mono text-zinc-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Dashboard
          </Link>
          <h1 className="font-display font-extrabold text-3xl text-[#f6f2e9] tracking-tight">
            Pengaturan Profil Artist
          </h1>
          <p className="text-sm text-zinc-400">
            Kelola bio, keahlian, software, dan status penerimaan komisi Anda.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href={`/artists/${profile.slug}`}
            target="_blank"
            className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white text-xs font-mono transition-colors flex items-center gap-1.5"
          >
            <Eye className="h-3.5 w-3.5 text-amber-400" />
            <span>Lihat Profil Publik</span>
          </Link>
        </div>
      </header>

      {/* Editor Form */}
      <ProfileEditForm initialProfile={profile} />
    </main>
  );
}
