"use client";

import { useState } from "react";
import { Search, ShieldCheck, UserCheck, Ban, Check, Loader2, Sparkles, Mail, User, Trash2 } from "lucide-react";
import { updateUserRoleAction, updateUserStatusAction } from "@/app/actions/admin";
import { toast } from "sonner";

export interface UserRowItem {
  id: string;
  email: string;
  username: string | null;
  role: "member" | "moderator" | "admin";
  membershipStatus: "active" | "suspended" | "deleted" | null;
  emailVerified: Date | null;
  createdAt: Date;
  displayName: string | null;
  profileSlug: string | null;
  artworkCount: number;
}

interface UserManagementTableProps {
  users: UserRowItem[];
  currentUserRole: string;
}

export function UserManagementTable({ users, currentUserRole }: UserManagementTableProps) {
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const filteredUsers = users.filter((u) => {
    const matchesSearch =
      u.email.toLowerCase().includes(search.toLowerCase()) ||
      (u.username && u.username.toLowerCase().includes(search.toLowerCase())) ||
      (u.displayName && u.displayName.toLowerCase().includes(search.toLowerCase()));

    const matchesRole = roleFilter === "all" || u.role === roleFilter;
    const matchesStatus =
      statusFilter === "all" ||
      (statusFilter === "pending" ? u.membershipStatus === null : u.membershipStatus === statusFilter);

    return matchesSearch && matchesRole && matchesStatus;
  });

  const handleRoleChange = async (userId: string, newRole: "member" | "moderator" | "admin") => {
    setLoadingId(userId);
    try {
      await updateUserRoleAction(userId, newRole);
      toast.success("Peran pengguna berhasil diperbarui.");
    } catch (err: any) {
      toast.error(err?.message || "Gagal mengubah peran.");
    } finally {
      setLoadingId(null);
    }
  };

  const handleStatusChange = async (
    userId: string,
    newStatus: "active" | "suspended" | "deleted"
  ) => {
    const defaultReason =
      newStatus === "deleted"
        ? "Penghapusan akun oleh administrator."
        : newStatus === "suspended"
        ? "Penangguhan akun oleh moderator/administrator."
        : "Pengaktifan kembali akun.";

    const reason = prompt("Masukkan alasan perubahan status akun (minimal 5 karakter):", defaultReason);
    if (!reason || reason.trim().length < 5) {
      toast.error("Alasan minimal 5 karakter wajib diisi.");
      return;
    }

    setLoadingId(userId);
    try {
      await updateUserStatusAction(userId, newStatus, reason.trim());
      toast.success(`Status pengguna diubah menjadi ${newStatus}.`);
    } catch (err: any) {
      toast.error(err?.message || "Gagal mengubah status akun.");
    } finally {
      setLoadingId(null);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Search & Filter Bar */}
      <div className="glass-panel p-4 rounded-3xl flex flex-col sm:flex-row items-center justify-between gap-4 border border-white/10">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari email, nama, username..."
            className="w-full pl-10 pr-4 py-2 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-zinc-500 focus:outline-none focus:border-amber-500/60 text-xs font-sans"
          />
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="px-3 py-2 rounded-xl bg-[#191c23] border border-white/10 text-xs font-mono text-white focus:outline-none"
          >
            <option value="all">Semua Peran</option>
            <option value="member">Member</option>
            <option value="moderator">Moderator</option>
            <option value="admin">Admin</option>
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 rounded-xl bg-[#191c23] border border-white/10 text-xs font-mono text-white focus:outline-none"
          >
            <option value="all">Semua Status</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
            <option value="deleted">Deleted</option>
            <option value="pending">Pending Invite</option>
          </select>
        </div>
      </div>

      {/* Users Display */}
      <div className="glass-panel rounded-3xl overflow-hidden border border-white/10 shadow-xl">
        {/* Mobile Cards List (< md) */}
        <div className="md:hidden divide-y divide-white/5">
          {filteredUsers.length === 0 ? (
            <div className="p-8 text-center text-zinc-500 font-mono text-xs">
              Tidak ada pengguna yang sesuai dengan filter.
            </div>
          ) : (
            filteredUsers.map((u) => (
              <div key={u.id} className="p-4 flex flex-col gap-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-2xl bg-amber-500/10 text-amber-400 font-mono font-bold flex items-center justify-center text-sm shrink-0 border border-amber-500/20">
                      {u.displayName?.charAt(0) || u.email.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex flex-col">
                      <span className="font-display font-bold text-[#f6f2e9] text-sm">
                        {u.displayName || "Tanpa Nama"}
                      </span>
                      <span className="text-[11px] font-mono text-zinc-400">
                        {u.email}
                      </span>
                    </div>
                  </div>

                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border shrink-0 ${
                      u.membershipStatus === "active"
                        ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                        : u.membershipStatus === "suspended"
                        ? "bg-amber-500/10 text-amber-400 border-amber-500/30"
                        : u.membershipStatus === "deleted"
                        ? "bg-red-500/10 text-red-400 border-red-500/30"
                        : "bg-zinc-500/10 text-zinc-400 border-zinc-500/30"
                    }`}
                  >
                    {u.membershipStatus || "pending_invite"}
                  </span>
                </div>

                <div className="flex items-center justify-between text-xs font-mono text-zinc-400 pt-1">
                  <span>{u.artworkCount} karya</span>
                  <span>{u.emailVerified ? "✓ Google Verified" : "Belum"}</span>
                </div>

                <div className="flex items-center justify-between gap-2 pt-2 border-t border-white/5">
                  {currentUserRole === "admin" && u.membershipStatus === "active" ? (
                    <select
                      disabled={loadingId === u.id}
                      value={u.role}
                      onChange={(e) => handleRoleChange(u.id, e.target.value as any)}
                      className="px-3 py-1.5 rounded-xl bg-[#191c23] border border-white/10 text-xs font-mono text-amber-300 focus:outline-none"
                    >
                      <option value="member">Peran: Member</option>
                      <option value="moderator">Peran: Moderator</option>
                      <option value="admin">Peran: Admin</option>
                    </select>
                  ) : (
                    <span className="px-2 py-1 rounded bg-white/5 text-amber-300 font-bold uppercase text-[10px]">
                      {u.role}
                    </span>
                  )}

                  <div className="flex items-center gap-1.5">
                    {u.membershipStatus === "active" ? (
                      <button
                        disabled={loadingId === u.id}
                        onClick={() => handleStatusChange(u.id, "suspended")}
                        className="px-3 py-1.5 min-h-[38px] rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 font-mono text-xs transition-colors cursor-pointer disabled:opacity-50"
                      >
                        Suspend
                      </button>
                    ) : u.membershipStatus === "suspended" ? (
                      <button
                        disabled={loadingId === u.id}
                        onClick={() => handleStatusChange(u.id, "active")}
                        className="px-3 py-1.5 min-h-[38px] rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-mono text-xs transition-colors cursor-pointer disabled:opacity-50"
                      >
                        Aktifkan
                      </button>
                    ) : null}

                    {currentUserRole === "admin" && u.membershipStatus !== "deleted" ? (
                      <button
                        disabled={loadingId === u.id}
                        onClick={() => handleStatusChange(u.id, "deleted")}
                        className="px-3 py-1.5 min-h-[38px] rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 font-mono text-xs transition-colors cursor-pointer disabled:opacity-50"
                        title="Hapus Akun"
                      >
                        Hapus
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Desktop Table (hidden on mobile, visible on md+) */}
        <div className="hidden md:block overflow-x-auto touch-pan-x">
          <table className="w-full text-left text-xs font-sans">
            <thead className="bg-white/5 border-b border-white/10 text-[11px] font-mono text-zinc-400 uppercase">
              <tr>
                <th className="py-3.5 px-5">Artist / Pengguna</th>
                <th className="py-3.5 px-4">Peran (Role)</th>
                <th className="py-3.5 px-4">Status Keanggotaan</th>
                <th className="py-3.5 px-4">Email</th>
                <th className="py-3.5 px-4">Karya</th>
                <th className="py-3.5 px-5 text-right">Aksi Moderasi</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-white/5">
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-zinc-500 font-mono text-xs">
                    Tidak ada pengguna yang sesuai dengan filter.
                  </td>
                </tr>
              ) : (
                filteredUsers.map((u) => (
                  <tr key={u.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="py-3.5 px-5">
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-xl bg-amber-500/10 text-amber-400 font-mono font-bold flex items-center justify-center text-xs shrink-0 border border-amber-500/20">
                          {u.displayName?.charAt(0) || u.email.charAt(0).toUpperCase()}
                        </div>
                        <div className="flex flex-col">
                          <span className="font-display font-bold text-[#f6f2e9] text-sm">
                            {u.displayName || "Tanpa Nama"}
                          </span>
                          <span className="text-[11px] font-mono text-zinc-400">
                            {u.email} {u.username ? `(@${u.username})` : ""}
                          </span>
                        </div>
                      </div>
                    </td>

                    {/* Role Dropdown */}
                    <td className="py-3.5 px-4 font-mono">
                      {currentUserRole === "admin" && u.membershipStatus === "active" ? (
                        <select
                          disabled={loadingId === u.id}
                          value={u.role}
                          onChange={(e) => handleRoleChange(u.id, e.target.value as any)}
                          className="px-2.5 py-1 rounded-lg bg-[#191c23] border border-white/10 text-xs font-mono text-amber-300 focus:outline-none"
                        >
                          <option value="member">Member</option>
                          <option value="moderator">Moderator</option>
                          <option value="admin">Admin</option>
                        </select>
                      ) : (
                        <span className="px-2 py-0.5 rounded bg-white/5 text-amber-300 font-bold uppercase text-[10px]">
                          {u.role}
                        </span>
                      )}
                    </td>

                    {/* Status Badge */}
                    <td className="py-3.5 px-4 font-mono">
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase border ${
                          u.membershipStatus === "active"
                            ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                            : u.membershipStatus === "suspended"
                            ? "bg-amber-500/10 text-amber-400 border-amber-500/30"
                            : u.membershipStatus === "deleted"
                            ? "bg-red-500/10 text-red-400 border-red-500/30"
                            : "bg-zinc-500/10 text-zinc-400 border-zinc-500/30"
                        }`}
                      >
                        {u.membershipStatus || "pending_invite"}
                      </span>
                    </td>

                    {/* Email Verified */}
                    <td className="py-3.5 px-4 font-mono text-[11px]">
                      {u.emailVerified ? (
                        <span className="text-emerald-400 flex items-center gap-1">
                          <Check className="h-3.5 w-3.5" /> Terverifikasi
                        </span>
                      ) : (
                        <span className="text-zinc-500">Belum</span>
                      )}
                    </td>

                    {/* Artwork Count */}
                    <td className="py-3.5 px-4 font-mono text-zinc-300">
                      {u.artworkCount} karya
                    </td>

                    {/* Action Controls */}
                    <td className="py-3.5 px-5 text-right">
                      <div className="inline-flex items-center gap-2 justify-end">
                        {u.membershipStatus === "active" ? (
                          <button
                            disabled={loadingId === u.id}
                            onClick={() => handleStatusChange(u.id, "suspended")}
                            className="px-3 py-1 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 font-mono text-[11px] transition-colors cursor-pointer disabled:opacity-50"
                          >
                            Suspend
                          </button>
                        ) : u.membershipStatus === "suspended" ? (
                          <button
                            disabled={loadingId === u.id}
                            onClick={() => handleStatusChange(u.id, "active")}
                            className="px-3 py-1 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-mono text-[11px] transition-colors cursor-pointer disabled:opacity-50"
                          >
                            Aktifkan
                          </button>
                        ) : null}

                        {currentUserRole === "admin" && u.membershipStatus !== "deleted" ? (
                          <button
                            disabled={loadingId === u.id}
                            onClick={() => handleStatusChange(u.id, "deleted")}
                            className="px-3 py-1 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 font-mono text-[11px] transition-colors cursor-pointer disabled:opacity-50"
                          >
                            Hapus
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
