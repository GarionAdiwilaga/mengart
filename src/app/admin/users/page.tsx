import { db } from "@/db";
import { users, profiles, artworks } from "@/db/schema";
import { eq, sql, desc } from "drizzle-orm";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { UserManagementTable, type UserRowItem } from "@/components/admin/UserManagementTable";
import { Users, Sparkles } from "lucide-react";

export default async function AdminUsersPage() {
  const session = await auth();
  if (session?.user?.role !== "admin" && session?.user?.role !== "moderator") {
    redirect("/dashboard");
  }

  // Fetch all users with profile data and count of published artworks
  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      username: users.username,
      role: users.role,
      membershipStatus: users.membershipStatus,
      emailVerified: users.emailVerified,
      createdAt: users.createdAt,
      displayName: profiles.displayName,
      profileSlug: profiles.slug,
      artworkCount: sql<number>`(
        SELECT count(*)::int FROM ${artworks} WHERE ${artworks.userId} = ${users.id}
      )`,
    })
    .from(users)
    .leftJoin(profiles, eq(profiles.userId, users.id))
    .orderBy(desc(users.createdAt));

  return (
    <div className="flex flex-col gap-6">
      {/* Page Title */}
      <div className="flex flex-col gap-1">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-400 text-xs font-mono w-fit">
          <Sparkles className="h-3 w-3" />
          <span>MANAJEMEN KEANGGOTAAN ATELIER</span>
        </div>
        <h1 className="font-display font-extrabold text-2xl sm:text-3xl text-[#f6f2e9] tracking-tight">
          Direktori Anggota & Peran
        </h1>
        <p className="text-xs text-zinc-400 font-sans">
          Kelola hak akses role (Member, Moderator, Admin), audit status keaktifan akun, dan penangguhan akses.
        </p>
      </div>

      <UserManagementTable
        users={rows as UserRowItem[]}
        currentUserRole={session.user.role}
      />
    </div>
  );
}
