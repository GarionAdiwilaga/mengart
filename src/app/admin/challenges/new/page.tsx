import { requireModerator } from "@/lib/rbac";
import Link from "next/link";
import { ArrowLeft, Trophy, Sparkles } from "lucide-react";
import { ChallengeCreateForm } from "@/components/admin/ChallengeCreateForm";

export default async function AdminNewChallengePage() {
  await requireModerator("/dashboard");

  return (
    <main className="min-h-screen p-6 sm:p-12 max-w-7xl mx-auto flex flex-col gap-8">
      <header className="flex items-center justify-between border-b border-white/10 pb-4">
        <div className="flex items-center gap-3">
          <Link
            href="/admin/challenges"
            className="inline-flex items-center gap-1.5 text-xs font-mono text-zinc-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Kelola Challenge
          </Link>
        </div>
      </header>

      <div className="flex flex-col gap-2">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-400 text-xs font-mono w-fit">
          <Trophy className="h-3.5 w-3.5" />
          <span>KONTROL KURATOR ATELIER</span>
        </div>
        <h1 className="font-display font-extrabold text-3xl text-[#f6f2e9] tracking-tight">
          Buat Event Art Challenge Baru
        </h1>
        <p className="text-xs text-zinc-400">
          Tentukan tema, batas waktu pengiriman karya (WITA), dan aturan voting komunitas.
        </p>
      </div>

      <ChallengeCreateForm />
    </main>
  );
}
