"use client";

import { useState } from "react";
import { Copy, Check, KeyRound, ExternalLink, ShieldAlert, Sparkles, Ban } from "lucide-react";
import { RevokeInviteButton } from "./RevokeInviteButton";
import { toast } from "sonner";

export interface InviteRowItem {
  id: string;
  tokenPrefix: string;
  label: string | null;
  expiresAt: Date | null;
  maxUses: number | null;
  usesCount: number;
  revokedAt: Date | null;
  revocationReason: string | null;
  createdAt: Date;
  creatorEmail: string | null;
}

interface InviteManagerTableProps {
  invites: InviteRowItem[];
}

export function InviteManagerTable({ invites }: InviteManagerTableProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const now = new Date();

  const handleCopy = (inv: InviteRowItem) => {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const inviteUrl = `${origin}/invite/${inv.tokenPrefix}`;
    navigator.clipboard.writeText(inviteUrl);
    setCopiedId(inv.id);
    toast.success(`Tautan undangan untuk "${inv.tokenPrefix}" disalin ke clipboard!`);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const filtered = invites.filter((inv) => {
    if (statusFilter === "all") return true;
    if (statusFilter === "active") return !inv.revokedAt && (!inv.expiresAt || new Date(inv.expiresAt) > now) && (inv.maxUses === null || inv.usesCount < inv.maxUses);
    if (statusFilter === "revoked") return !!inv.revokedAt;
    if (statusFilter === "exhausted") return inv.maxUses !== null && inv.usesCount >= inv.maxUses;
    if (statusFilter === "expired") return inv.expiresAt && new Date(inv.expiresAt) <= now;
    return true;
  });

  return (
    <div className="flex flex-col gap-4">
      {/* Filter Tabs */}
      <div className="flex items-center gap-2 p-1 rounded-2xl bg-white/5 border border-white/10 w-fit">
        {[
          { key: "all", label: "Semua Kunci" },
          { key: "active", label: "Aktif" },
          { key: "exhausted", label: "Habis Kuota" },
          { key: "revoked", label: "Dicabut" },
          { key: "expired", label: "Kedaluwarsa" },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setStatusFilter(tab.key)}
            className={`px-3 py-1.5 rounded-xl text-xs font-mono transition-all cursor-pointer ${
              statusFilter === tab.key
                ? "bg-amber-500 text-black font-bold shadow-md shadow-amber-500/20"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="glass-panel rounded-3xl overflow-hidden border border-white/10 shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-sans">
            <thead className="bg-white/5 border-b border-white/10 text-[11px] font-mono text-zinc-400 uppercase">
              <tr>
                <th className="py-3.5 px-5">Kode / Vanity Undangan</th>
                <th className="py-3.5 px-4">Label Peruntukan</th>
                <th className="py-3.5 px-4">Status</th>
                <th className="py-3.5 px-4">Penggunaan</th>
                <th className="py-3.5 px-4">Kedaluwarsa (WITA)</th>
                <th className="py-3.5 px-4">Pembuat</th>
                <th className="py-3.5 px-5 text-right">Tindakan</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-white/5">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-zinc-500 font-mono text-xs">
                    Tidak ada kunci undangan yang sesuai dengan filter.
                  </td>
                </tr>
              ) : (
                filtered.map((inv) => {
                  let status = "Aktif";
                  let statusBadgeClass = "border-emerald-500/30 bg-emerald-500/10 text-emerald-400";

                  if (inv.revokedAt) {
                    status = "Dicabut";
                    statusBadgeClass = "border-red-500/30 bg-red-500/10 text-red-400";
                  } else if (inv.expiresAt && new Date(inv.expiresAt) <= now) {
                    status = "Kedaluwarsa";
                    statusBadgeClass = "border-zinc-500/30 bg-zinc-500/10 text-zinc-400";
                  } else if (inv.maxUses !== null && inv.usesCount >= inv.maxUses) {
                    status = "Habis";
                    statusBadgeClass = "border-amber-500/30 bg-amber-500/10 text-amber-400";
                  }

                  const formattedExpiry = inv.expiresAt
                    ? new Intl.DateTimeFormat("id-ID", {
                        timeZone: "Asia/Makassar",
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      }).format(new Date(inv.expiresAt)) + " WITA"
                    : "Permanen (Selamanya)";

                  return (
                    <tr key={inv.id} className="hover:bg-white/[0.02] transition-colors">
                      {/* Code Pill + 1-Click Copy */}
                      <td className="py-3.5 px-5 font-mono">
                        <div className="flex items-center gap-2">
                          <span className="px-2.5 py-1 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 font-bold text-xs tracking-wider">
                            {inv.tokenPrefix}
                          </span>
                          <button
                            onClick={() => handleCopy(inv)}
                            className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white transition-colors cursor-pointer"
                            title="Salin Tautan Undangan"
                          >
                            {copiedId === inv.id ? (
                              <Check className="h-3.5 w-3.5 text-emerald-400" />
                            ) : (
                              <Copy className="h-3.5 w-3.5" />
                            )}
                          </button>
                        </div>
                      </td>

                      {/* Label */}
                      <td className="py-3.5 px-4 text-zinc-300">
                        {inv.label || <span className="text-zinc-600 italic">Tanpa Label</span>}
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4 font-mono">
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase border ${statusBadgeClass}`}
                        >
                          {status}
                        </span>
                      </td>

                      {/* Uses */}
                      <td className="py-3.5 px-4 font-mono text-zinc-300 tabular-nums">
                        {inv.usesCount} / {inv.maxUses === null ? "∞" : inv.maxUses}
                      </td>

                      {/* Expiry */}
                      <td className="py-3.5 px-4 font-mono text-[11px] text-zinc-400">
                        {formattedExpiry}
                      </td>

                      {/* Creator */}
                      <td className="py-3.5 px-4 font-mono text-[11px] text-zinc-400 truncate max-w-[130px]">
                        {inv.creatorEmail || "Sistem"}
                      </td>

                      {/* Action */}
                      <td className="py-3.5 px-5 text-right">
                        {status === "Aktif" ? (
                          <RevokeInviteButton inviteId={inv.id} tokenPrefix={inv.tokenPrefix} />
                        ) : (
                          <span className="text-zinc-600 font-mono text-[11px]">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
