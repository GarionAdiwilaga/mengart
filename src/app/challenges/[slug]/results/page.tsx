import { getChallengeBySlug } from "@/lib/challenges";
import { getChallengeResultsData } from "@/lib/voting";
import { notFound } from "next/navigation";
import Link from "next/link";
import {
  Trophy,
  ArrowLeft,
  Star,
  Award,
  Crown,
  Medal,
  User,
  Image as ImageIcon,
} from "lucide-react";

import { StoryCardGenerator } from "@/components/challenges/StoryCardGenerator";

interface ResultsPageProps {
  params: Promise<{ slug: string }>;
}

export default async function ChallengeResultsPage({ params }: ResultsPageProps) {
  const { slug } = await params;
  const challenge = await getChallengeBySlug(slug);

  if (!challenge) {
    notFound();
  }

  const resultsData = await getChallengeResultsData(challenge.id);
  if (!resultsData) {
    notFound();
  }

  const { results } = resultsData;
  const topWinners = results.slice(0, 3);
  const otherRanks = results.slice(3);

  const storyWinners = results.map((r, idx) => ({
    rank: r.finalRank ?? (idx + 1),
    title: r.title,
    artistName: r.artistName,
    artistSlug: r.artistSlug,
    starsCount: r.totalCommunityStars,
    imageUrl: r.thumbnailStorageKey ? `/api/media/public/${r.thumbnailStorageKey}` : null,
    awardTitle: r.slotTitle || undefined,
  }));

  return (
    <main className="p-6 sm:p-12 max-w-7xl mx-auto flex flex-col gap-10 flex-1">
      {/* Breadcrumb & Sub-Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            href={`/challenges/${challenge.slug}`}
            className="inline-flex items-center gap-1.5 text-xs font-mono text-zinc-400 hover:text-amber-400 transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Kembali ke Challenge
          </Link>
          <span className="text-zinc-600 font-mono text-xs">/</span>
          <span className="text-zinc-300 font-mono text-xs">Hasil Resmi & Hall of Fame</span>
        </div>

        <div className="flex items-center gap-3">
          <StoryCardGenerator
            challenge={{
              title: challenge.title,
              slug: challenge.slug,
              theme: challenge.theme,
              description: challenge.description,
              status: challenge.status,
            }}
            winners={storyWinners}
            defaultMode="results"
          />

          <span className="px-3 py-2 min-h-[44px] rounded-2xl text-xs font-mono font-bold uppercase border bg-amber-500/10 text-amber-400 border-amber-500/30 flex items-center gap-1.5">
            <Trophy className="h-3.5 w-3.5" />
            <span>HALL OF FAME SELESAI</span>
          </span>
        </div>
      </div>

      {/* Hero Banner */}
      <section className="glass-panel p-8 sm:p-12 rounded-3xl flex flex-col items-center text-center gap-4 relative overflow-hidden">
        <div className="h-16 w-16 rounded-3xl bg-gradient-to-br from-amber-400 to-amber-700 flex items-center justify-center shadow-xl shadow-amber-500/20">
          <Crown className="h-8 w-8 text-black" />
        </div>

        <div className="flex flex-col gap-2 max-w-2xl">
          <span className="text-xs font-mono uppercase text-amber-400">
            HASIL RESMI & PENGHARGAAN ATELIER
          </span>
          <h1 className="font-display font-extrabold text-3xl sm:text-4xl text-[#f6f2e9] tracking-tight">
            {challenge.title}
          </h1>
          <p className="text-xs sm:text-sm text-zinc-400 font-sans leading-relaxed">
            Selamat kepada seluruh artist pemenang voting komunitas dan pilihan juri kurator atas karya luar biasa yang telah dipublikasikan!
          </p>
        </div>
      </section>

      {/* Podium Showcase (Top 3 Winners) */}
      {topWinners.length > 0 ? (
        <section className="flex flex-col gap-6">
          <h2 className="font-display font-bold text-2xl text-[#f6f2e9] flex items-center gap-2">
            <Award className="h-6 w-6 text-amber-400" />
            <span>Podium Pemenang Utama</span>
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {topWinners.map((winner, idx) => {
              const rank = winner.finalRank;
              const isFirst = rank === 1;

              return (
                <div
                  key={winner.resultId}
                  className={`glass-panel rounded-3xl overflow-hidden flex flex-col justify-between p-6 gap-5 transition-all ${
                    isFirst
                      ? "border-amber-400/80 shadow-2xl shadow-amber-500/20 md:-translate-y-2 ring-1 ring-amber-400/40"
                      : "border-white/10"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-mono font-bold flex items-center gap-1.5 ${
                        isFirst
                          ? "bg-amber-400 text-black shadow-lg"
                          : rank === 2
                          ? "bg-zinc-300 text-black"
                          : "bg-amber-700 text-white"
                      }`}
                    >
                      {isFirst ? <Crown className="h-3.5 w-3.5" /> : <Medal className="h-3.5 w-3.5" />}
                      <span>JUARA #{rank}</span>
                    </span>

                    <div className="flex items-center gap-1 font-mono text-xs font-bold text-amber-400">
                      <Star className="h-4 w-4 fill-amber-400" />
                      <span>{winner.totalCommunityStars} Stars</span>
                    </div>
                  </div>

                  <div className="aspect-[4/3] bg-black/40 rounded-2xl overflow-hidden flex items-center justify-center border border-white/5">
                    {winner.thumbnailStorageKey ? (
                      <img
                        src={`/api/media/public/${winner.thumbnailStorageKey}`}
                        alt={winner.title}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <ImageIcon className="h-8 w-8 text-zinc-700" />
                    )}
                  </div>

                  <div className="flex flex-col gap-1">
                    <span className="text-[11px] font-mono text-amber-400 uppercase">
                      {winner.slotTitle || "Pemenang Komunitas"}
                    </span>
                    <h3 className="font-display font-bold text-lg text-[#f6f2e9]">{winner.title}</h3>
                    <Link
                      href={`/artists/${winner.artistSlug}`}
                      className="text-xs text-zinc-400 hover:text-white transition-colors inline-flex items-center gap-1"
                    >
                      <User className="h-3.5 w-3.5 text-amber-400" />
                      <span>oleh {winner.artistName}</span>
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      {/* Full Rankings Table */}
      {otherRanks.length > 0 ? (
        <section className="flex flex-col gap-4 pt-4 border-t border-white/10">
          <h3 className="font-display font-bold text-xl text-[#f6f2e9]">Peringkat Seluruh Peserta</h3>

          <div className="glass-panel rounded-2xl overflow-hidden border border-white/10">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-white/5 border-b border-white/10 text-zinc-400">
                <tr>
                  <th className="p-4">PERINGKAT</th>
                  <th className="p-4">KARYA & ARTIST</th>
                  <th className="p-4">TOTAL STARS</th>
                  <th className="p-4 text-right">PENGHARGAAN</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-zinc-300">
                {otherRanks.map((r) => (
                  <tr key={r.resultId} className="hover:bg-white/[0.02] transition-colors">
                    <td className="p-4 font-bold text-amber-400">#{r.finalRank}</td>
                    <td className="p-4">
                      <span className="font-display font-bold text-sm text-[#f6f2e9] block">
                        {r.title}
                      </span>
                      <span className="text-[11px] text-zinc-400">oleh {r.artistName}</span>
                    </td>
                    <td className="p-4">
                      <span className="flex items-center gap-1 font-semibold text-zinc-200">
                        <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                        {r.totalCommunityStars} Stars
                      </span>
                    </td>
                    <td className="p-4 text-right text-zinc-400">
                      {r.slotTitle || "Peserta Terdaftar"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </main>
  );
}
