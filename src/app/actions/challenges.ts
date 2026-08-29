"use server";

import { requireAuth } from "@/lib/rbac";
import { db } from "@/db";
import {
  challenges,
  challengeSubmissions,
  challengeSubmissionVersions,
  challengeWinnerSlots,
  challengeKitFiles,
  challengeVotingRounds,
  challengeVotingRoundCandidates,
  profiles,
  artworks,
  artworkVersions,
  portfolioEntries,
  auditLogs,
} from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import crypto from "crypto";
import path from "path";
import fs from "fs/promises";
import { getEffectiveChallengeStatus, type EffectiveChallengeStatus } from "@/lib/challenges";
import { resolveStoragePath, ensureStorageDirectories } from "@/lib/storage";
import { processArtworkMediaJob } from "@/lib/mediaProcessor";
import { createNotification } from "@/lib/notifications";
import { canSubmitChallengeEntry } from "@/lib/policy";
import { checkRateLimit } from "@/lib/rateLimit";

function slugify(text: string): string {
  const base = text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const rand = crypto.randomBytes(3).toString("hex");
  return `${base || "challenge"}-${rand}`;
}

export async function submitArtworkToChallengeAction(formData: FormData) {
  const user = await requireAuth("/login");

  // Rate Limiting per user
  const rl = await checkRateLimit(`challenge_submit:${user.id}`, { limit: 10, windowSeconds: 60 });
  if (!rl.success) {
    throw new Error("Terlalu banyak pengiriman submisi. Harap tunggu beberapa saat.");
  }

  const [profile] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.userId, user.id))
    .limit(1);

  if (!profile) {
    throw new Error("Profil artist tidak ditemukan.");
  }

  const challengeId = formData.get("challengeId") as string;
  const title = (formData.get("title") as string)?.trim();
  const description = (formData.get("description") as string)?.trim() || null;
  const softwareUsed = (formData.get("softwareUsed") as string)?.trim() || null;
  const existingArtworkVersionId = formData.get("existingArtworkVersionId") as string | null;
  const file = formData.get("file") as File | null;

  if (!challengeId || !title) {
    throw new Error("Data submisi tidak lengkap.");
  }

  // 1. Fetch challenge & verify authoritative submission policy
  const [challenge] = await db
    .select()
    .from(challenges)
    .where(eq(challenges.id, challengeId))
    .limit(1);

  if (!challenge) {
    throw new Error("Challenge tidak ditemukan.");
  }

  const existingSubmissions = await db
    .select()
    .from(challengeSubmissions)
    .where(
      and(
        eq(challengeSubmissions.challengeId, challengeId),
        eq(challengeSubmissions.userId, user.id)
      )
    );

  const isRevision = existingSubmissions.length > 0;
  
  // Authoritative submission policy evaluation (even on revisions)
  const submitPolicy = canSubmitChallengeEntry(user as any, challenge as any, isRevision ? 0 : existingSubmissions.length);
  if (!submitPolicy.allowed) {
    throw new Error(submitPolicy.reason || "Submisi challenge tidak diizinkan saat ini.");
  }

  if (isRevision && !challenge.allowRevisions) {
    throw new Error("Revisi karya tidak diizinkan untuk challenge ini.");
  }

  const now = new Date();
  if (challenge.submissionDeadline && now > new Date(challenge.submissionDeadline)) {
    throw new Error("Batas waktu submisi telah berakhir (Authoritative Deadline Passed).");
  }

  let finalArtworkVersionId = existingArtworkVersionId;

  // 2. Handle File Upload if provided
  if (file && file.size > 0) {
    const rawBuffer = Buffer.from(await file.arrayBuffer());
    const tempKey = `temp_sub_${Date.now()}_${crypto.randomBytes(6).toString("hex")}${path.extname(file.name)}`;
    const tempPath = resolveStoragePath("temp", tempKey);

    await ensureStorageDirectories();
    await fs.writeFile(tempPath, rawBuffer);

    // Canonical Artwork creation
    const artSlug = slugify(title);
    const [createdArtwork] = await db
      .insert(artworks)
      .values({
        userId: user.id,
        title,
        slug: artSlug,
        description,
        mediaType: file.type.startsWith("video/") ? "video" : file.type === "image/gif" ? "gif" : "image",
        audience: "public",
        critiqueMode: "showcase_only",
        publicationStatus: "published",
      })
      .returning();

    const [createdVersion] = await db
      .insert(artworkVersions)
      .values({
        artworkId: createdArtwork.id,
        versionNumber: 1,
        mediaType: createdArtwork.mediaType as any,
        fileSizeBytes: file.size,
        mimeType: file.type,
        masterStorageKey: tempKey,
        checksumSha256: "pending",
        processingStatus: "pending",
      })
      .returning();

    await processArtworkMediaJob({
      artworkId: createdArtwork.id,
      versionId: createdVersion.id,
      tempFilename: tempKey,
      mediaType: createdArtwork.mediaType as any,
      originalFilename: file.name,
      userId: user.id,
    });

    await db
      .update(artworks)
      .set({ currentVersionId: createdVersion.id })
      .where(eq(artworks.id, createdArtwork.id));

    finalArtworkVersionId = createdVersion.id;
  }

  if (!finalArtworkVersionId) {
    throw new Error("Karya belum dipilih atau berkas gagal diunggah.");
  }

  // 3. Upsert Submission and record Immutable Submission Version
  let submissionId: string;
  let nextVersionNumber = 1;

  if (isRevision) {
    const existingSub = existingSubmissions[0];
    submissionId = existingSub.id;

    const [lastVersion] = await db
      .select({ versionNumber: challengeSubmissionVersions.versionNumber })
      .from(challengeSubmissionVersions)
      .where(eq(challengeSubmissionVersions.submissionId, submissionId))
      .orderBy(desc(challengeSubmissionVersions.versionNumber))
      .limit(1);

    nextVersionNumber = (lastVersion?.versionNumber || 1) + 1;

    await db
      .update(challengeSubmissions)
      .set({
        currentVersionId: finalArtworkVersionId,
        submissionStatus: "submitted",
        updatedAt: new Date(),
      })
      .where(eq(challengeSubmissions.id, submissionId));
  } else {
    const [newSub] = await db
      .insert(challengeSubmissions)
      .values({
        challengeId,
        userId: user.id,
        profileId: profile.id,
        currentVersionId: finalArtworkVersionId,
        submissionStatus: "submitted",
      })
      .returning();

    submissionId = newSub.id;
  }

  await db.insert(challengeSubmissionVersions).values({
    submissionId,
    versionNumber: nextVersionNumber,
    title,
    description,
    softwareUsed,
    artworkVersionId: finalArtworkVersionId,
  });

  revalidatePath(`/challenges/${challenge.slug}`);
  revalidatePath("/me/portfolio");
  return { success: true, submissionId, versionNumber: nextVersionNumber };
}

