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
  User,
  Image as ImageIcon,
  AlertTriangle,
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

  // Official Results Query
  const resultsData = await getChallengeResultsData(challenge.id);
  const results = resultsData?.results || [];
  const isFinished = challenge.status === "finished";
  const isRevoked = challenge.status === "results_revoked";

  const communityWinner = results.find(
    (r) => r.awardType === "community_vote_winner" || (r.awardType === "community_rank" && r.finalRank === 1)
  );

  const juryWinners = results.filter((r) => r.awardType === "jury_award");

  const storyWinners = isFinished
    ? results.map((r, idx) => ({
        rank: r.finalRank ?? (idx + 1),
        title: r.title || "Karya Pemenang",
        artistName: r.artistName || "Artist Atelier",
        artistSlug: r.artistSlug || "",
        starsCount: r.totalCommunityStars,
        imageUrl: r.thumbnailStorageKey ? `/api/media/public/${r.thumbnailStorageKey}` : null,
        awardTitle: r.categoryLabel || r.slotTitle || (r.awardType === "community_vote_winner" ? "Pemenang Komunitas" : "Jury Winner"),
      }))
    : [];

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
          {isFinished ? (
            <>
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
            </>
          ) : isRevoked ? (
            <span className="px-3 py-2 min-h-[44px] rounded-2xl text-xs font-mono font-bold uppercase border bg-rose-500/10 text-rose-400 border-rose-500/30 flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5" />
              <span>HASIL DICABUT</span>
            </span>
          ) : (
            <span className="px-3 py-2 min-h-[44px] rounded-2xl text-xs font-mono font-bold uppercase border bg-zinc-500/10 text-zinc-400 border-zinc-500/30 flex items-center gap-1.5">
              <Award className="h-3.5 w-3.5" />
              <span>HASIL BELUM DIPUBLIKASIKAN</span>
            </span>
          )}
        </div>
      </div>

      {/* Revoked Notice Banner */}
      {isRevoked ? (
        <section className="glass-panel p-8 sm:p-10 rounded-3xl border border-rose-500/30 bg-rose-950/20 flex flex-col sm:flex-row items-center gap-6">
          <div className="h-14 w-14 rounded-2xl bg-rose-500/20 text-rose-400 flex items-center justify-center shrink-0 border border-rose-500/30">
            <AlertTriangle className="h-7 w-7" />
          </div>
          <div className="flex flex-col gap-2 text-center sm:text-left">
            <span className="text-xs font-mono uppercase font-bold text-rose-400 tracking-wider">
              PEMBERITAHUAN RESMI ATELIER
            </span>
            <h2 className="font-display font-bold text-xl text-[#f6f2e9]">
              Hasil Resmi Challenge Ini Telah Dicabut
            </h2>
            <p className="text-xs sm:text-sm text-zinc-400 font-sans leading-relaxed">
              Hasil challenge sedang ditangguhkan untuk peninjauan, verifikasi ulang integritas, atau penghitungan ulang oleh dewan kurator. Daftar pemenang dan sertifikat Hall of Fame tidak dipublikasikan selama masa peninjauan ini.
            </p>
          </div>
        </section>
      ) : null}

      {/* Hero Banner (Only shown if finished) */}
      {isFinished ? (
        <>
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
                Selamat kepada seluruh artist peraih penghargaan resmi komunitas dan pilihan juri atas karya luar biasa yang telah dipublikasikan!
              </p>
            </div>
          </section>

          {/* Official Community Vote Winner Card (Blueprint 2.2.1 Single Community Winner) */}
          {communityWinner ? (
            <section className="flex flex-col gap-6">
              <h2 className="font-display font-bold text-2xl text-[#f6f2e9] flex items-center gap-2">
                <Crown className="h-6 w-6 text-amber-400" />
                <span>Pemenang Voting Komunitas (Juara 1)</span>
              </h2>

              <div className="glass-panel rounded-3xl overflow-hidden p-6 sm:p-8 border border-amber-400/80 shadow-2xl shadow-amber-500/20 ring-1 ring-amber-400/40 flex flex-col md:flex-row gap-8 items-center bg-gradient-to-br from-amber-500/[0.04] to-transparent">
                <div className="w-full md:w-1/2 aspect-[4/3] bg-black/40 rounded-2xl overflow-hidden flex items-center justify-center border border-white/5 shrink-0">
                  {communityWinner.thumbnailStorageKey ? (
                    <img
                      src={`/api/media/public/${communityWinner.thumbnailStorageKey}`}
                      alt={communityWinner.title || "Karya Pemenang Komunitas"}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <ImageIcon className="h-12 w-12 text-zinc-700" />
                  )}
                </div>

                <div className="w-full md:w-1/2 flex flex-col justify-between gap-6">
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center justify-between gap-4">
                      <span className="px-3 py-1 rounded-full text-xs font-mono font-bold bg-amber-400 text-black flex items-center gap-1.5 shadow-lg">
                        <Crown className="h-3.5 w-3.5" />
                        <span>JUARA 1 KOMUNITAS</span>
                      </span>

                      <div className="flex items-center gap-1 font-mono text-xs font-bold text-amber-400 bg-amber-500/10 px-3 py-1 rounded-full border border-amber-500/30">
                        <Star className="h-4 w-4 fill-amber-400" />
                        <span>{communityWinner.totalCommunityStars} Stars</span>
                      </div>
                    </div>

                    <h3 className="font-display font-extrabold text-2xl text-[#f6f2e9]">
                      {communityWinner.title || "Karya Pemenang"}
                    </h3>

                    {communityWinner.description ? (
                      <p className="text-xs text-zinc-400 font-sans leading-relaxed line-clamp-3">
                        {communityWinner.description}
                      </p>
                    ) : null}
                  </div>

                  <div className="pt-4 border-t border-white/10 flex items-center justify-between">
                    <Link
                      href={`/artists/${communityWinner.artistSlug || ""}`}
                      className="text-xs text-zinc-300 hover:text-white transition-colors inline-flex items-center gap-2"
                    >
                      <div className="h-7 w-7 rounded-full bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400">
                        <User className="h-4 w-4" />
                      </div>
                      <span className="font-bold">oleh {communityWinner.artistName || "Artist Atelier"}</span>
                    </Link>

                    {communityWinner.resolutionMethod ? (
                      <span className="text-[10px] font-mono text-zinc-500">
                        Metode: {communityWinner.resolutionMethod}
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>
            </section>
          ) : null}

          {/* Jury Award Winners */}
          {juryWinners.length > 0 ? (
            <section className="flex flex-col gap-6 pt-6 border-t border-white/10">
              <h2 className="font-display font-bold text-2xl text-[#f6f2e9] flex items-center gap-2">
                <Award className="h-6 w-6 text-purple-400" />
                <span>Pemenang Pilihan Juri Kurator</span>
              </h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
                {juryWinners.map((winner) => (
                  <div
                    key={winner.resultId}
                    className="glass-panel rounded-3xl overflow-hidden flex flex-col justify-between p-6 gap-5 border border-purple-500/20 bg-purple-950/[0.05]"
                  >
                    <div className="flex items-center justify-between">
                      <span className="px-3 py-1 rounded-full text-xs font-mono font-bold bg-purple-900/50 text-purple-300 border border-purple-500/30 flex items-center gap-1.5">
                        <Award className="h-3.5 w-3.5" />
                        <span>{winner.categoryLabel || winner.slotTitle || "Jury Winner"}</span>
                      </span>
                    </div>

                    <div className="aspect-[4/3] bg-black/40 rounded-2xl overflow-hidden flex items-center justify-center border border-white/5">
                      {winner.thumbnailStorageKey ? (
                        <img
                          src={`/api/media/public/${winner.thumbnailStorageKey}`}
                          alt={winner.title || "Karya Pilihan Juri"}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <ImageIcon className="h-8 w-8 text-zinc-700" />
                      )}
                    </div>

                    <div className="flex flex-col gap-1">
                      <h3 className="font-display font-bold text-lg text-[#f6f2e9]">{winner.title || "Karya Pemenang"}</h3>
                      <Link
                        href={`/artists/${winner.artistSlug || ""}`}
                        className="text-xs text-zinc-400 hover:text-white transition-colors inline-flex items-center gap-1"
                      >
                        <User className="h-3.5 w-3.5 text-purple-400" />
                        <span>oleh {winner.artistName || "Artist Atelier"}</span>
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ) : null}
        </>
      ) : null}
    </main>
  );
}

