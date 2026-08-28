import { getChallengeBySlug } from "@/lib/challenges";
import { getChallengeVotingData } from "@/lib/voting";
import { requireAuth } from "@/lib/rbac";
import { db } from "@/db";
import { challengeJuryScores } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Award, Shield, User, Image as ImageIcon, Sparkles, CheckCircle2 } from "lucide-react";
import { JuryEvaluationForm } from "@/components/jury/JuryEvaluationForm";
import {
  computeChallengeResultsAction,
  publishChallengeResultsAction,
} from "@/app/actions/voting";

interface JuryPageProps {
  params: Promise<{ slug: string }>;
}

export default async function ChallengeJuryPage({ params }: JuryPageProps) {
  const user = await requireAuth("/login");
  const { slug } = await params;
  const challenge = await getChallengeBySlug(slug);

  if (!challenge) {
    notFound();
  }

  // Check if user is an assigned jury member or admin/moderator
  const isAssignedJury = challenge.juryAssignments.some((j) => j.userId === user.id);
  const isModOrAdmin = user.role === "moderator" || user.role === "admin";

  if (!isAssignedJury && !isModOrAdmin) {
    redirect(`/challenges/${challenge.slug}?error=JuryOnly`);
  }

  const votingData = await getChallengeVotingData(challenge.id, user.id);
  if (!votingData) notFound();

  // Fetch current jury user's existing evaluations
  const existingEvaluations = await db
    .select()
    .from(challengeJuryScores)
    .where(
      and(
        eq(challengeJuryScores.challengeId, challenge.id),
        eq(challengeJuryScores.juryUserId, user.id)
      )
    );

  const evaluationMap = new Map<string, (typeof existingEvaluations)[0]>();
  for (const ev of existingEvaluations) {
    evaluationMap.set(ev.submissionId, ev);
  }

  const winnerSlotOptions = challenge.winnerSlots.map((s) => ({
    id: s.id,
    title: s.title,
    slotType: s.slotType as "community_vote" | "jury_award",
    rank: s.rank,
  }));

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
            <Award className="h-3.5 w-3.5" />
            <span>PORTAL KURASI DEWAN JURI</span>
          </span>
        </div>
      </div>

      {/* Hero Banner */}
      <section className="glass-panel p-6 sm:p-8 rounded-3xl flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <div className="flex flex-col gap-2">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-400 text-xs font-mono w-fit">
            <Shield className="h-3.5 w-3.5" />
            <span>AKSES PANEL JURI</span>
          </div>

          <h1 className="font-display font-extrabold text-2xl sm:text-3xl text-[#f6f2e9] tracking-tight">
            Kurasi & Evaluasi Juri: {challenge.title}
          </h1>

          <p className="text-xs text-zinc-400 font-sans max-w-2xl">
            Berikan skor kualitas, catatan kritik konstruktif, serta tentukan pemenang slot penghargaan juri untuk karya terbaik.
          </p>
        </div>

        {isModOrAdmin ? (
          <div className="flex items-center gap-3">
            {challenge.status === "review" ? (
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
                  <span>Publikasikan Hasil Resmi</span>
                </button>
              </form>
            ) : challenge.status !== "finished" ? (
              <form
                action={async () => {
                  "use server";
                  await computeChallengeResultsAction(challenge.id);
                }}
              >
                <button
                  type="submit"
                  className="px-6 py-3.5 rounded-2xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs font-mono transition-all shadow-lg shadow-amber-500/20 flex items-center gap-2 cursor-pointer"
                >
                  <Sparkles className="h-4 w-4 text-black" />
                  <span>Hitung Hasil (Masuk Tahap Review)</span>
                </button>
              </form>
            ) : (
              <Link
                href={`/challenges/${challenge.slug}/results`}
                className="px-6 py-3.5 rounded-2xl bg-zinc-800 hover:bg-zinc-700 text-amber-400 font-bold text-xs font-mono transition-all flex items-center gap-2"
              >
                <span>Lihat Hasil Resmi</span>
              </Link>
            )}
          </div>
        ) : null}
      </section>

      {/* Candidate List with Evaluation Forms */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {votingData.candidates.map((cand) => {
          const evalItem = evaluationMap.get(cand.submissionId);
          const thumbUrl = cand.thumbnailStorageKey
            ? `/api/media/public/${cand.thumbnailStorageKey}`
            : null;

          return (
            <div
              key={cand.submissionId}
              className="glass-panel rounded-3xl overflow-hidden flex flex-col justify-between border border-white/10 p-5 gap-4"
            >
              <div className="aspect-[16/10] bg-black/40 rounded-2xl overflow-hidden relative flex items-center justify-center border border-white/5">
                {thumbUrl ? (
                  <img
                    src={thumbUrl}
                    alt={cand.title}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <ImageIcon className="h-8 w-8 text-zinc-700" />
                )}
                <div className="absolute bottom-3 left-3 px-2.5 py-1 rounded-full bg-black/80 backdrop-blur-md text-[11px] font-mono text-amber-400">
                  {cand.totalStars} Stars Komunitas
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <h3 className="font-display font-bold text-lg text-[#f6f2e9]">{cand.title}</h3>
                <Link
                  href={`/artists/${cand.artistSlug}`}
                  className="text-xs text-zinc-400 hover:text-white transition-colors inline-flex items-center gap-1"
                >
                  <User className="h-3.5 w-3.5 text-amber-400" />
                  <span>{cand.artistName}</span>
                </Link>
                {cand.description ? (
                  <p className="text-xs text-zinc-300 font-sans mt-2 line-clamp-2">
                    {cand.description}
                  </p>
                ) : null}
              </div>

              {/* Jury Evaluation Form */}
              <JuryEvaluationForm
                challengeId={challenge.id}
                submissionId={cand.submissionId}
                winnerSlots={winnerSlotOptions}
                initialSlotId={evalItem?.winnerSlotId}
                initialScore={evalItem?.score}
                initialNotes={evalItem?.critiqueNotes}
              />
            </div>
          );
        })}
      </div>
    </main>
  );
}