export async function createOrUpdateChallengeAction(formData: FormData) {
  const user = await requireAuth("/login");
  if (user.role !== "admin" && user.role !== "moderator") {
    throw new Error("Tidak memiliki izin mengelola challenge.");
  }

  const id = formData.get("id") as string | null;
  const title = (formData.get("title") as string)?.trim();
  const theme = (formData.get("theme") as string)?.trim();
  const description = (formData.get("description") as string)?.trim();
  const promptRules = (formData.get("promptRules") as string)?.trim();
  const awardMode = (formData.get("awardMode") as any) || "vote_and_jury";
  const rawStars = formData.get("starsPerMember");
  const parsedStars =
    rawStars !== null && rawStars !== undefined && rawStars !== ""
      ? parseInt(rawStars as string, 10)
      : 1;
  const starsPerMember = Number.isInteger(parsedStars) && parsedStars >= 1 ? parsedStars : 1;
  const allowRevisions = formData.get("allowRevisions") === "true";

  const subStartsRaw = formData.get("submissionStartsAt") as string;
  const subDeadRaw = formData.get("submissionDeadline") as string;
  const voteStartsRaw = formData.get("votingStartsAt") as string;
  const voteDeadRaw = formData.get("votingDeadline") as string;

  const submissionStartsAt = subStartsRaw ? new Date(subStartsRaw) : null;
  const submissionDeadline = subDeadRaw ? new Date(subDeadRaw) : null;
  const votingStartsAt = voteStartsRaw ? new Date(voteStartsRaw) : null;
  const votingDeadline = voteDeadRaw ? new Date(voteDeadRaw) : null;

  if (!title || !theme || !description || !promptRules) {
    throw new Error("Harap lengkapi semua kolom wajib.");
  }

  const slug = slugify(title);

  if (id) {
    await db
      .update(challenges)
      .set({
        title,
        theme,
        description,
        promptRules,
        awardMode,
        starsPerMember,
        allowRevisions,
        submissionStartsAt,
        submissionDeadline,
        votingStartsAt,
        votingDeadline,
        updatedAt: new Date(),
      })
      .where(eq(challenges.id, id));

    revalidatePath("/admin/challenges");
    revalidatePath("/challenges");
    return { success: true, id };
  } else {
    const [created] = await db
      .insert(challenges)
      .values({
        title,
        slug,
        theme,
        description,
        promptRules,
        status: "scheduled",
        awardMode,
        starsPerMember,
        allowRevisions,
        submissionStartsAt,
        submissionDeadline,
        votingStartsAt,
        votingDeadline,
        createdByUserId: user.id,
      })
      .returning();

    // Default Winner Slots
    await db.insert(challengeWinnerSlots).values([
      {
        challengeId: created.id,
        slotType: "community_vote",
        rank: 1,
        title: "Juara 1 Favorit Komunitas",
        displayOrder: 1,
      },
      {
        challengeId: created.id,
        slotType: "community_vote",
        rank: 2,
        title: "Juara 2 Favorit Komunitas",
        displayOrder: 2,
      },
      {
        challengeId: created.id,
        slotType: "jury_award",
        rank: 1,
        title: "Pilihan Juri — Best Overall Craft",
        displayOrder: 3,
      },
    ]);

    revalidatePath("/admin/challenges");
    revalidatePath("/challenges");
    return { success: true, id: created.id, slug: created.slug };
  }
}

