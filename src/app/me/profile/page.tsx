import { requireAuth } from "@/lib/rbac";
import { db } from "@/db";
import { profiles } from "@/db/schema";
import { eq } from "drizzle-orm";
import Link from "next/link";
import { Eye } from "lucide-react";
import { ProfileEditForm } from "@/components/profile/ProfileEditForm";
import { StudioShell } from "@/components/layout/shells/StudioShell";

export default async function ProfileSettingsPage() {
  const user = await requireAuth("/login");

  const [profile] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.userId, user.id))
    .limit(1);

  if (!profile) {
    return (
      <StudioShell headerTitle="Edit Profil Artist">
        <div className="glass-panel p-12 rounded-3xl text-center flex flex-col items-center gap-3">
          <p className="text-zinc-400 font-mono text-sm">Profil tidak ditemukan.</p>
        </div>
      </StudioShell>
    );
  }

  return (
    <StudioShell
      headerTitle="Pengaturan Profil Artist"
      headerSubtitle="Kelola bio, keahlian, software andalan, dan status penerimaan komisi Anda."
      rightAction={
        <Link
          href={`/artists/${profile.slug}`}
          target="_blank"
          className="px-4 py-2 min-h-[44px] rounded-xl bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white text-xs font-mono transition-colors flex items-center gap-1.5 cursor-pointer"
        >
          <Eye className="h-3.5 w-3.5 text-amber-400" />
          <span>Lihat Profil Publik</span>
        </Link>
      }
    >
      <div className="max-w-4xl mx-auto w-full">
        <ProfileEditForm initialProfile={profile} />
      </div>
    </StudioShell>
  );
}

