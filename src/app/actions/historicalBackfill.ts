"use server";

import { requireModerator } from "@/lib/rbac";
import { db } from "@/db";
import {
  importHistoricalChallengeService,
  type HistoricalChallengeInput,
  type HistoricalEntryInput,
} from "@/lib/services/historicalBackfillService";

export type { HistoricalChallengeInput, HistoricalEntryInput };

/**
 * Server Action for importing historical challenges into the Hall of Fame.
 * Strictly checks moderator authorization at the request boundary.
 * Does NOT accept caller-controlled actor overrides.
 */
export async function importHistoricalChallengeAction(
  data: HistoricalChallengeInput
) {
  const actor = await requireModerator();
  return await importHistoricalChallengeService(db, actor, data);
}
