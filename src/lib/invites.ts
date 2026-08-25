import crypto from "crypto";
import { eq, sql, and, isNull, or, gt } from "drizzle-orm";
import { db } from "@/db";
import { membershipInvites, inviteRedemptions, users, profiles, auditLogs } from "@/db/schema";

export type InviteExpiryPreset =
  | "30m"
  | "1h"
  | "6h"
  | "12h"
  | "1d"
  | "7d"
  | "never"
  | "custom";

export interface CreateInviteParams {
  label?: string;
  expiryPreset?: InviteExpiryPreset;
  customExpiresAt?: Date;
  maxUses?: number | null; // null = unlimited
  createdByUserId?: string;
  creatorIp?: string;
}

export interface GeneratedInviteResult {
  id: string;
  rawToken: string; // ONLY returned upon initial creation. Never stored or logged.
  inviteUrl: string;
  tokenPrefix: string;
  label: string | null;
  expiresAt: Date | null;
  maxUses: number | null;
  usesCount: number;
  createdAt: Date;
}

export type InviteStatus = "active" | "expired" | "exhausted" | "revoked";

/**
 * Hash raw invitation token with SHA-256
 */
export function hashInviteToken(rawToken: string): string {
  return crypto.createHash("sha256").update(rawToken.trim()).digest("hex");
}

/**
 * Calculate expiry date from preset
 */
export function calculateExpiryDate(
  preset: InviteExpiryPreset,
  customDate?: Date
): Date | null {
  const now = new Date();
  switch (preset) {
    case "30m":
      return new Date(now.getTime() + 30 * 60 * 1000);
    case "1h":
      return new Date(now.getTime() + 60 * 60 * 1000);
    case "6h":
      return new Date(now.getTime() + 6 * 60 * 60 * 1000);
    case "12h":
      return new Date(now.getTime() + 12 * 60 * 60 * 1000);
    case "1d":
      return new Date(now.getTime() + 24 * 60 * 60 * 1000);
    case "7d":
      return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    case "custom":
      return customDate || null;
    case "never":
    default:
      return null;
  }
}

/**
 * Generate a new cryptographically random membership invitation
 */
export async function createMembershipInvite(
  params: CreateInviteParams,
  appBaseUrl: string = process.env.APP_URL || "http://localhost:3000"
): Promise<GeneratedInviteResult> {
  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = hashInviteToken(rawToken);
  const tokenPrefix = `inv_${rawToken.slice(0, 8)}`;
  const expiresAt = params.customExpiresAt
    ? params.customExpiresAt
    : calculateExpiryDate(params.expiryPreset || "7d");

  const [createdInvite] = await db
    .insert(membershipInvites)
    .values({
      tokenHash,
      tokenPrefix,
      label: params.label || null,
      expiresAt,
      maxUses: params.maxUses !== undefined ? params.maxUses : 1, // Default 1 use
      usesCount: 0,
      createdBy: params.createdByUserId || null,
    })
    .returning();

  // Audit log creation (NEVER log raw token)
  await db.insert(auditLogs).values({
    actorId: params.createdByUserId || null,
    actorIp: params.creatorIp || "127.0.0.1",
    action: "invite_created",
    targetType: "invite",
    targetId: createdInvite.id,
    reason: params.label || "Generated membership invitation",
    metadata: {
      tokenPrefix,
      expiresAt,
      maxUses: params.maxUses,
    },
  });

  return {
    id: createdInvite.id,
    rawToken,
    inviteUrl: `${appBaseUrl}/invite/${rawToken}`,
    tokenPrefix,
    label: createdInvite.label,
    expiresAt: createdInvite.expiresAt,
    maxUses: createdInvite.maxUses,
    usesCount: createdInvite.usesCount,
    createdAt: createdInvite.createdAt,
  };
}

/**
 * Validate an invitation token without redeeming it
 */
