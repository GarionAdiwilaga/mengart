import {
  getChallengeBySlug,
  getUserChallengeSubmission,
  getChallengeCandidates,
} from "@/lib/challenges";
import { getChallengeResultsData } from "@/lib/voting";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import Link from "next/link";
import {
  Trophy,
  ArrowLeft,
  Download,
  Award,
  Sparkles,
  FileCode,
  Image as ImageIcon,
  Star,
  CheckCircle2,
  Crown,
} from "lucide-react";
import { ChallengeSubmissionModal } from "@/components/challenges/ChallengeSubmissionModal";
import { CandidateStaffDisqualifyButton } from "@/components/challenges/CandidateStaffDisqualifyButton";
import { StoryCardGenerator } from "@/components/challenges/StoryCardGenerator";
import { AtelierBadge } from "@/components/ui/atoms/AtelierBadge";
import { TimestampWITA } from "@/components/ui/atoms/TimestampWITA";
import { ArtworkMediaFrame } from "@/components/ui/molecules/ArtworkMediaFrame";
import { CommunityShell } from "@/components/layout/shells/CommunityShell";

interface ChallengeDetailPageProps {
  params: Promise<{ slug: string }>;
}

export default async function ChallengeDetailPage({ params }: ChallengeDetailPageProps) {
  const { slug } = await params;
  const session = await auth();
  const isStaff = Boolean(
    session?.user?.role === "admin" || session?.user?.role === "moderator"
  );
  const challenge = await getChallengeBySlug(slug, { allowInvisible: isStaff });

  if (!challenge) {
    notFound();
  }

  const userId = session?.user?.id;

  // Fetch current user's submission if logged in
  const userSubmission = userId
    ? await getUserChallengeSubmission(challenge.id, userId)
    : null;

  // Fetch all candidate submissions
  const candidates = await getChallengeCandidates(challenge.id);

  // If finished, load official results
  const isFinished = challenge.effectiveStatus === "finished";
  const resultsData = isFinished ? await getChallengeResultsData(challenge.id) : null;
  const results = resultsData?.results || [];

  const communityWinner = results.find(
    (r) =>
      r.awardType === "community_vote_winner" ||
      (r.awardType === "community_rank" && r.finalRank === 1)
  );
  const juryWinners = results.filter((r) => r.awardType === "jury_award");

  const isSubmissionOpen = challenge.effectiveStatus === "submission_open";
  const isVotingOpen =
    challenge.effectiveStatus === "voting_open" ||
    challenge.effectiveStatus === "tiebreak_open";

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "submission_open":
        return "Submisi Dibuka";
      case "submission_locked":
        return "Submisi Ditutup";
      case "voting_open":
        return "Voting Berlangsung";
      case "tie_pending":
        return "Hasil Seri";
      case "tiebreak_open":
        return "Babak Tiebreak";
      case "jury_selection_open":
        return "Kurasi Juri";
      case "finished":
        return "Selesai";
      default:
        return status.replace(/_/g, " ");
    }
  };

  return (
    <CommunityShell>
      <div className="flex flex-col gap-8 sm:gap-10">
        {/* Breadcrumb & Sub-Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link
              href="/challenges"
              className="inline-flex items-center gap-1.5 text-xs font-mono text-zinc-400 hover:text-amber-400 transition-colors min-h-[44px] min-w-[44px]"
            >
              <ArrowLeft className="h-4 w-4" /> Direktori Challenge
            </Link>
            <span className="text-zinc-600 font-mono text-xs">/</span>
            <span className="text-zinc-300 font-mono text-xs truncate max-w-[200px]">
              {challenge.title}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <StoryCardGenerator
              challenge={{
                title: challenge.title,
                slug: challenge.slug,
                theme: challenge.theme,
                description: challenge.description,
                promptRules: challenge.promptRules,
                submissionDeadline: challenge.submissionDeadline,
                status: challenge.effectiveStatus,
              }}
              defaultMode={isFinished ? "results" : "announcement"}
            />

            <AtelierBadge
              variant={isFinished ? "amber" : isVotingOpen ? "amber" : "default"}
              size="md"
            >
              {getStatusLabel(challenge.effectiveStatus)}
            </AtelierBadge>
          </div>
        </div>

        {/* Hero Banner Card */}
        <section className="glass-panel p-6 sm:p-10 rounded-3xl flex flex-col gap-6 relative overflow-hidden">
          <div className="flex flex-col gap-3">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-400 text-xs font-mono w-fit">
              <Trophy className="h-3.5 w-3.5" />
              <span>Tema: {challenge.theme}</span>
            </div>

            <h1 className="font-display font-extrabold text-2xl sm:text-4xl text-[#f6f2e9] tracking-tight">
              {challenge.title}
            </h1>

            <p className="text-xs sm:text-sm text-zinc-300 font-sans leading-relaxed max-w-3xl">
              {challenge.description}
            </p>
          </div>

          {/* Timelines & Deadlines Info Bar */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 p-5 rounded-2xl bg-white/[0.02] border border-white/5 text-xs">
            <div className="flex flex-col gap-1">
              <span className="text-zinc-500 font-mono">BATAS WAKTU SUBMISI</span>
              <TimestampWITA
                date={challenge.submissionDeadline}
                className="font-semibold text-zinc-200"
              />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-zinc-500 font-mono">BATAS WAKTU VOTING</span>
              <TimestampWITA
                date={challenge.votingDeadline}
                className="font-semibold text-zinc-200"
              />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-zinc-500 font-mono">ALOKASI STARS</span>
              <span className="text-amber-400 font-semibold font-mono">
                {challenge.starsPerMember} Star / Member
              </span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-zinc-500 font-mono">TOTAL SUBMISI</span>
              <span className="text-zinc-200 font-semibold font-mono">
                {candidates.length} Karya
              </span>
            </div>
          </div>

          {/* Stage Timeline Progression */}
          <div className="flex flex-col gap-2 pt-2">
            <span className="text-xs font-mono text-zinc-500">TAHAPAN:</span>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono">
              {[
                {
                  label: "1. Submisi Terbuka",
                  active: challenge.effectiveStatus === "submission_open",
                },
                {
                  label: "2. Voting Komunitas",
                  active: isVotingOpen,
                },
                {
                  label: "3. Kurasi Juri",
                  active: challenge.effectiveStatus === "jury_selection_open",
                },
                {
                  label: "4. Hall of Fame",
                  active: isFinished,
                },
              ].map((st, idx) => (
                <div
                  key={idx}
                  className={`p-3 rounded-xl border text-center transition-all ${
                    st.active
                      ? "bg-amber-500 text-black border-amber-400 font-bold shadow-md shadow-amber-500/20"
                      : "bg-white/[0.02] text-zinc-400 border-white/5"
                  }`}
                >
                  {st.label}
                </div>
              ))}
            </div>
          </div>

          {/* Phase Action CTA Bar */}
          {(isVotingOpen ||
            isFinished ||
            challenge.effectiveStatus === "jury_selection_open") && (
            <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-white/10">
              {isVotingOpen && (
                <Link
                  href={`/challenges/${challenge.slug}/voting`}
                  className="px-6 py-3 min-h-[44px] rounded-2xl bg-amber-500 hover:bg-amber-400 text-black font-semibold text-xs font-sans transition-all shadow-lg shadow-amber-500/20 flex items-center gap-2"
                >
                  <Star className="h-4 w-4 fill-black text-black" />
                  <span>Masuk ke Bilik Suara (Voting) →</span>
                </Link>
              )}

              {(challenge.juryAssignments.some((j) => j.userId === userId) || isStaff) && (
                <Link
                  href={`/challenges/${challenge.slug}/jury`}
                  className="px-5 py-3 min-h-[44px] rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 text-amber-400 font-semibold text-xs font-sans transition-all flex items-center gap-2"
                >
                  <Award className="h-4 w-4 text-amber-400" />
                  <span>Portal Kurasi Dewan Juri</span>
                </Link>
              )}

              {isFinished && (
                <Link
                  href={`/challenges/${challenge.slug}/results`}
                  className="px-6 py-3 min-h-[44px] rounded-2xl bg-amber-500 hover:bg-amber-400 text-black font-semibold text-xs font-sans transition-all shadow-lg shadow-amber-500/20 flex items-center gap-2"
                >
                  <Trophy className="h-4 w-4 text-black" />
                  <span>Halaman Lengkap Hasil Resmi & Hall of Fame →</span>
                </Link>
              )}
            </div>
          )}
        </section>

        {/* ========================================================================= */}
        {/* PAST CHALLENGE PRESENTATION FLOW (GRILL-ME DECISION #4)                    */}
        {/* Order: (1) Theme & Brief -> (2) Results Showcase -> (3) Participant Entries*/}
        {/* ========================================================================= */}
        {isFinished ? (
          <div className="flex flex-col gap-10">
            {/* 1. Original Theme & Brief Rules */}
            <section className="glass-panel p-6 sm:p-8 rounded-3xl flex flex-col gap-4">
              <div className="flex items-center gap-2 border-b border-white/10 pb-3">
                <FileCode className="h-5 w-5 text-amber-400" />
                <h2 className="font-display font-bold text-xl text-[#f6f2e9]">
                  Tema & Ketentuan Orisinal
                </h2>
              </div>
              <div className="text-sm text-zinc-300 font-sans leading-relaxed whitespace-pre-line">
                {challenge.promptRules}
              </div>
            </section>

            {/* 2. Official Results & Winner Showcase */}
            {results.length > 0 && (
              <section className="flex flex-col gap-6">
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <Trophy className="h-6 w-6 text-amber-400" />
                    <h2 className="font-display font-bold text-2xl text-[#f6f2e9]">
                      Pemenang Resmi & Hall of Fame
                    </h2>
                  </div>
                  <p className="text-xs text-zinc-400 font-sans">
                    Karya terbaik pilihan komunitas dan apresiasi khusus dewan kurator juri.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {/* Community Winner Card */}
                  {communityWinner && (
                    <div className="glass-panel rounded-3xl overflow-hidden border border-amber-500/40 p-5 flex flex-col justify-between gap-4 bg-amber-500/[0.02] shadow-xl shadow-amber-500/10">
                      <div className="flex items-center justify-between">
                        <AtelierBadge variant="amber" size="sm" leftIcon={<Crown className="h-3.5 w-3.5" />}>
                          Juara Favorit Komunitas
                        </AtelierBadge>
                        <span className="font-mono text-xs text-amber-400 font-bold">
                          {communityWinner.totalCommunityStars} Stars
                        </span>
                      </div>

                      <div className="aspect-[4/3] rounded-2xl overflow-hidden bg-black/50 relative flex items-center justify-center">
                        {communityWinner.thumbnailStorageKey ? (
                          <ArtworkMediaFrame
                            src={`/api/media/public/${communityWinner.thumbnailStorageKey}`}
                            alt={communityWinner.title || "Karya Pemenang"}
                            isSpoiler={communityWinner.isSpoiler}
                            fill
                          />
                        ) : (
                          <ImageIcon className="h-10 w-10 text-zinc-700" />
                        )}
                      </div>

                      <div className="flex flex-col">
                        <h4 className="font-display font-bold text-base text-[#f6f2e9] truncate">
                          {communityWinner.title || "Karya Pemenang"}
                        </h4>
                        <span className="text-xs text-zinc-400 font-sans">
                          oleh {communityWinner.artistName}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Jury Award Cards */}
                  {juryWinners.map((jury) => (
                    <div
                      key={jury.resultId}
                      className="glass-panel rounded-3xl overflow-hidden border border-white/15 p-5 flex flex-col justify-between gap-4"
                    >
                      <div className="flex items-center justify-between">
                        <AtelierBadge variant="default" size="sm" leftIcon={<Award className="h-3.5 w-3.5" />}>
                          {jury.categoryLabel || "Penghargaan Juri"}
                        </AtelierBadge>
                      </div>

                      <div className="aspect-[4/3] rounded-2xl overflow-hidden bg-black/50 relative flex items-center justify-center">
                        {jury.thumbnailStorageKey ? (
                          <ArtworkMediaFrame
                            src={`/api/media/public/${jury.thumbnailStorageKey}`}
                            alt={jury.title || "Karya Pemenang"}
                            isSpoiler={jury.isSpoiler}
                            fill
                          />
                        ) : (
                          <ImageIcon className="h-10 w-10 text-zinc-700" />
                        )}
                      </div>

                      <div className="flex flex-col">
                        <h4 className="font-display font-bold text-base text-[#f6f2e9] truncate">
                          {jury.title || "Karya Pemenang"}
                        </h4>
                        <span className="text-xs text-zinc-400 font-sans">
                          oleh {jury.artistName}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* 3. Candidate Submissions Archive */}
            <section className="flex flex-col gap-6 pt-6 border-t border-white/10">
              <div>
                <h2 className="font-display font-bold text-2xl text-[#f6f2e9]">
                  Arsip Seluruh Karya Peserta ({candidates.length})
                </h2>
                <p className="text-xs text-zinc-400 font-sans mt-1">
                  Karya-karya yang berpartisipasi dalam challenge ini.
                </p>
              </div>

              {candidates.length === 0 ? (
                <div className="glass-panel p-12 rounded-3xl text-center text-xs text-zinc-500">
                  Tidak ada karya terdaftar pada challenge ini.
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6">
                  {candidates.map((sub) => {
                    const thumbUrl = sub.thumbnailStorageKey
                      ? `/api/media/public/${sub.thumbnailStorageKey}`
                      : "";
                    const artworkHref = sub.artworkSlug
                      ? `/artworks/${sub.artworkSlug}?from=${encodeURIComponent(`/challenges/${challenge.slug}`)}`
                      : null;

                    return (
                      <div
                        key={sub.submissionId}
                        className="glass-panel rounded-2xl overflow-hidden group flex flex-col justify-between hover:border-white/20 transition-all"
                      >
                        {artworkHref ? (
                          <Link
                            href={artworkHref}
                            className="aspect-[4/3] bg-black/40 relative overflow-hidden flex items-center justify-center block"
                          >
                            {thumbUrl ? (
                              <ArtworkMediaFrame
                                src={thumbUrl}
                                alt={sub.title}
                                isSpoiler={sub.isSpoiler}
                                fill
                              />
                            ) : (
                              <ImageIcon className="h-8 w-8 text-zinc-700" />
                            )}
                          </Link>
                        ) : (
                          <div className="aspect-[4/3] bg-black/40 relative overflow-hidden flex items-center justify-center">
                            {thumbUrl ? (
                              <ArtworkMediaFrame
                                src={thumbUrl}
                                alt={sub.title}
                                isSpoiler={sub.isSpoiler}
                                fill
                              />
                            ) : (
                              <ImageIcon className="h-8 w-8 text-zinc-700" />
                            )}
                          </div>
                        )}

                        <div className="p-3 sm:p-4 flex flex-col gap-1.5">
                          {artworkHref ? (
                            <Link
                              href={artworkHref}
                              className="font-display font-bold text-xs sm:text-sm text-[#f6f2e9] hover:text-amber-300 transition-colors truncate"
                            >
                              {sub.title}
                            </Link>
                          ) : (
                            <h4 className="font-display font-bold text-xs sm:text-sm text-[#f6f2e9] truncate">
                              {sub.title}
                            </h4>
                          )}
                          <Link
                            href={`/artists/${sub.artistSlug}`}
                            className="text-xs text-zinc-400 hover:text-white transition-colors truncate"
                          >
                            oleh {sub.artistName}
                          </Link>

                          {isStaff && (
                            <div className="pt-2 border-t border-white/5 flex justify-end">
                              <CandidateStaffDisqualifyButton
                                submissionId={sub.submissionId}
                                candidateTitle={sub.title}
                                challengeTitle={challenge.title}
                                isStaff={isStaff}
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        ) : (
          /* ========================================================================= */
          /* ACTIVE CHALLENGE PRESENTATION FLOW                                         */
          /* ========================================================================= */
          <div className="flex flex-col gap-10">
            {/* Grid: Participation Status / Submission Box + Prompt Rules & Kits */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Left Column (2 Cols): Member Submission Box & Rules */}
              <div className="lg:col-span-2 flex flex-col gap-8">
                {/* Member Submission Status & Actions */}
                {session ? (
                  <section className="glass-panel p-6 sm:p-8 rounded-3xl flex flex-col gap-5 border border-amber-500/30">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Sparkles className="h-5 w-5 text-amber-400" />
                        <h3 className="font-display font-bold text-lg text-[#f6f2e9]">
                          Status Partisipasi Submisi
                        </h3>
                      </div>
                      {userSubmission ? (
                        <AtelierBadge variant="success" size="sm">
                          Submisi Aktif (Versi {userSubmission.currentVersion?.versionNumber || 1})
                        </AtelierBadge>
                      ) : (
                        <span className="text-xs font-mono text-zinc-400">
                          Belum Mengirimkan Karya
                        </span>
                      )}
                    </div>

                    {userSubmission && userSubmission.currentVersion ? (
                      <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/10 flex flex-col sm:flex-row items-start sm:items-center gap-5">
                        <div className="h-20 w-28 bg-black/40 rounded-xl overflow-hidden flex items-center justify-center shrink-0 border border-white/10 relative">
                          {userSubmission.currentVersion.thumbnailStorageKey ? (
                            <ArtworkMediaFrame
                              src={`/api/media/public/${userSubmission.currentVersion.thumbnailStorageKey}`}
                              alt={userSubmission.currentVersion.title}
                              isSpoiler={userSubmission.isSpoiler}
                              fill
                            />
                          ) : (
                            <ImageIcon className="h-6 w-6 text-zinc-600" />
                          )}
                        </div>

                        <div className="flex flex-col gap-1 flex-1 min-w-0">
                          <h4 className="font-display font-bold text-base text-[#f6f2e9] truncate">
                            {userSubmission.currentVersion.title}
                          </h4>
                          <span className="text-xs text-zinc-400 font-mono">
                            Software: {userSubmission.currentVersion.softwareUsed || "Tidak disebutkan"}
                          </span>
                          <span className="text-[11px] text-zinc-500 font-mono">
                            Waktu Submisi:{" "}
                            <TimestampWITA
                              date={userSubmission.currentVersion.submittedAt}
                              includeTime={true}
                              className="text-[11px]"
                            />
                          </span>
                        </div>

                        {isSubmissionOpen && (
                          <ChallengeSubmissionModal
                            challengeId={challenge.id}
                            challengeTitle={challenge.title}
                            userId={session?.user?.id}
                            isRevision={true}
                            initialTitle={userSubmission.currentVersion.title}
                            initialDescription={userSubmission.currentVersion.description || ""}
                            initialSoftware={userSubmission.currentVersion.softwareUsed || ""}
                            initialSpoiler={userSubmission.isSpoiler}
                          />
                        )}
                      </div>
                    ) : (
                      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                        <p className="text-xs sm:text-sm text-zinc-300 font-sans max-w-md">
                          {isSubmissionOpen
                            ? "Periode submisi sedang dibuka. Unggah karya terbaik kamu sebelum batas waktu deadline."
                            : "Periode pengiriman submisi untuk challenge ini sedang tidak dibuka."}
                        </p>

                        {isSubmissionOpen && (
                          <ChallengeSubmissionModal
                            challengeId={challenge.id}
                            challengeTitle={challenge.title}
                            userId={session?.user?.id}
                            submissionDeadline={challenge.submissionDeadline}
                          />
                        )}
                      </div>
                    )}
                  </section>
                ) : (
                  <div className="glass-panel p-6 rounded-3xl flex items-center justify-between gap-4">
                    <span className="text-xs sm:text-sm text-zinc-300 font-sans">
                      Masuk sebagai anggota komunitas atelier untuk mengirimkan karya submisi ke challenge ini.
                    </span>
                    <Link
                      href="/login"
                      className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-xs font-semibold font-sans transition-all shrink-0 min-h-[44px] flex items-center"
                    >
                      Masuk Sekarang
                    </Link>
                  </div>
                )}

                {/* Prompt & Rules Section */}
                <section className="glass-panel p-6 sm:p-8 rounded-3xl flex flex-col gap-4">
                  <div className="flex items-center gap-2 border-b border-white/10 pb-3">
                    <FileCode className="h-5 w-5 text-amber-400" />
                    <h2 className="font-display font-bold text-xl text-[#f6f2e9]">
                      Ketentuan & Aturan Prompt
                    </h2>
                  </div>

                  <div className="text-sm text-zinc-300 font-sans leading-relaxed whitespace-pre-line">
                    {challenge.promptRules}
                  </div>
                </section>
              </div>

              {/* Right Column: Challenge Kit & Awards Preview */}
              <div className="flex flex-col gap-6">
                {/* Challenge Kit Files Panel */}
                {challenge.kitFiles.length > 0 && (
                  <section className="glass-panel p-6 rounded-3xl flex flex-col gap-4">
                    <div className="flex items-center gap-2">
                      <FileCode className="h-5 w-5 text-amber-400" />
                      <h3 className="font-display font-bold text-base text-[#f6f2e9]">
                        Challenge Kit & Template
                      </h3>
                    </div>
                    <p className="text-xs text-zinc-400 font-sans">
                      Unduh berkas aset panduan atau template resmi untuk challenge ini.
                    </p>

                    <div className="flex flex-col gap-2">
                      {challenge.kitFiles.map((kit) => (
                        <a
                          key={kit.id}
                          href={`/api/challenges/kit/${kit.fileStorageKey}`}
                          className="p-3.5 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 transition-colors flex items-center justify-between gap-3 text-xs font-mono min-h-[44px]"
                        >
                          <div className="flex items-center gap-2.5 truncate">
                            <Download className="h-4 w-4 text-amber-400 shrink-0" />
                            <span className="text-zinc-200 truncate">{kit.fileName}</span>
                          </div>
                          <span className="text-[10px] text-zinc-500 uppercase">
                            {(kit.fileSizeBytes / (1024 * 1024)).toFixed(1)} MB
                          </span>
                        </a>
                      ))}
                    </div>
                  </section>
                )}

                {/* Awards Summary */}
                <section className="glass-panel p-6 rounded-3xl flex flex-col gap-4">
                  <div className="flex items-center gap-2">
                    <Award className="h-5 w-5 text-amber-400" />
                    <h3 className="font-display font-bold text-base text-[#f6f2e9]">
                      Penghargaan & Kategori
                    </h3>
                  </div>

                  <div className="flex flex-col gap-2.5">
                    {(challenge.awardMode === "vote_only" ||
                      challenge.awardMode === "vote_and_jury") && (
                      <div className="p-3.5 rounded-2xl bg-white/[0.02] border border-white/5 flex items-center justify-between gap-3 text-xs">
                        <div className="flex items-center gap-2.5">
                          <span className="h-6 w-6 rounded-lg bg-amber-500/20 text-amber-400 font-bold font-mono flex items-center justify-center text-xs">
                            ★
                          </span>
                          <span className="font-semibold text-zinc-200">
                            Juara Favorit Komunitas
                          </span>
                        </div>
                        <span className="text-[10px] font-mono text-amber-400/80">
                          BINTANG KOMUNITAS
                        </span>
                      </div>
                    )}
                    {(challenge.awardMode === "jury_only" ||
                      challenge.awardMode === "vote_and_jury") && (
                      <div className="p-3.5 rounded-2xl bg-white/[0.02] border border-white/5 flex items-center justify-between gap-3 text-xs">
                        <div className="flex items-center gap-2.5">
                          <span className="h-6 w-6 rounded-lg bg-purple-500/20 text-purple-400 font-bold font-mono flex items-center justify-center text-xs">
                            ★
                          </span>
                          <span className="font-semibold text-zinc-200">
                            Penghargaan Khusus Juri
                          </span>
                        </div>
                        <span className="text-[10px] font-mono text-purple-400/80">
                          PILIHAN JURI
                        </span>
                      </div>
                    )}
                  </div>
                </section>
              </div>
            </div>

            {/* Candidate Submissions Gallery (2-4 cols, aspect ratio preserved) */}
            <section className="flex flex-col gap-6 pt-6 border-t border-white/10">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h2 className="font-display font-bold text-xl sm:text-2xl text-[#f6f2e9]">
                    Karya Submisi Peserta ({candidates.length})
                  </h2>
                  <p className="text-xs text-zinc-400 font-sans mt-0.5">
                    Seluruh karya peserta ditampilkan dengan bobot visual yang seimbang.
                  </p>
                </div>
              </div>

              {candidates.length === 0 ? (
                <div className="glass-panel p-16 rounded-3xl flex flex-col items-center justify-center text-center gap-3">
                  <Trophy className="h-10 w-10 text-zinc-600" />
                  <h3 className="font-display font-bold text-lg text-white">
                    Belum ada karya terdaftar
                  </h3>
                  <p className="text-xs text-zinc-400 font-sans max-w-sm">
                    Jadilah peserta pertama yang mengirimkan karya untuk challenge ini!
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-6">
                  {candidates.map((sub) => {
                    const thumbUrl = sub.thumbnailStorageKey
                      ? `/api/media/public/${sub.thumbnailStorageKey}`
                      : "";
                    const artworkHref = sub.artworkSlug
                      ? `/artworks/${sub.artworkSlug}?from=${encodeURIComponent(`/challenges/${challenge.slug}`)}`
                      : null;

                    return (
                      <div
                        key={sub.submissionId}
                        className="glass-panel rounded-2xl overflow-hidden group flex flex-col justify-between hover:border-white/20 transition-all"
                      >
                        {artworkHref ? (
                          <Link
                            href={artworkHref}
                            className="aspect-[4/3] bg-black/40 relative overflow-hidden flex items-center justify-center block"
                          >
                            {thumbUrl ? (
                              <ArtworkMediaFrame
                                src={thumbUrl}
                                alt={sub.title}
                                isSpoiler={sub.isSpoiler}
                                fill
                              />
                            ) : (
                              <ImageIcon className="h-8 w-8 text-zinc-700" />
                            )}
                          </Link>
                        ) : (
                          <div className="aspect-[4/3] bg-black/40 relative overflow-hidden flex items-center justify-center">
                            {thumbUrl ? (
                              <ArtworkMediaFrame
                                src={thumbUrl}
                                alt={sub.title}
                                isSpoiler={sub.isSpoiler}
                                fill
                              />
                            ) : (
                              <ImageIcon className="h-8 w-8 text-zinc-700" />
                            )}
                          </div>
                        )}

                        <div className="p-3 sm:p-4 flex flex-col gap-1.5">
                          {artworkHref ? (
                            <Link
                              href={artworkHref}
                              className="font-display font-bold text-xs sm:text-sm text-[#f6f2e9] hover:text-amber-300 transition-colors truncate"
                            >
                              {sub.title}
                            </Link>
                          ) : (
                            <h4 className="font-display font-bold text-xs sm:text-sm text-[#f6f2e9] truncate">
                              {sub.title}
                            </h4>
                          )}
                          <Link
                            href={`/artists/${sub.artistSlug}`}
                            className="text-xs text-zinc-400 hover:text-white transition-colors truncate"
                          >
                            oleh {sub.artistName}
                          </Link>

                          {sub.softwareUsed && (
                            <div className="pt-1.5 border-t border-white/5 flex items-center justify-between text-[11px] font-mono text-zinc-500">
                              <span className="truncate">{sub.softwareUsed}</span>
                            </div>
                          )}

                          {isStaff && (
                            <div className="pt-2 border-t border-white/5 flex justify-end">
                              <CandidateStaffDisqualifyButton
                                submissionId={sub.submissionId}
                                candidateTitle={sub.title}
                                challengeTitle={challenge.title}
                                isStaff={isStaff}
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </CommunityShell>
  );
}
