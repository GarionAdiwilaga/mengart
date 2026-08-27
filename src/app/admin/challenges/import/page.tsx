import { requireModerator } from "@/lib/rbac";
import { db } from "@/db";
import { users, profiles } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import Link from "next/link";
import { ArrowLeft, History, Trophy } from "lucide-react";
import { HistoricalImportForm } from "@/components/admin/HistoricalImportForm";

export default async function AdminHistoricalChallengeImportPage() {
  await requireModerator("/dashboard");

  const artists = await db
    .select({
      userId: users.id,
      displayName: profiles.displayName,
      email: users.email,
      slug: profiles.slug,
    })
    .from(users)
    .innerJoin(profiles, eq(profiles.userId, users.id))
    .orderBy(desc(users.createdAt));

  return (
    <div className="flex flex-col gap-6">
      {/* Breadcrumb & Header */}
      <div className="flex flex-col gap-3">
        <Link
          href="/admin/challenges"
          className="inline-flex items-center gap-1.5 text-xs font-mono text-zinc-400 hover:text-amber-400 transition-colors w-fit"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Kembali ke Manajemen Challenge
        </Link>

        <div className="flex flex-col gap-1">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-400 text-xs font-mono w-fit">
            <History className="h-3.5 w-3.5" />
            <span>ARSIP HISTORIS ATELIER</span>
          </div>
          <h1 className="font-display font-extrabold text-2xl sm:text-3xl text-[#f6f2e9] tracking-tight">
            Impor Data Challenge Masa Lalu
          </h1>
          <p className="text-xs text-zinc-400">
            Daftarkan event kompetisi yang telah diadakan sebelum platform aktif ke dalam arsip resmi Hall of Fame komunitas.
          </p>
        </div>
      </div>

      <HistoricalImportForm artists={artists} />
    </div>
  );
}
