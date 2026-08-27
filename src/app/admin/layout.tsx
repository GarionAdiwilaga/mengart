import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { AdminSidebar } from "@/components/admin/AdminSidebar";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const role = session.user.role;
  if (role !== "admin" && role !== "moderator") {
    redirect("/dashboard");
  }

  return (
    <div className="p-6 sm:p-10 max-w-7xl mx-auto flex flex-col lg:flex-row gap-8 flex-1 w-full">
      <AdminSidebar userRole={role} userEmail={session.user.email || ""} />
      <main className="flex-1 min-w-0 flex flex-col gap-6">{children}</main>
    </div>
  );
}
