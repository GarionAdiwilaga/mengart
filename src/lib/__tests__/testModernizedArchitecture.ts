import { db } from "@/db";
import { users, profiles, artworks, artworkVersions, auditLogs, membershipInvites } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { useVotingStore } from "@/stores/useVotingStore";
import { useLightboxStore } from "@/stores/useLightboxStore";
import { useGalleryFilterStore } from "@/stores/useGalleryFilterStore";
import { useModalStore } from "@/stores/useModalStore";

async function runModernizedArchitectureTests() {
  console.log("=================================================================");
  console.log("🚀 STARTING TEST-DRIVEN ARCHITECTURE & STATE INVARIANT TEST SUITE");
  console.log("=================================================================\n");

  // -------------------------------------------------------------
  // TEST GROUP 1: Zustand State Store Invariant Verification
  // -------------------------------------------------------------
  console.log("[Test 1] Testing Zustand useVotingStore Invariants & Rules...");

  const votingStore = useVotingStore.getState();
  const mockCandidates = [
    {
      submissionId: "sub-1",
      artworkId: "art-1",
      title: "Solitary Bloom",
      mediaType: "image",
      publicUrl: "/sample1.webp",
      artistName: "Aria",
      artistSlug: "aria",
      isSelfSubmission: false,
    },
    {
      submissionId: "sub-2",
      artworkId: "art-2",
      title: "Neon Rain",
      mediaType: "image",
      publicUrl: "/sample2.webp",
      artistName: "Current User",
      artistSlug: "me",
      isSelfSubmission: true, // Self-submission
    },
    {
      submissionId: "sub-3",
      artworkId: "art-3",
      title: "Ancient Ruins",
      mediaType: "image",
      publicUrl: "/sample3.webp",
      artistName: "Kaelen",
      artistSlug: "kaelen",
      isSelfSubmission: false,
    },
  ];

  votingStore.initVotingWorkspace({
    challengeId: "test-challenge-1",
    totalStarAllowance: 3,
    maxStarsPerCandidate: 1,
    candidates: mockCandidates,
  });

  // Check initial state
  const s1 = useVotingStore.getState();
  if (s1.candidateIndex !== 0 || Object.keys(s1.allocatedStars).length !== 0) {
    throw new Error("❌ Voting store failed initial state invariant.");
  }
  console.log("  ✓ Initialized voting workspace: 3 candidates, 3 star allowance, 0 allocated.");

  // Test circular candidate navigation
  s1.nextCandidate();
  if (useVotingStore.getState().candidateIndex !== 1) throw new Error("❌ nextCandidate failed to advance index.");
  s1.nextCandidate();
  if (useVotingStore.getState().candidateIndex !== 2) throw new Error("❌ nextCandidate failed to advance index.");
  s1.nextCandidate(); // wrap around
  if (useVotingStore.getState().candidateIndex !== 0) throw new Error("❌ nextCandidate failed circular wrap-around to 0.");
  s1.prevCandidate(); // wrap backwards
  if (useVotingStore.getState().candidateIndex !== 2) throw new Error("❌ prevCandidate failed circular wrap-around to 2.");
  console.log("  ✓ Circular candidate navigation (0 -> 1 -> 2 -> 0 -> 2) passed.");

  // Test self-voting prevention invariant
  const selfVoteResult = s1.allocateStar("sub-2", 1);
  if (selfVoteResult !== false || useVotingStore.getState().allocatedStars["sub-2"]) {
    throw new Error("❌ Self-voting prevention invariant violated in useVotingStore.");
  }
  console.log("  ✓ Self-voting attempt on 'sub-2' was strictly blocked.");

  // Test valid star allocation
  const validVote1 = s1.allocateStar("sub-1", 1);
  const validVote3 = s1.allocateStar("sub-3", 1);
  if (!validVote1 || !validVote3) throw new Error("❌ Valid star allocation failed.");
  if (useVotingStore.getState().allocatedStars["sub-1"] !== 1 || useVotingStore.getState().allocatedStars["sub-3"] !== 1) {
    throw new Error("❌ Allocated stars mismatch.");
  }
  console.log("  ✓ Valid Star allocations recorded (sub-1: 1, sub-3: 1).");

  // Test allowance limit enforcement
  const exceedVote = s1.allocateStar("sub-1", 2); // Exceeds maxStarsPerCandidate = 1
  if (useVotingStore.getState().allocatedStars["sub-1"] > 1) {
    throw new Error("❌ Max stars per candidate limit exceeded.");
  }
  console.log("  ✓ Max stars per candidate limit strictly enforced.");

  // Reset
  s1.resetAllocations();
  if (Object.keys(useVotingStore.getState().allocatedStars).length !== 0) {
    throw new Error("❌ resetAllocations failed.");
  }
  console.log("  ✓ resetAllocations cleared all star allocations.");

  // -------------------------------------------------------------
  // TEST GROUP 2: Lightbox Store Zoom & Pan Clamping
  // -------------------------------------------------------------
  console.log("\n[Test 2] Testing Zustand useLightboxStore Zoom Clamping & Modals...");

  const lightbox = useLightboxStore.getState();
  lightbox.openLightbox({
    id: "art-test-1",
    title: "Celestial Nexus",
    slug: "celestial-nexus",
    mediaType: "image",
    publicUrl: "/public/test.webp",
    masterUrl: "/api/media/master/master_test.png",
    artistName: "Lumina",
    artistSlug: "lumina",
    critiqueMode: "open_for_critique",
  });

  if (!useLightboxStore.getState().isOpen || useLightboxStore.getState().zoomLevel !== 1) {
    throw new Error("❌ Lightbox failed to open with initial zoom 1.0.");
  }

  // Test zoom clamping between 1x and 4x
  lightbox.setZoomLevel(5); // should clamp to 4
  if (useLightboxStore.getState().zoomLevel !== 4) throw new Error("❌ Zoom upper clamp failed (expected 4).");
  lightbox.setZoomLevel(0.2); // should clamp to 1
  if (useLightboxStore.getState().zoomLevel !== 1) throw new Error("❌ Zoom lower clamp failed (expected 1).");
  console.log("  ✓ Zoom level clamping (1.0x to 4.0x) verified.");

  // Test master quality toggle
  lightbox.toggleMasterQuality();
  if (!useLightboxStore.getState().isMasterQuality) throw new Error("❌ Master quality toggle failed to enable.");
  lightbox.toggleMasterQuality();
  if (useLightboxStore.getState().isMasterQuality) throw new Error("❌ Master quality toggle failed to disable.");
  console.log("  ✓ Master quality vs watermarked toggle verified.");

  lightbox.closeLightbox();
  if (useLightboxStore.getState().isOpen) throw new Error("❌ Lightbox close failed.");
  console.log("  ✓ Lightbox closed cleanly.");

  // -------------------------------------------------------------
  // TEST GROUP 3: Gallery Filter Store Invariants
  // -------------------------------------------------------------
  console.log("\n[Test 3] Testing Zustand useGalleryFilterStore Invariants...");

  const filterStore = useGalleryFilterStore.getState();
  filterStore.setSearchQuery("Ethereal");
  filterStore.setMediaType("video");
  filterStore.setCritiqueMode("open_for_critique");

  const f1 = useGalleryFilterStore.getState();
  if (f1.searchQuery !== "Ethereal" || f1.mediaType !== "video" || f1.critiqueMode !== "open_for_critique") {
    throw new Error("❌ Gallery filter mutations failed.");
  }
  console.log("  ✓ Gallery filter state mutations verified.");

  filterStore.resetFilters();
  const f2 = useGalleryFilterStore.getState();
  if (f2.searchQuery !== "" || f2.mediaType !== "all" || f2.critiqueMode !== "all") {
    throw new Error("❌ Gallery filter reset failed.");
  }
  console.log("  ✓ Gallery filter reset returned all fields to default.");

  // -------------------------------------------------------------
  // TEST GROUP 4: Database User Role & Audit Trail Integrity
  // -------------------------------------------------------------
  console.log("\n[Test 4] Testing User Role & Membership Status Mutations in Database...");

  const timestamp = Date.now();
  const testUserEmail = `audit_test_${timestamp}@example.com`;

  // Create temporary user
  const [createdUser] = await db
    .insert(users)
    .values({
      email: testUserEmail,
      role: "member",
      membershipStatus: "active",
      emailVerified: new Date(),
    })
    .returning();

  // 1. Promote to moderator
  await db.update(users).set({ role: "moderator" }).where(eq(users.id, createdUser.id));
  const [modUser] = await db.select().from(users).where(eq(users.id, createdUser.id));
  if (modUser.role !== "moderator") throw new Error("❌ Failed to update user role to moderator.");
  console.log("  ✓ User promoted to 'moderator' in database.");

  // 2. Suspend account
  await db.update(users).set({ membershipStatus: "suspended" }).where(eq(users.id, createdUser.id));
  const [suspendedUser] = await db.select().from(users).where(eq(users.id, createdUser.id));
  if (suspendedUser.membershipStatus !== "suspended") throw new Error("❌ Failed to suspend user account.");
  console.log("  ✓ User account status updated to 'suspended' in database.");

  // 3. Write audit log
  await db.insert(auditLogs).values({
    actorId: createdUser.id,
    action: "user_status_changed",
    targetType: "user",
    targetId: createdUser.id,
    reason: "Pengujian audit log otomatis.",
    metadata: { previousStatus: "active", newStatus: "suspended" },
  });

  const [logRecord] = await db
    .select()
    .from(auditLogs)
    .where(eq(auditLogs.targetId, createdUser.id))
    .limit(1);

  if (!logRecord || logRecord.action !== "user_status_changed" || logRecord.targetType !== "user") {
    throw new Error("❌ Audit log record mismatch.");
  }
  console.log("  ✓ Administrative audit log written and verified in PostgreSQL.");

  // -------------------------------------------------------------
  // TEST GROUP 5: Artwork Audience & Multi-Variant Storage Keys
  // -------------------------------------------------------------
  console.log("\n[Test 5] Testing Artwork Versioning & Audience Constraints...");

  const [testArtwork] = await db
    .insert(artworks)
    .values({
      userId: createdUser.id,
      title: `Luminous Drift ${timestamp}`,
      slug: `luminous-drift-${timestamp}`,
      mediaType: "image",
      audience: "members_only",
      critiqueMode: "open_for_critique",
      publicationStatus: "published",
    })
    .returning();

  const [testVersion] = await db
    .insert(artworkVersions)
    .values({
      artworkId: testArtwork.id,
      versionNumber: 1,
      mediaType: "image",
      masterStorageKey: `master_${timestamp}.png`,
      publicStorageKey: `public_${timestamp}.webp`,
      thumbnailStorageKey: `thumb_${timestamp}.webp`,
      mimeType: "image/png",
      fileSizeBytes: 1024 * 1024 * 4,
      checksumSha256: "dummychecksum123456",
      processingStatus: "ready",
    })
    .returning();

  await db.update(artworks).set({ currentVersionId: testVersion.id }).where(eq(artworks.id, testArtwork.id));

  const [fetchedArt] = await db
    .select({
      id: artworks.id,
      title: artworks.title,
      audience: artworks.audience,
      masterKey: artworkVersions.masterStorageKey,
      publicKey: artworkVersions.publicStorageKey,
      thumbKey: artworkVersions.thumbnailStorageKey,
    })
    .from(artworks)
    .innerJoin(artworkVersions, eq(artworkVersions.id, artworks.currentVersionId))
    .where(eq(artworks.id, testArtwork.id));

  if (!fetchedArt || fetchedArt.masterKey !== `master_${timestamp}.png` || fetchedArt.audience !== "members_only") {
    throw new Error("❌ Artwork dual-variant storage and audience constraint check failed.");
  }
  console.log("  ✓ Dual storage keys verified: Master Clean ('master_...') vs Public Watermarked ('public_...').");
  console.log("  ✓ Audience constraint ('members_only') properly persisted.");

  console.log("\n=================================================================");
  console.log("🎉 ALL TEST-DRIVEN ARCHITECTURE INVARIANT TESTS PASSED CLEANLY!");
  console.log("=================================================================\n");
  process.exit(0);
}

runModernizedArchitectureTests().catch((err) => {
  console.error("\n❌ Test Suite Execution Failed:", err);
  process.exit(1);
});
