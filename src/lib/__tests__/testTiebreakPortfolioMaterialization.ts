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
  challengeResults,
} from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { disqualifyChallengeCandidateService } from "@/lib/services/challengeService";
import { resolveChallengeSubmissionCaption } from "@/lib/services/portfolioService";

async function runTiebreakPortfolioMaterializationTests() {
  console.log("=== Starting Tiebreak Portfolio Materialization Regression Tests (F4 / R05) ===");

  const suffix = Date.now().toString().slice(-6);

  async function createTestUser(role: "member" | "moderator" | "admin") {
    const idSuffix = Math.random().toString(36).substring(2, 7);
    const [user] = await db
      .insert(users)
      .values({
        email: `tiebreak_${role}_${idSuffix}_${suffix}@mengart.local`,
        username: `tb_${role}_${idSuffix}_${suffix}`,
        role,
        membershipStatus: "active",
      })
      .returning();

    const [profile] = await db
      .insert(profiles)
      .values({
        userId: user.id,
        slug: `artist-${user.username}`,
        displayName: `Test ${role} ${idSuffix}`,
        avatarUrl: "https://example.com/avatar.jpg",
        profileStatus: "active_public",
      })
      .returning();

    return { user, profile };
  }

  async function createTestArtwork(userId: string, profileId: string, title: string) {
    const [artwork] = await db
      .insert(artworks)
      .values({
        userId,
        title,
        description: "Test Artwork for tiebreak portfolio test",
        slug: `tb-art-${Math.random().toString(36).substring(2, 8)}-${suffix}`,
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

    return { artwork, version };
  }

  // 1. Setup staff and candidates
  const { user: adminStaff } = await createTestUser("admin");
  const { user: artist1, profile: profile1 } = await createTestUser("member");
  const { user: artist2, profile: profile2 } = await createTestUser("member");

  const { artwork: art1, version: ver1 } = await createTestArtwork(artist1.id, profile1.id, "Candidate Art 1");
  const { artwork: art2, version: ver2 } = await createTestArtwork(artist2.id, profile2.id, "Candidate Art 2");

  // 2. Setup Challenge in tiebreak_open
  const [challenge] = await db
    .insert(challenges)
    .values({
      title: `Tiebreak Portfolio Challenge ${suffix}`,
      slug: `tb-portfolio-challenge-${suffix}`,
      theme: "Tiebreak Completion Theme",
      description: "Testing portfolio materialization on tiebreak resolution",
      promptRules: "Rules",
      status: "tiebreak_open",
      awardMode: "vote_only",
    })
    .returning();

  // 3. Create submissions
  const [sub1] = await db
    .insert(challengeSubmissions)
    .values({
      challengeId: challenge.id,
      userId: artist1.id,
      profileId: profile1.id,
      artworkId: art1.id,
      artworkVersionId: ver1.id,
      title: "Candidate Art 1",
      submissionStatus: "submitted",
    })
    .returning();

  const [sub2] = await db
    .insert(challengeSubmissions)
    .values({
      challengeId: challenge.id,
      userId: artist2.id,
      profileId: profile2.id,
      artworkId: art2.id,
      artworkVersionId: ver2.id,
      title: "Candidate Art 2",
      submissionStatus: "submitted",
    })
    .returning();

  // Verify initially ZERO portfolio entries exist for either artwork
  const initialPortfolio1 = await db
    .select()
    .from(portfolioEntries)
    .where(eq(portfolioEntries.artworkId, art1.id));
  const initialPortfolio2 = await db
    .select()
    .from(portfolioEntries)
    .where(eq(portfolioEntries.artworkId, art2.id));

  if (initialPortfolio1.length !== 0 || initialPortfolio2.length !== 0) {
    throw new Error("Precondition failed: Portfolio entries already exist before tiebreak resolution");
  }
  console.log("  ✓ Precondition verified: 0 portfolio entries for submissions prior to resolution");

  // 4. Create tiebreak voting round
  const [tiebreakRound] = await db
    .insert(challengeVotingRounds)
    .values({
      challengeId: challenge.id,
      roundType: "tiebreak",
      status: "open",
      starsPerMember: 1,
    })
    .returning();

  await db.insert(challengeVotingRoundCandidates).values([
    { votingRoundId: tiebreakRound.id, submissionId: sub1.id },
    { votingRoundId: tiebreakRound.id, submissionId: sub2.id },
  ]);

  // 5. Execute Disqualification of sub1 by adminStaff
  console.log("\n[Test Scenario] Disqualify tiebreak candidate sub1 to leave sub2 as single survivor");
  const disqResult = await disqualifyChallengeCandidateService(
    db,
    { userId: adminStaff.id, role: adminStaff.role },
    { submissionId: sub1.id, reason: "Single survivor tiebreak resolution test" }
  );

  if (!disqResult.success) {
    throw new Error(`Disqualification failed: ${disqResult.error}`);
  }
  console.log("  ✓ Disqualification executed successfully");

  // 6. Assert Challenge status advanced to 'finished'
  const [updatedChallenge] = await db
    .select()
    .from(challenges)
    .where(eq(challenges.id, challenge.id));

  if (updatedChallenge.status !== "finished") {
    throw new Error(`Expected challenge status 'finished', got '${updatedChallenge.status}'`);
  }
  console.log("  ✓ Challenge status successfully advanced to 'finished'");

  // 7. Assert challengeResults contains Community Winner for sub2
  const results = await db
    .select()
    .from(challengeResults)
    .where(eq(challengeResults.challengeId, challenge.id));

  const winnerResult = results.find((r) => r.submissionId === sub2.id);
  if (!winnerResult || winnerResult.awardType !== "community_vote_winner") {
    throw new Error("Remaining survivor sub2 was not crowned community_vote_winner");
  }
  console.log("  ✓ Survivor crowned community_vote_winner in challengeResults");

  // 8. Assert portfolio_entries materialized for survivor sub2
  const winnerPortfolio = await db
    .select()
    .from(portfolioEntries)
    .where(eq(portfolioEntries.artworkId, art2.id));

  if (winnerPortfolio.length !== 1) {
    throw new Error(
      `F4 / R05 REGRESSION: Expected 1 materialized portfolio entry for survivor, found ${winnerPortfolio.length}`
    );
  }

  const expectedCaption = resolveChallengeSubmissionCaption(challenge.title, [
    { awardType: "community_vote_winner", categoryLabel: null },
  ]);

  if (winnerPortfolio[0].systemCaption !== expectedCaption) {
    throw new Error(
      `Expected systemCaption "${expectedCaption}", got "${winnerPortfolio[0].systemCaption}"`
    );
  }
  if (!winnerPortfolio[0].isVisible) {
    throw new Error("Materialized portfolio entry must be marked isVisible: true");
  }
  console.log(`  ✓ Portfolio entry successfully materialized: "${winnerPortfolio[0].systemCaption}"`);

  // 9. Assert disqualified sub1 was NOT added to portfolio
  const disqualifiedPortfolio = await db
    .select()
    .from(portfolioEntries)
    .where(eq(portfolioEntries.artworkId, art1.id));

  if (disqualifiedPortfolio.length !== 0) {
    throw new Error("Disqualified submission must not have portfolio entries created");
  }
  console.log("  ✓ Disqualified submission correctly excluded from portfolio materialization");

  console.log("\n=== ALL TIEBREAK PORTFOLIO MATERIALIZATION TESTS PASSED (100%) ===");
}

runTiebreakPortfolioMaterializationTests()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error("Tiebreak portfolio test failed:", err);
    process.exit(1);
  });
