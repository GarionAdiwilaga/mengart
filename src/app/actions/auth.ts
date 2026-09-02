"use server";

import { cookies, headers } from "next/headers";
import { db } from "@/db";
import { getCurrentUser } from "@/lib/rbac";
import { extractInviteCode, validateInviteCode, redeemInviteService } from "@/lib/invites";
import { signOut } from "@/auth";
import { checkRateLimit, getClientIpFromHeaders } from "@/lib/rateLimit";

/**
 * Server Action called before Google OAuth redirect to set the HttpOnly pending invite cookie
 */
export async function initiateInviteGoogleLoginAction(rawInput: string) {
  const headerList = await headers();
  const clientIp = getClientIpFromHeaders(headerList);

  // Rate Limiting by IP (Security-Critical, Fail-Closed)
  const rl = await checkRateLimit(`invite_login:${clientIp}`, {
    limit: 10,
    windowSeconds: 60,
    criticality: "fail_closed",
  });
  if (!rl.success) {
    return { success: false, error: "Terlalu banyak percobaan masuk undangan. Harap tunggu beberapa saat." };
  }

  const cleanCode = extractInviteCode(rawInput);
  if (!cleanCode) {
    return { success: false, error: "Kode undangan wajib diisi." };
  }

  const validation = await validateInviteCode(cleanCode);
  if (!validation.isValid) {
    if (validation.reason === "revoked") {
      return { success: false, error: "Undangan ini telah dicabut oleh administrator." };
    }
    if (validation.reason === "expired") {
      return { success: false, error: "Undangan ini telah kedaluwarsa." };
    }
    if (validation.reason === "exhausted") {
      return { success: false, error: "Batas penggunaan undangan ini telah habis." };
    }
    return { success: false, error: "Undangan tidak valid atau tidak ditemukan." };
  }

  const cookieStore = await cookies();
  cookieStore.set("mengart_pending_invite", cleanCode, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 900, // 15 minutes
  });

  return { success: true };
}

/**
 * Redeem an invitation code during onboarding for an authenticated Google user
 */
export async function redeemOnboardingInviteAction(formData: FormData) {
  const sessionUser = await getCurrentUser();
  if (!sessionUser || !sessionUser.id) {
    return { success: false, error: "Sesi login tidak ditemukan. Silakan masuk dengan Google terlebih dahulu." };
  }

  // Rate Limiting by User (Security-Critical, Fail-Closed)
  const rl = await checkRateLimit(`onboarding_redeem:${sessionUser.id}`, {
    limit: 5,
    windowSeconds: 60,
    criticality: "fail_closed",
  });
  if (!rl.success) {
    return { success: false, error: "Terlalu banyak percobaan penukaran undangan. Harap tunggu beberapa saat." };
  }

  const rawInput = (formData.get("inviteCode") as string) || (formData.get("inviteInput") as string) || "";
  const cleanCode = extractInviteCode(rawInput);

  if (!cleanCode) {
    return { success: false, error: "Kode atau tautan undangan wajib diisi." };
  }

  const displayName = ((formData.get("displayName") as string) || "").trim();

  try {
    const result = await redeemInviteService(db, {
      userId: sessionUser.id,
      code: cleanCode,
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
