"use server";

import { requireAuth } from "@/lib/rbac";
import { db } from "@/db";
import {
  challenges,
  challengeSubmissions,
  challengeSubmissionVersions,
  challengeWinnerSlots,
  challengeKitFiles,
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
  if (!isRevision) {
    const submitPolicy = canSubmitChallengeEntry(user as any, challenge as any, existingSubmissions.length);
    if (!submitPolicy.allowed) {
      throw new Error(submitPolicy.reason || "Submisi challenge tidak diizinkan saat ini.");
    }
  } else if (!challenge.allowRevisions) {
    throw new Error("Revisi karya tidak diizinkan untuk challenge ini.");
  }

  const now = new Date();
  if (challenge.submissionDeadline && now > new Date(challenge.submissionDeadline)) {
    throw new Error("Batas waktu submisi telah berakhir (Authoritative Deadline Passed).");
  }

  let finalArtworkVersionId = existingArtworkVersionId;

  // 2. If uploading a fresh file, process it through the media pipeline
  if (file && file.size > 0) {
    await ensureStorageDirectories();
    const ext = path.extname(file.name).toLowerCase();
    const mime = file.type.toLowerCase() || "image/jpeg";
    const tempFilename = `challenge_temp_${Date.now()}_${crypto.randomBytes(12).toString("hex")}${ext}`;
    const tempPath = resolveStoragePath("temp", tempFilename);
    const buffer = Buffer.from(await file.arrayBuffer());
    await fs.writeFile(tempPath, buffer);

    const isGif = mime === "image/gif" || ext === ".gif";
    const isVideo = mime.startsWith("video/") || ext === ".mp4" || ext === ".webm";
    const mediaType: "image" | "gif" | "video" = isGif ? "gif" : isVideo ? "video" : "image";

    // Create artwork container
    const [artwork] = await db
      .insert(artworks)
      .values({
        userId: user.id,
        title,
        slug: slugify(title),
        description,
        mediaType,
        audience: "public",
        critiqueMode: "showcase_only",
        publicationStatus: "published",
      })
      .returning();

    // Create artwork version
    const [version] = await db
      .insert(artworkVersions)
      .values({
        artworkId: artwork.id,
        versionNumber: 1,
        mediaType,
        masterStorageKey: tempFilename,
        mimeType: mime,
        fileSizeBytes: file.size,
        checksumSha256: crypto.createHash("sha256").update(buffer).digest("hex"),
        processingStatus: "pending",
      })
      .returning();

    // Process media synchronously inline / worker
    await processArtworkMediaJob({
      artworkId: artwork.id,
      versionId: version.id,
      tempFilename,
      mediaType,
      originalFilename: file.name,
      userId: user.id,
    });

    finalArtworkVersionId = version.id;
  }

  if (!finalArtworkVersionId) {
    throw new Error("Silakan unggah file karya atau pilih dari portofolio Anda.");
  }

  // 3. Create or Revise Submission in Database Transaction
  const result = await db.transaction(async (tx) => {
    // Check if member already has a submission record for this challenge
    const [existingSubmission] = await tx
      .select()
      .from(challengeSubmissions)
      .where(
        and(
          eq(challengeSubmissions.challengeId, challengeId),
          eq(challengeSubmissions.userId, user.id)
        )
      )
      .limit(1);

    if (!existingSubmission) {
      // First submission
      const [newSub] = await tx
        .insert(challengeSubmissions)
        .values({
          challengeId,
          userId: user.id,
          profileId: profile.id,
          submissionStatus: "submitted",
        })
        .returning();

      const [newVer] = await tx
        .insert(challengeSubmissionVersions)
        .values({
          submissionId: newSub.id,
          versionNumber: 1,
          title,
          description,
          softwareUsed,
          artworkVersionId: finalArtworkVersionId!,
        })
        .returning();

      await tx
        .update(challengeSubmissions)
        .set({ currentVersionId: newVer.id, updatedAt: now })
        .where(eq(challengeSubmissions.id, newSub.id));

      await tx.insert(auditLogs).values({
        actorId: user.id,
        action: "challenge.submission_created",
        targetType: "challenge_submission",
        targetId: newSub.id,
        metadata: { challengeId, title, versionNumber: 1 },
      });

      return { submission: newSub, version: newVer, isRevision: false };
    } else {
      // Revision
      if (!challenge.allowRevisions) {
        throw new Error("Challenge ini tidak mengizinkan revisi setelah dikirimkan.");
      }

      // Get latest version number
      const [latestVer] = await tx
        .select({ versionNumber: challengeSubmissionVersions.versionNumber })
        .from(challengeSubmissionVersions)
        .where(eq(challengeSubmissionVersions.submissionId, existingSubmission.id))
        .orderBy(desc(challengeSubmissionVersions.versionNumber))
        .limit(1);

      const nextVersionNum = (latestVer?.versionNumber || 1) + 1;

      const [newVer] = await tx
        .insert(challengeSubmissionVersions)
        .values({
          submissionId: existingSubmission.id,
          versionNumber: nextVersionNum,
          title,
          description,
          softwareUsed,
          artworkVersionId: finalArtworkVersionId!,
        })
        .returning();

      await tx
        .update(challengeSubmissions)
        .set({
          currentVersionId: newVer.id,
          submissionStatus: "submitted",
          updatedAt: now,
        })
        .where(eq(challengeSubmissions.id, existingSubmission.id));

      await tx.insert(auditLogs).values({
        actorId: user.id,
        action: "challenge.submission_revised",
        targetType: "challenge_submission",
        targetId: existingSubmission.id,
        metadata: { challengeId, title, versionNumber: nextVersionNum },
      });

      return { submission: existingSubmission, version: newVer, isRevision: true };
    }
  });

  // 4. In-App Notification
  await createNotification({
    userId: user.id,
    type: "challenge_submitted",
    title: result.isRevision ? "Revisi Submisi Diterima" : "Karya Submisi Terkirim!",
    body: `Karya Anda "${title}" telah berhasil didaftarkan pada "${challenge.title}".`,
    actionUrl: `/challenges/${challenge.slug}`,
  });

  revalidatePath(`/challenges/${challenge.slug}`);
  revalidatePath("/challenges");

  return {
    success: true,
    isRevision: result.isRevision,
    submissionId: result.submission.id,
  };
}

