import { requireModerator } from "@/lib/rbac";
import { db } from "@/db";
import { membershipInvites, users } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { Palette, Sparkles, Key, Clock, ShieldCheck, AlertTriangle } from "lucide-react";
import Link from "next/link";
import { CreateInviteModal } from "@/components/admin/CreateInviteModal";
import { RevokeInviteButton } from "@/components/admin/RevokeInviteButton";

export default async function AdminInvitesPage() {
  await requireModerator("/login");

  const invitesList = await db
    .select({
      id: membershipInvites.id,
      tokenPrefix: membershipInvites.tokenPrefix,
      label: membershipInvites.label,
      expiresAt: membershipInvites.expiresAt,
      maxUses: membershipInvites.maxUses,
      usesCount: membershipInvites.usesCount,
      revokedAt: membershipInvites.revokedAt,
      revocationReason: membershipInvites.revocationReason,
      createdAt: membershipInvites.createdAt,
      creatorEmail: users.email,
    })
    .from(membershipInvites)
    .leftJoin(users, eq(users.id, membershipInvites.createdBy))
    .orderBy(desc(membershipInvites.createdAt));

  const now = new Date();

  return (
    <main className="min-h-screen p-6 sm:p-12 max-w-7xl mx-auto flex flex-col gap-8">
      {/* Header */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-6">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-400 text-xs font-mono mb-2">
            <Key className="h-3.5 w-3.5" />
            <span>COMMUNITY ACCESS CONTROL</span>
          </div>
          <h1 className="font-display font-extrabold text-3xl text-white tracking-tight">
            Membership Invitations
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            Generate, monitor, and revoke Discord-style hashed invitation links.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/dashboard"
            className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-300 text-sm font-medium transition-colors"
          >
            Dashboard
          </Link>
          <CreateInviteModal />
        </div>
      </header>

      {/* Invites Table */}
      <section className="glass-panel rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-white/10 bg-white/[0.02] text-xs font-mono text-zinc-400 uppercase tracking-wider">
              <tr>
                <th className="py-3.5 px-4 sm:px-6">Invite Prefix</th>
                <th className="py-3.5 px-4">Label</th>
                <th className="py-3.5 px-4">Status</th>
                <th className="py-3.5 px-4">Usage</th>
                <th className="py-3.5 px-4">Expiry (WITA)</th>
                <th className="py-3.5 px-4">Created By</th>
                <th className="py-3.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {invitesList.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-zinc-500 text-sm font-mono">
                    No membership invitations have been generated yet.
                  </td>
                </tr>
              ) : (
                invitesList.map((inv) => {
                  let status = "active";
                  let statusBadgeClass =
                    "border-emerald-500/30 bg-emerald-500/10 text-emerald-400";

                  if (inv.revokedAt) {
                    status = "revoked";
                    statusBadgeClass = "border-red-500/30 bg-red-500/10 text-red-400";
                  } else if (inv.expiresAt && new Date(inv.expiresAt) <= now) {
                    status = "expired";
                    statusBadgeClass = "border-zinc-500/30 bg-zinc-500/10 text-zinc-400";
                  } else if (inv.maxUses !== null && inv.usesCount >= inv.maxUses) {
                    status = "exhausted";
                    statusBadgeClass = "border-amber-500/30 bg-amber-500/10 text-amber-400";
                  }

                  const formattedExpiry = inv.expiresAt
                    ? new Intl.DateTimeFormat("en-US", {
                        timeZone: "Asia/Makassar",
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      }).format(new Date(inv.expiresAt))
                    : "Never";

                  return (
                    <tr key={inv.id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="py-4 px-4 sm:px-6 font-mono text-zinc-200 font-medium">
                        {inv.tokenPrefix}...
                      </td>
                      <td className="py-4 px-4 text-zinc-300">
                        {inv.label || <span className="text-zinc-600 italic">None</span>}
                      </td>
                      <td className="py-4 px-4">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-mono border capitalize ${statusBadgeClass}`}
                        >
                          {status}
                        </span>
                      </td>
                      <td className="py-4 px-4 font-mono text-xs text-zinc-300">
                        {inv.usesCount} / {inv.maxUses === null ? "∞" : inv.maxUses}
                      </td>
                      <td className="py-4 px-4 font-mono text-xs text-zinc-400">
                        {formattedExpiry}
                      </td>
                      <td className="py-4 px-4 text-xs text-zinc-400 truncate max-w-[140px]">
                        {inv.creatorEmail || "System"}
                      </td>
                      <td className="py-4 px-4 text-right">
                        {status === "active" ? (
                          <RevokeInviteButton inviteId={inv.id} tokenPrefix={inv.tokenPrefix} />
                        ) : (
                          <span className="text-zinc-600 text-xs font-mono">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
