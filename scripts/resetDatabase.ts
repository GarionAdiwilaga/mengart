import postgres from "postgres";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

const dbUrl = process.env.DATABASE_URL || "postgres://mengart:mengart_dev_pass@localhost:5432/mengart_db";

async function main() {
  console.log("Resetting non-production development database...");
  const client = postgres(dbUrl, { max: 1 });
  
  await client.unsafe(`
    DROP SCHEMA IF EXISTS public CASCADE;
    CREATE SCHEMA public;
    GRANT ALL ON SCHEMA public TO public;
    DROP SCHEMA IF EXISTS drizzle CASCADE;
  `);
  
  await client.end();
  console.log("✓ Non-production development database schema reset successfully.");
}

main().catch((err) => {
  console.error("Failed to reset database:", err);
  process.exit(1);
});
