import { db } from "@/db";
import {
  activityLogs,
  monthlySpotlights,
  profiles,
  artworks,
  artworkVersions,
} from "@/db/schema";
import { eq, and, isNull, desc, lte } from "drizzle-orm";

export async function getRecentCommunityActivity(limitCount = 8) {
  const logs = await db
    .select({
      id: activityLogs.id,
      eventType: activityLogs.eventType,
      targetType: activityLogs.targetType,
      targetId: activityLogs.targetId,
      metadata: activityLogs.metadata,
      createdAt: activityLogs.createdAt,
    })
    .from(activityLogs)
    .where(eq(activityLogs.isPublic, true))
    .orderBy(desc(activityLogs.createdAt))
    .limit(limitCount);

  return logs;
}

export async function getCurrentMonthlySpotlight() {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  // 1. Try exact match for current year/month
  const [current] = await db
    .select({
      id: monthlySpotlights.id,
      year: monthlySpotlights.year,
      month: monthlySpotlights.month,
      curatorQuote: monthlySpotlights.curatorQuote,
      artistName: profiles.displayName,
      artistSlug: profiles.slug,
      artistBio: profiles.bio,
      artistAvatar: profiles.avatarUrl,
      artistSpecialties: profiles.specialties,
      artworkTitle: artworks.title,
      artworkSlug: artworks.slug,
      thumbnailStorageKey: artworkVersions.thumbnailStorageKey,
      publicStorageKey: artworkVersions.publicStorageKey,
    })
    .from(monthlySpotlights)
    .innerJoin(profiles, eq(profiles.id, monthlySpotlights.artistProfileId))
    .leftJoin(artworks, eq(artworks.id, monthlySpotlights.featuredArtworkId))
    .leftJoin(artworkVersions, eq(artworkVersions.id, artworks.currentVersionId))
    .where(
      and(
        eq(monthlySpotlights.year, currentYear),
        eq(monthlySpotlights.month, currentMonth),
        eq(monthlySpotlights.isPublished, true),
        isNull(monthlySpotlights.deletedAt)
      )
    )
    .orderBy(desc(monthlySpotlights.createdAt))
    .limit(1);

  if (current) return current;

  // 2. Fallback to latest published spotlight up to current period
  const [latest] = await db
    .select({
      id: monthlySpotlights.id,
      year: monthlySpotlights.year,
      month: monthlySpotlights.month,
      curatorQuote: monthlySpotlights.curatorQuote,
      artistName: profiles.displayName,
      artistSlug: profiles.slug,
      artistBio: profiles.bio,
      artistAvatar: profiles.avatarUrl,
      artistSpecialties: profiles.specialties,
      artworkTitle: artworks.title,
      artworkSlug: artworks.slug,
      thumbnailStorageKey: artworkVersions.thumbnailStorageKey,
      publicStorageKey: artworkVersions.publicStorageKey,
    })
    .from(monthlySpotlights)
    .innerJoin(profiles, eq(profiles.id, monthlySpotlights.artistProfileId))
    .leftJoin(artworks, eq(artworks.id, monthlySpotlights.featuredArtworkId))
    .leftJoin(artworkVersions, eq(artworkVersions.id, artworks.currentVersionId))
    .where(
      and(
        lte(monthlySpotlights.year, currentYear),
        eq(monthlySpotlights.isPublished, true),
        isNull(monthlySpotlights.deletedAt)
      )
    )
    .orderBy(
      desc(monthlySpotlights.year),
      desc(monthlySpotlights.month),
      desc(monthlySpotlights.createdAt)
    )
    .limit(1);

  return latest || null;
}

export async function getCuratedSpotlightHistory() {
  const history = await db
    .select({
      id: monthlySpotlights.id,
      year: monthlySpotlights.year,
      month: monthlySpotlights.month,
      curatorQuote: monthlySpotlights.curatorQuote,
      createdAt: monthlySpotlights.createdAt,
      artistName: profiles.displayName,
      artistSlug: profiles.slug,
      artistBio: profiles.bio,
      artistAvatar: profiles.avatarUrl,
      artistSpecialties: profiles.specialties,
      artworkTitle: artworks.title,
      artworkSlug: artworks.slug,
      thumbnailStorageKey: artworkVersions.thumbnailStorageKey,
      publicStorageKey: artworkVersions.publicStorageKey,
    })
    .from(monthlySpotlights)
    .innerJoin(profiles, eq(profiles.id, monthlySpotlights.artistProfileId))
    .leftJoin(artworks, eq(artworks.id, monthlySpotlights.featuredArtworkId))
    .leftJoin(artworkVersions, eq(artworkVersions.id, artworks.currentVersionId))
    .where(
      and(
        eq(monthlySpotlights.isPublished, true),
        isNull(monthlySpotlights.deletedAt)
      )
    )
    .orderBy(
      desc(monthlySpotlights.year),
      desc(monthlySpotlights.month),
      desc(monthlySpotlights.createdAt)
    );

  return history;
}
