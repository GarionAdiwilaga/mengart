import { getChallengeBySlug } from "@/lib/challenges";
import { getJuryWorkspaceData } from "@/lib/services/juryService";
import { requireAuth } from "@/lib/rbac";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Award, Shield } from "lucide-react";
import { JuryAwardWorkspace } from "@/components/jury/JuryAwardWorkspace";

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

  const workspaceData = await getJuryWorkspaceData(challenge.id, user.id);
  if (!workspaceData) notFound();

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
            Kurasi & Penghargaan Juri: {challenge.title}
          </h1>

          <p className="text-xs text-zinc-400 font-sans max-w-2xl">
            Sesi musyawarah dewan juri. Jury Recorder yang ditunjuk mencatat penghargaan kategori bebas yang telah disepakati bersama.
          </p>
        </div>
      </section>

      {/* Simplified Jury Workspace Component */}
      <JuryAwardWorkspace
        challenge={{
          id: challenge.id,
          slug: challenge.slug,
          title: challenge.title,
          awardMode: challenge.awardMode,
          status: challenge.status,
        }}
        juryAssignments={workspaceData.juryAssignments}
        readiness={workspaceData.readiness}
        communityWinner={workspaceData.communityWinner}
        candidates={workspaceData.candidates}
        draftAwards={workspaceData.draftAwards}
        isRecorder={workspaceData.isRecorder}
        isAssignedJury={workspaceData.isAssignedJury}
        isAdmin={user.role === "admin"}
        isModerator={user.role === "moderator"}
      />
    </main>
  );
}
