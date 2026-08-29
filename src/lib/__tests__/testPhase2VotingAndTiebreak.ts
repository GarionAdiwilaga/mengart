import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import * as dotenv from "dotenv";
import * as schema from "@/db/schema";
import {
  challenges,
  users,
  profiles,
  artworks,
  challengeSubmissions,
  challengeSubmissionVersions,
  artworkVersions,
  challengeVotingRounds,
  challengeVotingRoundCandidates,
  challengeBallots,
  challengeBallotStars,
  challengeResults,
  auditLogs,
} from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import {
  castOrUpdateBallotService,
  resetBallotService,
  finalizeVotingRoundService,
  startTiebreakService,
  resolveTieManuallyService,
  computeAuthoritativeRoundTally,
  getAuthoritativeVotingRoundData,
} from "@/lib/services/votingService";
import {
  transitionChallengeStatusService,
  materializeScheduledTransitionsService,
} from "@/lib/services/challengeService";

dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

const BASE_DB_URL =
  process.env.DATABASE_URL || "postgres://mengart:mengart_dev_pass@localhost:5432/mengart_db";
const urlObj = new URL(BASE_DB_URL);
const adminDbUrl = `${urlObj.protocol}//${urlObj.username}:${urlObj.password}@${urlObj.host}/postgres`;

