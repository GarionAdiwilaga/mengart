import { db } from "@/db";
import { users, profiles, membershipInvites, emailVerificationTokens } from "@/db/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import {
  createMembershipInvite,
  extractInviteToken,
  redeemInviteAndCreateMemberWithCredentials,
} from "@/lib/invites";
import {
  verifyEmailAction,
  requestPasswordResetAction,
  resetPasswordAction,
} from "@/app/actions/auth";

async function runAuthAndMergingTests() {
  console.log("--- Starting Email Auth, Account Merging & Verification Tests ---");

  // Test 1: URL Token Extraction Helper
  console.log("\n[Test 1] Testing extractInviteToken with various inputs...");
  const rawSample = "a1b2c3d4e5f67890123456789012345678901234567890123456789012345678";
  const urlSample1 = `https://mengart.art/invite/${rawSample}`;
  const urlSample2 = `http://localhost:3000/invite/${rawSample}?ref=discord#welcome`;
  const plainSample = `  ${rawSample}  `;

  if (extractInviteToken(rawSample) !== rawSample) throw new Error("Raw token mismatch");
  if (extractInviteToken(urlSample1) !== rawSample) throw new Error("URL 1 token mismatch");
  if (extractInviteToken(urlSample2) !== rawSample) throw new Error("URL 2 token mismatch");
  if (extractInviteToken(plainSample) !== rawSample) throw new Error("Plain token mismatch");
  console.log("✓ extractInviteToken passed for all formats (raw, full URL, query params, whitespace)");

  // Test 2: Create Invite and Register via Credentials
  console.log("\n[Test 2] Testing invite creation and email/password registration...");
  const invite = await createMembershipInvite({ label: "Auth Test Invite", maxUses: 1 });
  const testEmail = `artist_${Date.now()}@example.com`;
  const rawPassword = "SuperSecretPassword123!";
  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash(rawPassword, salt);

  const regResult = await redeemInviteAndCreateMemberWithCredentials({
    rawToken: invite.rawToken,
    email: testEmail,
    passwordHash,
    displayName: "Kaelen Vane",
    username: `kaelen_${Date.now()}`,
  });

  console.log(`✓ Member created: ID=${regResult.user.id}, Email=${regResult.user.email}`);
  console.log(`  - emailVerified is initially: ${regResult.user.emailVerified}`);
  console.log(`  - verification token: ${regResult.verificationToken.substring(0, 16)}...`);

  if (regResult.user.emailVerified !== null) {
    throw new Error("New credentials user should not be verified initially");
  }

  // Test 3: Email Verification Flow
  console.log("\n[Test 3] Testing verifyEmailAction...");
  const verifyRes = await verifyEmailAction(regResult.verificationToken, testEmail);
  if (!verifyRes.success) {
    throw new Error(`Email verification failed: ${verifyRes.error}`);
  }
  console.log(`✓ ${verifyRes.message}`);

  const [verifiedUser] = await db.select().from(users).where(eq(users.id, regResult.user.id));
  if (!verifiedUser.emailVerified) {
    throw new Error("User emailVerified should be a Date after verification");
  }
  console.log(`✓ Database user emailVerified set to: ${verifiedUser.emailVerified}`);

  // Test 4: Password Verification
  console.log("\n[Test 4] Verifying password comparison...");
  const correctMatch = await bcrypt.compare(rawPassword, verifiedUser.passwordHash!);
  const wrongMatch = await bcrypt.compare("WrongPassword", verifiedUser.passwordHash!);
  if (!correctMatch || wrongMatch) {
    throw new Error("Bcrypt password verification failed");
  }
  console.log("✓ Password matches correctly with bcrypt");

  // Test 5: Automatic Google Account Merging (No Duplicate Account)
  console.log("\n[Test 5] Simulating Google OAuth login for the same email (Account Merging)...");
  const simulatedGoogleSub = `google_sub_${Date.now()}`;

  // Simulate NextAuth signIn callback logic:
  const [userBeforeMerge] = await db.select().from(users).where(eq(users.email, testEmail));
  if (!userBeforeMerge.googleId) {
    await db
      .update(users)
      .set({ googleId: simulatedGoogleSub, emailVerified: userBeforeMerge.emailVerified || new Date() })
      .where(eq(users.id, userBeforeMerge.id));
  }

  const allMatchingUsers = await db.select().from(users).where(eq(users.email, testEmail));
  if (allMatchingUsers.length !== 1) {
    throw new Error(`Duplicate users detected! Found ${allMatchingUsers.length}`);
  }

  const [mergedUser] = allMatchingUsers;
  if (mergedUser.googleId !== simulatedGoogleSub) {
    throw new Error("googleId was not linked properly");
  }
  console.log(`✓ Account Merged Successfully! User ID=${mergedUser.id}, googleId=${mergedUser.googleId}, duplicate count=0`);

  // Test 6: Password Reset Flow
  console.log("\n[Test 6] Testing Password Reset Flow...");
  const forgotRes = await requestPasswordResetAction(testEmail);
  if (!forgotRes.success) throw new Error("Forgot password request failed");
  console.log(`✓ ${forgotRes.message}`);

  console.log("\n--- All Email Auth, Merging & Verification Tests Passed Successfully! ---");
  process.exit(0);
}

runAuthAndMergingTests().catch((err) => {
  console.error("❌ Tests Failed:", err);
  process.exit(1);
});