export async function withdrawSubmissionAction(challengeId: string) {
  const user = await requireAuth("/login");

  const [challenge] = await db
    .select()
    .from(challenges)
    .where(eq(challenges.id, challengeId))
    .limit(1);

  if (!challenge) throw new Error("Challenge tidak ditemukan.");

  const effectiveStatus = getEffectiveChallengeStatus(challenge);
  if (effectiveStatus !== "submission_open") {
    throw new Error("Submisi hanya dapat ditarik selama periode submisi masih dibuka.");
  }

  await db
    .update(challengeSubmissions)
    .set({ submissionStatus: "withdrawn", updatedAt: new Date() })
    .where(
      and(
        eq(challengeSubmissions.challengeId, challengeId),
        eq(challengeSubmissions.userId, user.id)
      )
    );

  revalidatePath(`/challenges/${challenge.slug}`);
  return { success: true };
}

export async function createOrUpdateChallengeAction(formData: FormData) {
  const user = await requireAuth("/login");
  if (user.role !== "admin" && user.role !== "moderator") {
    throw new Error("Hanya administrator/moderator yang dapat mengelola challenge.");
  }

  const id = formData.get("id") as string | null;
  const title = (formData.get("title") as string)?.trim();
  const theme = (formData.get("theme") as string)?.trim();
  const description = (formData.get("description") as string)?.trim();
  const promptRules = (formData.get("promptRules") as string)?.trim();
  const awardMode = (formData.get("awardMode") as any) || "vote_and_jury";
  const starsPerMember = Number(formData.get("starsPerMember") || 3);
  const quorumRequirement = Number(formData.get("quorumRequirement") || 0);
  const allowRevisions = formData.get("allowRevisions") === "true";
  const submissionStartsAt = formData.get("submissionStartsAt")
    ? new Date(formData.get("submissionStartsAt") as string)
    : null;
  const submissionDeadline = formData.get("submissionDeadline")
    ? new Date(formData.get("submissionDeadline") as string)
    : null;
  const votingStartsAt = formData.get("votingStartsAt")
    ? new Date(formData.get("votingStartsAt") as string)
    : null;
  const votingDeadline = formData.get("votingDeadline")
    ? new Date(formData.get("votingDeadline") as string)
    : null;

  if (!title || !theme || !description || !promptRules) {
    throw new Error("Harap lengkapi seluruh informasi dasar challenge.");
  }

  if (id) {
    // Update
    await db
      .update(challenges)
      .set({
        title,
        theme,
        description,
        promptRules,
        awardMode,
        starsPerMember,
        quorumRequirement,
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
    // Create new
    const slug = slugify(title);
    const now = new Date();
    const initialStatus =
      submissionStartsAt && new Date(submissionStartsAt) > now ? "scheduled" : "submission_open";

    const [created] = await db
      .insert(challenges)
      .values({
        title,
        slug,
        theme,
        description,
        promptRules,
        status: initialStatus,
        awardMode,
        starsPerMember,
        quorumRequirement,
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

export async function transitionChallengeStatusAction(
  challengeId: string,
  newStatus: EffectiveChallengeStatus,
  reason?: string
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

  if (!challenge) throw new Error("Challenge tidak ditemukan.");

  await db
    .update(challenges)
    .set({
      status: newStatus as any,
      cancellationReason: newStatus === "cancelled" ? reason || "Dibatalkan oleh admin" : null,
      updatedAt: new Date(),
    })
    .where(eq(challenges.id, challengeId));

  await db.insert(auditLogs).values({
    actorId: user.id,
    action: `challenge.transition_${newStatus}`,
    targetType: "challenge",
    targetId: challengeId,
    reason: reason || `Status changed from ${challenge.status} to ${newStatus}`,
  });

  revalidatePath(`/challenges/${challenge.slug}`);
  revalidatePath("/admin/challenges");
  revalidatePath("/challenges");

  return { success: true };
}
