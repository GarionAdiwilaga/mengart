import { requireModerator } from "@/lib/rbac";
import { db } from "@/db";
import { auditLogs, users } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import Link from "next/link";
import { Shield, ArrowLeft, Clock, History, User } from "lucide-react";

export default async function AdminAuditLogsPage() {
  await requireModerator("/dashboard");

  const logs = await db
    .select({
      id: auditLogs.id,
      action: auditLogs.action,
      targetType: auditLogs.targetType,
      targetId: auditLogs.targetId,
      reason: auditLogs.reason,
      metadata: auditLogs.metadata,
      createdAt: auditLogs.createdAt,
      actorEmail: users.email,
    })
    .from(auditLogs)
    .leftJoin(users, eq(users.id, auditLogs.actorId))
    .orderBy(desc(auditLogs.createdAt))
    .limit(50);

  return (
    <main className="min-h-screen p-6 sm:p-12 max-w-7xl mx-auto flex flex-col gap-8">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-white/10 pb-4">
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1.5 text-xs font-mono text-zinc-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Dashboard
          </Link>
          <span className="text-zinc-600 font-mono text-xs">/</span>
          <span className="text-zinc-300 font-mono text-xs">Audit Log Explorer</span>
        </div>
      </header>

      {/* Hero Banner */}
      <div className="flex flex-col gap-2">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-400 text-xs font-mono w-fit">
          <History className="h-3.5 w-3.5" />
          <span>REKAM JEJAK SISTEM</span>
        </div>
        <h1 className="font-display font-extrabold text-3xl text-[#f6f2e9] tracking-tight">
          Audit Logs Transparansi Atelier
        </h1>
        <p className="text-xs text-zinc-400">
          Catatan kronologis seluruh tindakan administratif, perubahan challenge, kurasi juri, dan penegakan moderasi.
        </p>
      </div>

      {/* Logs Table */}
      {logs.length === 0 ? (
        <div className="glass-panel p-16 rounded-3xl flex flex-col items-center justify-center text-center gap-3">
          <History className="h-10 w-10 text-zinc-600" />
          <h3 className="font-display font-bold text-lg text-white">Belum ada catatan audit</h3>
        </div>
      ) : (
        <div className="glass-panel rounded-3xl overflow-hidden border border-white/10">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-white/5 border-b border-white/10 text-zinc-400">
                <tr>
                  <th className="p-4">WAKTU (WITA)</th>
                  <th className="p-4">AKTOR</th>
                  <th className="p-4">AKSI</th>
                  <th className="p-4">TARGET</th>
                  <th className="p-4 text-right">ALASAN / METADATA</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-zinc-300">
                {logs.map((log) => {
                  const dateStr = new Intl.DateTimeFormat("id-ID", {
                    timeZone: "Asia/Makassar",
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                  }).format(new Date(log.createdAt));

                  return (
                    <tr key={log.id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="p-4 text-zinc-400 whitespace-nowrap">{dateStr}</td>
                      <td className="p-4">
                        <span className="text-zinc-200">{log.actorEmail || "Sistem"}</span>
                      </td>
                      <td className="p-4">
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold border bg-amber-500/10 text-amber-400 border-amber-500/30">
                          {log.action}
                        </span>
                      </td>
                      <td className="p-4 text-zinc-300">
                        {log.targetType} {log.targetId ? `(${log.targetId.substring(0, 8)}...)` : ""}
                      </td>
                      <td className="p-4 text-right text-zinc-400">
                        {log.reason ? (
                          <span className="text-zinc-200 block truncate max-w-xs ml-auto">
                            {log.reason}
                          </span>
                        ) : null}
                        {log.metadata ? (
                          <span className="text-[10px] text-zinc-500 font-mono block truncate max-w-xs ml-auto">
                            {JSON.stringify(log.metadata)}
                          </span>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </main>
  );
}
