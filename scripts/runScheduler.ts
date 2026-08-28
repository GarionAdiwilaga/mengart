import { db } from "@/db";
import { materializeScheduledTransitionsService } from "@/lib/services/challengeService";

/**
 * CLI runner for Challenge Lifecycle Materializer.
 * Can be run via systemd timer, cron job, or container background loop:
 *   npm run cron:materialize
 */
async function main() {
  const now = new Date();
  console.log(`[${now.toISOString()}] Executing scheduled challenge transition materializer...`);
  
  const result = await materializeScheduledTransitionsService(db, now);
  
  if (result.processedCount === 0) {
    console.log(`[${now.toISOString()}] No scheduled challenges required state materialization.`);
  } else {
    console.log(`[${now.toISOString()}] Materialized ${result.processedCount} challenge transitions:`);
    for (const t of result.transitions) {
      console.log(`  - Challenge ${t.challengeId}: ${t.from} -> ${t.to}`);
    }
  }
  process.exit(0);
}

main().catch((err) => {
  console.error("Scheduler execution failed:", err);
  process.exit(1);
});
