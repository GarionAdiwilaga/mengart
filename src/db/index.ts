import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as dotenv from "dotenv";
import * as schema from "./schema/index";

dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

const connectionString =
  process.env.DATABASE_URL || "postgres://mengart:mengart_dev_pass@localhost:5433/mengart_db";

// Global connection client for Next.js hot reload safety
const globalForDb = globalThis as unknown as {
  conn: postgres.Sql | undefined;
};

const conn = globalForDb.conn ?? postgres(connectionString);
if (process.env.NODE_ENV !== "production") globalForDb.conn = conn;

export const client = conn;
export const db = drizzle(conn, { schema });
