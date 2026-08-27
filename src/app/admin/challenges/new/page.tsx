import { requireModerator } from "@/lib/rbac";
import Link from "next/link";
import { ArrowLeft, Trophy } from "lucide-react";
import { ChallengeCreateForm } from "@/components/admin/ChallengeCreateForm";

export default async function AdminNewChallengePage() {
  await requireModerator("/dashboard");

  return (
    <div className="flex flex-col gap-6">
      {/* Breadcrumb & Title */}
      <div className="flex flex-col gap-3">
        <Link
          href="/admin/challenges"
          className="inline-flex items-center gap-1.5 text-xs font-mono text-zinc-400 hover:text-amber-400 transition-colors w-fit"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Kembali ke Daftar Challenge
        </Link>

        <div className="flex flex-col gap-1">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-400 text-xs font-mono w-fit">
            <Trophy className="h-3.5 w-3.5" />
            <span>KONTROL KURATOR ATELIER</span>
          </div>
          <h1 className="font-display font-extrabold text-2xl sm:text-3xl text-[#f6f2e9] tracking-tight">
            Buat Event Art Challenge Baru
          </h1>
          <p className="text-xs text-zinc-400">
            Tentukan tema, batas waktu pengiriman karya (WITA), dan aturan voting komunitas.
          </p>
        </div>
      </div>

      <ChallengeCreateForm />
    </div>
  );
}
