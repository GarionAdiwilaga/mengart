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
  customCode?: string;
  expiryPreset?: InviteExpiryPreset;
  customExpiresAt?: Date;
  maxUses?: number | null; // null = unlimited
  createdByUserId: string; // Mandatory active Admin actor ID per Blueprint 2.2.2
  creatorIp?: string;
}

export interface GeneratedInviteResult {
  id: string;
  code: string;
  inviteUrl: string;
  label: string | null;
  expiresAt: Date | null;
  maxUses: number | null;
  usesCount: number;
  createdAt: Date;
}

export type InviteStatus = "active" | "expired" | "exhausted" | "revoked";

const INVITE_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const RESERVED_INVITE_CODES = new Set([
  "api",
  "auth",
  "admin",
  "login",
  "onboarding",
  "dashboard",
  "invite",
  "challenges",
  "artists",
  "artworks",
  "gallery",
  "me",
  "settings",
]);

/**
 * Generate a CSPRNG unbiased random invite code (default 8 characters, A-Z/a-z/0-9) per Blueprint 2.2.2
 */
export function generateDefaultInviteCode(length = 8): string {
  let result = "";
  for (let i = 0; i < length; i++) {
    const randomIndex = crypto.randomInt(0, INVITE_ALPHABET.length);
    result += INVITE_ALPHABET[randomIndex];
  }
  return result;
}

/**
 * Normalize and validate optional custom invite code (lowercase, [a-z0-9-], max length 25)
 */
export function normalizeAndValidateCustomCode(customCode: string): string {
  const normalized = customCode.trim().toLowerCase();
  if (normalized.length < 1 || normalized.length > 25) {
    throw new Error("Kode undangan khusus harus terdiri dari 1 hingga 25 karakter.");
  }
  if (!/^[a-z0-9-]+$/.test(normalized)) {
    throw new Error("Kode undangan khusus hanya boleh memuat huruf kecil, angka, dan tanda hubung (-).");
  }
  if (RESERVED_INVITE_CODES.has(normalized)) {
    throw new Error("Kode undangan tersebut merupakan kata kunci sistem dan tidak dapat digunakan.");
  }
  return normalized;
}

/**
 * Intelligently extract raw code whether user entered a raw code or full invitation URL
 */
