"use server";

import { requireAuth } from "@/lib/rbac";
import { db } from "@/db";
import {
  artworks,
  artworkVersions,
  portfolioEntries,
  profiles,
  tags,
  artworkTags,
  auditLogs,
} from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import path from "path";
import crypto from "crypto";
import {
  stageAndPromoteMedia,
  cleanupPromotedMedia,
  createArtworkWithUniqueSlug,
} from "@/lib/services/submissionService";
import {
  togglePortfolioEntryVisibilityService,
  updatePortfolioEntryCustomCaptionService,
} from "@/lib/services/portfolioService";

export async function createArtworkUploadAction(formData: FormData) {
  const user = await requireAuth("/login");

  const [profile] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.userId, user.id))
    .limit(1);

  if (!profile) {
    throw new Error("Profil artist tidak ditemukan.");
  }

  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) {
    throw new Error("Silakan pilih file karya untuk diunggah.");
  }

  const title = (formData.get("title") as string)?.trim() || "Untitled Artwork";
  const description = (formData.get("caption") as string)?.trim() || null;
  const audience = ((formData.get("audience") as string) || "public") as
    | "public"
    | "members_only"
    | "unlisted"
    | "private";
  const critiqueMode = ((formData.get("critiqueMode") as string) || "showcase_only") as
    | "showcase_only"
    | "open_for_critique";
  const isSpoiler = formData.get("isSpoiler") === "true" || formData.get("isSpoiler") === "1" || formData.get("isSpoiler") === "on";
  const tagsRaw = (formData.get("tags") as string) || "";

  const rawTagsList = tagsRaw
    ? tagsRaw
        .split(",")
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean)
    : [];

  const buffer = Buffer.from(await file.arrayBuffer());

  // Two-Phase: Pre-tx validation, derivative processing & promotion to durable unreferenced storage keys
  const staged = await stageAndPromoteMedia({
    buffer,
    name: file.name,
    type: file.type,
    size: file.size,
  });

  try {
    const result = await db.transaction(async (tx) => {
      // 1. Create Artwork with PostgreSQL-safe slug retry loop
      const artwork = await createArtworkWithUniqueSlug(tx, {
        userId: user.id,
        title,
        description,
        mediaType: staged.mediaType,
        audience,
        critiqueMode: critiqueMode as any,
        isSpoiler,
      });

      // 2. Create Artwork Version 1 referencing durable storage keys
      const [version] = await tx
        .insert(artworkVersions)
        .values({
          artworkId: artwork.id,
          versionNumber: 1,
          mediaType: staged.mediaType,
          masterStorageKey: staged.masterStorageKey,
          publicStorageKey: staged.publicStorageKey,
          thumbnailStorageKey: staged.thumbnailStorageKey,
          mimeType: staged.mimeType,
          fileSizeBytes: staged.fileSizeBytes,
          width: staged.width,
          height: staged.height,
          checksumSha256: staged.checksumSha256,
          processingStatus: "ready",
        })
        .returning();

      await tx
        .update(artworks)
        .set({ currentVersionId: version.id })
        .where(eq(artworks.id, artwork.id));

      // 3. Atomically Create Portfolio Entry (is_visible = true, captions = null)
      await tx.insert(portfolioEntries).values({
        profileId: profile.id,
        artworkId: artwork.id,
        displayOrder: 0,
        isPinned: false,
        systemCaption: null,
        customCaption: null,
        isVisible: true,
      });

      // 4. Attach Tags
      for (const tagName of rawTagsList) {
        let [existingTag] = await tx.select().from(tags).where(eq(tags.slug, tagName)).limit(1);
        if (!existingTag) {
          [existingTag] = await tx
            .insert(tags)
            .values({ name: tagName, slug: tagName })
            .returning();
        }
        await tx.insert(artworkTags).values({
          artworkId: artwork.id,
          tagId: existingTag.id,
        });
      }

      // 5. Audit log
      await tx.insert(auditLogs).values({
        actorId: user.id,
        action: "artwork.uploaded",
        targetType: "artwork",
        targetId: artwork.id,
        reason: `Unggah karya baru '${title}'.`,
      });

      return { artwork, version };
    });

    revalidatePath("/me/portfolio");
    revalidatePath("/gallery");
    revalidatePath(`/artists/${profile.slug}`);

    return { success: true, artworkId: result.artwork.id, slug: result.artwork.slug };
  } catch (err) {
    await cleanupPromotedMedia(staged);
    throw err;
  }
}

