"use server";

import { requireModerator } from "@/lib/rbac";
import { db } from "@/db";
import {
  challenges,
  challengeSubmissions,
  artworks,
  artworkVersions,
  challengeResults,
  challengeJuryAwards,
  challengeVotingRounds,
  challengeVotingRoundCandidates,
  auditLogs,
  activityLogs,
  users,
  profiles,
} from "@/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { autoAddChallengeSubmissionsToPortfolioService } from "@/lib/services/portfolioService";

export interface HistoricalEntryInput {
  userId: string;
  artworkTitle: string;
  artworkDescription?: string;
  softwareUsed?: string;
  mediaType: "image" | "video";
  masterStorageKey: string;
  publicStorageKey: string;
  thumbnailStorageKey?: string;
  finalRank?: number | null;
  totalCommunityStars?: number;
  winnerSlotType?: "community_vote_winner" | "community_vote" | "jury_award" | "none";
  categoryLabel?: string;
  slotTitle?: string; // Backwards compatibility with existing form state
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
  awardMode?: "vote_and_jury" | "vote_only" | "jury_only" | "showcase_only";
  starsPerMember?: number;
  entries: HistoricalEntryInput[];
}

export async function importHistoricalChallengeAction(
  data: HistoricalChallengeInput,
  actorOverride?: { id: string; role: "admin" | "moderator" }
) {
  const actor = actorOverride || (await requireModerator());

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

  // Validate single community winner constraint
  const communityWinners = data.entries.filter(
    (e) => e.winnerSlotType === "community_vote_winner" || e.winnerSlotType === "community_vote"
  );
  if (communityWinners.length > 1) {
    throw new Error("Hanya boleh ada maksimal satu (1) Juara Favorit Komunitas per challenge.");
  }

  const awardMode = data.awardMode || "vote_and_jury";
  if (awardMode === "jury_only" && communityWinners.length > 0) {
    throw new Error("Challenge mode 'jury_only' tidak memperbolehkan pemenang voting komunitas.");
  }
  if (awardMode === "showcase_only" && data.entries.some((e) => e.winnerSlotType && e.winnerSlotType !== "none")) {
    throw new Error("Challenge mode 'showcase_only' tidak memperbolehkan pemenang atau award.");
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
        awardMode,
        starsPerMember: data.starsPerMember ?? 1,
        isVisible: true,
        submissionStartsAt: new Date(data.submissionStartsAt),
        submissionDeadline: new Date(data.submissionDeadline),
        votingStartsAt: new Date(data.votingStartsAt),
        votingDeadline: new Date(data.votingDeadline),
        createdByUserId: actor.id,
      })
      .returning();

    // 2. Archived Voting Round Creation (for voting-enabled modes)
    let mainRound: any = null;
    if (awardMode === "vote_and_jury" || awardMode === "vote_only") {
      const [round] = await tx
        .insert(challengeVotingRounds)
        .values({
          challengeId: challenge.id,
          roundType: "main",
          status: "closed",
          startsAt: new Date(data.votingStartsAt),
          deadline: new Date(data.votingDeadline),
          starsPerMember: data.starsPerMember ?? 1,
          finalizedAt: new Date(data.votingDeadline),
        })
        .returning();
      mainRound = round;
    }

    // 3. Process Each Participant Entry
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

      const artworkSlug = `${challenge.slug}-${profile.slug || "artist"}-${Date.now().toString(36)}-${i + 1}`;

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

      // Freeze Candidate in main voting round if active
      if (mainRound) {
        await tx.insert(challengeVotingRoundCandidates).values({
          votingRoundId: mainRound.id,
          submissionId: sub.id,
        });
      }

      // Awards Processing (Only winners enter challengeResults)
      const isCommunityWinner =
        entry.winnerSlotType === "community_vote_winner" || entry.winnerSlotType === "community_vote";
      const isJuryAward = entry.winnerSlotType === "jury_award";

      if (isCommunityWinner) {
        const categoryLabel = entry.categoryLabel || entry.slotTitle || "Juara Favorit Komunitas";
        await tx.insert(challengeResults).values({
          challengeId: challenge.id,
          submissionId: sub.id,
          finalRank: 1,
          awardType: "community_vote_winner",
          categoryLabel,
          totalCommunityStars: entry.totalCommunityStars || 0,
          sourceVotingRoundId: mainRound?.id || null,
          resolutionMethod: "historical_import",
          isPublished: true,
        });
      } else if (isJuryAward) {
        const categoryLabel = entry.categoryLabel || entry.slotTitle || "Penghargaan Khusus Juri";
        const [juryAward] = await tx
          .insert(challengeJuryAwards)
          .values({
            challengeId: challenge.id,
            submissionId: sub.id,
            categoryLabel,
            recordedByUserId: actor.id,
          })
          .returning();

        await tx.insert(challengeResults).values({
          challengeId: challenge.id,
          submissionId: sub.id,
          finalRank: null, // Strictly UNRANKED per Gate C / Blueprint 2.2.2
          awardType: "jury_award",
          categoryLabel,
          juryAwardId: juryAward.id,
          recordedByUserId: actor.id,
          totalCommunityStars: entry.totalCommunityStars || 0,
          isPublished: true,
        });
      }
      // Note: if winnerSlotType === "none" or undefined, do NOT insert into challengeResults.
    }

    // 4. Auto-promote all challenge submissions to portfolio_entries with resolved captions
    await autoAddChallengeSubmissionsToPortfolioService(tx, challenge.id);

    // 5. Audit Log & Activity Log
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

    try {
      revalidatePath("/challenges");
      revalidatePath(`/challenges/${challenge.slug}`);
      revalidatePath(`/challenges/${challenge.slug}/results`);
      revalidatePath("/admin/challenges");
      revalidatePath("/admin/challenges/import");
      revalidatePath("/me/portfolio");
      revalidatePath("/gallery");
    } catch (_e) {
      // Ignored outside Next.js request context (e.g. tests)
    }

    return {
      success: true,
      challengeId: challenge.id,
      slug: challenge.slug,
      entriesImported: data.entries.length,
    };
  });
}
