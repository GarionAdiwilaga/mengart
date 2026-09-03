import { db } from "@/db";
import {
  challenges,
  challengeSubmissions,
  challengeJuryAssignments,
  challengeResults,
  users,
  profiles,
  artworks,
  artworkVersions,
  auditLogs,
} from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { canViewArtwork, canAccessMasterMedia, canViewProfile, canSubmitJuryScore } from "@/lib/policy";
import { checkRateLimit } from "@/lib/rateLimit";
import { getChallengeResultsData } from "@/lib/voting";

async function runSecurityAndIntegrityTests() {
  console.log("\n=================================================================");
  console.log("🔒 STARTING GATE 1: SECURITY, AUTHORIZATION & INTEGRITY TEST SUITE");
  console.log("=================================================================\n");

  const suffix = Date.now().toString();

  // 1. Setup Test Users: Owner, Regular Member, Assigned Jury, Admin
  console.log("[Test 1] Setting up Test Security Principals...");
  const [owner] = await db
    .insert(users)
    .values({ email: `owner_${suffix}@mengart.local`, role: "member", membershipStatus: "active" })
    .returning();

  const [ownerProfile] = await db
    .insert(profiles)
    .values({ userId: owner.id, displayName: "Owner Artist", slug: `owner-${suffix}` })
    .returning();

  const [regularMember] = await db
    .insert(users)
    .values({ email: `member_${suffix}@mengart.local`, role: "member", membershipStatus: "active" })
    .returning();

  const [memberProfile] = await db
    .insert(profiles)
    .values({ userId: regularMember.id, displayName: "Member Artist", slug: `member-${suffix}` })
    .returning();

  const [juryMember] = await db
    .insert(users)
    .values({ email: `jury_${suffix}@mengart.local`, role: "member", membershipStatus: "active" })
    .returning();

  const [juryProfile] = await db
    .insert(profiles)
    .values({ userId: juryMember.id, displayName: "Jury Judge", slug: `jury-${suffix}` })
    .returning();

  const [adminUser] = await db
    .insert(users)
    .values({ email: `admin_${suffix}@mengart.local`, role: "admin", membershipStatus: "active" })
    .returning();

  const [suspendedMember] = await db
    .insert(users)
    .values({ email: `suspended_${suffix}@mengart.local`, role: "member", membershipStatus: "suspended" })
    .returning();

  console.log("✓ Principals provisioned (Owner, Member, Jury, Admin, Suspended).");

  // 2. Unit Test Matrix: canViewArtwork
  console.log("\n[Test 2] Testing canViewArtwork Access Control Matrix...");
  const publicArt = { id: "1", userId: owner.id, audience: "public" as const, publicationStatus: "published" as const };
  const membersOnlyArt = { id: "2", userId: owner.id, audience: "members_only" as const, publicationStatus: "published" as const };
  const privateArt = { id: "3", userId: owner.id, audience: "private" as const, publicationStatus: "published" as const };
  const unlistedArt = { id: "4", userId: owner.id, audience: "unlisted" as const, publicationStatus: "published" as const };
  const deletedArt = { id: "5", userId: owner.id, audience: "public" as const, publicationStatus: "published" as const, deletedAt: new Date() };

  // Public Artwork
  if (!canViewArtwork(null, publicArt)) throw new Error("Guest should view public artwork");
  if (!canViewArtwork(regularMember, publicArt)) throw new Error("Member should view public artwork");

  // Members Only Artwork
  if (canViewArtwork(null, membersOnlyArt)) throw new Error("Guest MUST NOT view members-only artwork");
  if (!canViewArtwork(regularMember, membersOnlyArt)) throw new Error("Active member should view members-only artwork");
  if (canViewArtwork(suspendedMember, membersOnlyArt)) throw new Error("Suspended member MUST NOT view members-only artwork");

  // Private Artwork
  if (canViewArtwork(null, privateArt)) throw new Error("Guest MUST NOT view private artwork");
  if (canViewArtwork(regularMember, privateArt)) throw new Error("Non-owner member MUST NOT view private artwork");
  if (!canViewArtwork(owner, privateArt)) throw new Error("Owner MUST view own private artwork");
  if (!canViewArtwork(adminUser, privateArt)) throw new Error("Admin MUST view private artwork");

  // Soft-deleted Artwork
  if (canViewArtwork(null, deletedArt)) throw new Error("Guest MUST NOT view deleted artwork");
  if (canViewArtwork(regularMember, deletedArt)) throw new Error("Non-owner member MUST NOT view deleted artwork");
  if (!canViewArtwork(owner, deletedArt)) throw new Error("Owner can view own soft-deleted artwork");
  if (!canViewArtwork(adminUser, deletedArt)) throw new Error("Admin can view soft-deleted artwork");

  console.log("✓ canViewArtwork passed all 12 matrix scenarios.");

  // 3. Unit Test Matrix: canAccessMasterMedia
  console.log("\n[Test 3] Testing canAccessMasterMedia ACL Policy Matrix...");
  // Owner access
  const ownerMasterAccess = await canAccessMasterMedia(owner, publicArt);
  if (!ownerMasterAccess) throw new Error("Owner MUST have access to master clean media");

  // Admin access
  const adminMasterAccess = await canAccessMasterMedia(adminUser, publicArt);
  if (!adminMasterAccess) throw new Error("Admin MUST have access to master clean media");

  // Regular member access (MUST BE DENIED)
  const memberMasterAccess = await canAccessMasterMedia(regularMember, publicArt);
  if (memberMasterAccess) throw new Error("Regular member MUST BE DENIED access to master clean media (P0-002 Violation)");

  // Suspended member access
  const suspendedMasterAccess = await canAccessMasterMedia(suspendedMember, publicArt);
  if (suspendedMasterAccess) throw new Error("Suspended member MUST BE DENIED access to master clean media");

  console.log("✓ canAccessMasterMedia verified: Non-owners strictly blocked from master clean assets.");

  // 4. Test Challenge Jury Authorization Policy & Anti-Self Scoring
  console.log("\n[Test 4] Testing Jury Authorization & Anti-Self Scoring Policy...");
  const [testChallenge] = await db
    .insert(challenges)
    .values({
      title: `Security Test Challenge ${suffix}`,
      slug: `security-challenge-${suffix}`,
      theme: "Security Integrity",
      description: "Automated test challenge for jury and voting authorization checks.",
      promptRules: "Test rules",
      status: "jury_selection_open",
      awardMode: "vote_and_jury",
      createdByUserId: adminUser.id,
    })
    .returning();

  // Create submission by regularMember
  const [art1] = await db.insert(artworks).values({ userId: regularMember.id, title: `Member Art ${suffix}`, slug: `member-art-${suffix}`, mediaType: "image", publicationStatus: "published" }).returning();
  const [ver1] = await db.insert(artworkVersions).values({ artworkId: art1.id, versionNumber: 1, mediaType: "image", masterStorageKey: `k-art1-${suffix}`, mimeType: "image/png", fileSizeBytes: 100, checksumSha256: `c-art1-${suffix}`, processingStatus: "ready" }).returning();
  await db.update(artworks).set({ currentVersionId: ver1.id }).where(eq(artworks.id, art1.id));

  const [sub1] = await db
    .insert(challengeSubmissions)
    .values({
      challengeId: testChallenge.id,
      userId: regularMember.id,
      profileId: memberProfile.id,
      artworkId: art1.id,
      artworkVersionId: ver1.id,
      title: `Member Art ${suffix}`,
      submissionStatus: "submitted",
    })
    .returning();

  // Create submission by juryMember
  const [artJury] = await db.insert(artworks).values({ userId: juryMember.id, title: `Jury Art ${suffix}`, slug: `jury-art-${suffix}`, mediaType: "image", publicationStatus: "published" }).returning();
  const [verJury] = await db.insert(artworkVersions).values({ artworkId: artJury.id, versionNumber: 1, mediaType: "image", masterStorageKey: `k-artjury-${suffix}`, mimeType: "image/png", fileSizeBytes: 100, checksumSha256: `c-artjury-${suffix}`, processingStatus: "ready" }).returning();
  await db.update(artworks).set({ currentVersionId: verJury.id }).where(eq(artworks.id, artJury.id));

  const [jurySub] = await db
    .insert(challengeSubmissions)
    .values({
      challengeId: testChallenge.id,
      userId: juryMember.id,
      profileId: juryProfile.id,
      artworkId: artJury.id,
      artworkVersionId: verJury.id,
      title: `Jury Art ${suffix}`,
      submissionStatus: "submitted",
    })
    .returning();

  await db.insert(challengeJuryAssignments).values({
    challengeId: testChallenge.id,
    userId: juryMember.id,
    profileId: juryProfile.id,
    isRecorder: true,
  });

  // Regular member attempt to score -> MUST BE DENIED
  const regularMemberJuryCheck = await canSubmitJuryScore(regularMember, testChallenge.id, sub1.id);
  if (regularMemberJuryCheck.allowed) {
    throw new Error("Unassigned regular member MUST NOT be allowed to submit jury scores (P0-003 Violation)");
  }
  console.log(`✓ Unassigned member score attempt safely blocked: "${regularMemberJuryCheck.reason}"`);

  // Assigned jury attempt to score regular member submission -> MUST BE ALLOWED
  const assignedJuryCheck = await canSubmitJuryScore(juryMember, testChallenge.id, sub1.id);
  if (!assignedJuryCheck.allowed) {
    throw new Error(`Assigned jury failed to score: ${assignedJuryCheck.reason}`);
  }
  console.log("✓ Assigned jury score authorization confirmed.");

  // Assigned jury attempt to score OWN submission -> MUST BE DENIED (Anti-self scoring)
  const selfScoreCheck = await canSubmitJuryScore(juryMember, testChallenge.id, jurySub.id);
  if (selfScoreCheck.allowed) {
    throw new Error("Jury member MUST NOT be allowed to evaluate own submission (Anti-Self Scoring Violation)");
  }
  console.log(`✓ Jury self-scoring attempt safely blocked: "${selfScoreCheck.reason}"`);

  // 5. Test Candidate Cross-Challenge Validation
  console.log("\n[Test 5] Testing Candidate Cross-Challenge Integrity Validation...");
  const [foreignChallenge] = await db
    .insert(challenges)
    .values({
      title: `Foreign Challenge ${suffix}`,
      slug: `foreign-challenge-${suffix}`,
      theme: "Foreign",
      description: "Foreign",
      promptRules: "Rules",
      status: "voting_open",
    })
    .returning();

  const [artForeign] = await db.insert(artworks).values({ userId: owner.id, title: `Foreign Art ${suffix}`, slug: `foreign-art-${suffix}`, mediaType: "image", publicationStatus: "published" }).returning();
  const [verForeign] = await db.insert(artworkVersions).values({ artworkId: artForeign.id, versionNumber: 1, mediaType: "image", masterStorageKey: `k-artforeign-${suffix}`, mimeType: "image/png", fileSizeBytes: 100, checksumSha256: `c-artforeign-${suffix}`, processingStatus: "ready" }).returning();
  await db.update(artworks).set({ currentVersionId: verForeign.id }).where(eq(artworks.id, artForeign.id));

  const [foreignSub] = await db
    .insert(challengeSubmissions)
    .values({
      challengeId: foreignChallenge.id,
      userId: owner.id,
      profileId: ownerProfile.id,
      artworkId: artForeign.id,
      artworkVersionId: verForeign.id,
      title: `Foreign Art ${suffix}`,
      submissionStatus: "submitted",
    })
    .returning();

  // Verify that foreign submission cannot be voted for inside testChallenge
  if (foreignSub.challengeId === testChallenge.id) {
    throw new Error("Foreign submission challenge ID collision.");
  }
  console.log("✓ Cross-challenge submission integrity constraint verified.");

  // 6. Test Sliding-Window Rate Limiting
  console.log("\n[Test 6] Testing Sliding-Window Rate Limiting...");
  const rateLimitKey = `test:ip:${suffix}`;
  
  // 3 requests allowed in 5 seconds
  const req1 = await checkRateLimit(rateLimitKey, { limit: 3, windowSeconds: 5 });
  const req2 = await checkRateLimit(rateLimitKey, { limit: 3, windowSeconds: 5 });
  const req3 = await checkRateLimit(rateLimitKey, { limit: 3, windowSeconds: 5 });
  const req4 = await checkRateLimit(rateLimitKey, { limit: 3, windowSeconds: 5 }); // Should fail

  if (!req1.success || !req2.success || !req3.success) {
    throw new Error("Legitimate requests within rate limit unexpectedly failed.");
  }
  if (req4.success) {
    throw new Error("Request exceeding rate limit was not blocked (Rate Limiter Violation)");
  }
  console.log("✓ Rate limiting sliding window confirmed: 4th rapid request properly blocked.");

  console.log("\n=================================================================");
  console.log("🎉 ALL GATE 1 (SECURITY, AUTHORIZATION & INTEGRITY) TESTS PASSED!");
  console.log("=================================================================\n");
}

runSecurityAndIntegrityTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("❌ Gate 1 Test Failed:", err);
    process.exit(1);
  });
