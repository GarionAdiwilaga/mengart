import { eq } from "drizzle-orm";
import { users, profiles, auditLogs } from "@/db/schema";
import { assertActiveAdminInvariant } from "@/lib/rbac";

export interface UpdateUserMembershipStatusParams {
  actor: {
    id: string;
    role: "member" | "moderator" | "admin";
    membershipStatus?: "active" | "suspended" | "deleted" | null;
  };
  targetUserId: string;
  newStatus: "active" | "suspended" | "deleted";
  reason?: string;
  auditAction?: string;
  auditMetadata?: Record<string, any>;
}

export interface UpdateUserRoleParams {
  actor: {
    id: string;
    role: "member" | "moderator" | "admin";
    membershipStatus?: "active" | "suspended" | "deleted" | null;
  };
  targetUserId: string;
  newRole: "member" | "moderator" | "admin";
  reason?: string;
}

/**
 * Authoritative Canonical Domain Service for User Membership Status Mutations
 * (Blueprint 2.2.2 Sections E, F, G, H)
 * 
 * Enforces the complete transition matrix, staff boundaries, Last-Active-Admin invariant,
 * and profile privacy across all caller surfaces (admin UI actions, moderation reports, etc.).
 */
export async function updateUserMembershipStatusService(
  tx: any,
  params: UpdateUserMembershipStatusParams
) {
  const { actor, targetUserId, newStatus, reason, auditAction, auditMetadata } = params;

  // 1. Actor Active Staff Verification
  if (actor.membershipStatus !== "active") {
    throw new Error("Akun Anda sedang ditangguhkan atau belum aktif.");
  }
  if (actor.role !== "admin" && actor.role !== "moderator") {
    throw new Error("Akses ditolak: Wewenang Administrator atau Moderator diperlukan.");
  }

  // 2. Lock Target User Row FOR UPDATE
  const [target] = await tx
    .select()
    .from(users)
    .where(eq(users.id, targetUserId))
    .for("update");

  if (!target) {
    throw new Error("Pengguna tidak ditemukan.");
  }

  // 3. Transition Matrix & Role Boundary Enforcement (Blueprint 2.2.2 Section F)
  // Rule 1: NULL -> ACTIVE is ONLY permitted via redeemInviteService
  if (target.membershipStatus === null && newStatus === "active") {
    throw new Error(
      "Akun pending hanya dapat diaktifkan melalui penukaran undangan resmi (redeemInviteService)."
    );
  }

  // Rule 2: NULL -> SUSPENDED is strictly rejected
  if (target.membershipStatus === null && newStatus === "suspended") {
    throw new Error("Akun pending tidak dapat ditangguhkan.");
  }

  // Rule 3: DELETED status is terminal and irreversible
  if (target.membershipStatus === "deleted" || target.deletedAt) {
    throw new Error("Akun yang telah dihapus tidak dapat diubah statusnya.");
  }

  // Rule 4: Moderator authority boundary (ordinary members only, cannot delete)
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

  // Rule 5: Soft-deletion requires active Admin and mandatory >= 5 character reason
  if (newStatus === "deleted") {
    if (actor.role !== "admin") {
      throw new Error("Akses ditolak: Hanya Administrator yang dapat menghapus akun.");
    }
    if (!reason || reason.trim().length < 5) {
      throw new Error("Alasan penghapusan akun minimal 5 karakter wajib diisi.");
    }
  }

  // 4. Enforce Serialized Last-Active-Admin Invariant
  const willRemoveActiveAdmin =
    target.role === "admin" &&
    target.membershipStatus === "active" &&
    (newStatus === "suspended" || newStatus === "deleted");

  await assertActiveAdminInvariant(tx, targetUserId, willRemoveActiveAdmin);

  // 5. Apply Database Mutations
  const now = new Date();
  if (newStatus === "deleted") {
    await tx
      .update(users)
      .set({
        membershipStatus: "deleted",
        deletedAt: now,
        deletedBy: actor.id,
        deletionReason: reason ? reason.trim() : null,
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

  // 6. Record Audit Log
  await tx.insert(auditLogs).values({
    actorId: actor.id,
    action: auditAction || "user_status_changed",
    targetType: "user",
    targetId: targetUserId,
    reason: reason?.trim() || `Status changed to ${newStatus}`,
    metadata: {
      previousStatus: target.membershipStatus,
      newStatus,
      targetEmail: target.email,
      targetRole: target.role,
      ...(auditMetadata || {}),
    },
  });

  return { success: true, target, newStatus };
}

/**
 * Authoritative Canonical Domain Service for User Role Mutations
 * (Blueprint 2.2.2 Section H)
 */
export async function updateUserRoleService(
  tx: any,
  params: UpdateUserRoleParams
) {
  const { actor, targetUserId, newRole, reason } = params;

  // 1. Actor Active Admin Verification
  if (actor.membershipStatus !== "active") {
    throw new Error("Akun Anda sedang ditangguhkan atau belum aktif.");
  }
  if (actor.role !== "admin") {
    throw new Error("Akses ditolak: Hanya Administrator yang dapat mengubah peran pengguna.");
  }

  // 2. Lock Target User Row FOR UPDATE
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

  // 3. Enforce Serialized Last-Active-Admin Invariant
  const willRemoveActiveAdmin = target.role === "admin" && newRole !== "admin";
  await assertActiveAdminInvariant(tx, targetUserId, willRemoveActiveAdmin);

  // 4. Apply Database Mutation
  await tx
    .update(users)
    .set({ role: newRole, updatedAt: new Date() })
    .where(eq(users.id, targetUserId));

  // 5. Record Audit Log
  await tx.insert(auditLogs).values({
    actorId: actor.id,
    action: "user_role_changed",
    targetType: "user",
    targetId: targetUserId,
    reason: reason?.trim() || `Role changed from ${target.role} to ${newRole}`,
    metadata: {
      previousRole: target.role,
      newRole,
      targetEmail: target.email,
    },
  });

  return { success: true, newRole };
}