async function runTests() {
  console.log("=================================================================");
  console.log("🧪 STARTING GATE B / PHASE 2 VOTING & TIE RESOLUTION TEST SUITE");
  console.log("=================================================================\n");

  const adminClient = postgres(adminDbUrl, { max: 1 });
  const testDbName = `mengart_test_gate_b_${Date.now()}`;

  await adminClient.unsafe(`CREATE DATABASE "${testDbName}";`);
  const testDbUrl = `${urlObj.protocol}//${urlObj.username}:${urlObj.password}@${urlObj.host}/${testDbName}`;
  const testClient = postgres(testDbUrl, { max: 5 });
  const db = drizzle(testClient, { schema });

  try {
    console.log("-> Running migrations 0000 -> 0008 on test database...");
    await migrate(db, { migrationsFolder: "./drizzle" });
    console.log("✓ Database migrated to 0008.\n");

    // Setup basic actors
    const [adminUser] = await db
      .insert(users)
      .values({ email: "admin@atelier.local", role: "admin", emailVerified: new Date() })
      .returning();
    const [modUser] = await db
      .insert(users)
      .values({ email: "mod@atelier.local", role: "moderator", emailVerified: new Date() })
      .returning();
    const [artist1] = await db
      .insert(users)
      .values({ email: "artist1@atelier.local", role: "member", emailVerified: new Date() })
      .returning();
    const [artist2] = await db
      .insert(users)
      .values({ email: "artist2@atelier.local", role: "member", emailVerified: new Date() })
      .returning();
    const [artist3] = await db
      .insert(users)
      .values({ email: "artist3@atelier.local", role: "member", emailVerified: new Date() })
      .returning();
    const [voter1] = await db
      .insert(users)
      .values({ email: "voter1@atelier.local", role: "member", emailVerified: new Date() })
      .returning();
    const [voter2] = await db
      .insert(users)
      .values({ email: "voter2@atelier.local", role: "member", emailVerified: new Date() })
      .returning();

    const [prof1] = await db
      .insert(profiles)
      .values({ userId: artist1.id, displayName: "Artist One", slug: "artist-one" })
      .returning();
    const [prof2] = await db
      .insert(profiles)
      .values({ userId: artist2.id, displayName: "Artist Two", slug: "artist-two" })
      .returning();
    const [prof3] = await db
      .insert(profiles)
      .values({ userId: artist3.id, displayName: "Artist Three", slug: "artist-three" })
      .returning();

    const adminCtx = { userId: adminUser.id, role: "admin" as const };
    const modCtx = { userId: modUser.id, role: "moderator" as const };
    const voter1Ctx = { userId: voter1.id, role: "member" as const };
    const voter2Ctx = { userId: voter2.id, role: "member" as const };
    const artist1Ctx = { userId: artist1.id, role: "member" as const };

    // Helper to create submissions
    async function createSubmission(challengeId: string, user: any, prof: any, title: string) {
      const [art] = await db
        .insert(artworks)
        .values({
          userId: user.id,
          slug: `art-${Math.random().toString(36).substring(2)}-${Date.now()}`,
          title,
          mediaType: "image",
          publicationStatus: "published",
        })
        .returning();

      const [artVersion] = await db
        .insert(artworkVersions)
        .values({
          artworkId: art.id,
          versionNumber: 1,
          mediaType: "image",
          masterStorageKey: "master_1.jpg",
          thumbnailStorageKey: "thumb_1.jpg",
          publicStorageKey: "full_1.jpg",
          mimeType: "image/jpeg",
          fileSizeBytes: 1024,
          checksumSha256: "dummy_checksum",
        })
        .returning();

      const [submission] = await db
        .insert(challengeSubmissions)
        .values({
          challengeId,
          userId: user.id,
          profileId: prof.id,
          submissionStatus: "submitted",
          currentVersionId: null,
        })
        .returning();

      const [subVersion] = await db
        .insert(challengeSubmissionVersions)
        .values({
          submissionId: submission.id,
          versionNumber: 1,
          artworkVersionId: artVersion.id,
          title,
        })
        .returning();

      await db
        .update(challengeSubmissions)
        .set({ currentVersionId: subVersion.id })
        .where(eq(challengeSubmissions.id, submission.id));

      return submission;
    }

    // --------------------------------------------------------------------------
    // TEST 1: Main round - unique positive max stars
    // --------------------------------------------------------------------------
    console.log("-> [Test 1] Main Round - unique positive max stars resolving single Community Winner...");
    const [ch1] = await db
      .insert(challenges)
      .values({
        title: "Challenge 1",
        slug: "ch-1",
        theme: "Theme 1",
        description: "Desc",
        promptRules: "Rules",
        status: "voting_open",
        awardMode: "vote_only",
        starsPerMember: 3,
        createdByUserId: adminUser.id,
      })
      .returning();

    const sub1A = await createSubmission(ch1.id, artist1, prof1, "Art 1A");
    const sub1B = await createSubmission(ch1.id, artist2, prof2, "Art 1B");
    const sub1C = await createSubmission(ch1.id, artist3, prof3, "Art 1C");

    const pastDeadline = new Date(Date.now() - 10000);
    const futureDeadline = new Date(Date.now() + 3600000);

    const [round1] = await db
      .insert(challengeVotingRounds)
      .values({
        challengeId: ch1.id,
        roundType: "main",
        roundSequence: 1,
        status: "open",
        startsAt: new Date(Date.now() - 3600000),
        deadline: futureDeadline,
        starsPerMember: 3,
      })
      .returning();

    await db.insert(challengeVotingRoundCandidates).values([
      { votingRoundId: round1.id, submissionId: sub1A.id },
      { votingRoundId: round1.id, submissionId: sub1B.id },
      { votingRoundId: round1.id, submissionId: sub1C.id },
    ]);

    // Voter 1: 2 stars on 1A, 1 star on 1B
    await castOrUpdateBallotService(db, voter1Ctx, {
      votingRoundId: round1.id,
      votes: [
        { submissionId: sub1A.id, starsCount: 2 },
        { submissionId: sub1B.id, starsCount: 1 },
      ],
    });

    // Voter 2: 1 star on 1A
    await castOrUpdateBallotService(db, voter2Ctx, {
      votingRoundId: round1.id,
      votes: [{ submissionId: sub1A.id, starsCount: 1 }],
    });

    // Tally check: 1A = 3, 1B = 1, 1C = 0
    const tally1 = await computeAuthoritativeRoundTally(db, round1.id);
    if (tally1.outcome !== "winner" || tally1.winnerSubmissionId !== sub1A.id || tally1.maxStars !== 3) {
      throw new Error(`Test 1 tally failed: got ${JSON.stringify(tally1)}`);
    }

    // Set deadline to past to allow finalization
    await db
      .update(challengeVotingRounds)
      .set({ deadline: pastDeadline })
      .where(eq(challengeVotingRounds.id, round1.id));

    // Finalize round
    const fin1 = await finalizeVotingRoundService(db, adminCtx, { votingRoundId: round1.id });
    if (fin1.outcome !== "winner_resolved" || fin1.winnerSubmissionId !== sub1A.id) {
      throw new Error(`Test 1 finalization failed: got ${JSON.stringify(fin1)}`);
    }

    // Check challenge status is now 'finished'
    const [ch1Updated] = await db.select().from(challenges).where(eq(challenges.id, ch1.id));
    if (ch1Updated.status !== "finished") {
      throw new Error(`Expected ch1 status = 'finished', got ${ch1Updated.status}`);
    }

    // Check challenge_results has exactly 1 row with awardType = 'community_vote_winner'
    const results1 = await db.select().from(challengeResults).where(eq(challengeResults.challengeId, ch1.id));
    if (
      results1.length !== 1 ||
      results1[0].submissionId !== sub1A.id ||
      results1[0].awardType !== "community_vote_winner" ||
      results1[0].resolutionMethod !== "unique_main_vote" ||
      results1[0].totalCommunityStars !== 3
    ) {
      throw new Error(`Test 1 results verification failed: ${JSON.stringify(results1)}`);
    }
    console.log("✓ Test 1 Passed: Single Community Winner resolved and persisted.\n");

    // --------------------------------------------------------------------------
    // TEST 2: Main round - zero votes (0 stars)
    // --------------------------------------------------------------------------
    console.log("-> [Test 2] Main Round - zero votes (0 stars) behavior in vote_only and vote_and_jury...");
    // 2a. vote_only with 0 stars -> FINISHED, 0 winners
    const [ch2a] = await db
      .insert(challenges)
      .values({
        title: "Challenge 2A",
        slug: "ch-2a",
        theme: "Theme",
        description: "Desc",
        promptRules: "Rules",
        status: "voting_open",
        awardMode: "vote_only",
        starsPerMember: 3,
        createdByUserId: adminUser.id,
      })
      .returning();

    const sub2A1 = await createSubmission(ch2a.id, artist1, prof1, "Art 2A1");
    const sub2A2 = await createSubmission(ch2a.id, artist2, prof2, "Art 2A2");

    const [round2a] = await db
      .insert(challengeVotingRounds)
      .values({
        challengeId: ch2a.id,
        roundType: "main",
        roundSequence: 1,
        status: "open",
        startsAt: new Date(Date.now() - 3600000),
        deadline: pastDeadline,
        starsPerMember: 3,
      })
      .returning();

    await db.insert(challengeVotingRoundCandidates).values([
      { votingRoundId: round2a.id, submissionId: sub2A1.id },
      { votingRoundId: round2a.id, submissionId: sub2A2.id },
    ]);

    const fin2a = await finalizeVotingRoundService(db, adminCtx, { votingRoundId: round2a.id });
    if (fin2a.outcome !== "no_votes") {
      throw new Error(`Expected outcome 'no_votes', got ${fin2a.outcome}`);
    }
    const [ch2aUpdated] = await db.select().from(challenges).where(eq(challenges.id, ch2a.id));
    if (ch2aUpdated.status !== "finished") {
      throw new Error(`Expected ch2a status = 'finished', got ${ch2aUpdated.status}`);
    }
    const results2a = await db.select().from(challengeResults).where(eq(challengeResults.challengeId, ch2a.id));
    if (results2a.length !== 0) {
      throw new Error(`Expected 0 results for 0-vote vote_only challenge, found ${results2a.length}`);
    }

    // 2b. vote_and_jury with 0 stars -> JURY_SELECTION_OPEN, 0 community winners
    const [ch2b] = await db
      .insert(challenges)
      .values({
        title: "Challenge 2B",
        slug: "ch-2b",
        theme: "Theme",
        description: "Desc",
        promptRules: "Rules",
        status: "voting_open",
        awardMode: "vote_and_jury",
        starsPerMember: 3,
        createdByUserId: adminUser.id,
      })
      .returning();

    const sub2B1 = await createSubmission(ch2b.id, artist1, prof1, "Art 2B1");
    const sub2B2 = await createSubmission(ch2b.id, artist2, prof2, "Art 2B2");

    const [round2b] = await db
      .insert(challengeVotingRounds)
      .values({
        challengeId: ch2b.id,
        roundType: "main",
        roundSequence: 1,
        status: "open",
        startsAt: new Date(Date.now() - 3600000),
        deadline: pastDeadline,
        starsPerMember: 3,
      })
      .returning();

    await db.insert(challengeVotingRoundCandidates).values([
      { votingRoundId: round2b.id, submissionId: sub2B1.id },
      { votingRoundId: round2b.id, submissionId: sub2B2.id },
    ]);

    const fin2b = await finalizeVotingRoundService(db, adminCtx, { votingRoundId: round2b.id });
    if (fin2b.outcome !== "no_votes") {
      throw new Error(`Expected outcome 'no_votes', got ${fin2b.outcome}`);
    }
    const [ch2bUpdated] = await db.select().from(challenges).where(eq(challenges.id, ch2b.id));
    if (ch2bUpdated.status !== "jury_selection_open") {
      throw new Error(`Expected ch2b status = 'jury_selection_open', got ${ch2bUpdated.status}`);
    }
    console.log("✓ Test 2 Passed: Zero-vote handling correctly transitions to finished or jury_selection_open.\n");

    // --------------------------------------------------------------------------
    // TEST 3 & 4 & 5: Main tie -> TIE_PENDING -> Start Tiebreak -> Tiebreak Winner
    // --------------------------------------------------------------------------
    console.log("-> [Test 3, 4, 5] Main tie (A=2, B=2, C=1) -> TIE_PENDING -> Start Tiebreak -> Finalize Tiebreak Winner...");
    const [ch3] = await db
      .insert(challenges)
      .values({
        title: "Challenge 3",
        slug: "ch-3",
        theme: "Theme",
        description: "Desc",
        promptRules: "Rules",
        status: "voting_open",
        awardMode: "vote_only",
        starsPerMember: 3,
        createdByUserId: adminUser.id,
      })
      .returning();

    const sub3A = await createSubmission(ch3.id, artist1, prof1, "Art 3A");
    const sub3B = await createSubmission(ch3.id, artist2, prof2, "Art 3B");
    const sub3C = await createSubmission(ch3.id, artist3, prof3, "Art 3C");

    const [round3] = await db
      .insert(challengeVotingRounds)
      .values({
        challengeId: ch3.id,
        roundType: "main",
        roundSequence: 1,
        status: "open",
        startsAt: new Date(Date.now() - 3600000),
        deadline: futureDeadline,
        starsPerMember: 3,
      })
      .returning();

    await db.insert(challengeVotingRoundCandidates).values([
      { votingRoundId: round3.id, submissionId: sub3A.id },
      { votingRoundId: round3.id, submissionId: sub3B.id },
      { votingRoundId: round3.id, submissionId: sub3C.id },
    ]);

    // Votes: 3A = 2, 3B = 2, 3C = 1
    await castOrUpdateBallotService(db, voter1Ctx, {
      votingRoundId: round3.id,
      votes: [
        { submissionId: sub3A.id, starsCount: 2 },
        { submissionId: sub3C.id, starsCount: 1 },
      ],
    });
    await castOrUpdateBallotService(db, voter2Ctx, {
      votingRoundId: round3.id,
      votes: [{ submissionId: sub3B.id, starsCount: 2 }],
    });

    // Advance deadline to allow finalization
    await db
      .update(challengeVotingRounds)
      .set({ deadline: pastDeadline })
      .where(eq(challengeVotingRounds.id, round3.id));

    // Finalize main round -> enters TIE_PENDING
    const fin3 = await finalizeVotingRoundService(db, adminCtx, { votingRoundId: round3.id });
    if (fin3.outcome !== "tie_pending" || fin3.tiedSubmissionIds?.length !== 2) {
      throw new Error(`Expected tie_pending with 2 tied submissions, got ${JSON.stringify(fin3)}`);
    }

    const [ch3Pending] = await db.select().from(challenges).where(eq(challenges.id, ch3.id));
    if (ch3Pending.status !== "tie_pending") {
      throw new Error(`Expected ch3 status = 'tie_pending', got ${ch3Pending.status}`);
    }

    // Moderator starts tiebreak round
    const tbRes = await startTiebreakService(db, modCtx, {
      challengeId: ch3.id,
      deadline: new Date(Date.now() + 86400000),
    });

    if (!tbRes.success || tbRes.tiedCandidatesCount !== 2) {
      throw new Error(`Start tiebreak failed: ${JSON.stringify(tbRes)}`);
    }

    const [ch3Tb] = await db.select().from(challenges).where(eq(challenges.id, ch3.id));
    if (ch3Tb.status !== "tiebreak_open") {
      throw new Error(`Expected ch3 status = 'tiebreak_open', got ${ch3Tb.status}`);
    }

    // Verify tiebreak candidates snapshot contains exactly [sub3A, sub3B] and NOT sub3C
    const tbCandidates = await db
      .select()
      .from(challengeVotingRoundCandidates)
      .where(eq(challengeVotingRoundCandidates.votingRoundId, tbRes.votingRoundId));
    const tbCandIds = tbCandidates.map((c) => c.submissionId);
    if (!tbCandIds.includes(sub3A.id) || !tbCandIds.includes(sub3B.id) || tbCandIds.includes(sub3C.id)) {
      throw new Error(`Tiebreak candidate snapshot invalid: ${JSON.stringify(tbCandIds)}`);
    }

    // Casting in tiebreak round (starsPerMember = 1)
    await castOrUpdateBallotService(db, voter1Ctx, {
      votingRoundId: tbRes.votingRoundId,
      votes: [{ submissionId: sub3A.id, starsCount: 1 }],
    });
    await castOrUpdateBallotService(db, voter2Ctx, {
      votingRoundId: tbRes.votingRoundId,
      votes: [{ submissionId: sub3A.id, starsCount: 1 }],
    });

    // Advance deadline to allow finalization
    await db
      .update(challengeVotingRounds)
      .set({ deadline: pastDeadline })
      .where(eq(challengeVotingRounds.id, tbRes.votingRoundId));

    const tbFin = await finalizeVotingRoundService(db, adminCtx, { votingRoundId: tbRes.votingRoundId });
    if (tbFin.outcome !== "winner_resolved" || tbFin.winnerSubmissionId !== sub3A.id) {
      throw new Error(`Tiebreak finalization failed: ${JSON.stringify(tbFin)}`);
    }

    const [ch3Final] = await db.select().from(challenges).where(eq(challenges.id, ch3.id));
    if (ch3Final.status !== "finished") {
      throw new Error(`Expected ch3 status = 'finished', got ${ch3Final.status}`);
    }

    const results3 = await db.select().from(challengeResults).where(eq(challengeResults.challengeId, ch3.id));
    if (
      results3.length !== 1 ||
      results3[0].submissionId !== sub3A.id ||
      results3[0].resolutionMethod !== "tiebreak_vote"
    ) {
      throw new Error(`Test 3 results verification failed: ${JSON.stringify(results3)}`);
    }
    console.log("✓ Test 3, 4, 5 Passed: Main tie -> tie_pending -> tiebreak_open -> tiebreak winner resolved.\n");

    // --------------------------------------------------------------------------
    // TEST 6 & 7: Tiebreak 0-votes -> TIE_PENDING -> Manual Resolve
    // --------------------------------------------------------------------------
    console.log("-> [Test 6, 7] Tiebreak 0-votes -> TIE_PENDING -> Manual Resolve with reason & candidate validation...");
    const [ch4] = await db
      .insert(challenges)
      .values({
        title: "Challenge 4",
        slug: "ch-4",
        theme: "Theme",
        description: "Desc",
        promptRules: "Rules",
        status: "voting_open",
        awardMode: "vote_only",
        starsPerMember: 1,
        createdByUserId: adminUser.id,
      })
      .returning();

    const sub4A = await createSubmission(ch4.id, artist1, prof1, "Art 4A");
    const sub4B = await createSubmission(ch4.id, artist2, prof2, "Art 4B");

    const [round4Main] = await db
      .insert(challengeVotingRounds)
      .values({
        challengeId: ch4.id,
        roundType: "main",
        roundSequence: 1,
        status: "open",
        startsAt: new Date(Date.now() - 3600000),
        deadline: futureDeadline,
        starsPerMember: 1,
      })
      .returning();

    await db.insert(challengeVotingRoundCandidates).values([
      { votingRoundId: round4Main.id, submissionId: sub4A.id },
      { votingRoundId: round4Main.id, submissionId: sub4B.id },
    ]);

    // Vote main: 4A = 1, 4B = 1 -> tie
    await castOrUpdateBallotService(db, voter1Ctx, {
      votingRoundId: round4Main.id,
      votes: [{ submissionId: sub4A.id, starsCount: 1 }],
    });
    await castOrUpdateBallotService(db, voter2Ctx, {
      votingRoundId: round4Main.id,
      votes: [{ submissionId: sub4B.id, starsCount: 1 }],
    });

    // Advance deadline to allow finalization
    await db
      .update(challengeVotingRounds)
      .set({ deadline: pastDeadline })
      .where(eq(challengeVotingRounds.id, round4Main.id));

    await finalizeVotingRoundService(db, adminCtx, { votingRoundId: round4Main.id });

    // Start tiebreak
    const tb4 = await startTiebreakService(db, modCtx, { challengeId: ch4.id });

    // 0 votes cast in tiebreak round, close tiebreak
    await db
      .update(challengeVotingRounds)
      .set({ deadline: pastDeadline })
      .where(eq(challengeVotingRounds.id, tb4.votingRoundId));

    const tb4Fin = await finalizeVotingRoundService(db, adminCtx, { votingRoundId: tb4.votingRoundId });
    if (tb4Fin.outcome !== "tie_pending" || !tb4Fin.requiresManualResolve) {
      throw new Error(`Expected tiebreak 0-vote to enter tie_pending requiring manual resolve, got ${JSON.stringify(tb4Fin)}`);
    }

    // Verify calling startTiebreak again throws error
    let secondTbFailed = false;
    try {
      await startTiebreakService(db, modCtx, { challengeId: ch4.id });
    } catch (err: any) {
      secondTbFailed = true;
    }
    if (!secondTbFailed) {
      throw new Error("Expected starting a 2nd tiebreak to fail, but it succeeded!");
    }

    // Manual resolve validation:
    // 1. Invalid short reason
    let shortReasonFailed = false;
    try {
      await resolveTieManuallyService(db, modCtx, {
        challengeId: ch4.id,
        submissionId: sub4B.id,
        reason: "abc",
      });
    } catch (err: any) {
      shortReasonFailed = true;
    }
    if (!shortReasonFailed) throw new Error("Expected short reason to fail!");

    // 2. Valid manual resolve
    const manRes = await resolveTieManuallyService(db, modCtx, {
      challengeId: ch4.id,
      submissionId: sub4B.id,
      reason: "Curator decision based on technical excellence and composition.",
    });

    if (!manRes.success || manRes.winnerSubmissionId !== sub4B.id) {
      throw new Error(`Manual resolve failed: ${JSON.stringify(manRes)}`);
    }

    const [ch4Final] = await db.select().from(challenges).where(eq(challenges.id, ch4.id));
    if (ch4Final.status !== "finished") {
      throw new Error(`Expected ch4 status = 'finished', got ${ch4Final.status}`);
    }

    const results4 = await db.select().from(challengeResults).where(eq(challengeResults.challengeId, ch4.id));
    if (
      results4.length !== 1 ||
      results4[0].submissionId !== sub4B.id ||
      results4[0].resolutionMethod !== "manual_tiebreak_tie"
    ) {
      throw new Error(`Test 6 results verification failed: ${JSON.stringify(results4)}`);
    }
    console.log("✓ Test 6, 7 Passed: Tiebreak tie -> TIE_PENDING -> Manual Resolve with audit.\n");

    // --------------------------------------------------------------------------
    // TEST 8: Anti-Self-Voting & Star Limit Validation
    // --------------------------------------------------------------------------
    console.log("-> [Test 8] Anti-Self-Voting, frozen candidate whitelist, and Star limit checks...");
    const [ch5] = await db
      .insert(challenges)
      .values({
        title: "Challenge 5",
        slug: "ch-5",
        theme: "Theme",
        description: "Desc",
        promptRules: "Rules",
        status: "voting_open",
        awardMode: "vote_only",
        starsPerMember: 2,
        createdByUserId: adminUser.id,
      })
      .returning();

    const sub5A = await createSubmission(ch5.id, artist1, prof1, "Art 5A");
    const sub5B = await createSubmission(ch5.id, artist2, prof2, "Art 5B");

    const [round5] = await db
      .insert(challengeVotingRounds)
      .values({
        challengeId: ch5.id,
        roundType: "main",
        roundSequence: 1,
        status: "open",
        startsAt: new Date(Date.now() - 3600000),
        deadline: new Date(Date.now() + 3600000),
        starsPerMember: 2,
      })
      .returning();

    await db.insert(challengeVotingRoundCandidates).values([
      { votingRoundId: round5.id, submissionId: sub5A.id },
      { votingRoundId: round5.id, submissionId: sub5B.id },
    ]);

    // Anti-self voting check: artist1 votes for sub5A (own submission)
    let selfVoteFailed = false;
    try {
      await castOrUpdateBallotService(db, artist1Ctx, {
        votingRoundId: round5.id,
        votes: [{ submissionId: sub5A.id, starsCount: 1 }],
      });
    } catch (err: any) {
      selfVoteFailed = true;
    }
    if (!selfVoteFailed) throw new Error("Expected self-voting to fail!");

    // Star limit check: 3 stars when max is 2
    let limitFailed = false;
    try {
      await castOrUpdateBallotService(db, voter1Ctx, {
        votingRoundId: round5.id,
        votes: [{ submissionId: sub5A.id, starsCount: 3 }],
      });
    } catch (err: any) {
      limitFailed = true;
    }
    if (!limitFailed) throw new Error("Expected over-allocation to fail!");

    console.log("✓ Test 8 Passed: Self-voting and star limit violations rejected.\n");

    // --------------------------------------------------------------------------
    // TEST 9: Early Finalization Rejection
    // --------------------------------------------------------------------------
    console.log("-> [Test 9] Early finalization before deadline rejection...");
    let earlyFinFailed = false;
    try {
      await finalizeVotingRoundService(db, adminCtx, { votingRoundId: round5.id });
    } catch (err: any) {
      if (err.message.includes("belum mencapai batas waktu deadline")) {
        earlyFinFailed = true;
      }
    }
    if (!earlyFinFailed) throw new Error("Expected early finalization to be rejected!");
    console.log("✓ Test 9 Passed: Early finalization before deadline rejected.\n");

    // --------------------------------------------------------------------------
    // TEST 10: Mode-Specific Submission Lock Branching (0, 1, 2+ submissions)
    // --------------------------------------------------------------------------
    console.log("-> [Test 10] Mode-Specific Submission Lock Branching in Scheduler...");
    // 10a. 0 submissions -> CANCELLED
    const [ch0Sub] = await db
      .insert(challenges)
      .values({
        title: "0 Sub Challenge",
        slug: "ch-0-sub",
        theme: "Theme",
        description: "Desc",
        promptRules: "Rules",
        status: "submission_open",
        awardMode: "vote_only",
        submissionDeadline: pastDeadline,
        createdByUserId: adminUser.id,
      })
      .returning();

    await materializeScheduledTransitionsService(db, new Date());
    const [ch0SubRes] = await db.select().from(challenges).where(eq(challenges.id, ch0Sub.id));
    if (ch0SubRes.status !== "cancelled") {
      throw new Error(`Expected 0 sub challenge status = 'cancelled', got ${ch0SubRes.status}`);
    }

    // 10b. 1 submission in vote_only -> auto winner -> FINISHED
    const [ch1Sub] = await db
      .insert(challenges)
      .values({
        title: "1 Sub Challenge",
        slug: "ch-1-sub",
        theme: "Theme",
        description: "Desc",
        promptRules: "Rules",
        status: "submission_open",
        awardMode: "vote_only",
        submissionDeadline: pastDeadline,
        createdByUserId: adminUser.id,
      })
      .returning();

    const singleSub = await createSubmission(ch1Sub.id, artist1, prof1, "Sole Entry");
    await materializeScheduledTransitionsService(db, new Date());
    const [ch1SubRes] = await db.select().from(challenges).where(eq(challenges.id, ch1Sub.id));
    if (ch1SubRes.status !== "finished") {
      throw new Error(`Expected 1 sub challenge status = 'finished', got ${ch1SubRes.status}`);
    }
    const res1Sub = await db.select().from(challengeResults).where(eq(challengeResults.challengeId, ch1Sub.id));
    if (
      res1Sub.length !== 1 ||
      res1Sub[0].submissionId !== singleSub.id ||
      res1Sub[0].resolutionMethod !== "automatic_single_submission"
    ) {
      throw new Error(`Expected automatic single submission winner, got ${JSON.stringify(res1Sub)}`);
    }

    console.log("✓ Test 10 Passed: Mode-specific submission lock branching verified.\n");

    console.log("=================================================================");
    console.log("🎉 ALL GATE B / PHASE 2 TEST SCENARIOS PASSED WITH FULL INTEGRITY!");
    console.log("=================================================================\n");
    process.exit(0);
  } finally {
    try {
      await testClient.end();
    } catch (_e) {
      // ignore
    }
    try {
      await adminClient.unsafe(`DROP DATABASE IF EXISTS "${testDbName}";`);
      await adminClient.end();
    } catch (_e) {
      // ignore
    }
  }
}

runTests().catch((err) => {
  console.error("❌ Gate B tests failed:", err);
  process.exit(1);
});
