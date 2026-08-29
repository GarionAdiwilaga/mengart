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
import { eq, and, sql, desc } from "drizzle-orm";
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
  const testClient = postgres(testDbUrl, { max: 10 });
  const db = drizzle(testClient, { schema });

  try {
    console.log("-> Running migrations 0000 -> 0008 on test database...");
    await migrate(db, { migrationsFolder: "./drizzle" });
    console.log("✓ Database migrated to 0008.\n");

    // Setup basic actors
    const [adminUser] = await db
      .insert(users)
      .values({ email: "admin@atelier.local", role: "admin", membershipStatus: "active", emailVerified: new Date() })
      .returning();
    const [modUser] = await db
      .insert(users)
      .values({ email: "mod@atelier.local", role: "moderator", membershipStatus: "active", emailVerified: new Date() })
      .returning();
    const [artist1] = await db
      .insert(users)
      .values({ email: "artist1@atelier.local", role: "member", membershipStatus: "active", emailVerified: new Date() })
      .returning();
    const [artist2] = await db
      .insert(users)
      .values({ email: "artist2@atelier.local", role: "member", membershipStatus: "active", emailVerified: new Date() })
      .returning();
    const [artist3] = await db
      .insert(users)
      .values({ email: "artist3@atelier.local", role: "member", membershipStatus: "active", emailVerified: new Date() })
      .returning();
    const [voter1] = await db
      .insert(users)
      .values({ email: "voter1@atelier.local", role: "member", membershipStatus: "active", emailVerified: new Date() })
      .returning();
    const [voter2] = await db
      .insert(users)
      .values({ email: "voter2@atelier.local", role: "member", membershipStatus: "active", emailVerified: new Date() })
      .returning();

    // Additional users for auth test matrix
    const [suspendedUser] = await db
      .insert(users)
      .values({ email: "suspended@atelier.local", role: "member", membershipStatus: "suspended", emailVerified: new Date() })
      .returning();
    const [revokedUser] = await db
      .insert(users)
      .values({ email: "revoked@atelier.local", role: "member", membershipStatus: "revoked", emailVerified: new Date() })
      .returning();
    const [deletedUser] = await db
      .insert(users)
      .values({ email: "deleted@atelier.local", role: "member", membershipStatus: "active", emailVerified: new Date(), deletedAt: new Date() })
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

    const adminCtx = { userId: adminUser.id, role: adminUser.role };
    const modCtx = { userId: modUser.id, role: modUser.role };
    const voter1Ctx = { userId: voter1.id, role: voter1.role };
    const voter2Ctx = { userId: voter2.id, role: voter2.role };

    // Helper: Create Submissions with Artwork Versions
    async function createSubmission(chId: string, artistUser: any, artistProf: any, title: string) {
      const [art] = await db
        .insert(artworks)
        .values({
          userId: artistUser.id,
          title,
          slug: `${title.toLowerCase().replace(/[^a-z0-9]/g, "-")}-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          mediaType: "image",
          publicationStatus: "published",
        })
        .returning();

      const [artVer] = await db
        .insert(artworkVersions)
        .values({
          artworkId: art.id,
          versionNumber: 1,
          mediaType: "image",
          masterStorageKey: `master_${art.id}.png`,
          publicStorageKey: `public_${art.id}.webp`,
          thumbnailStorageKey: `thumb_${art.id}.webp`,
          mimeType: "image/png",
          fileSizeBytes: 1024,
          checksumSha256: "dummy_checksum",
          processingStatus: "ready",
        })
        .returning();

      const [sub] = await db
        .insert(challengeSubmissions)
        .values({
          challengeId: chId,
          userId: artistUser.id,
          profileId: artistProf.id,
          submissionStatus: "submitted",
        })
        .returning();

      const [subVer] = await db
        .insert(challengeSubmissionVersions)
        .values({
          submissionId: sub.id,
          versionNumber: 1,
          artworkVersionId: artVer.id,
          title,
        })
        .returning();

      await db
        .update(challengeSubmissions)
        .set({ currentVersionId: subVer.id })
        .where(eq(challengeSubmissions.id, sub.id));

      return sub;
    }

    // --------------------------------------------------------------------------
    // TEST 1: MAIN ROUND - UNIQUE POSITIVE MAX STARS -> SINGLE COMMUNITY WINNER
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
    console.log("✓ Test 3 Passed: Main tie -> tie_pending -> tiebreak_open -> tiebreak winner resolved.\n");

    // --------------------------------------------------------------------------
    // TEST 4: TIEBREAK 0-VOTES -> TIE_PENDING -> MANUAL RESOLVE
    // --------------------------------------------------------------------------
    console.log("-> [Test 4] Tiebreak 0-votes -> TIE_PENDING -> Manual Resolve with reason & candidate validation...");
    const [ch4] = await db
      .insert(challenges)
      .values({
        title: "Challenge 4 - Tiebreak 0 Votes",
        slug: `ch4-${Date.now()}`,
        theme: "Theme",
        description: "Desc",
        promptRules: "Rules",
        status: "tie_pending",
        awardMode: "vote_only",
        createdByUserId: adminUser.id,
      })
      .returning();
    const sub4A = await createSubmission(ch4.id, artist1, prof1, "Art 4A");
    const sub4B = await createSubmission(ch4.id, artist2, prof2, "Art 4B");

    const [round4Main] = await db
      .insert(challengeVotingRounds)
      .values({ challengeId: ch4.id, roundType: "main", roundSequence: 1, status: "closed", deadline: pastDeadline })
      .returning();
    await db.insert(challengeVotingRoundCandidates).values([
      { votingRoundId: round4Main.id, submissionId: sub4A.id },
      { votingRoundId: round4Main.id, submissionId: sub4B.id },
    ]);
    const [b4] = await db.insert(challengeBallots).values({ challengeId: ch4.id, votingRoundId: round4Main.id, userId: voter1.id, roundType: "main", starsAllocated: 2, isFinalized: true }).returning();
    await db.insert(challengeBallotStars).values([
      { ballotId: b4.id, submissionId: sub4A.id, starsCount: 1 },
      { ballotId: b4.id, submissionId: sub4B.id, starsCount: 1 },
    ]);

    const tbStartRes4 = await startTiebreakService(db, adminCtx, { challengeId: ch4.id });
    await db
      .update(challengeVotingRounds)
      .set({ deadline: pastDeadline })
      .where(eq(challengeVotingRounds.id, tbStartRes4.votingRoundId));
    const fin4Tb = await finalizeVotingRoundService(db, adminCtx, { votingRoundId: tbStartRes4.votingRoundId });
    if (!fin4Tb.success || fin4Tb.outcome !== "tie_pending" || !fin4Tb.requiresManualResolve) {
      throw new Error(`Test 4 Failed: Expected tiebreak 0-votes to yield tie_pending with manual resolve required, got ${JSON.stringify(fin4Tb)}`);
    }

    // Attempting manual resolve with non-candidate sub1A -> rejected
    let nonCandRejected = false;
    try {
      await resolveTieManuallyService(db, modCtx, {
        challengeId: ch4.id,
        submissionId: sub1A.id,
        reason: "Valid curator reason for winner",
      });
    } catch (err: any) {
      nonCandRejected = true;
    }
    if (!nonCandRejected) throw new Error("Expected non-candidate manual resolve to fail!");

    // Manual resolve with valid candidate sub4A and >= 5 char reason
    const manRes = await resolveTieManuallyService(db, modCtx, {
      challengeId: ch4.id,
      submissionId: sub4A.id,
      reason: "Curator choice based on thematic composition and lighting craft.",
    });
    if (!manRes.success || manRes.winnerSubmissionId !== sub4A.id) {
      throw new Error(`Test 4 Failed: Expected manual resolve success, got ${JSON.stringify(manRes)}`);
    }

    const [res4] = await db
      .select()
      .from(challengeResults)
      .where(and(eq(challengeResults.challengeId, ch4.id), eq(challengeResults.awardType, "community_vote_winner")));
    if (!res4 || res4.submissionId !== sub4A.id || res4.resolutionMethod !== "manual_tiebreak_tie") {
      throw new Error(`Test 4 Failed: Expected persisted result with resolutionMethod manual_tiebreak_tie, got ${JSON.stringify(res4)}`);
    }
    console.log("✓ Test 4 Passed: Tiebreak tie -> TIE_PENDING -> Manual Resolve with audit.\n");

    // --------------------------------------------------------------------------
    // TEST 5: USER MEMBERSHIP STATUS AUTHORIZATION (ACTIVE VS SUSPENDED / REVOKED / DELETED)
    // --------------------------------------------------------------------------
    console.log("-> [Test 5] User membership status authorization in castOrUpdateBallotService & resetBallotService...");
    const [ch5] = await db
      .insert(challenges)
      .values({
        title: "Challenge 5 - Auth Matrix",
        slug: `ch5-${Date.now()}`,
        theme: "Theme",
        description: "Desc",
        promptRules: "Rules",
        status: "voting_open",
        awardMode: "vote_only",
        starsPerMember: 3,
        createdByUserId: adminUser.id,
      })
      .returning();
    const sub5A = await createSubmission(ch5.id, artist1, prof1, "Art 5A");
    const sub5B = await createSubmission(ch5.id, artist2, prof2, "Art 5B");
    const [round5] = await db
      .insert(challengeVotingRounds)
      .values({ challengeId: ch5.id, roundType: "main", roundSequence: 1, status: "open", starsPerMember: 3 })
      .returning();
    await db.insert(challengeVotingRoundCandidates).values([
      { votingRoundId: round5.id, submissionId: sub5A.id },
      { votingRoundId: round5.id, submissionId: sub5B.id },
    ]);

    // 1. Active member -> allowed
    const activeRes = await castOrUpdateBallotService(db, voter1Ctx, {
      votingRoundId: round5.id,
      votes: [{ submissionId: sub5A.id, starsCount: 1 }],
    });
    if (!activeRes.success) throw new Error("Expected active member voting to succeed");

    // 2. Suspended member -> rejected
    let suspendedRejected = false;
    try {
      await castOrUpdateBallotService(db, { userId: suspendedUser.id, role: suspendedUser.role }, {
        votingRoundId: round5.id,
        votes: [{ submissionId: sub5A.id, starsCount: 1 }],
      });
    } catch (err: any) {
      if (err.message.includes("tidak aktif atau sedang ditangguhkan/dicabut")) {
        suspendedRejected = true;
      }
    }
    if (!suspendedRejected) throw new Error("Expected suspended member voting to be rejected!");

    // 3. Revoked member -> rejected
    let revokedRejected = false;
    try {
      await castOrUpdateBallotService(db, { userId: revokedUser.id, role: revokedUser.role }, {
        votingRoundId: round5.id,
        votes: [{ submissionId: sub5A.id, starsCount: 1 }],
      });
    } catch (err: any) {
      if (err.message.includes("tidak aktif atau sedang ditangguhkan/dicabut")) {
        revokedRejected = true;
      }
    }
    if (!revokedRejected) throw new Error("Expected revoked member voting to be rejected!");

    // 4. Deleted member -> rejected
    let deletedRejected = false;
    try {
      await castOrUpdateBallotService(db, { userId: deletedUser.id, role: deletedUser.role }, {
        votingRoundId: round5.id,
        votes: [{ submissionId: sub5A.id, starsCount: 1 }],
      });
    } catch (err: any) {
      if (err.message.includes("tidak aktif atau sedang ditangguhkan/dicabut")) {
        deletedRejected = true;
      }
    }
    if (!deletedRejected) throw new Error("Expected deleted member voting to be rejected!");

    // 5. Reset ballot by suspended member -> rejected
    let resetSuspendedRejected = false;
    try {
      await resetBallotService(db, { userId: suspendedUser.id, role: suspendedUser.role }, {
        votingRoundId: round5.id,
      });
    } catch (err: any) {
      if (err.message.includes("tidak aktif atau sedang ditangguhkan/dicabut")) {
        resetSuspendedRejected = true;
      }
    }
    if (!resetSuspendedRejected) throw new Error("Expected reset ballot by suspended user to be rejected!");

    console.log("✓ Test 5 Passed: Membership status (active vs suspended/revoked/deleted) strictly enforced.\n");

    // --------------------------------------------------------------------------
    // TEST 6: MALFORMED ALLOCATIONS & NEGATIVE STAR BYPASS PREVENTION
    // --------------------------------------------------------------------------
    console.log("-> [Test 6] Malformed allocations & negative Star bypass prevention...");
    // Attempt A = -100, B = 103 on max allowance 3 -> must be rejected
    let negBypassRejected = false;
    try {
      await castOrUpdateBallotService(db, voter2Ctx, {
        votingRoundId: round5.id,
        votes: [
          { submissionId: sub5A.id, starsCount: -100 },
          { submissionId: sub5B.id, starsCount: 103 },
        ],
      });
    } catch (err: any) {
      if (err.message.includes("negatif")) {
        negBypassRejected = true;
      }
    }
    if (!negBypassRejected) throw new Error("Expected negative star allocation bypass to be rejected!");

    // Fractional stars (1.5)
    let fracRejected = false;
    try {
      await castOrUpdateBallotService(db, voter2Ctx, {
        votingRoundId: round5.id,
        votes: [{ submissionId: sub5A.id, starsCount: 1.5 }],
      });
    } catch (err: any) {
      if (err.message.includes("bilangan bulat")) {
        fracRejected = true;
      }
    }
    if (!fracRejected) throw new Error("Expected fractional stars to be rejected!");

    // Duplicate submissionId in same request
    let dupSubRejected = false;
    try {
      await castOrUpdateBallotService(db, voter2Ctx, {
        votingRoundId: round5.id,
        votes: [
          { submissionId: sub5A.id, starsCount: 1 },
          { submissionId: sub5A.id, starsCount: 1 },
        ],
      });
    } catch (err: any) {
      if (err.message.includes("Duplikasi")) {
        dupSubRejected = true;
      }
    }
    if (!dupSubRejected) throw new Error("Expected duplicate submissionId to be rejected!");

    // Self-voting attempt
    let selfVoteRejected = false;
    try {
      await castOrUpdateBallotService(db, { userId: artist1.id, role: artist1.role }, {
        votingRoundId: round5.id,
        votes: [{ submissionId: sub5A.id, starsCount: 1 }],
      });
    } catch (err: any) {
      if (err.message.includes("Self-voting dilarang")) {
        selfVoteRejected = true;
      }
    }
    if (!selfVoteRejected) throw new Error("Expected self-voting to be rejected!");

    // Valid stacking within allowance (2 stars on sub5A, 1 star on sub5B)
    const validStackRes = await castOrUpdateBallotService(db, voter2Ctx, {
      votingRoundId: round5.id,
      votes: [
        { submissionId: sub5A.id, starsCount: 2 },
        { submissionId: sub5B.id, starsCount: 1 },
      ],
    });
    if (!validStackRes.success) throw new Error("Expected valid star stacking to succeed");

    console.log("✓ Test 6 Passed: Malformed allocations (negative, fractional, duplicate, self-vote, stacking) validated.\n");

    // --------------------------------------------------------------------------
    // TEST 7: RESET BALLOT SERVICE TEST
    // --------------------------------------------------------------------------
    console.log("-> [Test 7] resetBallotService production service test...");
    const resetRes = await resetBallotService(db, voter2Ctx, { votingRoundId: round5.id });
    if (!resetRes.success) throw new Error("Expected resetBallotService to succeed");

    const [voter2Ballot] = await db
      .select()
      .from(challengeBallots)
      .where(and(eq(challengeBallots.votingRoundId, round5.id), eq(challengeBallots.userId, voter2.id)));
    if (!voter2Ballot || voter2Ballot.starsAllocated !== 0) {
      throw new Error(`Expected starsAllocated 0 after reset, got ${voter2Ballot?.starsAllocated}`);
    }
    const voter2Stars = await db
      .select()
      .from(challengeBallotStars)
      .where(eq(challengeBallotStars.ballotId, voter2Ballot.id));
    if (voter2Stars.length !== 0) {
      throw new Error(`Expected 0 star rows after reset, got ${voter2Stars.length}`);
    }
    console.log("✓ Test 7 Passed: resetBallotService cleared allocations cleanly.\n");

    // --------------------------------------------------------------------------
    // TEST 8: VOTER IDENTITY ABSENT FROM GET AUTHORITATIVE VOTING ROUND DATA
    // --------------------------------------------------------------------------
    console.log("-> [Test 8] Voter anonymity in getAuthoritativeVotingRoundData payload...");
    const roundData = await getAuthoritativeVotingRoundData(ch5.id, voter1.id, { dbOrTx: db });
    if (!roundData || !roundData.candidates || roundData.candidates.length !== 2) {
      throw new Error(`Expected 2 candidate entries in roundData`);
    }
    // Verify candidates array contains aggregate totalStars, but no foreign ballot lists
    for (const c of roundData.candidates) {
      if ("userId" in c && (c as any).userId !== c.artistUserId) {
        throw new Error("Foreign voter userId leaked in candidate payload!");
      }
      if ("ballots" in c || "voterList" in c) {
        throw new Error("Voter ballots array leaked in candidate payload!");
      }
    }
    console.log("✓ Test 8 Passed: Voter identity is absent from candidate payload.\n");

    // --------------------------------------------------------------------------
    // TEST 9: SAME USER CAN OWN ONE MAIN BALLOT AND ONE TIEBREAK BALLOT
    // --------------------------------------------------------------------------
    console.log("-> [Test 9] Per-round ballot uniqueness (same user in Main and Tiebreak)...");
    const [ch9] = await db
      .insert(challenges)
      .values({
        title: "Challenge 9 - Multi Round User",
        slug: `ch9-${Date.now()}`,
        theme: "Theme",
        description: "Desc",
        promptRules: "Rules",
        status: "voting_open",
        awardMode: "vote_only",
        starsPerMember: 2,
        createdByUserId: adminUser.id,
      })
      .returning();
    const sub9A = await createSubmission(ch9.id, artist1, prof1, "Art 9A");
    const sub9B = await createSubmission(ch9.id, artist2, prof2, "Art 9B");

    const [round9Main] = await db
      .insert(challengeVotingRounds)
      .values({ challengeId: ch9.id, roundType: "main", roundSequence: 1, status: "open", deadline: futureDeadline, starsPerMember: 2 })
      .returning();
    await db.insert(challengeVotingRoundCandidates).values([
      { votingRoundId: round9Main.id, submissionId: sub9A.id },
      { votingRoundId: round9Main.id, submissionId: sub9B.id },
    ]);

    // Voter 1 casts in Main
    await castOrUpdateBallotService(db, voter1Ctx, {
      votingRoundId: round9Main.id,
      votes: [{ submissionId: sub9A.id, starsCount: 1 }, { submissionId: sub9B.id, starsCount: 1 }],
    });

    await db
      .update(challengeVotingRounds)
      .set({ deadline: pastDeadline })
      .where(eq(challengeVotingRounds.id, round9Main.id));

    await finalizeVotingRoundService(db, adminCtx, { votingRoundId: round9Main.id });

    // Open Tiebreak
    const tbRes9 = await startTiebreakService(db, adminCtx, { challengeId: ch9.id });

    // Voter 1 casts in Tiebreak
    await castOrUpdateBallotService(db, voter1Ctx, {
      votingRoundId: tbRes9.votingRoundId,
      votes: [{ submissionId: sub9A.id, starsCount: 1 }],
    });

    const user9Ballots = await db
      .select()
      .from(challengeBallots)
      .where(and(eq(challengeBallots.challengeId, ch9.id), eq(challengeBallots.userId, voter1.id)));
    if (user9Ballots.length !== 2) {
      throw new Error(`Expected exactly 2 ballots for user across main and tiebreak rounds, got ${user9Ballots.length}`);
    }
    console.log("✓ Test 9 Passed: User successfully owns separate ballots for Main and Tiebreak rounds.\n");

    // --------------------------------------------------------------------------
    // TEST 10: OPERATIONAL STATE & DEADLINE VALIDATIONS IN FINALIZE
    // --------------------------------------------------------------------------
    console.log("-> [Test 10] Operational state & deadline validation in finalizeVotingRoundService...");
    // 1. Pending round -> cannot finalize
    const [ch10Pending] = await db
      .insert(challenges)
      .values({
        title: "Challenge 10 - Pending",
        slug: `ch10-pending-${Date.now()}`,
        theme: "Theme",
        description: "Desc",
        promptRules: "Rules",
        status: "submission_locked",
        awardMode: "vote_only",
        createdByUserId: adminUser.id,
      })
      .returning();
    await createSubmission(ch10Pending.id, artist1, prof1, "Art 10A");

    const [round10Pending] = await db
      .insert(challengeVotingRounds)
      .values({ challengeId: ch10Pending.id, roundType: "main", roundSequence: 1, status: "pending", deadline: pastDeadline })
      .returning();
    let pendingFinalizeRejected = false;
    try {
      await finalizeVotingRoundService(db, adminCtx, { votingRoundId: round10Pending.id });
    } catch (err: any) {
      if (err.message.includes("bukan \"open\"")) {
        pendingFinalizeRejected = true;
      }
    }
    if (!pendingFinalizeRejected) throw new Error("Expected pending round finalization to be rejected!");

    // 2. Future OPEN round -> cannot finalize
    const [ch10Future] = await db
      .insert(challenges)
      .values({
        title: "Challenge 10 - Future",
        slug: `ch10-future-${Date.now()}`,
        theme: "Theme",
        description: "Desc",
        promptRules: "Rules",
        status: "voting_open",
        awardMode: "vote_only",
        createdByUserId: adminUser.id,
      })
      .returning();
    await createSubmission(ch10Future.id, artist1, prof1, "Art 10B");

    const futureDeadline10 = new Date(Date.now() + 3600 * 1000);
    const [round10Future] = await db
      .insert(challengeVotingRounds)
      .values({ challengeId: ch10Future.id, roundType: "main", roundSequence: 1, status: "open", deadline: futureDeadline10 })
      .returning();
    let futureFinalizeRejected = false;
    try {
      await finalizeVotingRoundService(db, adminCtx, { votingRoundId: round10Future.id });
    } catch (err: any) {
      if (err.message.includes("belum mencapai batas waktu deadline")) {
        futureFinalizeRejected = true;
      }
    }
    if (!futureFinalizeRejected) throw new Error("Expected future round finalization to be rejected!");

    // 3. OPEN main + wrong challenge status (submission_locked) -> cannot finalize
    const [ch10WrongStatus] = await db
      .insert(challenges)
      .values({
        title: "Challenge 10 - Wrong Status",
        slug: `ch10-wrong-${Date.now()}`,
        theme: "Theme",
        description: "Desc",
        promptRules: "Rules",
        status: "submission_locked",
        awardMode: "vote_only",
        createdByUserId: adminUser.id,
      })
      .returning();
    await createSubmission(ch10WrongStatus.id, artist1, prof1, "Art 10C");

    const [round10WrongStatus] = await db
      .insert(challengeVotingRounds)
      .values({ challengeId: ch10WrongStatus.id, roundType: "main", roundSequence: 1, status: "open", deadline: pastDeadline })
      .returning();
    let wrongChallengeStatusRejected = false;
    try {
      await finalizeVotingRoundService(db, adminCtx, { votingRoundId: round10WrongStatus.id });
    } catch (err: any) {
      if (err.message.includes("harus \"voting_open\"")) {
        wrongChallengeStatusRejected = true;
      }
    }
    if (!wrongChallengeStatusRejected) throw new Error("Expected finalization on wrong challenge status to be rejected!");

    // 4. Closed round remains idempotent
    await db.update(challengeVotingRounds).set({ status: "closed" }).where(eq(challengeVotingRounds.id, round10WrongStatus.id));
    const closedRes = await finalizeVotingRoundService(db, adminCtx, { votingRoundId: round10WrongStatus.id });
    if (!closedRes.success || !closedRes.idempotent) {
      throw new Error(`Expected idempotent return for closed round, got ${JSON.stringify(closedRes)}`);
    }

    console.log("✓ Test 10 Passed: Operational state and deadline validations confirmed in finalizeVotingRoundService.\n");

    // --------------------------------------------------------------------------
    // TEST 11: SCHEDULER SYSTEM ACTOR & AUTOMATIC FINALIZATION
    // --------------------------------------------------------------------------
    console.log("-> [Test 11] Scheduler system actor with NULL actor_id in audit logs...");
    const [ch11] = await db
      .insert(challenges)
      .values({
        title: "Challenge 11 - Scheduler Finalize",
        slug: `ch11-${Date.now()}`,
        theme: "Theme",
        description: "Desc",
        promptRules: "Rules",
        status: "voting_open",
        awardMode: "vote_only",
        starsPerMember: 2,
        createdByUserId: adminUser.id,
      })
      .returning();
    const sub11A = await createSubmission(ch11.id, artist1, prof1, "Art 11A");
    const [round11] = await db
      .insert(challengeVotingRounds)
      .values({ challengeId: ch11.id, roundType: "main", roundSequence: 1, status: "open", deadline: futureDeadline, starsPerMember: 2 })
      .returning();
    await db.insert(challengeVotingRoundCandidates).values([{ votingRoundId: round11.id, submissionId: sub11A.id }]);

    await castOrUpdateBallotService(db, voter1Ctx, {
      votingRoundId: round11.id,
      votes: [{ submissionId: sub11A.id, starsCount: 1 }],
    });

    // Advance deadline to past for scheduler to finalize
    await db
      .update(challengeVotingRounds)
      .set({ deadline: pastDeadline })
      .where(eq(challengeVotingRounds.id, round11.id));

    // Run scheduler materializer
    const schedRes = await materializeScheduledTransitionsService(db, new Date());
    if (schedRes.processedCount === 0) {
      throw new Error("Expected scheduler materializer to process expired round!");
    }

    const [ch11After] = await db.select().from(challenges).where(eq(challenges.id, ch11.id));
    if (ch11After.status !== "finished") {
      throw new Error(`Expected challenge 11 status finished, got ${ch11After.status}`);
    }

    // Verify audit row exists with valid null actor_id
    const schedAudit = await db
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.targetId, ch11.id), eq(auditLogs.action, "challenge.transition_status")))
      .orderBy(desc(auditLogs.createdAt))
      .limit(1);

    if (schedAudit.length === 0 || schedAudit[0].actorId !== null) {
      throw new Error(`Expected scheduler audit row with null actorId, got ${JSON.stringify(schedAudit)}`);
    }
    console.log("✓ Test 11 Passed: Scheduler executed automatic finalization with valid NULL actor_id.\n");

    // --------------------------------------------------------------------------
    // TEST 12: MODE-SPECIFIC SUBMISSION LOCK BRANCHING (JURY_ONLY & SHOWCASE_ONLY)
    // --------------------------------------------------------------------------
    console.log("-> [Test 12] Mode-specific submission lock branching in scheduler...");
    // Jury Only with 2 submissions -> JURY_SELECTION_OPEN, 0 Community Winners
    const [chJury] = await db
      .insert(challenges)
      .values({
        title: "Challenge Jury Only",
        slug: `ch-jury-${Date.now()}`,
        theme: "Theme",
        description: "Desc",
        promptRules: "Rules",
        status: "submission_open",
        awardMode: "jury_only",
        submissionDeadline: pastDeadline,
        createdByUserId: adminUser.id,
      })
      .returning();
    await createSubmission(chJury.id, artist1, prof1, "Jury Art 1");
    await createSubmission(chJury.id, artist2, prof2, "Jury Art 2");

    await materializeScheduledTransitionsService(db, new Date());
    const [chJuryAfter] = await db.select().from(challenges).where(eq(challenges.id, chJury.id));
    if (chJuryAfter.status !== "jury_selection_open") {
      throw new Error(`Expected jury_only challenge to transition to jury_selection_open, got ${chJuryAfter.status}`);
    }
    const juryResults = await db.select().from(challengeResults).where(eq(challengeResults.challengeId, chJury.id));
    if (juryResults.length !== 0) {
      throw new Error(`Expected 0 community results for jury_only, got ${juryResults.length}`);
    }

    // Showcase Only with 2 submissions -> FINISHED, 0 Community Winners
    const [chShowcase] = await db
      .insert(challenges)
      .values({
        title: "Challenge Showcase Only",
        slug: `ch-showcase-${Date.now()}`,
        theme: "Theme",
        description: "Desc",
        promptRules: "Rules",
        status: "submission_open",
        awardMode: "showcase_only",
        submissionDeadline: pastDeadline,
        createdByUserId: adminUser.id,
      })
      .returning();
    await createSubmission(chShowcase.id, artist1, prof1, "Showcase Art 1");
    await createSubmission(chShowcase.id, artist2, prof2, "Showcase Art 2");

    await materializeScheduledTransitionsService(db, new Date());
    const [chShowcaseAfter] = await db.select().from(challenges).where(eq(challenges.id, chShowcase.id));
    if (chShowcaseAfter.status !== "finished") {
      throw new Error(`Expected showcase_only challenge to transition to finished, got ${chShowcaseAfter.status}`);
    }
    const showcaseResults = await db.select().from(challengeResults).where(eq(challengeResults.challengeId, chShowcase.id));
    if (showcaseResults.length !== 0) {
      throw new Error(`Expected 0 community results for showcase_only, got ${showcaseResults.length}`);
    }

    console.log("✓ Test 12 Passed: Mode-specific submission lock branching (jury_only & showcase_only) verified.\n");

    // --------------------------------------------------------------------------
    // TEST 13: CONCURRENCY - MANUAL RESOLVE VS MANUAL RESOLVE
    // --------------------------------------------------------------------------
    console.log("-> [Test 13] Concurrency: Manual Resolve vs Manual Resolve on same challenge...");
    const [ch13] = await db
      .insert(challenges)
      .values({
        title: "Challenge 13 - Resolve Concurrency",
        slug: `ch13-${Date.now()}`,
        theme: "Theme",
        description: "Desc",
        promptRules: "Rules",
        status: "tie_pending",
        awardMode: "vote_only",
        createdByUserId: adminUser.id,
      })
      .returning();
    const sub13A = await createSubmission(ch13.id, artist1, prof1, "Art 13A");
    const sub13B = await createSubmission(ch13.id, artist2, prof2, "Art 13B");
    const [round13] = await db
      .insert(challengeVotingRounds)
      .values({ challengeId: ch13.id, roundType: "main", roundSequence: 1, status: "closed", deadline: pastDeadline })
      .returning();
    await db.insert(challengeVotingRoundCandidates).values([
      { votingRoundId: round13.id, submissionId: sub13A.id },
      { votingRoundId: round13.id, submissionId: sub13B.id },
    ]);
    const [b13] = await db.insert(challengeBallots).values({ challengeId: ch13.id, votingRoundId: round13.id, userId: voter1.id, roundType: "main", starsAllocated: 2, isFinalized: true }).returning();
    await db.insert(challengeBallotStars).values([
      { ballotId: b13.id, submissionId: sub13A.id, starsCount: 1 },
      { ballotId: b13.id, submissionId: sub13B.id, starsCount: 1 },
    ]);

    // Simulate concurrent manual resolution attempts (Admin picking 13A vs Mod picking 13B)
    const results13 = await Promise.allSettled([
      db.transaction(async (tx) => {
        return await resolveTieManuallyService(tx, adminCtx, {
          challengeId: ch13.id,
          submissionId: sub13A.id,
          reason: "Admin curator decision for 13A",
        });
      }),
      db.transaction(async (tx) => {
        return await resolveTieManuallyService(tx, modCtx, {
          challengeId: ch13.id,
          submissionId: sub13B.id,
          reason: "Mod curator decision for 13B",
        });
      }),
    ]);

    const successes13 = results13.filter((r) => r.status === "fulfilled");
    const rejections13 = results13.filter((r) => r.status === "rejected");
    if (successes13.length !== 1 || rejections13.length !== 1) {
      throw new Error(`Expected exactly 1 resolution to succeed and 1 to be rejected, got ${successes13.length} successes and ${rejections13.length} rejections`);
    }

    const res13 = await db.select().from(challengeResults).where(eq(challengeResults.challengeId, ch13.id));
    if (res13.length !== 1) {
      throw new Error(`Expected exactly 1 winner persisted in challenge_results, found ${res13.length}`);
    }
    console.log("✓ Test 13 Passed: Concurrent manual resolutions properly handled with FOR UPDATE locks.\n");

    // --------------------------------------------------------------------------
    // TEST 14: CONCURRENCY - MANUAL RESOLVE VS START TIEBREAK
    // --------------------------------------------------------------------------
    console.log("-> [Test 14] Concurrency: Manual Resolve vs Start Tiebreak on same challenge...");
    const [ch14] = await db
      .insert(challenges)
      .values({
        title: "Challenge 14 - Resolve vs Tiebreak Concurrency",
        slug: `ch14-${Date.now()}`,
        theme: "Theme",
        description: "Desc",
        promptRules: "Rules",
        status: "tie_pending",
        awardMode: "vote_only",
        createdByUserId: adminUser.id,
      })
      .returning();
    const sub14A = await createSubmission(ch14.id, artist1, prof1, "Art 14A");
    const sub14B = await createSubmission(ch14.id, artist2, prof2, "Art 14B");
    const [round14] = await db
      .insert(challengeVotingRounds)
      .values({ challengeId: ch14.id, roundType: "main", roundSequence: 1, status: "closed", deadline: pastDeadline })
      .returning();
    await db.insert(challengeVotingRoundCandidates).values([
      { votingRoundId: round14.id, submissionId: sub14A.id },
      { votingRoundId: round14.id, submissionId: sub14B.id },
    ]);
    const [b14] = await db.insert(challengeBallots).values({ challengeId: ch14.id, votingRoundId: round14.id, userId: voter1.id, roundType: "main", starsAllocated: 2, isFinalized: true }).returning();
    await db.insert(challengeBallotStars).values([
      { ballotId: b14.id, submissionId: sub14A.id, starsCount: 1 },
      { ballotId: b14.id, submissionId: sub14B.id, starsCount: 1 },
    ]);

    const results14 = await Promise.allSettled([
      db.transaction(async (tx) => {
        return await resolveTieManuallyService(tx, adminCtx, {
          challengeId: ch14.id,
          submissionId: sub14A.id,
          reason: "Admin curator decision for 14A",
        });
      }),
      db.transaction(async (tx) => {
        return await startTiebreakService(tx, modCtx, {
          challengeId: ch14.id,
        });
      }),
    ]);

    const successes14 = results14.filter((r) => r.status === "fulfilled");
    const rejections14 = results14.filter((r) => r.status === "rejected");
    if (successes14.length !== 1 || rejections14.length !== 1) {
      throw new Error(`Expected exactly 1 operation to succeed and 1 to be rejected, got ${successes14.length} successes and ${rejections14.length} rejections`);
    }
    console.log("✓ Test 14 Passed: Concurrent resolve vs tiebreak start handled cleanly.\n");

    // --------------------------------------------------------------------------
    // TEST 15: GENERIC PROTECTED LIFECYCLE TRANSITION BYPASS REJECTIONS
    // --------------------------------------------------------------------------
    console.log("-> [Test 15] Protected lifecycle transition bypass rejections...");
    const [ch15] = await db
      .insert(challenges)
      .values({
        title: "Challenge 15 - Protected Transitions",
        slug: `ch15-${Date.now()}`,
        theme: "Theme",
        description: "Desc",
        promptRules: "Rules",
        status: "submission_locked",
        awardMode: "vote_only",
        createdByUserId: adminUser.id,
      })
      .returning();

    // 1. Direct transition to voting_open -> rejected
    let votingOpenRejected = false;
    try {
      await transitionChallengeStatusService(db, adminCtx, ch15.id, "voting_open");
    } catch (err: any) {
      if (err.message.includes("Transisi langsung ke 'voting_open' dilarang")) {
        votingOpenRejected = true;
      }
    }
    if (!votingOpenRejected) throw new Error("Expected direct transition to voting_open to be blocked!");

    // 2. Direct transition to paused -> rejected
    let pausedRejected = false;
    try {
      await transitionChallengeStatusService(db, adminCtx, ch15.id, "paused" as any);
    } catch (err: any) {
      if (err.message.includes("telah dinonaktifkan")) {
        pausedRejected = true;
      }
    }
    if (!pausedRejected) throw new Error("Expected direct transition to paused to be blocked!");

    // 3. Direct transition to tie_pending -> rejected
    let tiePendingRejected = false;
    try {
      await transitionChallengeStatusService(db, adminCtx, ch15.id, "tie_pending");
    } catch (err: any) {
      if (err.message.includes("dilarang melalui aksi umum")) {
        tiePendingRejected = true;
      }
    }
    if (!tiePendingRejected) throw new Error("Expected direct transition to tie_pending to be blocked!");

    // 4. Direct transition to finished -> rejected
    let finishedRejected = false;
    try {
      await transitionChallengeStatusService(db, adminCtx, ch15.id, "finished");
    } catch (err: any) {
      if (err.message.includes("Transisi langsung ke 'finished' dilarang")) {
        finishedRejected = true;
      }
    }
    if (!finishedRejected) throw new Error("Expected direct transition to finished to be blocked!");

    console.log("✓ Test 15 Passed: Generic protected lifecycle bypass attempts strictly blocked.\n");

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
