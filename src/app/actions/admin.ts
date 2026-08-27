"use server";

import { db } from "@/db";
import { users, profiles, auditLogs } from "@/db/schema";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { revalidatePath } from "next/cache";

export async function updateUserRoleAction(targetUserId: string, newRole: "member" | "moderator" | "admin") {
  const session = await auth();
  if (session?.user?.role !== "admin") {
    throw new Error("Hanya Administrator yang memiliki wewenang mengubah peran pengguna.");
  }

  const [target] = await db.select().from(users).where(eq(users.id, targetUserId)).limit(1);
  if (!target) {
    throw new Error("Pengguna tidak ditemukan.");
  }

  await db.transaction(async (tx) => {
    await tx.update(users).set({ role: newRole }).where(eq(users.id, targetUserId));

    await tx.insert(auditLogs).values({
      actorId: session.user.id,
      action: "user_role_changed",
      targetType: "user",
      targetId: targetUserId,
      metadata: {
        previousRole: target.role,
        newRole,
        targetEmail: target.email,
      },
    });
  });

  revalidatePath("/admin/users");
  return { success: true, newRole };
}

export async function updateUserStatusAction(
  targetUserId: string,
  newStatus: "active" | "suspended" | "revoked",
  reason: string
) {
  const session = await auth();
  if (session?.user?.role !== "admin" && session?.user?.role !== "moderator") {
    throw new Error("Akses tidak diizinkan.");
  }

  const [target] = await db.select().from(users).where(eq(users.id, targetUserId)).limit(1);
  if (!target) {
    throw new Error("Pengguna tidak ditemukan.");
  }

  await db.transaction(async (tx) => {
    await tx.update(users).set({ membershipStatus: newStatus }).where(eq(users.id, targetUserId));

    await tx.insert(auditLogs).values({
      actorId: session.user.id,
      action: "user_status_changed",
      targetType: "user",
      targetId: targetUserId,
      metadata: {
        previousStatus: target.membershipStatus,
        newStatus,
        targetEmail: target.email,
        reason,
      },
    });
  });

  revalidatePath("/admin/users");
  return { success: true, newStatus };
}
