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
      membershipStatus: "active" | "suspended" | "revoked";
      profileId?: string;
      profileSlug?: string;
      profileStatus?: string;
    } & DefaultSession["user"];
  }

  interface User {
    id?: string;
    role?: "member" | "moderator" | "admin";
    membershipStatus?: "active" | "suspended" | "revoked";
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
      if (!user.email) return false;

      // Check if user already exists in database
      const [existingUser] = await db
        .select()
        .from(users)
        .where(
          or(
            eq(users.email, user.email.toLowerCase()),
            account?.providerAccountId
              ? eq(users.googleId, account.providerAccountId)
              : undefined
          )
        )
        .limit(1);

      if (!existingUser) {
        // First time visitor without invite redemption is disallowed on direct login
        return "/login?error=InviteRequired";
      }

      // Check if user is suspended or revoked
      if (existingUser.membershipStatus !== "active") {
        return `/login?error=Account${existingUser.membershipStatus}`;
      }

      // Link googleId if missing
      if (account?.providerAccountId && !existingUser.googleId) {
        await db
          .update(users)
          .set({ googleId: account.providerAccountId })
          .where(eq(users.id, existingUser.id));
      }

      return true;
    },

    async jwt({ token, user, account, trigger, session }) {
      if (token.email) {
        // Fetch current user and profile data
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
          .where(eq(users.email, token.email.toLowerCase()))
          .limit(1);

        if (dbUser) {
          token.userId = dbUser.id;
          token.role = dbUser.role;
          token.membershipStatus = dbUser.membershipStatus;
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
          (token.membershipStatus as "active" | "suspended" | "revoked") || "active";
        session.user.profileId = token.profileId as string | undefined;
        session.user.profileSlug = token.profileSlug as string | undefined;
        session.user.profileStatus = token.profileStatus as string | undefined;
      }
      return session;
    },
  },
});
