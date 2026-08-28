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
import { eq, desc } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import { resolveStoragePath, ensureStorageDirectories } from "@/lib/storage";
import { mediaQueue } from "@/lib/queue";
import { processArtworkMediaJob } from "@/lib/mediaProcessor";

function slugify(text: string): string {
  const base = text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const rand = crypto.randomBytes(3).toString("hex");
  return `${base || "karya"}-${rand}`;
}

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
  const tagsRaw = (formData.get("tags") as string) || "";

  const rawTagsList = tagsRaw
    ? tagsRaw
        .split(",")
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean)
    : [];

  // Determine media type
  const mime = file.type.toLowerCase() || "image/jpeg";
  const ext = path.extname(file.name).toLowerCase();
  let mediaType: "image" | "gif" | "video" = "image";

  if (mime === "image/gif" || ext === ".gif") {
    mediaType = "gif";
  } else if (
    mime.startsWith("video/") ||
    ext === ".mp4" ||
    ext === ".webm" ||
    ext === ".mov"
  ) {
    mediaType = "video";
  } else if (
    !["image/jpeg", "image/png", "image/webp", ".jpg", ".jpeg", ".png", ".webp"].some(
      (valid) => mime === valid || ext === valid
    )
  ) {
    throw new Error("Format file tidak didukung. Gunakan JPG, PNG, WebP, GIF, atau MP4/WebM.");
  }

  // Size limit validation (25MB for static image, 50MB for gif/video)
  const maxBytes = mediaType === "image" ? 25 * 1024 * 1024 : 50 * 1024 * 1024;
  if (file.size > maxBytes) {
    throw new Error(
      `Ukuran file melebihi batas (${mediaType === "image" ? "25MB" : "50MB"}).`
    );
  }

  await ensureStorageDirectories();

  // Save temporary upload
  const tempFilename = `temp_${Date.now()}_${crypto.randomBytes(16).toString("hex")}${ext}`;
  const tempFilePath = resolveStoragePath("temp", tempFilename);
  const buffer = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(tempFilePath, buffer);

  const slug = slugify(title);

  // Database transaction for artwork record
  const result = await db.transaction(async (tx) => {
    // 1. Create Artwork
    const [artwork] = await tx
      .insert(artworks)
      .values({
        userId: user.id,
        title,
        slug,
        description,
        mediaType,
        audience,
        critiqueMode,
        publicationStatus: "processing",
      })
      .returning();

    // 2. Create Artwork Version 1
    const [version] = await tx
      .insert(artworkVersions)
      .values({
        artworkId: artwork.id,
        versionNumber: 1,
        mediaType,
        masterStorageKey: tempFilename,
        mimeType: mime,
        fileSizeBytes: file.size,
        checksumSha256: crypto.createHash("sha256").update(buffer).digest("hex"),
        processingStatus: "pending",
      })
      .returning();

    // 3. Create Portfolio Entry
    await tx.insert(portfolioEntries).values({
      profileId: profile.id,
      artworkId: artwork.id,
      displayOrder: 0,
      isPinned: false,
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
      metadata: { title, mediaType, size: file.size },
    });

    return { artwork, version };
  });

  const jobData = {
    artworkId: result.artwork.id,
    versionId: result.version.id,
    tempFilename,
    mediaType,
    originalFilename: file.name,
    userId: user.id,
  };

  // Enqueue async BullMQ processing job; also process immediately inline if queue is not active
  try {
    await mediaQueue.add("process-artwork-media", jobData);
  } catch (queueErr) {
    console.warn("Queue dispatch fallback, processing inline:", queueErr);
    await processArtworkMediaJob(jobData);
  }

  revalidatePath("/me/portfolio");
  revalidatePath("/gallery");
  revalidatePath(`/artists/${profile.slug}`);

  return { success: true, artworkId: result.artwork.id, slug: result.artwork.slug };
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
    metadata: { title: artwork.title, slug: artwork.slug },
  });

  revalidatePath("/me/portfolio");
  revalidatePath("/gallery");
  revalidatePath(`/artworks/${artwork.slug}`);

  return { success: true };
}
