import crypto from "crypto";
import { eq, sql, and, isNull, or, gt } from "drizzle-orm";
import { db } from "@/db";
import {
  membershipInvites,
  inviteRedemptions,
  users,
  profiles,
  auditLogs,
  emailVerificationTokens,
} from "@/db/schema";
import { sendVerificationEmail } from "./email";

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
  customCode?: string; // Optional custom Discord-style vanity code (e.g. "komorebi", "atelier-vip")
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

const BASE62_CHARS = "23456789abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ"; // Clean base58-style alphabet without ambiguous 0/O/1/l/I

/**
 * Generate a clean, human-friendly short random invite code (e.g. "a7K9xQ2v")
 */
export function generateShortInviteCode(length = 8): string {
  const bytes = crypto.randomBytes(length);
  let result = "";
  for (let i = 0; i < length; i++) {
    result += BASE62_CHARS[bytes[i] % BASE62_CHARS.length];
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
    .replace(/^https?:\/\/[^\/]+\//, "")
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
 * Generate a new short-code or custom-code membership invitation
 */
export async function createMembershipInvite(
  params: CreateInviteParams,
  appBaseUrl: string = process.env.APP_URL || "http://localhost:3000"
): Promise<GeneratedInviteResult> {
  let rawToken: string;

  if (params.customCode && params.customCode.trim().length > 0) {
    const cleanCode = params.customCode.trim();
    if (cleanCode.length < 3 || cleanCode.length > 32) {
      throw new Error("Kode undangan kustom harus antara 3 hingga 32 karakter.");
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(cleanCode)) {
      throw new Error("Kode kustom hanya boleh berisi huruf, angka, tanda hubung (-), dan garis bawah (_).");
    }

    const testHash = hashInviteToken(cleanCode);
    const [existing] = await db
      .select()
      .from(membershipInvites)
      .where(
        and(
          eq(membershipInvites.tokenHash, testHash),
          isNull(membershipInvites.revokedAt),
          or(
            isNull(membershipInvites.expiresAt),
            gt(membershipInvites.expiresAt, new Date())
          )
        )
      )
      .limit(1);

    if (existing && (existing.maxUses === null || existing.usesCount < existing.maxUses)) {
      throw new Error(`Kode undangan kustom "${cleanCode}" sudah aktif digunakan.`);
    }

    rawToken = cleanCode;
  } else {
    // Generate clean 8-char short code
    rawToken = generateShortInviteCode(8);
  }

  const tokenHash = hashInviteToken(rawToken);
  const tokenPrefix = rawToken.length <= 8 ? rawToken : `inv_${rawToken.slice(0, 8)}`;
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
    reason: params.label || `Generated membership invite (${tokenPrefix})`,
    metadata: {
      tokenPrefix,
      isCustomCode: !!params.customCode,
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
    return { isValid: false, reason: "Missing token" as const, invite: null };
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
 * Atomically redeem an invitation and create member account via Google OAuth
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
      throw new Error("Undangan tidak valid, telah kedaluwarsa, atau telah dicabut.");
    }

    if (invite.maxUses !== null && invite.usesCount >= invite.maxUses) {
      throw new Error("Undangan telah mencapai batas maksimum penggunaan.");
    }

    // 2. Increment usage counter
    await tx
      .update(membershipInvites)
      .set({
        usesCount: sql`${membershipInvites.usesCount} + 1`,
        updatedAt: now,
      })
      .where(eq(membershipInvites.id, invite.id));

    // 3. Create User record (Google accounts have emailVerified set immediately)
    const [newUser] = await tx
      .insert(users)
      .values({
        email: params.email.toLowerCase().trim(),
        googleId: params.googleId || null,
        emailVerified: now,
        role: "member",
        membershipStatus: "active",
      })
      .returning();

    // 4. Generate unique slug for artist profile
    const baseSlug = params.displayName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || `artist-${newUser.id.slice(0, 8)}`;
    
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
      reason: `Account created via invitation ${invite.tokenPrefix} (Google OAuth)`,
      metadata: {
        inviteId: invite.id,
        email: params.email,
      },
    });

    return { user: newUser, profile: newProfile };
  });
}

/**
 * Atomically redeem an invitation and create member account via Email & Password
 */
export async function redeemInviteAndCreateMemberWithCredentials(params: {
  rawToken: string;
  email: string;
  passwordHash: string;
  displayName: string;
  username?: string;
  ipAddress?: string;
  userAgent?: string;
}) {
  const tokenHash = hashInviteToken(params.rawToken);
  const now = new Date();
  const normalizedEmail = params.email.toLowerCase().trim();

  // Check if email already registered
  const [existingUser] = await db
    .select()
    .from(users)
    .where(eq(users.email, normalizedEmail))
    .limit(1);

  if (existingUser) {
    throw new Error("Email ini telah terdaftar. Silakan langsung masuk di halaman Login.");
  }

  const result = await db.transaction(async (tx) => {
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
      throw new Error("Undangan tidak valid, telah kedaluwarsa, atau telah dicabut.");
    }

    if (invite.maxUses !== null && invite.usesCount >= invite.maxUses) {
      throw new Error("Undangan telah mencapai batas maksimum penggunaan.");
    }

    // 2. Increment usage counter
    await tx
      .update(membershipInvites)
      .set({
        usesCount: sql`${membershipInvites.usesCount} + 1`,
        updatedAt: now,
      })
      .where(eq(membershipInvites.id, invite.id));

    // 3. Create User record (Password account with emailVerified: null initially)
    const [newUser] = await tx
      .insert(users)
      .values({
        email: normalizedEmail,
        username: params.username?.toLowerCase().trim() || null,
        passwordHash: params.passwordHash,
        emailVerified: null, // Requires verification
        role: "member",
        membershipStatus: "active",
      })
      .returning();

    // 4. Generate unique slug for artist profile
    const baseSlug = params.displayName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || `artist-${newUser.id.slice(0, 8)}`;
    
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

    // 7. Generate Email Verification Token (valid for 24 hours)
    const rawVerificationToken = crypto.randomBytes(32).toString("hex");
    const verifTokenHash = crypto.createHash("sha256").update(rawVerificationToken).digest("hex");
    const verifExpiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    await tx.insert(emailVerificationTokens).values({
      userId: newUser.id,
      tokenHash: verifTokenHash,
      expiresAt: verifExpiresAt,
    });

    // 8. Audit Log
    await tx.insert(auditLogs).values({
      actorId: newUser.id,
      actorIp: params.ipAddress || "127.0.0.1",
      action: "invite_redeemed",
      targetType: "user",
      targetId: newUser.id,
      reason: `Account created via invitation ${invite.tokenPrefix} (Credentials)`,
      metadata: {
        inviteId: invite.id,
        email: normalizedEmail,
      },
    });

    return { user: newUser, profile: newProfile, verificationToken: rawVerificationToken };
  });

  // 9. Send verification email
  await sendVerificationEmail({
    email: normalizedEmail,
    token: result.verificationToken,
    displayName: params.displayName,
  });

  return result;
}
