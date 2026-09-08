import { db } from "@/db";
import {
  artworks,
  artworkVersions,
  portfolioEntries,
  profiles,
  tags,
  artworkTags,
  critiqueComments,
  users,
} from "@/db/schema";
import { eq, and, desc, isNull } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import Link from "next/link";
import {
  User,
  Tag,
  Monitor,
  Calendar,
  Sparkles,
  ExternalLink,
} from "lucide-react";
import { ArtworkLightbox } from "@/components/gallery/ArtworkLightbox";
import { CritiqueSection } from "@/components/artworks/CritiqueSection";
import { ReportModal } from "@/components/artworks/ReportModal";
import { ArtworkFocusedBottomBar } from "@/components/artworks/ArtworkFocusedBottomBar";
import { FocusedTaskShell } from "@/components/layout/shells/FocusedTaskShell";
import { TimestampWITA } from "@/components/ui/atoms/TimestampWITA";
import { AtelierBadge } from "@/components/ui/atoms/AtelierBadge";
import { canViewArtwork, canAccessMasterMedia, type PolicyUser } from "@/lib/policy";

interface ArtworkDetailPageProps {
  params: Promise<{ slug: string }>;
}

export default async function ArtworkDetailPage({ params }: ArtworkDetailPageProps) {
  const { slug } = await params;
  const session = await auth();

  let viewer: PolicyUser | null = null;
  if (session?.user?.id) {
    const [dbUser] = await db
      .select({
        id: users.id,
        role: users.role,
        membershipStatus: users.membershipStatus,
        deletedAt: users.deletedAt,
      })
      .from(users)
      .where(eq(users.id, session.user.id))
      .limit(1);

    if (dbUser && !dbUser.deletedAt && dbUser.membershipStatus !== "deleted") {
      viewer = {
        id: dbUser.id,
        role: dbUser.role,
        membershipStatus: dbUser.membershipStatus,
      };
    }
  }

  const isMember = Boolean(viewer && viewer.membershipStatus === "active");

  const [artwork] = await db
    .select({
      id: artworks.id,
      title: artworks.title,
      slug: artworks.slug,
      description: artworks.description,
      mediaType: artworks.mediaType,
      audience: artworks.audience,
      critiqueMode: artworks.critiqueMode,
      isSpoiler: artworks.isSpoiler,
      createdAt: artworks.createdAt,
      userId: artworks.userId,
      artistName: profiles.displayName,
      artistSlug: profiles.slug,
      artistBio: profiles.bio,
      artistAvatar: profiles.avatarUrl,
      artistCommissionStatus: profiles.commissionStatus,
      versionId: artworkVersions.id,
      publicStorageKey: artworkVersions.publicStorageKey,
      masterStorageKey: artworkVersions.masterStorageKey,
      width: artworkVersions.width,
      height: artworkVersions.height,
      fileSizeBytes: artworkVersions.fileSizeBytes,
      processingStatus: artworkVersions.processingStatus,
      publicationStatus: artworks.publicationStatus,
      deletedAt: artworks.deletedAt,
      portfolioEntryId: portfolioEntries.id,
      isPortfolioVisible: portfolioEntries.isVisible,
    })
    .from(artworks)
    .innerJoin(profiles, eq(profiles.userId, artworks.userId))
    .leftJoin(
      portfolioEntries,
      and(
        eq(portfolioEntries.artworkId, artworks.id),
        eq(portfolioEntries.profileId, profiles.id)
      )
    )
    .leftJoin(artworkVersions, eq(artworkVersions.id, artworks.currentVersionId))
    .where(eq(artworks.slug, slug))
    .limit(1);

  if (!artwork) {
    notFound();
  }

  const isArtworkOwner = Boolean(viewer && viewer.id === artwork.userId);
  const isActiveStaff = Boolean(
    viewer &&
      viewer.membershipStatus === "active" &&
      (viewer.role === "admin" || viewer.role === "moderator")
  );
  const hasPortfolioEntry = Boolean(artwork.portfolioEntryId);

  // 1. Non-portfolio / challenge backing artworks without portfolio entries:
  // Detail access denied to ordinary third parties; restricted to owner or active staff
  if (!hasPortfolioEntry && !isArtworkOwner && !isActiveStaff) {
    notFound();
  }

  // 2. Authoritative Gate A/D audience policy check
  const artworkEntity = {
    id: artwork.id,
    userId: artwork.userId,
    audience: artwork.audience,
    publicationStatus: artwork.publicationStatus,
    deletedAt: artwork.deletedAt,
  };

  const isAllowedToView = canViewArtwork(viewer, artworkEntity);
  if (!isAllowedToView) {
    if (!viewer && (artwork.audience === "members_only" || artwork.audience === "unlisted")) {
      redirect(`/login?callbackUrl=/artworks/${slug}`);
    }
    notFound();
  }

  // Fetch Tags
  const attachedTags = await db
    .select({
      name: tags.name,
      slug: tags.slug,
    })
    .from(artworkTags)
    .innerJoin(tags, eq(tags.id, artworkTags.tagId))
    .where(eq(artworkTags.artworkId, artwork.id));

  // Fetch Critique Comments (excluding soft deleted)
  const commentRows = await db
    .select({
      id: critiqueComments.id,
      userId: critiqueComments.userId,
      parentCommentId: critiqueComments.parentCommentId,
      content: critiqueComments.content,
      isPinned: critiqueComments.isPinned,
      isEdited: critiqueComments.isEdited,
      isHidden: critiqueComments.isHidden,
      hiddenReason: critiqueComments.hiddenReason,
      createdAt: critiqueComments.createdAt,
      updatedAt: critiqueComments.updatedAt,
      artistName: profiles.displayName,
      artistSlug: profiles.slug,
      artistAvatar: profiles.avatarUrl,
    })
    .from(critiqueComments)
    .innerJoin(profiles, eq(profiles.id, critiqueComments.profileId))
    .where(and(eq(critiqueComments.artworkId, artwork.id), isNull(critiqueComments.deletedAt)))
    .orderBy(desc(critiqueComments.isPinned), desc(critiqueComments.createdAt));

  const publicMediaUrl = artwork.publicStorageKey
    ? `/api/media/public/${artwork.publicStorageKey}`
    : "/placeholder.png";

  const isAllowedToAccessMaster = await canAccessMasterMedia(viewer, artworkEntity);
  const masterMediaUrl =
    isAllowedToAccessMaster && artwork.masterStorageKey
      ? `/api/media/master/${artwork.masterStorageKey}`
      : null;

  return (
    <FocusedTaskShell
      backHref="/gallery"
      backLabel="Galeri"
      title={artwork.title}
      rightAction={
        <div className="flex items-center gap-2">
          <ReportModal
            targetType="artwork"
            targetId={artwork.id}
            targetTitle={artwork.title}
          />
          <Link
            href={`/artists/${artwork.artistSlug}`}
            className="px-3.5 py-2 min-h-[44px] rounded-xl bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white text-xs font-mono transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <User className="h-3.5 w-3.5 text-amber-400" />
            <span className="hidden sm:inline">Profil Artist</span>
          </Link>
        </div>
      }
      bottomBar={
        <ArtworkFocusedBottomBar
          artworkTitle={artwork.title}
          artistName={artwork.artistName}
          artistSlug={artwork.artistSlug}
          artistAvatar={artwork.artistAvatar}
          commentsCount={commentRows.length}
        />
      }
    >
      <div className="p-4 sm:p-8 lg:p-12 max-w-7xl mx-auto w-full flex flex-col gap-8">
        {/* Main Content Layout: Viewer (Left) + Details Sidebar (Right) */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column: Lightbox & Comments Section */}
          <div className="lg:col-span-2 flex flex-col gap-8">
            <ArtworkLightbox
              publicMediaUrl={publicMediaUrl}
              masterMediaUrl={masterMediaUrl}
              isMember={isMember}
              title={artwork.title}
              mediaType={artwork.mediaType as any}
              width={artwork.width}
              height={artwork.height}
              isSpoiler={artwork.isSpoiler}
            />

            {/* Artwork Description & Process Notes */}
            <section className="glass-panel p-6 sm:p-8 rounded-3xl flex flex-col gap-4 border border-white/10">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="font-display font-bold text-xl text-[#f6f2e9]">{artwork.title}</h2>
                <div className="flex items-center gap-2">
                  <AtelierBadge
                    variant={
                      artwork.artistCommissionStatus === "open"
                        ? "success"
                        : artwork.artistCommissionStatus === "waitlist"
                        ? "amber"
                        : "default"
                    }
                    size="sm"
                  >
                    Komisi: {artwork.artistCommissionStatus}
                  </AtelierBadge>
                </div>
              </div>

              {artwork.description ? (
                <p className="text-sm text-zinc-300 font-sans leading-relaxed whitespace-pre-line">
                  {artwork.description}
                </p>
              ) : (
                <p className="text-xs text-zinc-500 italic font-sans">Tidak ada catatan proses tambahan.</p>
              )}

              {/* Tags */}
              {attachedTags.length > 0 ? (
                <div className="flex flex-wrap gap-2 pt-4 border-t border-white/5">
                  {attachedTags.map((t) => (
                    <span
                      key={t.slug}
                      className="px-3 py-1 rounded-full bg-white/5 border border-white/10 text-zinc-300 text-xs font-mono flex items-center gap-1"
                    >
                      <Tag className="h-3 w-3 text-amber-400" />
                      #{t.name}
                    </span>
                  ))}
                </div>
              ) : null}
            </section>

            {/* Constructive Comments Thread */}
            <div id="comments" className="scroll-mt-24">
              <CritiqueSection
                artworkId={artwork.id}
                artworkSlug={artwork.slug}
                critiqueMode={artwork.critiqueMode as any}
                artworkOwnerUserId={artwork.userId}
                currentUserId={viewer?.id}
                currentUserRole={viewer?.role}
                comments={commentRows}
              />
            </div>
          </div>

          {/* Right Column: Artist Bio Card & Technical Metadata */}
          <div className="flex flex-col gap-6">
            {/* Artist Card */}
            <div className="glass-panel p-6 rounded-3xl flex flex-col gap-5 border border-white/10">
              <div className="flex items-center gap-4">
                <div className="h-14 w-14 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 font-display font-bold text-xl overflow-hidden shrink-0">
                  {artwork.artistAvatar ? (
                    <img
                      src={artwork.artistAvatar}
                      alt={artwork.artistName}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    artwork.artistName?.charAt(0) || "A"
                  )}
                </div>
                <div className="flex flex-col min-w-0">
                  <Link
                    href={`/artists/${artwork.artistSlug}`}
                    className="font-display font-bold text-lg text-[#f6f2e9] hover:text-amber-300 transition-colors truncate"
                  >
                    {artwork.artistName}
                  </Link>
                  <span
                    className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded-full border w-fit mt-1 ${
                      artwork.artistCommissionStatus === "open"
                        ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                        : artwork.artistCommissionStatus === "waitlist"
                        ? "bg-amber-500/10 text-amber-400 border-amber-500/30"
                        : "bg-zinc-500/10 text-zinc-400 border-zinc-500/30"
                    }`}
                  >
                    Komisi: {artwork.artistCommissionStatus}
                  </span>
                </div>
              </div>

              {artwork.artistBio ? (
                <p className="text-xs text-zinc-400 line-clamp-3 leading-relaxed font-sans">
                  {artwork.artistBio}
                </p>
              ) : null}

              <Link
                href={`/artists/${artwork.artistSlug}`}
                className="w-full py-2.5 min-h-[44px] rounded-xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-400 text-xs font-mono font-semibold transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <span>Kunjungi Profil Artist</span>
                <ExternalLink className="h-3 w-3" />
              </Link>
            </div>

            {/* Technical Specs Panel */}
            <div className="glass-panel p-6 rounded-3xl flex flex-col gap-4 text-xs font-mono border border-white/10">
              <h4 className="font-display font-bold text-sm text-[#f6f2e9]">Detail Teknis Karya</h4>

              <div className="flex flex-col gap-2.5 divide-y divide-white/5">
                <div className="flex items-center justify-between pt-1">
                  <span className="text-zinc-500">Tipe Media:</span>
                  <span className="text-zinc-200 uppercase">{artwork.mediaType}</span>
                </div>

                {artwork.width && artwork.height ? (
                  <div className="flex items-center justify-between pt-2.5">
                    <span className="text-zinc-500">Resolusi Kanvas:</span>
                    <span className="text-zinc-200 tabular-nums">
                      {artwork.width} × {artwork.height} px
                    </span>
                  </div>
                ) : null}

                <div className="flex items-center justify-between pt-2.5">
                  <span className="text-zinc-500">Diunggah:</span>
                  <TimestampWITA date={artwork.createdAt} includeTime={true} showIcon={true} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </FocusedTaskShell>
  );
}

