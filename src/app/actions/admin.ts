"use server";

import { db } from "@/db";
import { users, profiles, auditLogs } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireAdmin, requireActiveMember, assertActiveAdminInvariant } from "@/lib/rbac";
import { revalidatePath } from "next/cache";

export async function updateUserRoleAction(
  targetUserId: string,
  newRole: "member" | "moderator" | "admin"
) {
  const admin = await requireAdmin();

  return await db.transaction(async (tx) => {
    const [target] = await tx
      .select()
      .from(users)
      .where(eq(users.id, targetUserId))
      .for("update");

    if (!target) {
      throw new Error("Pengguna tidak ditemukan.");
    }

    if (target.membershipStatus !== "active") {
      throw new Error("Hanya anggota dengan status aktif yang dapat diubah perannya.");
    }

    // Enforce serialized Last-Active-Admin Invariant
    const willRemoveActiveAdmin = target.role === "admin" && newRole !== "admin";
    await assertActiveAdminInvariant(tx, targetUserId, willRemoveActiveAdmin);

    await tx
      .update(users)
      .set({ role: newRole, updatedAt: new Date() })
      .where(eq(users.id, targetUserId));

    await tx.insert(auditLogs).values({
      actorId: admin.id,
      action: "user_role_changed",
      targetType: "user",
      targetId: targetUserId,
      reason: `Role changed from ${target.role} to ${newRole}`,
      metadata: {
        previousRole: target.role,
        newRole,
        targetEmail: target.email,
      },
    });

    revalidatePath("/admin/users");
    return { success: true, newRole };
  });
}

export async function updateUserStatusAction(
  targetUserId: string,
  newStatus: "active" | "suspended" | "deleted",
  reason: string
) {
  const actor = await requireActiveMember();

  if (actor.role !== "admin" && actor.role !== "moderator") {
    throw new Error("Akses ditolak: Wewenang Administrator atau Moderator diperlukan.");
  }

  return await db.transaction(async (tx) => {
    const [target] = await tx
      .select()
      .from(users)
      .where(eq(users.id, targetUserId))
      .for("update");

    if (!target) {
      throw new Error("Pengguna tidak ditemukan.");
    }

    // Transition Matrix Enforcement (Blueprint 2.2.2 Section F)
    // 1. Cannot activate pending account via generic admin action (must redeem invite)
    if (target.membershipStatus === null && newStatus === "active") {
      throw new Error(
        "Akun pending hanya dapat diaktifkan melalui penukaran undangan resmi (redeemInviteService)."
      );
    }

    // 2. Cannot suspend pending account
    if (target.membershipStatus === null && newStatus === "suspended") {
      throw new Error("Akun pending tidak dapat ditangguhkan.");
    }

    // 3. Deleted status is irreversible
    if (target.membershipStatus === "deleted" || target.deletedAt) {
      throw new Error("Akun yang telah dihapus tidak dapat diubah statusnya.");
    }

    // 4. Moderator authority boundary: ordinary members only, cannot delete
    if (actor.role === "moderator") {
      if (target.role !== "member") {
        throw new Error(
          "Akses ditolak: Moderator hanya dapat mengelola status anggota biasa (member)."
        );
      }
      if (newStatus === "deleted") {
        throw new Error("Akses ditolak: Hanya Administrator yang dapat menghapus akun.");
      }
    }

    // 5. Soft-delete requires mandatory >= 5 character reason and Admin role
    if (newStatus === "deleted") {
      if (actor.role !== "admin") {
        throw new Error("Akses ditolak: Hanya Administrator yang dapat menghapus akun.");
      }
      if (!reason || reason.trim().length < 5) {
        throw new Error("Alasan penghapusan akun minimal 5 karakter wajib diisi.");
      }
    }

    // 6. Enforce serialized Last-Active-Admin Invariant when suspending or deleting an active Admin
    const willRemoveActiveAdmin =
      target.role === "admin" &&
      target.membershipStatus === "active" &&
      (newStatus === "suspended" || newStatus === "deleted");

    await assertActiveAdminInvariant(tx, targetUserId, willRemoveActiveAdmin);

    const now = new Date();
    if (newStatus === "deleted") {
      await tx
        .update(users)
        .set({
          membershipStatus: "deleted",
          deletedAt: now,
          deletedBy: actor.id,
          deletionReason: reason.trim(),
          updatedAt: now,
        })
        .where(eq(users.id, targetUserId));

      await tx
        .update(profiles)
        .set({ profileStatus: "deleted", updatedAt: now })
        .where(eq(profiles.userId, targetUserId));
    } else {
      await tx
        .update(users)
        .set({ membershipStatus: newStatus, updatedAt: now })
        .where(eq(users.id, targetUserId));

      // Blueprint 2.2.2 Section G: Preserve Profile Privacy across suspension/reactivation
      // Keep underlying profile visibility/status unchanged (e.g. active_hidden remains active_hidden)
    }

    await tx.insert(auditLogs).values({
      actorId: actor.id,
      action: "user_status_changed",
      targetType: "user",
      targetId: targetUserId,
      reason: reason?.trim() || `Status changed to ${newStatus}`,
      metadata: {
        previousStatus: target.membershipStatus,
        newStatus,
        targetEmail: target.email,
      },
    });

    revalidatePath("/admin/users");
    return { success: true, newStatus };
  });
}
