import Link from "next/link";
import {
  Sparkles,
  Palette,
  Trophy,
  ShieldCheck,
  ArrowRight,
  Crown,
  User,
  Clock,
  Briefcase,
  ChevronRight,
  CheckCircle2,
  Award,
} from "lucide-react";
import { db } from "@/db";
import {
  artworks,
  artworkVersions,
  profiles,
  challenges,
  challengeResults,
  challengeSubmissions,
  challengeVotingRounds,
  users,
  portfolioEntries,
} from "@/db/schema";
import { eq, and, isNull, inArray, desc, sql } from "drizzle-orm";
import { getCurrentMonthlySpotlight } from "@/lib/activity";
import { getSiteSetting } from "@/app/actions/settings";
import { auth } from "@/auth";
import { EditAboutModal } from "@/components/home/EditAboutModal";
import { ArtworkCard } from "@/components/gallery/ArtworkCard";
import { projectPublicArtworkProvenance } from "@/lib/presentation/provenance";

export default async function HomePage() {
  const session = await auth();
  const isAdmin = session?.user?.role === "admin";

  let isActiveStaff = false;
  if (session?.user?.id) {
    const [currentUser] = await db
      .select({
        role: users.role,
        membershipStatus: users.membershipStatus,
        deletedAt: users.deletedAt,
      })
      .from(users)
      .where(eq(users.id, session.user.id))
      .limit(1);

    if (
      currentUser &&
      (currentUser.role === "admin" || currentUser.role === "moderator") &&
      currentUser.membershipStatus === "active" &&
      !currentUser.deletedAt
    ) {
      isActiveStaff = true;
    }
  }

  const spotlight = await getCurrentMonthlySpotlight();
  const aboutSetting = await getSiteSetting("about_community");
  const defaultAbout =
    "Mengart Atelier adalah ruang berkarya dan komunitas seni visual privat. Kami mengedepankan kurasi karya autentik beresolusi tinggi, apresiasi konstruktif antar-kreator, sistem voting challenge karya yang adil tanpa bias popularitas, serta transparansi layanan komisi profesional.";
  const aboutContent = aboutSetting || defaultAbout;

  // 1. Visible Active or Upcoming Challenge (Displayed first on mobile)
  const [activeChallenge] = await db
    .select()
    .from(challenges)
    .where(
      and(
        isNull(challenges.deletedAt),
        eq(challenges.isVisible, true),
        inArray(challenges.status, [
          "submission_open",
          "voting_open",
          "tiebreak_open",
          "scheduled",
        ])
      )
    )
    .orderBy(desc(challenges.createdAt))
    .limit(1);

  // Determine actual active deadline for the active challenge
  let activeDeadline = activeChallenge?.submissionDeadline;
  let activeDeadlineLabel = "Batas Waktu Submisi";

  if (activeChallenge) {
    if (activeChallenge.status === "voting_open" || activeChallenge.status === "tiebreak_open") {
      activeDeadlineLabel = "Batas Waktu Voting";
      const [activeRound] = await db
        .select({ deadline: challengeVotingRounds.deadline })
        .from(challengeVotingRounds)
        .where(
          and(
            eq(challengeVotingRounds.challengeId, activeChallenge.id),
            eq(challengeVotingRounds.status, "open")
          )
        )
        .limit(1);

      activeDeadline = activeRound?.deadline || activeChallenge.votingDeadline;
    }
  }

  // 2. Latest Published Challenge Result / Hall of Fame Highlight
  const [latestFinishedChallenge] = await db
    .select()
    .from(challenges)
    .where(
      and(
        isNull(challenges.deletedAt),
        eq(challenges.isVisible, true),
        eq(challenges.status, "finished")
      )
    )
    .orderBy(desc(challenges.updatedAt))
    .limit(1);

  let winnerHighlight: {
    challenge: typeof latestFinishedChallenge;
    awardTitle: string;
    artworkTitle: string;
    artistName: string;
    artistSlug: string;
    artistAvatar: string | null;
    thumbnailKey: string | null;
  } | null = null;

  if (latestFinishedChallenge) {
    const [w] = await db
      .select({
        awardType: challengeResults.awardType,
        categoryLabel: challengeResults.categoryLabel,
        submissionTitle: challengeSubmissions.title,
        artistName: profiles.displayName,
        artistSlug: profiles.slug,
        artistAvatar: profiles.avatarUrl,
        thumbnailStorageKey: artworkVersions.thumbnailStorageKey,
      })
      .from(challengeResults)
      .innerJoin(
        challengeSubmissions,
        eq(challengeSubmissions.id, challengeResults.submissionId)
      )
      .innerJoin(profiles, eq(profiles.id, challengeSubmissions.profileId))
      .leftJoin(
        artworkVersions,
        eq(artworkVersions.id, challengeSubmissions.artworkVersionId)
      )
      .where(
        and(
          eq(challengeResults.challengeId, latestFinishedChallenge.id),
          inArray(challengeResults.awardType, [
            "community_vote_winner",
            "jury_award",
            "community_rank",
          ])
        )
      )
      .orderBy(desc(challengeResults.finalRank))
      .limit(1);

    if (w) {
      winnerHighlight = {
        challenge: latestFinishedChallenge,
        awardTitle:
          w.categoryLabel ||
          (w.awardType === "community_vote_winner"
            ? "Juara Favorit Komunitas"
            : "Penghargaan Juri"),
        artworkTitle: w.submissionTitle,
        artistName: w.artistName,
        artistSlug: w.artistSlug,
        artistAvatar: w.artistAvatar,
        thumbnailKey: w.thumbnailStorageKey,
      };
    }
  }

  // 3. Recent Public Artworks (both Karya Bebas & Karya Challenge)
  const recentArtworks = await db
    .select({
      id: artworks.id,
      title: artworks.title,
      slug: artworks.slug,
      description: artworks.description,
      mediaType: artworks.mediaType,
      audience: artworks.audience,
      isSpoiler: artworks.isSpoiler,
      critiqueMode: artworks.critiqueMode,
      artistName: profiles.displayName,
      artistSlug: profiles.slug,
      artistAvatar: profiles.avatarUrl,
      artistCommissionStatus: profiles.commissionStatus,
      publicStorageKey: artworkVersions.publicStorageKey,
      thumbnailStorageKey: artworkVersions.thumbnailStorageKey,
      width: artworkVersions.width,
      height: artworkVersions.height,
      createdAt: artworks.createdAt,
      challengeSubmissionId: challengeSubmissions.id,
      challengeId: challenges.id,
      challengeTitle: challenges.title,
      challengeSlug: challenges.slug,
      challengeIsVisible: challenges.isVisible,
      challengeDeletedAt: challenges.deletedAt,
      systemCaption: portfolioEntries.systemCaption,
      customCaption: portfolioEntries.customCaption,
      awardType: sql<string | null>`(
        SELECT cr.award_type FROM challenge_results cr
        WHERE cr.submission_id = ${challengeSubmissions.id} AND cr.is_published = true
        ORDER BY CASE WHEN cr.award_type = 'community_vote_winner' THEN 1 ELSE 2 END
        LIMIT 1
      )`,
      categoryLabel: sql<string | null>`(
        SELECT cr.category_label FROM challenge_results cr
        WHERE cr.submission_id = ${challengeSubmissions.id} AND cr.is_published = true
        ORDER BY CASE WHEN cr.award_type = 'community_vote_winner' THEN 1 ELSE 2 END
        LIMIT 1
      )`,
    })
    .from(artworks)
    .innerJoin(profiles, eq(profiles.userId, artworks.userId))
    .innerJoin(users, eq(users.id, artworks.userId))
    .innerJoin(
      portfolioEntries,
      and(
        eq(portfolioEntries.artworkId, artworks.id),
        eq(portfolioEntries.profileId, profiles.id)
      )
    )
    .innerJoin(artworkVersions, eq(artworkVersions.id, artworks.currentVersionId))
    .leftJoin(challengeSubmissions, eq(challengeSubmissions.artworkId, artworks.id))
    .leftJoin(challenges, eq(challenges.id, challengeSubmissions.challengeId))
    .where(
      and(
        eq(artworks.audience, "public"),
        isNull(artworks.deletedAt),
        eq(users.membershipStatus, "active"),
        eq(portfolioEntries.isVisible, true),
        inArray(artworks.publicationStatus, ["published", "ready"])
      )
    )
    .orderBy(desc(artworks.createdAt))
    .limit(6);

  // 4. Member Artists Open for Commission
  const openCommissionArtists = await db
    .select({
      id: profiles.id,
      displayName: profiles.displayName,
      slug: profiles.slug,
      avatarUrl: profiles.avatarUrl,
      bio: profiles.bio,
      specialties: profiles.specialties,
      commissionStatus: profiles.commissionStatus,
    })
    .from(profiles)
    .innerJoin(users, eq(users.id, profiles.userId))
    .where(
      and(
        eq(profiles.commissionStatus, "open"),
        eq(users.membershipStatus, "active"),
        isNull(users.deletedAt)
      )
    )
    .limit(4);

  return (
    <main className="p-4 sm:p-8 lg:p-12 max-w-7xl mx-auto flex flex-col gap-12 sm:gap-16 flex-1">
      {/* SECTION 1: Compact Atelier Header (Neutral copy & fast viewport entry) */}
      <section className="pt-2 sm:pt-4 flex flex-col items-start gap-4 border-b border-white/5 pb-8">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-400 text-xs font-mono tracking-wide">
          <Sparkles className="h-3.5 w-3.5" />
          <span>KOMUNITAS SENI VISUAL & ATELIER PRIVAT</span>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 w-full">
          <div className="flex flex-col gap-2 max-w-2xl">
            <h1 className="font-display text-3xl sm:text-4xl lg:text-5xl font-extrabold text-[#f6f2e9] tracking-tight leading-[1.15]">
              Ruang Berkarya & <br className="hidden sm:inline" />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-400 via-amber-200 to-amber-500">
                Komunitas & Studio Seni Visual.
              </span>
            </h1>
            <p className="text-xs sm:text-sm text-zinc-400 font-sans leading-relaxed">
              Atelier digital khusus kreator seni visual. Temukan portofolio anggota, ikuti challenge berkala dengan alokasi Star yang adil, dan akses layanan komisi kreator.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <Link
              href="/gallery"
              className="px-4 py-2.5 min-h-[44px] min-w-[44px] rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs font-mono transition-all shadow-md shadow-amber-500/20 flex items-center justify-center gap-2 cursor-pointer"
            >
              <Palette className="h-4 w-4" />
              <span>Lihat karya</span>
            </Link>
            <Link
              href="/invite"
              className="px-4 py-2.5 min-h-[44px] min-w-[44px] rounded-xl bg-white/5 hover:bg-white/10 text-[#f6f2e9] text-xs font-mono border border-white/10 transition-colors flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>Tukarkan Undangan</span>
              <ArrowRight className="h-3.5 w-3.5 text-zinc-400" />
            </Link>
          </div>
        </div>
      </section>

      {/* SECTION 2: Current / Upcoming Visible Challenge (1st Mobile Viewport Priority) */}
      {activeChallenge ? (
        <section
          id="active-challenge"
          aria-label="Challenge Aktif"
          className="glass-panel p-6 sm:p-10 rounded-3xl border border-amber-500/30 flex flex-col md:flex-row items-start md:items-center justify-between gap-6 relative overflow-hidden shadow-2xl"
        >
          <div className="flex flex-col gap-3 max-w-2xl">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30 text-xs font-mono w-fit">
              <Trophy className="h-3.5 w-3.5" />
              <span>
                {activeChallenge.status === "submission_open"
                  ? "CHALLENGE AKTIF · SUBMISI DIBUKA"
                  : activeChallenge.status === "voting_open"
                  ? "CHALLENGE AKTIF · PEMUNGUTAN SUARA"
                  : activeChallenge.status === "tiebreak_open"
                  ? "CHALLENGE AKTIF · TIEBREAK BERLANGSUNG"
                  : "CHALLENGE MENDATANG"}
              </span>
            </div>

            <h2 className="font-display font-bold text-2xl sm:text-3xl text-[#f6f2e9]">
              {activeChallenge.title}
            </h2>

            <p className="text-xs sm:text-sm text-zinc-400 font-sans leading-relaxed line-clamp-2">
              {activeChallenge.description}
            </p>

            {activeDeadline ? (
              <div className="flex items-center gap-2 text-xs font-mono text-zinc-400 pt-1">
                <Clock className="h-3.5 w-3.5 text-amber-400" />
                <span>
                  {activeDeadlineLabel}:{" "}
                  {new Intl.DateTimeFormat("id-ID", {
                    timeZone: "Asia/Makassar",
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  }).format(new Date(activeDeadline))}{" "}
                  WITA
                </span>
              </div>
            ) : null}
          </div>

          {activeChallenge.status === "voting_open" || activeChallenge.status === "tiebreak_open" ? (
            <Link
              href={`/challenges/${activeChallenge.slug}/voting`}
              className="px-6 py-3 min-h-[44px] min-w-[44px] rounded-2xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs font-mono transition-all shadow-md shadow-amber-500/20 flex items-center justify-center gap-2 shrink-0 cursor-pointer"
            >
              <span>Beri Star</span>
              <ArrowRight className="h-4 w-4" />
            </Link>
          ) : (
            <Link
              href={`/challenges/${activeChallenge.slug}`}
              className="px-6 py-3 min-h-[44px] min-w-[44px] rounded-2xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs font-mono transition-all shadow-md shadow-amber-500/20 flex items-center justify-center gap-2 shrink-0 cursor-pointer"
            >
              <span>Lihat Ketentuan & Ikuti</span>
              <ArrowRight className="h-4 w-4" />
            </Link>
          )}
        </section>
      ) : null}

      {/* SECTION 3: Latest Published Challenge Result / Hall of Fame Highlight */}
      {winnerHighlight ? (
        <section className="glass-panel p-6 sm:p-10 rounded-3xl border border-white/10 flex flex-col md:flex-row items-center gap-8">
          {winnerHighlight.thumbnailKey ? (
            <div className="w-full md:w-64 aspect-square rounded-2xl overflow-hidden bg-black/40 border border-white/10 shrink-0">
              <img
                src={`/api/media/public/${winnerHighlight.thumbnailKey}`}
                alt={winnerHighlight.artworkTitle}
                className="w-full h-full object-cover"
              />
            </div>
          ) : null}

          <div className="flex flex-col gap-3 flex-1">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30 text-xs font-mono w-fit">
              <Award className="h-3.5 w-3.5" />
              <span>{winnerHighlight.awardTitle.toUpperCase()}</span>
            </div>

            <h3 className="font-display font-bold text-2xl text-[#f6f2e9]">
              "{winnerHighlight.artworkTitle}"
            </h3>

            <p className="text-xs sm:text-sm text-zinc-400 font-sans">
              Karya terpilih pada challenge{" "}
              <span className="text-zinc-200 font-semibold">
                {winnerHighlight.challenge.title}
              </span>{" "}
              oleh{" "}
              <Link
                href={`/artists/${winnerHighlight.artistSlug}`}
                className="text-amber-400 hover:underline font-semibold"
              >
                {winnerHighlight.artistName}
              </Link>
              .
            </p>

            <div className="pt-2">
              <Link
                href={`/challenges/${winnerHighlight.challenge.slug}/results`}
                className="px-5 py-2.5 min-h-[44px] min-w-[44px] rounded-xl bg-white/5 hover:bg-white/10 text-xs font-mono text-zinc-300 hover:text-white border border-white/10 transition-colors inline-flex items-center justify-center gap-2 cursor-pointer"
              >
                <Trophy className="h-3.5 w-3.5 text-amber-400" />
                <span>Lihat Hall of Fame Lengkap</span>
              </Link>
            </div>
          </div>
        </section>
      ) : null}

      {/* SECTION 4: Recent Public Artworks Grid (Karya Bebas & Karya Challenge) */}
      <section className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Palette className="h-4 w-4" />
            </div>
            <div>
              <h2 className="font-display font-bold text-2xl text-[#f6f2e9]">
                Karya Publik Terbaru
              </h2>
              <p className="text-xs text-zinc-400 font-sans">
                Eksplorasi visual dan karya terbitan terkini dari kreator komunitas.
              </p>
            </div>
          </div>
          <Link
            href="/gallery"
            className="text-xs font-mono text-amber-400 hover:text-amber-300 flex items-center gap-1 min-h-[44px] min-w-[44px] transition-colors cursor-pointer"
          >
            <span>Lihat karya</span>
            <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        {recentArtworks.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {recentArtworks.map((item) => {
              const projected = projectPublicArtworkProvenance(item, { isActiveStaff });
              return (
                <ArtworkCard
                  key={item.id}
                  from="/"
                  artwork={{
                    id: item.id,
                    title: item.title,
                    slug: item.slug,
                    description: item.description,
                    mediaType: item.mediaType as any,
                    audience: item.audience as any,
                    isSpoiler: item.isSpoiler,
                    critiqueMode: item.critiqueMode as any,
                    publicStorageKey: item.publicStorageKey,
                    thumbnailStorageKey: item.thumbnailStorageKey,
                    masterStorageKey: null,
                    width: item.width,
                    height: item.height,
                    createdAt: item.createdAt.toISOString(),
                    artistName: item.artistName,
                    artistSlug: item.artistSlug,
                    artistAvatar: item.artistAvatar,
                    artistCommissionStatus: (item.artistCommissionStatus as any) || "closed",
                    challengeSubmissionId: item.challengeSubmissionId,
                    challengeId: projected.challengeId,
                    challengeTitle: projected.challengeTitle,
                    challengeSlug: projected.challengeSlug,
                    systemCaption: projected.systemCaption,
                    customCaption: projected.customCaption,
                    effectiveCaption: projected.effectiveCaption,
                    origin: projected.origin,
                  }}
                />
              );
            })}
          </div>
        ) : (
          <div className="glass-panel p-8 rounded-2xl text-center text-zinc-500 text-sm font-sans">
            Belum ada karya publik yang diterbitkan.
          </div>
        )}
      </section>

      {/* SECTION 5: Current Featured Artist Spotlight Card */}
      {spotlight ? (
        <section className="glass-panel-elevated p-8 sm:p-12 rounded-3xl border border-amber-500/30 flex flex-col lg:flex-row items-center gap-8 relative overflow-hidden shadow-2xl">
          <div className="flex flex-col gap-4 flex-1">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30 text-xs font-mono w-fit">
              <Crown className="h-3.5 w-3.5" />
              <span>FEATURED ARTIST · KURASI PILIHAN</span>
            </div>

            <h2 className="font-display font-extrabold text-3xl sm:text-4xl text-[#f6f2e9] tracking-tight">
              {spotlight.artistName}
            </h2>

            <blockquote className="p-4 rounded-2xl bg-white/[0.02] border-l-2 border-amber-400 text-xs sm:text-sm text-zinc-300 font-sans italic leading-relaxed">
              "{spotlight.curatorQuote}"
            </blockquote>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <Link
                href={`/artists/${spotlight.artistSlug}`}
                className="px-5 py-2.5 min-h-[44px] min-w-[44px] rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs font-mono transition-all shadow-md shadow-amber-500/20 flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <User className="h-3.5 w-3.5" />
                <span>Kunjungi Profil Artist</span>
              </Link>
              {spotlight.artworkSlug ? (
                <Link
                  href={`/artworks/${spotlight.artworkSlug}`}
                  className="px-5 py-2.5 min-h-[44px] min-w-[44px] rounded-xl bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white text-xs font-mono transition-colors flex items-center justify-center cursor-pointer"
                >
                  Lihat Karya Sorotan
                </Link>
              ) : null}
            </div>
          </div>

          {spotlight.thumbnailStorageKey ? (
            <div className="w-full lg:w-96 aspect-[4/3] rounded-2xl overflow-hidden border border-white/10 bg-black/40 shadow-xl shrink-0">
              <img
                src={`/api/media/public/${spotlight.thumbnailStorageKey}`}
                alt={spotlight.artistName}
                className="w-full h-full object-cover"
              />
            </div>
          ) : null}
        </section>
      ) : null}

      {/* SECTION 6: Member Artists Open for Commission */}
      <section className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Briefcase className="h-4 w-4" />
            </div>
            <div>
              <h2 className="font-display font-bold text-2xl text-[#f6f2e9]">
                Artist Buka Komisi
              </h2>
              <p className="text-xs text-zinc-400 font-sans">
                Kreator anggota komunitas yang saat ini menerima pesanan karya kustom.
              </p>
            </div>
          </div>
          <Link
            href="/commissions"
            className="text-xs font-mono text-amber-400 hover:text-amber-300 flex items-center gap-1 min-h-[44px] min-w-[44px] transition-colors cursor-pointer"
          >
            <span>Semua Layanan</span>
            <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        {openCommissionArtists.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {openCommissionArtists.map((artist) => (
              <Link
                key={artist.id}
                href={`/artists/${artist.slug}`}
                className="glass-panel p-5 rounded-2xl flex flex-col gap-4 hover:border-amber-500/40 transition-all group"
              >
                <div className="flex items-center gap-3">
                  <div className="h-12 w-12 rounded-full overflow-hidden bg-white/5 border border-white/10 shrink-0">
                    {artist.avatarUrl ? (
                      <img
                        src={artist.avatarUrl}
                        alt={artist.displayName}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="h-full w-full flex items-center justify-center text-amber-400 font-bold font-mono">
                        {artist.displayName.slice(0, 1).toUpperCase()}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col overflow-hidden">
                    <span className="font-display font-bold text-sm text-[#f6f2e9] group-hover:text-amber-400 transition-colors truncate">
                      {artist.displayName}
                    </span>
                    <span className="text-[11px] font-mono text-zinc-400">
                      @{artist.slug}
                    </span>
                  </div>
                </div>

                {artist.specialties && artist.specialties.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {artist.specialties.slice(0, 2).map((s, idx) => (
                      <span
                        key={idx}
                        className="px-2 py-0.5 rounded-md bg-white/5 text-[10px] font-mono text-zinc-300"
                      >
                        {s}
                      </span>
                    ))}
                  </div>
                ) : null}

                <div className="mt-auto pt-3 border-t border-white/5 flex items-center justify-between text-xs font-mono">
                  <span className="text-emerald-400 flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" />
                    <span>Buka Komisi</span>
                  </span>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="glass-panel p-8 rounded-2xl text-center text-zinc-500 text-sm font-sans">
            Belum ada artist yang membuka slot komisi saat ini.
          </div>
        )}
      </section>

      {/* SECTION 7: Admin-Editable "About Community" Section */}
      <section className="glass-panel p-8 sm:p-10 rounded-3xl border border-white/10 flex flex-col gap-5">
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <ShieldCheck className="h-4 w-4" />
            </div>
            <h2 className="font-display font-bold text-xl sm:text-2xl text-[#f6f2e9]">
              Tentang Mengart Atelier
            </h2>
          </div>

          {isAdmin ? <EditAboutModal initialContent={aboutContent} /> : null}
        </div>

        <div className="text-sm sm:text-base text-zinc-300 font-sans leading-relaxed whitespace-pre-line">
          {aboutContent}
        </div>
      </section>
    </main>
  );
}
