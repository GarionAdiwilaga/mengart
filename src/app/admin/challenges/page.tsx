import { requireModerator } from "@/lib/rbac";
import { db } from "@/db";
import { challenges, challengeSubmissions } from "@/db/schema";
import { desc, count, eq } from "drizzle-orm";
import Link from "next/link";
import { Trophy, Plus, ArrowLeft, Clock, Award, Users, ExternalLink } from "lucide-react";
import { getEffectiveChallengeStatus } from "@/lib/challenges";
import { ChallengeTransitionButtons } from "@/components/admin/ChallengeTransitionButtons";

export default async function AdminChallengesOverviewPage() {
  await requireModerator("/dashboard");

  const rawChallenges = await db
    .select()
    .from(challenges)
    .orderBy(desc(challenges.createdAt));

  const allChallenges = await Promise.all(
    rawChallenges.map(async (ch) => {
      const [subCount] = await db
        .select({ value: count() })
        .from(challengeSubmissions)
        .where(eq(challengeSubmissions.challengeId, ch.id));

      return {
        ...ch,
        effectiveStatus: getEffectiveChallengeStatus(ch),
        submissionCount: subCount?.value || 0,
      };
    })
  );

  return (
    <main className="min-h-screen p-6 sm:p-12 max-w-7xl mx-auto flex flex-col gap-8">
      {/* Navigation */}
      <header className="flex items-center justify-between border-b border-white/10 pb-4">
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1.5 text-xs font-mono text-zinc-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Dashboard
          </Link>
          <span className="text-zinc-600 font-mono text-xs">/</span>
          <span className="text-zinc-300 font-mono text-xs">Kelola Event Art Challenge</span>
        </div>

        <Link
          href="/admin/challenges/new"
          className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs font-mono transition-all shadow-md shadow-amber-500/20 flex items-center gap-1.5"
        >
          <Plus className="h-4 w-4" />
          <span>Buat Challenge Baru</span>
        </Link>
      </header>

      {/* Header Title */}
      <div className="flex flex-col gap-2">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-400 text-xs font-mono w-fit">
          <Trophy className="h-3.5 w-3.5" />
          <span>PANEL OPERASIONAL CHALLENGE</span>
        </div>
        <h1 className="font-display font-extrabold text-3xl text-[#f6f2e9] tracking-tight">
          Manajemen Event & Tahapan Submisi
        </h1>
        <p className="text-xs text-zinc-400">
          Kelola lifecycle challenge, kunci submisi saat deadline tercapai, dan atur transisi voting komunitas.
        </p>
      </div>

      {/* Challenges Table */}
      {allChallenges.length === 0 ? (
        <div className="glass-panel p-16 rounded-3xl flex flex-col items-center justify-center text-center gap-3">
          <Trophy className="h-10 w-10 text-zinc-600" />
          <h3 className="font-display font-bold text-lg text-white">Belum ada challenge dibuat</h3>
          <p className="text-xs text-zinc-400 max-w-sm">
            Klik tombol "Buat Challenge Baru" di kanan atas untuk mempublikasikan event pertama.
          </p>
        </div>
      ) : (
        <div className="glass-panel rounded-3xl overflow-hidden border border-white/10">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-white/5 border-b border-white/10 text-zinc-400">
                <tr>
                  <th className="p-4">JUDUL & TEMA</th>
                  <th className="p-4">STATUS AKTIF</th>
                  <th className="p-4">SUBMISI</th>
                  <th className="p-4">DEADLINE SUBMISI (WITA)</th>
                  <th className="p-4">AKSI KONTROL STATUS</th>
                  <th className="p-4 text-right">TAUTAN</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-zinc-300">
                {allChallenges.map((item) => {
                  const deadlineStr = item.submissionDeadline
                    ? new Intl.DateTimeFormat("id-ID", {
                        timeZone: "Asia/Makassar",
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      }).format(new Date(item.submissionDeadline))
                    : "—";

                  const statusColor =
                    item.effectiveStatus === "submission_open"
                      ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                      : item.effectiveStatus === "voting_open"
                      ? "bg-amber-500/10 text-amber-400 border-amber-500/30"
                      : item.effectiveStatus === "scheduled"
                      ? "bg-blue-500/10 text-blue-400 border-blue-500/30"
                      : "bg-zinc-500/10 text-zinc-400 border-zinc-500/30";

                  return (
                    <tr key={item.id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="p-4">
                        <span className="font-display font-bold text-sm text-[#f6f2e9] block">
                          {item.title}
                        </span>
                        <span className="text-[11px] text-amber-400 font-sans">
                          Tema: {item.theme}
                        </span>
                      </td>
                      <td className="p-4">
                        <span className={`px-2.5 py-0.5 rounded-full uppercase border text-[10px] font-bold ${statusColor}`}>
                          {item.effectiveStatus.replace(/_/g, " ")}
                        </span>
                      </td>
                      <td className="p-4">
                        <span className="text-zinc-200 font-semibold">{item.submissionCount}</span>
                      </td>
                      <td className="p-4 text-zinc-400">{deadlineStr}</td>
                      <td className="p-4">
                        <ChallengeTransitionButtons
                          challengeId={item.id}
                          currentStatus={item.effectiveStatus}
                        />
                      </td>
                      <td className="p-4 text-right">
                        <Link
                          href={`/challenges/${item.slug}`}
                          className="text-amber-400 hover:text-amber-300 inline-flex items-center gap-1"
                        >
                          <span>Buka</span>
                          <ExternalLink className="h-3 w-3" />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </main>
  );
}
