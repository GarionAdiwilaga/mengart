import { requireAdmin } from "@/lib/rbac";
import { db } from "@/db";
import { membershipInvites, users } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { Sparkles } from "lucide-react";
import { CreateInviteModal } from "@/components/admin/CreateInviteModal";
import { InviteManagerTable, type InviteRowItem } from "@/components/admin/InviteManagerTable";

export default async function AdminInvitesPage() {
  await requireAdmin("/login");

  const invitesList = await db
    .select({
      id: membershipInvites.id,
      code: membershipInvites.code,
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

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-400 text-xs font-mono mb-2">
            <Sparkles className="h-3 w-3" />
            <span>KONTROL AKSES KOMUNITAS INVITE-ONLY</span>
          </div>
          <h1 className="font-display font-extrabold text-2xl sm:text-3xl text-[#f6f2e9] tracking-tight">
            Kunci & Tautan Undangan
          </h1>
          <p className="text-xs text-zinc-400 font-sans mt-0.5">
            Buat kode CSPRNG 8-karakter atau custom vanity code, kelola kuota penggunaan, dan salin kode/tautan undangan.
          </p>
        </div>

        <CreateInviteModal />
      </div>

      {/* Enhanced Table */}
      <InviteManagerTable invites={invitesList as InviteRowItem[]} />
    </div>
  );
}
