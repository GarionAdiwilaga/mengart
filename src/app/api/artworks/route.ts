import { NextResponse } from "next/server";
import { db } from "@/db";
import {
  artworks,
  artworkVersions,
  profiles,
  users,
  portfolioEntries,
  challengeSubmissions,
  challenges,
} from "@/db/schema";
import { eq, and, desc, asc, sql, ilike, isNull, isNotNull } from "drizzle-orm";
import { auth } from "@/auth";

export async function handleGetArtworks(
  request: Request,
  sessionUserOverride?: { id: string; role?: string; membershipStatus?: string | null }
) {
  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search")?.trim();
  const mediaType = searchParams.get("mediaType");
  const critiqueMode = searchParams.get("critiqueMode");
  const tab = searchParams.get("tab"); // "bebas" | "challenge" | null
  const sort = searchParams.get("sort"); // "latest" | "oldest" | null
  const limit = Math.min(Number(searchParams.get("limit")) || 30, 100);

  let sessionUser = sessionUserOverride;
  if (!sessionUser) {
    try {
      const session = await auth();
      sessionUser = session?.user as any;
    } catch {
      sessionUser = undefined;
    }
  }

  // Live database check in production to prevent relying on stale session JWT claims
  let liveUser: { id: string; role?: string; membershipStatus?: string | null; deletedAt?: Date | null } | null = null;
  if (sessionUserOverride) {
    liveUser = sessionUserOverride;
  } else if (sessionUser?.id) {
    const [u] = await db
      .select({
        id: users.id,
        role: users.role,
        membershipStatus: users.membershipStatus,
        deletedAt: users.deletedAt,
      })
      .from(users)
      .where(eq(users.id, sessionUser.id))
      .limit(1);
    if (u) liveUser = u;
  }

  const isActiveMember =
    !!liveUser && liveUser.membershipStatus === "active" && !liveUser.deletedAt;
  const isActiveStaff =
    isActiveMember && (liveUser?.role === "admin" || liveUser?.role === "moderator");
  const isActiveAdmin =
    isActiveMember && liveUser?.role === "admin";

  const conditions = [
    eq(artworks.publicationStatus, "published"),
    isNull(artworks.deletedAt),
    eq(users.membershipStatus, "active"),
    eq(portfolioEntries.isVisible, true),
    isActiveMember
      ? sql`(${artworks.audience} IN ('public', 'members_only'))`
      : eq(artworks.audience, "public"),
  ];

  if (search) {
    conditions.push(ilike(artworks.title, `%${search}%`));
  }

  if (mediaType && mediaType !== "all") {
    conditions.push(eq(artworks.mediaType, mediaType as any));
  }

  if (critiqueMode && critiqueMode !== "all") {
    conditions.push(eq(artworks.critiqueMode, critiqueMode as any));
  }

  if (tab === "bebas") {
    conditions.push(isNull(challengeSubmissions.id));
  } else if (tab === "challenge") {
    conditions.push(isNotNull(challengeSubmissions.id));
  }

  const orderByClause = sort === "oldest" ? asc(artworks.createdAt) : desc(artworks.createdAt);

  const items = await db
    .select({
      id: artworks.id,
      userId: artworks.userId,
      title: artworks.title,
      slug: artworks.slug,
      description: artworks.description,
      mediaType: artworks.mediaType,
      audience: artworks.audience,
      critiqueMode: artworks.critiqueMode,
      isSpoiler: artworks.isSpoiler,
      createdAt: artworks.createdAt,
      systemCaption: portfolioEntries.systemCaption,
      customCaption: portfolioEntries.customCaption,
      effectiveCaption: sql<string | null>`COALESCE(${portfolioEntries.customCaption}, ${portfolioEntries.systemCaption})`,
      artistName: profiles.displayName,
      artistSlug: profiles.slug,
      artistAvatar: profiles.avatarUrl,
      artistCommissionStatus: profiles.commissionStatus,
      thumbnailStorageKey: artworkVersions.thumbnailStorageKey,
      publicStorageKey: artworkVersions.publicStorageKey,
      masterStorageKey: artworkVersions.masterStorageKey,
      width: artworkVersions.width,
      height: artworkVersions.height,
      challengeSubmissionId: challengeSubmissions.id,
      challengeId: challengeSubmissions.challengeId,
      challengeTitle: challenges.title,
      challengeSlug: challenges.slug,
      challengeIsVisible: challenges.isVisible,
      challengeDeletedAt: challenges.deletedAt,
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
    .leftJoin(artworkVersions, eq(artworkVersions.id, artworks.currentVersionId))
    .leftJoin(challengeSubmissions, eq(challengeSubmissions.artworkId, artworks.id))
    .leftJoin(challenges, eq(challenges.id, challengeSubmissions.challengeId))
    .where(and(...conditions))
    .orderBy(orderByClause)
    .limit(limit);

  // Sanitize masterStorageKey & challenge provenance
  const sanitizedItems = items.map((item) => {
    const isOwner = isActiveMember && liveUser?.id === item.userId;
    const isChallengeOrigin = Boolean(item.challengeSubmissionId);
    const origin: "challenge" | "independent" = isChallengeOrigin ? "challenge" : "independent";

    const isChallengeHiddenOrDeleted =
      isChallengeOrigin && (item.challengeIsVisible === false || item.challengeDeletedAt !== null);

    // Redact challengeTitle and challengeSlug to null for non-staff without reclassifying as independent
    const shouldRedactChallenge = isChallengeHiddenOrDeleted && !isActiveStaff;

    return {
      id: item.id,
      userId: item.userId,
      title: item.title,
      slug: item.slug,
      description: item.description,
      mediaType: item.mediaType,
      audience: item.audience,
      critiqueMode: item.critiqueMode,
      isSpoiler: item.isSpoiler,
      createdAt: item.createdAt,
      systemCaption: item.systemCaption,
      customCaption: item.customCaption,
      effectiveCaption: item.effectiveCaption,
      artistName: item.artistName,
      artistSlug: item.artistSlug,
      artistAvatar: item.artistAvatar,
      artistCommissionStatus: item.artistCommissionStatus,
      thumbnailStorageKey: item.thumbnailStorageKey,
      publicStorageKey: item.publicStorageKey,
      masterStorageKey: isOwner || isActiveAdmin ? item.masterStorageKey : null,
      width: item.width,
      height: item.height,
      origin,
      challengeSubmissionId: item.challengeSubmissionId,
      challengeId: shouldRedactChallenge ? null : item.challengeId,
      challengeTitle: shouldRedactChallenge ? null : item.challengeTitle,
      challengeSlug: shouldRedactChallenge ? null : item.challengeSlug,
    };
  });

  return NextResponse.json({ items: sanitizedItems });
}

export async function GET(request: Request) {
  return handleGetArtworks(request);
}
