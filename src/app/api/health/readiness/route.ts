import { NextResponse } from "next/server";
import { db } from "@/db";
import { sql } from "drizzle-orm";
import { Redis } from "ioredis";

export async function GET() {
  let dbHealthy = false;
  let redisHealthy = false;

  // 1. Check PostgreSQL Database Ping
  try {
    const [result] = await db.execute(sql`SELECT 1 as ping`);
    if (result && (result as any).ping === 1) {
      dbHealthy = true;
    }
  } catch (err) {
    console.error("Health probe database error:", err);
  }

  // 2. Check Redis Ping
  if (process.env.REDIS_URL) {
    try {
      const redis = new Redis(process.env.REDIS_URL, {
        maxRetriesPerRequest: 1,
        connectTimeout: 2000,
        lazyConnect: true,
      });
      await redis.connect();
      const pingRes = await redis.ping();
      if (pingRes === "PONG") {
        redisHealthy = true;
      }
      redis.disconnect();
    } catch (err) {
      console.error("Health probe Redis error:", err);
    }
  } else {
    // If running in development without REDIS_URL configured
    redisHealthy = true;
  }

  const isReady = dbHealthy && redisHealthy;

  return NextResponse.json(
    {
      status: isReady ? "ready" : "degraded",
      timestamp: new Date().toISOString(),
    },
    {
      status: isReady ? 200 : 503,
      headers: {
        "Cache-Control": "no-cache, no-store, must-revalidate",
      },
    }
  );
}
