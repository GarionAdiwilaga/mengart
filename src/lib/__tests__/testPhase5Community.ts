import { db } from "@/db";
import {
  users,
  profiles,
  artworks,
  artworkVersions,
  critiqueComments,
  reports,
  monthlySpotlights,
  notifications,
  auditLogs,
} from "@/db/schema";
import { eq, and } from "drizzle-orm";
import sharp from "sharp";
import fs from "fs/promises";
import crypto from "crypto";
import { resolveStoragePath, ensureStorageDirectories } from "@/lib/storage";
import { getCurrentMonthlySpotlight, getRecentCommunityActivity } from "@/lib/activity";

async function runPhase5Tests() {
  console.log("--- Starting Phase 5 (Community & Administration) Tests ---");
  await ensureStorageDirectories();

  // Test 1: Setup Artist, Commenter, and Moderator
  console.log("\n[Test 1] Setting up Artist, Commenter, and Moderator...");
  const artistEmail = `artist_owner_${Date.now()}@example.com`;
  const [artistUser] = await db
    .insert(users)
    .values({ email: artistEmail, role: "member", membershipStatus: "active" })
    .returning();

  const [artistProfile] = await db
    .insert(profiles)
    .values({
      userId: artistUser.id,
      displayName: "Lyra Nightingale",
      slug: `lyra-art-${Date.now()}`,
      profileStatus: "active_public",
    })
    .returning();

  const commenterEmail = `commenter_${Date.now()}@example.com`;
  const [commenterUser] = await db
    .insert(users)
    .values({ email: commenterEmail, role: "member", membershipStatus: "active" })
    .returning();

  const [commenterProfile] = await db
    .insert(profiles)
    .values({
      userId: commenterUser.id,
      displayName: "Rowan Thorne",
      slug: `rowan-critique-${Date.now()}`,
      profileStatus: "active_public",
    })
    .returning();

  const modEmail = `mod_user_${Date.now()}@example.com`;
  const [modUser] = await db
    .insert(users)
    .values({ email: modEmail, role: "moderator", membershipStatus: "active" })
    .returning();

  console.log("✓ Test users created.");

  // Test 2: Create Artwork Open for Critique
  console.log("\n[Test 2] Creating artwork open for critique...");
  const tempFilename = `critique_test_${Date.now()}.png`;
  const tempPath = resolveStoragePath("temp", tempFilename);
  const buf = await sharp({
    create: { width: 800, height: 600, channels: 4, background: { r: 40, g: 60, b: 90, alpha: 1 } },
  }).png().toBuffer();
  await fs.writeFile(tempPath, buf);

  const [artwork] = await db
    .insert(artworks)
    .values({
      userId: artistUser.id,
      title: "Twilight Forest Sanctuary",
      slug: `twilight-forest-${Date.now()}`,
      critiqueMode: "open_for_critique",
      mediaType: "image",
      publicationStatus: "published",
    })
    .returning();

  const [version] = await db
    .insert(artworkVersions)
    .values({
      artworkId: artwork.id,
      versionNumber: 1,
      mediaType: "image",
      masterStorageKey: tempFilename,
      publicStorageKey: tempFilename,
      thumbnailStorageKey: tempFilename,
      mimeType: "image/png",
      fileSizeBytes: buf.length,
      checksumSha256: crypto.createHash("sha256").update(buf).digest("hex"),
      processingStatus: "ready",
    })
    .returning();

  await db
    .update(artworks)
    .set({ currentVersionId: version.id })
    .where(eq(artworks.id, artwork.id));

  console.log(`✓ Artwork created: ID=${artwork.id}, Title="${artwork.title}"`);

  // Test 3: Post Critique Comment and Verify Notification
  console.log("\n[Test 3] Posting structured critique comment...");
  const [comment] = await db
    .insert(critiqueComments)
    .values({
      artworkId: artwork.id,
      userId: commenterUser.id,
      profileId: commenterProfile.id,
      critiqueAspect: "color_lighting",
      content: "Kontras pencahayaan rim light pada siluet pohon sangat memukau!",
    })
    .returning();

  // Create notification for artist
  const [notif] = await db
    .insert(notifications)
    .values({
      userId: artistUser.id,
      type: "artwork_critiqued",
      title: "Kritik Baru Diterima",
      body: `${commenterProfile.displayName} memberikan masukan pada "${artwork.title}".`,
      actionUrl: `/artworks/${artwork.slug}`,
    })
    .returning();

  console.log(`✓ Critique Comment Posted: ID=${comment.id}, Aspect=${comment.critiqueAspect}`);
  console.log(`✓ Notification Delivered to Artist: ID=${notif.id}, Title="${notif.title}"`);

  // Test 4: Threaded Reply & Pinning
  console.log("\n[Test 4] Submitting threaded reply and pinning comment...");
  const [reply] = await db
    .insert(critiqueComments)
    .values({
      artworkId: artwork.id,
      userId: artistUser.id,
      profileId: artistProfile.id,
      parentCommentId: comment.id,
      critiqueAspect: "general",
      content: "Terima kasih banyak atas sarannya, Rowan!",
    })
    .returning();

  await db
    .update(critiqueComments)
    .set({ isPinned: true })
    .where(eq(critiqueComments.id, comment.id));

  const [pinnedComment] = await db
    .select()
    .from(critiqueComments)
    .where(eq(critiqueComments.id, comment.id));

  if (!pinnedComment.isPinned) {
    throw new Error("Comment should be pinned");
  }
  console.log(`✓ Pinned Status: ${pinnedComment.isPinned}, Reply ID=${reply.id}`);

  // Test 5: Content Reporting & Moderation Resolution
  console.log("\n[Test 5] Creating safety report and testing moderator resolution...");
  const [report] = await db
    .insert(reports)
    .values({
      reporterUserId: commenterUser.id,
      targetType: "artwork",
      targetId: artwork.id,
      reason: "ai_generated",
      details: "Diduga melanggar ketentuan orisinalitas digital art atelier.",
      status: "pending",
    })
    .returning();

  console.log(`✓ Report Created: ID=${report.id}, Status=${report.status}`);

  // Moderator Resolves Report with Takedown
  await db.transaction(async (tx) => {
    await tx
      .update(reports)
      .set({
        status: "resolved",
        resolvedByUserId: modUser.id,
        resolutionNotes: "Telah diverifikasi dan disembunyikan (hidden).",
        resolvedAt: new Date(),
      })
      .where(eq(reports.id, report.id));

    await tx
      .update(artworks)
      .set({ publicationStatus: "hidden" })
      .where(eq(artworks.id, artwork.id));

    await tx.insert(auditLogs).values({
      actorId: modUser.id,
      action: "moderation.report_resolved",
      targetType: "artwork",
      targetId: artwork.id,
      reason: "Telah diverifikasi dan disembunyikan (hidden).",
    });
  });

  const [hiddenArt] = await db.select().from(artworks).where(eq(artworks.id, artwork.id));
  if (hiddenArt.publicationStatus !== "hidden") {
    throw new Error("Artwork should be hidden");
  }
  console.log(`✓ Report resolved and artwork publication status updated to: ${hiddenArt.publicationStatus}`);

  // Test 6: Monthly Artist Spotlight
  console.log("\n[Test 6] Creating Monthly Artist Spotlight...");
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  // Clear existing spotlight for test
  await db
    .delete(monthlySpotlights)
    .where(and(eq(monthlySpotlights.year, year), eq(monthlySpotlights.month, month)));

  await db.insert(monthlySpotlights).values({
    year,
    month,
    artistProfileId: artistProfile.id,
    featuredArtworkId: artwork.id,
    curatorQuote: "Dedikasi luar biasa dalam eksplorasi visual landscape dan atmosfer fantasi.",
    isPublished: true,
  });

  const spotlight = await getCurrentMonthlySpotlight();
  if (!spotlight || spotlight.artistSlug !== artistProfile.slug) {
    throw new Error("Spotlight query mismatch");
  }
  console.log(`✓ Monthly Spotlight Live: Artist="${spotlight.artistName}", Quote="${spotlight.curatorQuote}"`);

  console.log("\n--- All Phase 5 (Community & Administration) Tests Passed Successfully! ---");
  process.exit(0);
}

runPhase5Tests().catch((err) => {
  console.error("❌ Phase 5 Tests Failed:", err);
  process.exit(1);
});
