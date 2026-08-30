"use server";

import { requireAuth, requireModerator } from "@/lib/rbac";
import { db } from "@/db";
import {
  reports,
  artworks,
  users,
  monthlySpotlights,
  auditLogs,
  activityLogs,
} from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { resolveReportService } from "@/lib/services/moderationService";

export async function createReportAction(formData: FormData) {
  const user = await requireAuth("/login");

  const targetType = formData.get("targetType") as any;
  const targetId = formData.get("targetId") as string;
  const reason = formData.get("reason") as any;
  const details = (formData.get("details") as string)?.trim() || null;

  if (!targetType || !targetId || !reason) {
    throw new Error("Laporan tidak lengkap.");
  }

  const [newReport] = await db
    .insert(reports)
    .values({
      reporterUserId: user.id,
      targetType,
      targetId,
      reason,
      details,
      status: "pending",
    })
    .returning();

  return { success: true, reportId: newReport.id };
}

export async function resolveReportAction(
  reportId: string,
  resolution: "resolved" | "dismissed",
  resolutionNotes: string,
  enforceAction?: "takedown_artwork" | "suspend_user"
) {
  const user = await requireModerator("/dashboard");

  const result = await resolveReportService(db, {
    actorUserId: user.id,
    reportId,
    resolution,
    resolutionNotes,
    enforceAction,
  });

  revalidatePath("/admin/moderation");
  return result;
}

export async function setMonthlySpotlightAction(
  artistProfileId: string,
  featuredArtworkId: string | null,
  curatorQuote: string,
  year?: number,
  month?: number
) {
  const user = await requireModerator("/dashboard");

  const now = new Date();
  const targetYear = year || now.getFullYear();
  const targetMonth = month || now.getMonth() + 1; // 1-12

  const [existing] = await db
    .select()
    .from(monthlySpotlights)
    .where(
      and(
        eq(monthlySpotlights.year, targetYear),
        eq(monthlySpotlights.month, targetMonth)
      )
    )
    .limit(1);

  if (existing) {
    await db
      .update(monthlySpotlights)
      .set({
        artistProfileId,
        featuredArtworkId,
        curatorQuote,
        isPublished: true,
      })
      .where(eq(monthlySpotlights.id, existing.id));
  } else {
    await db.insert(monthlySpotlights).values({
      year: targetYear,
      month: targetMonth,
      artistProfileId,
      featuredArtworkId,
      curatorQuote,
      isPublished: true,
    });
  }

  await db.insert(activityLogs).values({
    eventType: "spotlight_published",
    targetType: "artist_profile",
    targetId: artistProfileId,
    metadata: { userId: user.id, year: targetYear, month: targetMonth },
  });

  revalidatePath("/");
  return { success: true };
}
