import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { redeemInviteService } from "@/lib/invites";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function GET(request: NextRequest) {
  const session = await auth();

  if (!session?.user || !session.user.id) {
    return NextResponse.redirect(new URL("/login?error=AuthRequired", request.url));
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
    .where(eq(users.id, session.user.id))
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

  // User is in PENDING_INVITE state (membershipStatus === null)
  // Read pending invite token from HttpOnly cookie or query param fallback
  const searchParams = request.nextUrl.searchParams;
  const cookieToken = request.cookies.get("mengart_pending_invite")?.value;
  const queryToken = searchParams.get("token");
  const rawToken = cookieToken || queryToken;

  if (!rawToken) {
    // No invite provided: navigate to onboarding to enter invite code
    return NextResponse.redirect(new URL("/onboarding", request.url));
  }

  try {
    await redeemInviteService(db, {
      userId: session.user.id,
      rawToken,
      displayName: session.user.name || undefined,
      avatarUrl: session.user.image || undefined,
      ipAddress: clientIp,
      userAgent,
    });

    const response = NextResponse.redirect(new URL("/dashboard", request.url));
    response.cookies.delete("mengart_pending_invite");
    return response;
  } catch (err: any) {
    console.error("Failed to redeem invite during OAuth continuation:", err);
    const response = NextResponse.redirect(
      new URL(`/onboarding?error=${encodeURIComponent(err?.message || "InvalidInvite")}`, request.url)
    );
    response.cookies.delete("mengart_pending_invite");
    return response;
  }
}
