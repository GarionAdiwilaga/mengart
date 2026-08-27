import { requireModerator } from "@/lib/rbac";
import { db } from "@/db";
import { reports, users, profiles } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import Link from "next/link";
import { ShieldAlert, ArrowLeft, Clock, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import { ReportResolutionModal } from "@/components/admin/ReportResolutionModal";

interface ModerationPageProps {
  searchParams: Promise<{ status?: string }>;
}

export default async function AdminModerationQueuePage({ searchParams }: ModerationPageProps) {
  await requireModerator("/dashboard");
  const { status = "pending" } = await searchParams;

  const rawReports = await db
    .select({
      id: reports.id,
      targetType: reports.targetType,
      targetId: reports.targetId,
      reason: reports.reason,
      details: reports.details,
      status: reports.status,
      resolutionNotes: reports.resolutionNotes,
      createdAt: reports.createdAt,
      resolvedAt: reports.resolvedAt,
      reporterEmail: users.email,
    })
    .from(reports)
    .innerJoin(users, eq(users.id, reports.reporterUserId))
    .where(eq(reports.status, status as any))
    .orderBy(desc(reports.createdAt));

  return (
    <div className="flex flex-col gap-6">
      {/* Header Title */}
      <div className="flex flex-col gap-1">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-red-500/30 bg-red-500/10 text-red-400 text-xs font-mono w-fit">
          <ShieldAlert className="h-3.5 w-3.5" />
          <span>PUSAT KESELAMATAN ATELIER</span>
        </div>
        <h1 className="font-display font-extrabold text-2xl sm:text-3xl text-[#f6f2e9] tracking-tight">
          Antrean Laporan & Moderasi Komunitas
        </h1>
        <p className="text-xs text-zinc-400">
          Tinjau laporan pelanggaran karya (AI generated, NSFW, copyright), tentukan sanksi take-down, atau suspend akun.
        </p>
      </div>

      {/* Filter Status Tabs */}
      <div className="flex items-center gap-2 border-b border-white/10 pb-4">
        {[
          { key: "pending", label: "Perlu Ditinjau (Pending)" },
          { key: "resolved", label: "Telah Diselesaikan" },
          { key: "dismissed", label: "Diabaikan (Dismissed)" },
        ].map((t) => {
          const isActive = status === t.key;
          return (
            <Link
              key={t.key}
              href={`/admin/moderation?status=${t.key}`}
              className={`px-4 py-2 rounded-xl text-xs font-mono transition-all border ${
                isActive
                  ? "bg-amber-500 text-black border-amber-400 font-bold shadow-md shadow-amber-500/20"
                  : "bg-white/5 text-zinc-400 border-white/10 hover:border-white/20 hover:text-white"
              }`}
            >
              {t.label}
            </Link>
          );
        })}
      </div>

      {/* Reports Table */}
      {rawReports.length === 0 ? (
        <div className="glass-panel p-16 rounded-3xl flex flex-col items-center justify-center text-center gap-3">
          <CheckCircle2 className="h-10 w-10 text-emerald-400" />
          <h3 className="font-display font-bold text-lg text-white">
            Tidak ada laporan pada status "{status}"
          </h3>
          <p className="text-xs text-zinc-400 max-w-sm">
            Semua laporan telah ditangani dengan aman oleh tim kurator & moderator.
          </p>
        </div>
      ) : (
        <div className="glass-panel rounded-3xl overflow-hidden border border-white/10">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-white/5 border-b border-white/10 text-zinc-400">
                <tr>
                  <th className="p-4">TIPE & ALASAN</th>
                  <th className="p-4">RINCIAN PELAPOR</th>
                  <th className="p-4">WAKTU LAPORAN</th>
                  <th className="p-4">CATATAN RESOLUSI</th>
                  <th className="p-4 text-right">AKSI</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-zinc-300">
                {rawReports.map((item) => {
                  const dateStr = new Intl.DateTimeFormat("id-ID", {
                    timeZone: "Asia/Makassar",
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  }).format(new Date(item.createdAt));

                  return (
                    <tr key={item.id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="p-4">
                        <span className="font-display font-bold text-sm text-[#f6f2e9] block uppercase">
                          {item.reason.replace(/_/g, " ")}
                        </span>
                        <span className="text-[11px] text-amber-400">
                          Target: {item.targetType} ({item.targetId.substring(0, 8)}...)
                        </span>
                      </td>
                      <td className="p-4">
                        <span className="text-zinc-200 block">{item.reporterEmail}</span>
                        {item.details ? (
                          <span className="text-[11px] text-zinc-400 line-clamp-1">
                            "{item.details}"
                          </span>
                        ) : null}
                      </td>
                      <td className="p-4 text-zinc-400">{dateStr}</td>
                      <td className="p-4 text-zinc-300">
                        {item.resolutionNotes || "—"}
                      </td>
                      <td className="p-4 text-right">
                        {item.status === "pending" ? (
                          <ReportResolutionModal
                            reportId={item.id}
                            targetType={item.targetType}
                            targetId={item.targetId}
                            reason={item.reason}
                          />
                        ) : (
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] uppercase font-bold border bg-white/5 text-zinc-400 border-white/10">
                            {item.status}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
