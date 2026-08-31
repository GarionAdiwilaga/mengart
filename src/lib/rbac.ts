import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { users, challengeJuryAssignments } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";

export type Role = "member" | "moderator" | "admin";
export const ADMIN_MEMBERSHIP_ADVISORY_LOCK_KEY = 4281729;

/**
 * Get current authenticated user session or null
 */
export async function getCurrentUser() {
  const session = await auth();
  if (!session?.user || !session.user.id) return null;
  return session.user;
}

/**
 * Require authenticated user session and redirect appropriately
 */
export async function requireAuth(redirectTo: string = "/login") {
  const user = await getCurrentUser();
  if (!user) {
    redirect(`${redirectTo}?error=AuthRequired`);
  }
  if (user.membershipStatus === null) {
    redirect("/onboarding");
  }
  if (user.membershipStatus === "suspended") {
    redirect("/dashboard?error=AccountSuspended");
  }
  if (user.membershipStatus === "deleted") {
    redirect("/login?error=AccountDeleted");
  }
  return user;
}

/**
 * Require active member with live PostgreSQL database status verification
 */
export async function requireActiveMember() {
  const sessionUser = await getCurrentUser();
  if (!sessionUser) {
    throw new Error("Autentikasi diperlukan. Silakan masuk terlebih dahulu.");
  }

  const [dbUser] = await db
    .select({
      id: users.id,
      email: users.email,
      role: users.role,
      membershipStatus: users.membershipStatus,
      deletedAt: users.deletedAt,
    })
    .from(users)
    .where(eq(users.id, sessionUser.id))
    .limit(1);

  if (!dbUser) {
    throw new Error("Pengguna tidak ditemukan.");
  }
  if (dbUser.deletedAt || dbUser.membershipStatus === "deleted") {
    throw new Error("Akun telah dihapus.");
  }
  if (dbUser.membershipStatus === null) {
    throw new Error("Akun belum menukarkan undangan resmi. Silakan selesaikan onboarding.");
  }
  if (dbUser.membershipStatus === "suspended") {
    throw new Error("Akun Anda sedang ditangguhkan. Hubungi moderator komunitas.");
  }
  if (dbUser.membershipStatus !== "active") {
    throw new Error("Status keanggotaan tidak valid.");
  }

  return dbUser;
}

/**
 * In-transaction assertion for active membership status.
 */
export async function assertActiveMember(tx: any, userId: string) {
  const [dbUser] = await tx
    .select({
      id: users.id,
      email: users.email,
      role: users.role,
      membershipStatus: users.membershipStatus,
      deletedAt: users.deletedAt,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!dbUser) {
    throw new Error("Pengguna tidak ditemukan.");
  }
  if (dbUser.deletedAt || dbUser.membershipStatus === "deleted") {
    throw new Error("Akun telah dihapus.");
  }
  if (dbUser.membershipStatus === null) {
    throw new Error("Akun belum menukarkan undangan resmi. Silakan selesaikan onboarding.");
  }
  if (dbUser.membershipStatus === "suspended") {
    throw new Error("Akun Anda sedang ditangguhkan. Hubungi moderator komunitas.");
  }
  if (dbUser.membershipStatus !== "active") {
    throw new Error("Status keanggotaan tidak aktif.");
  }

  return dbUser;
}

/**
 * Require at least Moderator or Admin role with active membership
 */
export async function requireModerator(redirectTo: string = "/dashboard") {
  const user = await requireActiveMember();
  if (user.role !== "moderator" && user.role !== "admin") {
    throw new Error("Akses ditolak: Wewenang Moderator atau Administrator diperlukan.");
  }
  return user;
}

/**
 * Require Admin role with active membership
 */
export async function requireAdmin(redirectTo: string = "/dashboard") {
  const user = await requireActiveMember();
  if (user.role !== "admin") {
    throw new Error("Akses ditolak: Wewenang Administrator diperlukan.");
  }
  return user;
}

/**
 * Assert the Last-Active-Admin Invariant with dedicated transaction-level advisory locking
 */
export async function assertActiveAdminInvariant(
  tx: any,
  targetUserId: string,
  willRemoveActiveAdmin: boolean
) {
  // Acquire transaction-level advisory lock dedicated to Admin membership mutations
  await tx.execute(sql`SELECT pg_advisory_xact_lock(${ADMIN_MEMBERSHIP_ADVISORY_LOCK_KEY})`);

  if (!willRemoveActiveAdmin) return;

  // Query current count of ACTIVE Admins
  const [adminStats] = await tx
    .select({ count: sql<number>`count(*)::int` })
    .from(users)
    .where(and(eq(users.role, "admin"), eq(users.membershipStatus, "active")));

  // Query target user role and status
  const [target] = await tx
    .select({ role: users.role, membershipStatus: users.membershipStatus })
    .from(users)
    .where(eq(users.id, targetUserId));

  const isTargetActiveAdmin = target?.role === "admin" && target?.membershipStatus === "active";

  if (isTargetActiveAdmin && adminStats.count <= 1) {
    throw new Error("Operasi ditolak: Komunitas harus memiliki setidaknya satu Administrator aktif.");
  }
}

/**
 * Check if a user is an authorized challenge jury member
 */
export async function isChallengeJury(userId: string, challengeId: string): Promise<boolean> {
  const [assignment] = await db
    .select()
    .from(challengeJuryAssignments)
    .where(
      and(
        eq(challengeJuryAssignments.challengeId, challengeId),
        eq(challengeJuryAssignments.userId, userId)
      )
    )
    .limit(1);

  return Boolean(assignment);
}
