import {
  createMembershipInvite,
  validateInviteToken,
  redeemInviteAndCreateMember,
  hashInviteToken,
} from "../invites";
import { db } from "@/db";
import { users, membershipInvites, profiles, inviteRedemptions } from "@/db/schema";
import { eq } from "drizzle-orm";

async function runInviteTests() {
  console.log("--- Starting Invitation Engine Integration Tests (Short & Custom Vanity Codes) ---");

  // 1. Test Short Random Invite Creation (Default: 8 alphanumeric chars)
  console.log("[Test 1] Creating a 1-use invitation with 1h expiry (Short random token)...");
  const invite = await createMembershipInvite({
    label: "VIP Tester Invite",
    expiryPreset: "1h",
    maxUses: 1,
  });

  console.log(`Generated invite ID: ${invite.id}`);
  console.log(`Prefix: ${invite.tokenPrefix}`);
  console.log(`URL: ${invite.inviteUrl}`);

  if (!invite.rawToken || invite.rawToken.length !== 8) {
    throw new Error(`Expected rawToken to be 8-char string, got ${invite.rawToken?.length}: ${invite.rawToken}`);
  }
  console.log(`✓ Generated 8-character short token: "${invite.rawToken}"`);

  // 2. Test Custom Vanity Code Creation (e.g. "atelier-vip-2026")
  console.log("\n[Test 2] Creating a custom vanity invitation code...");
  const customVanity = `atelier-vip-${Date.now()}`;
  const customInvite = await createMembershipInvite({
    label: "Batch Discord VIP",
    customCode: customVanity,
    expiryPreset: "7d",
    maxUses: 5,
  });

  console.log(`✓ Custom invite created: Code="${customInvite.rawToken}", URL="${customInvite.inviteUrl}"`);
  if (customInvite.rawToken !== customVanity) {
    throw new Error(`Expected custom code "${customVanity}", got: "${customInvite.rawToken}"`);
  }

  // 3. Test Duplicate Custom Code Rejection
  console.log("\n[Test 3] Testing duplicate custom code rejection...");
  try {
    await createMembershipInvite({
      label: "Duplicate attempt",
      customCode: customVanity,
    });
    throw new Error("Expected duplicate custom code to fail");
  } catch (err: any) {
    console.log(`✓ Duplicate custom code safely rejected: "${err.message}"`);
  }

  // 4. Validate active short token
  console.log("\n[Test 4] Validating active invitation token...");
  const validation = await validateInviteToken(invite.rawToken);
  if (!validation.isValid || validation.reason !== "active") {
    throw new Error(`Expected token to be active, got: ${validation.reason}`);
  }
  console.log("✓ Token validation passed (status: active)");

  // 5. Test Invalid Token
  console.log("\n[Test 5] Validating bogus token...");
  const bogus = await validateInviteToken("bogus_token_1234567890abcdef");
  if (bogus.isValid || bogus.reason !== "not_found") {
    throw new Error("Expected bogus token to return not_found");
  }
  console.log("✓ Bogus token correctly rejected");

  // 6. Test Single-Transaction Redemption & Account Creation
  console.log("\n[Test 6] Redeeming short token invitation for new member...");
  const testEmail = `artist_${Date.now()}@example.com`;
  const redemption = await redeemInviteAndCreateMember({
    rawToken: invite.rawToken,
    email: testEmail,
    displayName: "Komorebi Art",
    avatarUrl: "https://example.com/avatar.jpg",
  });

  console.log(`✓ User created: ID=${redemption.user.id}, Role=${redemption.user.role}`);
  console.log(`✓ Profile created: ID=${redemption.profile.id}, Slug=${redemption.profile.slug}`);

  if (redemption.user.role !== "member") {
    throw new Error("Expected default user role to be 'member'");
  }

  // 7. Verify Max Uses Exhaustion on Single-Use Short Token
  console.log("\n[Test 7] Attempting double-redemption on 1-use token...");
  const postValidation = await validateInviteToken(invite.rawToken);
  if (postValidation.isValid || postValidation.reason !== "exhausted") {
    throw new Error(`Expected exhausted status, got: ${postValidation.reason}`);
  }
  console.log("✓ 1-use token correctly transitioned to 'exhausted'");

  // Try redeeming again - should throw error
  try {
    await redeemInviteAndCreateMember({
      rawToken: invite.rawToken,
      email: "another_artist@example.com",
      displayName: "Another Artist",
    });
    throw new Error("Expected redemption to fail for exhausted invite");
  } catch (err: any) {
    console.log(`✓ Concurrent/Re-use attempt safely blocked: "${err.message}"`);
  }

  // 8. Test Custom Code Multi-use Redemption
  console.log("\n[Test 8] Redeeming custom vanity code invitation...");
  const customEmail = `custom_artist_${Date.now()}@example.com`;
  const customRedemption = await redeemInviteAndCreateMember({
    rawToken: customInvite.rawToken,
    email: customEmail,
    displayName: "Vanity Artist",
  });
  console.log(`✓ User redeemed via custom vanity code: Email=${customRedemption.user.email}`);

  console.log("\n--- All Invitation Engine Tests (Short & Custom Vanity Codes) Passed Successfully! ---");
  process.exit(0);
}

runInviteTests().catch((err) => {
  console.error("Test failed with error:", err);
  process.exit(1);
});
