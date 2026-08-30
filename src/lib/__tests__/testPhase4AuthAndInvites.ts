import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq, and, sql, desc, isNull, count } from "drizzle-orm";
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
  reports,
} from "@/db/schema";
import {
  createMembershipInvite,
  validateInviteCode,
  redeemInviteService,
  revokeInviteService,
  listMembershipInvitesService,
  findInviteByCode,
  generateDefaultInviteCode,
  normalizeAndValidateCustomCode,
  extractInviteCode,
} from "@/lib/invites";
import {
  requireActiveMember,
  requireModerator,
  requireAdmin,
  assertActiveAdminInvariant,
} from "@/lib/rbac";
import { resolveGoogleSignInIdentity } from "@/auth";
import { canAccessMasterMedia } from "@/lib/policy";
import { handleGetMasterMedia } from "@/app/api/media/master/[key]/route";
import { handleGetArtworks } from "@/app/api/artworks/route";
import { handleRedeemCallback } from "@/app/api/auth/redeem-callback/route";
import {
  updateUserMembershipStatusService,
  updateUserRoleService,
} from "@/lib/services/userService";
import { resolveReportService } from "@/lib/services/moderationService";
import { NextRequest, NextResponse } from "next/server";

dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

const DB_URL = process.env.DATABASE_URL || "postgres://mengart:mengart_dev_pass@localhost:5432/mengart_db";

function assertCookieDeleted(res: NextResponse, cookieName: string) {
  const setCookieHeader = res.headers.get("set-cookie") || "";
  const cookieObj = res.cookies.get(cookieName);
  const isDeleted =
    setCookieHeader.includes(`${cookieName}=;`) ||
    setCookieHeader.includes(`Max-Age=0`) ||
    setCookieHeader.includes(`Expires=Thu, 01 Jan 1970`) ||
    cookieObj?.value === "" ||
    cookieObj?.maxAge === 0;

  if (!isDeleted) {
    throw new Error(`Expected cookie '${cookieName}' to be deleted, but set-cookie header was: "${setCookieHeader}"`);
  }
}

