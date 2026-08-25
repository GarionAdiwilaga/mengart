"use server";

import { requireAuth } from "@/lib/rbac";
import { db } from "@/db";
import {
  commissionServices,
  commissionScopeRules,
  profiles,
  auditLogs,
} from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const commissionServiceSchema = z.object({
  id: z.string().uuid().optional(),
  title: z.string().min(2).max(100),
  description: z.string().max(1000).optional().nullable(),
  category: z.string().default("Character Illustration"),
  pricingType: z.enum(["fixed", "starting_from", "range", "contact_for_quote"]).default("starting_from"),
  currency: z.string().default("IDR"),
  minPrice: z.number().min(0).optional().nullable(),
  maxPrice: z.number().min(0).optional().nullable(),
  minTurnaroundDays: z.number().int().min(1).max(365).default(3),
  maxTurnaroundDays: z.number().int().min(1).max(365).default(14),
  includedRevisions: z.number().int().min(0).max(50).default(2),
  commercialUseAvailable: z.boolean().default(false),
  orderDestination: z.enum(["whatsapp", "vgen", "artistree", "kofi", "trakteer", "custom_url"]).default("whatsapp"),
  customDestinationUrl: z.string().url().optional().nullable(),
  serviceStatus: z.enum(["draft", "published", "unavailable", "hidden"]).default("published"),
});

export type CommissionServiceInput = z.infer<typeof commissionServiceSchema>;

export async function saveCommissionServiceAction(input: CommissionServiceInput) {
  const user = await requireAuth("/login");
  const parsed = commissionServiceSchema.parse(input);

  const [profile] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.userId, user.id))
    .limit(1);

  if (!profile) throw new Error("Profil tidak ditemukan.");

  if (parsed.id) {
    // Update existing service
    const [existing] = await db
      .select()
      .from(commissionServices)
      .where(and(eq(commissionServices.id, parsed.id), eq(commissionServices.profileId, profile.id)))
      .limit(1);

    if (!existing) throw new Error("Layanan komisi tidak ditemukan.");

    await db
      .update(commissionServices)
      .set({
        title: parsed.title,
        description: parsed.description,
        category: parsed.category,
        pricingType: parsed.pricingType,
        currency: parsed.currency,
        minPrice: parsed.minPrice ? String(parsed.minPrice) : null,
        maxPrice: parsed.maxPrice ? String(parsed.maxPrice) : null,
        minTurnaroundDays: parsed.minTurnaroundDays,
        maxTurnaroundDays: parsed.maxTurnaroundDays,
        includedRevisions: parsed.includedRevisions,
        commercialUseAvailable: parsed.commercialUseAvailable,
        orderDestination: parsed.orderDestination,
        customDestinationUrl: parsed.customDestinationUrl,
        serviceStatus: parsed.serviceStatus,
        updatedAt: new Date(),
      })
      .where(eq(commissionServices.id, parsed.id));
  } else {
    // Create new service
    await db.insert(commissionServices).values({
      profileId: profile.id,
      title: parsed.title,
      description: parsed.description,
      category: parsed.category,
      pricingType: parsed.pricingType,
      currency: parsed.currency,
      minPrice: parsed.minPrice ? String(parsed.minPrice) : null,
      maxPrice: parsed.maxPrice ? String(parsed.maxPrice) : null,
      minTurnaroundDays: parsed.minTurnaroundDays,
      maxTurnaroundDays: parsed.maxTurnaroundDays,
      includedRevisions: parsed.includedRevisions,
      commercialUseAvailable: parsed.commercialUseAvailable,
      orderDestination: parsed.orderDestination,
      customDestinationUrl: parsed.customDestinationUrl,
      serviceStatus: parsed.serviceStatus,
    });
  }

  revalidatePath("/me/commissions");
  revalidatePath("/commissions");
  revalidatePath(`/artists/${profile.slug}`);

  return { success: true };
}

export async function deleteCommissionServiceAction(serviceId: string) {
  const user = await requireAuth("/login");

  const [profile] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.userId, user.id))
    .limit(1);

  if (!profile) throw new Error("Profil tidak ditemukan.");

  await db
    .delete(commissionServices)
    .where(and(eq(commissionServices.id, serviceId), eq(commissionServices.profileId, profile.id)));

  revalidatePath("/me/commissions");
  revalidatePath("/commissions");
  revalidatePath(`/artists/${profile.slug}`);

  return { success: true };
}

export async function saveCommissionScopeRulesAction(
  rules: Array<{
    ruleType: "do" | "dont" | "general";
    title: string;
    description?: string | null;
    displayOrder: number;
  }>
) {
  const user = await requireAuth("/login");

  const [profile] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.userId, user.id))
    .limit(1);

  if (!profile) throw new Error("Profil tidak ditemukan.");

  // Transactionally replace rules
  await db.transaction(async (tx) => {
    await tx
      .delete(commissionScopeRules)
      .where(eq(commissionScopeRules.profileId, profile.id));

    if (rules.length > 0) {
      await tx.insert(commissionScopeRules).values(
        rules.map((r, i) => ({
          profileId: profile.id,
          ruleType: r.ruleType,
          title: r.title,
          description: r.description,
          displayOrder: r.displayOrder ?? i,
        }))
      );
    }
  });

  revalidatePath("/me/commissions");
  revalidatePath(`/artists/${profile.slug}`);

  return { success: true };
}
