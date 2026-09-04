"use server";

import { auth } from "@/auth";
import { requireModerator } from "@/lib/rbac";
import { db } from "@/db";
import {
  challenges,
  challengeSubmissions,
  artworks,
  artworkVersions,
  challengeResults,
  auditLogs,
  activityLogs,
  users,
  profiles,
} from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export interface HistoricalEntryInput {
  userId: string;
  artworkTitle: string;
  artworkDescription?: string;
  softwareUsed?: string;
  mediaType: "image" | "video";
  masterStorageKey: string;
  publicStorageKey: string;
  thumbnailStorageKey?: string;
  finalRank: number;
  totalCommunityStars: number;
  juryScore?: number;
  winnerSlotType?: "community_vote" | "jury_award" | "none";
  slotTitle?: string;
}

export interface HistoricalChallengeInput {
  title: string;
  slug: string;
  theme: string;
  description: string;
  promptRules: string;
  submissionStartsAt: string;
  submissionDeadline: string;
  votingStartsAt: string;
  votingDeadline: string;
  entries: HistoricalEntryInput[];
}

export async function importHistoricalChallengeAction(data: HistoricalChallengeInput) {
  const actor = await requireModerator();

  if (!data.title.trim() || !data.slug.trim() || !data.theme.trim()) {
    throw new Error("Judul, slug, dan tema challenge wajib diisi.");
  }

  // Check slug uniqueness
  const [existingChallenge] = await db
    .select()
    .from(challenges)
    .where(eq(challenges.slug, data.slug.trim().toLowerCase()))
    .limit(1);

  if (existingChallenge) {
    throw new Error(`Challenge dengan slug "${data.slug}" sudah terdaftar.`);
  }

  return await db.transaction(async (tx) => {
    // 1. Create Challenge Entity
    const [challenge] = await tx
      .insert(challenges)
      .values({
        title: data.title.trim(),
        slug: data.slug.trim().toLowerCase(),
        theme: data.theme.trim(),
        description: data.description.trim(),
        promptRules: data.promptRules.trim() || "Ketentuan karya orisinal atelier.",
        status: "finished", // Authoritatively marked as finished
        awardMode: "vote_and_jury",
        starsPerMember: 3,
        isVisible: true,
        submissionStartsAt: new Date(data.submissionStartsAt),
        submissionDeadline: new Date(data.submissionDeadline),
        votingStartsAt: new Date(data.votingStartsAt),
        votingDeadline: new Date(data.votingDeadline),
        createdByUserId: actor.id,
      })
      .returning();

    // 2. Process Each Participant Entry
    for (let i = 0; i < data.entries.length; i++) {
      const entry = data.entries[i];

      // Fetch user profile
      const [profile] = await tx
        .select()
        .from(profiles)
        .where(eq(profiles.userId, entry.userId))
        .limit(1);

      if (!profile) {
        throw new Error(`Profil pengguna untuk user ID ${entry.userId} tidak ditemukan.`);
      }

      const artworkSlug = `${data.slug}-${profile.slug || "artist"}-${Date.now().toString(36)}-${i + 1}`;

      // Create Artwork
      const [art] = await tx
        .insert(artworks)
        .values({
          userId: entry.userId,
          slug: artworkSlug,
          title: entry.artworkTitle.trim(),
          description: entry.artworkDescription?.trim() || null,
          mediaType: entry.mediaType,
          audience: "public",
          critiqueMode: "open_for_critique",
          publicationStatus: "published",
        })
        .returning();

      // Create Artwork Version
      const [artVersion] = await tx
        .insert(artworkVersions)
        .values({
          artworkId: art.id,
          versionNumber: 1,
          mediaType: entry.mediaType,
          masterStorageKey: entry.masterStorageKey,
          publicStorageKey: entry.publicStorageKey,
          thumbnailStorageKey: entry.thumbnailStorageKey || entry.publicStorageKey,
          mimeType: entry.mediaType === "video" ? "video/mp4" : "image/webp",
          fileSizeBytes: 1024 * 1024 * 2,
          checksumSha256: `historical_checksum_${Date.now()}_${i}`,
          processingStatus: "ready",
        })
        .returning();

      await tx.update(artworks).set({ currentVersionId: artVersion.id }).where(eq(artworks.id, art.id));

      // Create Challenge Submission
      const [sub] = await tx
        .insert(challengeSubmissions)
        .values({
          challengeId: challenge.id,
          userId: entry.userId,
          profileId: profile.id,
          artworkId: art.id,
          artworkVersionId: artVersion.id,
          title: entry.artworkTitle.trim(),
          description: entry.artworkDescription?.trim() || null,
          softwareUsed: entry.softwareUsed?.trim() || null,
          submissionStatus: "submitted",
        })
        .returning();

      const awardType = entry.winnerSlotType === "jury_award" ? "jury_award" : "community_vote_winner";
      const categoryLabel = entry.slotTitle || (entry.winnerSlotType === "jury_award" ? "Pilihan Dewan Juri Atelier" : "Juara Favorit Komunitas");

      // Create Challenge Result Entry
      await tx.insert(challengeResults).values({
        challengeId: challenge.id,
        submissionId: sub.id,
        finalRank: entry.finalRank,
        awardType,
        categoryLabel,
        totalCommunityStars: entry.totalCommunityStars || 0,
        juryScore: entry.juryScore ? entry.juryScore.toString() : null,
        isPublished: true,
      });
    }

    // 3. Audit Log & Activity Log
    await tx.insert(auditLogs).values({
      actorId: actor.id,
      action: "historical_challenge_imported",
      targetType: "challenge",
      targetId: challenge.id,
      reason: `Impor data historis event "${challenge.title}" dengan ${data.entries.length} karya submisi.`,
      metadata: {
        slug: challenge.slug,
        title: challenge.title,
        entriesCount: data.entries.length,
      },
    });

    await tx.insert(activityLogs).values({
      eventType: "challenge_results_published",
      targetType: "challenge",
      targetId: challenge.id,
      metadata: {
        actorId: actor.id,
        description: `Data historis hasil event "${challenge.title}" berhasil diimpor ke dalam Hall of Fame.`,
        slug: challenge.slug,
        title: challenge.title,
      },
    });

    revalidatePath("/challenges");
    revalidatePath(`/challenges/${challenge.slug}`);
    revalidatePath(`/challenges/${challenge.slug}/results`);
    revalidatePath("/admin/historical-backfill");

    return {
      success: true,
      challengeId: challenge.id,
      slug: challenge.slug,
      entriesImported: data.entries.length,
    };
  });
}
