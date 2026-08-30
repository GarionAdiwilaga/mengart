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
import { updateUserMembershipStatusService } from "@/lib/services/userService";

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

  const [report] = await db
    .select()
    .from(reports)
    .where(eq(reports.id, reportId))
    .limit(1);

  if (!report) throw new Error("Laporan tidak ditemukan.");

  await db.transaction(async (tx) => {
    // 1. Update report status
    await tx
      .update(reports)
      .set({
        status: resolution,
        resolvedByUserId: user.id,
        resolutionNotes,
        resolvedAt: new Date(),
      })
      .where(eq(reports.id, reportId));

    // 2. Perform enforcement actions
    if (enforceAction === "takedown_artwork" && report.targetType === "artwork") {
      await tx
        .update(artworks)
        .set({ publicationStatus: "hidden", updatedAt: new Date() })
        .where(eq(artworks.id, report.targetId));
    } else if (enforceAction === "suspend_user") {
      const targetUserId = report.targetId;
      await updateUserMembershipStatusService(tx, {
        actor: {
          id: user.id,
          role: user.role,
          membershipStatus: user.membershipStatus,
        },
        targetUserId,
        newStatus: "suspended",
        reason: `Penangguhan akun pengguna melalui penyelesaian laporan: ${resolutionNotes}`,
        auditAction: "moderation.suspend_user",
        auditMetadata: { reportId, reportReason: report.reason },
      });
    }

    // 3. Record in audit logs (for non-user-suspend actions, since updateUserMembershipStatusService writes user audit log)
    if (enforceAction !== "suspend_user") {
      await tx.insert(auditLogs).values({
        actorId: user.id,
        action: `moderation.report_${resolution}`,
        targetType: report.targetType,
        targetId: report.targetId,
        reason: resolutionNotes,
        metadata: { enforceAction, reportReason: report.reason },
      });
    }
  });

  revalidatePath("/admin/moderation");
  return { success: true };
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
