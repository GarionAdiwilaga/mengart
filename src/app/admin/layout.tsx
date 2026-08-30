import { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireModerator } from "@/lib/rbac";
import { AdminSidebar } from "@/components/admin/AdminSidebar";

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
  },
};

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let actor;
  try {
    actor = await requireModerator();
  } catch {
    redirect("/dashboard");
  }

  return (
    <div className="p-6 sm:p-10 max-w-7xl mx-auto flex flex-col lg:flex-row gap-8 flex-1 w-full">
      <AdminSidebar userRole={actor.role as "moderator" | "admin"} userEmail={actor.email || ""} />
      <main className="flex-1 min-w-0 flex flex-col gap-6">{children}</main>
    </div>
  );
}
