import { db } from "@/db";
import { notifications } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";

export async function createNotification(params: {
  userId: string;
  type: string;
  title: string;
  body: string;
  actionUrl?: string | null;
  targetType?: string | null;
  targetId?: string | null;
}) {
  const [created] = await db
    .insert(notifications)
    .values({
      userId: params.userId,
      type: params.type,
      title: params.title,
      body: params.body,
      actionUrl: params.actionUrl || null,
      targetType: params.targetType || null,
      targetId: params.targetId || null,
      isRead: false,
    })
    .returning();

  return created;
}

export async function getUserNotifications(userId: string, limit = 20) {
  return await db
    .select()
    .from(notifications)
    .where(eq(notifications.userId, userId))
    .orderBy(desc(notifications.createdAt))
    .limit(limit);
}

export async function markNotificationAsRead(notificationId: string, userId: string) {
  await db
    .update(notifications)
    .set({
      isRead: true,
    })
    .where(and(eq(notifications.id, notificationId), eq(notifications.userId, userId)));

  return { success: true };
}

export async function markAllNotificationsAsRead(userId: string) {
  await db
    .update(notifications)
    .set({
      isRead: true,
    })
    .where(and(eq(notifications.userId, userId), eq(notifications.isRead, false)));

  return { success: true };
}
