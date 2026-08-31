import { db } from "@/db";
import {
  challenges,
  challengeSubmissions,
  challengeResults,
  portfolioEntries,
  artworks,
  profiles,
} from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { assertActiveMember } from "@/lib/rbac";

/**
 * Deterministic multi-award caption resolver for challenge submissions.
 * Handles:
 * 1. Community Vote Winner
 * 2. Named and/or blank jury awards (canonical sort: named categories A-Z, generic fallback last)
 * 3. Participant fallback
 * Zero #2/#3 or generalized rank semantics.
 */
export function resolveChallengeSubmissionCaption(
  challengeTitle: string,
  results: Array<{ awardType: string; categoryLabel: string | null }>
): string {
  // 1. Community Vote Winner takes precedence
  const hasCommunityWinner = results.some((r) => r.awardType === "community_vote_winner");
  if (hasCommunityWinner) {
    return `Juara Favorit Komunitas — ${challengeTitle}`;
  }

  // 2. Collect and normalize all jury awards
  const juryResults = results.filter((r) => r.awardType === "jury_award");
  if (juryResults.length > 0) {
    const rawLabels = juryResults.map((r) => {
      const trimmed = r.categoryLabel?.trim();
      return trimmed && trimmed.length > 0 ? trimmed : "Pemenang Juri";
    });

    const distinctLabels = Array.from(new Set(rawLabels));

    // Canonical sort: Named categories alphabetically (A-Z), generic fallback "Pemenang Juri" last
    distinctLabels.sort((a, b) => {
      if (a === "Pemenang Juri" && b !== "Pemenang Juri") return 1;
      if (b === "Pemenang Juri" && a !== "Pemenang Juri") return -1;
      return a.localeCompare(b, undefined, { sensitivity: "base" });
    });

    if (distinctLabels.length === 1 && distinctLabels[0] === "Pemenang Juri") {
      return `Pemenang Juri — ${challengeTitle}`;
    }

    return `Penghargaan Juri: ${distinctLabels.join(", ")} — ${challengeTitle}`;
  }

  // 3. Participant fallback
  return `Peserta Challenge — ${challengeTitle}`;
}

/**
 * Idempotently adds all valid, non-disqualified submissions to artist portfolios
 * upon challenge finalization across all finished paths.
 * Updates system_caption without ever overwriting custom_caption or is_visible.
 */
export async function autoAddChallengeSubmissionsToPortfolioService(
  tx: any,
  challengeId: string
) {
  // 1. Fetch challenge
  const [challenge] = await tx
    .select()
    .from(challenges)
    .where(eq(challenges.id, challengeId));

  if (!challenge || challenge.status !== "finished") {
    return;
  }

  // 2. Fetch all valid submitted submissions
  const validSubmissions = await tx
    .select()
    .from(challengeSubmissions)
    .where(
      and(
        eq(challengeSubmissions.challengeId, challengeId),
        eq(challengeSubmissions.submissionStatus, "submitted")
      )
    );

  if (validSubmissions.length === 0) {
    return;
  }

  // 3. Fetch all published challenge results for this challenge
  const publishedResults = await tx
    .select()
    .from(challengeResults)
    .where(
      and(
        eq(challengeResults.challengeId, challengeId),
        eq(challengeResults.isPublished, true)
      )
    );

  // Group results by submissionId
  const resultsBySubmission = new Map<string, Array<{ awardType: string; categoryLabel: string | null }>>();
  for (const res of publishedResults) {
    const list = resultsBySubmission.get(res.submissionId) || [];
    list.push({
      awardType: res.awardType,
      categoryLabel: res.categoryLabel,
    });
    resultsBySubmission.set(res.submissionId, list);
  }

  // 4. Upsert portfolio entries
  for (const sub of validSubmissions) {
    const subResults = resultsBySubmission.get(sub.id) || [];
    const systemCaption = resolveChallengeSubmissionCaption(challenge.title, subResults);

    await tx
      .insert(portfolioEntries)
      .values({
        profileId: sub.profileId,
        artworkId: sub.artworkId,
        displayOrder: 0,
        isPinned: false,
        systemCaption,
        customCaption: null,
        isVisible: true,
      })
      .onConflictDoUpdate({
        target: [portfolioEntries.profileId, portfolioEntries.artworkId],
        set: {
          systemCaption,
          updatedAt: new Date(),
        },
      });
  }
}

/**
 * Toggle portfolio entry visibility for an active member.
 * Does not delete artwork or challenge submissions.
 */
export async function togglePortfolioEntryVisibilityService(
  tx: any,
  params: {
    actorUserId: string;
    artworkId: string;
    isVisible: boolean;
  }
) {
  const actor = await assertActiveMember(tx, params.actorUserId);

  const [artwork] = await tx
    .select()
    .from(artworks)
    .where(eq(artworks.id, params.artworkId));

  if (!artwork || artwork.userId !== actor.id) {
    throw new Error("Karya tidak ditemukan atau Anda bukan pemilik karya ini.");
  }

  const [profile] = await tx
    .select()
    .from(profiles)
    .where(eq(profiles.userId, actor.id));

  if (!profile) {
    throw new Error("Profil tidak ditemukan.");
  }

  const [updated] = await tx
    .update(portfolioEntries)
    .set({
      isVisible: params.isVisible,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(portfolioEntries.profileId, profile.id),
        eq(portfolioEntries.artworkId, artwork.id)
      )
    )
    .returning();

  return updated;
}

/**
 * Update custom caption for an artwork's portfolio entry by active owner.
 */
export async function updatePortfolioEntryCustomCaptionService(
  tx: any,
  params: {
    actorUserId: string;
    artworkId: string;
    customCaption: string | null;
  }
) {
  const actor = await assertActiveMember(tx, params.actorUserId);

  const [artwork] = await tx
    .select()
    .from(artworks)
    .where(eq(artworks.id, params.artworkId));

  if (!artwork || artwork.userId !== actor.id) {
    throw new Error("Karya tidak ditemukan atau Anda bukan pemilik karya ini.");
  }

  const [profile] = await tx
    .select()
    .from(profiles)
    .where(eq(profiles.userId, actor.id));

  if (!profile) {
    throw new Error("Profil tidak ditemukan.");
  }

  const [updated] = await tx
    .update(portfolioEntries)
    .set({
      customCaption: params.customCaption?.trim() || null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(portfolioEntries.profileId, profile.id),
        eq(portfolioEntries.artworkId, artwork.id)
      )
    )
    .returning();

  return updated;
}
