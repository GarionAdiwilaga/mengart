import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { sql } from "drizzle-orm";
import { mediaQueue } from "@/lib/queue";
import os from "os";

import { requireAdmin } from "@/lib/rbac";

export async function GET() {
  try {
    await requireAdmin();
  } catch {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const startTime = Date.now();

  // Database Latency & Version Check
  let dbStatus = "unknown";
  let dbLatencyMs = 0;
  try {
    const pingStart = Date.now();
    await db.execute(sql`SELECT 1`);
    dbLatencyMs = Date.now() - pingStart;
    dbStatus = "healthy";
  } catch (err: any) {
    dbStatus = `error: ${err.message}`;
  }

  // Media Queue Depth
  let queueStatus = "disabled";
  let waitingJobs = 0;
  let activeJobs = 0;
  let failedJobs = 0;
  if (mediaQueue) {
    try {
      waitingJobs = await mediaQueue.getWaitingCount();
      activeJobs = await mediaQueue.getActiveCount();
      failedJobs = await mediaQueue.getFailedCount();
      queueStatus = "active";
    } catch (qErr: any) {
      queueStatus = `error: ${qErr.message}`;
    }
  }

  return NextResponse.json(
    {
      environment: process.env.NODE_ENV,
      serverTime: new Date().toISOString(),
      uptimeSeconds: Math.round(process.uptime()),
      system: {
        platform: process.platform,
        nodeVersion: process.version,
        cpuCount: os.cpus().length,
        freeMemoryMb: Math.round(os.freemem() / (1024 * 1024)),
        totalMemoryMb: Math.round(os.totalmem() / (1024 * 1024)),
      },
      database: {
        status: dbStatus,
        latencyMs: dbLatencyMs,
      },
      mediaQueue: {
        status: queueStatus,
        waiting: waitingJobs,
        active: activeJobs,
        failed: failedJobs,
      },
      diagnosticsExecutionTimeMs: Date.now() - startTime,
    },
    {
      headers: {
        "Cache-Control": "private, no-cache, no-store, must-revalidate",
      },
    }
  );
}
