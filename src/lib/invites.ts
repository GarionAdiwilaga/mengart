import crypto from "crypto";
import { eq, sql, and, isNull, or, gt } from "drizzle-orm";
import { db } from "@/db";
import {
  membershipInvites,
  inviteRedemptions,
  users,
  profiles,
  auditLogs,
} from "@/db/schema";

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

const BASE58_CHARS = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

/**
 * Generate a high-entropy cryptographic random invite code (default 16 bytes base58, >100 bits entropy)
 */
export function generateShortInviteCode(length = 16): string {
  const bytes = crypto.randomBytes(length);
  let result = "";
  for (let i = 0; i < length; i++) {
    result += BASE58_CHARS[bytes[i] % BASE58_CHARS.length];
  }
  return result;
}

/**
 * Intelligently extract raw token whether user entered a raw token or full invitation URL
 */
export function extractInviteToken(input: string): string {
  if (!input) return "";
  const trimmed = input.trim();

  // If input contains /invite/, extract the segment after it
  const match = trimmed.match(/\/invite\/([a-zA-Z0-9_-]+)/);
  if (match && match[1]) {
    return match[1].trim();
  }

  // Remove any leading/trailing query params or hashes
  return trimmed
    .split("?")[0]
    .split("#")[0]
    .replace(/^https?:\/\/[^/]+\//, "")
    .replace(/^invite\//, "")
    .trim();
}

/**
 * Hash raw invitation token with SHA-256
 */
export function hashInviteToken(rawToken: string): string {
  const clean = extractInviteToken(rawToken);
  return crypto.createHash("sha256").update(clean).digest("hex");
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
 * Generate a new high-entropy membership invitation (Admin only)
 */
export async function createMembershipInvite(
  params: CreateInviteParams,
  appBaseUrl: string = process.env.APP_URL || "http://localhost:3000"
): Promise<GeneratedInviteResult> {
  const rawToken = generateShortInviteCode(16);
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
      label: params.label?.trim() || null,
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
    reason: params.label || `Generated membership invite (${tokenPrefix})`,
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
  const cleanToken = extractInviteToken(rawToken);
  if (!cleanToken || cleanToken.length === 0) {
    return { isValid: false, reason: "not_found" as const, invite: null };
  }

  const tokenHash = hashInviteToken(cleanToken);
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
 * Deterministic Two-Phase Locking Service for Invite Redemption (Blueprint 2.2.1)
 * Lock Order:
 * 1. Lock target users row FOR UPDATE
 * 2. Lock target membership_invites row FOR UPDATE
 */
export async function redeemInviteService(
  dbOrTx: any,
  params: {
    userId: string;
    rawToken: string;
    displayName?: string;
    avatarUrl?: string;
    ipAddress?: string;
    userAgent?: string;
  }
) {
  const tokenHash = hashInviteToken(params.rawToken);
  const now = new Date();

  return await dbOrTx.transaction(async (tx: any) => {
    // 1. Lock target user row FOR UPDATE
    const [user] = await tx
      .select()
      .from(users)
      .where(eq(users.id, params.userId))
      .for("update");

    if (!user) {
      throw new Error("Pengguna tidak ditemukan.");
    }

    // Enforce membership status invariants
    if (user.membershipStatus === "active") {
      // Idempotent pass-through: already active, do not consume invite
      const [profile] = await tx
        .select()
        .from(profiles)
        .where(eq(profiles.userId, user.id))
        .limit(1);
      return { user, profile, isAlreadyActive: true };
    }
    if (user.membershipStatus === "suspended") {
      throw new Error(
        "Akun Anda sedang ditangguhkan. Undangan tidak dapat digunakan untuk mengaktifkan kembali akun."
      );
    }
    if (user.membershipStatus === "deleted" || user.deletedAt) {
      throw new Error("Akun telah dihapus.");
    }

    // 2. Lock target invite row FOR UPDATE
    const [invite] = await tx
      .select()
      .from(membershipInvites)
      .where(eq(membershipInvites.tokenHash, tokenHash))
      .for("update");

    if (!invite) {
      throw new Error("Undangan tidak valid atau tidak ditemukan.");
    }
    if (invite.revokedAt) {
      throw new Error("Undangan telah dicabut oleh administrator.");
    }
    if (invite.expiresAt && invite.expiresAt <= now) {
      throw new Error("Undangan telah kedaluwarsa.");
    }
    if (invite.maxUses !== null && invite.usesCount >= invite.maxUses) {
      throw new Error("Batas penggunaan undangan ini telah habis.");
    }

    // 3. Atomically increment usage count
    await tx
      .update(membershipInvites)
      .set({
        usesCount: sql`${membershipInvites.usesCount} + 1`,
        updatedAt: now,
      })
      .where(eq(membershipInvites.id, invite.id));

    // 4. Update user to ACTIVE
    const [updatedUser] = await tx
      .update(users)
      .set({
        membershipStatus: "active",
        emailVerified: user.emailVerified || now,
        updatedAt: now,
      })
      .where(eq(users.id, user.id))
      .returning();

    // 5. Create or reconcile artist profile
    const rawName =
      params.displayName ||
      user.username ||
      user.email.split("@")[0] ||
      "Artist";
    const baseSlug =
      rawName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "") || `artist-${user.id.slice(0, 8)}`;

    const [existingSlug] = await tx
      .select({ id: profiles.id })
      .from(profiles)
      .where(eq(profiles.slug, baseSlug))
      .limit(1);

    const finalSlug = existingSlug
      ? `${baseSlug}-${user.id.slice(0, 6)}`
      : baseSlug;

    let [profile] = await tx
      .select()
      .from(profiles)
      .where(eq(profiles.userId, user.id))
      .limit(1);

    if (!profile) {
      [profile] = await tx
        .insert(profiles)
        .values({
          userId: user.id,
          slug: finalSlug,
          displayName: rawName.trim(),
          avatarUrl: params.avatarUrl || null,
          profileStatus: "incomplete",
        })
        .returning();
    }

    // 6. Record redemption history
    await tx.insert(inviteRedemptions).values({
      inviteId: invite.id,
      userId: user.id,
      ipAddress: params.ipAddress || null,
      userAgent: params.userAgent || null,
      redeemedAt: now,
    });

    // 7. Audit log
    await tx.insert(auditLogs).values({
      actorId: user.id,
      actorIp: params.ipAddress || "127.0.0.1",
      action: "invite_redeemed",
      targetType: "invite",
      targetId: invite.id,
      reason: `Membership activated via invite ${invite.tokenPrefix}`,
      metadata: {
        inviteId: invite.id,
        tokenPrefix: invite.tokenPrefix,
        userId: user.id,
        email: user.email,
      },
    });

    return { user: updatedUser, profile, isAlreadyActive: false };
  });
}

/**
 * Revoke an invitation with serialized row lock (Admin only)
 */
export async function revokeInviteService(
  dbOrTx: any,
  params: {
    inviteId: string;
    adminUserId: string;
    reason?: string;
    ipAddress?: string;
  }
) {
  const now = new Date();

  return await dbOrTx.transaction(async (tx: any) => {
    const [invite] = await tx
      .select()
      .from(membershipInvites)
      .where(eq(membershipInvites.id, params.inviteId))
      .for("update");

    if (!invite) {
      throw new Error("Undangan tidak ditemukan.");
    }

    if (invite.revokedAt) {
      return { invite, alreadyRevoked: true };
    }

    const [updated] = await tx
      .update(membershipInvites)
      .set({
        revokedAt: now,
        revokedBy: params.adminUserId,
        revocationReason: params.reason?.trim() || "Dicabut oleh administrator",
        updatedAt: now,
      })
      .where(eq(membershipInvites.id, invite.id))
      .returning();

    await tx.insert(auditLogs).values({
      actorId: params.adminUserId,
      actorIp: params.ipAddress || "127.0.0.1",
      action: "invite_revoked",
      targetType: "invite",
      targetId: invite.id,
      reason: params.reason?.trim() || "Undangan dicabut oleh administrator",
      metadata: {
        inviteId: invite.id,
        tokenPrefix: invite.tokenPrefix,
      },
    });

    return { invite: updated, alreadyRevoked: false };
  });
}
