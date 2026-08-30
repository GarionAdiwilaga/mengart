"use server";

import { z } from "zod";
import { requireAdmin } from "@/lib/rbac";
import {
  createMembershipInvite,
  revokeInviteService,
  type InviteExpiryPreset,
} from "@/lib/invites";
import { db } from "@/db";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";

const createInviteSchema = z.object({
  label: z.string().max(100).optional(),
  expiryPreset: z
    .enum(["30m", "1h", "6h", "12h", "1d", "7d", "never", "custom"])
    .default("7d"),
  customExpiresAt: z.string().datetime().optional(),
  maxUses: z.number().int().positive().nullable().optional(),
});

const revokeInviteSchema = z.object({
  inviteId: z.string().uuid(),
  reason: z.string().min(3, "Alasan pencabutan minimal 3 karakter").max(500),
});

/**
 * Server Action: Create a new membership invitation (Strictly Admin only)
 */
export async function createInviteAction(formData: {
  label?: string;
  expiryPreset?: InviteExpiryPreset;
  customExpiresAt?: string;
  maxUses?: number | null;
}) {
  const admin = await requireAdmin();
  const validated = createInviteSchema.parse(formData);
  const headerList = await headers();
  const clientIp =
    headerList.get("cf-connecting-ip") ||
    headerList.get("x-forwarded-for")?.split(",")[0] ||
    "127.0.0.1";

  const result = await createMembershipInvite({
    label: validated.label,
    expiryPreset: validated.expiryPreset as InviteExpiryPreset,
    customExpiresAt: validated.customExpiresAt
      ? new Date(validated.customExpiresAt)
      : undefined,
    maxUses: validated.maxUses === undefined ? 1 : validated.maxUses,
    createdByUserId: admin.id,
    creatorIp: clientIp,
  });

  revalidatePath("/admin/invites");
  return { success: true, invite: result };
}

/**
 * Server Action: Revoke an invitation (Strictly Admin only)
 */
export async function revokeInviteAction(data: {
  inviteId: string;
  reason: string;
}) {
  const admin = await requireAdmin();
  const validated = revokeInviteSchema.parse(data);
  const headerList = await headers();
  const clientIp =
    headerList.get("cf-connecting-ip") ||
    headerList.get("x-forwarded-for")?.split(",")[0] ||
    "127.0.0.1";

  const result = await revokeInviteService(db, {
    inviteId: validated.inviteId,
    adminUserId: admin.id,
    reason: validated.reason,
    ipAddress: clientIp,
  });

  revalidatePath("/admin/invites");
  return { success: true, inviteId: result.invite.id, alreadyRevoked: result.alreadyRevoked };
}
