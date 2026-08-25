import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { redeemInviteAndCreateMember } from "@/lib/invites";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const token = searchParams.get("token");
  const name = searchParams.get("name") || "Artist";

  const session = await auth();

  if (!session?.user?.email) {
    return NextResponse.redirect(new URL("/login?error=OAuthFailed", request.url));
  }

  // Check if user already exists
  const [existingUser] = await db
    .select()
    .from(users)
    .where(eq(users.email, session.user.email.toLowerCase()))
    .limit(1);

  if (existingUser) {
    // User already exists, redirect straight to dashboard
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  if (!token) {
    return NextResponse.redirect(new URL("/login?error=InviteRequired", request.url));
  }

  try {
    const clientIp =
      request.headers.get("cf-connecting-ip") ||
      request.headers.get("x-forwarded-for")?.split(",")[0] ||
      "127.0.0.1";
    const userAgent = request.headers.get("user-agent") || undefined;

    await redeemInviteAndCreateMember({
      rawToken: token,
      email: session.user.email,
      displayName: name,
      avatarUrl: session.user.image || undefined,
      ipAddress: clientIp,
      userAgent,
    });

    return NextResponse.redirect(new URL("/dashboard", request.url));
  } catch (err: any) {
    console.error("Failed to redeem invite during callback:", err);
    return NextResponse.redirect(
      new URL(`/invite/${encodeURIComponent(token)}?error=RedemptionFailed`, request.url)
    );
  }
}
