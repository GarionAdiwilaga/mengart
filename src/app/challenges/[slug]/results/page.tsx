import { getChallengeBySlug } from "@/lib/challenges";
import { getChallengeResultsData, getModeratorReviewResultsData } from "@/lib/voting";
import { getCurrentUser } from "@/lib/rbac";
import { publishChallengeResultsAction } from "@/app/actions/voting";
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
  ShieldCheck,
  Sparkles,
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

  const currentUser = await getCurrentUser();
  const isModOrAdmin = currentUser?.role === "admin" || currentUser?.role === "moderator";

  // Results Query based on authority
  const resultsData = isModOrAdmin && (challenge.status === "review" || challenge.status === "results_revoked")
    ? await getModeratorReviewResultsData(challenge.id)
    : await getChallengeResultsData(challenge.id);

  const results = resultsData?.results || [];
  const isFinished = challenge.status === "finished";
  const isRevoked = challenge.status === "results_revoked";
  const isReview = challenge.status === "review";

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
        awardTitle: r.slotTitle || (r.awardType === "community_vote_winner" ? "Pemenang Komunitas" : undefined),
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
            <span className="px-3 py-2 min-h-[44px] rounded-2xl text-xs font-mono font-bold uppercase border bg-blue-500/10 text-blue-400 border-blue-500/30 flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5" />
              <span>TAHAP REVIEW</span>
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

      {/* Review Stage Notice for Public vs Moderator */}
      {isReview ? (
        <section className="glass-panel p-8 sm:p-10 rounded-3xl border border-blue-500/30 bg-blue-950/20 flex flex-col gap-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-2xl bg-blue-500/20 text-blue-400 flex items-center justify-center shrink-0 border border-blue-500/30">
                <ShieldCheck className="h-6 w-6" />
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-xs font-mono uppercase font-bold text-blue-400 tracking-wider">
                  TAHAP PENINJAUAN KURATOR (REVIEW STAGE)
                </span>
                <h2 className="font-display font-bold text-lg text-[#f6f2e9]">
                  {isModOrAdmin
                    ? "Pratinjau Hasil untuk Verifikasi Moderator"
                    : "Hasil Challenge Sedang Ditinjau"}
                </h2>
              </div>
            </div>

            {isModOrAdmin ? (
              <form
                action={async () => {
                  "use server";
                  await publishChallengeResultsAction(challenge.id);
                }}
              >
                <button
                  type="submit"
                  className="px-6 py-3.5 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-xs font-mono transition-all shadow-lg shadow-emerald-500/20 flex items-center gap-2 cursor-pointer"
                >
                  <Sparkles className="h-4 w-4 text-black" />
                  <span>Publikasikan Hasil Resmi Sekarang</span>
                </button>
              </form>
            ) : null}
          </div>

          {!isModOrAdmin ? (
            <p className="text-xs sm:text-sm text-zinc-400 font-sans leading-relaxed">
              Perhitungan suara telah selesai dan saat ini sedang dalam proses verifikasi akhir oleh dewan kurator. Hasil resmi dan podium pemenang akan segera dipublikasikan.
            </p>
          ) : null}
        </section>
      ) : null}

      {/* Hero Banner (Only shown if finished or moderator preview) */}
      {(isFinished || (isReview && isModOrAdmin)) ? (
        <>
          <section className="glass-panel p-8 sm:p-12 rounded-3xl flex flex-col items-center text-center gap-4 relative overflow-hidden">
            <div className="h-16 w-16 rounded-3xl bg-gradient-to-br from-amber-400 to-amber-700 flex items-center justify-center shadow-xl shadow-amber-500/20">
              <Crown className="h-8 w-8 text-black" />
            </div>

            <div className="flex flex-col gap-2 max-w-2xl">
              <span className="text-xs font-mono uppercase text-amber-400">
                {isReview ? "PRATINJAU HASIL TERHITUNG" : "HASIL RESMI & PENGHARGAAN ATELIER"}
              </span>
              <h1 className="font-display font-extrabold text-3xl sm:text-4xl text-[#f6f2e9] tracking-tight">
                {challenge.title}
              </h1>
              <p className="text-xs sm:text-sm text-zinc-400 font-sans leading-relaxed">
                {isReview
                  ? "Berikut adalah konfigurasi pemenang terhitung berdasarkan akumulasi Stars dan slot juri sebelum publikasi resmi."
                  : "Selamat kepada seluruh artist peraih penghargaan resmi komunitas dan pilihan juri atas karya luar biasa yang telah dipublikasikan!"}
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
                        <span>{winner.slotTitle || "PILIHAN JURI"}</span>
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

