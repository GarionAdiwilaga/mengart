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
  auditLogs,
  users,
  profiles,
} from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";
import {
  transitionChallengeStatusService,
  revokeChallengeResultsService,
  computeChallengeResultsService,
  publishChallengeResultsService,
  materializeScheduledTransitionsService,
} from "@/lib/services/challengeService";
import { finalizeVotingRoundService } from "@/lib/services/votingService";
import { getEffectiveChallengeStatus } from "@/lib/challenges";
import { getChallengeResultsData, getModeratorReviewResultsData } from "@/lib/voting";

async function runPhase1LifecycleTests() {
  console.log("\n=================================================================");
  console.log("🔒 STARTING PHASE 1 (GATE A): ENHANCED LIFECYCLE & STATE TEST SUITE");
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

  // Draft -> Scheduled -> Submission Open
  await transitionChallengeStatusService(db, adminCtx, juryChallenge.id, "scheduled");
  await transitionChallengeStatusService(db, adminCtx, juryChallenge.id, "submission_open");
  
  // Generic transition to submission_locked must be rejected per Blueprint 2.2.1
  let manualLockRejected = false;
  try {
    await transitionChallengeStatusService(db, adminCtx, juryChallenge.id, "submission_locked");
  } catch (err: any) {
    manualLockRejected = true;
  }
  if (!manualLockRejected) {
    throw new Error("Direct generic transition to submission_locked was unexpectedly allowed!");
  }
  console.log("✓ Manual generic transition to submission_locked safely rejected.");

  // Insert 2 submissions and let scheduler lock submissions and transition jury_only to jury_selection_open
  await db.insert(challengeSubmissions).values([
    { challengeId: juryChallenge.id, userId: member.id, profileId: prof.id, submissionStatus: "submitted" },
    { challengeId: juryChallenge.id, userId: admin.id, profileId: prof.id, submissionStatus: "submitted" },
  ]);

  await db
    .update(challenges)
    .set({ submissionDeadline: new Date(Date.now() - 60000) })
    .where(eq(challenges.id, juryChallenge.id));

  await materializeScheduledTransitionsService(db, new Date());

  const [juryRow] = await db.select().from(challenges).where(eq(challenges.id, juryChallenge.id));
  if (juryRow.status !== "jury_selection_open") {
    throw new Error(`Expected jury_selection_open from scheduler, got "${juryRow.status}"`);
  }
  console.log("✓ Jury-only mode transitioned submission_open -> submission_locked -> jury_selection_open via scheduler.");

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

  // 3. Inert PAUSED Behavior Verification (Blueprint 2.2.1)
  console.log("\n[Test 3] Testing Inert PAUSED Transition Rejection (Blueprint 2.2.1)...");
  
  const [activeChallenge] = await db
    .insert(challenges)
    .values({
      title: `Active Challenge ${suffix}`,
      slug: `active-ch-${suffix}`,
      theme: "Pause Inactive Tests",
      description: "Testing paused status rejection",
      promptRules: "Rules",
      status: "submission_open",
      submissionDeadline: new Date(Date.now() + 3600 * 1000),
      createdByUserId: admin.id,
    })
    .returning();

  // Attempting to pause the challenge must fail under Blueprint 2.2.1
  let pauseAttemptBlocked = false;
  try {
    await transitionChallengeStatusService(db, adminCtx, activeChallenge.id, "paused" as any, {
      reason: "Maintenance pause",
    });
  } catch (err: any) {
    if (err.message.includes("telah dinonaktifkan")) {
      pauseAttemptBlocked = true;
    }
  }

  if (!pauseAttemptBlocked) {
    throw new Error("Transition to 'paused' was not safely rejected!");
  }
  console.log("✓ Transition to 'paused' safely blocked per Blueprint 2.2.1.");

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

  const [finRound] = await db
    .insert(challengeVotingRounds)
    .values({
      challengeId: finChallenge.id,
      roundType: "main",
      roundSequence: 1,
      status: "open",
      startsAt: new Date(Date.now() - 3600000),
      deadline: new Date(Date.now() - 1000),
      starsPerMember: 3,
    })
    .returning();

  await db.insert(challengeVotingRoundCandidates).values([
    { votingRoundId: finRound.id, submissionId: subA.id },
  ]);

  const [ballot] = await db
    .insert(challengeBallots)
    .values({
      challengeId: finChallenge.id,
      votingRoundId: finRound.id,
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

  // Finalize Voting Round -> Unique winner transitions directly to FINISHED (Blueprint 2.2.1)
  const finalizeRes = await finalizeVotingRoundService(db, adminCtx, { votingRoundId: finRound.id });
  if (finalizeRes.outcome !== "winner_resolved") {
    throw new Error(`Expected winner_resolved, got ${finalizeRes.outcome}`);
  }

  const [finishedRow] = await db.select().from(challenges).where(eq(challenges.id, finChallenge.id));
  if (finishedRow.status !== "finished") {
    throw new Error(`Challenge status should be "finished", got "${finishedRow.status}"`);
  }

  const publishedResults = await db
    .select()
    .from(challengeResults)
    .where(eq(challengeResults.challengeId, finChallenge.id));

  if (publishedResults.length !== 1 || publishedResults[0].awardType !== "community_vote_winner" || publishedResults[0].isPublished !== true) {
    throw new Error("Community winner result should exist, have awardType community_vote_winner, and be isPublished = true!");
  }
  console.log("✓ Vote-only challenge finalized directly to 'finished' with canonical community_vote_winner.");

  // Direct finalize/publish from non-admin/moderator must fail
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

  // 5. Results Revocation & Snapshot Preservation (QA-P1-008)
  console.log("\n[Test 5] Testing Results Revocation & Snapshot Preservation (QA-P1-008)...");
  
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

  // Verify transition from results_revoked to review and re-publish
  await transitionChallengeStatusService(db, adminCtx, finChallenge.id, "review");
  const [reviewAgain] = await db.select().from(challenges).where(eq(challenges.id, finChallenge.id));
  if (reviewAgain.status !== "review") {
    throw new Error(`Expected status review, got "${reviewAgain.status}"`);
  }

  const republishRes = await publishChallengeResultsService(db, adminCtx, finChallenge.id);
  if (republishRes.outcome !== "published") {
    throw new Error(`Expected published, got ${republishRes.outcome}`);
  }
  const [republishedRow] = await db.select().from(challenges).where(eq(challenges.id, finChallenge.id));
  if (republishedRow.status !== "finished") {
    throw new Error(`Expected status finished, got "${republishedRow.status}"`);
  }

  // Verify Snapshot in Audit Log
  const [revokeAudit] = await db
    .select()
    .from(auditLogs)
    .where(
      and(
        eq(auditLogs.targetId, finChallenge.id),
        eq(auditLogs.action, "challenge.revoke_results")
      )
    )
    .orderBy(desc(auditLogs.createdAt))
    .limit(1);

  if (!revokeAudit || !revokeAudit.metadata || !(revokeAudit.metadata as any).previousResultsSnapshot) {
    throw new Error("Revoke results did not persist historical results snapshot in audit logs!");
  }
  console.log("✓ Results revocation verified: Status is 'results_revoked', results unpublished, and historical snapshot stored in audit logs.");

  // 6. Protected Transitions Bypasses Blocked (finished, results_revoked, and review for result modes)
  console.log("\n[Test 6] Testing Protected Lifecycle Transitions Cannot Be Bypassed...");
  
  let finishedBypassBlocked = false;
  try {
    await transitionChallengeStatusService(db, adminCtx, finChallenge.id, "finished");
  } catch (err: any) {
    finishedBypassBlocked = true;
  }
  if (!finishedBypassBlocked) {
    throw new Error("Direct generic transition to 'finished' was not blocked!");
  }

  let revokedBypassBlocked = false;
  try {
    await transitionChallengeStatusService(db, adminCtx, finChallenge.id, "results_revoked");
  } catch (err: any) {
    revokedBypassBlocked = true;
  }
  if (!revokedBypassBlocked) {
    throw new Error("Direct generic transition to 'results_revoked' was not blocked!");
  }

  // Direct generic transition to 'review' must be blocked for voting_open vote_only challenge
  const [votingCh] = await db
    .insert(challenges)
    .values({
      title: `Direct Review Block Test ${suffix}`,
      slug: `direct-rev-block-${suffix}`,
      theme: "Rules",
      description: "Testing review block",
      promptRules: "Rules",
      status: "voting_open",
      awardMode: "vote_only",
      createdByUserId: admin.id,
    })
    .returning();

  let reviewBypassBlocked = false;
  try {
    await transitionChallengeStatusService(db, adminCtx, votingCh.id, "review");
  } catch (err: any) {
    reviewBypassBlocked = true;
    console.log(`✓ Direct transition to review blocked for result-producing mode: "${err.message}"`);
  }
  if (!reviewBypassBlocked) {
    throw new Error("Direct generic transition to 'review' for vote_only challenge was not blocked!");
  }

  // Showcase-only challenge can transition submission_locked -> review directly
  const [showcaseCh] = await db
    .insert(challenges)
    .values({
      title: `Showcase Review Test ${suffix}`,
      slug: `showcase-rev-${suffix}`,
      theme: "Art",
      description: "Testing showcase direct review",
      promptRules: "Rules",
      status: "submission_locked",
      awardMode: "showcase_only",
      createdByUserId: admin.id,
    })
    .returning();

  await transitionChallengeStatusService(db, adminCtx, showcaseCh.id, "review");
  const [showcaseRow] = await db.select().from(challenges).where(eq(challenges.id, showcaseCh.id));
  if (showcaseRow.status !== "review") {
    throw new Error("Showcase-only challenge failed to transition submission_locked -> review!");
  }
  console.log("✓ Direct transition to 'review' allowed for showcase_only mode.");
  console.log("✓ Protected transition bypasses ('finished', 'results_revoked', and 'review') safely blocked.");

  // 7. Compute Blocked on FINISHED Challenge (Must Revoke First)
  console.log("\n[Test 7] Testing Compute Results Blocked on FINISHED Challenge...");
  
  // finChallenge is in 'finished' status from Test 5 republish
  let finishedComputeBlocked = false;
  try {
    await computeChallengeResultsService(db, adminCtx, finChallenge.id);
  } catch (err: any) {
    finishedComputeBlocked = true;
    console.log(`✓ Direct compute on finished challenge blocked: "${err.message}"`);
  }
  if (!finishedComputeBlocked) {
    throw new Error("Direct compute on finished challenge was not blocked!");
  }

  // 8. Public vs Moderator Result Retrieval Separation
  console.log("\n[Test 8] Testing Public vs Moderator Results Retrieval Separation...");
  
  // Revoke challenge again
  await revokeChallengeResultsService(db, adminCtx, finChallenge.id, "Second audit pass");

  // Public Query must return 0 results for revoked challenge
  const publicRevokedResults = await getChallengeResultsData(finChallenge.id);
  if (!publicRevokedResults || publicRevokedResults.results.length !== 0 || publicRevokedResults.isPublished !== false) {
    throw new Error(`Public query on revoked challenge should return 0 results! Got: ${publicRevokedResults?.results.length}`);
  }

  // Moderator Review Query returns full results
  const modRevokedResults = await getModeratorReviewResultsData(finChallenge.id);
  if (!modRevokedResults || modRevokedResults.results.length !== 1) {
    throw new Error(`Moderator review query should return computed results! Got: ${modRevokedResults?.results.length}`);
  }
  console.log("✓ Results retrieval separation verified: Public sees 0 results on revoked challenge; moderator sees unpublished review results.");

  // 9. Idempotent & Concurrent Scheduled Transition Materializer
  console.log("\n[Test 9] Testing Concurrency-Idempotent Scheduled Transition Materializer...");
  
  const [scheduledCh] = await db
    .insert(challenges)
    .values({
      title: `Scheduled Materializer Test ${suffix}`,
      slug: `sched-mat-${suffix}`,
      theme: "Automation",
      description: "Testing scheduler",
      promptRules: "Rules",
      status: "scheduled",
      submissionStartsAt: new Date(Date.now() - 60 * 1000), // 1 min ago
      submissionDeadline: new Date(Date.now() + 86400 * 1000),
      createdByUserId: admin.id,
    })
    .returning();

  // Execute 2 concurrent materializer runs simultaneously
  const [run1, run2] = await Promise.all([
    materializeScheduledTransitionsService(db, new Date()),
    materializeScheduledTransitionsService(db, new Date()),
  ]);

  const totalTransitioned = run1.transitions.filter((t) => t.challengeId === scheduledCh.id).length +
                           run2.transitions.filter((t) => t.challengeId === scheduledCh.id).length;

  if (totalTransitioned !== 1) {
    throw new Error(`Concurrency violation! Expected exactly 1 transition across concurrent runs, got ${totalTransitioned}`);
  }

  // Verify only 1 audit log created
  const schedulerAudits = await db
    .select()
    .from(auditLogs)
    .where(
      and(
        eq(auditLogs.targetId, scheduledCh.id),
        eq(auditLogs.action, "scheduler.challenge_submission_opened")
      )
    );

  if (schedulerAudits.length !== 1) {
    throw new Error(`Expected exactly 1 audit log entry for scheduled transition, found ${schedulerAudits.length}`);
  }

  const [matRow] = await db.select().from(challenges).where(eq(challenges.id, scheduledCh.id));
  if (matRow.status !== "submission_open") {
    throw new Error(`Expected materialized status 'submission_open', got '${matRow.status}'`);
  }
  console.log("✓ Scheduler materializer concurrency idempotency verified: 2 simultaneous runs executed cleanly with exactly 1 state mutation and 1 audit log.");

  // 10. Persisted State Authority
  console.log("\n[Test 10] Testing Persisted State Authority...");
  const effStatus = getEffectiveChallengeStatus(matRow);
  if (effStatus !== "submission_open") {
    throw new Error(`getEffectiveChallengeStatus returned "${effStatus}" instead of "submission_open"!`);
  }
  console.log("✓ Persisted state authority strictly confirmed.");

  // 11. Cron API Route Fail-Closed Auth Test
  console.log("\n[Test 11] Testing /api/cron/materialize-challenges Fail-Closed Route...");
  const { GET: cronHandler } = await import("@/app/api/cron/materialize-challenges/route");

  const originalSecret = process.env.CRON_SECRET;

  // 11a. Unset CRON_SECRET -> 503
  delete process.env.CRON_SECRET;
  const unconfiguredReq = new Request("http://localhost:3000/api/cron/materialize-challenges");
  const unconfiguredRes = await cronHandler(unconfiguredReq);
  if (unconfiguredRes.status !== 503) {
    throw new Error(`Expected 503 when CRON_SECRET is unconfigured, got ${unconfiguredRes.status}`);
  }

  // 11b. Configured but wrong secret -> 401
  process.env.CRON_SECRET = "test_super_secret_123";
  const unauthorizedReq = new Request("http://localhost:3000/api/cron/materialize-challenges", {
    headers: { Authorization: "Bearer wrong_secret" },
  });
  const unauthorizedRes = await cronHandler(unauthorizedReq);
  if (unauthorizedRes.status !== 401) {
    throw new Error(`Expected 401 for invalid secret, got ${unauthorizedRes.status}`);
  }

  // 11c. Configured with valid secret -> 200
  const authorizedReq = new Request("http://localhost:3000/api/cron/materialize-challenges", {
    headers: { Authorization: "Bearer test_super_secret_123" },
  });
  const authorizedRes = await cronHandler(authorizedReq);
  if (authorizedRes.status !== 200) {
    throw new Error(`Expected 200 for valid secret, got ${authorizedRes.status}`);
  }
  const cronData = await authorizedRes.json();
  if (!cronData.ok) {
    throw new Error(`Expected ok=true from cron endpoint, got: ${JSON.stringify(cronData)}`);
  }

  // Restore env
  process.env.CRON_SECRET = originalSecret;
  console.log("✓ /api/cron/materialize-challenges fail-closed verified: 503 when missing secret, 401 on mismatch, 200 on authorized invocation.");

  console.log("\n=================================================================");
  console.log("🎉 ALL ENHANCED PHASE 1 (GATE A) TESTS PASSED CLEANLY!");
  console.log("=================================================================\n");
  process.exit(0);
}

runPhase1LifecycleTests().catch((err) => {
  console.error("❌ Phase 1 tests failed:", err);
  process.exit(1);
});
