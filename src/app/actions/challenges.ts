"use server";

import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/rbac";
import { db } from "@/db";
import { challenges, challengeSubmissions } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { checkRateLimit } from "@/lib/rateLimit";
import { slugify, type EffectiveChallengeStatus } from "@/lib/challenges";
import {
  createChallengeSubmissionService,
  replaceChallengeSubmissionMediaService,
} from "@/lib/services/submissionService";

export async function submitArtworkToChallengeAction(formData: FormData) {
  const user = await requireAuth("/login");

  // Rate Limiting per user (Security-Critical, Fail-Closed)
  const rl = await checkRateLimit(`challenge_submit:${user.id}`, {
    limit: 10,
    windowSeconds: 60,
    criticality: "fail_closed",
  });
  if (!rl.success) {
    throw new Error("Terlalu banyak pengiriman submisi. Harap tunggu beberapa saat.");
  }

  const challengeId = formData.get("challengeId") as string;
  const title = (formData.get("title") as string)?.trim();
  const description = (formData.get("description") as string)?.trim() || null;
  const softwareUsed = (formData.get("softwareUsed") as string)?.trim() || null;
  const rawSpoiler = formData.get("isSpoiler");
  const isSpoiler =
    rawSpoiler === null
      ? undefined
      : rawSpoiler === "true" ||
        rawSpoiler === "1" ||
        rawSpoiler === "on";
  const file = formData.get("file") as File | null;

  if (!challengeId || !title) {
    throw new Error("Data submisi tidak lengkap.");
  }

  const [challenge] = await db
    .select()
    .from(challenges)
    .where(eq(challenges.id, challengeId))
    .limit(1);

  if (!challenge) {
    throw new Error("Challenge tidak ditemukan.");
  }

  const [existingSubmission] = await db
    .select()
    .from(challengeSubmissions)
    .where(
      and(
        eq(challengeSubmissions.challengeId, challengeId),
        eq(challengeSubmissions.userId, user.id)
      )
    )
    .limit(1);

  let filePayload: { buffer: Buffer; name: string; type: string; size: number } | null = null;
  if (file && file.size > 0) {
    const isVideo = file.type.startsWith("video/");
    const maxBytes = isVideo ? 50 * 1024 * 1024 : 25 * 1024 * 1024;
    if (file.size > maxBytes) {
      throw new Error(`Ukuran berkas melebihi batas maksimum (${isVideo ? "50MB" : "25MB"}).`);
    }

    filePayload = {
      buffer: Buffer.from(await file.arrayBuffer()),
      name: file.name,
      type: file.type,
      size: file.size,
    };
  }

  let submissionId: string;

  if (existingSubmission) {
    // Media / metadata replacement
    const updated = await replaceChallengeSubmissionMediaService({
      actorUserId: user.id,
      submissionId: existingSubmission.id,
      title,
      description,
      softwareUsed,
      isSpoiler,
      file: filePayload,
    });
    submissionId = updated.id;
  } else {
    // Initial challenge submission
    if (!filePayload) {
      throw new Error("Berkas karya wajib diunggah untuk submisi challenge.");
    }
    const created = await createChallengeSubmissionService({
      actorUserId: user.id,
      challengeId,
      title,
      description,
      softwareUsed,
      isSpoiler,
      file: filePayload,
    });
    submissionId = created.submission.id;
  }

  revalidatePath(`/challenges/${challenge.slug}`);
  revalidatePath("/me/portfolio");
  return { success: true, submissionId };
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

    revalidatePath("/admin/challenges");
    revalidatePath("/challenges");
    return { success: true, id: created.id, slug: created.slug };
  }
}

import { transitionChallengeStatusService } from "@/lib/services/challengeService";
import { revokeChallengeResultsService } from "@/lib/services/juryService";

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
