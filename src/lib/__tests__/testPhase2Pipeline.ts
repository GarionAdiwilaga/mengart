import { db } from "@/db";
import {
  users,
  profiles,
  artworks,
  artworkVersions,
  commissionServices,
  commissionScopeRules,
  notifications,
} from "@/db/schema";
import { eq, and } from "drizzle-orm";
import sharp from "sharp";
import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import { processArtworkMediaJob } from "@/lib/mediaProcessor";
import { resolveStoragePath, ensureStorageDirectories } from "@/lib/storage";
import { createNotification, getUserNotifications } from "@/lib/notifications";

async function runPhase2Tests() {
  console.log("--- Starting Phase 2 (Artist & Gallery Platform) Integration Tests ---");
  await ensureStorageDirectories();

  // Test 1: Setup Test Artist User & Profile
  console.log("\n[Test 1] Setting up Test Artist and Profile...");
  const testEmail = `test_artist_${Date.now()}@example.com`;
  const [testUser] = await db
    .insert(users)
    .values({
      email: testEmail,
      role: "member",
      membershipStatus: "active",
    })
    .returning();

  const testSlug = `artist-${Date.now()}`;
  const [testProfile] = await db
    .insert(profiles)
    .values({
      userId: testUser.id,
      slug: testSlug,
      displayName: "Luna Valerius",
      bio: "Digital concept artist focusing on ethereal dark fantasy illustrations.",
      specialties: ["Character Illustration", "Concept Art"],
      software: ["Clip Studio Paint", "Photoshop", "Blender"],
      location: "Denpasar, Bali",
      commissionStatus: "open",
      whatsappNumber: "6281234567890",
      waConsentGiven: true,
      contactPreference: "public_wa",
      profileStatus: "active_public",
    })
    .returning();

  console.log(`✓ Created Artist Profile: ID=${testProfile.id}, Slug=${testProfile.slug}, Commission=${testProfile.commissionStatus}`);

  // Test 2: Create Commission Services & Do/Don't Rules
  console.log("\n[Test 2] Adding Commission Services & Do/Don't Scope Rules...");
  const [service] = await db
    .insert(commissionServices)
    .values({
      profileId: testProfile.id,
      title: "Bust-up Fantasy Portrait",
      description: "Detailed bust-up illustration with custom background and lighting.",
      category: "Character Illustration",
      pricingType: "starting_from",
      minPrice: "350000",
      minTurnaroundDays: 3,
      maxTurnaroundDays: 7,
      includedRevisions: 2,
      commercialUseAvailable: true,
      orderDestination: "whatsapp",
      serviceStatus: "published",
    })
    .returning();

  await db.insert(commissionScopeRules).values([
    {
      profileId: testProfile.id,
      ruleType: "do",
      title: "Original Characters (OC) & Fanart",
      displayOrder: 0,
    },
    {
      profileId: testProfile.id,
      ruleType: "dont",
      title: "NSFW / Gore / Mecha",
      displayOrder: 1,
    },
  ]);

  console.log(`✓ Created Commission Service: "${service.title}" (ID=${service.id}) with Do/Don't rules`);

  // Test 3: Media Processing Pipeline Test (Sharp Image Processing & Metadata Stripping)
  console.log("\n[Test 3] Testing Media Upload Pipeline with Sharp...");
  const tempFilename = `test_upload_${Date.now()}.png`;
  const tempPath = resolveStoragePath("temp", tempFilename);

  const testImageBuffer = await sharp({
    create: {
      width: 1200,
      height: 800,
      channels: 4,
      background: { r: 35, g: 45, b: 65, alpha: 1 },
    },
  })
    .png()
    .toBuffer();

  await fs.writeFile(tempPath, testImageBuffer);

  const [artwork] = await db
    .insert(artworks)
    .values({
      userId: testUser.id,
      title: "Moonlit Citadel",
      slug: `moonlit-citadel-${Date.now()}`,
      mediaType: "image",
      audience: "public",
      critiqueMode: "open_for_critique",
      publicationStatus: "processing",
    })
    .returning();

  const [version] = await db
    .insert(artworkVersions)
    .values({
      artworkId: artwork.id,
      versionNumber: 1,
      mediaType: "image",
      masterStorageKey: tempFilename,
      mimeType: "image/png",
      fileSizeBytes: testImageBuffer.length,
      checksumSha256: crypto.createHash("sha256").update(testImageBuffer).digest("hex"),
      processingStatus: "pending",
    })
    .returning();

  // Execute processing job
  await processArtworkMediaJob({
    artworkId: artwork.id,
    versionId: version.id,
    tempFilename,
    mediaType: "image",
    originalFilename: "moonlit_citadel.png",
    userId: testUser.id,
  });

  // Verify updated version in DB
  const [updatedVersion] = await db
    .select()
    .from(artworkVersions)
    .where(eq(artworkVersions.id, version.id));

  console.log(`✓ Media Processing Status: ${updatedVersion.processingStatus}`);
  console.log(`  - Dimensions: ${updatedVersion.width}x${updatedVersion.height} px`);
  console.log(`  - Master Storage Key: ${updatedVersion.masterStorageKey}`);
  console.log(`  - Public Derivative Key: ${updatedVersion.publicStorageKey}`);
  console.log(`  - Thumbnail Key: ${updatedVersion.thumbnailStorageKey}`);
  console.log(`  - Checksum SHA-256: ${updatedVersion.checksumSha256?.substring(0, 16)}...`);

  if (updatedVersion.processingStatus !== "ready") {
    throw new Error("Artwork version failed processing");
  }

  // Verify physical files exist on disk
  const masterPath = resolveStoragePath("master", updatedVersion.masterStorageKey!);
  const publicPath = resolveStoragePath("public", updatedVersion.publicStorageKey!);
  const thumbPath = resolveStoragePath("public", updatedVersion.thumbnailStorageKey!);

  await fs.access(masterPath);
  await fs.access(publicPath);
  await fs.access(thumbPath);
  console.log("✓ Physical master, public derivative, and thumbnail files verified on disk");

  // Test 4: In-App Notification Core
  console.log("\n[Test 4] Testing In-App Notification Engine...");
  await createNotification({
    userId: testUser.id,
    type: "artwork_ready",
    title: "Karya Siap!",
    body: `Karya "${artwork.title}" telah selesai diproses dan kini tampil di galeri publik.`,
    actionUrl: `/artworks/${artwork.slug}`,
  });

  const userNotifs = await getUserNotifications(testUser.id);
  console.log(`✓ Retrieved ${userNotifs.length} in-app notification(s) for artist. Top: "${userNotifs[0].title}"`);

  console.log("\n--- All Phase 2 Integration Tests Passed Successfully! ---");
  process.exit(0);
}

runPhase2Tests().catch((err) => {
  console.error("❌ Phase 2 Tests Failed:", err);
  process.exit(1);
});
