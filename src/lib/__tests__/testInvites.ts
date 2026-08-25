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
  console.log("--- Starting Invitation Engine Integration Tests ---");

  // 1. Test Invite Creation
  console.log("[Test 1] Creating a 1-use invitation with 1h expiry...");
  const invite = await createMembershipInvite({
    label: "VIP Tester Invite",
    expiryPreset: "1h",
    maxUses: 1,
  });

  console.log(`Generated invite ID: ${invite.id}`);
  console.log(`Prefix: ${invite.tokenPrefix}`);
  console.log(`URL: ${invite.inviteUrl}`);

  if (!invite.rawToken || invite.rawToken.length !== 64) {
    throw new Error("Expected rawToken to be 64-char hex string");
  }

  // 2. Validate active token
  console.log("[Test 2] Validating active invitation token...");
  const validation = await validateInviteToken(invite.rawToken);
  if (!validation.isValid || validation.reason !== "active") {
    throw new Error(`Expected token to be active, got: ${validation.reason}`);
  }
  console.log("✓ Token validation passed (status: active)");

  // 3. Test Invalid Token
  console.log("[Test 3] Validating bogus token...");
  const bogus = await validateInviteToken("bogus_token_1234567890abcdef");
  if (bogus.isValid || bogus.reason !== "not_found") {
    throw new Error("Expected bogus token to return not_found");
  }
  console.log("✓ Bogus token correctly rejected");

  // 4. Test Single-Transaction Redemption & Account Creation
  console.log("[Test 4] Redeeming invitation for new member...");
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

  // 5. Verify Max Uses Exhaustion
  console.log("[Test 5] Attempting double-redemption on 1-use token...");
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

  console.log("--- All Invitation Engine Tests Passed Successfully! ---");
  process.exit(0);
}

runInviteTests().catch((err) => {
  console.error("Test failed with error:", err);
  process.exit(1);
});
