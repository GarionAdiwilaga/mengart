"use server";

import { requireAuth } from "@/lib/rbac";
import { db } from "@/db";
import { siteSettings, auditLogs } from "@/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export async function getSiteSetting(key: string): Promise<string | null> {
  const [setting] = await db
    .select({ value: siteSettings.value })
    .from(siteSettings)
    .where(eq(siteSettings.key, key))
    .limit(1);

  return setting?.value ?? null;
}

export async function updateSiteSettingAction(key: string, value: string) {
  const user = await requireAuth("/login");

  if (user.role !== "admin") {
    throw new Error("Hanya Administrator yang dapat mengubah pengaturan situs.");
  }

  const trimmedKey = key.trim();
  const trimmedValue = value.trim();

  if (!trimmedKey) {
    throw new Error("Kunci pengaturan tidak boleh kosong.");
  }

  await db
    .insert(siteSettings)
    .values({
      key: trimmedKey,
      value: trimmedValue,
      updatedAt: new Date(),
      updatedBy: user.id,
    })
    .onConflictDoUpdate({
      target: siteSettings.key,
      set: {
        value: trimmedValue,
        updatedAt: new Date(),
        updatedBy: user.id,
      },
    });

  await db.insert(auditLogs).values({
    actorId: user.id,
    action: "setting.update",
    targetType: "site_settings",
    targetId: trimmedKey,
    metadata: {
      key: trimmedKey,
      updatedBy: user.id,
      preview: trimmedValue.slice(0, 100),
    },
  });

  revalidatePath("/");
  return { success: true };
}
