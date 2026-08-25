"use server";

import { requireAuth } from "@/lib/rbac";
import { db } from "@/db";
import { profiles, users, auditLogs } from "@/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const updateProfileSchema = z.object({
  displayName: z.string().min(2).max(50),
  bio: z.string().max(1000).optional().nullable(),
  specialties: z.array(z.string()).max(10).optional(),
  software: z.array(z.string()).max(15).optional(),
  location: z.string().max(100).optional().nullable(),
  languages: z.array(z.string()).max(5).optional(),
  whatsappNumber: z.string().max(30).optional().nullable(),
  whatsappEnabled: z.boolean().default(false),
  commissionStatus: z.enum(["open", "waitlist", "closed"]).default("closed"),
  waitlistMaxSlots: z.number().int().min(0).max(100).optional().nullable(),
  waitlistCurrentSlots: z.number().int().min(0).max(100).optional().nullable(),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

export async function updateProfileAction(input: UpdateProfileInput) {
  const user = await requireAuth("/login");
  const parsed = updateProfileSchema.parse(input);

  const [existingProfile] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.userId, user.id))
    .limit(1);

  if (!existingProfile) {
    throw new Error("Profil tidak ditemukan.");
  }

  // Update profile status from incomplete to complete if display name and bio are filled
  const profileStatus =
    parsed.displayName && parsed.bio ? "active_public" : existingProfile.profileStatus;

  await db
    .update(profiles)
    .set({
      displayName: parsed.displayName,
      bio: parsed.bio,
      specialties: parsed.specialties || [],
      software: parsed.software || [],
      location: parsed.location,
      languages: parsed.languages || [],
      whatsappNumber: parsed.whatsappNumber,
      waConsentGiven: parsed.whatsappEnabled,
      contactPreference: parsed.whatsappEnabled ? "public_wa" : "no_wa",
      commissionStatus: parsed.commissionStatus,
      waitlistMaxSlots: parsed.waitlistMaxSlots,
      waitlistCurrentSlots: parsed.waitlistCurrentSlots || 0,
      profileStatus,
      updatedAt: new Date(),
    })
    .where(eq(profiles.id, existingProfile.id));

  // Audit log
  await db.insert(auditLogs).values({
    actorId: user.id,
    action: "profile.updated",
    targetType: "profile",
    targetId: existingProfile.id,
    metadata: {
      commissionStatus: parsed.commissionStatus,
      waConsentGiven: parsed.whatsappEnabled,
    },
  });

  revalidatePath("/me/profile");
  revalidatePath(`/artists/${existingProfile.slug}`);
  revalidatePath("/dashboard");

  return { success: true };
}
