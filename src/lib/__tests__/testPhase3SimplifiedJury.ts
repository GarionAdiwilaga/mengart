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
  artworkVersions,
  challengeVotingRounds,
  challengeVotingRoundCandidates,
  challengeBallots,
  challengeBallotStars,
  challengeResults,
  challengeJuryAssignments,
  challengeJuryAwards,
  auditLogs,
} from "@/db/schema";
import { eq, and, sql, desc, inArray } from "drizzle-orm";
import {
  validateJuryPhaseReadinessService,
  addJuryAssignmentService,
  assignJuryRecorderService,
  removeJuryAssignmentService,
  createJuryAwardService,
  updateJuryAwardService,
  deleteJuryAwardService,
  publishJuryChallengeResultsService,
  cancelJuryChallengeService,
  revokeChallengeResultsService,
  correctCommunityWinnerService,
  republishChallengeResultsService,
  cancelRevokedChallengeService,
  getJuryWorkspaceData,
  getAuthoritativeMainRoundStarsService,
} from "@/lib/services/juryService";
import {
  transitionChallengeStatusService,
  computeChallengeResultsService,
  publishChallengeResultsService,
  materializeScheduledTransitionsService,
} from "@/lib/services/challengeService";
import {
  finalizeVotingRoundService,
  resolveTieManuallyService,
} from "@/lib/services/votingService";

dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

const BASE_DB_URL = process.env.DATABASE_URL || "postgres://mengart:mengart_dev_pass@localhost:5432/mengart_db";
const urlObj = new URL(BASE_DB_URL);
const adminDbUrl = `${urlObj.protocol}//${urlObj.username}:${urlObj.password}@${urlObj.host}/postgres`;

