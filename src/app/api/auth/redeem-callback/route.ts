import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { redeemInviteService } from "@/lib/invites";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function handleRedeemCallback(
  request: NextRequest,
  sessionUserOverride?: { id: string; email?: string; name?: string; image?: string; role?: string; membershipStatus?: string | null }
) {
  let sessionUser = sessionUserOverride;
  if (!sessionUser) {
    try {
      const session = await auth();
      sessionUser = session?.user as any;
    } catch {
      sessionUser = undefined;
    }
  }

  if (!sessionUser || !sessionUser.id) {
    const response = NextResponse.redirect(new URL("/login?error=AuthRequired", request.url));
    response.cookies.delete("mengart_pending_invite");
    return response;
  }

  const clientIp =
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0] ||
    "127.0.0.1";
  const userAgent = request.headers.get("user-agent") || undefined;

  // 1. Refresh live user record from DB
  const [dbUser] = await db
    .select({
      id: users.id,
      membershipStatus: users.membershipStatus,
      deletedAt: users.deletedAt,
    })
    .from(users)
    .where(eq(users.id, sessionUser.id))
    .limit(1);

  if (!dbUser || dbUser.deletedAt || dbUser.membershipStatus === "deleted") {
    const response = NextResponse.redirect(new URL("/login?error=AccountDeleted", request.url));
    response.cookies.delete("mengart_pending_invite");
    return response;
  }

  if (dbUser.membershipStatus === "suspended") {
    const response = NextResponse.redirect(new URL("/dashboard?error=AccountSuspended", request.url));
    response.cookies.delete("mengart_pending_invite");
    return response;
  }

  if (dbUser.membershipStatus === "active") {
    // Already an active member: pass through to dashboard without consuming invite
    const response = NextResponse.redirect(new URL("/dashboard", request.url));
    response.cookies.delete("mengart_pending_invite");
    return response;
  }

  // 2. User is in PENDING_INVITE state (membershipStatus === null)
  // Read pending invite code strictly from HttpOnly cookie (NO searchParams fallback per Blueprint 2.2.2)
  const pendingCode = request.cookies.get("mengart_pending_invite")?.value;

  if (!pendingCode || pendingCode.trim().length === 0) {
    // No invite provided: navigate to onboarding to enter invite code manually
    const response = NextResponse.redirect(new URL("/onboarding", request.url));
    response.cookies.delete("mengart_pending_invite");
    return response;
  }

  try {
    const result = await redeemInviteService(db, {
      userId: sessionUser.id,
      code: pendingCode.trim(),
      displayName: sessionUser.name || undefined,
      avatarUrl: sessionUser.image || undefined,
      ipAddress: clientIp,
      userAgent,
    });

    const targetUrl = new URL("/dashboard", request.url);
    if (result.isAlreadyActive) {
      targetUrl.searchParams.set("notice", "already_active");
    } else {
      targetUrl.searchParams.set("welcome", "member");
    }

    const response = NextResponse.redirect(targetUrl);
    response.cookies.delete("mengart_pending_invite");
    return response;
  } catch (error: any) {
    const targetUrl = new URL("/onboarding", request.url);
    targetUrl.searchParams.set("error", error?.message || "Gagal mengaktifkan undangan.");

    const response = NextResponse.redirect(targetUrl);
    response.cookies.delete("mengart_pending_invite");
    return response;
  }
}

export async function GET(request: NextRequest) {
  return handleRedeemCallback(request);
}
