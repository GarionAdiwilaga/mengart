import { db } from "@/db";
import { challenges, challengeSubmissions } from "@/db/schema";
import { eq, desc, and, count } from "drizzle-orm";
import Link from "next/link";
import {
  Palette,
  Trophy,
  Sparkles,
  Clock,
  Users,
  Award,
  ArrowRight,
  ShieldAlert,
} from "lucide-react";
import { getEffectiveChallengeStatus } from "@/lib/challenges";

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
      return ch.effectiveStatus === "finished" || ch.effectiveStatus === "review";
    }
    // "active" includes submission_open, submission_locked, voting_open, tiebreak_open, jury_selection_open
    return (
      ch.effectiveStatus === "submission_open" ||
      ch.effectiveStatus === "submission_locked" ||
      ch.effectiveStatus === "voting_open" ||
      ch.effectiveStatus === "tiebreak_open" ||
      ch.effectiveStatus === "jury_selection_open"
    );
  });

  return (
    <main className="min-h-screen p-6 sm:p-12 max-w-7xl mx-auto flex flex-col gap-8">
      {/* Global Navigation Header */}
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
            <Link href="/challenges" className="text-amber-400 font-semibold">
              Challenge
            </Link>
          </nav>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/dashboard"
            className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white text-xs font-mono transition-colors"
          >
            Dashboard
          </Link>
        </div>
      </header>

      {/* Hero Title */}
      <section className="flex flex-col sm:flex-row sm:items-end justify-between gap-6">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-400 text-xs font-mono mb-2">
            <Trophy className="h-3.5 w-3.5" />
            <span>EVENT KARYA KOMUNITAS</span>
          </div>
          <h1 className="font-display font-extrabold text-3xl sm:text-4xl text-[#f6f2e9] tracking-tight">
            Art Challenges & Kompetisi
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            Uji kemampuan visual, dapatkan apresiasi rekan atelier, dan menangkan badge Hall of Fame.
          </p>
        </div>
      </section>

      {/* Category Tabs */}
      <section className="flex items-center gap-2 border-b border-white/10 pb-4">
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
              className={`px-4 py-2 rounded-xl text-xs font-mono transition-all border ${
                isActive
                  ? "bg-amber-500 text-black border-amber-400 font-bold shadow-md shadow-amber-500/20"
                  : "bg-white/5 text-zinc-400 border-white/10 hover:border-white/20 hover:text-white"
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
          <p className="text-xs text-zinc-400 max-w-sm">
            Nantikan pengumuman challenge resmi berikutnya dari kurator komunitas Mengart.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filtered.map((item) => {
            const formattedDeadline = item.submissionDeadline
              ? new Intl.DateTimeFormat("id-ID", {
                  timeZone: "Asia/Makassar",
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                }).format(new Date(item.submissionDeadline)) + " WITA"
              : "Belum Ditentukan";

            const statusClass =
              item.effectiveStatus === "submission_open"
                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                : item.effectiveStatus === "voting_open"
                ? "bg-amber-500/10 text-amber-400 border-amber-500/30"
                : item.effectiveStatus === "scheduled"
                ? "bg-blue-500/10 text-blue-400 border-blue-500/30"
                : "bg-zinc-500/10 text-zinc-400 border-zinc-500/30";

            return (
              <div
                key={item.id}
                className="glass-panel p-6 rounded-3xl flex flex-col justify-between gap-6 group hover:border-white/20 transition-all duration-200"
              >
                <div className="flex flex-col gap-3.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono uppercase px-2.5 py-0.5 rounded-full border bg-amber-500/10 text-amber-400 border-amber-500/30">
                      TEMA: {item.theme}
                    </span>
                    <span
                      className={`text-[10px] font-mono uppercase px-2.5 py-0.5 rounded-full border font-bold ${statusClass}`}
                    >
                      {item.effectiveStatus.replace(/_/g, " ")}
                    </span>
                  </div>

                  <h3 className="font-display font-bold text-xl text-[#f6f2e9] group-hover:text-amber-300 transition-colors">
                    {item.title}
                  </h3>

                  <p className="text-xs text-zinc-300 font-sans line-clamp-3 leading-relaxed">
                    {item.description}
                  </p>
                </div>

                <div className="flex flex-col gap-3 pt-4 border-t border-white/5 text-xs font-mono">
                  <div className="flex items-center justify-between text-zinc-400 text-[11px]">
                    <span className="flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5 text-amber-400" />
                      Deadline Submisi:
                    </span>
                    <span className="text-zinc-200">{formattedDeadline}</span>
                  </div>

                  <div className="flex items-center justify-between text-zinc-400 text-[11px]">
                    <span className="flex items-center gap-1.5">
                      <Award className="h-3.5 w-3.5 text-amber-400" />
                      Mode Pemenang:
                    </span>
                    <span className="text-zinc-200 uppercase">
                      {item.awardMode.replace(/_/g, " ")}
                    </span>
                  </div>

                  <Link
                    href={`/challenges/${item.slug}`}
                    className="mt-2 w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold font-sans transition-all flex items-center justify-center gap-1.5 shadow-md shadow-amber-500/10"
                  >
                    <span>Buka Challenge</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
