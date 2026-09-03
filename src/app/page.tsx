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
  users,
} from "@/db/schema";
import { eq, and, isNull, inArray, desc } from "drizzle-orm";
import { getCurrentMonthlySpotlight } from "@/lib/activity";
import { getSiteSetting } from "@/app/actions/settings";
import { auth } from "@/auth";
import { EditAboutModal } from "@/components/home/EditAboutModal";
import { ArtworkCard } from "@/components/gallery/ArtworkCard";

export default async function HomePage() {
  const session = await auth();
  const isAdmin = session?.user?.role === "admin";

  const spotlight = await getCurrentMonthlySpotlight();
  const aboutSetting = await getSiteSetting("about_community");
  const defaultAbout =
    "Mengart Atelier adalah ruang berkarya dan kolektif seni visual digital privat. Kami mengedepankan kurasi karya autentik beresolusi tinggi, apresiasi konstruktif antar-kreator, sistem voting tantangan karya yang adil tanpa bias popularitas, serta transparansi layanan komisi profesional.";
  const aboutContent = aboutSetting || defaultAbout;

  // 1. Recent Public Artworks
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
      masterStorageKey: artworkVersions.masterStorageKey,
      width: artworkVersions.width,
      height: artworkVersions.height,
      createdAt: artworks.createdAt,
    })
    .from(artworks)
    .innerJoin(profiles, eq(profiles.userId, artworks.userId))
    .innerJoin(artworkVersions, eq(artworkVersions.id, artworks.currentVersionId))
    .where(
      and(
        eq(artworks.audience, "public"),
        isNull(artworks.deletedAt),
        inArray(artworks.publicationStatus, ["published", "ready"])
      )
    )
    .orderBy(desc(artworks.createdAt))
    .limit(6);

  // 2. Visible Active or Upcoming Challenge
  const [activeChallenge] = await db
    .select()
    .from(challenges)
    .where(
      and(
        isNull(challenges.deletedAt),
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

  // 3. Latest Published Challenge Result / Hall of Fame Highlight
  const [latestFinishedChallenge] = await db
    .select()
    .from(challenges)
    .where(and(isNull(challenges.deletedAt), eq(challenges.status, "finished")))
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
    <main className="p-6 sm:p-12 max-w-7xl mx-auto flex flex-col gap-16 sm:gap-20 flex-1">
      {/* SECTION 1: Hero / Atelier Community Identity */}
      <section className="py-6 sm:py-10 flex flex-col items-start gap-8 border-b border-white/5 pb-14">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-400 text-xs font-mono tracking-wide">
          <Sparkles className="h-3.5 w-3.5" />
          <span>KOMUNITAS DIGITAL ART & ATELIER PRIVAT</span>
        </div>

        <h1 className="font-display text-4xl sm:text-6xl lg:text-7xl font-extrabold text-[#f6f2e9] tracking-tight leading-[1.1]">
          Ruang Karya & <br />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-400 via-amber-200 to-amber-500">
            Kolektif Kreator Digital.
          </span>
        </h1>

        <p className="text-base sm:text-lg text-zinc-400 max-w-3xl font-sans leading-relaxed">
          Atelier digital khusus kreator seni visual. Temukan portofolio terkurasi,
          buka layanan komisi langsung via WhatsApp, dan ikuti community challenge
          dengan sistem voting Stars yang adil tanpa bias algoritma.
        </p>

        <div className="flex flex-wrap items-center gap-4 pt-2">
          <Link
            href="/gallery"
            className="px-6 py-3 min-h-[44px] rounded-2xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs font-mono transition-all shadow-lg shadow-amber-500/20 flex items-center gap-2"
          >
            <Palette className="h-4 w-4" />
            <span>Jelajahi Galeri Publik</span>
          </Link>
          <Link
            href="/invite"
            className="px-6 py-3 min-h-[44px] rounded-2xl bg-white/5 hover:bg-white/10 text-[#f6f2e9] text-xs font-mono border border-white/10 transition-colors flex items-center gap-2"
          >
            <span>Tukarkan Undangan Anggota</span>
            <ArrowRight className="h-3.5 w-3.5 text-zinc-400" />
          </Link>
        </div>

        {/* 3 Value Pillars */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 w-full mt-4">
          <div className="glass-panel p-6 rounded-2xl flex flex-col gap-3">
            <div className="h-10 w-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Palette className="h-5 w-5" />
            </div>
            <h3 className="font-display font-semibold text-lg text-[#f6f2e9]">
              Portofolio Terkurasi
            </h3>
            <p className="text-xs sm:text-sm text-zinc-400 leading-relaxed font-sans">
              Showcase publik teroptimasi beresolusi tinggi berdampingan dengan arsip master terlindungi bagi anggota atelier.
            </p>
          </div>

          <div className="glass-panel p-6 rounded-2xl flex flex-col gap-3">
            <div className="h-10 w-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Trophy className="h-5 w-5" />
            </div>
            <h3 className="font-display font-semibold text-lg text-[#f6f2e9]">
              Art Challenge & Stars
            </h3>
            <p className="text-xs sm:text-sm text-zinc-400 leading-relaxed font-sans">
              Voting suara anonim dengan alokasi Stars serta penilaian juri independen tanpa bias urutan scroll.
            </p>
          </div>

          <div className="glass-panel p-6 rounded-2xl flex flex-col gap-3">
            <div className="h-10 w-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <h3 className="font-display font-semibold text-lg text-[#f6f2e9]">
              Pusat Layanan Komisi
            </h3>
            <p className="text-xs sm:text-sm text-zinc-400 leading-relaxed font-sans">
              Informasi ketersediaan slot, transparansi ketentuan do/don't, dan alur pemesanan langsung via WhatsApp.
            </p>
          </div>
        </div>
      </section>

      {/* SECTION 2: Recent Public Artworks Grid */}
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
            className="text-xs font-mono text-amber-400 hover:text-amber-300 flex items-center gap-1 min-h-[44px] transition-colors"
          >
            <span>Semua Karya</span>
            <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        {recentArtworks.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {recentArtworks.map((item) => (
              <ArtworkCard
                key={item.id}
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
                  masterStorageKey: item.masterStorageKey,
                  width: item.width,
                  height: item.height,
                  createdAt: item.createdAt.toISOString(),
                  artistName: item.artistName,
                  artistSlug: item.artistSlug,
                  artistAvatar: item.artistAvatar,
                  artistCommissionStatus: (item.artistCommissionStatus as any) || "closed",
                }}
              />
            ))}
          </div>
        ) : (
          <div className="glass-panel p-8 rounded-2xl text-center text-zinc-500 text-sm font-sans">
            Belum ada karya publik yang diterbitkan.
          </div>
        )}
      </section>

      {/* SECTION 3: Current / Upcoming Visible Challenge Showcase */}
      {activeChallenge ? (
        <section className="glass-panel p-8 sm:p-10 rounded-3xl border border-amber-500/30 flex flex-col md:flex-row items-start md:items-center justify-between gap-6 relative overflow-hidden shadow-2xl">
          <div className="flex flex-col gap-3 max-w-2xl">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30 text-xs font-mono w-fit">
              <Trophy className="h-3.5 w-3.5" />
              <span>
                {activeChallenge.status === "submission_open"
                  ? "CHALLENGE AKTIF · SUBMISI DIBUKA"
                  : activeChallenge.status === "voting_open"
                  ? "CHALLENGE AKTIF · VOTING DIBUKA"
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

            {activeChallenge.submissionDeadline ? (
              <div className="flex items-center gap-2 text-xs font-mono text-zinc-400 pt-1">
                <Clock className="h-3.5 w-3.5 text-amber-400" />
                <span>
                  Batas Submisi:{" "}
                  {new Intl.DateTimeFormat("id-ID", {
                    timeZone: "Asia/Makassar",
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  }).format(new Date(activeChallenge.submissionDeadline))}{" "}
                  WITA
                </span>
              </div>
            ) : null}
          </div>

          <Link
            href={`/challenges/${activeChallenge.slug}`}
            className="px-6 py-3 min-h-[44px] rounded-2xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs font-mono transition-all shadow-md shadow-amber-500/20 flex items-center gap-2 shrink-0"
          >
            <span>Lihat Ketentuan & Ikuti</span>
            <ArrowRight className="h-4 w-4" />
          </Link>
        </section>
      ) : null}

      {/* SECTION 4: Latest Published Challenge Winner / Result Highlight */}
      {winnerHighlight ? (
        <section className="glass-panel p-8 sm:p-10 rounded-3xl border border-white/10 flex flex-col md:flex-row items-center gap-8">
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
              Karya pemenang pada challenge{" "}
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
                className="px-5 py-2.5 min-h-[44px] rounded-xl bg-white/5 hover:bg-white/10 text-xs font-mono text-zinc-300 hover:text-white border border-white/10 transition-colors inline-flex items-center gap-2"
              >
                <Trophy className="h-3.5 w-3.5 text-amber-400" />
                <span>Lihat Hall of Fame Lengkap</span>
              </Link>
            </div>
          </div>
        </section>
      ) : null}

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
                className="px-5 py-2.5 min-h-[44px] rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs font-mono transition-all shadow-md shadow-amber-500/20 flex items-center gap-1.5"
              >
                <User className="h-3.5 w-3.5" />
                <span>Kunjungi Profil Artist</span>
              </Link>
              {spotlight.artworkSlug ? (
                <Link
                  href={`/artworks/${spotlight.artworkSlug}`}
                  className="px-5 py-2.5 min-h-[44px] rounded-xl bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white text-xs font-mono transition-colors"
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
            className="text-xs font-mono text-amber-400 hover:text-amber-300 flex items-center gap-1 min-h-[44px] transition-colors"
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
