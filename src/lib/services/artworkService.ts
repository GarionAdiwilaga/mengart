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
import { eq, and } from "drizzle-orm";
import { assertActiveMember } from "@/lib/rbac";
import {
  createArtworkWithUniqueSlug,
  type StagedMediaResult,
} from "@/lib/services/submissionService";

/**
 * Service to atomically create an ordinary portfolio artwork with backing version,
 * initial portfolio entry (isVisible = true), tags, and audit logging.
 */
export async function createArtworkUploadService(
  tx: any,
  params: {
    actorUserId: string;
    title: string;
    description: string | null;
    audience: "public" | "members_only" | "unlisted" | "private";
    critiqueMode: "showcase_only" | "open_for_critique";
    isSpoiler: boolean;
    tagsList: string[];
    staged: StagedMediaResult;
    forceCollisionSlug?: string;
  }
) {
  // 1. In-transaction live ACTIVE member assertion
  const actor = await assertActiveMember(tx, params.actorUserId);

  const [profile] = await tx
    .select()
    .from(profiles)
    .where(eq(profiles.userId, actor.id))
    .limit(1);

  if (!profile) {
    throw new Error("Profil artist tidak ditemukan.");
  }

  // 2. Create Artwork with PostgreSQL-safe slug retry loop
  const artwork = await createArtworkWithUniqueSlug(tx, {
    userId: actor.id,
    title: params.title,
    description: params.description,
    mediaType: params.staged.mediaType,
    audience: params.audience,
    critiqueMode: params.critiqueMode,
    isSpoiler: params.isSpoiler,
    forceCollisionSlug: params.forceCollisionSlug,
  });

  // 3. Create Artwork Version 1
  const [version] = await tx
    .insert(artworkVersions)
    .values({
      artworkId: artwork.id,
      versionNumber: 1,
      mediaType: params.staged.mediaType,
      masterStorageKey: params.staged.masterStorageKey,
      publicStorageKey: params.staged.publicStorageKey,
      thumbnailStorageKey: params.staged.thumbnailStorageKey,
      mimeType: params.staged.mimeType,
      fileSizeBytes: params.staged.fileSizeBytes,
      width: params.staged.width,
      height: params.staged.height,
      checksumSha256: params.staged.checksumSha256,
      processingStatus: "ready",
    })
    .returning();

  await tx
    .update(artworks)
    .set({ currentVersionId: version.id })
    .where(eq(artworks.id, artwork.id));

  // 4. Atomically Create Portfolio Entry (is_visible = true, captions = null)
  const [entry] = await tx
    .insert(portfolioEntries)
    .values({
      profileId: profile.id,
      artworkId: artwork.id,
      displayOrder: 0,
      isPinned: false,
      systemCaption: null,
      customCaption: null,
      isVisible: true,
    })
    .returning();

  // 5. Attach Tags
  for (const tagName of params.tagsList) {
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

  // 6. Record Audit Log
  await tx.insert(auditLogs).values({
    actorId: actor.id,
    action: "artwork.uploaded",
    targetType: "artwork",
    targetId: artwork.id,
    reason: `Unggah karya baru '${params.title}'.`,
  });

  return { artwork, version, portfolioEntry: entry, profile };
}

/**
 * Service to update artwork metadata, audience, critiqueMode, and isSpoiler with in-tx active ownership.
 */
export async function updateArtworkService(
  tx: any,
  params: {
    actorUserId: string;
    artworkId: string;
    title: string;
    description?: string | null;
    audience?: "public" | "members_only" | "unlisted" | "private";
    critiqueMode?: "showcase_only" | "open_for_critique" | "general" | "detailed";
    isSpoiler?: boolean;
  }
) {
  // 1. In-transaction live ACTIVE assertion
  const actor = await assertActiveMember(tx, params.actorUserId);

  // 2. Load and lock artwork FOR UPDATE
  const [artwork] = await tx
    .select()
    .from(artworks)
    .where(eq(artworks.id, params.artworkId))
    .for("update");

  if (!artwork) {
    throw new Error("Karya tidak ditemukan.");
  }

  // 3. Ownership verification
  const isOwner = artwork.userId === actor.id;
  const isAdmin = actor.role === "admin";
  if (!isOwner && !isAdmin) {
    throw new Error("Anda bukan pemilik karya ini.");
  }

  // 4. Perform update
  const updateFields: Record<string, any> = {
    title: params.title.trim(),
    description:
      params.description !== undefined
        ? params.description?.trim() || null
        : artwork.description,
    updatedAt: new Date(),
  };

  if (params.audience) updateFields.audience = params.audience;
  if (params.critiqueMode) updateFields.critiqueMode = params.critiqueMode as any;
  if (params.isSpoiler !== undefined) updateFields.isSpoiler = params.isSpoiler;

  const [updated] = await tx
    .update(artworks)
    .set(updateFields)
    .where(eq(artworks.id, params.artworkId))
    .returning();

  // 5. Record Audit Log
  await tx.insert(auditLogs).values({
    actorId: actor.id,
    action: "artwork.updated",
    targetType: "artwork",
    targetId: params.artworkId,
    reason: `Pembaruan metadata karya '${params.title}'.`,
  });

  return updated;
}

/**
 * Service to toggle an artwork's spoiler status with in-tx active ownership.
 */
export async function toggleArtworkSpoilerService(
  tx: any,
  params: {
    actorUserId: string;
    artworkId: string;
    isSpoiler: boolean;
  }
) {
  const actor = await assertActiveMember(tx, params.actorUserId);

  const [artwork] = await tx
    .select()
    .from(artworks)
    .where(eq(artworks.id, params.artworkId))
    .for("update");

  if (!artwork) {
    throw new Error("Karya tidak ditemukan.");
  }

  const isOwner = artwork.userId === actor.id;
  const isAdmin = actor.role === "admin";
  if (!isOwner && !isAdmin) {
    throw new Error("Anda bukan pemilik karya ini.");
  }

  const [updated] = await tx
    .update(artworks)
    .set({
      isSpoiler: params.isSpoiler,
      updatedAt: new Date(),
    })
    .where(eq(artworks.id, params.artworkId))
    .returning();

  await tx.insert(auditLogs).values({
    actorId: actor.id,
    action: "artwork.spoiler_toggled",
    targetType: "artwork",
    targetId: params.artworkId,
    reason: `Pengubahan status spoiler karya '${artwork.title}' menjadi ${params.isSpoiler}.`,
  });

  return updated;
}

/**
 * Service to soft-delete an artwork with in-tx active ownership.
 */
export async function deleteArtworkService(
  tx: any,
  params: {
    actorUserId: string;
    artworkId: string;
  }
) {
  const actor = await assertActiveMember(tx, params.actorUserId);

  const [artwork] = await tx
    .select()
    .from(artworks)
    .where(eq(artworks.id, params.artworkId))
    .for("update");

  if (!artwork) {
    throw new Error("Karya tidak ditemukan.");
  }

  const isOwner = artwork.userId === actor.id;
  const isAdmin = actor.role === "admin";
  if (!isOwner && !isAdmin) {
    throw new Error("Anda tidak memiliki izin untuk menghapus karya ini.");
  }

  // Soft delete to protect challenge submissions & results FK integrity
  const [deleted] = await tx
    .update(artworks)
    .set({
      deletedAt: new Date(),
      publicationStatus: "hidden",
      updatedAt: new Date(),
    })
    .where(eq(artworks.id, params.artworkId))
    .returning();

  await tx.insert(auditLogs).values({
    actorId: actor.id,
    action: "artwork.soft_deleted",
    targetType: "artwork",
    targetId: params.artworkId,
    reason: "Karya dihapus oleh pemilik atau administrator.",
  });

  return deleted;
}
