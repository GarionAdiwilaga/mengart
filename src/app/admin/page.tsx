import { db } from "@/db";
import { users, artworks, challenges, reports, membershipInvites, auditLogs } from "@/db/schema";
import { sql, eq, desc, and, isNull } from "drizzle-orm";
import Link from "next/link";
import {
  Users,
  Palette,
  Trophy,
  ShieldAlert,
  KeyRound,
  History,
  Sparkles,
  ArrowRight,
  TrendingUp,
  HardDrive,
} from "lucide-react";

export default async function AdminOverviewPage() {
  // Fetch platform metrics concurrently
  const [
    [userCount],
    [artworkCount],
    [activeChallengesCount],
    [pendingReportsCount],
    [activeInvitesCount],
    recentLogs,
  ] = await Promise.all([
    db.select({ count: sql<number>`count(*)::int` }).from(users),
    db.select({ count: sql<number>`count(*)::int` }).from(artworks).where(eq(artworks.publicationStatus, "published")),
    db.select({ count: sql<number>`count(*)::int` }).from(challenges).where(eq(challenges.status, "submission_open")),
    db.select({ count: sql<number>`count(*)::int` }).from(reports).where(eq(reports.status, "pending")),
    db.select({ count: sql<number>`count(*)::int` }).from(membershipInvites).where(isNull(membershipInvites.revokedAt)),
    db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(6),
  ]);

  const metrics = [
    {
      title: "Total Anggota Terdaftar",
      value: userCount?.count || 0,
      subtext: "Artist & Kreator Komunitas",
      icon: Users,
      color: "text-blue-400",
      bg: "bg-blue-500/10 border-blue-500/20",
      href: "/admin/users",
    },
    {
      title: "Karya Terpublikasi",
      value: artworkCount?.count || 0,
      subtext: "Master Terlindungi & WebP",
      icon: Palette,
      color: "text-amber-400",
      bg: "bg-amber-500/10 border-amber-500/20",
      href: "/admin/artworks",
    },
    {
      title: "Challenge Aktif",
      value: activeChallengesCount?.count || 0,
      subtext: "Tahap Submisi Berlangsung",
      icon: Trophy,
      color: "text-purple-400",
      bg: "bg-purple-500/10 border-purple-500/20",
      href: "/admin/challenges",
    },
    {
      title: "Antrean Moderasi",
      value: pendingReportsCount?.count || 0,
      subtext: "Laporan Perlu Ditinjau",
      icon: ShieldAlert,
      color: (pendingReportsCount?.count || 0) > 0 ? "text-red-400" : "text-emerald-400",
      bg: (pendingReportsCount?.count || 0) > 0 ? "bg-red-500/10 border-red-500/30" : "bg-emerald-500/10 border-emerald-500/20",
      href: "/admin/moderation",
    },
  ];

  return (
    <div className="flex flex-col gap-8">
      {/* Header */}
      <div className="flex flex-col gap-1">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-400 text-xs font-mono w-fit">
          <Sparkles className="h-3 w-3" />
          <span>PUSAT KOMANDO ATELIER MENGART</span>
        </div>
        <h1 className="font-display font-extrabold text-2xl sm:text-3xl text-[#f6f2e9] tracking-tight">
          Ikhtisar & Metrik Sistem
        </h1>
        <p className="text-xs text-zinc-400 font-sans">
          Pemantauan kesehatan platform, pertumbuhan komunitas, antrean keamanan, dan aktivitas operasional.
        </p>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {metrics.map((m) => {
          const Icon = m.icon;
          return (
            <Link
              key={m.title}
              href={m.href}
              className={`p-5 rounded-3xl border flex flex-col justify-between gap-4 transition-all hover:scale-[1.02] cursor-pointer shadow-lg ${m.bg}`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono font-medium text-zinc-300">{m.title}</span>
                <div className={`p-2 rounded-xl bg-white/5 ${m.color}`}>
                  <Icon className="h-4 w-4" />
                </div>
              </div>

              <div>
                <span className="text-3xl font-display font-extrabold text-[#f6f2e9] tracking-tight">
                  {m.value}
                </span>
                <p className="text-[11px] font-mono text-zinc-400 mt-0.5">{m.subtext}</p>
              </div>
            </Link>
          );
        })}
      </div>

      {/* Quick Action Shortcuts */}
      <div className="glass-panel p-6 rounded-3xl border border-white/10 flex flex-col gap-4">
        <h3 className="font-display font-bold text-sm text-[#f6f2e9]">Aksi Cepat Administrator</h3>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Link
            href="/admin/invites"
            className="p-4 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-between text-xs font-mono transition-colors"
          >
            <div className="flex items-center gap-2.5">
              <KeyRound className="h-4 w-4 text-amber-400" />
              <span className="text-zinc-200">Buat Kunci Undangan Baru</span>
            </div>
            <ArrowRight className="h-3.5 w-3.5 text-zinc-500" />
          </Link>

          <Link
            href="/admin/challenges/new"
            className="p-4 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-between text-xs font-mono transition-colors"
          >
            <div className="flex items-center gap-2.5">
              <Trophy className="h-4 w-4 text-purple-400" />
              <span className="text-zinc-200">Luncurkan Art Challenge Baru</span>
            </div>
            <ArrowRight className="h-3.5 w-3.5 text-zinc-500" />
          </Link>

          <Link
            href="/admin/moderation"
            className="p-4 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-between text-xs font-mono transition-colors"
          >
            <div className="flex items-center gap-2.5">
              <ShieldAlert className="h-4 w-4 text-red-400" />
              <span className="text-zinc-200">Periksa Laporan Komunitas</span>
            </div>
            <ArrowRight className="h-3.5 w-3.5 text-zinc-500" />
          </Link>
        </div>
      </div>

      {/* Recent System Activity Logs Stream */}
      <div className="glass-panel p-6 rounded-3xl border border-white/10 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <History className="h-4 w-4 text-amber-400" />
            <h3 className="font-display font-bold text-sm text-[#f6f2e9]">Aktivitas Sistem Terbaru</h3>
          </div>
          <Link
            href="/admin/audit-logs"
            className="text-xs font-mono text-amber-400 hover:text-amber-300 transition-colors"
          >
            Buka Seluruh Audit Log →
          </Link>
        </div>

        <div className="flex flex-col divide-y divide-white/5">
          {recentLogs.length === 0 ? (
            <span className="text-xs font-mono text-zinc-500 py-4">Belum ada catatan log terbaru.</span>
          ) : (
            recentLogs.map((log) => {
              const timeStr = new Intl.DateTimeFormat("id-ID", {
                timeZone: "Asia/Makassar",
                day: "numeric",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
              }).format(new Date(log.createdAt));

              return (
                <div key={log.id} className="py-3 flex items-center justify-between text-xs font-mono">
                  <div className="flex items-center gap-3">
                    <span className="px-2 py-0.5 rounded bg-white/5 border border-white/10 text-amber-300 font-bold uppercase text-[10px]">
                      {log.action}
                    </span>
                    <span className="text-zinc-300">{log.targetType}</span>
                    <span className="text-zinc-500 truncate max-w-[200px]">{log.targetId}</span>
                  </div>
                  <span className="text-zinc-500 text-[11px]">{timeStr} WITA</span>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
