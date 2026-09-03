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
import { eq, and, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { resolveReportService } from "@/lib/services/moderationService";
import { checkRateLimit } from "@/lib/rateLimit";

export async function createReportAction(formData: FormData) {
  const user = await requireAuth("/login");

  // Rate Limiting (Security-Critical, Fail-Closed)
  const rl = await checkRateLimit(`report_create:${user.id}`, {
    limit: 5,
    windowSeconds: 60,
    criticality: "fail_closed",
  });
  if (!rl.success) {
    throw new Error("Terlalu banyak laporan dikirim. Harap tunggu beberapa saat.");
  }

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

  // Rate Limiting (Low-Risk / Operational Staff Action, Fail-Open with logging)
  const rl = await checkRateLimit(`report_resolve:${user.id}`, {
    limit: 30,
    windowSeconds: 60,
    criticality: "fail_open",
  });
  if (!rl.success) {
    throw new Error("Terlalu banyak resolusi laporan dalam waktu singkat.");
  }

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
  const user = await requireAuth("/dashboard");
  if (user.role !== "admin") {
    throw new Error("Hanya Administrator yang dapat mengurasi Featured Artist.");
  }

  const rl = await checkRateLimit(`report_resolve:${user.id}`, {
    limit: 30,
    windowSeconds: 60,
    criticality: "fail_open",
  });
  if (!rl.success) {
    throw new Error("Terlalu banyak permintaan pembaruan spotlight.");
  }

  const quote = curatorQuote?.trim();
  if (!quote || quote.length < 5) {
    throw new Error("Kutipan kurator wajib diisi minimal 5 karakter.");
  }

  const now = new Date();
  const targetYear = year || now.getFullYear();
  const targetMonth = month || now.getMonth() + 1; // 1-12

  const [existingActive] = await db
    .select()
    .from(monthlySpotlights)
    .where(
      and(
        eq(monthlySpotlights.year, targetYear),
        eq(monthlySpotlights.month, targetMonth),
        isNull(monthlySpotlights.deletedAt)
      )
    )
    .limit(1);

  let spotlightId: string;

  if (existingActive) {
    await db
      .update(monthlySpotlights)
      .set({
        artistProfileId,
        featuredArtworkId,
        curatorQuote: quote,
        isPublished: true,
      })
      .where(eq(monthlySpotlights.id, existingActive.id));
    spotlightId = existingActive.id;
  } else {
    const [inserted] = await db
      .insert(monthlySpotlights)
      .values({
        year: targetYear,
        month: targetMonth,
        artistProfileId,
        featuredArtworkId,
        curatorQuote: quote,
        isPublished: true,
      })
      .returning();
    spotlightId = inserted.id;
  }

  await db.insert(auditLogs).values({
    actorId: user.id,
    action: "spotlight.set",
    targetType: "monthly_spotlight",
    targetId: spotlightId,
    metadata: {
      year: targetYear,
      month: targetMonth,
      artistProfileId,
      featuredArtworkId,
    },
  });

  revalidatePath("/");
  revalidatePath("/artists");
  revalidatePath("/community");
  revalidatePath("/admin/spotlight");
  return { success: true, spotlightId };
}

export async function deleteMonthlySpotlightAction(spotlightId: string, reason: string) {
  const user = await requireAuth("/dashboard");
  if (user.role !== "admin") {
    throw new Error("Hanya Administrator yang dapat menghapus kurasi Featured Artist.");
  }

  const trimmedReason = reason?.trim();
  if (!trimmedReason || trimmedReason.length < 5) {
    throw new Error("Alasan penghapusan spotlight wajib diisi minimal 5 karakter.");
  }

  const [spotlight] = await db
    .select()
    .from(monthlySpotlights)
    .where(eq(monthlySpotlights.id, spotlightId))
    .limit(1);

  if (!spotlight) {
    throw new Error("Data spotlight tidak ditemukan.");
  }

  await db
    .update(monthlySpotlights)
    .set({
      deletedAt: new Date(),
      deletedBy: user.id,
      deletionReason: trimmedReason,
      isPublished: false,
    })
    .where(eq(monthlySpotlights.id, spotlightId));

  await db.insert(auditLogs).values({
    actorId: user.id,
    action: "spotlight.delete",
    targetType: "monthly_spotlight",
    targetId: spotlightId,
    reason: trimmedReason,
    metadata: {
      year: spotlight.year,
      month: spotlight.month,
      artistProfileId: spotlight.artistProfileId,
    },
  });

  revalidatePath("/");
  revalidatePath("/artists");
  revalidatePath("/community");
  revalidatePath("/admin/spotlight");
  return { success: true };
}
