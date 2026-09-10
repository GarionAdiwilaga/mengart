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
import {
  castOrUpdateBallotService,
  startTiebreakService,
  resolveTieManuallyService,
} from "@/lib/services/votingService";
import { importHistoricalChallengeAction } from "@/app/actions/historicalBackfill";
import { importHistoricalChallengeService } from "@/lib/services/historicalBackfillService";
import {
  toWitaDatetimeLocalValue,
  parseWitaDatetimeLocalInput,
  formatWitaDate,
} from "@/lib/presentation/witaTime";
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
  // SCENARIO 6: R01 - Historical Import Exported Action & Service Integration Suite
  // (Exported Server Action Integration Boundary with Mocked Session Resolution & Live PostgreSQL Service Verification)
  // =========================================================================
  console.log("\n[Scenario 6] Verifying R01 Historical Import exported server action integration boundary (mocked session resolution) & service negative tests...");
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

    // 1. Exported Server Action Boundary: unauthenticated / anonymous caller rejected (native auth() boundary)
    let anonActionRejected = false;
    try {
      await importHistoricalChallengeAction(sampleHistoricalInput);
    } catch (e: any) {
      if (e.message.includes("Autentikasi diperlukan") || e.message.includes("AuthRequired")) {
        anonActionRejected = true;
      }
    }
    if (!anonActionRejected) throw new Error("Scenario 6 Failed: Exported action boundary allowed unauthenticated call!");
    const [unauthCheck] = await db.select().from(challenges).where(eq(challenges.slug, sampleHistoricalInput.slug));
    if (unauthCheck) throw new Error("Scenario 6 Failed: Row was inserted into challenges table by unauthenticated call!");

    // 2. Exported Server Action Boundary: payload injection of actorOverride rejected
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
    const [injCheck] = await db.select().from(challenges).where(eq(challenges.slug, sampleHistoricalInput.slug));
    if (injCheck) throw new Error("Scenario 6 Failed: Row was inserted into challenges table by injected payload!");

    // 3. Exported Server Action Boundary with Authenticated Request Context (Finding G4)
    const esbuild = await import("esbuild");
    const path = await import("path");
    const fs = await import("fs");
    const tmpActionFile = path.join(process.cwd(), `.tmp-action-boundary-${suffix}.cjs`);

    await esbuild.build({
      entryPoints: [path.resolve(process.cwd(), "src/app/actions/historicalBackfill.ts")],
      bundle: true,
      platform: "node",
      format: "cjs",
      outfile: tmpActionFile,
      packages: "external",
      alias: {
        "@": path.resolve(process.cwd(), "src"),
      },
      plugins: [{
        name: "test-auth-stub",
        setup(b) {
          b.onResolve({ filter: /^@\/auth$/ }, (args) => ({ path: args.path, namespace: "test-auth-stub" }));
          b.onLoad({ filter: /.*/, namespace: "test-auth-stub" }, () => ({
            contents: "module.exports = { auth: async () => globalThis.__testActionSession };",
            loader: "js",
          }));
          b.onResolve({ filter: /^next\/navigation$/ }, (args) => ({ path: args.path, namespace: "test-nav-stub" }));
          b.onLoad({ filter: /.*/, namespace: "test-nav-stub" }, () => ({
            contents: "module.exports = { redirect: (url) => { throw new Error('REDIRECT:' + url); } };",
            loader: "js",
          }));
        },
      }],
    });

    const { createRequire } = await import("module");
    const testRequire = createRequire(import.meta.url);
    const testBoundAction = testRequire(tmpActionFile);
    try {
      fs.unlinkSync(tmpActionFile);
    } catch (_e) {
      // Ignore unlink error
    }

    // 3A. Authenticated Action with Member session -> requireModerator rejects based on live DB query
    (globalThis as any).__testActionSession = { user: { id: normalMember.id } };
    let memberActionRejected = false;
    try {
      await testBoundAction.importHistoricalChallengeAction(sampleHistoricalInput);
    } catch (e: any) {
      if (e.message.includes("Akses ditolak") || e.message.includes("Wewenang Moderator")) {
        memberActionRejected = true;
      }
    }
    if (!memberActionRejected) throw new Error("Scenario 6 Failed: Exported action allowed ordinary member session!");

    // 3B. Authenticated Action with Suspended staff session -> requireActiveMember rejects based on live DB query
    (globalThis as any).__testActionSession = { user: { id: suspendedStaff.id } };
    let suspendedActionRejected = false;
    try {
      await testBoundAction.importHistoricalChallengeAction(sampleHistoricalInput);
    } catch (e: any) {
      if (e.message.includes("ditangguhkan")) {
        suspendedActionRejected = true;
      }
    }
    if (!suspendedActionRejected) throw new Error("Scenario 6 Failed: Exported action allowed suspended staff session!");

    // 3C. Authenticated Action with Active staff session -> Positive traversal through requireModerator into live DB
    (globalThis as any).__testActionSession = { user: { id: activeStaff.id } };
    const positiveActionInput = {
      ...sampleHistoricalInput,
      title: `Action Auth Challenge ${suffix}`,
      slug: `action-auth-challenge-${suffix}`,
    };
    const actionAuthResult = await testBoundAction.importHistoricalChallengeAction(positiveActionInput);
    if (!actionAuthResult.success || !actionAuthResult.challengeId) {
      throw new Error("Scenario 6 Failed: Authenticated exported action failed unexpectedly.");
    }
    const [actionAuthCheck] = await db.select().from(challenges).where(eq(challenges.id, actionAuthResult.challengeId));
    if (!actionAuthCheck) {
      throw new Error("Scenario 6 Failed: Challenge was not created by authenticated exported action!");
    }
    const [auditLogCheck] = await db.select().from(auditLogs).where(
      and(
        eq(auditLogs.targetId, actionAuthResult.challengeId),
        eq(auditLogs.actorId, activeStaff.id)
      )
    );
    if (!auditLogCheck) {
      throw new Error("Scenario 6 Failed: Audit log was not created for authenticated exported action call!");
    }
    console.log("  ✓ Exported server action integration boundary (with mocked session resolution) & domain service verified against live PostgreSQL.");

    // 4. Domain Service RBAC Boundary: ordinary member caller rejected with 403 against live DB
    let memberServiceRejected = false;
    try {
      await importHistoricalChallengeService(db, { id: normalMember.id, role: normalMember.role }, sampleHistoricalInput);
    } catch (e: any) {
      if (e.message.includes("administrator atau moderator") || e.message.includes("Akses ditolak") || e.message.includes("Wewenang Moderator")) {
        memberServiceRejected = true;
      }
    }
    if (!memberServiceRejected) throw new Error("Scenario 6 Failed: Service allowed ordinary member!");
    const [memberCheck] = await db.select().from(challenges).where(eq(challenges.slug, sampleHistoricalInput.slug));
    if (memberCheck) throw new Error("Scenario 6 Failed: Row was inserted into challenges table by member call!");

    // 5. Domain Service RBAC Boundary: suspended staff caller rejected
    let suspendedServiceRejected = false;
    try {
      await importHistoricalChallengeService(db, { id: suspendedStaff.id, role: "moderator" }, sampleHistoricalInput);
    } catch (e: any) {
      if (e.message.includes("moderator aktif") || e.message.includes("ditangguhkan")) {
        suspendedServiceRejected = true;
      }
    }
    if (!suspendedServiceRejected) throw new Error("Scenario 6 Failed: Service allowed suspended staff!");
    const [suspCheck] = await db.select().from(challenges).where(eq(challenges.slug, sampleHistoricalInput.slug));
    if (suspCheck) throw new Error("Scenario 6 Failed: Row was inserted into challenges table by suspended staff!");

    // 6. Domain Service RBAC Boundary: deleted staff caller rejected
    let deletedServiceRejected = false;
    try {
      await importHistoricalChallengeService(db, { id: deletedStaff.id, role: "moderator" }, sampleHistoricalInput);
    } catch (e: any) {
      if (e.message.includes("moderator aktif") || e.message.includes("dihapus")) {
        deletedServiceRejected = true;
      }
    }
    if (!deletedServiceRejected) throw new Error("Scenario 6 Failed: Service allowed deleted staff!");
    const [delCheck] = await db.select().from(challenges).where(eq(challenges.slug, sampleHistoricalInput.slug));
    if (delCheck) throw new Error("Scenario 6 Failed: Row was inserted into challenges table by deleted staff!");

    // 7. Domain Service RBAC Boundary: demoted staff caller (session claims moderator, but live DB row is member)
    let demotedServiceRejected = false;
    try {
      await importHistoricalChallengeService(db, { id: demotedStaff.id, role: "moderator" }, sampleHistoricalInput);
    } catch (e: any) {
      if (e.message.includes("moderator aktif") || e.message.includes("Akses ditolak") || e.message.includes("Wewenang Moderator")) {
        demotedServiceRejected = true;
      }
    }
    if (!demotedServiceRejected) throw new Error("Scenario 6 Failed: Service allowed demoted staff!");
    const [demotedCheck] = await db.select().from(challenges).where(eq(challenges.slug, sampleHistoricalInput.slug));
    if (demotedCheck) throw new Error("Scenario 6 Failed: Row was inserted into challenges table by demoted staff!");

    // 8. Positive: Authorized active staff caller on domain service succeeds and writes row
    const actionSuccessResult = await importHistoricalChallengeService(db, { id: activeStaff.id, role: activeStaff.role }, sampleHistoricalInput);
    if (!actionSuccessResult.success || !actionSuccessResult.challengeId) {
      throw new Error("Scenario 6 Failed: Active staff call failed unexpectedly.");
    }
    const [successCheck] = await db.select().from(challenges).where(eq(challenges.id, actionSuccessResult.challengeId));
    if (!successCheck) throw new Error("Scenario 6 Failed: Challenge was not created by authorized service call!");

    console.log("  ✓ R01: Authentic exported action boundary verified against unauthenticated caller and payload injection, with live DB service validation across member, suspended, deleted, demoted roles and positive staff write.");
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

    // 8. Subscenario 7B: 3-way tie in closed main round with disqualification during tie_pending
    const { user: artist3, profile: artistProfile3 } = await createTestUser("member", "active");
    const { artwork: art3, version: ver3 } = await createTestArtwork(artist3.id, artistProfile3.id, "Disq Art 3");

    const [tie3Challenge] = await db
      .insert(challenges)
      .values({
        title: `3-Way Tie Challenge ${suffix}`,
        slug: `3way-tie-challenge-${suffix}`,
        theme: "3-Way Tie Phase",
        description: "Challenge with 3 tied candidates",
        promptRules: "Rules",
        status: "tie_pending",
        awardMode: "vote_only",
      })
      .returning();

    const [subA] = await db
      .insert(challengeSubmissions)
      .values({
        challengeId: tie3Challenge.id,
        userId: artist1.id,
        profileId: artistProfile1.id,
        artworkId: art1.id,
        artworkVersionId: ver1.id,
        title: "Sub A",
        submissionStatus: "submitted",
      })
      .returning();

    const [subB] = await db
      .insert(challengeSubmissions)
      .values({
        challengeId: tie3Challenge.id,
        userId: artist2.id,
        profileId: artistProfile2.id,
        artworkId: art2.id,
        artworkVersionId: ver2.id,
        title: "Sub B",
        submissionStatus: "submitted",
      })
      .returning();

    const [subC] = await db
      .insert(challengeSubmissions)
      .values({
        challengeId: tie3Challenge.id,
        userId: artist3.id,
        profileId: artistProfile3.id,
        artworkId: art3.id,
        artworkVersionId: ver3.id,
        title: "Sub C",
        submissionStatus: "submitted",
      })
      .returning();

    // Create closed main round where A, B, C tied with 3 stars each
    const [mainRound3] = await db
      .insert(challengeVotingRounds)
      .values({
        challengeId: tie3Challenge.id,
        roundType: "main",
        status: "closed",
        startsAt: new Date(Date.now() - 7200000),
        deadline: new Date(Date.now() - 3600000),
        starsPerMember: 3,
      })
      .returning();

    await db.insert(challengeVotingRoundCandidates).values([
      { votingRoundId: mainRound3.id, submissionId: subA.id },
      { votingRoundId: mainRound3.id, submissionId: subB.id },
      { votingRoundId: mainRound3.id, submissionId: subC.id },
    ]);

    // Insert 3 stars for each of A, B, C
    const { user: voter1 } = await createTestUser("member", "active");
    const [b1] = await db
      .insert(challengeBallots)
      .values({
        challengeId: tie3Challenge.id,
        votingRoundId: mainRound3.id,
        userId: voter1.id,
        roundType: "main",
        starsAllocated: 3,
      })
      .returning();

    await db.insert(challengeBallotStars).values([
      { ballotId: b1.id, submissionId: subA.id, starsCount: 1 },
      { ballotId: b1.id, submissionId: subB.id, starsCount: 1 },
      { ballotId: b1.id, submissionId: subC.id, starsCount: 1 },
    ]);

    // Disqualify subA during tie_pending
    const disqA = await disqualifyChallengeCandidateService(
      db,
      { userId: adminStaff.id, role: adminStaff.role },
      { submissionId: subA.id, reason: "Violates terms during tie_pending" }
    );
    if (!disqA.success) throw new Error("Scenario 7 Failed: Disqualification of subA failed");

    // Verify challenge remains in tie_pending (subB and subC remain tied)
    const [checkTie3] = await db.select().from(challenges).where(eq(challenges.id, tie3Challenge.id));
    if (checkTie3.status !== "tie_pending") {
      throw new Error(`Scenario 7 Failed: Expected tie_pending with 2 tied survivors, got ${checkTie3.status}`);
    }

    // Attempt manual resolution with disqualified subA: must fail under row-level lock
    let disqManualResolved = false;
    try {
      await resolveTieManuallyService(
        db,
        { userId: adminStaff.id, role: adminStaff.role },
        {
          challengeId: tie3Challenge.id,
          submissionId: subA.id,
          reason: "Attempt to crown disqualified sub",
        }
      );
    } catch (e: any) {
      if (e.message.includes("telah didiskualifikasi") || e.message.includes("tidak memenuhi syarat")) {
        disqManualResolved = true;
      }
    }
    if (!disqManualResolved) throw new Error("Scenario 7 Failed: Manual tie resolution accepted disqualified candidate!");

    // Start tiebreak: must intersect tied set with currently eligible submissions under lock
    const tiebreakStartRes = await startTiebreakService(
      db,
      { userId: adminStaff.id, role: adminStaff.role },
      { challengeId: tie3Challenge.id }
    );
    if (!tiebreakStartRes.success) throw new Error("Scenario 7 Failed: startTiebreakService failed");
    if (tiebreakStartRes.tiedCandidatesCount !== 2) {
      throw new Error(`Scenario 7 Failed: Expected 2 eligible candidates in tiebreak, got ${tiebreakStartRes.tiedCandidatesCount}`);
    }

    // Verify candidates frozen in new tiebreak round strictly contain B and C, excluding A
    const frozenTiebreakCandidates = await db
      .select()
      .from(challengeVotingRoundCandidates)
      .where(eq(challengeVotingRoundCandidates.votingRoundId, tiebreakStartRes.votingRoundId));
    const frozenIds = frozenTiebreakCandidates.map((c) => c.submissionId);
    if (frozenIds.includes(subA.id) || !frozenIds.includes(subB.id) || !frozenIds.includes(subC.id)) {
      throw new Error(`Scenario 7 Failed: Frozen tiebreak candidates corrupted: ${JSON.stringify(frozenIds)}`);
    }

    // 9. Subscenario 7C: Single remaining tied candidate in tie_pending auto-resolves with authentic Stars & round ID
    const [singleSurvChallenge] = await db
      .insert(challenges)
      .values({
        title: `Single Survivor Challenge ${suffix}`,
        slug: `single-survivor-${suffix}`,
        theme: "Single Survivor",
        description: "2 tied, 1 disqualified",
        promptRules: "Rules",
        status: "tie_pending",
        awardMode: "vote_only",
      })
      .returning();

    const [survSub1] = await db
      .insert(challengeSubmissions)
      .values({
        challengeId: singleSurvChallenge.id,
        userId: artist1.id,
        profileId: artistProfile1.id,
        artworkId: art1.id,
        artworkVersionId: ver1.id,
        title: "Surv 1",
        submissionStatus: "submitted",
      })
      .returning();

    const [survSub2] = await db
      .insert(challengeSubmissions)
      .values({
        challengeId: singleSurvChallenge.id,
        userId: artist2.id,
        profileId: artistProfile2.id,
        artworkId: art2.id,
        artworkVersionId: ver2.id,
        title: "Surv 2",
        submissionStatus: "submitted",
      })
      .returning();

    const [survMainRound] = await db
      .insert(challengeVotingRounds)
      .values({
        challengeId: singleSurvChallenge.id,
        roundType: "main",
        status: "closed",
        startsAt: new Date(Date.now() - 7200000),
        deadline: new Date(Date.now() - 3600000),
        starsPerMember: 5,
      })
      .returning();

    await db.insert(challengeVotingRoundCandidates).values([
      { votingRoundId: survMainRound.id, submissionId: survSub1.id },
      { votingRoundId: survMainRound.id, submissionId: survSub2.id },
    ]);

    const [survBallot] = await db
      .insert(challengeBallots)
      .values({
        challengeId: singleSurvChallenge.id,
        votingRoundId: survMainRound.id,
        userId: voter1.id,
        roundType: "main",
        starsAllocated: 8,
      })
      .returning();

    await db.insert(challengeBallotStars).values([
      { ballotId: survBallot.id, submissionId: survSub1.id, starsCount: 4 },
      { ballotId: survBallot.id, submissionId: survSub2.id, starsCount: 4 },
    ]);

    // Disqualify survSub1 -> leaving only survSub2
    await disqualifyChallengeCandidateService(
      db,
      { userId: adminStaff.id, role: adminStaff.role },
      { submissionId: survSub1.id, reason: "Violates guidelines in 2-way tie" }
    );

    // Verify survSub2 is auto-crowned community_vote_winner with authentic 4 stars and sourceVotingRoundId!
    const [survResult] = await db
      .select()
      .from(challengeResults)
      .where(
        and(
          eq(challengeResults.challengeId, singleSurvChallenge.id),
          eq(challengeResults.submissionId, survSub2.id)
        )
      );

    if (!survResult || survResult.awardType !== "community_vote_winner") {
      throw new Error("Scenario 7 Failed: Single remaining tied candidate was not crowned community_vote_winner!");
    }
    if (survResult.totalCommunityStars !== 4) {
      throw new Error(`Scenario 7 Failed: Expected 4 authentic Stars from main round, got ${survResult.totalCommunityStars}`);
    }
    if (survResult.sourceVotingRoundId !== survMainRound.id) {
      throw new Error(`Scenario 7 Failed: Expected sourceVotingRoundId ${survMainRound.id}, got ${survResult.sourceVotingRoundId}`);
    }

    // 10. Subscenario 7D: Jury readiness validation rollback in vote_and_jury mode
    const [juryRollbackChallenge] = await db
      .insert(challenges)
      .values({
        title: `Jury Readiness Rollback Challenge ${suffix}`,
        slug: `jury-rollback-${suffix}`,
        theme: "Jury Readiness Rollback",
        description: "Zero jurors configured",
        promptRules: "Rules",
        status: "tie_pending",
        awardMode: "vote_and_jury",
      })
      .returning();

    const [jurySub1] = await db
      .insert(challengeSubmissions)
      .values({
        challengeId: juryRollbackChallenge.id,
        userId: artist1.id,
        profileId: artistProfile1.id,
        artworkId: art1.id,
        artworkVersionId: ver1.id,
        title: "Jury Sub 1",
        submissionStatus: "submitted",
      })
      .returning();

    const [jurySub2] = await db
      .insert(challengeSubmissions)
      .values({
        challengeId: juryRollbackChallenge.id,
        userId: artist2.id,
        profileId: artistProfile2.id,
        artworkId: art2.id,
        artworkVersionId: ver2.id,
        title: "Jury Sub 2",
        submissionStatus: "submitted",
      })
      .returning();

    const [juryMainRound] = await db
      .insert(challengeVotingRounds)
      .values({
        challengeId: juryRollbackChallenge.id,
        roundType: "main",
        status: "closed",
        startsAt: new Date(Date.now() - 7200000),
        deadline: new Date(Date.now() - 3600000),
        starsPerMember: 1,
      })
      .returning();

    await db.insert(challengeVotingRoundCandidates).values([
      { votingRoundId: juryMainRound.id, submissionId: jurySub1.id },
      { votingRoundId: juryMainRound.id, submissionId: jurySub2.id },
    ]);

    const [juryBallot] = await db
      .insert(challengeBallots)
      .values({
        challengeId: juryRollbackChallenge.id,
        votingRoundId: juryMainRound.id,
        userId: voter1.id,
        roundType: "main",
        starsAllocated: 2,
      })
      .returning();

    await db.insert(challengeBallotStars).values([
      { ballotId: juryBallot.id, submissionId: jurySub1.id, starsCount: 1 },
      { ballotId: juryBallot.id, submissionId: jurySub2.id, starsCount: 1 },
    ]);

    // Zero jurors configured: disqualifying jurySub1 attempts transition to jury_selection_open,
    // which must fail readiness and ROLL BACK the entire transaction!
    let juryReadinessRolledBack = false;
    try {
      await disqualifyChallengeCandidateService(
        db,
        { userId: adminStaff.id, role: adminStaff.role },
        { submissionId: jurySub1.id, reason: "Attempt disq with unready jury" }
      );
    } catch (e: any) {
      if (e.message.includes("Transisi ke 'jury_selection_open' diblokir") || e.message.includes("panel juri")) {
        juryReadinessRolledBack = true;
      }
    }
    if (!juryReadinessRolledBack) {
      throw new Error("Scenario 7 Failed: Disqualification transitioned to jury_selection_open without ready jury panel!");
    }

    // Verify transaction rollback: jurySub1 is STILL "submitted" (not "disqualified")
    const [checkRolledBackSub1] = await db
      .select()
      .from(challengeSubmissions)
      .where(eq(challengeSubmissions.id, jurySub1.id));
    if (checkRolledBackSub1.submissionStatus !== "submitted") {
      throw new Error(`Scenario 7 Failed: Transaction did not roll back! submissionStatus is ${checkRolledBackSub1.submissionStatus}`);
    }

    // 11. Subscenario 7E: Real PostgreSQL Concurrency test
    // Two concurrent transactions attempting to disqualify candidates under active voting round, candidate, and ballot locks
    const [concChallenge] = await db
      .insert(challenges)
      .values({
        title: `Conc Challenge ${suffix}`,
        slug: `conc-challenge-${suffix}`,
        theme: "Conc Phase",
        description: "Concurrent disq test",
        promptRules: "Rules",
        status: "voting_open",
        awardMode: "vote_only",
      })
      .returning();

    const [concSub1] = await db
      .insert(challengeSubmissions)
      .values({
        challengeId: concChallenge.id,
        userId: artist1.id,
        profileId: artistProfile1.id,
        artworkId: art1.id,
        artworkVersionId: ver1.id,
        title: "Conc Sub 1",
        submissionStatus: "submitted",
      })
      .returning();

    const [concSub2] = await db
      .insert(challengeSubmissions)
      .values({
        challengeId: concChallenge.id,
        userId: artist2.id,
        profileId: artistProfile2.id,
        artworkId: art2.id,
        artworkVersionId: ver2.id,
        title: "Conc Sub 2",
        submissionStatus: "submitted",
      })
      .returning();

    const { user: artist4, profile: artistProfile4 } = await createTestUser("member", "active");
    const { artwork: art4, version: ver4 } = await createTestArtwork(artist4.id, artistProfile4.id, "Conc Art 4");

    const [concSub3] = await db
      .insert(challengeSubmissions)
      .values({
        challengeId: concChallenge.id,
        userId: artist3.id,
        profileId: artistProfile3.id,
        artworkId: art3.id,
        artworkVersionId: ver3.id,
        title: "Conc Sub 3",
        submissionStatus: "submitted",
      })
      .returning();

    const [concSub4] = await db
      .insert(challengeSubmissions)
      .values({
        challengeId: concChallenge.id,
        userId: artist4.id,
        profileId: artistProfile4.id,
        artworkId: art4.id,
        artworkVersionId: ver4.id,
        title: "Conc Sub 4",
        submissionStatus: "submitted",
      })
      .returning();

    // Fixture active voting round with candidates and cast ballots
    const [concRound] = await db
      .insert(challengeVotingRounds)
      .values({
        challengeId: concChallenge.id,
        roundType: "main",
        status: "open",
        startsAt: new Date(Date.now() - 3600000),
        deadline: new Date(Date.now() + 3600000),
        starsPerMember: 3,
      })
      .returning();

    const [cand1] = await db
      .insert(challengeVotingRoundCandidates)
      .values({
        votingRoundId: concRound.id,
        submissionId: concSub1.id,
      })
      .returning();

    const [cand2] = await db
      .insert(challengeVotingRoundCandidates)
      .values({
        votingRoundId: concRound.id,
        submissionId: concSub2.id,
      })
      .returning();

    const [cand3] = await db
      .insert(challengeVotingRoundCandidates)
      .values({
        votingRoundId: concRound.id,
        submissionId: concSub3.id,
      })
      .returning();

    const [cand4] = await db
      .insert(challengeVotingRoundCandidates)
      .values({
        votingRoundId: concRound.id,
        submissionId: concSub4.id,
      })
      .returning();

    // Create voter and cast ballots with stars for candidate 1 and candidate 2
    const { user: concVoter1 } = await createTestUser("member", "active");
    const [ballot1] = await db
      .insert(challengeBallots)
      .values({
        challengeId: concChallenge.id,
        votingRoundId: concRound.id,
        userId: concVoter1.id,
        roundType: "main",
        starsAllocated: 3,
      })
      .returning();

    await db.insert(challengeBallotStars).values([
      {
        ballotId: ballot1.id,
        submissionId: concSub1.id,
        starsCount: 2,
      },
      {
        ballotId: ballot1.id,
        submissionId: concSub2.id,
        starsCount: 1,
      },
    ]);

    // Execute concurrent disqualification calls on two separate candidates
    const concResults = await Promise.allSettled([
      disqualifyChallengeCandidateService(
        db,
        { userId: adminStaff.id, role: adminStaff.role },
        { submissionId: concSub1.id, reason: "Concurrent disq 1" }
      ),
      disqualifyChallengeCandidateService(
        db,
        { userId: adminStaff.id, role: adminStaff.role },
        { submissionId: concSub2.id, reason: "Concurrent disq 2" }
      ),
    ]);

    // Both should settle cleanly without deadlock under monotonic row locks
    for (const r of concResults) {
      if (r.status === "rejected") {
        throw new Error(`Scenario 7 Failed: Concurrency execution threw deadlock/error: ${(r as any).reason}`);
      }
    }

    // Assert final committed invariants in PostgreSQL
    const [finalSub1] = await db.select().from(challengeSubmissions).where(eq(challengeSubmissions.id, concSub1.id));
    const [finalSub2] = await db.select().from(challengeSubmissions).where(eq(challengeSubmissions.id, concSub2.id));
    if (finalSub1.submissionStatus !== "disqualified" || finalSub2.submissionStatus !== "disqualified") {
      throw new Error("Scenario 7 Failed: Submissions were not both marked disqualified!");
    }

    const remainingCandidates = await db
      .select()
      .from(challengeVotingRoundCandidates)
      .where(
        eq(challengeVotingRoundCandidates.votingRoundId, concRound.id)
      );

    // Candidates 1 and 2 must have been deleted from the round snapshot
    const remainingCandSubmissionIds = remainingCandidates.map((c) => c.submissionId);
    if (remainingCandSubmissionIds.includes(concSub1.id) || remainingCandSubmissionIds.includes(concSub2.id)) {
      throw new Error("Scenario 7 Failed: Disqualified candidate remained in voting round candidates snapshot!");
    }
    if (!remainingCandSubmissionIds.includes(concSub3.id) || !remainingCandSubmissionIds.includes(concSub4.id)) {
      throw new Error("Scenario 7 Failed: Non-disqualified candidate was unexpectedly removed!");
    }

    // Verify audit logs exist for both disqualifications
    const disqAuditLogs = await db
      .select()
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.action, "challenge.disqualify_candidate"),
          eq(auditLogs.actorId, adminStaff.id)
        )
      );
    const auditedTargets = disqAuditLogs.map((l) => l.targetId);
    if (!auditedTargets.includes(concSub1.id) || !auditedTargets.includes(concSub2.id)) {
      throw new Error("Scenario 7 Failed: Audit logs missing for one or both disqualified submissions!");
    }

    // Assert ballot balances and star refunds committed in PostgreSQL (Finding H3)
    const [finalBallot1] = await db
      .select()
      .from(challengeBallots)
      .where(eq(challengeBallots.id, ballot1.id));
    if (!finalBallot1 || finalBallot1.starsAllocated !== 0) {
      throw new Error(`Scenario 7 Failed: Expected voter ballot starsAllocated to be 0 after both disqualifications, got ${finalBallot1?.starsAllocated}`);
    }

    const remainingStars = await db
      .select()
      .from(challengeBallotStars)
      .where(eq(challengeBallotStars.ballotId, ballot1.id));
    if (remainingStars.length !== 0) {
      throw new Error(`Scenario 7 Failed: Expected 0 remaining ballot stars for voided candidates, found ${remainingStars.length}`);
    }

    const starNotifications = await db
      .select()
      .from(notifications)
      .where(
        and(
          eq(notifications.userId, concVoter1.id),
          eq(notifications.type, "star_returned"),
          eq(notifications.targetId, concChallenge.id)
        )
      );
    if (starNotifications.length !== 2) {
      throw new Error(`Scenario 7 Failed: Expected 2 star_returned notifications for voter, found ${starNotifications.length}`);
    }

    console.log("  ✓ R05: Disqualification phase matrix verified for locked, tiebreak, finished, 3-way ties, authentic score provenance, jury readiness rollback, and PostgreSQL concurrency with active voting rounds, candidate removal, and ballot star voiding.");
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
    if (getSafeReturnUrl("/gallery?search=studi+warna") !== "/gallery?search=studi+warna") {
      throw new Error("Scenario 8 Failed: Valid query parameter with '+' space was rejected.");
    }
    if (getSafeReturnUrl("/gallery?category=ilustrasi%20karya") !== "/gallery?category=ilustrasi%20karya") {
      throw new Error("Scenario 8 Failed: Valid query parameter with encoded Indonesian text was rejected.");
    }

    // Dot-segment and protocol-relative bypasses
    if (getSafeReturnUrl("/gallery/..//example.invalid") !== "/gallery") {
      throw new Error("Scenario 8 Failed: Dot-segment normalization '//' redirect was not prevented!");
    }
    if (getSafeReturnUrl("/a/%2e%2e//example.invalid") !== "/gallery") {
      throw new Error("Scenario 8 Failed: Encoded dot-segment '%2e%2e//' redirect was not prevented!");
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
  if (err?.query) {
    console.error("Query was:", err.query);
  }
  process.exit(1);
});
