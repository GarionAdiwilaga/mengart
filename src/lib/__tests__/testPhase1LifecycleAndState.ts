import { db } from "@/db";
import {
  challenges,
  challengeWinnerSlots,
  challengeSubmissions,
  challengeVotingRounds,
  challengeVotingRoundCandidates,
  challengeBallots,
  challengeBallotStars,
  challengeResults,
  users,
  profiles,
} from "@/db/schema";
import { eq, and } from "drizzle-orm";
import {
  transitionChallengeStatusService,
  revokeChallengeResultsService,
  computeChallengeResultsService,
  publishChallengeResultsService,
  getLegalTransitionsForChallenge,
} from "@/lib/services/challengeService";
import { getEffectiveChallengeStatus } from "@/lib/challenges";

async function runPhase1LifecycleTests() {
  console.log("\n=================================================================");
  console.log("🔒 STARTING PHASE 1 (GATE A): LIFECYCLE & STATE MACHINE TEST SUITE");
  console.log("=================================================================\n");

  const suffix = Date.now().toString();

  // 1. Setup Admin, Member & Profiles
  console.log("[Test 1] Provisioning Test Principals...");
  const [admin] = await db
    .insert(users)
    .values({ email: `admin_p1_${suffix}@mengart.local`, role: "admin", membershipStatus: "active" })
    .returning();

  const [member] = await db
    .insert(users)
    .values({ email: `member_p1_${suffix}@mengart.local`, role: "member", membershipStatus: "active" })
    .returning();

  const [prof] = await db
    .insert(profiles)
    .values({ userId: member.id, displayName: "Member P1", slug: `member-p1-${suffix}` })
    .returning();

  const adminCtx = { userId: admin.id, role: "admin" };
  const memberCtx = { userId: member.id, role: "member" };
  console.log("✓ Test principals provisioned.");

  // 2. Mode-Aware State Machine Transitions
  console.log("\n[Test 2] Testing Mode-Aware State Machine Transitions...");
  
  // Jury-Only Mode: submission_locked -> jury_selection_open -> review -> finished
  const [juryChallenge] = await db
    .insert(challenges)
    .values({
      title: `Jury Mode Challenge ${suffix}`,
      slug: `jury-mode-${suffix}`,
      theme: "Jury Only",
      description: "Testing jury mode transitions",
      promptRules: "Rules",
      status: "draft",
      awardMode: "jury_only",
      createdByUserId: admin.id,
    })
    .returning();

  // Draft -> Scheduled -> Submission Open -> Submission Locked -> Jury Selection Open
  await transitionChallengeStatusService(db, adminCtx, juryChallenge.id, "scheduled");
  await transitionChallengeStatusService(db, adminCtx, juryChallenge.id, "submission_open");
  await transitionChallengeStatusService(db, adminCtx, juryChallenge.id, "submission_locked");
  
  // Valid transition for jury_only
  await transitionChallengeStatusService(db, adminCtx, juryChallenge.id, "jury_selection_open");
  console.log("✓ Jury-only mode transitioned submission_locked -> jury_selection_open successfully.");

  // Illegal transition attempt: voting_open in jury_only mode
  let illegalTransitionBlocked = false;
  try {
    await transitionChallengeStatusService(db, adminCtx, juryChallenge.id, "voting_open" as any);
  } catch (err: any) {
    illegalTransitionBlocked = true;
  }
  if (!illegalTransitionBlocked) {
    throw new Error("Illegal transition to voting_open in jury_only mode was not blocked!");
  }
  console.log("✓ Illegal transition attempt safely blocked by mode matrix.");

  // 3. Pause & Resume with Deadline Validation (QA-P1-007)
  console.log("\n[Test 3] Testing Pause & Resume with Deadline Validation (QA-P1-007)...");
  
  const pastDeadline = new Date(Date.now() - 3600 * 1000); // 1 hour ago
  const [activeChallenge] = await db
    .insert(challenges)
    .values({
      title: `Active Paused Challenge ${suffix}`,
      slug: `active-paused-${suffix}`,
      theme: "Pause Tests",
      description: "Testing deadline validation",
      promptRules: "Rules",
      status: "submission_open",
      submissionDeadline: pastDeadline,
      createdByUserId: admin.id,
    })
    .returning();

  // Pause the challenge
  await transitionChallengeStatusService(db, adminCtx, activeChallenge.id, "paused", {
    reason: "Maintenance pause",
  });

  const [pausedRow] = await db.select().from(challenges).where(eq(challenges.id, activeChallenge.id));
  if (pausedRow.status !== "paused" || pausedRow.pausedPreviousStatus !== "submission_open") {
    throw new Error("Pause failed to set status or pausedPreviousStatus!");
  }
  console.log("✓ Challenge successfully paused with preserved previous status.");

  // Attempt to resume with past deadline (Must Fail)
  let expiredResumeBlocked = false;
  try {
    await transitionChallengeStatusService(db, adminCtx, activeChallenge.id, "submission_open");
  } catch (err: any) {
    expiredResumeBlocked = true;
    console.log(`✓ Expired resume blocked: "${err.message}"`);
  }
  if (!expiredResumeBlocked) {
    throw new Error("Resuming challenge with expired deadline was not rejected!");
  }

  // Resume with updated future deadline (Must Succeed)
  const futureDeadline = new Date(Date.now() + 7 * 24 * 3600 * 1000);
  await transitionChallengeStatusService(db, adminCtx, activeChallenge.id, "submission_open", {
    submissionDeadline: futureDeadline,
  });

  const [resumedRow] = await db.select().from(challenges).where(eq(challenges.id, activeChallenge.id));
  if (resumedRow.status !== "submission_open" || resumedRow.pausedPreviousStatus !== null) {
    throw new Error("Resume with updated deadline failed!");
  }
  console.log("✓ Challenge resumed cleanly with validated extended deadline.");

  // 4. Two-Stage Finalization (compute -> review -> publish -> finished) (QA-P0-008)
  console.log("\n[Test 4] Testing Two-Stage Finalization (QA-P0-008)...");
  
  const [finChallenge] = await db
    .insert(challenges)
    .values({
      title: `Finalization Challenge ${suffix}`,
      slug: `fin-challenge-${suffix}`,
      theme: "Finalization",
      description: "Testing compute -> review -> finished",
      promptRules: "Rules",
      status: "voting_open",
      awardMode: "vote_only",
      starsPerMember: 3,
      createdByUserId: admin.id,
    })
    .returning();

  const [slotGold] = await db
    .insert(challengeWinnerSlots)
    .values({
      challengeId: finChallenge.id,
      slotType: "community_vote",
      rank: 1,
      title: "Juara 1 Komunitas",
      displayOrder: 1,
    })
    .returning();

  const [subA] = await db
    .insert(challengeSubmissions)
    .values({
      challengeId: finChallenge.id,
      userId: member.id,
      profileId: prof.id,
      submissionStatus: "submitted",
    })
    .returning();

  const [ballot] = await db
    .insert(challengeBallots)
    .values({
      challengeId: finChallenge.id,
      userId: admin.id,
      roundType: "main",
      starsAllocated: 3,
      isFinalized: true,
    })
    .returning();

  await db.insert(challengeBallotStars).values({
    ballotId: ballot.id,
    submissionId: subA.id,
    starsCount: 3,
  });

  // Step 1: Compute Results -> Status moves to REVIEW
  const computeRes = await computeChallengeResultsService(db, adminCtx, finChallenge.id);
  if (computeRes.outcome !== "review_ready") {
    throw new Error(`Expected review_ready, got ${computeRes.outcome}`);
  }

  const [reviewRow] = await db.select().from(challenges).where(eq(challenges.id, finChallenge.id));
  if (reviewRow.status !== "review") {
    throw new Error(`Challenge status should be "review", got "${reviewRow.status}"`);
  }

  const computedResults = await db
    .select()
    .from(challengeResults)
    .where(eq(challengeResults.challengeId, finChallenge.id));

  if (computedResults.length !== 1 || computedResults[0].isPublished !== false) {
    throw new Error("Computed results should exist and remain unpublished during review stage!");
  }
  console.log("✓ Stage 1 (Compute Results) completed: Challenge in 'review' status with unpublished results.");

  // Direct finalize from member must fail
  let unauthorizedPublishBlocked = false;
  try {
    await publishChallengeResultsService(db, memberCtx, finChallenge.id);
  } catch (err: any) {
    unauthorizedPublishBlocked = true;
  }
  if (!unauthorizedPublishBlocked) {
    throw new Error("Unauthorized publish by non-admin was not blocked!");
  }
  console.log("✓ Non-admin publication safely blocked.");

  // Step 2: Publish Results -> Status moves to FINISHED
  const pubRes = await publishChallengeResultsService(db, adminCtx, finChallenge.id);
  if (pubRes.outcome !== "published") {
    throw new Error(`Expected published, got ${pubRes.outcome}`);
  }

  const [finishedRow] = await db.select().from(challenges).where(eq(challenges.id, finChallenge.id));
  if (finishedRow.status !== "finished") {
    throw new Error(`Challenge status should be "finished", got "${finishedRow.status}"`);
  }

  const publishedResults = await db
    .select()
    .from(challengeResults)
    .where(eq(challengeResults.challengeId, finChallenge.id));

  if (publishedResults[0].isPublished !== true) {
    throw new Error("Results should now be marked isPublished = true!");
  }
  console.log("✓ Stage 2 (Publish Results) completed: Challenge in 'finished' status and results published.");

  // 5. Results Revocation (RESULTS_REVOKED) (QA-P1-008)
  console.log("\n[Test 5] Testing Results Revocation & Regovernance (QA-P1-008)...");
  
  await revokeChallengeResultsService(db, adminCtx, finChallenge.id, "Audit recalculation required");

  const [revokedRow] = await db.select().from(challenges).where(eq(challenges.id, finChallenge.id));
  if (revokedRow.status !== "results_revoked") {
    throw new Error(`Expected status results_revoked, got "${revokedRow.status}"`);
  }

  const revokedResults = await db
    .select()
    .from(challengeResults)
    .where(eq(challengeResults.challengeId, finChallenge.id));

  if (revokedResults[0].isPublished !== false) {
    throw new Error("Revoking results must set isPublished = false!");
  }
  console.log("✓ Results revocation verified: Status is 'results_revoked' and results visibility suppressed.");

  // Can transition from results_revoked -> review
  await transitionChallengeStatusService(db, adminCtx, finChallenge.id, "review");
  const [reReviewRow] = await db.select().from(challenges).where(eq(challenges.id, finChallenge.id));
  if (reReviewRow.status !== "review") {
    throw new Error("Failed to transition from results_revoked to review!");
  }
  console.log("✓ Transition from 'results_revoked' -> 'review' verified.");

  // 6. Authority of Persisted State (QA-P0-006)
  console.log("\n[Test 6] Testing Persisted State Authority (QA-P0-006)...");
  const effectiveStatus = getEffectiveChallengeStatus(reReviewRow);
  if (effectiveStatus !== "review") {
    throw new Error(`getEffectiveChallengeStatus returned "${effectiveStatus}" instead of persisted "review"!`);
  }
  console.log("✓ getEffectiveChallengeStatus correctly returns persisted database state.");

  console.log("\n=================================================================");
  console.log("🎉 ALL PHASE 1 (GATE A) TESTS PASSED SUCCESSFULLY!");
  console.log("=================================================================\n");
}

runPhase1LifecycleTests().catch((err) => {
  console.error("❌ Phase 1 tests failed:", err);
  process.exit(1);
});
