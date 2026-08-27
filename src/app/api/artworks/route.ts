import { NextResponse } from "next/server";
import { db } from "@/db";
import { artworks, artworkVersions, profiles, tags, artworkTags } from "@/db/schema";
import { eq, and, desc, sql, ilike } from "drizzle-orm";
import { auth } from "@/auth";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search")?.trim();
  const tag = searchParams.get("tag")?.trim();
  const mediaType = searchParams.get("mediaType");
  const critiqueMode = searchParams.get("critiqueMode");
  const limit = Math.min(Number(searchParams.get("limit")) || 30, 100);

  const session = await auth();
  const isMember = !!session?.user?.id;

  const conditions = [
    eq(artworks.publicationStatus, "published"),
    isMember
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

  const query = db
    .select({
      id: artworks.id,
      title: artworks.title,
      slug: artworks.slug,
      description: artworks.description,
      mediaType: artworks.mediaType,
      audience: artworks.audience,
      critiqueMode: artworks.critiqueMode,
      createdAt: artworks.createdAt,
      artistName: profiles.displayName,
      artistSlug: profiles.slug,
      artistAvatar: profiles.avatarUrl,
      artistCommissionStatus: profiles.commissionStatus,
      thumbnailStorageKey: artworkVersions.thumbnailStorageKey,
      publicStorageKey: artworkVersions.publicStorageKey,
      masterStorageKey: artworkVersions.masterStorageKey,
      width: artworkVersions.width,
      height: artworkVersions.height,
    })
    .from(artworks)
    .innerJoin(profiles, eq(profiles.userId, artworks.userId))
    .leftJoin(artworkVersions, eq(artworkVersions.id, artworks.currentVersionId))
    .where(and(...conditions))
    .orderBy(desc(artworks.createdAt))
    .limit(limit);

  const items = await query;
  return NextResponse.json({ items });
}
