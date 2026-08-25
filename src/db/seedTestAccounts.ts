import { db } from "@/db";
import { users, profiles } from "@/db/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";

const TEST_ACCOUNTS = [
  {
    email: "admin@mengart.local",
    username: "admin_atelier",
    password: "Password123!",
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
    password: "Password123!",
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
    password: "Password123!",
    role: "member" as const,
    displayName: "Luna Valerius (Artist)",
    slug: "luna-valerius",
    bio: "Digital concept artist focusing on ethereal dark fantasy illustrations and challenge participant.",
    specialties: ["Character Illustration", "Concept Art", "Background Art"],
    software: ["Clip Studio Paint", "Photoshop"],
  },
];

async function seedTestAccounts() {
  console.log("--- Seeding Test Accounts for All Roles ---");
  const salt = await bcrypt.genSalt(10);
  const now = new Date();

  for (const acc of TEST_ACCOUNTS) {
    const passwordHash = await bcrypt.hash(acc.password, salt);

    // 1. Upsert User
    const [existingUser] = await db
      .select()
      .from(users)
      .where(eq(users.email, acc.email))
      .limit(1);

    let userId: string;

    if (existingUser) {
      console.log(`Updating existing user: ${acc.email} (Role: ${acc.role})`);
      await db
        .update(users)
        .set({
          username: acc.username,
          passwordHash,
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
          email: acc.email,
          username: acc.username,
          passwordHash,
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
          bio: acc.bio,
          specialties: acc.specialties,
          software: acc.software,
          commissionStatus: "open",
          profileStatus: "active_public",
          updatedAt: now,
        })
        .where(eq(profiles.id, existingProfile.id));
    } else {
      await db.insert(profiles).values({
        userId,
        slug: acc.slug,
        displayName: acc.displayName,
        bio: acc.bio,
        specialties: acc.specialties,
        software: acc.software,
        commissionStatus: "open",
        profileStatus: "active_public",
      });
    }

    console.log(`✓ Account Ready: [${acc.role.toUpperCase()}] ${acc.email} / ${acc.username}`);
  }

  console.log("\n--- All Test Accounts Seeded Successfully! ---");
  process.exit(0);
}

seedTestAccounts().catch((err) => {
  console.error("❌ Seeding failed:", err);
  process.exit(1);
});
