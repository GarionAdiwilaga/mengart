import { db } from "@/db";
import {
  users,
  profiles,
  artworks,
  artworkVersions,
  portfolioEntries,
  challenges,
  challengeSubmissions,
  challengeVotingRounds,
  challengeVotingRoundCandidates,
  challengeBallots,
  challengeBallotStars,
  notifications,
  auditLogs,
  commissionServices,
  challengeResults,
} from "@/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { takedownArtworkDirectService } from "@/lib/services/moderationService";
import { disqualifyChallengeCandidateService } from "@/lib/services/challengeService";
import { getChallengeBySlug } from "@/lib/challenges";
import { getChallengeVotingData } from "@/lib/voting";
import { castOrUpdateBallotService } from "@/lib/services/votingService";
import { importHistoricalChallengeAction } from "@/app/actions/historicalBackfill";
import {
  toWitaDatetimeLocalValue,
  parseWitaDatetimeLocalInput,
  formatWitaDate,
} from "@/lib/presentation/witaTime";
import { importHistoricalChallengeService } from "@/lib/services/historicalBackfillService";
import { getSafeReturnUrl } from "@/lib/navigation/returnUrl";
import { handleRedeemCallback } from "@/app/api/auth/redeem-callback/route";
import { NextRequest } from "next/server";