import {
  transitionChallengeStatusService,
  revokeChallengeResultsService,
} from "@/lib/services/challengeService";

export async function transitionChallengeStatusAction(
  challengeId: string,
  newStatus: EffectiveChallengeStatus,
  reason?: string,
  options?: {
    submissionDeadline?: Date | string | null;
    votingDeadline?: Date | string | null;
  }
) {
  const user = await requireAuth("/login");
  if (user.role !== "admin" && user.role !== "moderator") {
    throw new Error("Tidak memiliki izin mengubah status challenge.");
  }

  const result = await db.transaction(async (tx) => {
    return transitionChallengeStatusService(
      tx,
      { userId: user.id, role: user.role },
      challengeId,
      newStatus,
      { reason, ...options }
    );
  });

  const [challenge] = await db
    .select({ slug: challenges.slug })
    .from(challenges)
    .where(eq(challenges.id, challengeId))
    .limit(1);

  if (challenge) {
    revalidatePath(`/challenges/${challenge.slug}`);
  }
  revalidatePath("/admin/challenges");
  revalidatePath("/challenges");

  return result;
}

export async function pauseChallengeAction(challengeId: string, reason: string) {
  return transitionChallengeStatusAction(challengeId, "paused", reason);
}

export async function resumeChallengeAction(
  challengeId: string,
  options?: {
    submissionDeadline?: Date | string | null;
    votingDeadline?: Date | string | null;
  }
) {
  const user = await requireAuth("/login");
  if (user.role !== "admin" && user.role !== "moderator") {
    throw new Error("Tidak memiliki izin.");
  }

  const [challenge] = await db
    .select()
    .from(challenges)
    .where(eq(challenges.id, challengeId))
    .limit(1);

  if (!challenge || challenge.status !== "paused" || !challenge.pausedPreviousStatus) {
    throw new Error("Challenge tidak dalam status jeda (paused).");
  }

  return transitionChallengeStatusAction(
    challengeId,
    challenge.pausedPreviousStatus,
    "Melanjutkan challenge dari status jeda",
    options
  );
}

export async function revokeChallengeResultsAction(challengeId: string, reason: string) {
  const user = await requireAuth("/login");
  if (user.role !== "admin" && user.role !== "moderator") {
    throw new Error("Hanya administrator atau moderator yang dapat mencabut hasil challenge.");
  }

  const result = await db.transaction(async (tx) => {
    return revokeChallengeResultsService(
      tx,
      { userId: user.id, role: user.role },
      challengeId,
      reason
    );
  });

  const [challenge] = await db
    .select({ slug: challenges.slug })
    .from(challenges)
    .where(eq(challenges.id, challengeId))
    .limit(1);

  if (challenge) {
    revalidatePath(`/challenges/${challenge.slug}/results`);
    revalidatePath(`/challenges/${challenge.slug}`);
  }
  revalidatePath("/admin/challenges");
  revalidatePath("/challenges");

  return result;
}