export function extractInviteCode(input: string): string {
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

import { assertAdminActor } from "@/lib/services/userService";

/**
 * Create a new membership invitation (Admin only) storing direct code per Blueprint 2.2.2.
 * Executes atomically within a transaction with unconditional in-transaction ACTIVE Admin verification.
 */
export async function createMembershipInvite(
  params: CreateInviteParams,
  appBaseUrl: string = process.env.APP_URL || "http://localhost:3000",
  dbOrTx: any = db
): Promise<GeneratedInviteResult> {
  // 1. Mandatory actor presence check
  if (
    !params.createdByUserId ||
    typeof params.createdByUserId !== "string" ||
    params.createdByUserId.trim().length === 0
  ) {
    throw new Error("Akses ditolak: Aktor Administrator wajib dicantumkan.");
  }

  return await dbOrTx.transaction(async (tx: any) => {
    // 2. Unconditionally verify actor is an ACTIVE Admin inside the transaction
    const actor = await assertAdminActor(tx, params.createdByUserId);

    let code: string;

    if (params.customCode && params.customCode.trim().length > 0) {
      code = normalizeAndValidateCustomCode(params.customCode);

      // Check custom code uniqueness inside transaction
      const [existing] = await tx
        .select({ id: membershipInvites.id })
        .from(membershipInvites)
        .where(eq(membershipInvites.code, code))
        .limit(1);

      if (existing) {
        throw new Error("Kode undangan khusus tersebut sudah digunakan. Silakan pilih kode lain.");
      }
    } else {
      // Generate default 8-char CSPRNG code with collision retry loop inside transaction
      let attempts = 0;
      let unique = false;
      code = "";

      while (!unique && attempts < 10) {
        attempts++;
        const candidate = generateDefaultInviteCode(8);
        const [existing] = await tx
          .select({ id: membershipInvites.id })
          .from(membershipInvites)
          .where(eq(membershipInvites.code, candidate))
          .limit(1);

        if (!existing) {
          code = candidate;
          unique = true;
        }
      }

      if (!unique || !code) {
        throw new Error("Gagal menghasilkan kode undangan unik. Silakan coba lagi.");
      }
    }

    const expiresAt = params.customExpiresAt
      ? params.customExpiresAt
      : calculateExpiryDate(params.expiryPreset || "7d");

    const [createdInvite] = await tx
      .insert(membershipInvites)
      .values({
        code,
        label: params.label?.trim() || null,
        expiresAt,
        maxUses: params.maxUses !== undefined ? params.maxUses : 1, // Default 1 use
        usesCount: 0,
        createdBy: actor.id,
      })
      .returning();

    // Audit log creation (DO NOT put raw code in reason or metadata)
    await tx.insert(auditLogs).values({
      actorId: actor.id,
      actorIp: params.creatorIp || "127.0.0.1",
      action: "invite_created",
      targetType: "invite",
      targetId: createdInvite.id,
      reason: params.label || "Undangan membership baru dibuat oleh administrator",
      metadata: {
        inviteId: createdInvite.id,
        label: createdInvite.label,
        expiresAt,
        maxUses: params.maxUses,
      },
    });

    return {
      id: createdInvite.id,
      code: createdInvite.code,
      inviteUrl: `${appBaseUrl}/invite/${createdInvite.code}`,
      label: createdInvite.label,
      expiresAt: createdInvite.expiresAt,
      maxUses: createdInvite.maxUses,
      usesCount: createdInvite.usesCount,
      createdAt: createdInvite.createdAt,
    };
  });
}

/**
 * Authoritative deterministic invite code lookup (Blueprint 2.2.2 Item 2):
 * 1. Exact match first
 * 2. If exact exists -> return exact record
 * 3. Only if exact does not exist and input is not already lowercase, check lowercase fallback
 * 4. Never allow ambiguous multi-row or lookup
 */
export async function findInviteByCode(
  txOrDb: any,
  rawCode: string,
  forUpdate = false
) {
  const cleanCode = extractInviteCode(rawCode);
  if (!cleanCode || cleanCode.length === 0) return null;

  // 1. Exact match first
  let query = txOrDb
    .select()
    .from(membershipInvites)
    .where(eq(membershipInvites.code, cleanCode))
    .limit(1);

  if (forUpdate) {
    query = query.for("update");
  }

  const [exactMatch] = await query;
  if (exactMatch) {
    return exactMatch;
  }

  // 2. Lowercase fallback only if cleanCode is not already lowercase
  const lowerCode = cleanCode.toLowerCase();
  if (lowerCode !== cleanCode) {
    let lowerQuery = txOrDb
      .select()
      .from(membershipInvites)
      .where(eq(membershipInvites.code, lowerCode))
      .limit(1);

    if (forUpdate) {
      lowerQuery = lowerQuery.for("update");
    }

    const [lowerMatch] = await lowerQuery;
    if (lowerMatch) {
      return lowerMatch;
    }
  }

  return null;
}

/**
 * Validate an invitation code without redeeming it
 */
export async function validateInviteCode(rawInput: string) {
  const invite = await findInviteByCode(db, rawInput, false);

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
 * Deterministic Two-Phase Locking Service for Invite Redemption (Blueprint 2.2.2)
 * Lock Order:
 * 1. Lock target users row FOR UPDATE
 * 2. Lock target membership_invites row FOR UPDATE by direct code
 */
export async function redeemInviteService(
  dbOrTx: any,
  params: {
    userId: string;
    code: string;
    displayName?: string;
    avatarUrl?: string;
    ipAddress?: string;
    userAgent?: string;
  }
) {
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

    // 2. Lock target invite row FOR UPDATE by deterministic code lookup
    const invite = await findInviteByCode(tx, params.code, true);

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

    // 7. Audit log (DO NOT leak raw invite code in metadata/reason)
    await tx.insert(auditLogs).values({
      actorId: user.id,
      actorIp: params.ipAddress || "127.0.0.1",
      action: "invite_redeemed",
      targetType: "invite",
      targetId: invite.id,
      reason: "Keanggotaan diaktifkan melalui penukaran undangan resmi",
      metadata: {
        inviteId: invite.id,
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
    // Enforce domain authorization: only active Admin can revoke invitations
    await assertAdminActor(tx, params.adminUserId);

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
      },
    });

    return { invite: updated, alreadyRevoked: false };
  });
}

/**
 * List all membership invitations (Admin only domain service)
 */
export async function listMembershipInvitesService(
  dbOrTx: any,
  actorUserId: string
) {
  await assertAdminActor(dbOrTx, actorUserId);

  return await dbOrTx
    .select({
      id: membershipInvites.id,
      code: membershipInvites.code,
      label: membershipInvites.label,
      expiresAt: membershipInvites.expiresAt,
      maxUses: membershipInvites.maxUses,
      usesCount: membershipInvites.usesCount,
      revokedAt: membershipInvites.revokedAt,
      revocationReason: membershipInvites.revocationReason,
      createdAt: membershipInvites.createdAt,
    })
    .from(membershipInvites)
    .orderBy(membershipInvites.createdAt);
}
