import NextAuth, { type DefaultSession } from "next-auth";
import Google from "next-auth/providers/google";
import { db } from "@/db";
import { users, profiles } from "@/db/schema";
import { eq, or } from "drizzle-orm";

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
        // Enforce verified email from Google OAuth profile
        if (profile && (profile as any).email_verified === false) {
          return "/login?error=EmailUnverified";
        }

        const rawEmail = user.email || (profile?.email as string) || "";
        if (!rawEmail) return "/login?error=EmailRequired";
        const normalizedEmail = rawEmail.trim().toLowerCase();
        const googleId = account.providerAccountId || (profile?.sub as string);

        // 1. Lookup by google_id
        let userByGoogleId = null;
        if (googleId) {
          const [found] = await db
            .select()
            .from(users)
            .where(eq(users.googleId, googleId))
            .limit(1);
          userByGoogleId = found || null;
        }

        // 2. Lookup by normalized email
        const [userByEmail] = await db
          .select()
          .from(users)
          .where(eq(users.email, normalizedEmail))
          .limit(1);

        // 3. Collision check: if google_id and email resolve to different accounts
        if (userByGoogleId && userByEmail && userByGoogleId.id !== userByEmail.id) {
          return "/login?error=AccountCollision";
        }

        if (userByGoogleId) {
          // Verify email matches or reject collision
          if (userByGoogleId.email.toLowerCase() !== normalizedEmail) {
            return "/login?error=AccountCollision";
          }
          if (userByGoogleId.membershipStatus === "deleted" || userByGoogleId.deletedAt) {
            return "/login?error=AccountDeleted";
          }
          // Account recognized
          return true;
        }

        if (userByEmail) {
          // If existing account has a different non-null google_id -> reject
          if (userByEmail.googleId && userByEmail.googleId !== googleId) {
            return "/login?error=AccountCollision";
          }
          if (userByEmail.membershipStatus === "deleted" || userByEmail.deletedAt) {
            return "/login?error=AccountDeleted";
          }
          // Legacy account with null google_id: bind verified google_id
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
          return true;
        }

        // 4. New visitor: create onboarding account with membership_status = NULL (PENDING_INVITE)
        await db.insert(users).values({
          email: normalizedEmail,
          googleId: googleId || null,
          emailVerified: new Date(),
          role: "member",
          membershipStatus: null,
        });

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
