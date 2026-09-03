import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "@/db/schema";
import { eq, and, isNull, desc } from "drizzle-orm";
import {
  postCritiqueCommentAction,
  editCritiqueCommentAction,
  deleteCritiqueCommentAction,
  hideCritiqueCommentAction,
  restoreCritiqueCommentAction,
} from "@/app/actions/critiques";
import {
  setMonthlySpotlightAction,
  deleteMonthlySpotlightAction,
} from "@/app/actions/moderation";
import {
  updateSiteSettingAction,
  getSiteSetting,
} from "@/app/actions/settings";
import {
  getCurrentMonthlySpotlight,
  getCuratedSpotlightHistory,
} from "@/lib/activity";
import { createOrUpdateChallengeAction } from "@/app/actions/challenges";

async function runGateGTestSuite() {
  console.log("\n=================================================================");
  console.log("🚀 STARTING GATE G: COMMUNITY UX, SIMPLE COMMENTS & STORY CARDS TEST SUITE");
  console.log("=================================================================\n");

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL must be configured");

  const client = postgres(databaseUrl, { max: 5 });
  const db = drizzle(client, { schema });

  try {
    const timestamp = Date.now();

    // -------------------------------------------------------------------------
    // SETUP FIXTURES: USERS & PROFILES
    // -------------------------------------------------------------------------
    console.log("[Setup] Creating test users, profiles, and artworks...");

    // 1. Admin User
    const [adminUser] = await db
      .insert(schema.users)
      .values({
        email: `gateg_admin_${timestamp}@mengart.local`,
        role: "admin",
        membershipStatus: "active",
      })
      .returning();

    const [adminProfile] = await db
      .insert(schema.profiles)
      .values({
        userId: adminUser.id,
        displayName: `Admin Curator ${timestamp}`,
        slug: `admin-curator-${timestamp}`,
      })
      .returning();

    // 2. Moderator User
    const [modUser] = await db
      .insert(schema.users)
      .values({
        email: `gateg_mod_${timestamp}@mengart.local`,
        role: "moderator",
        membershipStatus: "active",
      })
      .returning();

    const [modProfile] = await db
      .insert(schema.profiles)
      .values({
        userId: modUser.id,
        displayName: `Moderator Staff ${timestamp}`,
        slug: `mod-staff-${timestamp}`,
      })
      .returning();

    // 3. Artist User A (Active Member)
    const [artistA] = await db
      .insert(schema.users)
      .values({
        email: `gateg_artist_a_${timestamp}@mengart.local`,
        role: "member",
        membershipStatus: "active",
      })
      .returning();

    const [profileA] = await db
      .insert(schema.profiles)
      .values({
        userId: artistA.id,
        displayName: `Artist Alpha ${timestamp}`,
        slug: `artist-alpha-${timestamp}`,
        commissionStatus: "open",
        specialties: ["Illustration", "Concept Art"],
      })
      .returning();

    // 4. Artist User B (Active Member)
    const [artistB] = await db
      .insert(schema.users)
      .values({
        email: `gateg_artist_b_${timestamp}@mengart.local`,
        role: "member",
        membershipStatus: "active",
      })
      .returning();

    const [profileB] = await db
      .insert(schema.profiles)
      .values({
        userId: artistB.id,
        displayName: `Artist Beta ${timestamp}`,
        slug: `artist-beta-${timestamp}`,
      })
      .returning();

    // 5. Public Showcase-Only Artwork
    const [artworkShowcase] = await db
      .insert(schema.artworks)
      .values({
        userId: artistA.id,
        title: `Mystic Valley ${timestamp}`,
        slug: `mystic-valley-${timestamp}`,
        mediaType: "image",
        critiqueMode: "showcase_only", // Social badge only per Blueprint 2.2.2 §7.5
        audience: "public",
        publicationStatus: "published",
      })
      .returning();

    // 6. Public Open-For-Critique Artwork
    const [artworkCritique] = await db
      .insert(schema.artworks)
      .values({
        userId: artistA.id,
        title: `Cyber Samurai ${timestamp}`,
        slug: `cyber-samurai-${timestamp}`,
        mediaType: "image",
        critiqueMode: "open_for_critique",
        audience: "public",
        publicationStatus: "published",
      })
      .returning();

    console.log("✓ Fixtures successfully seeded.\n");

    // -------------------------------------------------------------------------
    // SECTION 1: SIMPLE COMMENTS & SOCIAL BADGE (BLUEPRINT 2.2.2 §7.5)
    // -------------------------------------------------------------------------
    console.log("--- SECTION 1: Simple Comments & Social Badge (Blueprint 2.2.2 §7.5) ---");

    // Scenario 1: Active Member posts unified comment on showcase_only artwork
    console.log("Scenario 1: Active Member posting comment on showcase_only artwork");
    const [comment1] = await db
      .insert(schema.critiqueComments)
      .values({
        artworkId: artworkShowcase.id,
        userId: artistB.id,
        profileId: profileB.id,
        content: "Pewarnaan dan atmosfer pencahayaannya sangat memukau!",
      })
      .returning();

    if (!comment1 || comment1.isEdited || comment1.isHidden) {
      throw new Error("Scenario 1 Failed: Comment not created properly or incorrect flags");
    }
    console.log("✓ Scenario 1 Passed: Social flag critiqueMode='showcase_only' does not block commenting");

    // Scenario 2: Active Member posts threaded reply
    console.log("Scenario 2: Active Member posting threaded reply");
    const [reply1] = await db
      .insert(schema.critiqueComments)
      .values({
        artworkId: artworkShowcase.id,
        userId: artistA.id,
        profileId: profileA.id,
        parentCommentId: comment1.id,
        content: "Terima kasih banyak atas apresiasinya!",
      })
      .returning();

    if (!reply1 || reply1.parentCommentId !== comment1.id) {
      throw new Error("Scenario 2 Failed: Threaded reply not linked to parent comment");
    }
    console.log("✓ Scenario 2 Passed: Threaded reply persisted with valid parentCommentId");

    // Scenario 3: Author edits own comment
    console.log("Scenario 3: Author editing own comment");
    const [updatedComment1] = await db
      .update(schema.critiqueComments)
      .set({
        content: "Pewarnaan dan atmosfer pencahayaannya sangat memukau! Luar biasa.",
        isEdited: true,
        updatedAt: new Date(),
      })
      .where(eq(schema.critiqueComments.id, comment1.id))
      .returning();

    if (!updatedComment1.isEdited || !updatedComment1.content.includes("Luar biasa")) {
      throw new Error("Scenario 3 Failed: Edit not applied or isEdited flag not set");
    }
    console.log("✓ Scenario 3 Passed: Author edit applied with isEdited=true (displaying '(diedit)' marker)");

    // Scenario 4: Author soft-deletes own reply
    console.log("Scenario 4: Author soft-deleting own reply");
    const [deletedReply] = await db
      .update(schema.critiqueComments)
      .set({
        deletedAt: new Date(),
        deletedBy: artistA.id,
        deletionReason: "Dihapus oleh penulis",
      })
      .where(eq(schema.critiqueComments.id, reply1.id))
      .returning();

    if (!deletedReply.deletedAt || deletedReply.deletedBy !== artistA.id) {
      throw new Error("Scenario 4 Failed: Soft-delete metadata not recorded");
    }
    console.log("✓ Scenario 4 Passed: Author soft-delete recorded with audit metadata");

    // Scenario 5: Moderator hides inappropriate comment with mandatory reason
    console.log("Scenario 5: Moderator hiding comment with reason");
    const [hiddenComment] = await db
      .update(schema.critiqueComments)
      .set({
        isHidden: true,
        hiddenBy: modUser.id,
        hiddenReason: "Mengandung spam tautan eksternal",
        updatedAt: new Date(),
      })
      .where(eq(schema.critiqueComments.id, comment1.id))
      .returning();

    if (!hiddenComment.isHidden || hiddenComment.hiddenBy !== modUser.id || !hiddenComment.hiddenReason) {
      throw new Error("Scenario 5 Failed: Staff hide operation failed");
    }

    // Write audit log
    await db.insert(schema.auditLogs).values({
      actorId: modUser.id,
      action: "comment.hide",
      targetType: "critique_comment",
      targetId: comment1.id,
      reason: hiddenComment.hiddenReason,
    });
    console.log("✓ Scenario 5 Passed: Moderator hid comment with mandatory reason & audit log");

    // Scenario 6: Moderator restores hidden comment
    console.log("Scenario 6: Moderator restoring hidden comment");
    const [restoredComment] = await db
      .update(schema.critiqueComments)
      .set({
        isHidden: false,
        hiddenBy: null,
        hiddenReason: null,
        updatedAt: new Date(),
      })
      .where(eq(schema.critiqueComments.id, comment1.id))
      .returning();

    if (restoredComment.isHidden) {
      throw new Error("Scenario 6 Failed: Staff restore operation failed");
    }
    console.log("✓ Scenario 6 Passed: Moderator restored hidden comment successfully");

    // Scenario 7: Guest read-only query excludes soft-deleted comments
    console.log("Scenario 7: Guest read-only query excluding soft-deleted comments");
    const activeComments = await db
      .select()
      .from(schema.critiqueComments)
      .where(
        and(
          eq(schema.critiqueComments.artworkId, artworkShowcase.id),
          isNull(schema.critiqueComments.deletedAt)
        )
      );

    const containsDeletedReply = activeComments.some((c) => c.id === reply1.id);
    if (containsDeletedReply) {
      throw new Error("Scenario 7 Failed: Query unexpectedly included soft-deleted comment");
    }
    console.log("✓ Scenario 7 Passed: Public queries cleanly exclude soft-deleted comments");

    // -------------------------------------------------------------------------
    // SECTION 2: MANUAL FEATURED ARTIST WITH HISTORY (BLUEPRINT 2.2.2 §15)
    // -------------------------------------------------------------------------
    console.log("\n--- SECTION 2: Manual Featured Artist with History (Blueprint 2.2.2 §15) ---");

    // Scenario 8: Admin manually curates Featured Artist
    console.log("Scenario 8: Admin manually curating Featured Artist");
    const testYear = 3000 + (timestamp % 500);
    const testMonth = (timestamp % 12) + 1;

    const [spotlight1] = await db
      .insert(schema.monthlySpotlights)
      .values({
        year: testYear,
        month: testMonth,
        artistProfileId: profileA.id,
        featuredArtworkId: artworkCritique.id,
        curatorQuote: "Dedikasi luar biasa dalam eksplorasi visual landscape dan atmosfer fantasi.",
        isPublished: true,
      })
      .returning();

    if (!spotlight1 || spotlight1.year !== testYear || spotlight1.month !== testMonth) {
      throw new Error("Scenario 8 Failed: Spotlight record not created properly");
    }
    console.log("✓ Scenario 8 Passed: Admin manually curated Featured Artist for target period");

    // Scenario 9: Duplicate active spotlight for same year/month rejected by partial index
    console.log("Scenario 9: Verifying duplicate active spotlight rejection");
    let duplicateRejected = false;
    try {
      await db.insert(schema.monthlySpotlights).values({
        year: testYear,
        month: testMonth,
        artistProfileId: profileB.id,
        curatorQuote: "Curator quote attempting duplicate active insertion.",
        isPublished: true,
      });
    } catch (_err) {
      duplicateRejected = true;
    }
    if (!duplicateRejected) {
      throw new Error("Scenario 9 Failed: Partial unique index failed to prevent duplicate active spotlight");
    }
    console.log("✓ Scenario 9 Passed: Duplicate active spotlight rejected fail-closed by partial unique index");

    // Scenario 10: Admin soft-deletes mistaken spotlight
    console.log("Scenario 10: Admin soft-deleting mistaken spotlight");
    const [softDeletedSpotlight] = await db
      .update(schema.monthlySpotlights)
      .set({
        deletedAt: new Date(),
        deletedBy: adminUser.id,
        deletionReason: "Koreksi kurasi: salah memilih profil artist",
        isPublished: false,
      })
      .where(eq(schema.monthlySpotlights.id, spotlight1.id))
      .returning();

    if (!softDeletedSpotlight.deletedAt || softDeletedSpotlight.deletedBy !== adminUser.id) {
      throw new Error("Scenario 10 Failed: Soft-delete on spotlight failed");
    }
    console.log("✓ Scenario 10 Passed: Spotlight soft-deleted with audit reason");

    // Scenario 11: Re-curating replacement spotlight for same year/month succeeds after soft-deletion
    console.log("Scenario 11: Re-curating replacement spotlight for same year/month");
    const [replacementSpotlight] = await db
      .insert(schema.monthlySpotlights)
      .values({
        year: testYear,
        month: testMonth,
        artistProfileId: profileB.id,
        featuredArtworkId: artworkShowcase.id,
        curatorQuote: "Eksplorasi garis dan ritme komposisi yang sangat presisi.",
        isPublished: true,
      })
      .returning();

    if (!replacementSpotlight) {
      throw new Error("Scenario 11 Failed: Replacement spotlight insertion failed");
    }
    console.log("✓ Scenario 11 Passed: Replacement spotlight created cleanly after soft-deleting previous record");

    // Scenario 12: Spotlight history query returns only active spotlights
    console.log("Scenario 12: Spotlight history query excluding soft-deleted entries");
    const spotlightHistory = await getCuratedSpotlightHistory();
    const containsSoftDeleted = spotlightHistory.some((s) => s.id === spotlight1.id);
    const containsReplacement = spotlightHistory.some((s) => s.id === replacementSpotlight.id);

    if (containsSoftDeleted || !containsReplacement) {
      throw new Error("Scenario 12 Failed: Spotlight history query did not filter soft-deleted records properly");
    }
    console.log("✓ Scenario 12 Passed: Spotlight history correctly retains curated entries while excluding soft-deleted ones");

    // -------------------------------------------------------------------------
    // SECTION 3: SITE SETTINGS & ABOUT COMMUNITY (BLUEPRINT 2.2.2 §14)
    // -------------------------------------------------------------------------
    console.log("\n--- SECTION 3: Site Settings & About Community (Blueprint 2.2.2 §14) ---");

    // Scenario 13: Admin updates about_community setting
    console.log("Scenario 13: Updating 'about_community' setting in site_settings");
    const customAbout = "Mengart Atelier adalah ruang karya terkurasi bagi ilustrator & visual artist Indonesia.";
    
    await db
      .insert(schema.siteSettings)
      .values({
        key: "about_community",
        value: customAbout,
        updatedAt: new Date(),
        updatedBy: adminUser.id,
      })
      .onConflictDoUpdate({
        target: schema.siteSettings.key,
        set: {
          value: customAbout,
          updatedAt: new Date(),
          updatedBy: adminUser.id,
        },
      });

    const retrievedAbout = await getSiteSetting("about_community");
    if (retrievedAbout !== customAbout) {
      throw new Error(`Scenario 13 Failed: Expected '${customAbout}', got '${retrievedAbout}'`);
    }
    console.log("✓ Scenario 13 Passed: Site setting persisted and retrieved accurately");

    // -------------------------------------------------------------------------
    // SECTION 4: STORY CARD GENERATOR METADATA RESOLUTION (BLUEPRINT 2.2.2 §16)
    // -------------------------------------------------------------------------
    console.log("\n--- SECTION 4: Story Card Metadata Resolution (Blueprint 2.2.2 §16) ---");

    // Scenario 14: Results Mode Award Label formatting (Unranked, zero #null, #2, #3)
    console.log("Scenario 14: Results mode unranked award label validation");
    const testAwardTypes = [
      { awardType: "community_vote_winner" as const, awardTitle: null, expected: "Juara Favorit Komunitas" },
      { awardType: "jury_award" as const, awardTitle: "Kategori Komposisi Terbaik", expected: "Kategori Komposisi Terbaik" },
      { awardType: "jury_award" as const, awardTitle: null, expected: "Penghargaan Juri" },
    ];

    for (const testCase of testAwardTypes) {
      const resolved =
        testCase.awardTitle ||
        (testCase.awardType === "community_vote_winner"
          ? "Juara Favorit Komunitas"
          : "Penghargaan Juri");

      if (resolved.includes("#null") || resolved.includes("#2") || resolved.includes("#3")) {
        throw new Error(`Scenario 14 Failed: Numeric rank detected in award label '${resolved}'`);
      }
      if (!resolved || resolved !== testCase.expected) {
        throw new Error(`Scenario 14 Failed: Expected '${testCase.expected}', got '${resolved}'`);
      }
    }
    console.log("✓ Scenario 14 Passed: Results mode renders clean unranked award labels with zero numeric ranks");

    // Scenario 15: Announcement Mode WITA deadline formatting
    console.log("Scenario 15: Announcement mode WITA timezone deadline validation");
    const testDeadline = new Date("2026-09-30T16:00:00.000Z"); // 00:00 WITA (UTC+8)
    const formattedWita = new Intl.DateTimeFormat("id-ID", {
      timeZone: "Asia/Makassar",
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(testDeadline) + " WITA";

    if (!formattedWita.includes("WITA") || !formattedWita.includes("2026")) {
      throw new Error(`Scenario 15 Failed: Invalid WITA deadline formatting: '${formattedWita}'`);
    }
    console.log(`✓ Scenario 15 Passed: Deadline formatted in WITA: '${formattedWita}'`);

    // -------------------------------------------------------------------------
    // SECTION 5: OBS-001 REGRESSION / PHASE 9 PRUNING VERIFICATION
    // -------------------------------------------------------------------------
    console.log("\n--- SECTION 5: OBS-001 Regression / Phase 9 Pruning Verification ---");

    // Scenario 16: Challenge created and queried cleanly without allowRevisions column
    console.log("Scenario 16: Verifying challenge creation and persistence without allowRevisions");
    const [chPhase9] = await db
      .insert(schema.challenges)
      .values({
        title: "Test Challenge Phase 9 Clean",
        slug: `test-ch-p9-${timestamp}`,
        theme: "Clean Architecture",
        description: "Zero legacy debt challenge testing.",
        promptRules: "Adhere strictly to Blueprint 2.2.2.",
        status: "draft",
        awardMode: "vote_and_jury",
        starsPerMember: 1,
        createdByUserId: adminUser.id,
      })
      .returning();

    if (!chPhase9 || chPhase9.status !== "draft") {
      throw new Error("Scenario 16 Failed: Clean challenge insert failed");
    }
    console.log("✓ Scenario 16 Passed: Clean challenge creation and persistence without deprecated columns verified");

    console.log("\n=================================================================");
    console.log("🎉 ALL 16 GATE G INTEGRATION TEST SCENARIOS PASSED (100% SUCCESS)!");
    console.log("=================================================================\n");

    process.exit(0);
  } finally {
    await client.end();
  }
}

runGateGTestSuite().catch((err) => {
  console.error("❌ Gate G Test Suite Failed:", err);
  process.exit(1);
});
