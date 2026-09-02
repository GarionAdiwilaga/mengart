"use server";

import { db } from "@/db";
import { challenges } from "@/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireAuth, requireModerator } from "@/lib/rbac";
import { checkRateLimit } from "@/lib/rateLimit";
import {
  addJuryAssignmentService,
  removeJuryAssignmentService,
  assignJuryRecorderService,
  createJuryAwardService,
  updateJuryAwardService,
  deleteJuryAwardService,
  publishJuryChallengeResultsService,
  cancelJuryChallengeService,
  revokeChallengeResultsService,
  correctCommunityWinnerService,
  republishChallengeResultsService,
  cancelRevokedChallengeService,
} from "@/lib/services/juryService";

async function revalidateChallengePaths(challengeId: string) {
  const [challenge] = await db
    .select({ slug: challenges.slug })
    .from(challenges)
    .where(eq(challenges.id, challengeId))
    .limit(1);

  if (challenge) {
    revalidatePath(`/challenges/${challenge.slug}`);
    revalidatePath(`/challenges/${challenge.slug}/jury`);
    revalidatePath(`/challenges/${challenge.slug}/results`);
    revalidatePath(`/challenges/${challenge.slug}/voting`);
  }
  revalidatePath("/admin/challenges");
  revalidatePath("/challenges");
}

async function checkJuryRateLimit(userId: string) {
  const rl = await checkRateLimit(`jury_action:${userId}`, {
    limit: 30,
    windowSeconds: 60,
    criticality: "fail_open",
  });
  if (!rl.success) {
    throw new Error("Terlalu banyak aksi juri dalam waktu singkat.");
  }
}

export async function addJuryAssignmentAction(params: {
  challengeId: string;
  targetUserId: string;
}) {
  const user = await requireModerator("/dashboard");
  await checkJuryRateLimit(user.id);

  const result = await db.transaction(async (tx) => {
    return await addJuryAssignmentService(
      tx,
      { userId: user.id, role: user.role },
      { challengeId: params.challengeId, userId: params.targetUserId }
    );
  });

  await revalidateChallengePaths(params.challengeId);
  return result;
}

export async function removeJuryAssignmentAction(params: {
  challengeId: string;
  targetUserId: string;
}) {
  const user = await requireModerator("/dashboard");
  await checkJuryRateLimit(user.id);

  const result = await db.transaction(async (tx) => {
    return await removeJuryAssignmentService(
      tx,
      { userId: user.id, role: user.role },
      { challengeId: params.challengeId, userId: params.targetUserId }
    );
  });

  await revalidateChallengePaths(params.challengeId);
  return result;
}

export async function assignJuryRecorderAction(params: {
  challengeId: string;
  userId: string;
}) {
  const user = await requireModerator("/dashboard");
  await checkJuryRateLimit(user.id);

  const result = await db.transaction(async (tx) => {
    return await assignJuryRecorderService(
      tx,
      { userId: user.id, role: user.role },
      params
    );
  });

  await revalidateChallengePaths(params.challengeId);
  return result;
}

export async function createJuryAwardAction(params: {
  challengeId: string;
  submissionId: string;
  categoryLabel?: string | null;
  confirmDuplicateSubmission?: boolean;
}) {
  const user = await requireAuth("/login");
  await checkJuryRateLimit(user.id);

  const result = await db.transaction(async (tx) => {
    return await createJuryAwardService(
      tx,
      { userId: user.id, role: user.role },
      params
    );
  });

  if (result.success) {
    await revalidateChallengePaths(params.challengeId);
  }
  return result;
}

export async function updateJuryAwardAction(params: {
  challengeId: string;
  awardId: string;
  submissionId?: string;
  categoryLabel?: string | null;
  confirmDuplicateSubmission?: boolean;
}) {
  const user = await requireAuth("/login");
  await checkJuryRateLimit(user.id);

  const result = await db.transaction(async (tx) => {
    return await updateJuryAwardService(
      tx,
      { userId: user.id, role: user.role },
      params
    );
  });

  if (result.success) {
    await revalidateChallengePaths(params.challengeId);
  }
  return result;
}

export async function deleteJuryAwardAction(params: {
  challengeId: string;
  awardId: string;
}) {
  const user = await requireAuth("/login");
  await checkJuryRateLimit(user.id);

  const result = await db.transaction(async (tx) => {
    return await deleteJuryAwardService(
      tx,
      { userId: user.id, role: user.role },
      { awardId: params.awardId }
    );
  });

  await revalidateChallengePaths(params.challengeId);
  return result;
}

export async function publishJuryResultsAction(params: {
  challengeId: string;
  publishCommunityOnly?: boolean;
}) {
  const user = await requireAuth("/login");
  await checkJuryRateLimit(user.id);

  const result = await db.transaction(async (tx) => {
    return await publishJuryChallengeResultsService(
      tx,
      { userId: user.id, role: user.role },
      params
    );
  });

  await revalidateChallengePaths(params.challengeId);
  return result;
}

export async function cancelJuryChallengeAction(params: {
  challengeId: string;
  reason: string;
}) {
  const user = await requireAuth("/login");
  await checkJuryRateLimit(user.id);

  const result = await db.transaction(async (tx) => {
    return await cancelJuryChallengeService(
      tx,
      { userId: user.id, role: user.role },
      params
    );
  });

  await revalidateChallengePaths(params.challengeId);
  return result;
}

export async function revokeChallengeResultsAction(params: {
  challengeId: string;
  reason: string;
}) {
  const user = await requireModerator("/dashboard");
  await checkJuryRateLimit(user.id);

  const result = await db.transaction(async (tx) => {
    return await revokeChallengeResultsService(
      tx,
      { userId: user.id, role: user.role },
      params.challengeId,
      params.reason
    );
  });

  await revalidateChallengePaths(params.challengeId);
  return result;
}

export async function correctCommunityWinnerAction(params: {
  challengeId: string;
  action: "replace" | "clear";
  replacementSubmissionId?: string;
  reason: string;
}) {
  const user = await requireModerator("/dashboard");
  await checkJuryRateLimit(user.id);

  const result = await db.transaction(async (tx) => {
    return await correctCommunityWinnerService(
      tx,
      { userId: user.id, role: user.role },
      params
    );
  });

  await revalidateChallengePaths(params.challengeId);
  return result;
}

export async function republishChallengeResultsAction(params: {
  challengeId: string;
  reason: string;
}) {
  const user = await requireModerator("/dashboard");
  await checkJuryRateLimit(user.id);

  const result = await db.transaction(async (tx) => {
    return await republishChallengeResultsService(
      tx,
      { userId: user.id, role: user.role },
      params.challengeId,
      params.reason
    );
  });

  await revalidateChallengePaths(params.challengeId);
  return result;
}

export async function cancelRevokedChallengeAction(params: {
  challengeId: string;
  reason: string;
}) {
  const user = await requireModerator("/dashboard");
  await checkJuryRateLimit(user.id);

  const result = await db.transaction(async (tx) => {
    return await cancelRevokedChallengeService(
      tx,
      { userId: user.id, role: user.role },
      params.challengeId,
      params.reason
    );
  });

  await revalidateChallengePaths(params.challengeId);
  return result;
}
