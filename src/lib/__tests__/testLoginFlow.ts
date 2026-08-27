import { db } from "@/db";
import { users } from "@/db/schema";
import { eq, or } from "drizzle-orm";
import bcrypt from "bcryptjs";

async function testCredentials() {
  console.log("--- Testing Credentials Database Records ---");
  const accounts = [
    { id: "admin@mengart.local", pass: "Password123!" },
    { id: "admin_atelier", pass: "Password123!" },
    { id: "moderator@mengart.local", pass: "Password123!" },
    { id: "member@mengart.local", pass: "Password123!" },
  ];

  for (const acc of accounts) {
    const [targetUser] = await db
      .select()
      .from(users)
      .where(or(eq(users.email, acc.id), eq(users.username, acc.id)))
      .limit(1);

    if (!targetUser) {
      console.error(`❌ User not found for ${acc.id}`);
      continue;
    }

    const matches = await bcrypt.compare(acc.pass, targetUser.passwordHash || "");
    console.log(`✓ User ${acc.id} (${targetUser.email}) -> Role: ${targetUser.role}, Verified: ${!!targetUser.emailVerified}, Password Match: ${matches}`);
    if (!matches) {
      throw new Error(`Password mismatch for ${acc.id}`);
    }
  }

  console.log("\n--- All seeded accounts verified successfully! ---");
  process.exit(0);
}

testCredentials().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