async function runPhase2SecurityAndContractTests() {
  console.log("\n=================================================================");
  console.log("🛡️  STARTING PHASE 2: SECURITY & BACKEND CONTRACT AUDIT SUITE");
  console.log("=================================================================\n");

  const suffix = Date.now().toString().slice(-6);

  // Helper to create test user
  async function createTestUser(role: "member" | "moderator" | "admin", status: "active" | "suspended" | "deleted" | null = "active") {
    const idSuffix = Math.random().toString(36).substring(2, 7);
    const [user] = await db
      .insert(users)
      .values({
        email: `p2_${role}_${idSuffix}_${suffix}@mengart.local`,
        username: `p2_${role}_${idSuffix}_${suffix}`,
        role,
        membershipStatus: status,
      })
      .returning();

    const [profile] = await db
      .insert(profiles)
      .values({
        userId: user.id,
        slug: `artist-${user.username}`,
        displayName: `Artist ${user.username}`,
        profileStatus: status === "active" ? "active_public" : "suspended",
      })
      .returning();

    return { user, profile };
  }

  // Helper to create artwork
  async function createTestArtwork(userId: string, profileId: string, title = "Test Art") {
    const [artwork] = await db
      .insert(artworks)
      .values({
        userId,
        slug: `art-${Math.random().toString(36).substring(2, 8)}-${suffix}`,
        title,
        mediaType: "image",
        audience: "public",
        publicationStatus: "published",
      })
      .returning();

    const [version] = await db
      .insert(artworkVersions)
      .values({
        artworkId: artwork.id,
        versionNumber: 1,
        mediaType: "image",
        mimeType: "image/png",
        checksumSha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        masterStorageKey: `master_${artwork.id}.png`,
        publicStorageKey: `public_${artwork.id}.webp`,
        thumbnailStorageKey: `thumb_${artwork.id}.webp`,
        fileSizeBytes: 1024,
      })
      .returning();

    await db.update(artworks).set({ currentVersionId: version.id }).where(eq(artworks.id, artwork.id));

    await db.insert(portfolioEntries).values({
      profileId,
      artworkId: artwork.id,
      isVisible: true,
    });

    return { artwork, version };
  }

  // =========================================================================
  // SCENARIO 1: A08 - WITA Timezone Conversion & Datetime-Local Roundtrip
  // =========================================================================
  console.log("[Scenario 1] Verifying A08 WITA Timezone utility & form roundtrip...");
  {
    // 2026-09-18 15:59:00 UTC should be 2026-09-18 23:59 WITA (UTC+8)
    const testUtc = new Date("2026-09-18T15:59:00.000Z");
    const witaLocalStr = toWitaDatetimeLocalValue(testUtc);
    if (witaLocalStr !== "2026-09-18T23:59") {
      throw new Error(`Scenario 1 Failed: Expected "2026-09-18T23:59", got "${witaLocalStr}"`);
    }

    // Parse WITA input "2026-09-18T23:59" back to UTC Date
    const parsedDate = parseWitaDatetimeLocalInput(witaLocalStr);
    if (parsedDate.toISOString() !== "2026-09-18T15:59:00.000Z") {
      throw new Error(`Scenario 1 Failed: Expected parsed UTC "2026-09-18T15:59:00.000Z", got "${parsedDate.toISOString()}"`);
    }

    // Format human-readable
    const formatted = formatWitaDate(testUtc);
    if (!formatted.includes("WITA") || !formatted.includes("23:59")) {
      throw new Error(`Scenario 1 Failed: Expected human-readable WITA time with 23:59, got "${formatted}"`);
    }
    console.log("  ✓ WITA datetime-local value format, parsing, and display roundtrip verified.");
  }

  // =========================================================================
  // SCENARIO 2: A03 - Public Queries Filter Non-Active / Suspended Entities
  // =========================================================================
  console.log("\n[Scenario 2] Verifying A03 Public query filtering for commissions & challenges...");
  {
    const { user: suspendedUser, profile: suspendedProfile } = await createTestUser("member", "suspended");
    const { user: activeUser, profile: activeProfile } = await createTestUser("member", "active");

    // Create a published commission service for suspended user
    await db.insert(commissionServices).values({
      profileId: suspendedProfile.id,
      title: "Suspended Artist Commission",
      description: "Should not appear publicly",
      category: "Character Illustration",
      pricingType: "fixed",
      minPrice: "500000",
      serviceStatus: "published",
    });

    // Create a published commission service for active user
    await db.insert(commissionServices).values({
      profileId: activeProfile.id,
      title: "Active Artist Commission",
      description: "Should appear publicly",
      category: "Character Illustration",
      pricingType: "fixed",
      minPrice: "750000",
      serviceStatus: "published",
    });

    // Run the public commissions query with active filter joins
    const publicCommissions = await db
      .select({
        id: commissionServices.id,
        title: commissionServices.title,
        artistName: profiles.displayName,
      })
      .from(commissionServices)
      .innerJoin(profiles, eq(profiles.id, commissionServices.profileId))
      .innerJoin(users, eq(users.id, profiles.userId))
      .where(
        and(
          eq(commissionServices.serviceStatus, "published"),
          eq(profiles.profileStatus, "active_public"),
          isNull(profiles.deletedAt),
          eq(users.membershipStatus, "active"),
          isNull(users.deletedAt)
        )
      );

    const containsSuspended = publicCommissions.some((c) => c.title === "Suspended Artist Commission");
    const containsActive = publicCommissions.some((c) => c.title === "Active Artist Commission");

    if (containsSuspended) {
      throw new Error("Scenario 2 Failed: Suspended artist commission leaked into public commission query!");
    }
    if (!containsActive) {
      throw new Error("Scenario 2 Failed: Active artist commission was missing from public query.");
    }

    // Verify challenge soft-delete and isVisible filtering in getChallengeBySlug
    const [challenge] = await db
      .insert(challenges)
      .values({
        title: `A03 Challenge ${suffix}`,
        slug: `a03-challenge-${suffix}`,
        theme: "Security Testing",
        description: "Testing challenge visibility filters",
        promptRules: "Rules",
        status: "voting_open",
        isVisible: false,
      })
      .returning();

    // Default call without allowInvisible should return null
    const hiddenChallenge = await getChallengeBySlug(challenge.slug);
    if (hiddenChallenge !== null) {
      throw new Error("Scenario 2 Failed: Invisible challenge returned to regular caller!");
    }

    // With allowInvisible: true, it should return challenge
    const staffChallenge = await getChallengeBySlug(challenge.slug, { allowInvisible: true });
    if (!staffChallenge || staffChallenge.id !== challenge.id) {
      throw new Error("Scenario 2 Failed: Staff could not access invisible challenge with allowInvisible flag.");
    }

    // Soft-delete challenge
    await db.update(challenges).set({ deletedAt: new Date() }).where(eq(challenges.id, challenge.id));
    const deletedChallenge = await getChallengeBySlug(challenge.slug, { allowInvisible: true });
    if (deletedChallenge !== null) {
      throw new Error("Scenario 2 Failed: Soft-deleted challenge returned even to staff query without allowDeleted!");
    }

    console.log("  ✓ A03: Suspended artist commissions excluded and soft-deleted/invisible challenges protected.");
  }

  // =========================================================================
  // SCENARIO 3: A04 - Direct Staff Artwork Takedown Service & Audit Log
  // =========================================================================
  console.log("\n[Scenario 3] Verifying A04 Direct staff artwork takedown service & audit log...");
  {
    const { user: author, profile: authorProfile } = await createTestUser("member", "active");
    const { user: moderator } = await createTestUser("moderator", "active");
    const { user: regularMember } = await createTestUser("member", "active");
    const { artwork } = await createTestArtwork(author.id, authorProfile.id, "Infringing Artwork");

    // 1. Regular member attempt must fail
    let memberFailed = false;
    try {
      await takedownArtworkDirectService(db, {
        actorUserId: regularMember.id,
        artworkId: artwork.id,
        reason: "Ini melanggar hak cipta karya orang lain.",
      });
    } catch (err: any) {
      memberFailed = true;
    }
    if (!memberFailed) {
      throw new Error("Scenario 3 Failed: Regular member was able to invoke takedownArtworkDirectService!");
    }

    // 2. Reason < 5 chars must fail
    let shortReasonFailed = false;
    try {
      await takedownArtworkDirectService(db, {
        actorUserId: moderator.id,
        artworkId: artwork.id,
        reason: "bad",
      });
    } catch (err: any) {
      shortReasonFailed = true;
    }
    if (!shortReasonFailed) {
      throw new Error("Scenario 3 Failed: Takedown succeeded with reason < 5 chars!");
    }

    // 3. Authorized takedown by moderator
    const takedownResult = await takedownArtworkDirectService(db, {
      actorUserId: moderator.id,
      artworkId: artwork.id,
      reason: "Melanggar hak cipta orisinalitas atelier.",
    });

    if (!takedownResult.success) {
      throw new Error("Scenario 3 Failed: Takedown returned unsuccessful result.");
    }

    // Verify artwork publication status is now "hidden"
    const [updatedArtwork] = await db
      .select()
      .from(artworks)
      .where(eq(artworks.id, artwork.id));

    if (updatedArtwork.publicationStatus !== "hidden") {
      throw new Error(`Scenario 3 Failed: Expected publicationStatus "hidden", got "${updatedArtwork.publicationStatus}"`);
    }

    // Verify audit log exists
    const [auditEntry] = await db
      .select()
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.action, "artwork.takedown"),
          eq(auditLogs.targetId, artwork.id)
        )
      );

    if (!auditEntry) {
      throw new Error("Scenario 3 Failed: Audit log entry for artwork.takedown was not created!");
    }
    if (auditEntry.actorId !== moderator.id) {
      throw new Error("Scenario 3 Failed: Audit log actor does not match moderator ID.");
    }

    console.log("  ✓ A04: Direct staff takedown enforces role, >= 5 char reason, status mutation, and audit trail.");
  }

  // =========================================================================
  // SCENARIO 4: A05 - Disqualify Challenge Candidate & Star Refund
  // =========================================================================
  console.log("\n[Scenario 4] Verifying A05 Disqualify candidate with Star refund & notifications...");
  {
    const { user: adminUser } = await createTestUser("admin", "active");
    const { user: candidateUser, profile: candidateProfile } = await createTestUser("member", "active");
    const { user: voterUser } = await createTestUser("member", "active");
    const { artwork: candidateArt, version: candidateVer } = await createTestArtwork(candidateUser.id, candidateProfile.id, "Candidate Art");

    // Create challenge in voting_open
    const [challenge] = await db
      .insert(challenges)
      .values({
        title: `Challenge Disqualification Test ${suffix}`,
        slug: `disqualify-test-${suffix}`,
        theme: "Integrity",
        description: "Testing candidate disqualification",
        promptRules: "Rules",
        status: "voting_open",
        awardMode: "vote_only",
        starsPerMember: 3,
      })
      .returning();

    // Create main voting round
    const [round] = await db
      .insert(challengeVotingRounds)
      .values({
        challengeId: challenge.id,
        roundType: "main",
        status: "open",
        startsAt: new Date(Date.now() - 3600000),
        deadline: new Date(Date.now() + 86400000),
        starsPerMember: 3,
      })
      .returning();

    // Create candidate submission
    const [submission] = await db
      .insert(challengeSubmissions)
      .values({
        challengeId: challenge.id,
        userId: candidateUser.id,
        profileId: candidateProfile.id,
        artworkId: candidateArt.id,
        artworkVersionId: candidateVer.id,
        title: "Candidate Entry",
        submissionStatus: "submitted",
      })
      .returning();

    // Freeze into round candidates
    await db.insert(challengeVotingRoundCandidates).values({
      votingRoundId: round.id,
      submissionId: submission.id,
    });

    // Voter casts a ballot voting 2 stars for this submission
    const [ballot] = await db
      .insert(challengeBallots)
      .values({
        challengeId: challenge.id,
        votingRoundId: round.id,
        userId: voterUser.id,
        roundType: "main",
        starsAllocated: 2,
        isFinalized: false,
      })
      .returning();

    await db.insert(challengeBallotStars).values({
      ballotId: ballot.id,
      submissionId: submission.id,
      starsCount: 2,
    });

    // Disqualify the candidate
    const disqResult = await disqualifyChallengeCandidateService(
      db,
      { userId: adminUser.id, role: adminUser.role },
      {
        submissionId: submission.id,
        reason: "Terbukti menggunakan aset berhak cipta tanpa lisensi resmi.",
      }
    );

    if (!disqResult.success) {
      throw new Error("Scenario 4 Failed: Disqualification service returned false.");
    }
    if (disqResult.refundedBallotsCount !== 1) {
      throw new Error(`Scenario 4 Failed: Expected 1 refunded ballot, got ${disqResult.refundedBallotsCount}`);
    }

    // Verify submission status is "disqualified"
    const [updatedSub] = await db
      .select()
      .from(challengeSubmissions)
      .where(eq(challengeSubmissions.id, submission.id));

    if (updatedSub.submissionStatus !== "disqualified") {
      throw new Error(`Scenario 4 Failed: Expected status "disqualified", got "${updatedSub.submissionStatus}"`);
    }
    if (!updatedSub.disqualifiedAt || updatedSub.disqualifiedBy !== adminUser.id) {
      throw new Error("Scenario 4 Failed: Disqualification metadata not recorded on submission row.");
    }

    // Verify candidate was removed from round candidates snapshot
    const roundCandidates = await db
      .select()
      .from(challengeVotingRoundCandidates)
      .where(eq(challengeVotingRoundCandidates.submissionId, submission.id));

    if (roundCandidates.length !== 0) {
      throw new Error("Scenario 4 Failed: Candidate entry remained in round candidates snapshot!");
    }

    // Verify voter's ballot starsAllocated was decremented (2 - 2 = 0)
    const [updatedBallot] = await db
      .select()
      .from(challengeBallots)
      .where(eq(challengeBallots.id, ballot.id));

    if (updatedBallot.starsAllocated !== 0) {
      throw new Error(`Scenario 4 Failed: Expected voter starsAllocated 0, got ${updatedBallot.starsAllocated}`);
    }

    // Verify challengeBallotStars row was removed
    const remainingStars = await db
      .select()
      .from(challengeBallotStars)
      .where(eq(challengeBallotStars.submissionId, submission.id));

    if (remainingStars.length !== 0) {
      throw new Error("Scenario 4 Failed: Ballot star record was not cleaned up!");
    }

    // Verify notifications were dispatched to voter (star_returned) and candidate (moderation)
    const voterNotifs = await db
      .select()
      .from(notifications)
      .where(and(eq(notifications.userId, voterUser.id), eq(notifications.type, "star_returned")));

    if (voterNotifs.length === 0) {
      throw new Error("Scenario 4 Failed: Star returned notification was not dispatched to voter!");
    }

    const candidateNotifs = await db
      .select()
      .from(notifications)
      .where(and(eq(notifications.userId, candidateUser.id), eq(notifications.type, "moderation")));

    if (candidateNotifs.length === 0) {
      throw new Error("Scenario 4 Failed: Moderation notification was not dispatched to disqualified candidate!");
    }

    console.log("  ✓ A05: Disqualification mutates submission, removes snapshots, refunds Star balances, and notifies users.");
  }

  // =========================================================================
  // SCENARIO 5: A01 - Voting Ballot Read Identity Protection & Allocation Isolation
  // =========================================================================
  console.log("\n[Scenario 5] Verifying A01 Voting data server-side identity derivation...");
  {
    const { user: userA } = await createTestUser("member", "active");
    const { user: userB } = await createTestUser("member", "active");
    const { user: artistC, profile: artistProfileC } = await createTestUser("member", "active");
    const { user: artistD, profile: artistProfileD } = await createTestUser("member", "active");
    const { artwork: art1, version: ver1 } = await createTestArtwork(artistC.id, artistProfileC.id, "Candidate 1");
    const { artwork: art2, version: ver2 } = await createTestArtwork(artistD.id, artistProfileD.id, "Candidate 2");

    const [challenge] = await db
      .insert(challenges)
      .values({
        title: `Voting Auth Test ${suffix}`,
        slug: `voting-auth-test-${suffix}`,
        theme: "Auth",
        description: "Testing server action voter auth",
        promptRules: "Rules",
        status: "voting_open",
        awardMode: "vote_only",
      })
      .returning();

    const [sub1] = await db
      .insert(challengeSubmissions)
      .values({
        challengeId: challenge.id,
        userId: artistC.id,
        profileId: artistProfileC.id,
        artworkId: art1.id,
        artworkVersionId: ver1.id,
        title: "Candidate Sub 1",
        submissionStatus: "submitted",
      })
      .returning();

    const [sub2] = await db
      .insert(challengeSubmissions)
      .values({
        challengeId: challenge.id,
        userId: artistD.id,
        profileId: artistProfileD.id,
        artworkId: art2.id,
        artworkVersionId: ver2.id,
        title: "Candidate Sub 2",
        submissionStatus: "submitted",
      })
      .returning();

    const [round] = await db
      .insert(challengeVotingRounds)
      .values({
        challengeId: challenge.id,
        roundType: "main",
        status: "open",
        startsAt: new Date(Date.now() - 3600000),
        deadline: new Date(Date.now() + 86400000),
        starsPerMember: 3,
      })
      .returning();

    await db.insert(challengeVotingRoundCandidates).values([
      { votingRoundId: round.id, submissionId: sub1.id },
      { votingRoundId: round.id, submissionId: sub2.id },
    ]);

    // 1. Cast ballot for userA (2 stars on sub1)
    await castOrUpdateBallotService(
      db,
      { userId: userA.id, role: userA.role },
      {
        votingRoundId: round.id,
        votes: [{ submissionId: sub1.id, starsCount: 2 }],
      }
    );

    // 2. Query reader boundary getChallengeVotingData for userA
    const dataForA = await getChallengeVotingData(challenge.id, userA.id);
    if (!dataForA) throw new Error("Scenario 5 Failed: dataForA was null");
    if (dataForA.userBallot.starsAllocated !== 2) {
      throw new Error(`Scenario 5 Failed: Expected userA starsAllocated 2, got ${dataForA.userBallot.starsAllocated}`);
    }
    if (dataForA.userBallot.remainingStars !== 1) {
      throw new Error(`Scenario 5 Failed: Expected userA remainingStars 1, got ${dataForA.userBallot.remainingStars}`);
    }

    // 3. Query reader boundary for userB (must NOT see userA's ballot)
    const dataForB = await getChallengeVotingData(challenge.id, userB.id);
    if (!dataForB) throw new Error("Scenario 5 Failed: dataForB was null");
    if (dataForB.userBallot.starsAllocated !== 0) {
      throw new Error(`Scenario 5 Failed: Expected userB starsAllocated 0, got ${dataForB.userBallot.starsAllocated}`);
    }
    if (dataForB.userBallot.remainingStars !== 3) {
      throw new Error(`Scenario 5 Failed: Expected userB remainingStars 3, got ${dataForB.userBallot.remainingStars}`);
    }

    // 4. Query reader boundary for anonymous caller (undefined userId)
    const dataAnon = await getChallengeVotingData(challenge.id, undefined);
    if (!dataAnon) throw new Error("Scenario 5 Failed: dataAnon was null");
    if (dataAnon.userBallot.starsAllocated !== 0) {
      throw new Error("Scenario 5 Failed: Anonymous caller received non-zero starsAllocated");
    }

    // 5. Verify candidate list reflects open candidates
    if (dataForA.candidates.length !== 2) {
      throw new Error(`Scenario 5 Failed: Expected 2 candidates, got ${dataForA.candidates.length}`);
    }

    console.log("  ✓ A01: getChallengeVotingData verified with authentic caller boundary and allocation isolation.");
  }

  // =========================================================================
  // SCENARIO 6: R01 - Historical Import Authorization Boundary & Invariant Suite
  // =========================================================================
  console.log("\n[Scenario 6] Verifying R01 Historical Import authorization boundary & negative tests...");
  {
    const { user: normalMember } = await createTestUser("member", "active");
    const { user: suspendedStaff } = await createTestUser("moderator", "suspended");
    const { user: deletedStaff } = await createTestUser("moderator", "deleted");
    const { user: demotedStaff } = await createTestUser("member", "active");
    const { user: activeStaff } = await createTestUser("moderator", "active");

    const sampleHistoricalInput = {
      title: `Past Challenge ${suffix}`,
      slug: `past-challenge-${suffix}`,
      theme: "Historical Theme",
      description: "Past challenge backfill",
      promptRules: "Rules",
      submissionStartsAt: new Date(Date.now() - 30 * 86400000).toISOString(),
      submissionDeadline: new Date(Date.now() - 25 * 86400000).toISOString(),
      votingStartsAt: new Date(Date.now() - 24 * 86400000).toISOString(),
      votingDeadline: new Date(Date.now() - 20 * 86400000).toISOString(),
      awardMode: "vote_only" as const,
      entries: [
        {
          userId: normalMember.id,
          artworkTitle: "Past Art 1",
          mediaType: "image" as const,
          masterStorageKey: `master_past1_${suffix}.png`,
          publicStorageKey: `public_past1_${suffix}.webp`,
          finalRank: 1,
          winnerSlotType: "community_vote_winner" as const,
          totalCommunityStars: 5,
        },
      ],
    };

    // 1. Exported Server Action Boundary: unauthenticated caller rejected
    let actionBoundaryRejected = false;
    try {
      await importHistoricalChallengeAction(sampleHistoricalInput);
    } catch (e: any) {
      actionBoundaryRejected = true;
    }
    if (!actionBoundaryRejected) throw new Error("Scenario 6 Failed: Exported action boundary allowed unauthenticated call!");

    // 2. Exported Server Action Boundary: caller attempting payload injection of actorOverride
    let actionPayloadInjectionRejected = false;
    try {
      await importHistoricalChallengeAction({
        ...sampleHistoricalInput,
        actorOverride: { id: activeStaff.id, role: "admin" },
      } as any);
    } catch (e: any) {
      actionPayloadInjectionRejected = true;
    }
    if (!actionPayloadInjectionRejected) throw new Error("Scenario 6 Failed: Exported action boundary accepted injected actorOverride!");

    // Verify 0 rows written in challenges table for unauthenticated action attempts
    const [unauthCheck] = await db.select().from(challenges).where(eq(challenges.slug, sampleHistoricalInput.slug));
    if (unauthCheck) throw new Error("Scenario 6 Failed: Row was inserted into challenges table by rejected action call!");

    // 3. Negative: Anonymous / missing actor on service
    let anonRejected = false;
    try {
      await importHistoricalChallengeService(db, { id: "", role: "" } as any, sampleHistoricalInput);
    } catch (e: any) {
      anonRejected = true;
    }
    if (!anonRejected) throw new Error("Scenario 6 Failed: Anonymous actor was not rejected!");

    // 4. Negative: Ordinary member caller
    let memberRejected = false;
    try {
      await importHistoricalChallengeService(db, { id: normalMember.id, role: normalMember.role }, sampleHistoricalInput);
    } catch (e: any) {
      memberRejected = true;
    }
    if (!memberRejected) throw new Error("Scenario 6 Failed: Ordinary member was not rejected!");

    // 5. Negative: Suspended staff caller
    let suspendedRejected = false;
    try {
      await importHistoricalChallengeService(db, { id: suspendedStaff.id, role: suspendedStaff.role }, sampleHistoricalInput);
    } catch (e: any) {
      suspendedRejected = true;
    }
    if (!suspendedRejected) throw new Error("Scenario 6 Failed: Suspended staff was not rejected!");

    // 6. Negative: Deleted staff caller
    let deletedRejected = false;
    try {
      await importHistoricalChallengeService(db, { id: deletedStaff.id, role: deletedStaff.role }, sampleHistoricalInput);
    } catch (e: any) {
      deletedRejected = true;
    }
    if (!deletedRejected) throw new Error("Scenario 6 Failed: Deleted staff was not rejected!");

    // 7. Negative: Demoted staff caller (claims role moderator, but database has member)
    let demotedRejected = false;
    try {
      await importHistoricalChallengeService(db, { id: demotedStaff.id, role: "moderator" }, sampleHistoricalInput);
    } catch (e: any) {
      demotedRejected = true;
    }
    if (!demotedRejected) throw new Error("Scenario 6 Failed: Demoted staff caller was not rejected by live database check!");

    // 8. Negative: Extra injected identity property in input payload with member credentials
    let injectedPayloadRejected = false;
    try {
      const injectedPayload = {
        ...sampleHistoricalInput,
        actorOverride: { id: activeStaff.id, role: "admin" },
      };
      await importHistoricalChallengeService(db, { id: normalMember.id, role: normalMember.role }, injectedPayload as any);
    } catch (e: any) {
      injectedPayloadRejected = true;
    }
    if (!injectedPayloadRejected) throw new Error("Scenario 6 Failed: Injected actorOverride bypassed auth boundary!");

    // 9. Positive: Authorized active staff caller succeeds
    const successResult = await importHistoricalChallengeService(db, { id: activeStaff.id, role: activeStaff.role }, sampleHistoricalInput);
    if (!successResult.success || !successResult.challengeId) {
      throw new Error("Scenario 6 Failed: Active staff historical import failed unexpectedly.");
    }

    console.log("  ✓ R01: Action boundary & service verified against anonymous, member, suspended, deleted, demoted callers and payload injection.");
  }

  // =========================================================================
  // SCENARIO 7: R05 - Disqualification Phase Behavior Matrix & Monotonic Locking
  // =========================================================================
  console.log("\n[Scenario 7] Verifying R05 Disqualification phase matrix & monotonic locks...");
  {
    const { user: adminStaff } = await createTestUser("admin", "active");
    const { user: suspendedMod } = await createTestUser("moderator", "suspended");
    const { user: regularUser } = await createTestUser("member", "active");
    const { user: artist1, profile: artistProfile1 } = await createTestUser("member", "active");
    const { user: artist2, profile: artistProfile2 } = await createTestUser("member", "active");
    const { artwork: art1, version: ver1 } = await createTestArtwork(artist1.id, artistProfile1.id, "Disq Art 1");
    const { artwork: art2, version: ver2 } = await createTestArtwork(artist2.id, artistProfile2.id, "Disq Art 2");

    // Finished challenge guards
    const [finishedChallenge] = await db
      .insert(challenges)
      .values({
        title: `Finished Challenge ${suffix}`,
        slug: `finished-challenge-${suffix}`,
        theme: "Finished",
        description: "Finished challenge",
        promptRules: "Rules",
        status: "finished",
        awardMode: "vote_only",
      })
      .returning();

    const [subFinished] = await db
      .insert(challengeSubmissions)
      .values({
        challengeId: finishedChallenge.id,
        userId: artist1.id,
        profileId: artistProfile1.id,
        artworkId: art1.id,
        artworkVersionId: ver1.id,
        title: "Finished Sub",
        submissionStatus: "submitted",
      })
      .returning();

    // 1. Negative: Non-staff caller
    let nonStaffRejected = false;
    try {
      await disqualifyChallengeCandidateService(db, { userId: regularUser.id, role: regularUser.role }, { submissionId: subFinished.id, reason: "Bypass attempt" });
    } catch (e: any) {
      nonStaffRejected = true;
    }
    if (!nonStaffRejected) throw new Error("Scenario 7 Failed: Non-staff caller was not rejected!");

    // 2. Negative: Suspended staff caller
    let suspendedStaffRejected = false;
    try {
      await disqualifyChallengeCandidateService(db, { userId: suspendedMod.id, role: suspendedMod.role }, { submissionId: subFinished.id, reason: "Bypass attempt" });
    } catch (e: any) {
      suspendedStaffRejected = true;
    }
    if (!suspendedStaffRejected) throw new Error("Scenario 7 Failed: Suspended staff caller was not rejected!");

    // 3. Negative: Finished challenge disqualification rejected
    let finishedRejected = false;
    try {
      await disqualifyChallengeCandidateService(db, { userId: adminStaff.id, role: adminStaff.role }, { submissionId: subFinished.id, reason: "Should revoke first" });
    } catch (e: any) {
      finishedRejected = true;
    }
    if (!finishedRejected) throw new Error("Scenario 7 Failed: Disqualification on finished challenge was not rejected!");

    // 4. Negative: Cancelled challenge
    const [cancelledChallenge] = await db
      .insert(challenges)
      .values({
        title: `Cancelled Challenge ${suffix}`,
        slug: `cancelled-challenge-${suffix}`,
        theme: "Cancelled",
        description: "Cancelled challenge",
        promptRules: "Rules",
        status: "cancelled",
        awardMode: "vote_only",
      })
      .returning();

    const [subCancelled] = await db
      .insert(challengeSubmissions)
      .values({
        challengeId: cancelledChallenge.id,
        userId: artist1.id,
        profileId: artistProfile1.id,
        artworkId: art1.id,
        artworkVersionId: ver1.id,
        title: "Cancelled Sub",
        submissionStatus: "submitted",
      })
      .returning();

    let cancelledRejected = false;
    try {
      await disqualifyChallengeCandidateService(db, { userId: adminStaff.id, role: adminStaff.role }, { submissionId: subCancelled.id, reason: "Should reject" });
    } catch (e: any) {
      cancelledRejected = true;
    }
    if (!cancelledRejected) throw new Error("Scenario 7 Failed: Disqualification on cancelled challenge was not rejected!");

    // 5. Phase: submission_locked with a pending round
    // Candidate removed from pending round snapshot
    const [lockedChallenge] = await db
      .insert(challenges)
      .values({
        title: `Locked Challenge ${suffix}`,
        slug: `locked-challenge-${suffix}`,
        theme: "Locked Phase",
        description: "Challenge in submission_locked",
        promptRules: "Rules",
        status: "submission_locked",
        awardMode: "vote_only",
      })
      .returning();

    const [lockedSub1] = await db
      .insert(challengeSubmissions)
      .values({
        challengeId: lockedChallenge.id,
        userId: artist1.id,
        profileId: artistProfile1.id,
        artworkId: art1.id,
        artworkVersionId: ver1.id,
        title: "Locked Sub 1",
        submissionStatus: "submitted",
      })
      .returning();

    const [lockedSub2] = await db
      .insert(challengeSubmissions)
      .values({
        challengeId: lockedChallenge.id,
        userId: artist2.id,
        profileId: artistProfile2.id,
        artworkId: art2.id,
        artworkVersionId: ver2.id,
        title: "Locked Sub 2",
        submissionStatus: "submitted",
      })
      .returning();

    const [pendingRound] = await db
      .insert(challengeVotingRounds)
      .values({
        challengeId: lockedChallenge.id,
        roundType: "main",
        status: "pending",
        startsAt: new Date(Date.now() + 3600000),
        deadline: new Date(Date.now() + 86400000),
        starsPerMember: 1,
      })
      .returning();

    await db.insert(challengeVotingRoundCandidates).values([
      { votingRoundId: pendingRound.id, submissionId: lockedSub1.id },
      { votingRoundId: pendingRound.id, submissionId: lockedSub2.id },
    ]);

    const disqLockedResult = await disqualifyChallengeCandidateService(
      db,
      { userId: adminStaff.id, role: adminStaff.role },
      { submissionId: lockedSub1.id, reason: "Violates challenge terms in locked phase" }
    );
    if (!disqLockedResult.success) throw new Error("Scenario 7 Failed: Locked phase disq was not successful");

    // Check submission status is disqualified
    const [checkLockedSub1] = await db
      .select()
      .from(challengeSubmissions)
      .where(eq(challengeSubmissions.id, lockedSub1.id));
    if (checkLockedSub1.submissionStatus !== "disqualified") {
      throw new Error(`Scenario 7 Failed: Expected submissionStatus disqualified, got ${checkLockedSub1.submissionStatus}`);
    }

    // Check candidate entry was removed from pending round candidates
    const pendingCandidates = await db
      .select()
      .from(challengeVotingRoundCandidates)
      .where(eq(challengeVotingRoundCandidates.votingRoundId, pendingRound.id));
    if (pendingCandidates.length !== 1 || pendingCandidates[0].submissionId !== lockedSub2.id) {
      throw new Error(`Scenario 7 Failed: Pending round candidate snapshot was not updated correctly! Length: ${pendingCandidates.length}`);
    }

    // 6. Phase: tiebreak_open with 2 tied candidates
    // When one is disqualified, remaining candidate resolves the tie and wins!
    const [tieChallenge] = await db
      .insert(challenges)
      .values({
        title: `Tiebreak Challenge ${suffix}`,
        slug: `tiebreak-challenge-${suffix}`,
        theme: "Tiebreak Phase",
        description: "Challenge in tiebreak_open",
        promptRules: "Rules",
        status: "tiebreak_open",
        awardMode: "vote_only",
      })
      .returning();

    const [tieSub1] = await db
      .insert(challengeSubmissions)
      .values({
        challengeId: tieChallenge.id,
        userId: artist1.id,
        profileId: artistProfile1.id,
        artworkId: art1.id,
        artworkVersionId: ver1.id,
        title: "Tie Sub 1",
        submissionStatus: "submitted",
      })
      .returning();

    const [tieSub2] = await db
      .insert(challengeSubmissions)
      .values({
        challengeId: tieChallenge.id,
        userId: artist2.id,
        profileId: artistProfile2.id,
        artworkId: art2.id,
        artworkVersionId: ver2.id,
        title: "Tie Sub 2",
        submissionStatus: "submitted",
      })
      .returning();

    const [tiebreakRound] = await db
      .insert(challengeVotingRounds)
      .values({
        challengeId: tieChallenge.id,
        roundType: "tiebreak",
        status: "open",
        startsAt: new Date(Date.now() - 3600000),
        deadline: new Date(Date.now() + 86400000),
        starsPerMember: 1,
      })
      .returning();

    await db.insert(challengeVotingRoundCandidates).values([
      { votingRoundId: tiebreakRound.id, submissionId: tieSub1.id },
      { votingRoundId: tiebreakRound.id, submissionId: tieSub2.id },
    ]);

    // Disqualify tieSub1
    const disqTieResult = await disqualifyChallengeCandidateService(
      db,
      { userId: adminStaff.id, role: adminStaff.role },
      { submissionId: tieSub1.id, reason: "Tiebreak candidate disqualified" }
    );
    if (!disqTieResult.success) throw new Error("Scenario 7 Failed: Tiebreak disq failed");

    // Check that challenge transitioned to finished
    const [checkTieChallenge] = await db
      .select()
      .from(challenges)
      .where(eq(challenges.id, tieChallenge.id));
    if (checkTieChallenge.status !== "finished") {
      throw new Error(`Scenario 7 Failed: Expected challenge status finished after tie resolved, got ${checkTieChallenge.status}`);
    }

    // Check that remaining tieSub2 became the community_vote_winner
    const results = await db
      .select()
      .from(challengeResults)
      .where(eq(challengeResults.challengeId, tieChallenge.id));
    const winnerResult = results.find((r) => r.submissionId === tieSub2.id);
    if (!winnerResult || winnerResult.awardType !== "community_vote_winner") {
      throw new Error("Scenario 7 Failed: Remaining tied candidate was not crowned community_vote_winner!");
    }

    // 7. Audit log verification
    const [disqAudit] = await db
      .select()
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.action, "challenge.disqualify_candidate"),
          eq(auditLogs.targetId, tieSub1.id)
        )
      );
    if (!disqAudit) {
      throw new Error("Scenario 7 Failed: Audit log for disqualify_candidate was not recorded!");
    }

    console.log("  ✓ R05: Disqualification phase matrix verified for locked, tiebreak, finished, and cancelled guards.");
  }

  // =========================================================================
  // SCENARIO 8: R09 - Return URL Validator & Navigation Continuity
  // =========================================================================
  console.log("\n[Scenario 8] Verifying R09 Return URL validator & continuity rules...");
  {
    // Valid relative paths
    if (getSafeReturnUrl("/gallery") !== "/gallery") throw new Error("Scenario 8 Failed: Valid relative path rejected.");
    if (getSafeReturnUrl("/gallery?tab=challenge") !== "/gallery?tab=challenge") throw new Error("Scenario 8 Failed: Valid query path rejected.");
    if (getSafeReturnUrl("/challenges/atelier-2026") !== "/challenges/atelier-2026") throw new Error("Scenario 8 Failed: Valid challenge path rejected.");
    // Valid queries with spaces / Indonesian characters
    if (getSafeReturnUrl("/gallery?search=studi%20warna") !== "/gallery?search=studi%20warna") {
      throw new Error("Scenario 8 Failed: Valid query parameter with encoded space was rejected.");
    }
    if (getSafeReturnUrl("/gallery?category=ilustrasi%20karya") !== "/gallery?category=ilustrasi%20karya") {
      throw new Error("Scenario 8 Failed: Valid query parameter with encoded Indonesian text was rejected.");
    }

    // Protocol-relative attacks
    if (getSafeReturnUrl("//evil.com") !== "/gallery") throw new Error("Scenario 8 Failed: Protocol-relative '//' attack not prevented.");
    if (getSafeReturnUrl("/\\evil.com") !== "/gallery") throw new Error("Scenario 8 Failed: '/\\' attack not prevented.");
    if (getSafeReturnUrl("\\evil.com") !== "/gallery") throw new Error("Scenario 8 Failed: Backslash attack not prevented.");
    if (getSafeReturnUrl("/artworks\\test") !== "/gallery") throw new Error("Scenario 8 Failed: Mid-path backslash not prevented.");

    // Control character & encoded external redirect attacks (Round 2 QA Findings)
    if (getSafeReturnUrl("/\t/example.invalid") !== "/gallery") {
      throw new Error("Scenario 8 Failed: Slash + tab + slash external redirect was not prevented!");
    }
    if (getSafeReturnUrl("/%09/example.invalid") !== "/gallery") {
      throw new Error("Scenario 8 Failed: Encoded tab (%09) external redirect was not prevented!");
    }
    if (getSafeReturnUrl("/\n/example.invalid") !== "/gallery") {
      throw new Error("Scenario 8 Failed: Newline external redirect was not prevented!");
    }
    if (getSafeReturnUrl("/%0a/example.invalid") !== "/gallery") {
      throw new Error("Scenario 8 Failed: Encoded newline (%0a) external redirect was not prevented!");
    }
    if (getSafeReturnUrl("/%0d/example.invalid") !== "/gallery") {
      throw new Error("Scenario 8 Failed: Encoded carriage return (%0d) external redirect was not prevented!");
    }
    if (getSafeReturnUrl("/%00/example.invalid") !== "/gallery") {
      throw new Error("Scenario 8 Failed: Encoded null byte (%00) was not prevented!");
    }

    // External protocol schemes
    if (getSafeReturnUrl("https://evil.com") !== "/gallery") throw new Error("Scenario 8 Failed: External https:// not prevented.");
    if (getSafeReturnUrl("javascript:alert(1)") !== "/gallery") throw new Error("Scenario 8 Failed: javascript: not prevented.");
    if (getSafeReturnUrl("data:text/html,evil") !== "/gallery") throw new Error("Scenario 8 Failed: data: not prevented.");

    // Auth loop paths & normalization bypasses
    if (getSafeReturnUrl("/login") !== "/gallery") throw new Error("Scenario 8 Failed: /login loop not prevented.");
    if (getSafeReturnUrl("/login?error=test") !== "/gallery") throw new Error("Scenario 8 Failed: /login query loop not prevented.");
    if (getSafeReturnUrl("/account-suspended") !== "/gallery") throw new Error("Scenario 8 Failed: /account-suspended loop not prevented.");
    if (getSafeReturnUrl("/onboarding") !== "/gallery") throw new Error("Scenario 8 Failed: /onboarding loop not prevented.");
    // Dot segment traversal bypass
    if (getSafeReturnUrl("/gallery/../login") !== "/gallery") {
      throw new Error("Scenario 8 Failed: Dot segment traversal '/gallery/../login' bypassed auth loop check!");
    }
    // Fragment bypass
    if (getSafeReturnUrl("/login#fragment") !== "/gallery") {
      throw new Error("Scenario 8 Failed: Fragment '/login#fragment' bypassed auth loop check!");
    }

    // Test the production callback route handler against the exact QA reproduction
    const { user: activeTestUser } = await createTestUser("member", "active");
    const maliciousCallbackReq = new NextRequest("http://localhost:3000/api/auth/redeem-callback?returnTo=%2F%09%2Fexample.invalid");
    const callbackRes = await handleRedeemCallback(maliciousCallbackReq, activeTestUser);
    if (callbackRes.status !== 307) {
      throw new Error(`Scenario 8 Failed: Expected HTTP 307 from callback, got ${callbackRes.status}`);
    }
    const redirectLocation = callbackRes.headers.get("location");
    if (!redirectLocation || redirectLocation.includes("example.invalid")) {
      throw new Error(`Scenario 8 Failed: Callback redirected to external origin: ${redirectLocation}`);
    }
    if (redirectLocation !== "http://localhost:3000/dashboard") {
      throw new Error(`Scenario 8 Failed: Expected safe fallback http://localhost:3000/dashboard, got ${redirectLocation}`);
    }

    // Valid Indonesian search parameter callback redirect test
    const validSearchCallbackReq = new NextRequest("http://localhost:3000/api/auth/redeem-callback?returnTo=%2Fgallery%3Fsearch%3Dstudi%2520warna");
    const validCallbackRes = await handleRedeemCallback(validSearchCallbackReq, activeTestUser);
    const validRedirectLocation = validCallbackRes.headers.get("location");
    if (validRedirectLocation !== "http://localhost:3000/gallery?search=studi%20warna") {
      throw new Error(`Scenario 8 Failed: Expected valid query redirect http://localhost:3000/gallery?search=studi%20warna, got ${validRedirectLocation}`);
    }

    // Pending user without invite: forwards returnTo to onboarding
    const { user: pendingUser } = await createTestUser("member", null);
    const pendingCallbackReq = new NextRequest("http://localhost:3000/api/auth/redeem-callback?returnTo=%2Fgallery%3Fsearch%3Dstudi%2520warna");
    const pendingRes = await handleRedeemCallback(pendingCallbackReq, pendingUser);
    const pendingLocation = pendingRes.headers.get("location");
    if (!pendingLocation?.startsWith("http://localhost:3000/onboarding?returnTo=")) {
      throw new Error(`Scenario 8 Failed: Expected onboarding redirect with returnTo, got ${pendingLocation}`);
    }

    console.log("  ✓ R09: getSafeReturnUrl and handleRedeemCallback verified against external redirects, dot-traversals, control characters, and preserved query parameters.");
  }

  console.log("\n=================================================================");
  console.log("✅ ALL PHASE 2 SECURITY & CONTRACT AUDIT SCENARIOS PASSED (100%)");
  console.log("=================================================================\n");
  process.exit(0);
}

runPhase2SecurityAndContractTests().catch((err) => {
  console.error("\n❌ PHASE 2 TEST FAILURE:", err);
  process.exit(1);
});
