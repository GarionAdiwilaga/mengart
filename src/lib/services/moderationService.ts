import { eq } from "drizzle-orm";
import { reports, artworks, auditLogs } from "@/db/schema";
import { updateUserMembershipStatusService, assertModeratorOrAdminActor } from "@/lib/services/userService";

export interface ResolveReportParams {
  actorUserId: string;
  reportId: string;
  resolution: "resolved" | "dismissed";
  resolutionNotes: string;
  enforceAction?: "takedown_artwork" | "suspend_user";
}

/**
 * Authoritative Canonical Domain Service for Report Resolution & Enforcement
 * 
 * Enforces active staff authorization (loaded inside transaction), serializes concurrent
 * report resolutions with FOR UPDATE, strictly requires pending status, validates that
 * dismissed reports never apply enforcement actions, ensures strict targetType compatibility,
 * and delegates user suspension through updateUserMembershipStatusService.
 */
export async function resolveReportService(
  dbOrTx: any,
  params: {
    actorUserId: string;
    reportId: string;
    resolution: "resolved" | "dismissed";
    resolutionNotes: string;
    enforceAction?: "takedown_artwork" | "suspend_user";
  }
) {
  const { actorUserId, reportId, resolution, resolutionNotes, enforceAction } = params;

  return await dbOrTx.transaction(async (tx: any) => {
    // 1. Verify actor active staff role inside transaction
    const actor = await assertModeratorOrAdminActor(tx, actorUserId);

    // 2. Fetch and lock target report row FOR UPDATE
    const [report] = await tx
      .select()
      .from(reports)
      .where(eq(reports.id, reportId))
      .for("update");

    if (!report) {
      throw new Error("Laporan tidak ditemukan.");
    }

    if (report.status !== "pending") {
      throw new Error("Laporan telah diproses sebelumnya.");
    }

    // 3. Validation Rule 1: A dismissed report must NEVER apply any enforcement action
    if (resolution === "dismissed" && enforceAction !== undefined && enforceAction !== null) {
      throw new Error(
        "Tindakan penegakan sanksi tidak dapat diterapkan pada laporan yang diabaikan (dismissed)."
      );
    }

    // 4. Validation Rule 2: Strict targetType compatibility for enforcement actions
    if (enforceAction === "suspend_user" && report.targetType !== "user") {
      throw new Error(
        "Tindakan penangguhan pengguna (suspend_user) hanya dapat diterapkan pada laporan dengan target pengguna (user)."
      );
    }

    if (enforceAction === "takedown_artwork" && report.targetType !== "artwork") {
      throw new Error(
        "Tindakan penurunan karya (takedown_artwork) hanya dapat diterapkan pada laporan dengan target karya (artwork)."
      );
    }

    // 5. Update report status
    await tx
      .update(reports)
      .set({
        status: resolution,
        resolvedByUserId: actor.id,
        resolutionNotes,
        resolvedAt: new Date(),
      })
      .where(eq(reports.id, reportId));

    // 6. Perform enforcement actions
    if (enforceAction === "takedown_artwork" && report.targetType === "artwork") {
      await tx
        .update(artworks)
        .set({ publicationStatus: "hidden", updatedAt: new Date() })
        .where(eq(artworks.id, report.targetId));
    } else if (enforceAction === "suspend_user" && report.targetType === "user") {
      const targetUserId = report.targetId;
      await updateUserMembershipStatusService(tx, {
        actorUserId: actor.id,
        targetUserId,
        newStatus: "suspended",
        reason: `Penangguhan akun pengguna melalui penyelesaian laporan: ${resolutionNotes}`,
        auditAction: "moderation.suspend_user",
        auditMetadata: { reportId, reportReason: report.reason },
      });
    }

    // 7. Record in audit logs (for non-user-suspend actions, since updateUserMembershipStatusService writes user audit log)
    if (enforceAction !== "suspend_user") {
      await tx.insert(auditLogs).values({
        actorId: actor.id,
        action: `moderation.report_${resolution}`,
        targetType: report.targetType,
        targetId: report.targetId,
        reason: resolutionNotes,
        metadata: { enforceAction: enforceAction || null, reportReason: report.reason },
      });
    }

    return { success: true, reportId };
  });
}