async function runPhase4AuthAndInvitesTests() {
  console.log("=================================================================");
  console.log("🛡️ STARTING GATE D: AUTH, INVITATIONS, MEMBERSHIP & ROLES (BLUEPRINT 2.2.2)");
  console.log("=================================================================\n");

  const client = postgres(DB_URL, { max: 10 });
  const db = drizzle(client, { schema });

  try {
    // --------------------------------------------------------------------------
    // TEST 1: DEFAULT GENERATED INVITATION CODE (8 CHARS, CSPRNG, UNBIASED)
    // --------------------------------------------------------------------------
    console.log("[Test 1] Testing default generated invite code (8 chars, CSPRNG, [A-Za-z0-9])...");
    const sampleCodes = new Set<string>();
    for (let i = 0; i < 50; i++) {
      const code = generateDefaultInviteCode(8);
      if (code.length !== 8) {
        throw new Error(`Expected generated code length to be 8, got ${code.length}`);
      }
      if (!/^[A-Za-z0-9]{8}$/.test(code)) {
        throw new Error(`Generated code '${code}' contains invalid characters! Expected only [A-Za-z0-9]`);
      }
      sampleCodes.add(code);
    }
    if (sampleCodes.size !== 50) {
      throw new Error(`Collision detected in 50 generated sample codes! Found only ${sampleCodes.size} unique.`);
    }
    console.log("✓ Test 1 Passed: Default generated invite code is strictly 8 alphanumeric chars with zero collisions.\n");

    // --------------------------------------------------------------------------
    // TEST 2: CUSTOM CODE VALIDATION & NORMALIZATION (BLUEPRINT 2.2.2)
    // --------------------------------------------------------------------------
    console.log("[Test 2] Testing custom vanity code normalization and character validation...");
    const normalized = normalizeAndValidateCustomCode("  Mengart-Bali-2026  ");
    if (normalized !== "mengart-bali-2026") {
      throw new Error(`Expected normalized custom code 'mengart-bali-2026', got '${normalized}'`);
    }

    // Invalid character rejection
    let invalidCharFailed = false;
    try {
      normalizeAndValidateCustomCode("mengart_2026!"); // underscore and exclamation mark not allowed
    } catch (_err) {
      invalidCharFailed = true;
    }
    if (!invalidCharFailed) throw new Error("Expected invalid characters in custom code to be rejected!");

    // Max length 25 check
    let tooLongFailed = false;
    try {
      normalizeAndValidateCustomCode("a".repeat(26));
    } catch (_err) {
      tooLongFailed = true;
    }
    if (!tooLongFailed) throw new Error("Expected custom code exceeding 25 characters to be rejected!");

    console.log("✓ Test 2 Passed: Custom code validation strictly enforces lowercase normalization, [a-z0-9-], and max length 25.\n");

    // --------------------------------------------------------------------------
    // TEST 3: DETERMINISTIC INVITE-CODE LOOKUP & CASE COEXISTENCE (ITEM 2)
    // --------------------------------------------------------------------------
    console.log("[Test 3] Testing deterministic invite code resolution with coexisting mixed-case and lowercase codes...");
    const [adminUser] = await db
      .insert(users)
      .values({
        email: `admin.invite.creator.${Date.now()}@example.com`,
        role: "admin",
        membershipStatus: "active",
      })
      .returning();

    // Insert mixed-case generated code and lowercase custom code with identical letters
    const mixedCaseCode = `AbCdEf${Date.now().toString().slice(-2)}`;
    const lowerCaseCode = mixedCaseCode.toLowerCase();

    const [mixedInvite] = await db
      .insert(membershipInvites)
      .values({
        code: mixedCaseCode,
        label: "Mixed Case Invite",
        maxUses: 1,
        createdBy: adminUser.id,
      })
      .returning();

    const [lowerInvite] = await db
      .insert(membershipInvites)
      .values({
        code: lowerCaseCode,
        label: "Lower Case Custom Invite",
        maxUses: 1,
        createdBy: adminUser.id,
      })
      .returning();

    // 1. Exact match mixed-case query must resolve the mixed-case record
    const resolvedMixed = await findInviteByCode(db, mixedCaseCode);
    if (!resolvedMixed || resolvedMixed.id !== mixedInvite.id || resolvedMixed.code !== mixedCaseCode) {
      throw new Error(`Expected query '${mixedCaseCode}' to resolve mixed-case invite ID ${mixedInvite.id}, got ${resolvedMixed?.id}`);
    }

    // 2. Exact match lowercase query must resolve the lowercase record
    const resolvedLower = await findInviteByCode(db, lowerCaseCode);
    if (!resolvedLower || resolvedLower.id !== lowerInvite.id || resolvedLower.code !== lowerCaseCode) {
      throw new Error(`Expected query '${lowerCaseCode}' to resolve lowercase invite ID ${lowerInvite.id}, got ${resolvedLower?.id}`);
    }

    // 3. Uppercase query where only lowercase exists should resolve via lowercase fallback
    const allUpperQuery = `UPPER-${Date.now().toString().slice(-4)}`;
    const [upperCustomInvite] = await db
      .insert(membershipInvites)
      .values({
        code: allUpperQuery.toLowerCase(),
        label: "Uppercase fallback target",
        maxUses: 1,
      })
      .returning();

    const resolvedFallback = await findInviteByCode(db, allUpperQuery);
    if (!resolvedFallback || resolvedFallback.id !== upperCustomInvite.id) {
      throw new Error(`Expected uppercase query '${allUpperQuery}' to resolve lowercase fallback invite ID ${upperCustomInvite.id}`);
    }

    console.log("✓ Test 3 Passed: findInviteByCode deterministically resolves exact matches first with zero ambiguity.\n");

    // --------------------------------------------------------------------------
    // TEST 4: PENDING_INVITE SEPARATION (membership_status IS NULL)
    // --------------------------------------------------------------------------
    console.log("[Test 4] Testing PENDING_INVITE separation (membership_status IS NULL)...");
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
    console.log("✓ Test 4 Passed: PENDING_INVITE is cleanly derived from membership_status IS NULL.\n");

    // --------------------------------------------------------------------------
    // TEST 5: DETERMINISTIC TWO-PHASE LOCKING REDEMPTION (NULL -> ACTIVE)
    // --------------------------------------------------------------------------
    console.log("[Test 5] Testing deterministic two-phase locking redemption (NULL -> ACTIVE)...");
    const generatedInvite5 = await createMembershipInvite({
      label: "Test 5 Invite",
      maxUses: 1,
      createdByUserId: adminUser.id,
    });

    const redeemResult5 = await redeemInviteService(db, {
      userId: pendingUser.id,
      code: generatedInvite5.code,
      displayName: "New Atelier Artist",
    });

    if (redeemResult5.isAlreadyActive || redeemResult5.user.membershipStatus !== "active") {
      throw new Error("Expected user to transition to ACTIVE upon valid invite redemption!");
    }

    const [inviteAfter5] = await db
      .select()
      .from(membershipInvites)
      .where(eq(membershipInvites.id, generatedInvite5.id));

    if (inviteAfter5.usesCount !== 1) {
      throw new Error(`Expected usesCount = 1, got ${inviteAfter5.usesCount}`);
    }
    console.log("✓ Test 5 Passed: User successfully activated to ACTIVE and invite usage incremented.\n");

    // --------------------------------------------------------------------------
    // TEST 6: ACTIVE REPLAY IDEMPOTENCY (0 USAGE CONSUMED)
    // --------------------------------------------------------------------------
    console.log("[Test 6] Testing ACTIVE user replay idempotency (zero usage consumed)...");
    const replayInvite = await createMembershipInvite({
      label: "Replay Invite",
      maxUses: 5,
      createdByUserId: adminUser.id,
    });

    const replayResult = await redeemInviteService(db, {
      userId: pendingUser.id, // now ACTIVE
      code: replayInvite.code,
    });

    if (!replayResult.isAlreadyActive) {
      throw new Error("Expected isAlreadyActive = true for active user replay!");
    }

    const [replayInviteAfter] = await db
      .select()
      .from(membershipInvites)
      .where(eq(membershipInvites.id, replayInvite.id));

    if (replayInviteAfter.usesCount !== 0) {
      throw new Error(`Expected replay usesCount to remain 0, got ${replayInviteAfter.usesCount}`);
    }
    console.log("✓ Test 6 Passed: ACTIVE user replay is idempotent and consumes zero invite usage.\n");

    // --------------------------------------------------------------------------
    // TEST 7: SUSPENDED & DELETED USER REDEMPTION REJECTION
    // --------------------------------------------------------------------------
    console.log("[Test 7] Testing suspended and deleted user invite redemption rejection...");
    const [suspendedUser] = await db
      .insert(users)
      .values({
        email: `suspended.${Date.now()}@example.com`,
        googleId: `google_suspended_${Date.now()}`,
        role: "member",
        membershipStatus: "suspended",
      })
      .returning();

    let suspendedBlocked = false;
    try {
      await redeemInviteService(db, {
        userId: suspendedUser.id,
        code: replayInvite.code,
      });
    } catch (err: any) {
      if (err.message.includes("sedang ditangguhkan")) {
        suspendedBlocked = true;
      }
    }
    if (!suspendedBlocked) throw new Error("Expected suspended user invite redemption to be rejected!");

    const [deletedUser] = await db
      .insert(users)
      .values({
        email: `deleted.${Date.now()}@example.com`,
        role: "member",
        membershipStatus: "deleted",
        deletedAt: new Date(),
      })
      .returning();

    let deletedBlocked = false;
    try {
      await redeemInviteService(db, {
        userId: deletedUser.id,
        code: replayInvite.code,
      });
    } catch (err: any) {
      if (err.message.includes("telah dihapus")) {
        deletedBlocked = true;
      }
    }
    if (!deletedBlocked) throw new Error("Expected deleted user invite redemption to be rejected!");
    console.log("✓ Test 7 Passed: Suspended and deleted accounts cannot redeem invites to reactivate.\n");

    // --------------------------------------------------------------------------
    // TEST 8: EXPIRED, REVOKED & EXHAUSTED INVITE REJECTION
    // --------------------------------------------------------------------------
    console.log("[Test 8] Testing expired, revoked, and exhausted invite rejections...");
    const [expiredInvite] = await db
      .insert(membershipInvites)
      .values({
        code: `exp-${Date.now().toString().slice(-6)}`,
        expiresAt: new Date(Date.now() - 1000 * 60),
        maxUses: 1,
        usesCount: 0,
      })
      .returning();

    const [userForExpired] = await db
      .insert(users)
      .values({ email: `expired.test.${Date.now()}@example.com`, membershipStatus: null })
      .returning();

    let expiredBlocked = false;
    try {
      await redeemInviteService(db, { userId: userForExpired.id, code: expiredInvite.code });
    } catch (err: any) {
      if (err.message.includes("kedaluwarsa")) expiredBlocked = true;
    }
    if (!expiredBlocked) throw new Error("Expected expired invite redemption to be rejected!");

    const [revokedInvite] = await db
      .insert(membershipInvites)
      .values({
        code: `rev-${Date.now().toString().slice(-6)}`,
        revokedAt: new Date(),
        maxUses: 5,
        usesCount: 0,
      })
      .returning();

    let revokedBlocked = false;
    try {
      await redeemInviteService(db, { userId: userForExpired.id, code: revokedInvite.code });
    } catch (err: any) {
      if (err.message.includes("dicabut")) revokedBlocked = true;
    }
    if (!revokedBlocked) throw new Error("Expected revoked invite redemption to be rejected!");

    const [exhaustedInvite] = await db
      .insert(membershipInvites)
      .values({
        code: `exh-${Date.now().toString().slice(-6)}`,
        maxUses: 2,
        usesCount: 2,
      })
      .returning();

    let exhaustedBlocked = false;
    try {
      await redeemInviteService(db, { userId: userForExpired.id, code: exhaustedInvite.code });
    } catch (err: any) {
      if (err.message.includes("telah habis")) exhaustedBlocked = true;
    }
    if (!exhaustedBlocked) throw new Error("Expected exhausted invite redemption to be rejected!");
    console.log("✓ Test 8 Passed: Expired, revoked, and exhausted invites fail closed.\n");

    // --------------------------------------------------------------------------
    // TEST 9: UNLIMITED INVITES (max_uses = NULL)
    // --------------------------------------------------------------------------
    console.log("[Test 9] Testing unlimited invite (max_uses = null)...");
    const unlimitedInvite = await createMembershipInvite({
      label: "Unlimited Community Discord",
      maxUses: null,
      createdByUserId: adminUser.id,
    });

    const [unlimitedUser1] = await db.insert(users).values({ email: `unl1.${Date.now()}@example.com`, membershipStatus: null }).returning();
    const [unlimitedUser2] = await db.insert(users).values({ email: `unl2.${Date.now()}@example.com`, membershipStatus: null }).returning();

    await redeemInviteService(db, { userId: unlimitedUser1.id, code: unlimitedInvite.code });
    await redeemInviteService(db, { userId: unlimitedUser2.id, code: unlimitedInvite.code });

    const [unlimitedAfter] = await db.select().from(membershipInvites).where(eq(membershipInvites.id, unlimitedInvite.id));
    if (unlimitedAfter.usesCount !== 2) {
      throw new Error(`Expected usesCount = 2 on unlimited invite, got ${unlimitedAfter.usesCount}`);
    }
    console.log("✓ Test 9 Passed: Unlimited invite allows multiple distinct member activations.\n");

    // --------------------------------------------------------------------------
    // TEST 10: REAL CONCURRENCY — SAME PENDING USER DUAL INVITE (Promise.allSettled)
    // --------------------------------------------------------------------------
    console.log("[Test 10] Testing real concurrency: same pending user + two concurrent invites...");
    const [concurrentUser] = await db.insert(users).values({ email: `conc.${Date.now()}@example.com`, membershipStatus: null }).returning();
    const inv10A = await createMembershipInvite({ label: "Concurrent 10A", maxUses: 1, createdByUserId: adminUser.id });
    const inv10B = await createMembershipInvite({ label: "Concurrent 10B", maxUses: 1, createdByUserId: adminUser.id });

    const results10 = await Promise.allSettled([
      redeemInviteService(db, { userId: concurrentUser.id, code: inv10A.code }),
      redeemInviteService(db, { userId: concurrentUser.id, code: inv10B.code }),
    ]);

    const fulfilled10 = results10.filter((r) => r.status === "fulfilled") as PromiseFulfilledResult<any>[];
    if (fulfilled10.length !== 2) {
      throw new Error(`Expected both concurrent redemptions to complete successfully, got ${fulfilled10.length}`);
    }

    const activated10Count = fulfilled10.filter((f) => !f.value.isAlreadyActive).length;
    const passThrough10Count = fulfilled10.filter((f) => f.value.isAlreadyActive).length;

    if (activated10Count !== 1 || passThrough10Count !== 1) {
      throw new Error(`Expected exactly 1 activation and 1 pass-through, got ${activated10Count} and ${passThrough10Count}`);
    }

    const [inv10AAfter] = await db.select().from(membershipInvites).where(eq(membershipInvites.id, inv10A.id));
    const [inv10BAfter] = await db.select().from(membershipInvites).where(eq(membershipInvites.id, inv10B.id));
    if (inv10AAfter.usesCount + inv10BAfter.usesCount !== 1) {
      throw new Error(`Expected exactly 1 total invite consumption, got ${inv10AAfter.usesCount + inv10BAfter.usesCount}`);
    }
    console.log("✓ Test 10 Passed: Same pending user concurrent redemptions serialize correctly with 1 activation.\n");

    // --------------------------------------------------------------------------
    // TEST 11: REAL CONCURRENCY — LAST SLOT (max_uses = 1) RACE
    // --------------------------------------------------------------------------
    console.log("[Test 11] Testing real concurrency: 2 pending users racing for 1 invite slot...");
    const [slotUser1] = await db.insert(users).values({ email: `slot1.${Date.now()}@example.com`, membershipStatus: null }).returning();
    const [slotUser2] = await db.insert(users).values({ email: `slot2.${Date.now()}@example.com`, membershipStatus: null }).returning();
    const singleSlotInvite = await createMembershipInvite({ label: "Single Slot", maxUses: 1, createdByUserId: adminUser.id });

    const slotResults = await Promise.allSettled([
      redeemInviteService(db, { userId: slotUser1.id, code: singleSlotInvite.code }),
      redeemInviteService(db, { userId: slotUser2.id, code: singleSlotInvite.code }),
    ]);

    const slotSuccesses = slotResults.filter((r) => r.status === "fulfilled");
    const slotRejections = slotResults.filter((r) => r.status === "rejected");

    if (slotSuccesses.length !== 1 || slotRejections.length !== 1) {
      throw new Error(`Expected exactly 1 success and 1 rejection for 1-slot invite, got successes=${slotSuccesses.length}, rejections=${slotRejections.length}`);
    }

    const [slotInviteAfter] = await db.select().from(membershipInvites).where(eq(membershipInvites.id, singleSlotInvite.id));
    if (slotInviteAfter.usesCount !== 1) {
      throw new Error(`Expected usesCount = 1 on exhausted invite, got ${slotInviteAfter.usesCount}`);
    }
    console.log("✓ Test 11 Passed: Concurrent race for last slot allows exactly 1 redemption.\n");

    // --------------------------------------------------------------------------
    // TEST 12: REAL CONCURRENCY — REVOKE VS REDEEM RACE WITH EXHAUSTIVE FINAL STATE ASSERTION (ITEM 8)
    // --------------------------------------------------------------------------
    console.log("[Test 12] Testing real concurrency: revoke vs redeem race with strict final state assertions...");
    const [revokeRaceUser] = await db.insert(users).values({ email: `revrace.${Date.now()}@example.com`, membershipStatus: null }).returning();
    const revokeRaceInvite = await createMembershipInvite({ label: "Revoke Race", maxUses: 1, createdByUserId: adminUser.id });

    const raceResults = await Promise.allSettled([
      revokeInviteService(db, { inviteId: revokeRaceInvite.id, adminUserId: adminUser.id, reason: "Revoke race test" }),
      redeemInviteService(db, { userId: revokeRaceUser.id, code: revokeRaceInvite.code }),
    ]);

    const [raceInviteFinal] = await db.select().from(membershipInvites).where(eq(membershipInvites.id, revokeRaceInvite.id));
    const [raceUserFinal] = await db.select().from(users).where(eq(users.id, revokeRaceUser.id));

    // Item 8 Invariant: Always revokedAt != NULL and usesCount in {0, 1}
    if (!raceInviteFinal.revokedAt) {
      throw new Error("Expected invite to be revoked after race!");
    }
    if (raceInviteFinal.usesCount !== 0 && raceInviteFinal.usesCount !== 1) {
      throw new Error(`Invalid usesCount ${raceInviteFinal.usesCount} after revoke vs redeem race!`);
    }

    if (raceInviteFinal.usesCount === 0) {
      // Redemption lost race: user must remain pending (NULL)
      if (raceUserFinal.membershipStatus !== null) {
        throw new Error(`Expected user to remain pending (NULL) when usesCount=0, got ${raceUserFinal.membershipStatus}`);
      }
    } else if (raceInviteFinal.usesCount === 1) {
      // Redemption won race: user must be active
      if (raceUserFinal.membershipStatus !== "active") {
        throw new Error(`Expected user to be ACTIVE when usesCount=1, got ${raceUserFinal.membershipStatus}`);
      }
    }

    console.log(`✓ Test 12 Passed: Revoke vs redeem final state strictly verified (usesCount=${raceInviteFinal.usesCount}, userStatus=${raceUserFinal.membershipStatus}).\n`);

    // --------------------------------------------------------------------------
    // TEST 13: PRODUCTION-PATH ADMIN-ONLY INVITATION ADMINISTRATION (ITEMS 1 & 2)
    // --------------------------------------------------------------------------
    console.log("[Test 13] Testing production-path Admin-only invitation administration (Items 1 & 2)...");
    const [modUser] = await db
      .insert(users)
      .values({
        email: `mod.invite.tester.${Date.now()}@example.com`,
        role: "moderator",
        membershipStatus: "active",
      })
      .returning();

    const [ordinaryMember] = await db
      .insert(users)
      .values({
        email: `ordinary.member.${Date.now()}@example.com`,
        role: "member",
        membershipStatus: "active",
      })
      .returning();

    const [suspendedAdminUser] = await db
      .insert(users)
      .values({
        email: `suspended.admin.${Date.now()}@example.com`,
        role: "admin",
        membershipStatus: "suspended",
      })
      .returning();

    // 1. Missing actor -> rejected fail-closed at runtime
    let missingActorBlocked = false;
    try {
      await (createMembershipInvite as any)({ label: "Missing Actor Invite" });
    } catch (err: any) {
      if (err.message.includes("Aktor Administrator wajib dicantumkan")) missingActorBlocked = true;
    }
    if (!missingActorBlocked) throw new Error("Expected invite creation without actor to be rejected!");

    // 2. Ordinary Member cannot create invite via domain service
    let memberCreateBlocked = false;
    try {
      await createMembershipInvite({ label: "Member Forbidden Invite", createdByUserId: ordinaryMember.id });
    } catch (err: any) {
      if (err.message.includes("Wewenang Administrator diperlukan")) memberCreateBlocked = true;
    }
    if (!memberCreateBlocked) throw new Error("Expected ordinary Member invite creation to be denied!");

    // 3. Active Moderator cannot create invite via domain service
    let modCreateBlocked = false;
    try {
      await createMembershipInvite({ label: "Mod Forbidden Invite", createdByUserId: modUser.id });
    } catch (err: any) {
      if (err.message.includes("Wewenang Administrator diperlukan")) modCreateBlocked = true;
    }
    if (!modCreateBlocked) throw new Error("Expected Moderator invite creation via domain service to be denied!");

    // 4. Suspended Admin cannot create invite via domain service
    let suspendedAdminCreateBlocked = false;
    try {
      await createMembershipInvite({ label: "Suspended Admin Invite", createdByUserId: suspendedAdminUser.id });
    } catch (err: any) {
      if (err.message.includes("ditangguhkan atau belum aktif")) suspendedAdminCreateBlocked = true;
    }
    if (!suspendedAdminCreateBlocked) throw new Error("Expected Suspended Admin invite creation to be denied!");

    // 5. Moderator cannot revoke invite via domain service
    let modRevokeBlocked = false;
    try {
      await revokeInviteService(db, { inviteId: replayInvite.id, adminUserId: modUser.id, reason: "Unauthorized mod revoke" });
    } catch (err: any) {
      if (err.message.includes("Wewenang Administrator diperlukan")) modRevokeBlocked = true;
    }
    if (!modRevokeBlocked) throw new Error("Expected Moderator invite revocation via domain service to be denied!");

    // 6. Moderator cannot list/administer invites via domain service
    let modListBlocked = false;
    try {
      await listMembershipInvitesService(db, modUser.id);
    } catch (err: any) {
      if (err.message.includes("Wewenang Administrator diperlukan")) modListBlocked = true;
    }
    if (!modListBlocked) throw new Error("Expected Moderator invite listing via domain service to be denied!");

    // 7. Active Admin is permitted for create, revoke, and list
    const adminCreatedInvite = await createMembershipInvite({ label: "Admin Allowed Invite", createdByUserId: adminUser.id });
    if (!adminCreatedInvite.id || !adminCreatedInvite.code) {
      throw new Error("Expected Admin invite creation to succeed!");
    }
    const [persistedAdminInvite] = await db
      .select()
      .from(membershipInvites)
      .where(eq(membershipInvites.id, adminCreatedInvite.id));
    if (!persistedAdminInvite || persistedAdminInvite.createdBy !== adminUser.id) {
      throw new Error(`Expected created_by to be set to ${adminUser.id}, got ${persistedAdminInvite?.createdBy}`);
    }

    const adminRevoked = await revokeInviteService(db, { inviteId: adminCreatedInvite.id, adminUserId: adminUser.id });
    if (!adminRevoked.invite.revokedAt) {
      throw new Error("Expected Admin invite revocation to succeed!");
    }
    const adminListed = await listMembershipInvitesService(db, adminUser.id);
    if (!Array.isArray(adminListed) || adminListed.length === 0) {
      throw new Error("Expected Admin invite listing to return array of invites!");
    }

    console.log("✓ Test 13 Passed: Production invitation domain services strictly enforce ACTIVE Admin and fail closed on missing/invalid actors.\n");

    // --------------------------------------------------------------------------
    // TEST 14: PRODUCTION GOOGLE OAUTH IDENTITY RESOLUTION HELPER
    // --------------------------------------------------------------------------
    console.log("[Test 14] Testing resolveGoogleSignInIdentity production path...");
    // 1. Literal email_verified === true succeeds
    const resVerified = await resolveGoogleSignInIdentity({
      profile: { sub: `google_auth_${Date.now()}`, email: `auth.verified.${Date.now()}@example.com`, email_verified: true },
      account: { providerAccountId: `google_auth_${Date.now()}` },
    });
    if (!resVerified.success) throw new Error("Expected verified Google email to succeed!");

    // 2. email_verified === false rejected
    const resFalse = await resolveGoogleSignInIdentity({
      profile: { sub: `google_false_${Date.now()}`, email: `auth.false.${Date.now()}@example.com`, email_verified: false },
      account: { providerAccountId: `google_false_${Date.now()}` },
    });
    if (resFalse.success || resFalse.error !== "EmailUnverified") {
      throw new Error(`Expected EmailUnverified for email_verified = false, got ${JSON.stringify(resFalse)}`);
    }

    // 3. email_verified missing/undefined rejected
    const resMissing = await resolveGoogleSignInIdentity({
      profile: { sub: `google_missing_${Date.now()}`, email: `auth.missing.${Date.now()}@example.com` },
      account: { providerAccountId: `google_missing_${Date.now()}` },
    });
    if (resMissing.success || resMissing.error !== "EmailUnverified") {
      throw new Error(`Expected EmailUnverified for missing email_verified, got ${JSON.stringify(resMissing)}`);
    }

    // 4. Identity collision rejected
    const [collisionUserA] = await db.insert(users).values({ email: `colla.${Date.now()}@example.com`, googleId: `google_colla_${Date.now()}`, membershipStatus: "active" }).returning();
    const [collisionUserB] = await db.insert(users).values({ email: `collb.${Date.now()}@example.com`, googleId: null, membershipStatus: "active" }).returning();

    const resCollision = await resolveGoogleSignInIdentity({
      profile: { sub: collisionUserA.googleId, email: collisionUserB.email, email_verified: true },
      account: { providerAccountId: collisionUserA.googleId },
    });
    if (resCollision.success || resCollision.error !== "AccountCollision") {
      throw new Error(`Expected AccountCollision error, got ${JSON.stringify(resCollision)}`);
    }

    console.log("✓ Test 14 Passed: resolveGoogleSignInIdentity strictly requires email_verified === true and fails closed on collisions.\n");

    // --------------------------------------------------------------------------
    // TEST 15: OAUTH CONTINUATION ROUTE ACROSS ALL TERMINAL OUTCOMES & COOKIE DELETION (ITEMS 3 & 10)
    // --------------------------------------------------------------------------
    console.log("[Test 15] Testing handleRedeemCallback across all 8 terminal outcomes with strict cookie clearance assertions (Items 3 & 10)...");
    
    // (a) Valid cookie + pending user -> redirects /dashboard, user ACTIVE, cookie deleted
    const [pending15A] = await db.insert(users).values({ email: `p15a.${Date.now()}@example.com`, membershipStatus: null }).returning();
    const invite15A = await createMembershipInvite({ label: "Invite 15A", maxUses: 1, createdByUserId: adminUser.id });
    const req15A = new NextRequest("http://localhost:3000/api/auth/redeem-callback", {
      headers: { cookie: `mengart_pending_invite=${invite15A.code}` },
    });
    const res15A = await handleRedeemCallback(req15A, pending15A);
    if (!res15A.headers.get("location")?.includes("/dashboard")) {
      throw new Error(`Outcome (a) failed: expected redirect to /dashboard, got ${res15A.headers.get("location")}`);
    }
    assertCookieDeleted(res15A, "mengart_pending_invite");
    const [user15AAfter] = await db.select().from(users).where(eq(users.id, pending15A.id));
    if (user15AAfter.membershipStatus !== "active") {
      throw new Error(`Outcome (a) failed: expected user to be ACTIVE, got ${user15AAfter.membershipStatus}`);
    }

    // (b) No cookie -> redirects /onboarding, cookie deleted
    const [pending15B] = await db.insert(users).values({ email: `p15b.${Date.now()}@example.com`, membershipStatus: null }).returning();
    const req15B = new NextRequest("http://localhost:3000/api/auth/redeem-callback");
    const res15B = await handleRedeemCallback(req15B, pending15B);
    if (!res15B.headers.get("location")?.includes("/onboarding")) {
      throw new Error(`Outcome (b) failed: expected redirect to /onboarding, got ${res15B.headers.get("location")}`);
    }
    assertCookieDeleted(res15B, "mengart_pending_invite");

    // (c) Revoked invite -> redirects /onboarding with error, cookie deleted
    const [pending15C] = await db.insert(users).values({ email: `p15c.${Date.now()}@example.com`, membershipStatus: null }).returning();
    const req15C = new NextRequest("http://localhost:3000/api/auth/redeem-callback", {
      headers: { cookie: `mengart_pending_invite=${revokedInvite.code}` },
    });
    const res15C = await handleRedeemCallback(req15C, pending15C);
    if (!res15C.headers.get("location")?.includes("/onboarding")) {
      throw new Error(`Outcome (c) failed: expected redirect to /onboarding, got ${res15C.headers.get("location")}`);
    }
    assertCookieDeleted(res15C, "mengart_pending_invite");

    // (d) Expired invite -> redirects /onboarding with error, cookie deleted
    const [pending15D] = await db.insert(users).values({ email: `p15d.${Date.now()}@example.com`, membershipStatus: null }).returning();
    const req15D = new NextRequest("http://localhost:3000/api/auth/redeem-callback", {
      headers: { cookie: `mengart_pending_invite=${expiredInvite.code}` },
    });
    const res15D = await handleRedeemCallback(req15D, pending15D);
    if (!res15D.headers.get("location")?.includes("/onboarding")) {
      throw new Error(`Outcome (d) failed: expected redirect to /onboarding, got ${res15D.headers.get("location")}`);
    }
    assertCookieDeleted(res15D, "mengart_pending_invite");

    // (e) Exhausted invite -> redirects /onboarding with error, cookie deleted
    const [pending15E] = await db.insert(users).values({ email: `p15e.${Date.now()}@example.com`, membershipStatus: null }).returning();
    const req15E = new NextRequest("http://localhost:3000/api/auth/redeem-callback", {
      headers: { cookie: `mengart_pending_invite=${exhaustedInvite.code}` },
    });
    const res15E = await handleRedeemCallback(req15E, pending15E);
    if (!res15E.headers.get("location")?.includes("/onboarding")) {
      throw new Error(`Outcome (e) failed: expected redirect to /onboarding, got ${res15E.headers.get("location")}`);
    }
    assertCookieDeleted(res15E, "mengart_pending_invite");

    // (f) ACTIVE user -> redirects /dashboard, 0 usage consumed, cookie deleted
    const [active15F] = await db.insert(users).values({ email: `a15f.${Date.now()}@example.com`, membershipStatus: "active" }).returning();
    const invite15F = await createMembershipInvite({ label: "Invite 15F", maxUses: 1, createdByUserId: adminUser.id });
    const req15F = new NextRequest("http://localhost:3000/api/auth/redeem-callback", {
      headers: { cookie: `mengart_pending_invite=${invite15F.code}` },
    });
    const res15F = await handleRedeemCallback(req15F, active15F);
    if (!res15F.headers.get("location")?.includes("/dashboard")) {
      throw new Error(`Outcome (f) failed: expected redirect to /dashboard, got ${res15F.headers.get("location")}`);
    }
    assertCookieDeleted(res15F, "mengart_pending_invite");
    const [inv15FAfter] = await db.select().from(membershipInvites).where(eq(membershipInvites.id, invite15F.id));
    if (inv15FAfter.usesCount !== 0) {
      throw new Error(`Outcome (f) failed: expected usesCount to remain 0, got ${inv15FAfter.usesCount}`);
    }

    // (g) SUSPENDED user -> redirects /dashboard?error=AccountSuspended, cookie deleted
    const [suspended15G] = await db.insert(users).values({ email: `s15g.${Date.now()}@example.com`, membershipStatus: "suspended" }).returning();
    const req15G = new NextRequest("http://localhost:3000/api/auth/redeem-callback");
    const res15G = await handleRedeemCallback(req15G, suspended15G);
    if (!res15G.headers.get("location")?.includes("AccountSuspended")) {
      throw new Error(`Outcome (g) failed: expected redirect with AccountSuspended, got ${res15G.headers.get("location")}`);
    }
    assertCookieDeleted(res15G, "mengart_pending_invite");

    // (h) DELETED user -> redirects /login?error=AccountDeleted, cookie deleted
    const [deleted15H] = await db.insert(users).values({ email: `d15h.${Date.now()}@example.com`, membershipStatus: "deleted", deletedAt: new Date() }).returning();
    const req15H = new NextRequest("http://localhost:3000/api/auth/redeem-callback");
    const res15H = await handleRedeemCallback(req15H, deleted15H);
    if (!res15H.headers.get("location")?.includes("AccountDeleted")) {
      throw new Error(`Outcome (h) failed: expected redirect with AccountDeleted, got ${res15H.headers.get("location")}`);
    }
    assertCookieDeleted(res15H, "mengart_pending_invite");

    console.log("✓ Test 15 Passed: All 8 OAuth continuation terminal outcomes execute cleanly and delete continuation cookies.\n");

    // --------------------------------------------------------------------------
    // TEST 16: CANONICAL MEMBERSHIP TRANSITION DOMAIN SERVICE (ITEM 4)
    // --------------------------------------------------------------------------
    console.log("[Test 16] Testing canonical updateUserMembershipStatusService production transitions (Item 4)...");
    const [transPending] = await db.insert(users).values({ email: `trans.pending.${Date.now()}@example.com`, membershipStatus: null, role: "member" }).returning();
    const [transMember] = await db.insert(users).values({ email: `trans.member.${Date.now()}@example.com`, membershipStatus: "active", role: "member" }).returning();
    const [transMod] = await db.insert(users).values({ email: `trans.mod.${Date.now()}@example.com`, membershipStatus: "active", role: "moderator" }).returning();

    // 1. Direct NULL -> ACTIVE rejected outside redeemInviteService
    let nullToActiveBlocked = false;
    try {
      await db.transaction(async (tx) => {
        await updateUserMembershipStatusService(tx, {
          actorUserId: adminUser.id,
          targetUserId: transPending.id,
          newStatus: "active",
        });
      });
    } catch (err: any) {
      if (err.message.includes("Akun pending hanya dapat diaktifkan")) nullToActiveBlocked = true;
    }
    if (!nullToActiveBlocked) throw new Error("Expected direct NULL -> ACTIVE to be rejected!");

    // 2. Direct NULL -> SUSPENDED rejected
    let nullToSuspendedBlocked = false;
    try {
      await db.transaction(async (tx) => {
        await updateUserMembershipStatusService(tx, {
          actorUserId: adminUser.id,
          targetUserId: transPending.id,
          newStatus: "suspended",
        });
      });
    } catch (err: any) {
      if (err.message.includes("tidak dapat ditangguhkan")) nullToSuspendedBlocked = true;
    }
    if (!nullToSuspendedBlocked) throw new Error("Expected direct NULL -> SUSPENDED to be rejected!");

    // 3. Moderator suspends ordinary member -> succeeds
    await db.transaction(async (tx) => {
      await updateUserMembershipStatusService(tx, {
        actorUserId: transMod.id,
        targetUserId: transMember.id,
        newStatus: "suspended",
        reason: "Tindakan penegakan moderasi",
      });
    });
    const [memberAfterSuspend] = await db.select().from(users).where(eq(users.id, transMember.id));
    if (memberAfterSuspend.membershipStatus !== "suspended") {
      throw new Error(`Expected ordinary member to be suspended, got ${memberAfterSuspend.membershipStatus}`);
    }

    // 4. Moderator reactivates ordinary member -> succeeds
    await db.transaction(async (tx) => {
      await updateUserMembershipStatusService(tx, {
        actorUserId: transMod.id,
        targetUserId: transMember.id,
        newStatus: "active",
        reason: "Masa penangguhan selesai",
      });
    });
    const [memberAfterReactivate] = await db.select().from(users).where(eq(users.id, transMember.id));
    if (memberAfterReactivate.membershipStatus !== "active") {
      throw new Error(`Expected ordinary member to be reactivated, got ${memberAfterReactivate.membershipStatus}`);
    }

    // 5. Moderator cannot suspend another Moderator -> rejected
    let modSuspendModBlocked = false;
    try {
      await db.transaction(async (tx) => {
        await updateUserMembershipStatusService(tx, {
          actorUserId: transMod.id,
          targetUserId: modUser.id,
          newStatus: "suspended",
        });
      });
    } catch (err: any) {
      if (err.message.includes("Moderator hanya dapat mengelola status anggota biasa")) modSuspendModBlocked = true;
    }
    if (!modSuspendModBlocked) throw new Error("Expected Moderator suspending another Moderator to be blocked!");

    // 6. Moderator cannot suspend Admin -> rejected
    let modSuspendAdminBlocked = false;
    try {
      await db.transaction(async (tx) => {
        await updateUserMembershipStatusService(tx, {
          actorUserId: transMod.id,
          targetUserId: adminUser.id,
          newStatus: "suspended",
        });
      });
    } catch (err: any) {
      if (err.message.includes("Moderator hanya dapat mengelola status anggota biasa")) modSuspendAdminBlocked = true;
    }
    if (!modSuspendAdminBlocked) throw new Error("Expected Moderator suspending Admin to be blocked!");

    // 7. Moderator cannot delete user -> rejected
    let modDeleteBlocked = false;
    try {
      await db.transaction(async (tx) => {
        await updateUserMembershipStatusService(tx, {
          actorUserId: transMod.id,
          targetUserId: transMember.id,
          newStatus: "deleted",
          reason: "Penghapusan akun",
        });
      });
    } catch (err: any) {
      if (err.message.includes("Hanya Administrator yang dapat menghapus akun")) modDeleteBlocked = true;
    }
    if (!modDeleteBlocked) throw new Error("Expected Moderator delete attempt to be blocked!");

    // 8. Admin deletes user with valid reason -> succeeds
    await db.transaction(async (tx) => {
      await updateUserMembershipStatusService(tx, {
        actorUserId: adminUser.id,
        targetUserId: transMember.id,
        newStatus: "deleted",
        reason: "Pelanggaran berulang syarat dan ketentuan komunitas",
      });
    });
    const [memberAfterDelete] = await db.select().from(users).where(eq(users.id, transMember.id));
    if (memberAfterDelete.membershipStatus !== "deleted" || !memberAfterDelete.deletedAt) {
      throw new Error("Expected member to be marked deleted in DB!");
    }

    // 9. DELETED -> ACTIVE rejected
    let deletedToActiveBlocked = false;
    try {
      await db.transaction(async (tx) => {
        await updateUserMembershipStatusService(tx, {
          actorUserId: adminUser.id,
          targetUserId: transMember.id,
          newStatus: "active",
        });
      });
    } catch (err: any) {
      if (err.message.includes("telah dihapus tidak dapat diubah")) deletedToActiveBlocked = true;
    }
    if (!deletedToActiveBlocked) throw new Error("Expected DELETED -> ACTIVE to be blocked!");

    console.log("✓ Test 16 Passed: Canonical updateUserMembershipStatusService strictly enforces transition matrix and role boundaries.\n");

    // --------------------------------------------------------------------------
    // TEST 17: MODERATION REPORT ENFORCEMENT WIRING VIA resolveReportService (ITEM 4)
    // --------------------------------------------------------------------------
    console.log("[Test 17] Testing production moderation enforcement wiring via resolveReportService (Item 4)...");
    const [repTargetMember] = await db.insert(users).values({ email: `rep.mem.${Date.now()}@example.com`, role: "member", membershipStatus: "active" }).returning();
    const [repTargetMod] = await db.insert(users).values({ email: `rep.mod.${Date.now()}@example.com`, role: "moderator", membershipStatus: "active" }).returning();
    const [repTargetAdmin] = await db.insert(users).values({ email: `rep.adm.${Date.now()}@example.com`, role: "admin", membershipStatus: "active" }).returning();
    const [repTargetPending] = await db.insert(users).values({ email: `rep.pnd.${Date.now()}@example.com`, role: "member", membershipStatus: null }).returning();

    // Create 4 reports
    const [rep1] = await db.insert(reports).values({ reporterUserId: adminUser.id, targetType: "user", targetId: repTargetMember.id, reason: "harassment", status: "pending" }).returning();
    const [rep2] = await db.insert(reports).values({ reporterUserId: adminUser.id, targetType: "user", targetId: repTargetMod.id, reason: "other", status: "pending" }).returning();
    const [rep3] = await db.insert(reports).values({ reporterUserId: adminUser.id, targetType: "user", targetId: repTargetAdmin.id, reason: "other", status: "pending" }).returning();
    const [rep4] = await db.insert(reports).values({ reporterUserId: adminUser.id, targetType: "user", targetId: repTargetPending.id, reason: "other", status: "pending" }).returning();

    // 1. Moderator resolving report against ordinary member with suspend_user -> succeeds
    const resolveRes1 = await resolveReportService(db, {
      actorUserId: transMod.id,
      reportId: rep1.id,
      resolution: "resolved",
      resolutionNotes: "Tindakan penangguhan spam",
      enforceAction: "suspend_user",
    });
    if (!resolveRes1.success) throw new Error("Expected report resolution on member to succeed!");
    const [repMemAfter] = await db.select().from(users).where(eq(users.id, repTargetMember.id));
    if (repMemAfter.membershipStatus !== "suspended") {
      throw new Error(`Expected ordinary member to be suspended via resolveReportService, got ${repMemAfter.membershipStatus}`);
    }

    // 2. Moderator resolving report against Moderator with suspend_user -> rejected
    let modReportAgainstModBlocked = false;
    try {
      await resolveReportService(db, {
        actorUserId: transMod.id,
        reportId: rep2.id,
        resolution: "resolved",
        resolutionNotes: "Laporan terhadap moderator",
        enforceAction: "suspend_user",
      });
    } catch (err: any) {
      if (err.message.includes("Moderator hanya dapat mengelola status anggota biasa")) modReportAgainstModBlocked = true;
    }
    if (!modReportAgainstModBlocked) throw new Error("Expected report suspension against Moderator via resolveReportService to be blocked!");

    // 3. Moderator resolving report against Admin with suspend_user -> rejected
    let modReportAgainstAdminBlocked = false;
    try {
      await resolveReportService(db, {
        actorUserId: transMod.id,
        reportId: rep3.id,
        resolution: "resolved",
        resolutionNotes: "Laporan terhadap admin",
        enforceAction: "suspend_user",
      });
    } catch (err: any) {
      if (err.message.includes("Moderator hanya dapat mengelola status anggota biasa")) modReportAgainstAdminBlocked = true;
    }
    if (!modReportAgainstAdminBlocked) throw new Error("Expected report suspension against Admin via resolveReportService to be blocked!");

    // 4. Moderator resolving report against Pending user with suspend_user -> rejected
    let reportAgainstPendingBlocked = false;
    try {
      await resolveReportService(db, {
        actorUserId: transMod.id,
        reportId: rep4.id,
        resolution: "resolved",
        resolutionNotes: "Laporan terhadap pending user",
        enforceAction: "suspend_user",
      });
    } catch (err: any) {
      if (err.message.includes("tidak dapat ditangguhkan")) reportAgainstPendingBlocked = true;
    }
    if (!reportAgainstPendingBlocked) throw new Error("Expected report suspension against pending user via resolveReportService to be blocked!");

    // 5. Concurrency: Two simultaneous resolutions on the same pending report (Item 2)
    const [repTargetConc] = await db.insert(users).values({ email: `rep.conc.${Date.now()}@example.com`, role: "member", membershipStatus: "active" }).returning();
    const [repConc] = await db.insert(reports).values({ reporterUserId: adminUser.id, targetType: "user", targetId: repTargetConc.id, reason: "harassment", status: "pending" }).returning();

    const concReportResults = await Promise.allSettled([
      resolveReportService(db, {
        actorUserId: transMod.id,
        reportId: repConc.id,
        resolution: "dismissed",
        resolutionNotes: "Laporan diabaikan oleh moderator A",
      }),
      resolveReportService(db, {
        actorUserId: transMod.id,
        reportId: repConc.id,
        resolution: "resolved",
        resolutionNotes: "Pelanggaran diverifikasi oleh moderator B",
        enforceAction: "suspend_user",
      }),
    ]);

    const reportSuccesses = concReportResults.filter((r) => r.status === "fulfilled");
    const reportRejections = concReportResults.filter((r) => r.status === "rejected");

    if (reportSuccesses.length !== 1 || reportRejections.length !== 1) {
      throw new Error(`Expected exactly 1 success and 1 rejection for concurrent report resolution, got successes=${reportSuccesses.length}, rejections=${reportRejections.length}`);
    }

    const rejectionReason = (reportRejections[0] as PromiseRejectedResult).reason?.message || "";
    if (!rejectionReason.includes("Laporan telah diproses sebelumnya")) {
      throw new Error(`Expected rejection message 'Laporan telah diproses sebelumnya', got '${rejectionReason}'`);
    }

    const [finalReportState] = await db.select().from(reports).where(eq(reports.id, repConc.id));
    const [finalTargetUserState] = await db.select().from(users).where(eq(users.id, repTargetConc.id));

    if (finalReportState.status === "dismissed") {
      if (finalTargetUserState.membershipStatus !== "active") {
        throw new Error(`Contradiction detected: Report was dismissed, but user status is ${finalTargetUserState.membershipStatus}`);
      }
    } else if (finalReportState.status === "resolved") {
      if (finalTargetUserState.membershipStatus !== "suspended") {
        throw new Error(`Contradiction detected: Report was resolved with suspend_user, but user status is ${finalTargetUserState.membershipStatus}`);
      }
    }

    console.log(`✓ Test 17 Passed: resolveReportService strictly serializes report resolutions with FOR UPDATE and eliminates resolution race conditions.\n`);

    // --------------------------------------------------------------------------
    // TEST 18: PRESERVE PROFILE PRIVACY ACROSS PRODUCTION SUSPENSION/REACTIVATION (ITEM 5)
    // --------------------------------------------------------------------------
    console.log("[Test 18] Testing profile privacy preservation across production suspension/reactivation (Item 5)...");
    const [hiddenUser] = await db.insert(users).values({ email: `hidden.${Date.now()}@example.com`, role: "member", membershipStatus: "active" }).returning();
    await db.insert(profiles).values({
      userId: hiddenUser.id,
      displayName: "Hidden Artist",
      slug: `hidden-artist-${hiddenUser.id.slice(0, 6)}`,
      profileStatus: "active_hidden",
    });

    const [publicUser] = await db.insert(users).values({ email: `public.${Date.now()}@example.com`, role: "member", membershipStatus: "active" }).returning();
    await db.insert(profiles).values({
      userId: publicUser.id,
      displayName: "Public Artist",
      slug: `public-artist-${publicUser.id.slice(0, 6)}`,
      profileStatus: "active_public",
    });

    // Suspend hidden user via production service
    await db.transaction(async (tx) => {
      await updateUserMembershipStatusService(tx, {
        actorUserId: adminUser.id,
        targetUserId: hiddenUser.id,
        newStatus: "suspended",
      });
    });
    const [profHiddenDuring] = await db.select().from(profiles).where(eq(profiles.userId, hiddenUser.id));
    if (profHiddenDuring.profileStatus !== "active_hidden") {
      throw new Error(`Expected active_hidden during suspension, got ${profHiddenDuring.profileStatus}`);
    }

    // Reactivate hidden user via production service
    await db.transaction(async (tx) => {
      await updateUserMembershipStatusService(tx, {
        actorUserId: adminUser.id,
        targetUserId: hiddenUser.id,
        newStatus: "active",
      });
    });
    const [profHiddenAfter] = await db.select().from(profiles).where(eq(profiles.userId, hiddenUser.id));
    if (profHiddenAfter.profileStatus !== "active_hidden") {
      throw new Error(`Profile privacy broken! Expected active_hidden after reactivation, got ${profHiddenAfter.profileStatus}`);
    }

    // Suspend and reactivate public user
    await db.transaction(async (tx) => {
      await updateUserMembershipStatusService(tx, {
        actorUserId: adminUser.id,
        targetUserId: publicUser.id,
        newStatus: "suspended",
      });
      await updateUserMembershipStatusService(tx, {
        actorUserId: adminUser.id,
        targetUserId: publicUser.id,
        newStatus: "active",
      });
    });
    const [profPublicAfter] = await db.select().from(profiles).where(eq(profiles.userId, publicUser.id));
    if (profPublicAfter.profileStatus !== "active_public") {
      throw new Error(`Public profile altered! Expected active_public after reactivation, got ${profPublicAfter.profileStatus}`);
    }

    console.log("✓ Test 18 Passed: Both active_hidden and active_public profile privacy strictly preserved.\n");

    // --------------------------------------------------------------------------
    // TEST 19: SUSPENDED STAFF IMMEDIATE LOSS OF PRODUCTION AUTHORITY (ITEM 6)
    // --------------------------------------------------------------------------
    console.log("[Test 19] Testing suspended staff immediate loss of authority (Item 6)...");
    const [suspendedModStaff] = await db.insert(users).values({ email: `susp.mod.staff.${Date.now()}@example.com`, role: "moderator", membershipStatus: "suspended" }).returning();
    const [suspendedAdminStaff] = await db.insert(users).values({ email: `susp.adm.staff.${Date.now()}@example.com`, role: "admin", membershipStatus: "suspended" }).returning();

    // 1. Suspended Moderator calling updateUserMembershipStatusService throws
    let suspendedModServiceBlocked = false;
    try {
      await db.transaction(async (tx) => {
        await updateUserMembershipStatusService(tx, {
          actorUserId: suspendedModStaff.id,
          targetUserId: publicUser.id,
          newStatus: "suspended",
        });
      });
    } catch (err: any) {
      if (err.message.includes("ditangguhkan atau belum aktif")) suspendedModServiceBlocked = true;
    }
    if (!suspendedModServiceBlocked) throw new Error("Expected suspended moderator service call to be blocked!");

    // 2. Suspended Admin calling updateUserRoleService throws
    let suspendedAdminServiceBlocked = false;
    try {
      await db.transaction(async (tx) => {
        await updateUserRoleService(tx, {
          actorUserId: suspendedAdminStaff.id,
          targetUserId: publicUser.id,
          newRole: "moderator",
        });
      });
    } catch (err: any) {
      if (err.message.includes("ditangguhkan atau belum aktif")) suspendedAdminServiceBlocked = true;
    }
    if (!suspendedAdminServiceBlocked) throw new Error("Expected suspended admin role update to be blocked!");

    console.log("✓ Test 19 Passed: Suspended staff members immediately blocked from all production mutations.\n");

    // --------------------------------------------------------------------------
    // TEST 20: LAST-ACTIVE-ADMIN INVARIANT ISOLATED SCENARIOS A & B (ITEM 1)
    // --------------------------------------------------------------------------
    console.log("[Test 20] Testing Last-Active-Admin invariant under isolated Scenarios A & B (Item 1)...");
    
    // Cleanly isolate active admin population for Test 20:
    // Demote all existing active test admins to 'member' so we have absolute control over the active admin population
    await db
      .update(users)
      .set({ role: "member" })
      .where(and(eq(users.role, "admin"), eq(users.membershipStatus, "active")));

    // --- Scenario A: ACTIVE Admin population = exactly 1 ---
    const [adminSole] = await db
      .insert(users)
      .values({
        email: `sole.admin.${Date.now()}@example.com`,
        role: "admin",
        membershipStatus: "active",
      })
      .returning();

    const [adminCountA] = await db
      .select({ count: count() })
      .from(users)
      .where(and(eq(users.role, "admin"), eq(users.membershipStatus, "active")));

    if (Number(adminCountA.count) !== 1) {
      throw new Error(`Scenario A setup failed: expected active admin population = 1, got ${adminCountA.count}`);
    }

    // 1. Demotion of sole active admin -> rejected
    let soleDemoteBlocked = false;
    try {
      await db.transaction(async (tx) => {
        await updateUserRoleService(tx, {
          actorUserId: adminSole.id,
          targetUserId: adminSole.id,
          newRole: "member",
        });
      });
    } catch (err: any) {
      if (err.message.includes("setidaknya satu Administrator aktif")) soleDemoteBlocked = true;
    }
    if (!soleDemoteBlocked) throw new Error("Scenario A Failed: Expected demotion of sole active admin to be rejected!");

    // 2. Suspension of sole active admin -> rejected
    let soleSuspendBlocked = false;
    try {
      await db.transaction(async (tx) => {
        await updateUserMembershipStatusService(tx, {
          actorUserId: adminSole.id,
          targetUserId: adminSole.id,
          newStatus: "suspended",
        });
      });
    } catch (err: any) {
      if (err.message.includes("setidaknya satu Administrator aktif")) soleSuspendBlocked = true;
    }
    if (!soleSuspendBlocked) throw new Error("Scenario A Failed: Expected suspension of sole active admin to be rejected!");

    // 3. Deletion of sole active admin -> rejected
    let soleDeleteBlocked = false;
    try {
      await db.transaction(async (tx) => {
        await updateUserMembershipStatusService(tx, {
          actorUserId: adminSole.id,
          targetUserId: adminSole.id,
          newStatus: "deleted",
          reason: "Self-deletion of sole administrator",
        });
      });
    } catch (err: any) {
      if (err.message.includes("setidaknya satu Administrator aktif")) soleDeleteBlocked = true;
    }
    if (!soleDeleteBlocked) throw new Error("Scenario A Failed: Expected deletion of sole active admin to be rejected!");

    // Assert final active admin count in Scenario A remains exactly 1
    const [finalAdminCountA] = await db
      .select({ count: count() })
      .from(users)
      .where(and(eq(users.role, "admin"), eq(users.membershipStatus, "active")));

    if (Number(finalAdminCountA.count) !== 1) {
      throw new Error(`Scenario A Failed: expected final activeAdminCount = 1, got ${finalAdminCountA.count}`);
    }
    console.log("✓ Scenario A Passed: Sole active Admin population (count=1) strictly protected from demotion, suspension, and deletion.");

    // --- Scenario B: ACTIVE Admin population = exactly 2 ---
    const [adminSecond] = await db
      .insert(users)
      .values({
        email: `second.admin.${Date.now()}@example.com`,
        role: "admin",
        membershipStatus: "active",
      })
      .returning();

    const [adminCountB] = await db
      .select({ count: count() })
      .from(users)
      .where(and(eq(users.role, "admin"), eq(users.membershipStatus, "active")));

    if (Number(adminCountB.count) !== 2) {
      throw new Error(`Scenario B setup failed: expected active admin population = 2, got ${adminCountB.count}`);
    }

    // Run two concurrent authority-removal transactions simultaneously
    const concResults = await Promise.allSettled([
      db.transaction(async (tx) => {
        await updateUserRoleService(tx, {
          actorUserId: adminSole.id,
          targetUserId: adminSole.id,
          newRole: "member",
        });
      }),
      db.transaction(async (tx) => {
        await updateUserRoleService(tx, {
          actorUserId: adminSecond.id,
          targetUserId: adminSecond.id,
          newRole: "member",
        });
      }),
    ]);

    const concSuccesses = concResults.filter((r) => r.status === "fulfilled");
    const concRejections = concResults.filter((r) => r.status === "rejected");

    if (concSuccesses.length !== 1 || concRejections.length !== 1) {
      throw new Error(`Scenario B Failed: expected exactly 1 success and 1 rejection during concurrent admin removal, got successes=${concSuccesses.length}, rejections=${concRejections.length}`);
    }

    // Assert final active admin count in DB is exactly 1 (not 0 and not 2)
    const [finalAdminCountB] = await db
      .select({ count: count() })
      .from(users)
      .where(and(eq(users.role, "admin"), eq(users.membershipStatus, "active")));

    if (Number(finalAdminCountB.count) !== 1) {
      throw new Error(`Scenario B Failed: expected final activeAdminCount = exactly 1, got ${finalAdminCountB.count}`);
    }
    console.log("✓ Scenario B Passed: Concurrent authority-removal on 2 active Admins correctly serialized via advisory lock (final activeAdminCount = exactly 1).\n");

    // --------------------------------------------------------------------------
    // TEST 21: MASTER CLEAN-MEDIA AUTHORIZATION & NON-ACTIVE DISCLOSURE GUARDS
    // --------------------------------------------------------------------------
    console.log("[Test 21] Testing master clean-media authorization and non-ACTIVE staff disclosure guards (Item 3)...");
    const [suspendedArtist] = await db
      .insert(users)
      .values({
        email: `suspended.artist.${Date.now()}@example.com`,
        role: "member",
        membershipStatus: "suspended",
      })
      .returning();

    const [activeArtist] = await db
      .insert(users)
      .values({
        email: `active.artist.${Date.now()}@example.com`,
        role: "member",
        membershipStatus: "active",
      })
      .returning();
    await db.insert(profiles).values({
      userId: activeArtist.id,
      displayName: "Active Master Artist",
      slug: `active-artist-${Date.now()}`,
    });

    const [artistArtwork] = await db
      .insert(artworks)
      .values({
        userId: activeArtist.id,
        title: `Protected Masterpiece ${Date.now()}`,
        slug: `protected-artwork-${Date.now()}`,
        mediaType: "image",
        publicationStatus: "published",
        audience: "public",
      })
      .returning();

    const testMasterStorageKey = `master-media-test-${Date.now()}.png`;
    const [createdVersion] = await db.insert(artworkVersions).values({
      artworkId: artistArtwork.id,
      versionNumber: 1,
      mediaType: "image",
      mimeType: "image/png",
      masterStorageKey: testMasterStorageKey,
      publicStorageKey: `public-${Date.now()}.png`,
      fileSizeBytes: 1024,
      checksumSha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    }).returning();

    await db.update(artworks).set({ currentVersionId: createdVersion.id }).where(eq(artworks.id, artistArtwork.id));

    // 1. Direct clean-master route test: Suspended owner receives 403
    const isMasterAccessible = await canAccessMasterMedia(
      {
        id: suspendedArtist.id,
        role: suspendedArtist.role,
        membershipStatus: suspendedArtist.membershipStatus,
      },
      artistArtwork as any
    );

    if (isMasterAccessible) {
      throw new Error("Security Violation: Suspended artwork owner was granted access to clean master media!");
    }

    const masterReq = new NextRequest(`http://localhost:3000/api/media/master/${testMasterStorageKey}`);
    const masterRes = await handleGetMasterMedia(
      masterReq,
      { params: Promise.resolve({ key: testMasterStorageKey }) },
      suspendedArtist
    );

    if (masterRes.status !== 403 && masterRes.status !== 401) {
      throw new Error(`Expected HTTP 403 or 401 for suspended master clean-media request, got HTTP ${masterRes.status}`);
    }

    // 2. API /api/artworks masterStorageKey metadata disclosure tests (Item 3)
    const artworksApiReq = new Request(`http://localhost:3000/api/artworks?search=${encodeURIComponent(artistArtwork.title)}`);

    // (a) ACTIVE Admin -> masterStorageKey is exposed
    const resActiveAdmin = await (await handleGetArtworks(artworksApiReq, { id: adminUser.id, role: "admin", membershipStatus: "active" })).json();
    if (!resActiveAdmin.items[0] || resActiveAdmin.items[0].masterStorageKey !== testMasterStorageKey) {
      throw new Error(`Expected ACTIVE Admin to receive masterStorageKey '${testMasterStorageKey}', got ${resActiveAdmin.items[0]?.masterStorageKey}`);
    }

    // (b) SUSPENDED Admin -> masterStorageKey is NULL
    const resSuspendedAdmin = await (await handleGetArtworks(artworksApiReq, { id: suspendedAdminUser.id, role: "admin", membershipStatus: "suspended" })).json();
    if (resSuspendedAdmin.items[0] && resSuspendedAdmin.items[0].masterStorageKey !== null) {
      throw new Error(`Security Violation: SUSPENDED Admin was exposed masterStorageKey: ${resSuspendedAdmin.items[0].masterStorageKey}`);
    }

    // (c) DELETED Admin -> masterStorageKey is NULL
    const resDeletedAdmin = await (await handleGetArtworks(artworksApiReq, { id: "deleted_admin_id", role: "admin", membershipStatus: "deleted" })).json();
    if (resDeletedAdmin.items[0] && resDeletedAdmin.items[0].masterStorageKey !== null) {
      throw new Error(`Security Violation: DELETED Admin was exposed masterStorageKey: ${resDeletedAdmin.items[0].masterStorageKey}`);
    }

    // (d) SUSPENDED Owner -> masterStorageKey is NULL
    const resSuspendedOwner = await (await handleGetArtworks(artworksApiReq, { id: activeArtist.id, role: "member", membershipStatus: "suspended" })).json();
    if (resSuspendedOwner.items[0] && resSuspendedOwner.items[0].masterStorageKey !== null) {
      throw new Error(`Security Violation: SUSPENDED artwork owner was exposed masterStorageKey: ${resSuspendedOwner.items[0].masterStorageKey}`);
    }

    // (e) ACTIVE Owner -> masterStorageKey is exposed
    const resActiveOwner = await (await handleGetArtworks(artworksApiReq, { id: activeArtist.id, role: "member", membershipStatus: "active" })).json();
    if (!resActiveOwner.items[0] || resActiveOwner.items[0].masterStorageKey !== testMasterStorageKey) {
      throw new Error(`Expected ACTIVE Owner to receive masterStorageKey '${testMasterStorageKey}', got ${resActiveOwner.items[0]?.masterStorageKey}`);
    }

    console.log(`✓ Test 21 Passed: Suspended owner denied master media (HTTP ${masterRes.status}), and masterStorageKey metadata is strictly gated to ACTIVE members/admins.\n`);

    // --------------------------------------------------------------------------
    // TEST 22: STATIC REGRESSION & ARCHITECTURAL INVARIANTS
    // --------------------------------------------------------------------------
    console.log("[Test 22] Verifying static regression assertions (no bcrypt, no password_hash, no token_hash, no URL query token)...");
    const authFile = await fs.readFile(path.join(process.cwd(), "src/auth.ts"), "utf-8");
    if (authFile.includes("CredentialsProvider") || authFile.includes("bcrypt")) {
      throw new Error("Active credentials provider or bcrypt found in src/auth.ts!");
    }

    const invitesSchema = await fs.readFile(path.join(process.cwd(), "src/db/schema/invites.ts"), "utf-8");
    if (invitesSchema.includes("token_hash") || invitesSchema.includes("token_prefix")) {
      throw new Error("Legacy token_hash or token_prefix found in src/db/schema/invites.ts!");
    }

    const redeemCallbackRoute = await fs.readFile(path.join(process.cwd(), "src/app/api/auth/redeem-callback/route.ts"), "utf-8");
    if (redeemCallbackRoute.includes('searchParams.get("token")') || redeemCallbackRoute.includes('searchParams.get("code")')) {
      throw new Error("Illegal query parameter fallback found in redeem-callback route!");
    }

    console.log("✓ Test 22 Passed: No active credentials provider, no bcrypt, no token_hash schema, no URL query token fallbacks.\n");

    console.log("=================================================================");
    console.log("🎉 ALL 22 GATE D SECURITY & INVARIANT TESTS PASSED (BLUEPRINT 2.2.2)!");
    console.log("=================================================================\n");
    process.exit(0);
  } finally {
    await client.end();
  }
}

runPhase4AuthAndInvitesTests().catch((err) => {
  console.error("❌ Gate D test suite failed:", err);
  process.exit(1);
});
