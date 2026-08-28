import { NextResponse } from "next/server";
import { db } from "@/db";
import { materializeScheduledTransitionsService } from "@/lib/services/challengeService";

/**
 * Production Cron Endpoint: Materialize Scheduled Challenge Status Transitions
 * Accessible via Vercel Cron, external cloud schedulers, crontab, or Cloudflare Workers.
 * Protected by CRON_SECRET bearer token.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const cronHeader = request.headers.get("x-cron-secret");
  const expectedSecret = process.env.CRON_SECRET;

  // In production, enforce secret if configured
  if (expectedSecret) {
    const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.substring(7) : null;
    if (bearerToken !== expectedSecret && cronHeader !== expectedSecret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const now = new Date();
    const result = await materializeScheduledTransitionsService(db, now);

    return NextResponse.json({
      ok: true,
      timestamp: now.toISOString(),
      processedCount: result.processedCount,
      transitions: result.transitions,
    });
  } catch (error: any) {
    console.error("[CRON_MATERIALIZE_ERROR]", error);
    return NextResponse.json(
      { ok: false, error: error.message || "Failed to materialize scheduled transitions" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  return GET(request);
}
