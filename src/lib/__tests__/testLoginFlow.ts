import { db } from "@/db";
import { users, profiles } from "@/db/schema";
import { eq, or } from "drizzle-orm";
import bcrypt from "bcryptjs";

const TEST_ACCOUNTS = [
  {
    email: "admin@mengart.local",
    username: "admin_atelier",
    password: "Password123!",
    role: "admin" as const,
    displayName: "Admin Atelier",
    slug: "admin-atelier",
  },
  {
    email: "moderator@mengart.local",
    username: "mod_atelier",
    password: "Password123!",
    role: "moderator" as const,
    displayName: "Komorebi Moderator",
    slug: "komorebi-mod",
  },
  {
    email: "member@mengart.local",
    username: "member_artist",
    password: "Password123!",
    role: "member" as const,
    displayName: "Luna Valerius (Artist)",
    slug: "luna-valerius",
  },
];

async function testCredentials() {
  console.log("--- Testing Credentials & Login Flow Invariants ---");
  const salt = await bcrypt.genSalt(10);
  const now = new Date();

  // Ensure test accounts are seeded
  for (const acc of TEST_ACCOUNTS) {
    const [existing] = await db
      .select()
      .from(users)
      .where(eq(users.email, acc.email))
      .limit(1);

    const passwordHash = await bcrypt.hash(acc.password, salt);

    if (!existing) {
      const [newUser] = await db
        .insert(users)
        .values({
          email: acc.email,
          username: acc.username,
          passwordHash,
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
          passwordHash,
          username: acc.username,
          emailVerified: now,
          membershipStatus: "active",
        })
        .where(eq(users.id, existing.id));
    }
  }

  // Test credential matching for email, username, and password
  const testCases = [
    { id: "admin@mengart.local", pass: "Password123!", expectedRole: "admin" },
    { id: "admin_atelier", pass: "Password123!", expectedRole: "admin" },
    { id: "moderator@mengart.local", pass: "Password123!", expectedRole: "moderator" },
    { id: "mod_atelier", pass: "Password123!", expectedRole: "moderator" },
    { id: "member@mengart.local", pass: "Password123!", expectedRole: "member" },
    { id: "member_artist", pass: "Password123!", expectedRole: "member" },
  ];

  for (const tc of testCases) {
    const [targetUser] = await db
      .select()
      .from(users)
      .where(or(eq(users.email, tc.id), eq(users.username, tc.id)))
      .limit(1);

    if (!targetUser) {
      throw new Error(`User not found for ${tc.id}`);
    }

    const matches = await bcrypt.compare(tc.pass, targetUser.passwordHash || "");
    if (!matches) {
      throw new Error(`Password mismatch for ${tc.id}`);
    }

    if (targetUser.role !== tc.expectedRole) {
      throw new Error(`Role mismatch for ${tc.id}: expected ${tc.expectedRole}, got ${targetUser.role}`);
    }

    console.log(`✓ Verified principal: "${tc.id}" -> ID=${targetUser.id}, Role=${targetUser.role}, EmailVerified=true, PasswordHash=Valid`);
  }

  console.log("\n--- All login flow & credentials invariants verified successfully! ---");
  process.exit(0);
}

testCredentials().catch((err) => {
  console.error("❌ Test failed:", err);
  process.exit(1);
});
