import NextAuth, { type DefaultSession } from "next-auth";
import Google from "next-auth/providers/google";
import { db } from "@/db";
import { users, profiles } from "@/db/schema";
import { eq } from "drizzle-orm";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: "member" | "moderator" | "admin";
      membershipStatus: "active" | "suspended" | "deleted" | null;
      profileId?: string;
      profileSlug?: string;
      profileStatus?: string;
    } & DefaultSession["user"];
  }

  interface User {
    id?: string;
    role?: "member" | "moderator" | "admin";
    membershipStatus?: "active" | "suspended" | "deleted" | null;
    profileId?: string;
    profileSlug?: string;
    profileStatus?: string;
  }
}

/**
 * Authoritative production helper for Google OAuth identity resolution (Blueprint 2.2.2)
 */
export async function resolveGoogleSignInIdentity({
  profile,
  account,
  rawEmail,
}: {
  profile?: any;
  account?: any;
  rawEmail?: string;
}): Promise<{ success: boolean; error?: string; userId?: string }> {
  // 1. Literal email_verified === true assertion (reject false, undefined, null, missing claim)
  if (!profile || profile.email_verified !== true) {
    return { success: false, error: "EmailUnverified" };
  }

  const emailStr = rawEmail || (profile?.email as string) || "";
  if (!emailStr || emailStr.trim().length === 0) {
    return { success: false, error: "EmailRequired" };
  }
  const normalizedEmail = emailStr.trim().toLowerCase();
  const googleId = account?.providerAccountId || (profile?.sub as string);

  // 2. Lookup by google_id
  let userByGoogleId = null;
  if (googleId) {
    const [found] = await db
      .select()
      .from(users)
      .where(eq(users.googleId, googleId))
      .limit(1);
    userByGoogleId = found || null;
  }

  // 3. Lookup by normalized email
  const [userByEmail] = await db
    .select()
    .from(users)
    .where(eq(users.email, normalizedEmail))
    .limit(1);

  // 4. Collision check: if google_id and email resolve to different accounts
  if (userByGoogleId && userByEmail && userByGoogleId.id !== userByEmail.id) {
    return { success: false, error: "AccountCollision" };
  }

  if (userByGoogleId) {
    if (userByGoogleId.email.toLowerCase() !== normalizedEmail) {
      return { success: false, error: "AccountCollision" };
    }
    if (userByGoogleId.membershipStatus === "deleted" || userByGoogleId.deletedAt) {
      return { success: false, error: "AccountDeleted" };
    }
    return { success: true, userId: userByGoogleId.id };
  }

  if (userByEmail) {
    if (userByEmail.googleId && userByEmail.googleId !== googleId) {
      return { success: false, error: "AccountCollision" };
    }
    if (userByEmail.membershipStatus === "deleted" || userByEmail.deletedAt) {
      return { success: false, error: "AccountDeleted" };
    }
    if (!userByEmail.googleId && googleId) {
      await db
        .update(users)
        .set({
          googleId,
          emailVerified: userByEmail.emailVerified || new Date(),
          updatedAt: new Date(),
        })
        .where(eq(users.id, userByEmail.id));
    }
    return { success: true, userId: userByEmail.id };
  }

  // 5. New visitor: create onboarding account with membership_status = NULL (PENDING_INVITE)
  const [newUser] = await db
    .insert(users)
    .values({
      email: normalizedEmail,
      googleId: googleId || null,
      emailVerified: new Date(),
      role: "member",
      membershipStatus: null,
    })
    .returning();

  return { success: true, userId: newUser.id };
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID || "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
    }),
  ],
  session: {
    strategy: "jwt",
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  callbacks: {
    async signIn({ user, account, profile }) {
      if (account?.provider === "google") {
        const res = await resolveGoogleSignInIdentity({
          profile,
          account,
          rawEmail: user.email || (profile?.email as string),
        });
        if (!res.success) {
          return `/login?error=${res.error}`;
        }
        return true;
      }
      return false;
    },

    async jwt({ token, user, account, trigger, session }) {
      if (token.email) {
        const normalizedEmail = token.email.trim().toLowerCase();
        // Fetch current user and profile data from DB
        const [dbUser] = await db
          .select({
            id: users.id,
            role: users.role,
            membershipStatus: users.membershipStatus,
            profileId: profiles.id,
            profileSlug: profiles.slug,
            profileStatus: profiles.profileStatus,
          })
          .from(users)
          .leftJoin(profiles, eq(profiles.userId, users.id))
          .where(eq(users.email, normalizedEmail))
          .limit(1);

        if (dbUser) {
          token.userId = dbUser.id;
          token.role = dbUser.role;
          token.membershipStatus = dbUser.membershipStatus ?? null;
          token.profileId = dbUser.profileId;
          token.profileSlug = dbUser.profileSlug;
          token.profileStatus = dbUser.profileStatus;
        }
      }

      return token;
    },

    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.userId as string;
        session.user.role = (token.role as "member" | "moderator" | "admin") || "member";
        session.user.membershipStatus =
          (token.membershipStatus as "active" | "suspended" | "deleted" | null) ?? null;
        session.user.profileId = token.profileId as string | undefined;
        session.user.profileSlug = token.profileSlug as string | undefined;
        session.user.profileStatus = token.profileStatus as string | undefined;
      }
      return session;
    },
  },
});
