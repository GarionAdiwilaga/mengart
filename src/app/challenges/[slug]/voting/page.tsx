import { getChallengeBySlug } from "@/lib/challenges";
import { getChallengeVotingData } from "@/lib/voting";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import Link from "next/link";
import { ArrowLeft, Star, Clock, Trophy } from "lucide-react";
import { VotingWorkspace } from "@/components/voting/VotingWorkspace";

interface VotingPageProps {
  params: Promise<{ slug: string }>;
}

export default async function ChallengeVotingPage({ params }: VotingPageProps) {
  const { slug } = await params;
  const challenge = await getChallengeBySlug(slug);

  if (!challenge) {
    notFound();
  }

  const session = await auth();
  const userId = session?.user?.id;

  const votingData = await getChallengeVotingData(challenge.id, userId);
  if (!votingData) {
    notFound();
  }

  const isVotingOpen =
    votingData.effectiveStatus === "voting_open" ||
    votingData.effectiveStatus === "tiebreak_open";

  const formattedVotingDeadline = challenge.votingDeadline
    ? new Intl.DateTimeFormat("id-ID", {
        timeZone: "Asia/Makassar",
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(challenge.votingDeadline)) + " WITA"
    : "Belum Ditentukan";

  // Build initial allocations dictionary
  const initialAllocations: { [submissionId: string]: number } = {};
  for (const c of votingData.candidates) {
    if (c.userAllocatedStars > 0) {
      initialAllocations[c.submissionId] = c.userAllocatedStars;
    }
  }

  return (
    <main className="p-6 sm:p-12 max-w-7xl mx-auto flex flex-col gap-8 flex-1">
      {/* Breadcrumb & Sub-Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href={`/challenges/${challenge.slug}`}
            className="inline-flex items-center gap-1.5 text-xs font-mono text-zinc-400 hover:text-amber-400 transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Kembali ke Challenge
          </Link>
        </div>

        <div className="flex items-center gap-3">
          <span className="px-3 py-1 rounded-full text-xs font-mono font-bold uppercase border bg-amber-500/10 text-amber-400 border-amber-500/30 flex items-center gap-1.5">
            <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
            <span>BABAK VOTING KOMUNITAS</span>
          </span>
        </div>
      </div>

      {/* Hero Banner */}
      <section className="glass-panel p-6 sm:p-8 rounded-3xl flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <div className="flex flex-col gap-2">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-400 text-xs font-mono w-fit">
            <Trophy className="h-3.5 w-3.5" />
            <span>{challenge.theme}</span>
          </div>

          <h1 className="font-display font-extrabold text-2xl sm:text-3xl text-[#f6f2e9] tracking-tight">
            Bilik Suara: {challenge.title}
          </h1>

          <p className="text-xs text-zinc-400 font-sans max-w-2xl">
            Berikan apresiasi Stars kepada karya favorit Anda. Pilihan bersifat anonim dan dapat disesuaikan hingga batas waktu voting berakhir.
          </p>
        </div>

        <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/10 flex flex-col gap-1 shrink-0 text-xs font-mono">
          <span className="text-zinc-500">DEADLINE VOTING</span>
          <span className="text-zinc-200 font-semibold">{formattedVotingDeadline}</span>
          <span className="text-amber-400 text-[11px] mt-1">
            Alokasi: {challenge.starsPerMember} Stars / Member
          </span>
        </div>
      </section>

      {/* Voting Interactive Workspace */}
      <VotingWorkspace
        challengeId={challenge.id}
        challengeTitle={challenge.title}
        challengeSlug={challenge.slug}
        candidates={votingData.candidates}
        initialAllocations={initialAllocations}
        maxStars={votingData.userBallot.maxStars}
        initialRemainingStars={votingData.userBallot.remainingStars}
        isLoggedIn={!!session}
      />
    </main>
  );
}
