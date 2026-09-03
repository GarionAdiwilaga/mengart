import { db } from "@/db";
import {
  users,
  profiles,
  artworks,
  artworkVersions,
  challenges,
  challengeSubmissions,
} from "@/db/schema";
import { eq, and } from "drizzle-orm";
import sharp from "sharp";
import fs from "fs/promises";
import crypto from "crypto";
import { getEffectiveChallengeStatus, getChallengeCandidates, isChallengePhaseDeadlinePassed } from "@/lib/challenges";
import { transitionChallengeStatusService } from "@/lib/services/challengeService";
import { resolveStoragePath, ensureStorageDirectories } from "@/lib/storage";

async function runPhase3Tests() {
  console.log("--- Starting Phase 3 (Challenge Submission Engine) Tests ---");
  await ensureStorageDirectories();

  // Test 1: Setup Admin & Member Users
  console.log("\n[Test 1] Setting up Test Admin and Challenge Participant...");
  const adminEmail = `admin_${Date.now()}@example.com`;
  const [adminUser] = await db
    .insert(users)
    .values({
      email: adminEmail,
      role: "admin",
      membershipStatus: "active",
    })
    .returning();

  const memberEmail = `participant_${Date.now()}@example.com`;
  const [memberUser] = await db
    .insert(users)
    .values({
      email: memberEmail,
      role: "member",
      membershipStatus: "active",
    })
    .returning();

  const [memberProfile] = await db
    .insert(profiles)
    .values({
      userId: memberUser.id,
      slug: `artist-part-${Date.now()}`,
      displayName: "Althea Vance",
      profileStatus: "active_public",
    })
    .returning();

  console.log(`✓ Created Member Participant: ID=${memberUser.id}, Name=${memberProfile.displayName}`);

  // Test 2: Create a Challenge with Authoritative Submission Window
  console.log("\n[Test 2] Creating Challenge entity with submission window...");
  const now = new Date();
  const subStart = new Date(now.getTime() - 30 * 60 * 1000); // 30m ago
  const subDeadline = new Date(now.getTime() + 2 * 60 * 60 * 1000); // in 2h
  const voteDeadline = new Date(now.getTime() + 4 * 60 * 60 * 1000); // in 4h

  const challengeSlug = `challenge-celestial-${Date.now()}`;
  const [challenge] = await db
    .insert(challenges)
    .values({
      title: "Celestial Night 2026",
      slug: challengeSlug,
      theme: "Dark Fantasy Celestial",
      description: "Illustrate a mythical entity guarding the night sky.",
      promptRules: "1. Original artwork only.\n2. Digital 2D/3D format.",
      status: "scheduled",
      awardMode: "vote_and_jury",
      starsPerMember: 3,
      submissionStartsAt: subStart,
      submissionDeadline: subDeadline,
      votingStartsAt: subDeadline,
      votingDeadline: voteDeadline,
      createdByUserId: adminUser.id,
    })
    .returning();

  // Transition to submission_open via challengeService
  await transitionChallengeStatusService(
    db,
    { userId: adminUser.id, role: "admin" },
    challenge.id,
    "submission_open"
  );
  const [updatedChallenge] = await db.select().from(challenges).where(eq(challenges.id, challenge.id));
  const effectiveStatus = getEffectiveChallengeStatus(updatedChallenge);
  console.log(`✓ Challenge transitioned: ID=${challenge.id}, Status=${effectiveStatus}`);

  if (effectiveStatus !== "submission_open") {
    throw new Error(`Status should be submission_open, got ${effectiveStatus}`);
  }

  // Test 3: Member Submits Initial Artwork (Version 1)
  console.log("\n[Test 3] Member submitting initial artwork to challenge...");
  const tempFilename1 = `test_art_v1_${Date.now()}.png`;
  const tempPath1 = resolveStoragePath("temp", tempFilename1);

  const imgBuffer1 = await sharp({
    create: { width: 800, height: 800, channels: 4, background: { r: 50, g: 100, b: 150, alpha: 1 } },
  }).png().toBuffer();
  await fs.writeFile(tempPath1, imgBuffer1);

  const [artwork] = await db
    .insert(artworks)
    .values({
      userId: memberUser.id,
      title: "Moonweaver's Descent",
      slug: `moonweavers-descent-${Date.now()}`,
      mediaType: "image",
      publicationStatus: "published",
    })
    .returning();

  const [artVersion1] = await db
    .insert(artworkVersions)
    .values({
      artworkId: artwork.id,
      versionNumber: 1,
      mediaType: "image",
      masterStorageKey: tempFilename1,
      publicStorageKey: tempFilename1,
      thumbnailStorageKey: tempFilename1,
      mimeType: "image/png",
      fileSizeBytes: imgBuffer1.length,
      checksumSha256: crypto.createHash("sha256").update(imgBuffer1).digest("hex"),
      processingStatus: "ready",
    })
    .returning();

  await db
    .update(artworks)
    .set({ currentVersionId: artVersion1.id })
    .where(eq(artworks.id, artwork.id));

  const [submission] = await db
    .insert(challengeSubmissions)
    .values({
      challengeId: challenge.id,
      userId: memberUser.id,
      profileId: memberProfile.id,
      artworkId: artwork.id,
      artworkVersionId: artVersion1.id,
      title: "Moonweaver's Descent (Draft 1)",
      description: "Initial concept painting.",
      softwareUsed: "Clip Studio Paint",
      submissionStatus: "submitted",
    })
    .returning();

  console.log(`✓ Submission Created: ID=${submission.id}, Title="${submission.title}"`);

  // Test 4: Member Submits Revision (Version 2) Before Deadline
  console.log("\n[Test 4] Submitting revision (Version 2) before deadline...");
  const tempFilename2 = `test_art_v2_${Date.now()}.png`;
  const tempPath2 = resolveStoragePath("temp", tempFilename2);

  const imgBuffer2 = await sharp({
    create: { width: 1200, height: 1200, channels: 4, background: { r: 70, g: 40, b: 100, alpha: 1 } },
  }).png().toBuffer();
  await fs.writeFile(tempPath2, imgBuffer2);

  const [artVersion2] = await db
    .insert(artworkVersions)
    .values({
      artworkId: artwork.id,
      versionNumber: 2,
      mediaType: "image",
      masterStorageKey: tempFilename2,
      publicStorageKey: tempFilename2,
      thumbnailStorageKey: tempFilename2,
      mimeType: "image/png",
      fileSizeBytes: imgBuffer2.length,
      checksumSha256: crypto.createHash("sha256").update(imgBuffer2).digest("hex"),
      processingStatus: "ready",
    })
    .returning();

  await db
    .update(artworks)
    .set({ currentVersionId: artVersion2.id })
    .where(eq(artworks.id, artwork.id));

  const [updatedSub] = await db
    .update(challengeSubmissions)
    .set({
      artworkVersionId: artVersion2.id,
      title: "Moonweaver's Descent (Final Polish)",
      description: "Updated composition and rim lighting.",
      softwareUsed: "Clip Studio Paint, Photoshop",
      updatedAt: new Date(),
    })
    .where(eq(challengeSubmissions.id, submission.id))
    .returning();

  console.log(`✓ Revision Created: Title="${updatedSub.title}"`);

  // Test 5: Verify Challenge Candidate Query Returns Latest Version (Anti-Bias Uniform Set)
  console.log("\n[Test 5] Querying challenge candidate submissions...");
  const candidates = await getChallengeCandidates(challenge.id);
  console.log(`✓ Retrieved ${candidates.length} candidate(s). Candidate title: "${candidates[0].title}"`);

  if (candidates[0].title !== "Moonweaver's Descent (Final Polish)") {
    throw new Error("Candidate query should display updated current title");
  }
  if (candidates[0].artworkVersionId !== artVersion2.id) {
    throw new Error("Candidate query should reference active version 2");
  }

  // Test 6: Authoritative Deadline Lock
  console.log("\n[Test 6] Testing deadline lock behavior...");
  const pastDeadline = new Date(now.getTime() - 1000);
  const isPassed = isChallengePhaseDeadlinePassed(
    { submissionDeadline: pastDeadline },
    "submission"
  );

  console.log(`✓ Past deadline detection: ${isPassed}`);
  if (!isPassed) {
    throw new Error("isChallengePhaseDeadlinePassed should return true for past deadline");
  }

  console.log("\n--- All Phase 3 Challenge Submission Engine Tests Passed Successfully! ---");
  process.exit(0);
}

runPhase3Tests().catch((err) => {
  console.error("❌ Phase 3 Tests Failed:", err);
  process.exit(1);
});
