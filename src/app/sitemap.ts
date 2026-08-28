import type { MetadataRoute } from "next";
import { db } from "@/db";
import { artworks, profiles, challenges, users } from "@/db/schema";
import { eq, and, isNull } from "drizzle-orm";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const siteUrl = process.env.NEXTAUTH_URL || "https://mengart.local";

  // Static routes
  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: `${siteUrl}`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 1.0,
    },
    {
      url: `${siteUrl}/gallery`,
      lastModified: new Date(),
      changeFrequency: "hourly",
      priority: 0.9,
    },
    {
      url: `${siteUrl}/challenges`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: `${siteUrl}/artists`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.8,
    },
    {
      url: `${siteUrl}/commissions`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.8,
    },
  ];

  try {
    // Dynamic Public Artworks
    const publicArtworks = await db
      .select({
        slug: artworks.slug,
        updatedAt: artworks.updatedAt,
      })
      .from(artworks)
      .innerJoin(users, eq(users.id, artworks.userId))
      .where(
        and(
          eq(artworks.publicationStatus, "published"),
          eq(artworks.audience, "public"),
          isNull(artworks.deletedAt),
          eq(users.membershipStatus, "active")
        )
      )
      .limit(500);

    const artworkRoutes: MetadataRoute.Sitemap = publicArtworks.map((art) => ({
      url: `${siteUrl}/artworks/${art.slug}`,
      lastModified: art.updatedAt || new Date(),
      changeFrequency: "weekly",
      priority: 0.7,
    }));

    // Dynamic Public Artists
    const publicArtists = await db
      .select({
        slug: profiles.slug,
        updatedAt: profiles.updatedAt,
      })
      .from(profiles)
      .innerJoin(users, eq(users.id, profiles.userId))
      .where(
        and(
          eq(profiles.profileStatus, "active_public"),
          isNull(profiles.deletedAt),
          eq(users.membershipStatus, "active")
        )
      )
      .limit(200);

    const artistRoutes: MetadataRoute.Sitemap = publicArtists.map((artist) => ({
      url: `${siteUrl}/artists/${artist.slug}`,
      lastModified: artist.updatedAt || new Date(),
      changeFrequency: "weekly",
      priority: 0.7,
    }));

    // Dynamic Challenges
    const challengeRows = await db
      .select({
        slug: challenges.slug,
        updatedAt: challenges.updatedAt,
      })
      .from(challenges)
      .limit(100);

    const challengeRoutes: MetadataRoute.Sitemap = challengeRows.map((ch) => ({
      url: `${siteUrl}/challenges/${ch.slug}`,
      lastModified: ch.updatedAt || new Date(),
      changeFrequency: "daily",
      priority: 0.8,
    }));

    return [...staticRoutes, ...artworkRoutes, ...artistRoutes, ...challengeRoutes];
  } catch (err) {
    console.error("Failed to generate dynamic sitemap entries:", err);
    return staticRoutes;
  }
}