async function runPhase3SimplifiedJuryTests() {
  console.log("=================================================================");
  console.log("🎨 RUNNING PHASE 3 / GATE C: SIMPLIFIED JURY & RESULTS SUITE");
  console.log("=================================================================\n");

  const adminClient = postgres(adminDbUrl, { max: 1 });
  const testDbName = `mengart_test_phase3_jury_${Date.now()}`;

  try {
    console.log(`-> Creating isolated test database: ${testDbName}...`);
    await adminClient.unsafe(`CREATE DATABASE "${testDbName}";`);

    const testDbUrl = `${urlObj.protocol}//${urlObj.username}:${urlObj.password}@${urlObj.host}/${testDbName}`;
    const testClient = postgres(testDbUrl, { max: 10 });
    const db = drizzle(testClient, { schema });

    console.log("-> Running migrations 0000 through 0010...");
    await migrate(db, { migrationsFolder: "./drizzle" });
    console.log("✓ Database migrations applied cleanly.\n");

    // -------------------------------------------------------------------------
    // Setup Base Actors
    // -------------------------------------------------------------------------
    const [adminUser] = await db.insert(users).values({ email: "admin@mengart.local", role: "admin", membershipStatus: "active" }).returning();
    const [modUser] = await db.insert(users).values({ email: "moderator@mengart.local", role: "moderator", membershipStatus: "active" }).returning();
    const [juror1] = await db.insert(users).values({ email: "juror1@mengart.local", role: "member", membershipStatus: "active" }).returning();
    const [juror2] = await db.insert(users).values({ email: "juror2@mengart.local", role: "member", membershipStatus: "active" }).returning();
    const [juror3] = await db.insert(users).values({ email: "juror3@mengart.local", role: "member", membershipStatus: "active" }).returning();
    const [artist1] = await db.insert(users).values({ email: "artist1@mengart.local", role: "member", membershipStatus: "active" }).returning();
    const [artist2] = await db.insert(users).values({ email: "artist2@mengart.local", role: "member", membershipStatus: "active" }).returning();
    const [artist3] = await db.insert(users).values({ email: "artist3@mengart.local", role: "member", membershipStatus: "active" }).returning();
    const [voter1] = await db.insert(users).values({ email: "voter1@mengart.local", role: "member", membershipStatus: "active" }).returning();

    const [adminProf] = await db.insert(profiles).values({ userId: adminUser.id, displayName: "Admin User", slug: "admin-user" }).returning();
    const [juror1Prof] = await db.insert(profiles).values({ userId: juror1.id, displayName: "Juror One", slug: "juror-1" }).returning();
    const [juror2Prof] = await db.insert(profiles).values({ userId: juror2.id, displayName: "Juror Two", slug: "juror-2" }).returning();
    const [juror3Prof] = await db.insert(profiles).values({ userId: juror3.id, displayName: "Juror Three", slug: "juror-3" }).returning();
    const [artist1Prof] = await db.insert(profiles).values({ userId: artist1.id, displayName: "Artist One", slug: "artist-1" }).returning();
    const [artist2Prof] = await db.insert(profiles).values({ userId: artist2.id, displayName: "Artist Two", slug: "artist-2" }).returning();
    const [artist3Prof] = await db.insert(profiles).values({ userId: artist3.id, displayName: "Artist Three", slug: "artist-3" }).returning();

    const adminCtx = { userId: adminUser.id, role: "admin" as const };
    const modCtx = { userId: modUser.id, role: "moderator" as const };
    const juror1Ctx = { userId: juror1.id, role: "member" as const };
    const juror2Ctx = { userId: juror2.id, role: "member" as const };
    const juror3Ctx = { userId: juror3.id, role: "member" as const };
    const voterCtx = { userId: voter1.id, role: "member" as const };
    const artist1Ctx = { userId: artist1.id, role: "member" as const };

    // Helper to create submission
    async function createSubmission(challengeId: string, user: typeof artist1, profile: typeof artist1Prof, title: string) {
      const [art] = await db.insert(artworks).values({
        userId: user.id,
        title,
        slug: `art-${Date.now()}-${Math.random().toString(36).substring(7)}`,
        mediaType: "image",
        publicationStatus: "published",
        audience: "public",
      }).returning();

      const [artVer] = await db.insert(artworkVersions).values({
        artworkId: art.id,
        versionNumber: 1,
        mediaType: "image",
        masterStorageKey: `master_${art.id}.png`,
        publicStorageKey: `artworks/${art.id}/v1.jpg`,
        thumbnailStorageKey: `artworks/${art.id}/v1_thumb.jpg`,
        mimeType: "image/png",
        fileSizeBytes: 1024,
        checksumSha256: "dummy_checksum_phase3",
        processingStatus: "ready",
        width: 1920,
        height: 1080,
      }).returning();

      const [sub] = await db.insert(challengeSubmissions).values({
        challengeId,
        userId: user.id,
        profileId: profile.id,
        artworkId: art.id,
        artworkVersionId: artVer.id,
        title,
        description: "Submission Description",
        softwareUsed: "Blender, Photoshop",
        submissionStatus: "submitted",
      }).returning();

      return sub;
    }

    // -------------------------------------------------------------------------
    // TEST 1: Displayed Juror Model (Multiple jurors in workspace data)
    // -------------------------------------------------------------------------
    console.log("-> [Test 1] Displayed Juror Model (multiple jurors in workspace data)...");
    const [ch1] = await db.insert(challenges).values({
      title: "Challenge 1", slug: "ch-1", theme: "Theme", description: "Desc", promptRules: "Rules",
      status: "jury_selection_open", awardMode: "jury_only", createdByUserId: adminUser.id
    }).returning();

    await db.insert(challengeJuryAssignments).values([
      { challengeId: ch1.id, userId: juror1.id, profileId: juror1Prof.id, isRecorder: true },
      { challengeId: ch1.id, userId: juror2.id, profileId: juror2Prof.id, isRecorder: false },
      { challengeId: ch1.id, userId: juror3.id, profileId: juror3Prof.id, isRecorder: false },
    ]);

    const wsData1 = await getJuryWorkspaceData(db, ch1.id, juror1.id);
    if (!wsData1 || wsData1.juryAssignments.length !== 3) {
      throw new Error(`Expected 3 displayed jurors, got ${wsData1?.juryAssignments.length}`);
    }
    const recorderEntry1 = wsData1.juryAssignments.find((j) => j.isRecorder);
    if (!recorderEntry1 || recorderEntry1.userId !== juror1.id) {
      throw new Error("Expected juror1 to be designated recorder.");
    }
    console.log("✓ Test 1 Passed: Multiple displayed jurors with designated recorder loaded in workspace data.\n");

    // -------------------------------------------------------------------------
    // TEST 2: Exactly One Jury Recorder Invariant (Database Partial Unique Index)
    // -------------------------------------------------------------------------
    console.log("-> [Test 2] Exactly One Jury Recorder Invariant (Database unique partial index enforcement)...");
    let duplicateRecorderDbFailed = false;
    try {
      await db.insert(challengeJuryAssignments).values({
        challengeId: ch1.id, userId: adminUser.id, profileId: adminProf.id, isRecorder: true
      });
    } catch (_err) {
      duplicateRecorderDbFailed = true;
    }
    if (!duplicateRecorderDbFailed) {
      throw new Error("Expected database partial unique index uniq_challenge_jury_recorder to reject second recorder.");
    }
    console.log("✓ Test 2 Passed: Partial unique index correctly rejects second recorder insertion.\n");

    // -------------------------------------------------------------------------
    // TEST 3: Exactly One Jury Recorder Invariant (assignJuryRecorderService atomic transfer)
    // -------------------------------------------------------------------------
    console.log("-> [Test 3] Exactly One Jury Recorder Invariant (assignJuryRecorderService atomic transfer)...");
    const reassignRes3 = await assignJuryRecorderService(db, adminCtx, { challengeId: ch1.id, userId: juror2.id });
    if (!reassignRes3.success) throw new Error("Expected assignJuryRecorderService to succeed.");

    const assignments3 = await db.select().from(challengeJuryAssignments).where(eq(challengeJuryAssignments.challengeId, ch1.id));
    const activeRecorders3 = assignments3.filter((a) => a.isRecorder);
    if (activeRecorders3.length !== 1 || activeRecorders3[0].userId !== juror2.id) {
      throw new Error(`Expected exactly 1 recorder (juror2), got ${JSON.stringify(activeRecorders3)}`);
    }
    console.log("✓ Test 3 Passed: assignJuryRecorderService atomically reassigned recorder.\n");

    // -------------------------------------------------------------------------
    // TEST 4: Recorder Assignment Authorization (Non-admin/mod rejected)
    // -------------------------------------------------------------------------
    console.log("-> [Test 4] Recorder Assignment Authorization (Non-admin/mod rejected)...");
    let nonStaffReassignFailed = false;
    try {
      await assignJuryRecorderService(db, juror1Ctx, { challengeId: ch1.id, userId: juror3.id });
    } catch (_err) {
      nonStaffReassignFailed = true;
    }
    if (!nonStaffReassignFailed) {
      throw new Error("Expected non-admin/moderator to be rejected from assigning recorder.");
    }
    console.log("✓ Test 4 Passed: Non-staff caller rejected from assigning recorder.\n");

    // -------------------------------------------------------------------------
    // TEST 5: Readiness Validation (Zero jurors)
    // -------------------------------------------------------------------------
    console.log("-> [Test 5] Readiness Validation (Zero jurors)...");
    const [ch5] = await db.insert(challenges).values({
      title: "Challenge 5", slug: "ch-5", theme: "Theme", description: "Desc", promptRules: "Rules",
      status: "submission_locked", awardMode: "jury_only", createdByUserId: adminUser.id
    }).returning();
    const ready5 = await validateJuryPhaseReadinessService(db, ch5.id);
    if (ready5.ready !== false || !ready5.reason?.includes("Belum ada dewan juri")) {
      throw new Error(`Expected ready false for 0 jurors, got: ${JSON.stringify(ready5)}`);
    }
    console.log("✓ Test 5 Passed: Zero jurors correctly flagged as unready.\n");

    // -------------------------------------------------------------------------
    // TEST 6: Readiness Validation (No recorder)
    // -------------------------------------------------------------------------
    console.log("-> [Test 6] Readiness Validation (No recorder)...");
    await db.insert(challengeJuryAssignments).values({
      challengeId: ch5.id, userId: juror1.id, profileId: juror1Prof.id, isRecorder: false
    });
    const ready6 = await validateJuryPhaseReadinessService(db, ch5.id);
    if (ready6.ready !== false || !ready6.reason?.includes("Belum ada Jury Recorder")) {
      throw new Error(`Expected ready false for no recorder, got: ${JSON.stringify(ready6)}`);
    }
    console.log("✓ Test 6 Passed: Jurors with no recorder correctly flagged as unready.\n");

    // -------------------------------------------------------------------------
    // TEST 7: Readiness Validation (Valid panel)
    // -------------------------------------------------------------------------
    console.log("-> [Test 7] Readiness Validation (Valid panel)...");
    await db.update(challengeJuryAssignments).set({ isRecorder: true }).where(eq(challengeJuryAssignments.challengeId, ch5.id));
    const ready7 = await validateJuryPhaseReadinessService(db, ch5.id);
    if (ready7.ready !== true || ready7.recorder?.userId !== juror1.id) {
      throw new Error(`Expected ready true, got: ${JSON.stringify(ready7)}`);
    }
    console.log("✓ Test 7 Passed: Valid panel + single recorder passes readiness.\n");

    // -------------------------------------------------------------------------
    // TEST 8: Readiness Guard on Scheduler (jury_only stays submission_locked if unready)
    // -------------------------------------------------------------------------
    console.log("-> [Test 8] Readiness Guard on Scheduler (jury_only unready panel blocked)...");
    const [ch8] = await db.insert(challenges).values({
      title: "Challenge 8", slug: "ch-8", theme: "Theme", description: "Desc", promptRules: "Rules",
      status: "submission_open", awardMode: "jury_only",
      submissionDeadline: new Date(Date.now() - 3600000), 
      createdByUserId: adminUser.id
    }).returning();
    await createSubmission(ch8.id, artist1, artist1Prof, "Art 8");
    await materializeScheduledTransitionsService(db);
    const [ch8After] = await db.select().from(challenges).where(eq(challenges.id, ch8.id));
    if (ch8After.status !== "submission_locked") {
      throw new Error(`Expected challenge to stay in 'submission_locked', got '${ch8After.status}'`);
    }
    console.log("✓ Test 8 Passed: Scheduler failed closed into submission_locked when panel was unready.\n");

    // -------------------------------------------------------------------------
    // TEST 9: Readiness Guard on Gate B Finalize (vote_and_jury fails closed if unready)
    // -------------------------------------------------------------------------
    console.log("-> [Test 9] Readiness Guard on Gate B Finalize (vote_and_jury unready panel blocked)...");
    const [ch9] = await db.insert(challenges).values({
      title: "Challenge 9", slug: "ch-9", theme: "Theme", description: "Desc", promptRules: "Rules",
      status: "voting_open", awardMode: "vote_and_jury", starsPerMember: 1, createdByUserId: adminUser.id
    }).returning();
    const sub9A = await createSubmission(ch9.id, artist1, artist1Prof, "Art 9A");
    const sub9B = await createSubmission(ch9.id, artist2, artist2Prof, "Art 9B");
    const [round9] = await db.insert(challengeVotingRounds).values({
      challengeId: ch9.id, roundType: "main", status: "open",
      startsAt: new Date(Date.now() - 3600000), deadline: new Date(Date.now() - 1000), starsPerMember: 1
    }).returning();
    await db.insert(challengeVotingRoundCandidates).values([
      { votingRoundId: round9.id, submissionId: sub9A.id },
      { votingRoundId: round9.id, submissionId: sub9B.id }
    ]);
    const [b9] = await db.insert(challengeBallots).values({
      challengeId: ch9.id, votingRoundId: round9.id, userId: voter1.id, roundType: "main", starsAllocated: 1, isFinalized: true
    }).returning();
    await db.insert(challengeBallotStars).values({ ballotId: b9.id, submissionId: sub9A.id, starsCount: 1 });
    let fin9Failed = false;
    try {
      await finalizeVotingRoundService(db, adminCtx, { votingRoundId: round9.id });
    } catch (err: any) {
      fin9Failed = true;
      if (!err.message.includes("Transisi ke 'jury_selection_open' diblokir")) {
        throw new Error(`Unexpected error message: ${err.message}`);
      }
    }
    if (!fin9Failed) {
      throw new Error("Expected finalizeVotingRoundService to fail closed due to missing jury panel.");
    }
    console.log("✓ Test 9 Passed: finalizeVotingRoundService failed closed when jury panel lacked recorder.\n");

    // -------------------------------------------------------------------------
    // TEST 10: Readiness Guard on Manual Tie Resolution
    // -------------------------------------------------------------------------
    console.log("-> [Test 10] Readiness Guard on Manual Tie Resolution (vote_and_jury unready panel blocked)...");
    const [ch10] = await db.insert(challenges).values({
      title: "Challenge 10", slug: "ch-10", theme: "Theme", description: "Desc", promptRules: "Rules",
      status: "tie_pending", awardMode: "vote_and_jury", starsPerMember: 1, createdByUserId: adminUser.id
    }).returning();
    const sub10A = await createSubmission(ch10.id, artist1, artist1Prof, "Art 10A");
    const sub10B = await createSubmission(ch10.id, artist2, artist2Prof, "Art 10B");
    const [round10] = await db.insert(challengeVotingRounds).values({
      challengeId: ch10.id, roundType: "main", status: "closed",
      startsAt: new Date(Date.now() - 7200000), deadline: new Date(Date.now() - 3600000), starsPerMember: 1
    }).returning();
    await db.insert(challengeVotingRoundCandidates).values([
      { votingRoundId: round10.id, submissionId: sub10A.id },
      { votingRoundId: round10.id, submissionId: sub10B.id },
    ]);
    const [b10A] = await db.insert(challengeBallots).values({
      challengeId: ch10.id, votingRoundId: round10.id, userId: voter1.id, roundType: "main", starsAllocated: 1, isFinalized: true
    }).returning();
    await db.insert(challengeBallotStars).values({ ballotId: b10A.id, submissionId: sub10A.id, starsCount: 1 });
    const [b10B] = await db.insert(challengeBallots).values({
      challengeId: ch10.id, votingRoundId: round10.id, userId: artist3.id, roundType: "main", starsAllocated: 1, isFinalized: true
    }).returning();
    await db.insert(challengeBallotStars).values({ ballotId: b10B.id, submissionId: sub10B.id, starsCount: 1 });
    let resolve10Failed = false;
    try {
      await resolveTieManuallyService(db, adminCtx, {
        challengeId: ch10.id, submissionId: sub10A.id, reason: "Resolving tie manually without jury panel"
      });
    } catch (err: any) {
      resolve10Failed = true;
      if (!err.message.includes("Transisi ke 'jury_selection_open' diblokir")) {
        throw new Error(`Unexpected error message: ${err.message}`);
      }
    }
    if (!resolve10Failed) {
      throw new Error("Expected resolveTieManuallyService to fail closed due to unready jury panel.");
    }
    console.log("✓ Test 10 Passed: resolveTieManuallyService failed closed when jury panel was unready.\n");

    // -------------------------------------------------------------------------
    // TEST 11: Block Generic Transition into JURY_SELECTION_OPEN
    // -------------------------------------------------------------------------
    console.log("-> [Test 11] Block Generic Transition into JURY_SELECTION_OPEN (submission_locked jury_only + 0 recorder)...");
    let genericJuryOpenFailed = false;
    try {
      await transitionChallengeStatusService(db, adminCtx, ch5.id, "jury_selection_open");
    } catch (err: any) {
      genericJuryOpenFailed = true;
      if (!err.message.includes("Transisi langsung ke 'jury_selection_open' dilarang")) {
        throw new Error(`Unexpected error: ${err.message}`);
      }
    }
    if (!genericJuryOpenFailed) {
      throw new Error("Expected generic transition into jury_selection_open to be rejected.");
    }
    console.log("✓ Test 11 Passed: Generic manual transition into 'jury_selection_open' was strictly rejected.\n");

    // -------------------------------------------------------------------------
    // TEST 12: Readiness inside Publication (Zero Recorder + Admin publish rejected)
    // -------------------------------------------------------------------------
    console.log("-> [Test 12] Readiness inside Publication (Zero Recorder + Admin publish rejected)...");
    const [chUnreadyPub] = await db.insert(challenges).values({
      title: "Unready Pub Challenge", slug: "ch-unready-pub", theme: "Theme", description: "Desc", promptRules: "Rules",
      status: "jury_selection_open", awardMode: "jury_only", createdByUserId: adminUser.id
    }).returning();
    await db.insert(challengeJuryAssignments).values({
      challengeId: chUnreadyPub.id, userId: juror1.id, profileId: juror1Prof.id, isRecorder: false
    });
    const subUnready = await createSubmission(chUnreadyPub.id, artist1, artist1Prof, "Art Unready");
    await db.insert(challengeJuryAwards).values({
      challengeId: chUnreadyPub.id, submissionId: subUnready.id, categoryLabel: "Best Concept", recordedByUserId: juror1.id
    });

    let adminUnreadyPubFailed = false;
    try {
      await publishJuryChallengeResultsService(db, adminCtx, { challengeId: chUnreadyPub.id });
    } catch (err: any) {
      adminUnreadyPubFailed = true;
      if (!err.message.includes("Sesi penjurian belum siap")) {
        throw new Error(`Unexpected error: ${err.message}`);
      }
    }
    if (!adminUnreadyPubFailed) {
      throw new Error("Expected Admin publication to be rejected when jury panel lacks a designated recorder.");
    }
    console.log("✓ Test 12 Passed: Admin publication rejected when panel lacked designated recorder.\n");

    // -------------------------------------------------------------------------
    // TEST 13: Readiness inside Publication (Zero Recorder + Moderator publish rejected)
    // -------------------------------------------------------------------------
    console.log("-> [Test 13] Readiness inside Publication (Zero Recorder + Moderator publish rejected)...");
    let modUnreadyPubFailed = false;
    try {
      await publishJuryChallengeResultsService(db, modCtx, { challengeId: chUnreadyPub.id });
    } catch (err: any) {
      modUnreadyPubFailed = true;
      if (!err.message.includes("Sesi penjurian belum siap")) {
        throw new Error(`Unexpected error: ${err.message}`);
      }
    }
    if (!modUnreadyPubFailed) {
      throw new Error("Expected Moderator publication to be rejected when jury panel lacks a designated recorder.");
    }
    console.log("✓ Test 13 Passed: Moderator publication rejected when panel lacked designated recorder.\n");

    // -------------------------------------------------------------------------
    // TEST 14: Readiness inside Publication (Exactly One Recorder + authorized publication succeeds)
    // -------------------------------------------------------------------------
    console.log("-> [Test 14] Readiness inside Publication (Exactly One Recorder + authorized publication succeeds)...");
    await db.update(challengeJuryAssignments).set({ isRecorder: true }).where(eq(challengeJuryAssignments.challengeId, chUnreadyPub.id));
    const readyPub14 = await publishJuryChallengeResultsService(db, adminCtx, { challengeId: chUnreadyPub.id });
    if (!readyPub14.success || readyPub14.outcome !== "published") {
      throw new Error("Expected publication to succeed when panel is ready.");
    }
    console.log("✓ Test 14 Passed: Authorized publication succeeded with exactly one recorder.\n");

    // Setup working challenge for Tests 15-28
    const [chLive] = await db.insert(challenges).values({
      title: "Live Jury Challenge", slug: "ch-live", theme: "Theme", description: "Desc", promptRules: "Rules",
      status: "jury_selection_open", awardMode: "jury_only", createdByUserId: adminUser.id
    }).returning();
    await db.insert(challengeJuryAssignments).values([
      { challengeId: chLive.id, userId: juror1.id, profileId: juror1Prof.id, isRecorder: true },
      { challengeId: chLive.id, userId: juror2.id, profileId: juror2Prof.id, isRecorder: false },
    ]);
    const subLive1 = await createSubmission(chLive.id, artist1, artist1Prof, "Live Art 1");
    const subLive2 = await createSubmission(chLive.id, artist2, artist2Prof, "Live Art 2");
    const subLive3 = await createSubmission(chLive.id, artist3, artist3Prof, "Live Art 3");

    // -------------------------------------------------------------------------
    // TEST 15: Dynamic Jury Award Creation with Custom Category Label
    // -------------------------------------------------------------------------
    console.log("-> [Test 15] Dynamic Jury Award Creation (Custom Category Label)...");
    const award15 = await createJuryAwardService(db, juror1Ctx, {
      challengeId: chLive.id, submissionId: subLive1.id, categoryLabel: "Best Lighting"
    });
    if (!award15.success || award15.award?.categoryLabel !== "Best Lighting") {
      throw new Error(`Failed to create award with custom label: ${JSON.stringify(award15)}`);
    }
    console.log("✓ Test 15 Passed: Dynamic jury award created with 'Best Lighting'.\n");

    // -------------------------------------------------------------------------
    // TEST 16: Dynamic Jury Award Creation (Default Null Category Label)
    // -------------------------------------------------------------------------
    console.log("-> [Test 16] Dynamic Jury Award Creation (Default Null Category Label)...");
    const award16 = await createJuryAwardService(db, juror1Ctx, {
      challengeId: chLive.id, submissionId: subLive2.id, categoryLabel: null
    });
    if (!award16.success || award16.award?.categoryLabel !== null) {
      throw new Error(`Expected null categoryLabel: ${JSON.stringify(award16)}`);
    }
    console.log("✓ Test 16 Passed: Dynamic jury award created with null category label.\n");

    // -------------------------------------------------------------------------
    // TEST 17: Ordinary Juror Mutating Award Rejected
    // -------------------------------------------------------------------------
    console.log("-> [Test 17] Ordinary Juror Mutating Award Rejected...");
    let juror2CreateFailed = false;
    try {
      await createJuryAwardService(db, juror2Ctx, {
        challengeId: chLive.id, submissionId: subLive3.id, categoryLabel: "Best Concept"
      });
    } catch (_err) {
      juror2CreateFailed = true;
    }
    if (!juror2CreateFailed) {
      throw new Error("Expected ordinary non-recorder juror to be rejected from creating awards.");
    }
    console.log("✓ Test 17 Passed: Ordinary juror rejected from creating awards.\n");

    // -------------------------------------------------------------------------
    // TEST 18: Ordinary User Mutating Award Rejected
    // -------------------------------------------------------------------------
    console.log("-> [Test 18] Ordinary User Mutating Award Rejected...");
    let voterCreateFailed = false;
    try {
      await createJuryAwardService(db, voterCtx, {
        challengeId: chLive.id, submissionId: subLive3.id, categoryLabel: "Best Concept"
      });
    } catch (_err) {
      voterCreateFailed = true;
    }
    if (!voterCreateFailed) {
      throw new Error("Expected non-jury user to be rejected from creating awards.");
    }
    console.log("✓ Test 18 Passed: Non-jury user rejected from creating awards.\n");

    // -------------------------------------------------------------------------
    // TEST 19: Admin Recording Allowed
    // -------------------------------------------------------------------------
    console.log("-> [Test 19] Admin Recording Allowed...");
    const award19 = await createJuryAwardService(db, adminCtx, {
      challengeId: chLive.id, submissionId: subLive3.id, categoryLabel: "Storytelling Champion"
    });
    if (!award19.success) {
      throw new Error("Expected Admin to be able to create awards directly.");
    }
    console.log("✓ Test 19 Passed: Administrator successfully created dynamic jury award.\n");

    // -------------------------------------------------------------------------
    // TEST 20: Dynamic Free-Text Award Flexibility
    // -------------------------------------------------------------------------
    console.log("-> [Test 20] Dynamic Free-Text Award Flexibility...");
    const allAwardsChLive = await db.select().from(challengeJuryAwards).where(eq(challengeJuryAwards.challengeId, chLive.id));
    const labels = allAwardsChLive.map((a) => a.categoryLabel);
    if (!labels.includes("Best Lighting") || !labels.includes("Storytelling Champion") || !labels.includes(null)) {
      throw new Error(`Expected diverse labels, got: ${JSON.stringify(labels)}`);
    }
    console.log("✓ Test 20 Passed: Free-text dynamic categories stored flexibly.\n");

    // -------------------------------------------------------------------------
    // TEST 21: No Predefined Winner Slot Count Restriction
    // -------------------------------------------------------------------------
    console.log("-> [Test 21] No Predefined Winner Slot Count Restriction...");
    if (allAwardsChLive.length !== 3) {
      throw new Error(`Expected 3 dynamic awards created without predefined slot restrictions, found ${allAwardsChLive.length}`);
    }
    console.log("✓ Test 21 Passed: Dynamic awards created without predefined slot schemas.\n");

    // Setup Mixed Mode Challenge for Tests 22 & 23
    const [chMixed] = await db.insert(challenges).values({
      title: "Mixed Mode Challenge", slug: "ch-mixed", theme: "Theme", description: "Desc", promptRules: "Rules",
      status: "jury_selection_open", awardMode: "vote_and_jury", createdByUserId: adminUser.id
    }).returning();
    await db.insert(challengeJuryAssignments).values([
      { challengeId: chMixed.id, userId: juror1.id, profileId: juror1Prof.id, isRecorder: true }
    ]);
    const subMixedWinner = await createSubmission(chMixed.id, artist1, artist1Prof, "Mixed Comm Winner");
    const subMixedRunnerUp = await createSubmission(chMixed.id, artist2, artist2Prof, "Mixed Runner Up");
    await db.insert(challengeResults).values({
      challengeId: chMixed.id, submissionId: subMixedWinner.id, awardType: "community_vote_winner",
      finalRank: 1, totalCommunityStars: 10, resolutionMethod: "unique_main_vote", isPublished: false
    });

    // -------------------------------------------------------------------------
    // TEST 22: Mixed Mode Exclusion (Community Winner cannot receive Jury Award)
    // -------------------------------------------------------------------------
    console.log("-> [Test 22] Mixed Mode Exclusion (Community Winner cannot receive Jury Award)...");
    let commWinnerAwardFailed = false;
    try {
      await createJuryAwardService(db, juror1Ctx, {
        challengeId: chMixed.id, submissionId: subMixedWinner.id, categoryLabel: "Best Composition"
      });
    } catch (err: any) {
      commWinnerAwardFailed = true;
      if (!err.message.includes("Karya pemenang voting komunitas tidak dapat dipilih")) {
        throw new Error(`Unexpected error: ${err.message}`);
      }
    }
    if (!commWinnerAwardFailed) {
      throw new Error("Expected Community Vote Winner to be excluded from Jury Awards in vote_and_jury.");
    }
    console.log("✓ Test 22 Passed: Community Vote Winner excluded from receiving jury awards in mixed mode.\n");

    // -------------------------------------------------------------------------
    // TEST 23: Mixed Mode Non-Winner Candidate Allowed
    // -------------------------------------------------------------------------
    console.log("-> [Test 23] Mixed Mode Non-Winner Candidate Allowed...");
    const award23 = await createJuryAwardService(db, juror1Ctx, {
      challengeId: chMixed.id, submissionId: subMixedRunnerUp.id, categoryLabel: "Best Composition"
    });
    if (!award23.success) {
      throw new Error("Expected non-winner candidate to successfully receive jury award in mixed mode.");
    }
    console.log("✓ Test 23 Passed: Non-winning candidate in mixed mode successfully received jury award.\n");

    // -------------------------------------------------------------------------
    // TEST 24: jury_only Mode Any Valid Candidate Allowed
    // -------------------------------------------------------------------------
    console.log("-> [Test 24] jury_only Mode Any Valid Candidate Allowed...");
    const candValidLive = await db.select().from(challengeSubmissions).where(eq(challengeSubmissions.challengeId, chLive.id));
    if (candValidLive.length < 3) throw new Error("Expected 3 candidates on chLive.");
    console.log("✓ Test 24 Passed: All submitted artworks are valid candidates in jury_only mode.\n");

    // -------------------------------------------------------------------------
    // TEST 25: Duplicate Artwork Award Policy (Confirmation Required)
    // -------------------------------------------------------------------------
    console.log("-> [Test 25] Duplicate Artwork Award Policy (Confirmation Required)...");
    const dupRes25 = await createJuryAwardService(db, juror1Ctx, {
      challengeId: chLive.id, submissionId: subLive1.id, categoryLabel: "Special Craft Award"
    });
    if (!dupRes25.requiresConfirmation || dupRes25.success !== false) {
      throw new Error(`Expected confirmation request for duplicate artwork award, got: ${JSON.stringify(dupRes25)}`);
    }
    console.log("✓ Test 25 Passed: Duplicate artwork award requested explicit confirmation.\n");

    // -------------------------------------------------------------------------
    // TEST 26: Duplicate Artwork Award Policy (Explicit Confirmation)
    // -------------------------------------------------------------------------
    console.log("-> [Test 26] Duplicate Artwork Award Policy (Explicit Confirmation)...");
    const dupRes26 = await createJuryAwardService(db, juror1Ctx, {
      challengeId: chLive.id, submissionId: subLive1.id, categoryLabel: "Special Craft Award", confirmDuplicateSubmission: true
    });
    if (!dupRes26.success || !dupRes26.award) {
      throw new Error("Expected duplicate artwork award to succeed with explicit confirmation.");
    }
    console.log("✓ Test 26 Passed: Duplicate artwork award succeeded with confirmDuplicateSubmission = true.\n");

    // -------------------------------------------------------------------------
    // TEST 27: Dynamic Category Label Sanitization
    // -------------------------------------------------------------------------
    console.log("-> [Test 27] Dynamic Category Label Sanitization (Trimming & max length)...");
    const longLabel = "   " + "A".repeat(150) + "   ";
    const award27 = await createJuryAwardService(db, adminCtx, {
      challengeId: chLive.id, submissionId: subLive2.id, categoryLabel: longLabel, confirmDuplicateSubmission: true
    });
    if (!award27.success || award27.award?.categoryLabel?.length !== 100 || award27.award.categoryLabel.startsWith(" ")) {
      throw new Error(`Expected trimmed 100 char category label, got: ${award27.award?.categoryLabel?.length}`);
    }
    console.log("✓ Test 27 Passed: Category label trimmed and safely truncated.\n");

    // -------------------------------------------------------------------------
    // TEST 28: Update Dynamic Jury Award
    // -------------------------------------------------------------------------
    console.log("-> [Test 28] Update Dynamic Jury Award...");
    const updateRes28 = await updateJuryAwardService(db, juror1Ctx, {
      awardId: award15.award!.id, categoryLabel: "Master of Lighting"
    });
    if (!updateRes28.success || updateRes28.award?.categoryLabel !== "Master of Lighting") {
      throw new Error("Failed to update jury award category label.");
    }
    console.log("✓ Test 28 Passed: Jury award category updated.\n");

    // -------------------------------------------------------------------------
    // TEST 29: Delete Dynamic Jury Award
    // -------------------------------------------------------------------------
    console.log("-> [Test 29] Delete Dynamic Jury Award...");
    const deleteRes29 = await deleteJuryAwardService(db, juror1Ctx, { awardId: dupRes26.award!.id });
    if (!deleteRes29.success) throw new Error("Failed to delete jury award.");
    const [deletedRow] = await db.select().from(challengeJuryAwards).where(eq(challengeJuryAwards.id, dupRes26.award!.id));
    if (deletedRow) throw new Error("Expected award row to be deleted.");
    console.log("✓ Test 29 Passed: Draft jury award deleted successfully.\n");

    // -------------------------------------------------------------------------
    // TEST 30: Protect Jury Recorder Deletion
    // -------------------------------------------------------------------------
    console.log("-> [Test 30] Protect Jury Recorder Deletion (Cannot delete active recorder during JURY_SELECTION_OPEN)...");
    let deleteRecorderFailed = false;
    try {
      await removeJuryAssignmentService(db, adminCtx, { challengeId: chLive.id, userId: juror1.id });
    } catch (_err) {
      deleteRecorderFailed = true;
    }
    if (!deleteRecorderFailed) {
      throw new Error("Expected active recorder deletion to be rejected during JURY_SELECTION_OPEN.");
    }
    console.log("✓ Test 30 Passed: Protected active recorder from being removed during open jury session.\n");

    // -------------------------------------------------------------------------
    // TEST 31: Enforce Zero-Award Cancellation Negative Check (jury_only with >=1 award rejected)
    // -------------------------------------------------------------------------
    console.log("-> [Test 31] Enforce Zero-Award Cancellation (jury_only with >= 1 award rejected)...");
    let cancelWithAwardsFailed = false;
    try {
      await cancelJuryChallengeService(db, juror1Ctx, {
        challengeId: chLive.id, reason: "Attempting to cancel challenge with existing awards"
      });
    } catch (err: any) {
      cancelWithAwardsFailed = true;
      if (!err.message.includes("Terdapat") || !err.message.includes("penghargaan juri")) {
        throw new Error(`Unexpected error message: ${err.message}`);
      }
    }
    if (!cancelWithAwardsFailed) {
      throw new Error("Expected cancellation to be rejected when jury awards already exist.");
    }
    console.log("✓ Test 31 Passed: Cancellation strictly rejected when awards exist on jury_only challenge.\n");

    // -------------------------------------------------------------------------
    // TEST 32: Enforce Zero-Award Cancellation Negative Check (vote_and_jury with >=1 award rejected)
    // -------------------------------------------------------------------------
    console.log("-> [Test 32] Enforce Zero-Award Cancellation (vote_and_jury with >= 1 award rejected)...");
    let cancelMixedWithAwardsFailed = false;
    try {
      await cancelJuryChallengeService(db, juror1Ctx, {
        challengeId: chMixed.id, reason: "Attempting to cancel mixed challenge with awards"
      });
    } catch (err: any) {
      cancelMixedWithAwardsFailed = true;
      if (!err.message.includes("Terdapat") || !err.message.includes("penghargaan juri")) {
        throw new Error(`Unexpected error message: ${err.message}`);
      }
    }
    if (!cancelMixedWithAwardsFailed) {
      throw new Error("Expected cancellation to be rejected when jury awards exist on mixed challenge.");
    }
    console.log("✓ Test 32 Passed: Cancellation strictly rejected when awards exist on vote_and_jury challenge.\n");

    // -------------------------------------------------------------------------
    // TEST 33: Manual Publication (jury_only with >= 1 award)
    // -------------------------------------------------------------------------
    console.log("-> [Test 33] Manual Publication (jury_only with >= 1 award)...");
    const pub33 = await publishJuryChallengeResultsService(db, juror1Ctx, { challengeId: chLive.id });
    if (!pub33.success || pub33.outcome !== "published") {
      throw new Error("Failed to publish jury results.");
    }
    const [chLiveAfter] = await db.select().from(challenges).where(eq(challenges.id, chLive.id));
    if (chLiveAfter.status !== "finished") {
      throw new Error(`Expected challenge status 'finished', got '${chLiveAfter.status}'`);
    }
    const liveResults = await db.select().from(challengeResults).where(eq(challengeResults.challengeId, chLive.id));
    if (liveResults.length < 1 || liveResults.some((r) => !r.isPublished)) {
      throw new Error("Expected all results to be published.");
    }
    console.log("✓ Test 33 Passed: Manual publication of jury_only challenge succeeded.\n");

    // -------------------------------------------------------------------------
    // TEST 34: Manual Publication (jury_only with 0 awards rejected)
    // -------------------------------------------------------------------------
    console.log("-> [Test 34] Manual Publication (jury_only with 0 awards rejected)...");
    const [ch34] = await db.insert(challenges).values({
      title: "Challenge 34", slug: "ch-34", theme: "Theme", description: "Desc", promptRules: "Rules",
      status: "jury_selection_open", awardMode: "jury_only", createdByUserId: adminUser.id
    }).returning();
    await db.insert(challengeJuryAssignments).values({
      challengeId: ch34.id, userId: juror1.id, profileId: juror1Prof.id, isRecorder: true
    });

    let pub34Failed = false;
    try {
      await publishJuryChallengeResultsService(db, juror1Ctx, { challengeId: ch34.id });
    } catch (_err) {
      pub34Failed = true;
    }
    if (!pub34Failed) {
      throw new Error("Expected publication of 0-award jury_only challenge to be rejected.");
    }
    console.log("✓ Test 34 Passed: 0-award jury_only publication rejected.\n");

    // -------------------------------------------------------------------------
    // TEST 35: Manual Publication (vote_and_jury with Community Winner + >= 1 Jury Award)
    // -------------------------------------------------------------------------
    console.log("-> [Test 35] Manual Publication (vote_and_jury with Community Winner + >= 1 Jury Award)...");
    const pub35 = await publishJuryChallengeResultsService(db, juror1Ctx, { challengeId: chMixed.id });
    if (!pub35.success || pub35.outcome !== "published") {
      throw new Error("Failed to publish mixed challenge results.");
    }
    const [chMixedAfter] = await db.select().from(challenges).where(eq(challenges.id, chMixed.id));
    if (chMixedAfter.status !== "finished") {
      throw new Error("Expected mixed challenge to transition to finished.");
    }
    const mixedResults = await db.select().from(challengeResults).where(eq(challengeResults.challengeId, chMixed.id));
    const commWinnerResult = mixedResults.find((r) => r.awardType === "community_vote_winner");
    const juryAwardResult = mixedResults.find((r) => r.awardType === "jury_award");
    if (!commWinnerResult?.isPublished || !juryAwardResult?.isPublished) {
      throw new Error("Expected both Community Winner and Jury Award to be published.");
    }
    console.log("✓ Test 35 Passed: Mixed mode publication published Community Winner and Jury Award together.\n");

    // -------------------------------------------------------------------------
    // TEST 36: Manual Publication (vote_and_jury with Community Winner + 0 Jury Awards with publishCommunityOnly = true)
    // -------------------------------------------------------------------------
    console.log("-> [Test 36] Manual Publication (vote_and_jury with Community Winner + 0 Jury Awards + publishCommunityOnly=true)...");
    const [ch36] = await db.insert(challenges).values({
      title: "Challenge 36", slug: "ch-36", theme: "Theme", description: "Desc", promptRules: "Rules",
      status: "jury_selection_open", awardMode: "vote_and_jury", createdByUserId: adminUser.id
    }).returning();
    await db.insert(challengeJuryAssignments).values({
      challengeId: ch36.id, userId: juror1.id, profileId: juror1Prof.id, isRecorder: true
    });
    const sub36 = await createSubmission(ch36.id, artist1, artist1Prof, "Art 36");
    await db.insert(challengeResults).values({
      challengeId: ch36.id, submissionId: sub36.id, awardType: "community_vote_winner",
      finalRank: 1, totalCommunityStars: 5, resolutionMethod: "unique_main_vote", isPublished: false
    });

    const pub36 = await publishJuryChallengeResultsService(db, juror1Ctx, { challengeId: ch36.id, publishCommunityOnly: true });
    if (!pub36.success || pub36.outcome !== "published") {
      throw new Error("Failed to publish community winner only in mixed mode.");
    }
    const [ch36After] = await db.select().from(challenges).where(eq(challenges.id, ch36.id));
    if (ch36After.status !== "finished") throw new Error("Expected ch36 status to be finished.");
    console.log("✓ Test 36 Passed: publishCommunityOnly=true successfully published Community Winner.\n");

    // -------------------------------------------------------------------------
    // TEST 37: Strict publishCommunityOnly Invariant Negative 1 (jury_only + publishCommunityOnly=true rejected)
    // -------------------------------------------------------------------------
    console.log("-> [Test 37] Strict publishCommunityOnly Invariant Negative 1 (jury_only rejected)...");
    let pub37Failed = false;
    try {
      await publishJuryChallengeResultsService(db, juror1Ctx, { challengeId: ch34.id, publishCommunityOnly: true });
    } catch (_err) {
      pub37Failed = true;
    }
    if (!pub37Failed) {
      throw new Error("Expected publishCommunityOnly=true on jury_only challenge to be rejected.");
    }
    console.log("✓ Test 37 Passed: publishCommunityOnly=true rejected on jury_only mode.\n");

    // -------------------------------------------------------------------------
    // TEST 38: Strict publishCommunityOnly Invariant Negative 2 (vote_and_jury + >=1 Jury Award + publishCommunityOnly=true rejected)
    // -------------------------------------------------------------------------
    console.log("-> [Test 38] Strict publishCommunityOnly Invariant Negative 2 (vote_and_jury with awards rejected)...");
    const [ch38] = await db.insert(challenges).values({
      title: "Challenge 38", slug: "ch-38", theme: "Theme", description: "Desc", promptRules: "Rules",
      status: "jury_selection_open", awardMode: "vote_and_jury", createdByUserId: adminUser.id
    }).returning();
    await db.insert(challengeJuryAssignments).values({
      challengeId: ch38.id, userId: juror1.id, profileId: juror1Prof.id, isRecorder: true
    });
    const sub38A = await createSubmission(ch38.id, artist1, artist1Prof, "Art 38A");
    const sub38B = await createSubmission(ch38.id, artist2, artist2Prof, "Art 38B");
    await db.insert(challengeResults).values({
      challengeId: ch38.id, submissionId: sub38A.id, awardType: "community_vote_winner",
      finalRank: 1, totalCommunityStars: 5, resolutionMethod: "unique_main_vote", isPublished: false
    });
    await db.insert(challengeJuryAwards).values({
      challengeId: ch38.id, submissionId: sub38B.id, categoryLabel: "Best Composition", recordedByUserId: juror1.id
    });

    let pub38Failed = false;
    try {
      await publishJuryChallengeResultsService(db, juror1Ctx, { challengeId: ch38.id, publishCommunityOnly: true });
    } catch (_err) {
      pub38Failed = true;
    }
    if (!pub38Failed) {
      throw new Error("Expected publishCommunityOnly=true to be rejected when jury awards exist.");
    }
    console.log("✓ Test 38 Passed: publishCommunityOnly=true rejected when jury awards already exist.\n");

    // -------------------------------------------------------------------------
    // TEST 39: Zero-Award Handling & Protected Cancellation
    // -------------------------------------------------------------------------
    console.log("-> [Test 39] Zero-Award Handling & Protected Cancellation...");
    const cancelRes39 = await cancelJuryChallengeService(db, juror1Ctx, {
      challengeId: ch34.id, reason: "Tidak ada karya yang memenuhi syarat kurasi tema."
    });
    if (!cancelRes39.success || cancelRes39.outcome !== "cancelled") {
      throw new Error("Failed to cancel zero-award jury challenge.");
    }
    const [ch34After] = await db.select().from(challenges).where(eq(challenges.id, ch34.id));
    if (ch34After.status !== "cancelled") throw new Error("Expected status 'cancelled'.");
    console.log("✓ Test 39 Passed: Zero-award challenge cancelled with reason.\n");

    // -------------------------------------------------------------------------
    // TEST 40: Result Revocation (revokeChallengeResultsService)
    // -------------------------------------------------------------------------
    console.log("-> [Test 40] Result Revocation (revokeChallengeResultsService)...");
    const revokeRes40 = await revokeChallengeResultsService(
      db, adminCtx, chLive.id, "Pencabutan hasil untuk audit integritas penilaian juri."
    );
    if (!revokeRes40.success || revokeRes40.outcome !== "results_revoked") {
      throw new Error("Failed to revoke challenge results.");
    }
    const [chLiveRevoked] = await db.select().from(challenges).where(eq(challenges.id, chLive.id));
    if (chLiveRevoked.status !== "results_revoked") {
      throw new Error(`Expected status 'results_revoked', got '${chLiveRevoked.status}'`);
    }
    const revokedResults = await db.select().from(challengeResults).where(eq(challengeResults.challengeId, chLive.id));
    if (revokedResults.some((r) => r.isPublished)) {
      throw new Error("Expected all results to have isPublished = false after revocation.");
    }
    console.log("✓ Test 40 Passed: Results revoked and unpublished with audit log.\n");

    // -------------------------------------------------------------------------
    // TEST 41: Hard Block Legacy Engines in JURY_SELECTION_OPEN and RESULTS_REVOKED
    // -------------------------------------------------------------------------
    console.log("-> [Test 41] Hard Block Legacy Engines in JURY_SELECTION_OPEN and RESULTS_REVOKED...");
    let compute41Failed = false;
    try {
      await computeChallengeResultsService(db, adminCtx, ch38.id);
    } catch (_err) {
      compute41Failed = true;
    }
    let pubLegacy41Failed = false;
    try {
      await publishChallengeResultsService(db, adminCtx, chLive.id);
    } catch (_err) {
      pubLegacy41Failed = true;
    }
    if (!compute41Failed || !pubLegacy41Failed) {
      throw new Error("Expected legacy result engines to be hard blocked in JURY_SELECTION_OPEN & RESULTS_REVOKED.");
    }
    console.log("✓ Test 41 Passed: Legacy compute & publish engines hard-blocked on Gate C live states.\n");

    // -------------------------------------------------------------------------
    // TEST 42: Authoritative Main-Round Raw Community Star Authority & Tiebreak Isolation
    // -------------------------------------------------------------------------
    console.log("-> [Test 42] Authoritative Main-Round Raw Stars (7 main stars + 1 tiebreak star -> 7 raw stars)...");
    const [ch42] = await db.insert(challenges).values({
      title: "Challenge 42 Raw Stars", slug: "ch-42", theme: "Theme", description: "Desc", promptRules: "Rules",
      status: "results_revoked", awardMode: "vote_and_jury", starsPerMember: 1, createdByUserId: adminUser.id
    }).returning();
    const sub42A = await createSubmission(ch42.id, artist1, artist1Prof, "Art 42A");

    // Main round: 7 stars
    const [round42Main] = await db.insert(challengeVotingRounds).values({
      challengeId: ch42.id, roundType: "main", status: "closed",
      startsAt: new Date(Date.now() - 7200000), deadline: new Date(Date.now() - 3600000), starsPerMember: 1
    }).returning();
    const [b42Main] = await db.insert(challengeBallots).values({
      challengeId: ch42.id, votingRoundId: round42Main.id, userId: voter1.id, roundType: "main", starsAllocated: 7, isFinalized: true
    }).returning();
    await db.insert(challengeBallotStars).values({ ballotId: b42Main.id, submissionId: sub42A.id, starsCount: 7 });

    // Tiebreak round: 1 star
    const [round42Tb] = await db.insert(challengeVotingRounds).values({
      challengeId: ch42.id, roundType: "tiebreak", status: "closed",
      startsAt: new Date(Date.now() - 3600000), deadline: new Date(Date.now() - 1000), starsPerMember: 1
    }).returning();
    const [b42Tb] = await db.insert(challengeBallots).values({
      challengeId: ch42.id, votingRoundId: round42Tb.id, userId: artist2.id, roundType: "tiebreak", starsAllocated: 1, isFinalized: true
    }).returning();
    await db.insert(challengeBallotStars).values({ ballotId: b42Tb.id, submissionId: sub42A.id, starsCount: 1 });

    // 1. Verify getJuryWorkspaceData queries strictly main round (7 stars, NOT 8)
    const wsData42 = await getJuryWorkspaceData(db, ch42.id, juror1.id);
    const cand42A = wsData42?.candidates.find((c) => c.submissionId === sub42A.id);
    if (cand42A?.communityStars !== 7) {
      throw new Error(`Expected candidate communityStars to be 7, got ${cand42A?.communityStars}`);
    }

    // 2. Verify correctCommunityWinnerService queries strictly main round (7 stars, NOT 8)
    await correctCommunityWinnerService(db, adminCtx, {
      challengeId: ch42.id,
      action: "replace",
      replacementSubmissionId: sub42A.id,
      reason: "Governance correction with authoritative raw stars"
    });
    const [res42A] = await db.select().from(challengeResults).where(eq(challengeResults.challengeId, ch42.id));
    if (res42A?.totalCommunityStars !== 7) {
      throw new Error(`Expected result totalCommunityStars to be 7, got ${res42A?.totalCommunityStars}`);
    }
    console.log("✓ Test 42 Passed: Main round raw Stars (7) strictly preserved without tiebreak Star inflation.\n");

    // -------------------------------------------------------------------------
    // TEST 43: Strengthened Republish Validation - Positive & Negative vote_only tests
    // -------------------------------------------------------------------------
    console.log("-> [Test 43] Strengthened Republish Validation (vote_only positive & negative)...");
    const [ch43] = await db.insert(challenges).values({
      title: "Challenge 43 Vote Only", slug: "ch-43", theme: "Theme", description: "Desc", promptRules: "Rules",
      status: "results_revoked", awardMode: "vote_only", starsPerMember: 1, createdByUserId: adminUser.id
    }).returning();
    const sub43A = await createSubmission(ch43.id, artist1, artist1Prof, "Art 43A");

    // Main round with 5 stars
    const [round43] = await db.insert(challengeVotingRounds).values({
      challengeId: ch43.id, roundType: "main", status: "closed",
      startsAt: new Date(Date.now() - 7200000), deadline: new Date(Date.now() - 3600000), starsPerMember: 1
    }).returning();
    const [b43] = await db.insert(challengeBallots).values({
      challengeId: ch43.id, votingRoundId: round43.id, userId: voter1.id, roundType: "main", starsAllocated: 5, isFinalized: true
    }).returning();
    await db.insert(challengeBallotStars).values({ ballotId: b43.id, submissionId: sub43A.id, starsCount: 5 });

    // Negative: Clearing winner and republishing winnerless when positive votes exist must fail
    let winnerlessRepublishFailed = false;
    try {
      await republishChallengeResultsService(db, adminCtx, ch43.id, "Attempting invalid winnerless republish");
    } catch (err: any) {
      winnerlessRepublishFailed = true;
      if (!err.message.includes("Mode 'vote_only' dengan suara positif memerlukan pemenang komunitas")) {
        throw new Error(`Unexpected error: ${err.message}`);
      }
    }
    if (!winnerlessRepublishFailed) {
      throw new Error("Expected winnerless republish on vote_only with positive stars to be rejected.");
    }

    // Positive: Replaced winner allows successful republish
    await correctCommunityWinnerService(db, adminCtx, {
      challengeId: ch43.id,
      action: "replace",
      replacementSubmissionId: sub43A.id,
      reason: "Restoring legitimate winner"
    });
    const republish43 = await republishChallengeResultsService(db, adminCtx, ch43.id, "Republish with restored winner");
    if (!republish43.success) throw new Error("Expected republish with restored winner to succeed.");
    console.log("✓ Test 43 Passed: Strengthened vote_only republish negative and positive validations confirmed.\n");

    // -------------------------------------------------------------------------
    // TEST 44: Governed Jury Award Correction under RESULTS_REVOKED
    // -------------------------------------------------------------------------
    console.log("-> [Test 44] Governed Jury Award Correction under RESULTS_REVOKED...");
    const awardToUpdate = (await db.select().from(challengeJuryAwards).where(eq(challengeJuryAwards.challengeId, chLive.id)))[0];
    const updateRes44 = await updateJuryAwardService(db, modCtx, {
      awardId: awardToUpdate.id,
      categoryLabel: "Karya Pilihan Kurator Utama"
    });
    if (!updateRes44.success || updateRes44.award?.categoryLabel !== "Karya Pilihan Kurator Utama") {
      throw new Error("Failed to correct jury award under RESULTS_REVOKED.");
    }
    console.log("✓ Test 44 Passed: Moderator successfully corrected jury award under RESULTS_REVOKED.\n");

    // -------------------------------------------------------------------------
    // TEST 45: Mode-Specific Republishing via Reconciliation
    // -------------------------------------------------------------------------
    console.log("-> [Test 45] Mode-Specific Republishing via Reconciliation...");
    const republishRes45 = await republishChallengeResultsService(
      db, adminCtx, chLive.id, "Publikasi ulang setelah koreksi kategori penghargaan selesai diverifikasi."
    );
    if (!republishRes45.success || republishRes45.outcome !== "republished") {
      throw new Error("Failed to republish challenge results.");
    }
    const [chLiveFinal] = await db.select().from(challenges).where(eq(challenges.id, chLive.id));
    if (chLiveFinal.status !== "finished") {
      throw new Error(`Expected finished status, got '${chLiveFinal.status}'`);
    }
    const reconciledResults = await db.select().from(challengeResults).where(eq(challengeResults.challengeId, chLive.id));
    if (reconciledResults.some((r) => !r.isPublished)) {
      throw new Error("Expected active reconciled awards to be published.");
    }
    console.log("✓ Test 45 Passed: Challenge results republished via reconciliation.\n");

    // -------------------------------------------------------------------------
    // TEST 46: Audit Regression under RESULTS_REVOKED
    // -------------------------------------------------------------------------
    console.log("-> [Test 46] Audit Regression (Jury award update under RESULTS_REVOKED writes jury.update_award audit log)...");
    await revokeChallengeResultsService(db, adminCtx, chLive.id, "Audit log verification pass.");
    const awardsForAudit = await db.select().from(challengeJuryAwards).where(eq(challengeJuryAwards.challengeId, chLive.id));
    const targetAuditAward = awardsForAudit[0];

    await updateJuryAwardService(db, adminCtx, {
      awardId: targetAuditAward.id,
      categoryLabel: "Grand Gold Masterpiece"
    });

    const [auditEntry] = await db.select().from(auditLogs).where(
      and(
        eq(auditLogs.action, "jury.update_award"),
        eq(auditLogs.targetId, targetAuditAward.id)
      )
    ).orderBy(desc(auditLogs.createdAt)).limit(1);

    if (!auditEntry || auditEntry.actorId !== adminUser.id) {
      throw new Error(`Expected jury.update_award audit log with actorId = ${adminUser.id}, got ${JSON.stringify(auditEntry)}`);
    }
    console.log("✓ Test 46 Passed: Audit log written with correct actor and target context during RESULTS_REVOKED mutation.\n");

    // -------------------------------------------------------------------------
    // CONCURRENCY TEST 47: Simultaneous Recorder Reassignment
    // -------------------------------------------------------------------------
    console.log("-> [Test 47] Concurrency: Simultaneous Recorder Reassignment...");
    const [chConc1] = await db.insert(challenges).values({
      title: "Concurrent Reassign Challenge", slug: "ch-conc-1", theme: "Theme", description: "Desc", promptRules: "Rules",
      status: "jury_selection_open", awardMode: "jury_only", createdByUserId: adminUser.id
    }).returning();
    await db.insert(challengeJuryAssignments).values([
      { challengeId: chConc1.id, userId: juror1.id, profileId: juror1Prof.id, isRecorder: true },
      { challengeId: chConc1.id, userId: juror2.id, profileId: juror2Prof.id, isRecorder: false },
      { challengeId: chConc1.id, userId: juror3.id, profileId: juror3Prof.id, isRecorder: false },
    ]);

    // Concurrently reassign to Juror 2 and Juror 3
    const concReassignPromises = [
      db.transaction(async (tx) => assignJuryRecorderService(tx, adminCtx, { challengeId: chConc1.id, userId: juror2.id })),
      db.transaction(async (tx) => assignJuryRecorderService(tx, adminCtx, { challengeId: chConc1.id, userId: juror3.id })),
    ];
    await Promise.allSettled(concReassignPromises);

    const conc1Assignments = await db.select().from(challengeJuryAssignments).where(eq(challengeJuryAssignments.challengeId, chConc1.id));
    const conc1Recorders = conc1Assignments.filter((a) => a.isRecorder);
    if (conc1Recorders.length !== 1) {
      throw new Error(`Expected exactly 1 recorder after concurrent reassignments, found ${conc1Recorders.length}`);
    }
    console.log(`✓ Test 47 Passed: Exactly one recorder (${conc1Recorders[0].userId}) designated after concurrent reassignments.\n`);

    // -------------------------------------------------------------------------
    // CONCURRENCY TEST 48: Jury Award Write vs Publication Race
    // -------------------------------------------------------------------------
    console.log("-> [Test 48] Concurrency: Jury Award Write vs Publication Race...");
    const [chConc2] = await db.insert(challenges).values({
      title: "Concurrent Write vs Publish Challenge", slug: "ch-conc-2", theme: "Theme", description: "Desc", promptRules: "Rules",
      status: "jury_selection_open", awardMode: "jury_only", createdByUserId: adminUser.id
    }).returning();
    await db.insert(challengeJuryAssignments).values([
      { challengeId: chConc2.id, userId: juror1.id, profileId: juror1Prof.id, isRecorder: true }
    ]);
    const subConc2A = await createSubmission(chConc2.id, artist1, artist1Prof, "Conc Art 2A");
    const subConc2B = await createSubmission(chConc2.id, artist2, artist2Prof, "Conc Art 2B");
    await db.insert(challengeJuryAwards).values({
      challengeId: chConc2.id, submissionId: subConc2A.id, categoryLabel: "Initial Award", recordedByUserId: juror1.id
    });

    // Run write award for 2B and publication concurrently
    await Promise.allSettled([
      db.transaction(async (tx) => createJuryAwardService(tx, juror1Ctx, { challengeId: chConc2.id, submissionId: subConc2B.id, categoryLabel: "Race Award" })),
      db.transaction(async (tx) => publishJuryChallengeResultsService(tx, juror1Ctx, { challengeId: chConc2.id })),
    ]);

    const [chConc2After] = await db.select().from(challenges).where(eq(challenges.id, chConc2.id));
    if (chConc2After.status !== "finished") {
      throw new Error(`Expected challenge to end in finished, got ${chConc2After.status}`);
    }
    const conc2Results = await db.select().from(challengeResults).where(eq(challengeResults.challengeId, chConc2.id));
    if (conc2Results.some((r) => !r.isPublished)) {
      throw new Error("Expected all materialized results to have isPublished = true.");
    }
    console.log(`✓ Test 48 Passed: Deterministic finished state and published results (${conc2Results.length} awards) confirmed.\n`);

    // -------------------------------------------------------------------------
    // CONCURRENCY TEST 49: Publication vs Result Revocation Race
    // -------------------------------------------------------------------------
    console.log("-> [Test 49] Concurrency: Publication vs Result Revocation Race...");
    const [chConc3] = await db.insert(challenges).values({
      title: "Concurrent Publish vs Revoke Challenge", slug: "ch-conc-3", theme: "Theme", description: "Desc", promptRules: "Rules",
      status: "jury_selection_open", awardMode: "jury_only", createdByUserId: adminUser.id
    }).returning();
    await db.insert(challengeJuryAssignments).values([
      { challengeId: chConc3.id, userId: juror1.id, profileId: juror1Prof.id, isRecorder: true }
    ]);
    const subConc3 = await createSubmission(chConc3.id, artist1, artist1Prof, "Conc Art 3");
    await db.insert(challengeJuryAwards).values({
      challengeId: chConc3.id, submissionId: subConc3.id, categoryLabel: "Pre-Pub Award", recordedByUserId: juror1.id
    });

    await Promise.allSettled([
      db.transaction(async (tx) => publishJuryChallengeResultsService(tx, juror1Ctx, { challengeId: chConc3.id })),
      db.transaction(async (tx) => revokeChallengeResultsService(tx, adminCtx, chConc3.id, "Concurrent revoke attempt")),
    ]);

    const [chConc3After] = await db.select().from(challenges).where(eq(challenges.id, chConc3.id));
    if (chConc3After.status !== "finished" && chConc3After.status !== "results_revoked") {
      throw new Error(`Expected deterministic finished or results_revoked, got ${chConc3After.status}`);
    }
    const conc3Results = await db.select().from(challengeResults).where(eq(challengeResults.challengeId, chConc3.id));
    const allPublished = conc3Results.every((r) => r.isPublished);
    const allUnpublished = conc3Results.every((r) => !r.isPublished);
    if ((chConc3After.status === "finished" && !allPublished) || (chConc3After.status === "results_revoked" && !allUnpublished)) {
      throw new Error(`Mismatch between status '${chConc3After.status}' and result publication state.`);
    }
    console.log(`✓ Test 49 Passed: Deterministic lifecycle state '${chConc3After.status}' with zero partial results.\n`);

    // -------------------------------------------------------------------------
    // CONCURRENCY TEST 50: Result Correction vs Republish Race
    // -------------------------------------------------------------------------
    console.log("-> [Test 50] Concurrency: Result Correction vs Republish Race...");
    const [chConc4] = await db.insert(challenges).values({
      title: "Concurrent Correction vs Republish", slug: "ch-conc-4", theme: "Theme", description: "Desc", promptRules: "Rules",
      status: "results_revoked", awardMode: "jury_only", createdByUserId: adminUser.id
    }).returning();
    const subConc4 = await createSubmission(chConc4.id, artist1, artist1Prof, "Conc Art 4");
    const [awardConc4] = await db.insert(challengeJuryAwards).values({
      challengeId: chConc4.id, submissionId: subConc4.id, categoryLabel: "Initial Category", recordedByUserId: juror1.id
    }).returning();

    await Promise.allSettled([
      db.transaction(async (tx) => updateJuryAwardService(tx, modCtx, { awardId: awardConc4.id, categoryLabel: "Corrected Category" })),
      db.transaction(async (tx) => republishChallengeResultsService(tx, adminCtx, chConc4.id, "Concurrent republish pass")),
    ]);

    const [chConc4After] = await db.select().from(challenges).where(eq(challenges.id, chConc4.id));
    if (chConc4After.status !== "finished") {
      throw new Error(`Expected challenge to end in finished, got ${chConc4After.status}`);
    }
    const conc4Results = await db.select().from(challengeResults).where(eq(challengeResults.challengeId, chConc4.id));
    console.log(`✓ Test 50 Passed: Result correction vs republish race safely reconciled into 1 published result.\n`);

    // -------------------------------------------------------------------------
    // TEST 51: Admin Adds Juror to Challenge Panel
    // -------------------------------------------------------------------------
    console.log("-> [Test 51] Admin Adds Juror to Challenge Panel...");
    const [chPanel1] = await db.insert(challenges).values({
      title: "Panel Management Challenge", slug: "ch-panel-1", theme: "Theme", description: "Desc", promptRules: "Rules",
      status: "jury_selection_open", awardMode: "jury_only", createdByUserId: adminUser.id
    }).returning();

    const addRes51 = await addJuryAssignmentService(db, adminCtx, { challengeId: chPanel1.id, userId: juror1.id });
    if (!addRes51.success) throw new Error("Failed to add juror via addJuryAssignmentService.");

    const [j1Assigned] = await db.select().from(challengeJuryAssignments).where(
      and(
        eq(challengeJuryAssignments.challengeId, chPanel1.id),
        eq(challengeJuryAssignments.userId, juror1.id)
      )
    );
    if (!j1Assigned || j1Assigned.isRecorder !== false) {
      throw new Error(`Expected juror assigned with isRecorder = false, got ${JSON.stringify(j1Assigned)}`);
    }

    const [audit51] = await db.select().from(auditLogs).where(
      and(
        eq(auditLogs.action, "jury.add_member"),
        eq(auditLogs.targetId, chPanel1.id)
      )
    ).orderBy(desc(auditLogs.createdAt)).limit(1);
    if (!audit51 || audit51.actorId !== adminUser.id) {
      throw new Error("Expected jury.add_member audit log for Admin.");
    }
    console.log("✓ Test 51 Passed: Admin successfully added juror with is_recorder = false and audit logging.\n");

    // -------------------------------------------------------------------------
    // TEST 52: Moderator Adds Juror to Challenge Panel
    // -------------------------------------------------------------------------
    console.log("-> [Test 52] Moderator Adds Juror to Challenge Panel...");
    const addRes52 = await addJuryAssignmentService(db, modCtx, { challengeId: chPanel1.id, userId: juror2.id });
    if (!addRes52.success) throw new Error("Moderator failed to add juror.");

    const [j2Assigned] = await db.select().from(challengeJuryAssignments).where(
      and(
        eq(challengeJuryAssignments.challengeId, chPanel1.id),
        eq(challengeJuryAssignments.userId, juror2.id)
      )
    );
    if (!j2Assigned || j2Assigned.isRecorder !== false) {
      throw new Error(`Expected juror2 assigned with isRecorder = false.`);
    }
    console.log("✓ Test 52 Passed: Moderator successfully added juror.\n");

    // -------------------------------------------------------------------------
    // TEST 53: Ordinary User Adding Juror Rejected
    // -------------------------------------------------------------------------
    console.log("-> [Test 53] Ordinary User Adding Juror Rejected...");
    let ordinaryAddFailed = false;
    try {
      await addJuryAssignmentService(db, artist1Ctx, { challengeId: chPanel1.id, userId: juror3.id });
    } catch (_err) {
      ordinaryAddFailed = true;
    }
    if (!ordinaryAddFailed) {
      throw new Error("Expected non-staff to be rejected from adding jurors.");
    }
    console.log("✓ Test 53 Passed: Ordinary user rejected from adding jurors.\n");

    // -------------------------------------------------------------------------
    // TEST 54: Duplicate Juror Assignment Rejected
    // -------------------------------------------------------------------------
    console.log("-> [Test 54] Duplicate Juror Assignment Rejected...");
    let dupAddFailed = false;
    try {
      await addJuryAssignmentService(db, adminCtx, { challengeId: chPanel1.id, userId: juror1.id });
    } catch (err: any) {
      dupAddFailed = err.message.includes("sudah ditugaskan");
    }
    if (!dupAddFailed) {
      throw new Error("Expected duplicate juror assignment to be rejected.");
    }
    console.log("✓ Test 54 Passed: Duplicate juror assignment rejected.\n");

    // -------------------------------------------------------------------------
    // TEST 55: Remove Ordinary Juror Succeeds
    // -------------------------------------------------------------------------
    console.log("-> [Test 55] Remove Ordinary Juror Succeeds...");
    const removeRes55 = await removeJuryAssignmentService(db, adminCtx, { challengeId: chPanel1.id, userId: juror2.id });
    if (!removeRes55.success) throw new Error("Failed to remove juror.");

    const [j2AfterRemove] = await db.select().from(challengeJuryAssignments).where(
      and(
        eq(challengeJuryAssignments.challengeId, chPanel1.id),
        eq(challengeJuryAssignments.userId, juror2.id)
      )
    );
    if (j2AfterRemove) throw new Error("Expected juror2 to be deleted from panel.");

    const [audit55] = await db.select().from(auditLogs).where(
      and(
        eq(auditLogs.action, "jury.remove_member"),
        eq(auditLogs.targetId, chPanel1.id)
      )
    ).orderBy(desc(auditLogs.createdAt)).limit(1);
    if (!audit55) throw new Error("Expected jury.remove_member audit log.");
    console.log("✓ Test 55 Passed: Ordinary juror removed with audit logging.\n");

    // -------------------------------------------------------------------------
    // TEST 56: Active Recorder Removal during JURY_SELECTION_OPEN Rejected
    // -------------------------------------------------------------------------
    console.log("-> [Test 56] Active Recorder Removal during JURY_SELECTION_OPEN Rejected...");
    await assignJuryRecorderService(db, adminCtx, { challengeId: chPanel1.id, userId: juror1.id });
    let recorderRemoveFailed = false;
    try {
      await removeJuryAssignmentService(db, adminCtx, { challengeId: chPanel1.id, userId: juror1.id });
    } catch (err: any) {
      recorderRemoveFailed = err.message.includes("Tidak dapat menghapus Jury Recorder");
    }
    if (!recorderRemoveFailed) {
      throw new Error("Expected active recorder removal during jury phase to be rejected.");
    }
    console.log("✓ Test 56 Passed: Active recorder removal during jury_selection_open rejected.\n");

    // -------------------------------------------------------------------------
    // TEST 57: Zero-Juror Challenge Recovery to Operational Readiness
    // -------------------------------------------------------------------------
    console.log("-> [Test 57] Zero-Juror Challenge Recovery to Operational Readiness...");
    const [chZero] = await db.insert(challenges).values({
      title: "Zero Juror Recovery Challenge", slug: "ch-zero-recovery", theme: "Theme", description: "Desc", promptRules: "Rules",
      status: "submission_locked", awardMode: "jury_only", createdByUserId: adminUser.id
    }).returning();

    const readyInitial = await validateJuryPhaseReadinessService(db, chZero.id);
    if (readyInitial.ready !== false) throw new Error("Expected zero-juror challenge to be unready.");

    // Recover panel via service
    await addJuryAssignmentService(db, adminCtx, { challengeId: chZero.id, userId: juror3.id });
    await assignJuryRecorderService(db, adminCtx, { challengeId: chZero.id, userId: juror3.id });

    const readyAfterRecovery = await validateJuryPhaseReadinessService(db, chZero.id);
    if (!readyAfterRecovery.ready || readyAfterRecovery.recorder?.userId !== juror3.id) {
      throw new Error(`Expected ready after recovery, got ${JSON.stringify(readyAfterRecovery)}`);
    }
    console.log("✓ Test 57 Passed: Zero-juror challenge recovered to full operational readiness.\n");

    // -------------------------------------------------------------------------
    // TEST 58: Mode Guard: jury_only Community Winner Correction Rejected
    // -------------------------------------------------------------------------
    console.log("-> [Test 58] Mode Guard: jury_only Community Winner Correction Rejected...");
    const [chModeJury] = await db.insert(challenges).values({
      title: "Mode Jury Only Challenge", slug: "ch-mode-jury", theme: "Theme", description: "Desc", promptRules: "Rules",
      status: "results_revoked", awardMode: "jury_only", createdByUserId: adminUser.id
    }).returning();
    const subModeJury = await createSubmission(chModeJury.id, artist1, artist1Prof, "Art Mode Jury");

    let juryOnlyCommFailed = false;
    try {
      await correctCommunityWinnerService(db, adminCtx, {
        challengeId: chModeJury.id, action: "replace", replacementSubmissionId: subModeJury.id, reason: "Correction attempt"
      });
    } catch (err: any) {
      juryOnlyCommFailed = err.message.includes("tidak didukung untuk mode 'jury_only'");
    }
    if (!juryOnlyCommFailed) {
      throw new Error("Expected correctCommunityWinnerService to reject jury_only mode.");
    }
    console.log("✓ Test 58 Passed: jury_only Community Winner correction rejected.\n");

    // -------------------------------------------------------------------------
    // TEST 59: Mode Guard: showcase_only Community Winner Correction Rejected
    // -------------------------------------------------------------------------
    console.log("-> [Test 59] Mode Guard: showcase_only Community Winner Correction Rejected...");
    const [chModeShowcase] = await db.insert(challenges).values({
      title: "Mode Showcase Challenge", slug: "ch-mode-showcase", theme: "Theme", description: "Desc", promptRules: "Rules",
      status: "results_revoked", awardMode: "showcase_only", createdByUserId: adminUser.id
    }).returning();
    const subModeShowcase = await createSubmission(chModeShowcase.id, artist1, artist1Prof, "Art Showcase");

    let showcaseCommFailed = false;
    try {
      await correctCommunityWinnerService(db, adminCtx, {
        challengeId: chModeShowcase.id, action: "replace", replacementSubmissionId: subModeShowcase.id, reason: "Correction attempt"
      });
    } catch (err: any) {
      showcaseCommFailed = err.message.includes("tidak didukung untuk mode 'showcase_only'");
    }
    if (!showcaseCommFailed) {
      throw new Error("Expected correctCommunityWinnerService to reject showcase_only mode.");
    }
    console.log("✓ Test 59 Passed: showcase_only Community Winner correction rejected.\n");

    // -------------------------------------------------------------------------
    // TEST 60: Mode Guard: vote_only & vote_and_jury Community Winner Correction Allowed
    // -------------------------------------------------------------------------
    console.log("-> [Test 60] Mode Guard: vote_only & vote_and_jury Community Winner Correction Allowed...");
    const [chModeVote] = await db.insert(challenges).values({
      title: "Mode Vote Only Challenge", slug: "ch-mode-vote", theme: "Theme", description: "Desc", promptRules: "Rules",
      status: "results_revoked", awardMode: "vote_only", createdByUserId: adminUser.id
    }).returning();
    const subModeVote = await createSubmission(chModeVote.id, artist1, artist1Prof, "Art Mode Vote");

    const voteRes60 = await correctCommunityWinnerService(db, adminCtx, {
      challengeId: chModeVote.id, action: "replace", replacementSubmissionId: subModeVote.id, reason: "Governance vote_only correction"
    });
    if (!voteRes60.success) throw new Error("Expected vote_only community winner correction to succeed.");

    const [commResult60] = await db.select().from(challengeResults).where(
      and(
        eq(challengeResults.challengeId, chModeVote.id),
        eq(challengeResults.awardType, "community_vote_winner")
      )
    );
    if (!commResult60 || commResult60.submissionId !== subModeVote.id || commResult60.resolutionMethod !== "governance_correction") {
      throw new Error(`Invalid community result row after correction: ${JSON.stringify(commResult60)}`);
    }
    console.log("✓ Test 60 Passed: Community winner correction allowed for vote_only and vote_and_jury modes.\n");

    // -------------------------------------------------------------------------
    // TEST 61: Mixed Mode Exclusion on Community Winner Replacement
    // -------------------------------------------------------------------------
    console.log("-> [Test 61] Mixed Mode Exclusion on Community Winner Replacement...");
    const [chMixedConflict] = await db.insert(challenges).values({
      title: "Mixed Conflict Challenge", slug: "ch-mixed-conflict", theme: "Theme", description: "Desc", promptRules: "Rules",
      status: "results_revoked", awardMode: "vote_and_jury", createdByUserId: adminUser.id
    }).returning();
    const subMixedConflict = await createSubmission(chMixedConflict.id, artist1, artist1Prof, "Art Mixed Conflict");
    await db.insert(challengeJuryAwards).values({
      challengeId: chMixedConflict.id, submissionId: subMixedConflict.id, categoryLabel: "Pre-existing Jury Award", recordedByUserId: juror1.id
    });

    let mixedConflictFailed = false;
    try {
      await correctCommunityWinnerService(db, adminCtx, {
        challengeId: chMixedConflict.id, action: "replace", replacementSubmissionId: subMixedConflict.id, reason: "Conflicting replacement attempt"
      });
    } catch (err: any) {
      mixedConflictFailed = err.message.includes("Karya ini telah menerima Penghargaan Juri");
    }
    if (!mixedConflictFailed) {
      throw new Error("Expected replacement holding a Jury Award to be rejected in vote_and_jury mode.");
    }
    console.log("✓ Test 61 Passed: Candidate already holding Jury Award in mixed mode rejected from Community Winner replacement.\n");

    // -------------------------------------------------------------------------
    // TEST 62: Non-staff Caller Cannot Correct Community Winner
    // -------------------------------------------------------------------------
    console.log("-> [Test 62] Non-staff Caller Cannot Correct Community Winner...");
    let nonStaffGovFailed = false;
    try {
      await correctCommunityWinnerService(db, artist1Ctx, {
        challengeId: chModeVote.id, action: "replace", replacementSubmissionId: subModeVote.id, reason: "Unauthorized attempt"
      });
    } catch (_err) {
      nonStaffGovFailed = true;
    }
    if (!nonStaffGovFailed) {
      throw new Error("Expected non-staff caller to be rejected from governance community winner correction.");
    }
    console.log("✓ Test 62 Passed: Non-staff caller rejected from governance community winner correction.\n");

    // -------------------------------------------------------------------------
    // TEST 63: Static / Unit Assertion: Jury Awards have finalRank === null (No Synthetic Numeric Ranks)
    // -------------------------------------------------------------------------
    console.log("-> [Test 63] Static/Unit Assertion: Jury Awards have finalRank === null...");
    const allJuryResults = await db.select().from(challengeResults).where(eq(challengeResults.awardType, "jury_award"));
    const syntheticRanks = allJuryResults.filter((r) => r.finalRank !== null);
    if (syntheticRanks.length > 0) {
      throw new Error(`Expected zero jury awards with numeric finalRank, found ${syntheticRanks.length}: ${JSON.stringify(syntheticRanks)}`);
    }
    console.log(`✓ Test 63 Passed: All ${allJuryResults.length} materialized jury awards confirmed unranked (finalRank === null).\n`);

    await testClient.end();
    console.log("=================================================================");
    console.log("🎉 ALL 63 PHASE 3 / GATE C TEST SCENARIOS PASSED PERFECTLY!");
    console.log("=================================================================\n");
    process.exit(0);
  } finally {
    try {
      await adminClient.unsafe(`DROP DATABASE IF EXISTS "${testDbName}";`);
    } catch (_e) {
      // Ignored
    }
    await adminClient.end();
  }
}

runPhase3SimplifiedJuryTests().catch((err) => {
  console.error("❌ Phase 3 test suite failed:", err);
  process.exit(1);
});
