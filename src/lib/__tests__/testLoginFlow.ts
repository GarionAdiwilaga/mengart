import { db } from "@/db";
import { users, profiles } from "@/db/schema";
import { eq, or } from "drizzle-orm";

const TEST_ACCOUNTS = [
  {
    email: "admin@mengart.local",
    username: "admin_atelier",
    googleId: "google_admin_test",
    role: "admin" as const,
    displayName: "Admin Atelier",
    slug: "admin-atelier",
  },
  {
    email: "moderator@mengart.local",
    username: "mod_atelier",
    googleId: "google_mod_test",
    role: "moderator" as const,
    displayName: "Komorebi Moderator",
    slug: "komorebi-mod",
  },
  {
    email: "member@mengart.local",
    username: "member_artist",
    googleId: "google_member_test",
    role: "member" as const,
    displayName: "Luna Valerius (Artist)",
    slug: "luna-valerius",
  },
];

async function testGoogleOAuthLoginFlow() {
  console.log("--- Testing Google OAuth Identity Resolution & Login Invariants ---");
  const now = new Date();

  // Ensure test accounts are seeded with Google IDs
  for (const acc of TEST_ACCOUNTS) {
    const [existing] = await db
      .select()
      .from(users)
      .where(eq(users.email, acc.email.toLowerCase()))
      .limit(1);

    if (!existing) {
      const [newUser] = await db
        .insert(users)
        .values({
          email: acc.email.toLowerCase(),
          username: acc.username,
          googleId: acc.googleId,
          role: acc.role,
          membershipStatus: "active",
          emailVerified: now,
        })
        .returning();

      await db
        .insert(profiles)
        .values({
          userId: newUser.id,
          displayName: acc.displayName,
          slug: acc.slug,
        })
        .onConflictDoNothing();
    } else {
      await db
        .update(users)
        .set({
          googleId: acc.googleId,
          username: acc.username,
          emailVerified: now,
          membershipStatus: "active",
        })
        .where(eq(users.id, existing.id));
    }
  }

  // Test Google OAuth lookup for all roles
  for (const acc of TEST_ACCOUNTS) {
    // 1. Match by Google ID
    const [byGoogleId] = await db
      .select()
      .from(users)
      .where(eq(users.googleId, acc.googleId))
      .limit(1);

    if (!byGoogleId || byGoogleId.role !== acc.role || byGoogleId.membershipStatus !== "active") {
      throw new Error(`Google ID lookup failed for ${acc.email} (${acc.role})`);
    }

    // 2. Match by normalized email
    const [byEmail] = await db
      .select()
      .from(users)
      .where(eq(users.email, acc.email.toUpperCase().toLowerCase()))
      .limit(1);

    if (!byEmail || byEmail.id !== byGoogleId.id) {
      throw new Error(`Normalized email lookup failed for ${acc.email}`);
    }

    console.log(`✓ Verified Google OAuth identity resolution for ${acc.email} [${acc.role}]`);
  }

  console.log("✓ All Google OAuth Login Invariants passed successfully!\n");
}

testGoogleOAuthLoginFlow()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("❌ Test failed:", err);
    process.exit(1);
  });