export async function updateArtworkAction(formData: FormData) {
  const user = await requireAuth("/login");

  const artworkId = formData.get("artworkId") as string;
  const title = (formData.get("title") as string)?.trim();
  const description = (formData.get("description") as string)?.trim() || null;
  const audience = (formData.get("audience") as string) as "public" | "members_only" | "unlisted" | "private" | undefined;
  const critiqueMode = (formData.get("critiqueMode") as string) as "showcase_only" | "general" | "detailed" | undefined;
  const isSpoilerVal = formData.get("isSpoiler");
  const isSpoiler = isSpoilerVal !== null ? (isSpoilerVal === "true" || isSpoilerVal === "1" || isSpoilerVal === "on") : undefined;

  if (!artworkId || !title) {
    throw new Error("Data karya tidak lengkap.");
  }

  const [artwork] = await db
    .select()
    .from(artworks)
    .where(eq(artworks.id, artworkId))
    .limit(1);

  if (!artwork || artwork.userId !== user.id) {
    throw new Error("Karya tidak ditemukan atau Anda tidak memiliki izin.");
  }

  const updateFields: Record<string, any> = {
    title,
    description,
    updatedAt: new Date(),
  };

  if (audience) updateFields.audience = audience;
  if (critiqueMode) updateFields.critiqueMode = critiqueMode;
  if (isSpoiler !== undefined) updateFields.isSpoiler = isSpoiler;

  const [updated] = await db
    .update(artworks)
    .set(updateFields)
    .where(eq(artworks.id, artworkId))
    .returning();

  revalidatePath("/me/portfolio");
  revalidatePath("/gallery");
  revalidatePath(`/artworks/${artwork.slug}`);

  return { success: true, artwork: updated };
}

export async function toggleArtworkPortfolioVisibilityAction(artworkId: string, isVisible: boolean) {
  const user = await requireAuth("/login");

  const result = await db.transaction(async (tx) => {
    return await togglePortfolioEntryVisibilityService(tx, {
      actorUserId: user.id,
      artworkId,
      isVisible,
    });
  });

  revalidatePath("/me/portfolio");
  revalidatePath("/gallery");

  return { success: true, result };
}

export async function updatePortfolioCustomCaptionAction(artworkId: string, customCaption: string | null) {
  const user = await requireAuth("/login");

  const result = await db.transaction(async (tx) => {
    return await updatePortfolioEntryCustomCaptionService(tx, {
      actorUserId: user.id,
      artworkId,
      customCaption,
    });
  });

  revalidatePath("/me/portfolio");

  return { success: true, result };
}

export async function deleteArtworkAction(artworkId: string) {
  const user = await requireAuth("/login");

  const [artwork] = await db
    .select()
    .from(artworks)
    .where(eq(artworks.id, artworkId))
    .limit(1);

  if (!artwork || (artwork.userId !== user.id && user.role !== "admin")) {
    throw new Error("Anda tidak memiliki izin untuk menghapus karya ini.");
  }

  // Soft delete to protect historical challenge submissions & results integrity
  await db
    .update(artworks)
    .set({
      deletedAt: new Date(),
      publicationStatus: "hidden",
      updatedAt: new Date(),
    })
    .where(eq(artworks.id, artworkId));

  await db.insert(auditLogs).values({
    actorId: user.id,
    action: "artwork.soft_deleted",
    targetType: "artwork",
    targetId: artworkId,
    reason: "Karya dihapus oleh pemilik atau administrator.",
  });

  revalidatePath("/me/portfolio");
  revalidatePath("/gallery");
  revalidatePath(`/artworks/${artwork.slug}`);

  return { success: true };
}
