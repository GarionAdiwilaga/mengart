"use server";

import { z } from "zod";
import { getCurrentUser, requireModerator } from "@/lib/rbac";
import {
  createMembershipInvite,
  validateInviteToken,
  redeemInviteAndCreateMember,
  hashInviteToken,
  type InviteExpiryPreset,
} from "@/lib/invites";
import { db } from "@/db";
import { membershipInvites, auditLogs } from "@/db/schema";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";

const createInviteSchema = z.object({
  label: z.string().max(100).optional(),
  customCode: z
    .string()
    .min(3, "Kode kustom minimal 3 karakter")
    .max(32, "Kode kustom maksimal 32 karakter")
    .regex(/^[a-zA-Z0-9_-]+$/, "Kode kustom hanya boleh berisi huruf, angka, tanda hubung (-), dan garis bawah (_)")
    .optional()
    .or(z.literal("")),
  expiryPreset: z
    .enum(["30m", "1h", "6h", "12h", "1d", "7d", "never", "custom"])
    .default("7d"),
  customExpiresAt: z.string().datetime().optional(),
  maxUses: z.number().int().positive().nullable().optional(),
});

const revokeInviteSchema = z.object({
  inviteId: z.string().uuid(),
  reason: z.string().min(3, "Revocation reason is required").max(500),
});

/**
 * Server Action: Create a new membership invitation (Admin/Moderator only)
 */
export async function createInviteAction(formData: {
  label?: string;
  customCode?: string;
  expiryPreset?: InviteExpiryPreset;
  customExpiresAt?: string;
  maxUses?: number | null;
}) {
  const user = await requireModerator();
  const validated = createInviteSchema.parse(formData);
  const headerList = await headers();
  const clientIp =
    headerList.get("cf-connecting-ip") ||
    headerList.get("x-forwarded-for")?.split(",")[0] ||
    "127.0.0.1";

  const result = await createMembershipInvite({
    label: validated.label,
    customCode: validated.customCode && validated.customCode.trim().length > 0 ? validated.customCode.trim() : undefined,
    expiryPreset: validated.expiryPreset as InviteExpiryPreset,
    customExpiresAt: validated.customExpiresAt
      ? new Date(validated.customExpiresAt)
      : undefined,
    maxUses: validated.maxUses === undefined ? 1 : validated.maxUses,
    createdByUserId: user.id,
    creatorIp: clientIp,
  });

  revalidatePath("/admin/invites");
  return { success: true, invite: result };
}

/**
 * Server Action: Revoke an invitation (Admin/Moderator only)
 */
export async function revokeInviteAction(data: {
  inviteId: string;
  reason: string;
}) {
  const user = await requireModerator();
  const validated = revokeInviteSchema.parse(data);
  const headerList = await headers();
  const clientIp =
    headerList.get("cf-connecting-ip") ||
    headerList.get("x-forwarded-for")?.split(",")[0] ||
    "127.0.0.1";

  const now = new Date();
  const [updatedInvite] = await db
    .update(membershipInvites)
    .set({
      revokedAt: now,
      revokedBy: user.id,
      revocationReason: validated.reason,
      updatedAt: now,
    })
    .where(eq(membershipInvites.id, validated.inviteId))
    .returning();

  if (!updatedInvite) {
    throw new Error("Invitation not found");
  }

  // Record audit log
  await db.insert(auditLogs).values({
    actorId: user.id,
    actorIp: clientIp,
    action: "invite_revoked",
    targetType: "invite",
    targetId: updatedInvite.id,
    reason: validated.reason,
    metadata: {
      tokenPrefix: updatedInvite.tokenPrefix,
    },
  });

  revalidatePath("/admin/invites");
  return { success: true, inviteId: updatedInvite.id };
}

/**
 * Server Action: Complete invite redemption & account setup with Google OAuth
 */
export async function completeRegistrationAction(params: {
  rawToken: string;
  displayName: string;
  email: string;
  googleId?: string;
  avatarUrl?: string;
}) {
  const headerList = await headers();
  const clientIp =
    headerList.get("cf-connecting-ip") ||
    headerList.get("x-forwarded-for")?.split(",")[0] ||
    "127.0.0.1";
  const userAgent = headerList.get("user-agent") || undefined;

  const redemption = await redeemInviteAndCreateMember({
    rawToken: params.rawToken,
    email: params.email,
    displayName: params.displayName,
    googleId: params.googleId,
    avatarUrl: params.avatarUrl,
    ipAddress: clientIp,
    userAgent,
  });

  return { success: true, user: redemption.user, profile: redemption.profile };
}
