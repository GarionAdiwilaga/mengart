import { getChallengeBySlug } from "@/lib/challenges";
import { getChallengeVotingData } from "@/lib/voting";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { Trophy, AlertTriangle, Clock } from "lucide-react";
import { VotingWorkspace } from "@/components/voting/VotingWorkspace";
import { TiePendingAdminPanel } from "@/components/voting/TiePendingAdminPanel";
import { FocusedTaskShell } from "@/components/layout/shells/FocusedTaskShell";
import { AtelierBadge } from "@/components/ui/atoms/AtelierBadge";
import { TimestampWITA } from "@/components/ui/atoms/TimestampWITA";
import { db } from "@/db";
import { challengeVotingRounds } from "@/db/schema";
import { eq, and } from "drizzle-orm";

interface VotingPageProps {
  params: Promise<{ slug: string }>;
}

export default async function ChallengeVotingPage({ params }: VotingPageProps) {
  const { slug } = await params;
  const session = await auth();
  const userId = session?.user?.id;
  const userRole = (session?.user as any)?.role || "member";
  const isStaff = userRole === "admin" || userRole === "moderator";

  const challenge = await getChallengeBySlug(slug, { allowInvisible: isStaff });

  if (!challenge) {
    notFound();
  }

  const votingData = await getChallengeVotingData(challenge.id, userId);
  if (!votingData) {
    notFound();
  }

  const isVotingOpen =
    challenge.status === "voting_open" || challenge.status === "tiebreak_open";

  const isTiePending = challenge.status === "tie_pending";

  // Check if a tiebreak round already exists in database
  const existingTiebreakRounds = await db
    .select({ id: challengeVotingRounds.id })
    .from(challengeVotingRounds)
    .where(
      and(
        eq(challengeVotingRounds.challengeId, challenge.id),
        eq(challengeVotingRounds.roundType, "tiebreak")
      )
    )
    .limit(1);

  const hasExistingTiebreakRound = existingTiebreakRounds.length > 0;

  const currentRound = votingData.votingRound;
  const activeDeadline = currentRound?.deadline || challenge.votingDeadline;

  // Build initial allocations dictionary
  const initialAllocations: { [submissionId: string]: number } = {};
  for (const c of votingData.candidates) {
    if (c.userAllocatedStars > 0) {
      initialAllocations[c.submissionId] = c.userAllocatedStars;
    }
  }

  // Identify tied candidates if in tie_pending
  const maxStars = Math.max(...votingData.candidates.map((c) => c.totalStars), 0);
  const tiedCandidates =
    currentRound?.roundType === "tiebreak" && maxStars === 0
      ? votingData.candidates
      : votingData.candidates.filter((c) => c.totalStars === maxStars);

  const isTiebreak = currentRound?.roundType === "tiebreak";

  return (
    <FocusedTaskShell
      backHref={`/challenges/${challenge.slug}`}
      backLabel="Kembali ke Challenge"
      title={challenge.title}
      rightAction={
        <AtelierBadge variant="amber" size="md">
          {isTiebreak ? "Babak Tiebreak" : "Bilik Suara"}
        </AtelierBadge>
      }
    >
      <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6 sm:py-8 flex flex-col gap-6 flex-1">
        {/* Hero Context Header */}
        <section className="glass-panel p-6 sm:p-8 rounded-3xl flex flex-col sm:flex-row sm:items-center justify-between gap-6">
          <div className="flex flex-col gap-2">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-400 text-xs font-mono w-fit">
              <Trophy className="h-3.5 w-3.5" />
              <span>Tema: {challenge.theme}</span>
            </div>

            <h1 className="font-display font-extrabold text-2xl sm:text-3xl text-[#f6f2e9] tracking-tight">
              {isTiebreak ? "Babak Tiebreak Peringkat 1" : "Pemungutan Suara Komunitas"}
            </h1>

            <p className="text-xs sm:text-sm text-zinc-400 font-sans max-w-2xl leading-relaxed">
              {isTiebreak
                ? "Babak penentuan Juara 1 Komunitas. Berikan 1 Star kepada karya terbaik di antara kandidat yang memperoleh nilai seri."
                : "Berikan apresiasi Star kepada karya favorit kamu. Suara tersimpan seketika dan dapat disesuaikan hingga batas waktu voting berakhir."}
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/10 flex flex-col gap-1 shrink-0 text-xs">
            <span className="text-zinc-500 font-mono">BATAS WAKTU VOTING</span>
            {activeDeadline ? (
              <TimestampWITA date={activeDeadline} includeTime={true} className="text-sm font-semibold text-zinc-200" />
            ) : (
              <span className="text-zinc-400">Belum Ditentukan</span>
            )}
            <span className="text-amber-400 font-mono text-[11px] mt-1">
              Alokasi: {currentRound?.starsPerMember || challenge.starsPerMember} Star / Member
            </span>
          </div>
        </section>

        {/* TIE_PENDING STATE */}
        {isTiePending ? (
          isStaff ? (
            <TiePendingAdminPanel
              challengeId={challenge.id}
              challengeSlug={challenge.slug}
              tiedCandidates={tiedCandidates}
              hasExistingTiebreakRound={hasExistingTiebreakRound}
            />
          ) : (
            <div className="glass-panel p-8 rounded-3xl border border-amber-500/30 flex flex-col items-center justify-center text-center gap-4 bg-amber-500/[0.02]">
              <div className="p-4 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400">
                <AlertTriangle className="h-8 w-8" />
              </div>
              <h3 className="font-display font-extrabold text-xl sm:text-2xl text-[#f6f2e9]">
                Voting Ditutup — Hasil Seri Menunggu Keputusan
              </h3>
              <p className="text-xs sm:text-sm text-zinc-400 font-sans max-w-lg leading-relaxed">
                Pemungutan suara telah selesai dengan hasil seri pada peringkat pertama. Pemenang resmi sedang dalam peninjauan oleh dewan kurator atelier atau melalui babak penentuan lanjutan.
              </p>
            </div>
          )
        ) : isVotingOpen ? (
          /* Voting Interactive Workspace */
          <VotingWorkspace
            challengeId={challenge.id}
            challengeTitle={challenge.title}
            challengeSlug={challenge.slug}
            votingRoundId={currentRound?.id}
            roundType={currentRound?.roundType as any}
            roundDeadline={currentRound?.deadline}
            userId={session?.user?.id}
            candidates={votingData.candidates}
            initialAllocations={initialAllocations}
            maxStars={votingData.userBallot.maxStars}
            initialRemainingStars={votingData.userBallot.remainingStars}
            isLoggedIn={!!session}
          />
        ) : (
          <div className="glass-panel p-12 rounded-3xl border border-white/10 flex flex-col items-center justify-center text-center gap-3">
            <Clock className="h-8 w-8 text-zinc-500" />
            <h3 className="font-display font-bold text-lg text-zinc-300">
              Pemungutan Suara Sedang Tidak Dibuka
            </h3>
            <p className="text-xs text-zinc-500 font-sans">
              Status challenge saat ini: &ldquo;{challenge.status}&rdquo;.
            </p>
          </div>
        )}
      </div>
    </FocusedTaskShell>
  );
}
