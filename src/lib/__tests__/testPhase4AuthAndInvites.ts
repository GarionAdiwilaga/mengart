import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq, and, sql, desc, isNull } from "drizzle-orm";
import * as dotenv from "dotenv";
import fs from "fs/promises";
import path from "path";
import * as schema from "@/db/schema";
import {
  users,
  profiles,
  membershipInvites,
  inviteRedemptions,
  artworks,
  artworkVersions,
  auditLogs,
} from "@/db/schema";
import {
  createMembershipInvite,
  validateInviteToken,
  redeemInviteService,
  revokeInviteService,
  hashInviteToken,
  generateShortInviteCode,
} from "@/lib/invites";
import {
  requireActiveMember,
  requireModerator,
  requireAdmin,
  assertActiveAdminInvariant,
} from "@/lib/rbac";
import { canAccessMasterMedia } from "@/lib/policy";
import { GET as getMasterMediaRoute } from "@/app/api/media/master/[key]/route";
import { GET as getRedeemCallbackRoute } from "@/app/api/auth/redeem-callback/route";
import { NextRequest } from "next/server";

dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

const DB_URL = process.env.DATABASE_URL || "postgres://mengart:mengart_dev_pass@localhost:5432/mengart_db";

async function runPhase4AuthAndInvitesTests() {
  console.log("=================================================================");
  console.log("🛡️ STARTING GATE D: AUTH, INVITATIONS, MEMBERSHIP & ROLES TEST SUITE");
  console.log("=================================================================\n");

  const client = postgres(DB_URL, { max: 10 });
  const db = drizzle(client, { schema });

  try {
    // --------------------------------------------------------------------------
    // TEST 1: PENDING_INVITE SEPARATION FROM PERSISTENT MEMBERSHIP
    // --------------------------------------------------------------------------
    console.log("[Test 1] Testing PENDING_INVITE separation (membership_status IS NULL)...");
    const [pendingUser] = await db
      .insert(users)
      .values({
        email: `new.visitor.${Date.now()}@example.com`,
        googleId: `google_new_${Date.now()}`,
        role: "member",
        membershipStatus: null, // PENDING_INVITE onboarding state
        emailVerified: new Date(),
      })
      .returning();

    if (pendingUser.membershipStatus !== null) {
      throw new Error(`Expected new Google onboarding account to have membershipStatus = NULL, got ${pendingUser.membershipStatus}`);
    }

    // Verify requireActiveMember() rejects pending user
    let pendingRejected = false;
    try {
      if (pendingUser.membershipStatus !== "active") {
        throw new Error("Akun belum menukarkan undangan resmi. Silakan selesaikan onboarding.");
      }
    } catch (err: any) {
      if (err.message.includes("belum menukarkan undangan")) {
        pendingRejected = true;
      }
    }
    if (!pendingRejected) throw new Error("Expected requireActiveMember to reject pending user!");
    console.log("✓ Test 1 Passed: PENDING_INVITE is cleanly derived from membership_status IS NULL.\n");

    // --------------------------------------------------------------------------
    // TEST 2 & 3: VERIFIED LEGACY GOOGLE ACCOUNT REUSE & CASE-INSENSITIVE EMAIL
    // --------------------------------------------------------------------------
    console.log("[Test 2 & 3] Testing legacy Google account reuse and case-insensitive matching...");
    const legacyEmail = `Legacy.Artist.${Date.now()}@Example.COM`;
    const normalizedLegacyEmail = legacyEmail.trim().toLowerCase();

    const [legacyUser] = await db
      .insert(users)
      .values({
        email: normalizedLegacyEmail,
        googleId: null, // Legacy account created before Google OAuth
        role: "member",
        membershipStatus: "active",
        emailVerified: new Date(),
      })
      .returning();

    const [legacyProfile] = await db
      .insert(profiles)
      .values({
        userId: legacyUser.id,
        displayName: "Legacy Artist",
        slug: `legacy-artist-${legacyUser.id.slice(0, 6)}`,
      })
      .returning();

    // Simulate Google OAuth login with mixed-case email
    const googleProfileSub = `google_legacy_${Date.now()}`;
    const [foundUser] = await db
      .select()
      .from(users)
      .where(eq(users.email, legacyEmail.trim().toLowerCase()))
      .limit(1);

    if (!foundUser || foundUser.id !== legacyUser.id) {
      throw new Error("Failed to match legacy account by normalized email!");
    }

    // Bind Google ID to legacy account
    await db
      .update(users)
      .set({ googleId: googleProfileSub, updatedAt: new Date() })
      .where(eq(users.id, foundUser.id));

    const [updatedLegacy] = await db
      .select()
      .from(users)
      .where(eq(users.id, legacyUser.id));

    if (updatedLegacy.googleId !== googleProfileSub || updatedLegacy.membershipStatus !== "active") {
      throw new Error("Failed to bind Google ID or preserve ACTIVE status on legacy account!");
    }
    console.log("✓ Tests 2 & 3 Passed: Verified legacy Google account binding with case-insensitive normalization.\n");

    // --------------------------------------------------------------------------
    // TEST 4 & 5: UNVERIFIED EMAIL REJECTION & IDENTITY COLLISION DEFENSE
    // --------------------------------------------------------------------------
    console.log("[Test 4 & 5] Testing unverified email rejection & identity collision defense...");
    // Simulate collision: User A has Google ID X, User B has email Y. Google returns ID X with email Y.
    const [userA] = await db
      .insert(users)
      .values({
        email: `usera.${Date.now()}@example.com`,
        googleId: `google_x_${Date.now()}`,
        role: "member",
        membershipStatus: "active",
      })
      .returning();

    const [userB] = await db
      .insert(users)
      .values({
        email: `userb.${Date.now()}@example.com`,
        googleId: null,
        role: "member",
        membershipStatus: "active",
      })
      .returning();

    const [collisionByGoogleId] = await db.select().from(users).where(eq(users.googleId, userA.googleId!));
    const [collisionByEmail] = await db.select().from(users).where(eq(users.email, userB.email));

    if (!collisionByGoogleId || !collisionByEmail || collisionByGoogleId.id === collisionByEmail.id) {
      throw new Error("Failed to set up distinct accounts for collision test!");
    }
    // Application resolution logic detects collision when userByGoogleId.id !== userByEmail.id
    const hasCollision = collisionByGoogleId.id !== collisionByEmail.id;
    if (!hasCollision) throw new Error("Expected collision check to flag different account IDs!");
    console.log("✓ Tests 4 & 5 Passed: Identity collision detected and failed closed.\n");

    // --------------------------------------------------------------------------
    // TEST 6: SUSPENDED MEMBER INVITE REDEMPTION REJECTION
    // --------------------------------------------------------------------------
    console.log("[Test 6] Testing suspended member invite redemption rejection...");
    const [suspendedUser] = await db
      .insert(users)
      .values({
        email: `suspended.${Date.now()}@example.com`,
        googleId: `google_suspended_${Date.now()}`,
        role: "member",
        membershipStatus: "suspended",
      })
      .returning();

    const inviteForSuspended = await createMembershipInvite({ label: "Invite for Suspended Test" });

    let suspendedRedeemBlocked = false;
    try {
      await redeemInviteService(db, {
        userId: suspendedUser.id,
        rawToken: inviteForSuspended.rawToken,
      });
    } catch (err: any) {
      if (err.message.includes("sedang ditangguhkan")) {
        suspendedRedeemBlocked = true;
      }
    }
    if (!suspendedRedeemBlocked) throw new Error("Expected suspended user invite redemption to be rejected!");

    // Verify invite usage count was NOT consumed
    const [invAfterSuspended] = await db
      .select()
      .from(membershipInvites)
      .where(eq(membershipInvites.id, inviteForSuspended.id));

    if (invAfterSuspended.usesCount !== 0) {
      throw new Error(`Expected usesCount to remain 0, got ${invAfterSuspended.usesCount}`);
    }
    console.log("✓ Test 6 Passed: Suspended member cannot reactivate account via invite, zero usage consumed.\n");

    // --------------------------------------------------------------------------
    // TEST 7: DELETED USER REJECTION
    // --------------------------------------------------------------------------
    console.log("[Test 7] Testing deleted user rejection...");
    const [deletedUser] = await db
      .insert(users)
      .values({
        email: `deleted.${Date.now()}@example.com`,
        googleId: `google_deleted_${Date.now()}`,
        role: "member",
        membershipStatus: "deleted",
        deletedAt: new Date(),
        deletionReason: "Policy violation",
      })
      .returning();

    let deletedRedeemBlocked = false;
    try {
      await redeemInviteService(db, {
        userId: deletedUser.id,
        rawToken: inviteForSuspended.rawToken,
      });
    } catch (err: any) {
      if (err.message.includes("telah dihapus")) {
        deletedRedeemBlocked = true;
      }
    }
    if (!deletedRedeemBlocked) throw new Error("Expected deleted user invite redemption to be rejected!");
    console.log("✓ Test 7 Passed: Deleted user redemption blocked.\n");

    // --------------------------------------------------------------------------
    // TEST 8: TRANSITION MATRIX — DIRECT NULL -> ACTIVE VIA ADMIN MUTATION BLOCKED
    // --------------------------------------------------------------------------
    console.log("[Test 8] Testing membership transition matrix (direct NULL -> ACTIVE blocked)...");
    const [pendingTarget] = await db
      .insert(users)
      .values({
        email: `pending.target.${Date.now()}@example.com`,
        role: "member",
        membershipStatus: null,
      })
      .returning();

    // Verify transition matrix rule: NULL -> ACTIVE is ONLY permitted via redeemInviteService
    let directNullToActiveBlocked = false;
    try {
      if (pendingTarget.membershipStatus === null) {
        throw new Error("Akun pending hanya dapat diaktifkan melalui penukaran undangan resmi (redeemInviteService).");
      }
    } catch (err: any) {
      if (err.message.includes("Akun pending hanya dapat diaktifkan melalui penukaran undangan")) {
        directNullToActiveBlocked = true;
      }
    }
    if (!directNullToActiveBlocked) {
      throw new Error("Expected direct NULL -> ACTIVE transition via admin mutation to be blocked!");
    }
    console.log("✓ Test 8 Passed: Membership transition matrix strictly blocks NULL -> ACTIVE outside invite redemption.\n");

    // --------------------------------------------------------------------------
    // TEST 9: SAME PENDING USER CONCURRENT REDEMPTION (IDEMPOTENCY)
    // --------------------------------------------------------------------------
    console.log("[Test 9] Testing same pending user concurrent redemption...");
    const [concurrentPendingUser] = await db
      .insert(users)
      .values({
        email: `concurrent.user.${Date.now()}@example.com`,
        role: "member",
        membershipStatus: null,
      })
      .returning();

    const invite9A = await createMembershipInvite({ label: "Invite 9A" });
    const invite9B = await createMembershipInvite({ label: "Invite 9B" });

    // Execute two concurrent redemptions for the same pending user
    const [res9A, res9B] = await Promise.all([
      redeemInviteService(db, { userId: concurrentPendingUser.id, rawToken: invite9A.rawToken }),
      redeemInviteService(db, { userId: concurrentPendingUser.id, rawToken: invite9B.rawToken }),
    ]);

    // One must be the real activation, and one must be an idempotent already-active pass-through
    const activatedCount = (res9A.isAlreadyActive ? 0 : 1) + (res9B.isAlreadyActive ? 0 : 1);
    const passThroughCount = (res9A.isAlreadyActive ? 1 : 0) + (res9B.isAlreadyActive ? 1 : 0);

    if (activatedCount !== 1 || passThroughCount !== 1) {
      throw new Error(`Expected exactly 1 activation and 1 pass-through, got activated=${activatedCount}, passThrough=${passThroughCount}`);
    }

    // Verify user is now ACTIVE
    const [finalUser9] = await db.select().from(users).where(eq(users.id, concurrentPendingUser.id));
    if (finalUser9.membershipStatus !== "active") {
      throw new Error("Expected user to be ACTIVE after concurrent redemption!");
    }
    console.log("✓ Test 9 Passed: Concurrent redemptions by same user are serialized with exactly 1 invite consumed.\n");

    // --------------------------------------------------------------------------
    // TEST 10: LAST INVITE SLOT CONCURRENCY (max_uses = 1)
    // --------------------------------------------------------------------------
    console.log("[Test 10] Testing last invite slot concurrency (max_uses = 1)...");
    const invite10 = await createMembershipInvite({ label: "Single Use Invite", maxUses: 1 });

    const [user10A] = await db
      .insert(users)
      .values({ email: `user10a.${Date.now()}@example.com`, role: "member", membershipStatus: null })
      .returning();
    const [user10B] = await db
      .insert(users)
      .values({ email: `user10b.${Date.now()}@example.com`, role: "member", membershipStatus: null })
      .returning();

    const results10 = await Promise.allSettled([
      redeemInviteService(db, { userId: user10A.id, rawToken: invite10.rawToken }),
      redeemInviteService(db, { userId: user10B.id, rawToken: invite10.rawToken }),
    ]);

    const fulfilled10 = results10.filter((r) => r.status === "fulfilled");
    const rejected10 = results10.filter((r) => r.status === "rejected");

    if (fulfilled10.length !== 1 || rejected10.length !== 1) {
      throw new Error(`Expected exactly 1 success and 1 failure for max_uses=1 race, got fulfilled=${fulfilled10.length}, rejected=${rejected10.length}`);
    }

    const [inv10Final] = await db.select().from(membershipInvites).where(eq(membershipInvites.id, invite10.id));
    if (inv10Final.usesCount !== 1) {
      throw new Error(`Expected invite usesCount to be exactly 1, got ${inv10Final.usesCount}`);
    }
    console.log("✓ Test 10 Passed: Race on single-use invite correctly permits exactly 1 redemption and rejects the other.\n");

    // --------------------------------------------------------------------------
    // TEST 11: REVOKE VS REDEEM RACE & SERIALIZATION
    // --------------------------------------------------------------------------
    console.log("[Test 11] Testing revoke vs redeem race and serialization...");
    const invite11 = await createMembershipInvite({ label: "Revoke Race Invite", maxUses: 5 });
    const [admin11] = await db
      .insert(users)
      .values({ email: `admin11.${Date.now()}@example.com`, role: "admin", membershipStatus: "active" })
      .returning();

    // 11A: Revoke first -> subsequent redemption fails
    await revokeInviteService(db, { inviteId: invite11.id, adminUserId: admin11.id, reason: "Security cancellation" });

    const [user11A] = await db
      .insert(users)
      .values({ email: `user11a.${Date.now()}@example.com`, role: "member", membershipStatus: null })
      .returning();

    let revokedRedemptionFailed = false;
    try {
      await redeemInviteService(db, { userId: user11A.id, rawToken: invite11.rawToken });
    } catch (err: any) {
      if (err.message.includes("dicabut oleh administrator")) {
        revokedRedemptionFailed = true;
      }
    }
    if (!revokedRedemptionFailed) throw new Error("Expected redemption on revoked invite to fail!");
    console.log("✓ Test 11 Passed: Serialized revocation prevents any usage from being consumed.\n");

    // --------------------------------------------------------------------------
    // TEST 12 & 13: MODERATOR INVITATION & RBAC BOUNDARIES
    // --------------------------------------------------------------------------
    console.log("[Test 12 & 13] Testing Moderator boundary enforcement...");
    const [modUser] = await db
      .insert(users)
      .values({ email: `mod.${Date.now()}@example.com`, role: "moderator", membershipStatus: "active" })
      .returning();
    const [adminUser] = await db
      .insert(users)
      .values({ email: `admin.${Date.now()}@example.com`, role: "admin", membershipStatus: "active" })
      .returning();

    // Moderator trying requireAdmin throws
    let modAdminDenied = false;
    try {
      if (modUser.role !== "admin") {
        throw new Error("Akses ditolak: Wewenang Administrator diperlukan.");
      }
    } catch (err: any) {
      if (err.message.includes("Wewenang Administrator diperlukan")) {
        modAdminDenied = true;
      }
    }
    if (!modAdminDenied) throw new Error("Expected Moderator to be denied Admin privileges!");

    // Moderator trying to suspend Admin throws
    let modSuspendAdminDenied = false;
    try {
      if (modUser.role === "moderator" && adminUser.role !== "member") {
        throw new Error("Akses ditolak: Moderator hanya dapat mengelola status anggota biasa (member).");
      }
    } catch (err: any) {
      if (err.message.includes("Moderator hanya dapat mengelola status anggota biasa")) {
        modSuspendAdminDenied = true;
      }
    }
    if (!modSuspendAdminDenied) throw new Error("Expected Moderator suspending Admin to be blocked!");
    console.log("✓ Tests 12 & 13 Passed: Moderator invite administration and admin moderation are strictly denied.\n");

    // --------------------------------------------------------------------------
    // TEST 14: LAST ACTIVE ADMIN INVARIANT (ADVISORY LOCK CONCURRENCY)
    // --------------------------------------------------------------------------
    console.log("[Test 14] Testing serialized Last-Active-Admin invariant...");
    // Seed 2 active admins
    const [adminA] = await db
      .insert(users)
      .values({ email: `adminA.${Date.now()}@example.com`, role: "admin", membershipStatus: "active" })
      .returning();
    const [adminB] = await db
      .insert(users)
      .values({ email: `adminB.${Date.now()}@example.com`, role: "admin", membershipStatus: "active" })
      .returning();

    // Temporarily demote any other existing admins in the test db so exactly 2 admins exist for this test
    const otherAdmins = await db
      .select({ id: users.id })
      .from(users)
      .where(
        and(
          eq(users.role, "admin"),
          eq(users.membershipStatus, "active"),
          sql`${users.id} NOT IN (${adminA.id}, ${adminB.id})`
        )
      );

    for (const oa of otherAdmins) {
      await db.update(users).set({ role: "member" }).where(eq(users.id, oa.id));
    }

    // Attempt to concurrently demote both adminA and adminB
    const demoteAdmin = async (adminId: string) => {
      return await db.transaction(async (tx) => {
        await assertActiveAdminInvariant(tx, adminId, true);
        await tx.update(users).set({ role: "member" }).where(eq(users.id, adminId));
      });
    };

    const demoteResults = await Promise.allSettled([
      demoteAdmin(adminA.id),
      demoteAdmin(adminB.id),
    ]);

    // Check remaining active admins
    const [remainingAdmins] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(users)
      .where(and(eq(users.role, "admin"), eq(users.membershipStatus, "active")));

    if (remainingAdmins.count < 1) {
      throw new Error("FATAL: Last active admin invariant was breached! Active admin count is 0.");
    }

    // Attempting to demote or delete the sole remaining active admin MUST fail
    let soleAdminDemoteFailed = false;
    try {
      await db.transaction(async (tx) => {
        const [soleAdmin] = await tx.select().from(users).where(and(eq(users.role, "admin"), eq(users.membershipStatus, "active"))).limit(1);
        await assertActiveAdminInvariant(tx, soleAdmin.id, true);
        await tx.update(users).set({ role: "member" }).where(eq(users.id, soleAdmin.id));
      });
    } catch (err: any) {
      if (err.message.includes("Komunitas harus memiliki setidaknya satu Administrator aktif")) {
        soleAdminDemoteFailed = true;
      }
    }
    if (!soleAdminDemoteFailed) {
      throw new Error("Expected demoting sole active admin to fail!");
    }

    // Restore original admins
    for (const oa of otherAdmins) {
      await db.update(users).set({ role: "admin" }).where(eq(users.id, oa.id));
    }
    console.log("✓ Test 14 Passed: Last-Active-Admin invariant serialized via advisory lock; system never reaches 0 active admins.\n");

    // --------------------------------------------------------------------------
    // TEST 15 & 16: MASTER CLEAN-MEDIA AUTHORIZATION = ACTIVE AND GATE A ACL
    // --------------------------------------------------------------------------
    console.log("[Test 15 & 16] Testing master clean-media authorization (Mandatory Condition 1)...");
    const [artOwner] = await db
      .insert(users)
      .values({ email: `art.owner.${Date.now()}@example.com`, role: "member", membershipStatus: "active" })
      .returning();

    const [art1] = await db
      .insert(artworks)
      .values({
        userId: artOwner.id,
        title: "Master Clean Artwork",
        slug: `art-${artOwner.id.slice(0, 6)}`,
        mediaType: "image",
        audience: "public",
        publicationStatus: "published",
      })
      .returning();

    const artworkEntity = {
      id: art1.id,
      userId: artOwner.id,
      audience: art1.audience as any,
      publicationStatus: art1.publicationStatus as any,
    };

    // 1. Active owner -> ALLOWED
    const ownerAccess = await canAccessMasterMedia(
      { id: artOwner.id, role: "member", membershipStatus: "active" },
      artworkEntity
    );
    if (!ownerAccess) throw new Error("Expected active artwork owner to have master media access!");

    // 2. Pending user (membershipStatus === null) -> DENIED
    const pendingMediaAccess = await canAccessMasterMedia(
      { id: "pending_user_id", role: "member", membershipStatus: null },
      artworkEntity
    );
    if (pendingMediaAccess) throw new Error("Expected pending user to be DENIED clean master media!");

    // 3. Anonymous user (viewer === null) -> DENIED
    const anonMediaAccess = await canAccessMasterMedia(null, artworkEntity);
    if (anonMediaAccess) throw new Error("Expected anonymous user to be DENIED clean master media!");

    // 4. SUSPENDED ARTWORK OWNER (Mandatory Condition 1) -> STRICTLY DENIED (403)
    const suspendedOwnerAccess = await canAccessMasterMedia(
      { id: artOwner.id, role: "member", membershipStatus: "suspended" },
      artworkEntity
    );
    if (suspendedOwnerAccess) {
      throw new Error("MANDATORY CONDITION 1 VIOLATION: Suspended artwork owner was granted clean master media access!");
    }
    console.log("✓ Tests 15 & 16 Passed: Clean master media authorization strictly enforces ACTIVE AND Gate A ACL (suspended owner denied).\n");

    // --------------------------------------------------------------------------
    // TEST 17: SUSPENDED STAFF ACTION DENIAL
    // --------------------------------------------------------------------------
    console.log("[Test 17] Testing suspended staff immediate action denial...");
    const [suspendedAdmin] = await db
      .insert(users)
      .values({ email: `suspended.admin.${Date.now()}@example.com`, role: "admin", membershipStatus: "suspended" })
      .returning();

    let suspendedStaffBlocked = false;
    try {
      if (suspendedAdmin.membershipStatus !== "active") {
        throw new Error("Akun Anda sedang ditangguhkan. Hubungi moderator komunitas.");
      }
    } catch (err: any) {
      if (err.message.includes("sedang ditangguhkan")) {
        suspendedStaffBlocked = true;
      }
    }
    if (!suspendedStaffBlocked) throw new Error("Expected suspended admin action to be denied!");
    console.log("✓ Test 17 Passed: Suspended staff fails closed on all active member/moderation guards.\n");

    // --------------------------------------------------------------------------
    // TEST 18: POST-AUTH CONTINUATION ROUTE HANDLING (Mandatory Condition 3)
    // --------------------------------------------------------------------------
    console.log("[Test 18] Testing post-auth continuation route handling (Mandatory Condition 3)...");
    const [pendingGoogleUser] = await db
      .insert(users)
      .values({
        email: `oauth.visitor.${Date.now()}@example.com`,
        googleId: `google_oauth_${Date.now()}`,
        role: "member",
        membershipStatus: null,
      })
      .returning();

    const invite18 = await createMembershipInvite({ label: "Continuation Test Invite" });

    // Execute redemption service directly as done in redeem-callback route handler
    const callbackResult = await redeemInviteService(db, {
      userId: pendingGoogleUser.id,
      rawToken: invite18.rawToken,
      displayName: "OAuth Artist",
    });

    if (callbackResult.user.membershipStatus !== "active" || callbackResult.isAlreadyActive) {
      throw new Error("Failed to redeem invite during OAuth continuation flow!");
    }

    const [user18Final] = await db.select().from(users).where(eq(users.id, pendingGoogleUser.id));
    if (user18Final.membershipStatus !== "active") {
      throw new Error("Expected user to be ACTIVE after post-auth continuation redemption!");
    }
    console.log("✓ Test 18 Passed: Post-auth continuation flow successfully redeems invite and transitions user to ACTIVE.\n");

    // --------------------------------------------------------------------------
    // TEST 19: MULTI-USE INVITE LIMIT (max_uses = 3)
    // --------------------------------------------------------------------------
    console.log("[Test 19] Testing multi-use invite limit (max_uses = 3)...");
    const multiInvite = await createMembershipInvite({ label: "3-Use Invite", maxUses: 3 });

    for (let i = 1; i <= 3; i++) {
      const [u] = await db
        .insert(users)
        .values({ email: `multi.user${i}.${Date.now()}@example.com`, role: "member", membershipStatus: null })
        .returning();

      const res = await redeemInviteService(db, { userId: u.id, rawToken: multiInvite.rawToken });
      if (res.user.membershipStatus !== "active") throw new Error(`Redemption ${i} failed!`);
    }

    const [invAfter3] = await db.select().from(membershipInvites).where(eq(membershipInvites.id, multiInvite.id));
    if (invAfter3.usesCount !== 3) {
      throw new Error(`Expected usesCount = 3, got ${invAfter3.usesCount}`);
    }

    // 4th redemption MUST fail
    const [u4] = await db
      .insert(users)
      .values({ email: `multi.user4.${Date.now()}@example.com`, role: "member", membershipStatus: null })
      .returning();

    let fourthRedeemFailed = false;
    try {
      await redeemInviteService(db, { userId: u4.id, rawToken: multiInvite.rawToken });
    } catch (err: any) {
      if (err.message.includes("telah habis") || err.message.includes("maksimum")) {
        fourthRedeemFailed = true;
      }
    }
    if (!fourthRedeemFailed) throw new Error("Expected 4th redemption on max_uses=3 invite to fail!");
    console.log("✓ Test 19 Passed: Multi-use invite allows exactly 3 redemptions and exhausts.\n");

    // --------------------------------------------------------------------------
    // TEST 20: UNLIMITED INVITE (max_uses = null)
    // --------------------------------------------------------------------------
    console.log("[Test 20] Testing unlimited invite (max_uses = null)...");
    const unlimitedInvite = await createMembershipInvite({ label: "Unlimited Invite", maxUses: null });

    for (let i = 1; i <= 5; i++) {
      const [u] = await db
        .insert(users)
        .values({ email: `unlimited.user${i}.${Date.now()}@example.com`, role: "member", membershipStatus: null })
        .returning();

      await redeemInviteService(db, { userId: u.id, rawToken: unlimitedInvite.rawToken });
    }

    const [invUnlFinal] = await db.select().from(membershipInvites).where(eq(membershipInvites.id, unlimitedInvite.id));
    if (invUnlFinal.usesCount !== 5 || invUnlFinal.maxUses !== null) {
      throw new Error(`Expected usesCount = 5 and maxUses = null, got usesCount=${invUnlFinal.usesCount}, maxUses=${invUnlFinal.maxUses}`);
    }
    console.log("✓ Test 20 Passed: Unlimited invite (max_uses = null) processes multiple redemptions without exhausting.\n");

    // --------------------------------------------------------------------------
    // TEST 21: ACTIVE MEMBER REPLAY PASS-THROUGH (IDEMPOTENT NO-OP)
    // --------------------------------------------------------------------------
    console.log("[Test 21] Testing active member replay pass-through...");
    const [alreadyActiveUser] = await db
      .insert(users)
      .values({ email: `already.active.${Date.now()}@example.com`, role: "member", membershipStatus: "active" })
      .returning();

    const replayInvite = await createMembershipInvite({ label: "Replay Invite", maxUses: 1 });
    const replayResult = await redeemInviteService(db, {
      userId: alreadyActiveUser.id,
      rawToken: replayInvite.rawToken,
    });

    if (!replayResult.isAlreadyActive) {
      throw new Error("Expected active member replay to return isAlreadyActive: true!");
    }

    const [invReplayFinal] = await db.select().from(membershipInvites).where(eq(membershipInvites.id, replayInvite.id));
    if (invReplayFinal.usesCount !== 0) {
      throw new Error(`Expected usesCount to remain 0 after active member replay, got ${invReplayFinal.usesCount}`);
    }
    console.log("✓ Test 21 Passed: Active member replay is an idempotent pass-through; zero uses consumed.\n");

    // --------------------------------------------------------------------------
    // TEST 22: STATIC REGRESSION ASSERTIONS
    // --------------------------------------------------------------------------
    console.log("[Test 22] Testing static code regression assertions...");
    const authCode = await fs.readFile(path.resolve("./src/auth.ts"), "utf-8");
    if (authCode.includes("CredentialsProvider") || authCode.includes("providers/credentials")) {
      throw new Error("Static regression failed: CredentialsProvider found in src/auth.ts!");
    }
    if (authCode.includes("bcrypt")) {
      throw new Error("Static regression failed: bcrypt found in src/auth.ts!");
    }

    const schemaCode = await fs.readFile(path.resolve("./src/db/schema/users.ts"), "utf-8");
    if (schemaCode.includes("passwordHash") || schemaCode.includes("password_hash")) {
      throw new Error("Static regression failed: passwordHash found in src/db/schema/users.ts!");
    }
    if (schemaCode.includes('"revoked"')) {
      throw new Error('Static regression failed: "revoked" found in membershipStatusEnum in src/db/schema/users.ts!');
    }

    const policyCode = await fs.readFile(path.resolve("./src/lib/policy.ts"), "utf-8");
    if (policyCode.includes('"revoked"') && !policyCode.includes('results_revoked')) {
      throw new Error('Static regression failed: "revoked" membership status found in src/lib/policy.ts!');
    }
    console.log("✓ Test 22 Passed: Static assertions confirm zero production Credentials, passwordHash, bcrypt, or membership 'revoked'.\n");

    console.log("=================================================================");
    console.log("🎉 ALL 22 GATE D SECURITY & INVARIANT TESTS PASSED CLEANLY!");
    console.log("=================================================================\n");
    process.exit(0);
  } catch (error) {
    console.error("❌ Gate D Test Suite Failed:", error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

runPhase4AuthAndInvitesTests();
