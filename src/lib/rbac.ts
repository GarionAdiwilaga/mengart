import { auth } from "@/auth";
import { redirect } from "next/navigation";

export type Role = "member" | "moderator" | "admin";

/**
 * Get current authenticated user session or null
 */
export async function getCurrentUser() {
  const session = await auth();
  if (!session?.user || !session.user.id) return null;
  return session.user;
}

/**
 * Require active authenticated member session
 */
export async function requireAuth(redirectTo: string = "/login") {
  const user = await getCurrentUser();
  if (!user) {
    redirect(`${redirectTo}?error=AuthRequired`);
  }
  if (user.membershipStatus !== "active") {
    redirect(`/login?error=Account${user.membershipStatus}`);
  }
  return user;
}

/**
 * Require at least Moderator or Admin role
 */
export async function requireModerator(redirectTo: string = "/dashboard") {
  const user = await requireAuth();
  if (user.role !== "moderator" && user.role !== "admin") {
    redirect(`${redirectTo}?error=Unauthorized`);
  }
  return user;
}

/**
 * Require Admin role
 */
export async function requireAdmin(redirectTo: string = "/dashboard") {
  const user = await requireAuth();
  if (user.role !== "admin") {
    redirect(`${redirectTo}?error=Unauthorized`);
  }
  return user;
}

/**
 * Check if a user is an authorized challenge jury member
 */
export async function isChallengeJury(userId: string, challengeId: string): Promise<boolean> {
  // Will query challenge_judges table in Phase 3
  return false;
}
