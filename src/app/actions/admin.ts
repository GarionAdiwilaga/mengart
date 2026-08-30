"use server";

import { db } from "@/db";
import { requireAdmin, requireActiveMember } from "@/lib/rbac";
import { revalidatePath } from "next/cache";
import { updateUserMembershipStatusService, updateUserRoleService } from "@/lib/services/userService";

export async function updateUserRoleAction(
  targetUserId: string,
  newRole: "member" | "moderator" | "admin"
) {
  const admin = await requireAdmin();

  const result = await db.transaction(async (tx) => {
    return await updateUserRoleService(tx, {
      actor: {
        id: admin.id,
        role: admin.role,
        membershipStatus: admin.membershipStatus,
      },
      targetUserId,
      newRole,
    });
  });

  revalidatePath("/admin/users");
  return { success: true, newRole: result.newRole };
}

export async function updateUserStatusAction(
  targetUserId: string,
  newStatus: "active" | "suspended" | "deleted",
  reason: string
) {
  const actor = await requireActiveMember();

  const result = await db.transaction(async (tx) => {
    return await updateUserMembershipStatusService(tx, {
      actor: {
        id: actor.id,
        role: actor.role,
        membershipStatus: actor.membershipStatus,
      },
      targetUserId,
      newStatus,
      reason,
    });
  });

  revalidatePath("/admin/users");
  return { success: true, newStatus: result.newStatus };
}
