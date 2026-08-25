"use server";

import { requireAuth } from "@/lib/rbac";
import { markNotificationAsRead, markAllNotificationsAsRead } from "@/lib/notifications";
import { revalidatePath } from "next/cache";

export async function markNotificationReadAction(notificationId: string) {
  const user = await requireAuth("/login");
  await markNotificationAsRead(notificationId, user.id);
  revalidatePath("/dashboard");
  return { success: true };
}

export async function markAllNotificationsReadAction() {
  const user = await requireAuth("/login");
  await markAllNotificationsAsRead(user.id);
  revalidatePath("/dashboard");
  return { success: true };
}
