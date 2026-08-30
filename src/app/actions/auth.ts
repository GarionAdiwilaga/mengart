"use server";

import { db } from "@/db";
import { getCurrentUser } from "@/lib/rbac";
import { extractInviteToken, redeemInviteService } from "@/lib/invites";
import { signOut } from "@/auth";

/**
 * Redeem an invitation code during onboarding for an authenticated Google user
 */
export async function redeemOnboardingInviteAction(formData: FormData) {
  const sessionUser = await getCurrentUser();
  if (!sessionUser || !sessionUser.id) {
    return { success: false, error: "Sesi login tidak ditemukan. Silakan masuk dengan Google terlebih dahulu." };
  }

  const rawInput = (formData.get("inviteCode") as string) || (formData.get("inviteInput") as string) || "";
  const rawToken = extractInviteToken(rawInput);

  if (!rawToken) {
    return { success: false, error: "Kode atau tautan undangan wajib diisi." };
  }

  const displayName = ((formData.get("displayName") as string) || "").trim();

  try {
    const result = await redeemInviteService(db, {
      userId: sessionUser.id,
      rawToken,
      displayName: displayName || sessionUser.name || undefined,
      avatarUrl: sessionUser.image || undefined,
    });

    return {
      success: true,
      isAlreadyActive: result.isAlreadyActive,
      redirectUrl: "/dashboard",
    };
  } catch (error: any) {
    return {
      success: false,
      error: error?.message || "Gagal memproses penukaran undangan.",
    };
  }
}

/**
 * Handle sign out
 */
export async function logoutAction() {
  await signOut({ redirectTo: "/login" });
}