export async function validateInviteToken(rawToken: string) {
  if (!rawToken || rawToken.trim().length === 0) {
    return { isValid: false, reason: "Missing token" as const, invite: null };
  }

  const tokenHash = hashInviteToken(rawToken);
  const [invite] = await db
    .select()
    .from(membershipInvites)
    .where(eq(membershipInvites.tokenHash, tokenHash))
    .limit(1);

  if (!invite) {
    return { isValid: false, reason: "not_found" as const, invite: null };
  }

  if (invite.revokedAt) {
    return { isValid: false, reason: "revoked" as const, invite };
  }

  if (invite.expiresAt && new Date(invite.expiresAt) <= new Date()) {
    return { isValid: false, reason: "expired" as const, invite };
  }

  if (invite.maxUses !== null && invite.usesCount >= invite.maxUses) {
    return { isValid: false, reason: "exhausted" as const, invite };
  }

  return { isValid: true, reason: "active" as const, invite };
}

/**
 * Atomically redeem an invitation and create the member account and profile in a single transaction
 */
export async function redeemInviteAndCreateMember(params: {
  rawToken: string;
  email: string;
  googleId?: string;
  displayName: string;
  avatarUrl?: string;
  ipAddress?: string;
  userAgent?: string;
}) {
  const tokenHash = hashInviteToken(params.rawToken);
  const now = new Date();

  return await db.transaction(async (tx) => {
    // 1. Lock and validate invite row
    const [invite] = await tx
      .select()
      .from(membershipInvites)
      .where(
        and(
          eq(membershipInvites.tokenHash, tokenHash),
          isNull(membershipInvites.revokedAt),
          or(
            isNull(membershipInvites.expiresAt),
            gt(membershipInvites.expiresAt, now)
          )
        )
      )
      .for("update");

    if (!invite) {
      throw new Error("Invitation is invalid, expired, or revoked.");
    }

    if (invite.maxUses !== null && invite.usesCount >= invite.maxUses) {
      throw new Error("Invitation has reached its maximum usage limit.");
    }

    // 2. Increment usage counter
    await tx
      .update(membershipInvites)
      .set({
        usesCount: sql`${membershipInvites.usesCount} + 1`,
        updatedAt: now,
      })
      .where(eq(membershipInvites.id, invite.id));

    // 3. Create User record
    const [newUser] = await tx
      .insert(users)
      .values({
        email: params.email.toLowerCase().trim(),
        googleId: params.googleId || null,
        role: "member",
        membershipStatus: "active",
      })
      .returning();

    // 4. Generate unique slug for artist profile
    const baseSlug = params.displayName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || `artist-${newUser.id.slice(0, 8)}`;
    
    // Check if slug already exists
    const [existingSlug] = await tx
      .select({ id: profiles.id })
      .from(profiles)
      .where(eq(profiles.slug, baseSlug))
      .limit(1);

    const finalSlug = existingSlug
      ? `${baseSlug}-${newUser.id.slice(0, 6)}`
      : baseSlug;

    // 5. Create Profile record
    const [newProfile] = await tx
      .insert(profiles)
      .values({
        userId: newUser.id,
        slug: finalSlug,
        displayName: params.displayName.trim(),
        avatarUrl: params.avatarUrl || null,
        profileStatus: "incomplete",
      })
      .returning();

    // 6. Record Invite Redemption
    await tx.insert(inviteRedemptions).values({
      inviteId: invite.id,
      userId: newUser.id,
      ipAddress: params.ipAddress || null,
      userAgent: params.userAgent || null,
    });

    // 7. Audit Log
    await tx.insert(auditLogs).values({
      actorId: newUser.id,
      actorIp: params.ipAddress || "127.0.0.1",
      action: "invite_redeemed",
      targetType: "user",
      targetId: newUser.id,
      reason: `Account created via invitation ${invite.tokenPrefix}`,
      metadata: {
        inviteId: invite.id,
        email: params.email,
      },
    });

    return { user: newUser, profile: newProfile };
  });
}
