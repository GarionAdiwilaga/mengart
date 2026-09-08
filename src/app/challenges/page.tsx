import { db } from "@/db";
import { challenges } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import Link from "next/link";
import {
  Trophy,
  Clock,
  Award,
  ArrowRight,
} from "lucide-react";
import { getEffectiveChallengeStatus } from "@/lib/challenges";
import { CommunityShell } from "@/components/layout/shells/CommunityShell";
import { AtelierBadge } from "@/components/ui/atoms/AtelierBadge";
import { TimestampWITA } from "@/components/ui/atoms/TimestampWITA";

interface ChallengesPageProps {
  searchParams: Promise<{
    tab?: string;
  }>;
}

export default async function ChallengesDirectoryPage({ searchParams }: ChallengesPageProps) {
  const { tab = "active" } = await searchParams;

  const rawChallenges = await db
    .select()
    .from(challenges)
    .where(eq(challenges.isVisible, true))
    .orderBy(desc(challenges.createdAt));

  // Compute dynamic authoritative status for each challenge
  const allChallenges = rawChallenges.map((ch) => ({
    ...ch,
    effectiveStatus: getEffectiveChallengeStatus(ch),
  }));

  // Filter based on active tab
  const filtered = allChallenges.filter((ch) => {
    if (tab === "upcoming") {
      return ch.effectiveStatus === "scheduled" || ch.effectiveStatus === "draft";
    }
    if (tab === "completed") {
      return (
        ch.effectiveStatus === "finished" ||
        ch.effectiveStatus === "review" ||
        ch.effectiveStatus === "results_revoked"
      );
    }
    // "active" includes submission_open, submission_locked, voting_open, tiebreak_open, jury_selection_open, tie_pending, paused
    return (
      ch.effectiveStatus === "submission_open" ||
      ch.effectiveStatus === "submission_locked" ||
      ch.effectiveStatus === "voting_open" ||
      ch.effectiveStatus === "tiebreak_open" ||
      ch.effectiveStatus === "jury_selection_open" ||
      ch.effectiveStatus === "tie_pending" ||
      ch.effectiveStatus === "paused"
    );
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "submission_open":
        return <AtelierBadge variant="success" size="sm">Submisi Dibuka</AtelierBadge>;
      case "voting_open":
        return <AtelierBadge variant="amber" size="sm">Voting Berlangsung</AtelierBadge>;
      case "tiebreak_open":
        return <AtelierBadge variant="amber" size="sm">Babak Tiebreak</AtelierBadge>;
      case "tie_pending":
        return <AtelierBadge variant="danger" size="sm">Hasil Seri</AtelierBadge>;
      case "scheduled":
        return <AtelierBadge variant="default" size="sm">Mendatang</AtelierBadge>;
      case "finished":
        return <AtelierBadge variant="muted" size="sm">Selesai</AtelierBadge>;
      default:
        return <AtelierBadge variant="default" size="sm">{status.replace(/_/g, " ")}</AtelierBadge>;
    }
  };

  return (
    <CommunityShell>
      <div className="flex flex-col gap-8">
        {/* Hero Title */}
        <section className="flex flex-col sm:flex-row sm:items-end justify-between gap-6 pb-2 border-b border-white/10">
          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-400 text-xs font-mono mb-2">
              <Trophy className="h-3.5 w-3.5" />
              <span>Event Karya Komunitas</span>
            </div>
            <h1 className="font-display font-extrabold text-3xl sm:text-4xl text-[#f6f2e9] tracking-tight">
              Community Art Challenge
            </h1>
            <p className="text-xs sm:text-sm text-zinc-400 font-sans mt-1">
              Uji kemampuan visual, dapatkan apresiasi rekan atelier, dan raih apresiasi di Hall of Fame.
            </p>
          </div>
        </section>

        {/* Category Tabs */}
        <section className="flex items-center gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
          {[
            { key: "active", label: "Challenge Aktif" },
            { key: "upcoming", label: "Mendatang" },
            { key: "completed", label: "Arsip & Selesai" },
          ].map((t) => {
            const isActive = tab === t.key;
            return (
              <Link
                key={t.key}
                href={`/challenges?tab=${t.key}`}
                className={`px-4 py-2 min-h-[44px] inline-flex items-center rounded-xl text-xs sm:text-sm font-sans font-medium transition-all border ${
                  isActive
                    ? "bg-amber-500 text-black border-amber-400 font-semibold shadow-md shadow-amber-500/20"
                    : "bg-white/[0.03] text-zinc-400 border-white/10 hover:border-white/20 hover:text-white"
                }`}
              >
                {t.label}
              </Link>
            );
          })}
        </section>

        {/* Challenge Cards Grid */}
        {filtered.length === 0 ? (
          <div className="glass-panel p-16 rounded-3xl flex flex-col items-center justify-center text-center gap-3">
            <Trophy className="h-10 w-10 text-zinc-600" />
            <h3 className="font-display font-bold text-lg text-white">
              Tidak ada challenge pada kategori ini
            </h3>
            <p className="text-xs text-zinc-400 font-sans max-w-sm">
              Nantikan pengumuman challenge resmi berikutnya dari kurator komunitas Mengart.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filtered.map((item) => (
              <div
                key={item.id}
                className="glass-panel p-6 sm:p-7 rounded-3xl flex flex-col justify-between gap-6 group hover:border-white/20 transition-all duration-200"
              >
                <div className="flex flex-col gap-3.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-mono px-2.5 py-0.5 rounded-full border bg-amber-500/10 text-amber-400 border-amber-500/30 truncate">
                      Tema: {item.theme}
                    </span>
                    {getStatusBadge(item.effectiveStatus)}
                  </div>

                  <h3 className="font-display font-bold text-xl text-[#f6f2e9] group-hover:text-amber-300 transition-colors">
                    {item.title}
                  </h3>

                  <p className="text-xs text-zinc-300 font-sans line-clamp-3 leading-relaxed">
                    {item.description}
                  </p>
                </div>

                <div className="flex flex-col gap-3 pt-4 border-t border-white/5 text-xs">
                  <div className="flex items-center justify-between text-zinc-400 text-[11px]">
                    <span className="flex items-center gap-1.5 font-sans">
                      <Clock className="h-3.5 w-3.5 text-amber-400" />
                      Batas Submisi:
                    </span>
                    <TimestampWITA date={item.submissionDeadline} className="text-zinc-200 text-[11px]" />
                  </div>

                  <div className="flex items-center justify-between text-zinc-400 text-[11px]">
                    <span className="flex items-center gap-1.5 font-sans">
                      <Award className="h-3.5 w-3.5 text-amber-400" />
                      Mode Pemenang:
                    </span>
                    <span className="text-zinc-200 font-mono">
                      {item.awardMode === "vote_and_jury"
                        ? "Voting & Juri"
                        : item.awardMode === "vote_only"
                        ? "Voting Komunitas"
                        : item.awardMode === "jury_only"
                        ? "Kurasi Juri"
                        : "Showcase"}
                    </span>
                  </div>

                  <Link
                    href={`/challenges/${item.slug}`}
                    className="mt-2 w-full py-2.5 min-h-[44px] rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-xs font-semibold font-sans transition-all flex items-center justify-center gap-1.5 shadow-md shadow-amber-500/10"
                  >
                    <span>Buka Challenge</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </CommunityShell>
  );
}
