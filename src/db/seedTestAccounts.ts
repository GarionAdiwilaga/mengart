import { db } from "@/db";
import { users, profiles } from "@/db/schema";
import { eq } from "drizzle-orm";

const TEST_ACCOUNTS = [
  {
    email: "admin@mengart.local",
    username: "admin_atelier",
    googleId: "google_admin",
    role: "admin" as const,
    displayName: "Admin Atelier",
    slug: "admin-atelier",
    bio: "Head Administrator & Principal Curator di Mengart Atelier.",
    specialties: ["Curator", "Digital Art Direction", "Concept Art"],
    software: ["Photoshop", "Blender", "Clip Studio Paint"],
  },
  {
    email: "moderator@mengart.local",
    username: "mod_atelier",
    googleId: "google_moderator",
    role: "moderator" as const,
    displayName: "Komorebi Moderator",
    slug: "komorebi-mod",
    bio: "Community Moderator & Challenge Jury di Mengart Atelier.",
    specialties: ["Character Illustration", "Jury Panel"],
    software: ["Clip Studio Paint", "Procreate"],
  },
  {
    email: "member@mengart.local",
    username: "member_artist",
    googleId: "google_member",
    role: "member" as const,
    displayName: "Luna Valerius (Artist)",
    slug: "luna-valerius",
    bio: "Digital concept artist focusing on ethereal dark fantasy illustrations and challenge participant.",
    specialties: ["Character Illustration", "Concept Art", "Background Art"],
    software: ["Clip Studio Paint", "Photoshop"],
  },
];

async function seedTestAccounts() {
  console.log("--- Seeding Test Accounts for All Roles (Google OAuth / Gate D) ---");
  const now = new Date();

  for (const acc of TEST_ACCOUNTS) {
    // 1. Upsert User
    const [existingUser] = await db
      .select()
      .from(users)
      .where(eq(users.email, acc.email.toLowerCase()))
      .limit(1);

    let userId: string;

    if (existingUser) {
      console.log(`Updating existing user: ${acc.email} (Role: ${acc.role})`);
      await db
        .update(users)
        .set({
          username: acc.username,
          googleId: acc.googleId,
          role: acc.role,
          emailVerified: now,
          membershipStatus: "active",
          updatedAt: now,
        })
        .where(eq(users.id, existingUser.id));
      userId = existingUser.id;
    } else {
      console.log(`Creating user: ${acc.email} (Role: ${acc.role})`);
      const [newUser] = await db
        .insert(users)
        .values({
          email: acc.email.toLowerCase(),
          username: acc.username,
          googleId: acc.googleId,
          role: acc.role,
          emailVerified: now,
          membershipStatus: "active",
        })
        .returning();
      userId = newUser.id;
    }

    // 2. Upsert Profile
    const [existingProfile] = await db
      .select()
      .from(profiles)
      .where(eq(profiles.userId, userId))
      .limit(1);

    if (existingProfile) {
      await db
        .update(profiles)
        .set({
          displayName: acc.displayName,
          slug: acc.slug,
          bio: acc.bio,
          specialties: acc.specialties,
          software: acc.software,
          profileStatus: "active_public",
          updatedAt: now,
        })
        .where(eq(profiles.id, existingProfile.id));
    } else {
      await db.insert(profiles).values({
        userId,
        displayName: acc.displayName,
        slug: acc.slug,
        bio: acc.bio,
        specialties: acc.specialties,
        software: acc.software,
        profileStatus: "active_public",
      });
    }
  }

  console.log("--- Seeding Completed Successfully ---");
}

seedTestAccounts()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Seeding failed:", err);
    process.exit(1);
  });
