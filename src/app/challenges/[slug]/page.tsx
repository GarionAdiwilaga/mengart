import { getChallengeBySlug, getUserChallengeSubmission, getChallengeCandidates } from "@/lib/challenges";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/db";
import { artworks, artworkVersions } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";
import Link from "next/link";
import {
  Palette,
  Trophy,
  ArrowLeft,
  Clock,
  Download,
  ShieldCheck,
  Award,
  Sparkles,
  Users,
  CheckCircle2,
  FileCode,
  Image as ImageIcon,
  ExternalLink,
  Star,
} from "lucide-react";
import { ChallengeSubmissionModal } from "@/components/challenges/ChallengeSubmissionModal";

interface ChallengeDetailPageProps {
  params: Promise<{ slug: string }>;
}

export default async function ChallengeDetailPage({ params }: ChallengeDetailPageProps) {
  const { slug } = await params;
  const challenge = await getChallengeBySlug(slug);

  if (!challenge) {
    notFound();
  }

  const session = await auth();
  const userId = session?.user?.id;

  // Fetch current user's submission if logged in
  const userSubmission = userId
    ? await getUserChallengeSubmission(challenge.id, userId)
    : null;

  // Fetch member's portfolio artworks for picking from vault
  const memberArtworks = userId
    ? await db
        .select({
          versionId: artworkVersions.id,
          title: artworks.title,
          thumbnailStorageKey: artworkVersions.thumbnailStorageKey,
        })
        .from(artworks)
        .innerJoin(artworkVersions, eq(artworkVersions.id, artworks.currentVersionId))
        .where(eq(artworks.userId, userId))
        .orderBy(desc(artworks.createdAt))
    : [];

  const portfolioOptions = memberArtworks.map((a) => ({
    versionId: a.versionId,
    title: a.title,
    thumbnailUrl: a.thumbnailStorageKey ? `/api/media/public/${a.thumbnailStorageKey}` : null,
  }));

  // Fetch all candidate submissions
  const candidates = await getChallengeCandidates(challenge.id);

  const formattedSubmissionDeadline = challenge.submissionDeadline
    ? new Intl.DateTimeFormat("id-ID", {
        timeZone: "Asia/Makassar",
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(challenge.submissionDeadline)) + " WITA"
    : "Belum Ditentukan";

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

  const isSubmissionOpen = challenge.effectiveStatus === "submission_open";

  return (
    <main className="p-6 sm:p-12 max-w-7xl mx-auto flex flex-col gap-10 flex-1">
      {/* Breadcrumb & Status Bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/challenges"
            className="inline-flex items-center gap-1.5 text-xs font-mono text-zinc-400 hover:text-amber-400 transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Direktori Challenge
          </Link>
          <span className="text-zinc-600 font-mono text-xs">/</span>
          <span className="text-zinc-300 font-mono text-xs truncate max-w-[200px]">
            {challenge.title}
          </span>
        </div>

        <div className="flex items-center gap-3">
          <span className="px-3 py-1 rounded-full text-xs font-mono font-bold uppercase border bg-amber-500/10 text-amber-400 border-amber-500/30">
            STATUS: {challenge.effectiveStatus.replace(/_/g, " ")}
          </span>
        </div>
      </div>

      {/* Hero Banner Card */}
      <section className="glass-panel p-8 sm:p-10 rounded-3xl flex flex-col gap-6 relative overflow-hidden">
        <div className="flex flex-col gap-3">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-400 text-xs font-mono w-fit">
            <Trophy className="h-3.5 w-3.5" />
            <span>TEMA: {challenge.theme}</span>
          </div>

          <h1 className="font-display font-extrabold text-3xl sm:text-4xl text-[#f6f2e9] tracking-tight">
            {challenge.title}
          </h1>

          <p className="text-sm text-zinc-300 font-sans leading-relaxed max-w-3xl">
            {challenge.description}
          </p>
        </div>

        {/* Timelines & Deadlines Info Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 p-5 rounded-2xl bg-white/[0.02] border border-white/5 text-xs font-mono">
          <div className="flex flex-col gap-1">
            <span className="text-zinc-500">DEADLINE SUBMISI</span>
            <span className="text-zinc-200 font-semibold">{formattedSubmissionDeadline}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-zinc-500">DEADLINE VOTING</span>
            <span className="text-zinc-200 font-semibold">{formattedVotingDeadline}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-zinc-500">ALOKASI STARS</span>
            <span className="text-amber-400 font-semibold">
              {challenge.starsPerMember} Stars / Member
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-zinc-500">TOTAL SUBMISI</span>
            <span className="text-zinc-200 font-semibold">{candidates.length} Karya</span>
          </div>
        </div>

        {/* Stage Timeline Progression */}
        <div className="flex flex-col gap-2 pt-2">
          <span className="text-xs font-mono text-zinc-500">TAHAPAN CHALLENGE:</span>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono">
            {[
              { label: "1. Submisi Terbuka", active: challenge.effectiveStatus === "submission_open" },
              {
                label: "2. Voting Komunitas",
                active:
                  challenge.effectiveStatus === "voting_open" ||
                  challenge.effectiveStatus === "tiebreak_open",
              },
              {
                label: "3. Kurasi Juri",
                active: challenge.effectiveStatus === "jury_selection_open",
              },
              { label: "4. Hall of Fame", active: challenge.effectiveStatus === "finished" },
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
        {(challenge.effectiveStatus === "voting_open" ||
          challenge.effectiveStatus === "tiebreak_open" ||
          challenge.effectiveStatus === "finished" ||
          challenge.effectiveStatus === "jury_selection_open") ? (
          <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-white/10">
            {challenge.effectiveStatus === "voting_open" ||
            challenge.effectiveStatus === "tiebreak_open" ? (
              <Link
                href={`/challenges/${challenge.slug}/voting`}
                className="px-6 py-3 rounded-2xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs font-mono transition-all shadow-lg shadow-amber-500/20 flex items-center gap-2"
              >
                <Star className="h-4 w-4 fill-black text-black" />
                <span>Masuk ke Bilik Suara (Buka Voting) →</span>
              </Link>
            ) : null}

            {challenge.juryAssignments.some((j) => j.userId === userId) ||
            session?.user?.role === "admin" ||
            session?.user?.role === "moderator" ? (
              <Link
                href={`/challenges/${challenge.slug}/jury`}
                className="px-5 py-3 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 text-amber-400 font-bold text-xs font-mono transition-all flex items-center gap-2"
              >
                <Award className="h-4 w-4 text-amber-400" />
                <span>Portal Kurasi Dewan Juri</span>
              </Link>
            ) : null}

            {challenge.effectiveStatus === "finished" ? (
              <Link
                href={`/challenges/${challenge.slug}/results`}
                className="px-6 py-3 rounded-2xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs font-mono transition-all shadow-lg shadow-amber-500/20 flex items-center gap-2"
              >
                <Trophy className="h-4 w-4 text-black" />
                <span>Lihat Hasil Resmi & Hall of Fame →</span>
              </Link>
            ) : null}
          </div>
        ) : null}
      </section>

      {/* Main Grid: Rules & Submissions (Left) + Challenge Kit & Winner Slots (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column (2 Cols): Prompts, Rules & Member Submission Box */}
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
                  <span className="px-3 py-1 rounded-full text-xs font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 font-semibold">
                    SUBMISI AKTIF (VERSI {userSubmission.currentVersion?.versionNumber || 1})
                  </span>
                ) : (
                  <span className="text-xs font-mono text-zinc-400">Belum Mengirimkan Karya</span>
                )}
              </div>

              {userSubmission && userSubmission.currentVersion ? (
                <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/10 flex flex-col sm:flex-row items-start sm:items-center gap-5">
                  <div className="h-20 w-28 bg-black/40 rounded-xl overflow-hidden flex items-center justify-center shrink-0 border border-white/10">
                    {userSubmission.currentVersion.thumbnailStorageKey ? (
                      <img
                        src={`/api/media/public/${userSubmission.currentVersion.thumbnailStorageKey}`}
                        alt={userSubmission.currentVersion.title}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <ImageIcon className="h-6 w-6 text-zinc-600" />
                    )}
                  </div>

                  <div className="flex flex-col gap-1 flex-1">
                    <h4 className="font-display font-bold text-base text-[#f6f2e9]">
                      {userSubmission.currentVersion.title}
                    </h4>
                    <span className="text-xs text-zinc-400 font-mono">
                      Software: {userSubmission.currentVersion.softwareUsed || "Tidak disebutkan"}
                    </span>
                    <span className="text-[11px] text-zinc-500 font-mono">
                      Waktu Submisi:{" "}
                      {new Intl.DateTimeFormat("id-ID", {
                        timeZone: "Asia/Makassar",
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      }).format(new Date(userSubmission.currentVersion.submittedAt))}{" "}
                      WITA
                    </span>
                  </div>

                  {isSubmissionOpen ? (
                    <ChallengeSubmissionModal
                      challengeId={challenge.id}
                      challengeTitle={challenge.title}
                      isRevision={true}
                      initialTitle={userSubmission.currentVersion.title}
                      initialDescription={userSubmission.currentVersion.description || ""}
                      initialSoftware={userSubmission.currentVersion.softwareUsed || ""}
                      portfolioArtworks={portfolioOptions}
                    />
                  ) : null}
                </div>
              ) : (
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <p className="text-xs text-zinc-300 font-sans max-w-md">
                    {isSubmissionOpen
                      ? "Periode submisi sedang dibuka. Unggah karya terbaik Anda sebelum batas waktu deadline."
                      : "Periode pengiriman submisi untuk challenge ini sedang tidak dibuka."}
                  </p>

                  {isSubmissionOpen ? (
                    <ChallengeSubmissionModal
                      challengeId={challenge.id}
                      challengeTitle={challenge.title}
                      portfolioArtworks={portfolioOptions}
                    />
                  ) : null}
                </div>
              )}
            </section>
          ) : (
            <div className="glass-panel p-6 rounded-3xl flex items-center justify-between gap-4">
              <span className="text-xs text-zinc-300 font-sans">
                Masuk sebagai anggota komunitas atelier untuk mengirimkan karya submisi ke challenge ini.
              </span>
              <Link
                href="/login"
                className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold font-mono transition-all"
              >
                Masuk Sekarang
              </Link>
            </div>
          )}

          {/* Prompt & Rules Section */}
          <section className="glass-panel p-6 sm:p-8 rounded-3xl flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-amber-400" />
              <h2 className="font-display font-bold text-xl text-[#f6f2e9]">Ketentuan & Aturan Prompt</h2>
            </div>

            <div className="text-sm text-zinc-300 font-sans leading-relaxed whitespace-pre-line">
              {challenge.promptRules}
            </div>
          </section>
        </div>

        {/* Right Column: Winner Slots & Challenge Kits */}
        <div className="flex flex-col gap-8">
          {/* Challenge Kit Files Panel */}
          {challenge.kitFiles.length > 0 ? (
            <section className="glass-panel p-6 rounded-3xl flex flex-col gap-4">
              <div className="flex items-center gap-2">
                <FileCode className="h-5 w-5 text-amber-400" />
                <h3 className="font-display font-bold text-base text-[#f6f2e9]">Challenge Kit & Template</h3>
              </div>
              <p className="text-xs text-zinc-400 font-sans">
                Unduh file aset panduan atau template kanvas resmi untuk challenge ini.
              </p>

              <div className="flex flex-col gap-2">
                {challenge.kitFiles.map((kit) => (
                  <a
                    key={kit.id}
                    href={`/api/challenges/kit/${kit.fileStorageKey}`}
                    className="p-3.5 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 transition-colors flex items-center justify-between gap-3 text-xs font-mono"
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
          ) : null}

          {/* Winner Slots & Awards */}
          <section className="glass-panel p-6 rounded-3xl flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <Award className="h-5 w-5 text-amber-400" />
              <h3 className="font-display font-bold text-base text-[#f6f2e9]">Slot Juara & Penghargaan</h3>
            </div>

            <div className="flex flex-col gap-2.5">
              {challenge.winnerSlots.map((slot) => (
                <div
                  key={slot.id}
                  className="p-3.5 rounded-2xl bg-white/[0.02] border border-white/5 flex items-center justify-between gap-3 text-xs"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="h-6 w-6 rounded-lg bg-amber-500/20 text-amber-400 font-bold font-mono flex items-center justify-center text-xs">
                      #{slot.rank}
                    </span>
                    <span className="font-semibold text-zinc-200">{slot.title}</span>
                  </div>
                  <span className="text-[10px] font-mono uppercase text-zinc-500">
                    {slot.slotType === "community_vote" ? "VOTING" : "JURI"}
                  </span>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>

      {/* Candidate Submissions Gallery (Uniform Non-Masonry Cards for Fairness) */}
      <section className="flex flex-col gap-6 pt-6 border-t border-white/10">
        <div>
          <h2 className="font-display font-bold text-2xl text-[#f6f2e9]">
            Galeri Submisi Karya Peserta ({candidates.length})
          </h2>
          <p className="text-xs text-zinc-400 mt-1">
            Seluruh submisi terverifikasi ditampilkan dengan format berimbang untuk menjamin kesetaraan visual (anti-bias).
          </p>
        </div>

        {candidates.length === 0 ? (
          <div className="glass-panel p-16 rounded-3xl flex flex-col items-center justify-center text-center gap-3">
            <Trophy className="h-10 w-10 text-zinc-600" />
            <h3 className="font-display font-bold text-lg text-white">Belum ada submisi terdaftar</h3>
            <p className="text-xs text-zinc-400 max-w-sm">
              Jadilah peserta pertama yang mengirimkan karya untuk tema challenge ini!
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {candidates.map((sub) => {
              const thumbUrl = sub.thumbnailStorageKey
                ? `/api/media/public/${sub.thumbnailStorageKey}`
                : null;

              return (
                <div
                  key={sub.submissionId}
                  className="glass-panel rounded-2xl overflow-hidden group flex flex-col justify-between hover:border-white/20 transition-all"
                >
                  <div className="aspect-[4/3] bg-black/40 relative overflow-hidden flex items-center justify-center">
                    {thumbUrl ? (
                      <img
                        src={thumbUrl}
                        alt={sub.title}
                        className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                    ) : (
                      <ImageIcon className="h-8 w-8 text-zinc-700" />
                    )}
                  </div>

                  <div className="p-4 flex flex-col gap-2">
                    <div>
                      <h4 className="font-display font-bold text-sm text-[#f6f2e9] truncate" title={sub.title}>
                        {sub.title}
                      </h4>
                      <Link
                        href={`/artists/${sub.artistSlug}`}
                        className="text-xs text-zinc-400 hover:text-white transition-colors truncate block mt-0.5"
                      >
                        oleh {sub.artistName}
                      </Link>
                    </div>

                    <div className="pt-2 border-t border-white/5 flex items-center justify-between text-[11px] font-mono text-zinc-500">
                      <span>Versi {sub.versionNumber}</span>
                      <span className="uppercase">{sub.mediaType}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
