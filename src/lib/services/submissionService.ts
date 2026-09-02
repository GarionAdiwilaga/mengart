import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import sharp from "sharp";
import { execFile } from "child_process";
import { promisify } from "util";
import { db } from "@/db";
import {
  challenges,
  challengeSubmissions,
  artworks,
  artworkVersions,
  profiles,
  auditLogs,
} from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { assertActiveMember } from "@/lib/rbac";
import { slugify } from "@/lib/challenges";
import {
  STORAGE_PATHS,
  resolveStoragePath,
  generateStorageKey,
  ensureStorageDirectories,
} from "@/lib/storage";

import {
  validateAndInspectMediaContent,
  generateWatermarkedDerivatives,
  type ValidatedMediaType,
} from "@/lib/services/mediaValidation";

export interface StagedMediaResult {
  masterStorageKey: string;
  publicStorageKey: string;
  thumbnailStorageKey: string;
  checksumSha256: string;
  mimeType: string;
  fileSizeBytes: number;
  width: number | null;
  height: number | null;
  mediaType: ValidatedMediaType;
}

/**
 * Validates, processes derivatives, and promotes media files to durable unreferenced storage keys.
 * Implements single authoritative validation, safe decode limits, metadata stripping, usable non-empty derivatives, and exhaustive partial-file cleanup.
 */
export async function stageAndPromoteMedia(file: {
  buffer: Buffer;
  name: string;
  type: string;
  size: number;
}): Promise<StagedMediaResult> {
  await ensureStorageDirectories();

  // 1. Authoritative Validation & Inspection via Single Media Engine
  const validated = await validateAndInspectMediaContent(file);

  // Derive storage extensions strictly from validated internal media type (NEVER from raw file.name)
  let masterExt = "png";
  let publicExt = "webp";
  if (validated.mediaType === "video") {
    masterExt = "mp4";
    publicExt = "mp4";
  } else if (validated.mediaType === "image") {
    if (validated.detectedFormat === "jpeg") {
      masterExt = "jpg";
    } else if (validated.detectedFormat === "png") {
      masterExt = "png";
    } else if (validated.detectedFormat === "webp") {
      masterExt = "webp";
    } else {
      masterExt = "png";
    }
    publicExt = "webp";
  }

  const masterStorageKey = generateStorageKey("master", masterExt);
  const publicStorageKey = generateStorageKey("public", publicExt);
  const thumbnailStorageKey = generateStorageKey("thumb", "webp");

  const masterPath = resolveStoragePath("master", masterStorageKey);
  const publicPath = resolveStoragePath("public", publicStorageKey);
  const thumbPath = resolveStoragePath("public", thumbnailStorageKey);
  const posterTempPath = resolveStoragePath("temp", `poster_${Date.now()}_${crypto.randomBytes(4).toString("hex")}.png`);

  const attemptPaths = [masterPath, publicPath, thumbPath, posterTempPath];

  try {
    // 2. Generate Watermarked Derivatives & Clean Master via Single Media Engine
    const transformResult = await generateWatermarkedDerivatives({
      buffer: file.buffer,
      mediaType: validated.mediaType,
      masterPath,
      publicPath,
      thumbPath,
      posterTempPath,
    });

    return {
      masterStorageKey,
      publicStorageKey,
      thumbnailStorageKey,
      checksumSha256: validated.checksumSha256,
      mimeType: validated.mimeType,
      fileSizeBytes: validated.fileSizeBytes,
      width: transformResult.width,
      height: transformResult.height,
      mediaType: validated.mediaType,
    };
  } catch (err) {
    // Exhaustive cleanup: unlink all attempt paths
    await Promise.allSettled(
      attemptPaths.map(async (filePath) => {
        try {
          await fs.unlink(filePath);
        } catch (_e) {
          // Ignore missing file during exhaustive cleanup
        }
      })
    );
    throw err;
  } finally {
    await fs.unlink(posterTempPath).catch(() => {});
  }
}

/**
 * Clean up newly promoted durable storage files if a database transaction fails.
 */
export async function cleanupPromotedMedia(media: {
  masterStorageKey?: string | null;
  publicStorageKey?: string | null;
  thumbnailStorageKey?: string | null;
}) {
  const keysToClean: Array<["master" | "public", string | null | undefined]> = [
    ["master", media.masterStorageKey],
    ["public", media.publicStorageKey],
    ["public", media.thumbnailStorageKey],
  ];

  for (const [type, key] of keysToClean) {
    if (key) {
      try {
        const filePath = resolveStoragePath(type, key);
        await fs.unlink(filePath).catch(() => {});
      } catch (_err) {
        // Ignore unlinking errors during cleanup
      }
    }
  }
}

/**
 * PostgreSQL-safe slug insertion with bounded retry loop using ON CONFLICT (slug) DO NOTHING.
 */
export async function createArtworkWithUniqueSlug(
  tx: any,
  params: {
    userId: string;
    title: string;
    description?: string | null;
    mediaType: "image" | "gif" | "video";
    audience: "public" | "members_only" | "unlisted" | "private";
    critiqueMode?: "showcase_only" | "open_for_critique" | "general" | "detailed";
    isSpoiler: boolean;
    forceCollisionSlug?: string; // For testing collision retry
  }
) {
  const baseSlug = slugify(params.title);
  const maxRetries = 5;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    let candidateSlug: string;
    if (attempt === 0 && params.forceCollisionSlug) {
      candidateSlug = params.forceCollisionSlug;
    } else if (attempt === 0) {
      candidateSlug = `${baseSlug}-${crypto.randomBytes(3).toString("hex")}`;
    } else {
      candidateSlug = `${baseSlug}-${crypto.randomBytes(4).toString("hex")}-${attempt}`;
    }

    const [artwork] = await tx
      .insert(artworks)
      .values({
        userId: params.userId,
        title: params.title,
        slug: candidateSlug,
        description: params.description,
        mediaType: params.mediaType,
        audience: params.audience,
        critiqueMode: params.critiqueMode,
        publicationStatus: "published",
        isSpoiler: params.isSpoiler,
      })
      .onConflictDoNothing({ target: artworks.slug })
      .returning();

    if (artwork) {
      return artwork;
    }
    // Row was not returned due to conflict on artworks.slug -> loop to retry with new candidateSlug
  }

  throw new Error("Gagal membuat tautan karya unik setelah beberapa percobaan. Silakan coba lagi.");
}

/**
 * Canonical Challenge Submission Creation Service.
 * Implements two-phase staging + durable promotion + atomic DB transaction.
 * Zero portfolio entries are created before challenge completion.
 */
export async function createChallengeSubmissionService(params: {
  actorUserId: string;
  challengeId: string;
  title: string;
  description?: string | null;
  softwareUsed?: string | null;
  isSpoiler?: boolean;
  file: {
    buffer: Buffer;
    name: string;
    type: string;
    size: number;
  };
  forceCollisionSlug?: string; // Test fixture hook
}) {
  // Phase 1: Pre-Transaction Staging & Durable Promotion
  const staged = await stageAndPromoteMedia(params.file);

  try {
    // Phase 2: Atomic DB Transaction
    return await db.transaction(async (tx) => {
      const actor = await assertActiveMember(tx, params.actorUserId);

      // Lock challenge FOR UPDATE and verify deadline & status
      const [challenge] = await tx
        .select()
        .from(challenges)
        .where(eq(challenges.id, params.challengeId))
        .for("update");

      if (!challenge) {
        throw new Error("Challenge tidak ditemukan.");
      }

      if (challenge.status !== "submission_open") {
        throw new Error(`Submisi tidak dibuka untuk challenge ini (Status saat ini: ${challenge.status}).`);
      }

      const now = new Date();
      if (challenge.submissionDeadline && now > new Date(challenge.submissionDeadline)) {
        throw new Error("Batas waktu submisi telah berakhir.");
      }

      // Check unique constraint on (challenge_id, user_id)
      const existing = await tx
        .select({ id: challengeSubmissions.id })
        .from(challengeSubmissions)
        .where(
          and(
            eq(challengeSubmissions.challengeId, params.challengeId),
            eq(challengeSubmissions.userId, actor.id)
          )
        );

      if (existing.length > 0) {
        throw new Error("Submisi sudah ada untuk challenge ini. Gunakan fitur ganti karya / revisi.");
      }

      const [profile] = await tx
        .select()
        .from(profiles)
        .where(eq(profiles.userId, actor.id));

      if (!profile) {
        throw new Error("Profil artist tidak ditemukan.");
      }

      // 1. Create canonical backing artwork
      const artwork = await createArtworkWithUniqueSlug(tx, {
        userId: actor.id,
        title: params.title,
        description: params.description,
        mediaType: staged.mediaType,
        audience: "public",
        critiqueMode: "showcase_only",
        isSpoiler: params.isSpoiler ?? false,
        forceCollisionSlug: params.forceCollisionSlug,
      });

      // 2. Create artwork_versions (version 1)
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

      // 3. Create canonical challenge submission
      const [submission] = await tx
        .insert(challengeSubmissions)
        .values({
          challengeId: challenge.id,
          userId: actor.id,
          profileId: profile.id,
          artworkId: artwork.id,
          artworkVersionId: version.id,
          title: params.title.trim(),
          description: params.description?.trim() || null,
          softwareUsed: params.softwareUsed?.trim() || null,
          submissionStatus: "submitted",
        })
        .returning();

      // 4. Audit Log
      await tx.insert(auditLogs).values({
        action: "challenge.submission_create",
        targetType: "challenge_submission",
        targetId: submission.id,
        actorId: actor.id,
        reason: `Submisi karya '${params.title}' ke challenge '${challenge.title}'.`,
      });

      return {
        submission,
        artwork,
        version,
      };
    });
  } catch (err) {
    // Rollback Cleanup: Unlink newly promoted durable storage files
    await cleanupPromotedMedia(staged);
    throw err;
  }
}

/**
 * Canonical Safe Media Replacement Service.
 * Implements pre-deadline media swap, preserves artwork.slug, updates metadata,
 * records replacement audit log, and cleans up newly promoted files on failure.
 */
export async function replaceChallengeSubmissionMediaService(params: {
  actorUserId: string;
  submissionId: string;
  title?: string;
  description?: string | null;
  softwareUsed?: string | null;
  isSpoiler?: boolean;
  file?: {
    buffer: Buffer;
    name: string;
    type: string;
    size: number;
  } | null;
}) {
  let staged: StagedMediaResult | null = null;
  if (params.file && params.file.size > 0) {
    staged = await stageAndPromoteMedia(params.file);
  }

  let oldMediaToClean: {
    masterStorageKey?: string | null;
    publicStorageKey?: string | null;
    thumbnailStorageKey?: string | null;
  } | null = null;

  try {
    const updatedSub = await db.transaction(async (tx) => {
      const actor = await assertActiveMember(tx, params.actorUserId);

      // Lock submission FOR UPDATE
      const [submission] = await tx
        .select()
        .from(challengeSubmissions)
        .where(eq(challengeSubmissions.id, params.submissionId))
        .for("update");

      if (!submission || submission.userId !== actor.id) {
        throw new Error("Submisi tidak ditemukan atau Anda bukan pemilik submisi ini.");
      }

      if (submission.submissionStatus !== "submitted") {
        throw new Error("Submisi yang telah didiskualifikasi tidak dapat diperbarui.");
      }

      // Lock challenge FOR UPDATE and verify deadline & status
      const [challenge] = await tx
        .select()
        .from(challenges)
        .where(eq(challenges.id, submission.challengeId))
        .for("update");

      if (!challenge) {
        throw new Error("Challenge tidak ditemukan.");
      }

      if (challenge.status !== "submission_open") {
        throw new Error(`Revisi tidak diizinkan saat status challenge '${challenge.status}'.`);
      }

      const now = new Date();
      if (challenge.submissionDeadline && now > new Date(challenge.submissionDeadline)) {
        throw new Error("Batas waktu submisi telah berakhir. Tidak dapat mengganti karya.");
      }

      let newArtworkVersionId = submission.artworkVersionId;

      if (staged) {
        // 1. Capture old version and storage keys before swapping
        const [oldVersion] = await tx
          .select()
          .from(artworkVersions)
          .where(eq(artworkVersions.id, submission.artworkVersionId))
          .for("update");

        if (oldVersion) {
          oldMediaToClean = {
            masterStorageKey: oldVersion.masterStorageKey,
            publicStorageKey: oldVersion.publicStorageKey,
            thumbnailStorageKey: oldVersion.thumbnailStorageKey,
          };
        }

        // Fetch current max version for this backing artwork
        const [maxVer] = await tx
          .select({ versionNumber: artworkVersions.versionNumber })
          .from(artworkVersions)
          .where(eq(artworkVersions.artworkId, submission.artworkId))
          .orderBy(sql`${artworkVersions.versionNumber} DESC`)
          .limit(1);

        const nextVerNumber = (maxVer?.versionNumber || 1) + 1;

        const [newVersion] = await tx
          .insert(artworkVersions)
          .values({
            artworkId: submission.artworkId,
            versionNumber: nextVerNumber,
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

        newArtworkVersionId = newVersion.id;

        // Update artwork currentVersionId
        await tx
          .update(artworks)
          .set({
            currentVersionId: newVersion.id,
            updatedAt: new Date(),
          })
          .where(eq(artworks.id, submission.artworkId));

        // Update challenge_submissions to point to newVersion.id
        await tx
          .update(challengeSubmissions)
          .set({
            artworkVersionId: newArtworkVersionId,
          })
          .where(eq(challengeSubmissions.id, submission.id));

        // Delete obsolete old version row from DB
        if (oldVersion) {
          await tx
            .delete(artworkVersions)
            .where(eq(artworkVersions.id, oldVersion.id));
        }
      }

      const newTitle = params.title !== undefined ? params.title.trim() : submission.title;
      const newDescription = params.description !== undefined ? (params.description?.trim() || null) : submission.description;
      const newSoftware = params.softwareUsed !== undefined ? (params.softwareUsed?.trim() || null) : submission.softwareUsed;

      // Update challenge_submissions metadata
      const [finalSub] = await tx
        .update(challengeSubmissions)
        .set({
          artworkVersionId: newArtworkVersionId,
          title: newTitle,
          description: newDescription,
          softwareUsed: newSoftware,
          updatedAt: new Date(),
        })
        .where(eq(challengeSubmissions.id, submission.id))
        .returning();

      // Update backing artwork metadata while preserving original artwork.slug
      const artworkUpdate: Record<string, any> = {
        title: newTitle,
        description: newDescription,
        updatedAt: new Date(),
      };
      if (params.isSpoiler !== undefined) {
        artworkUpdate.isSpoiler = params.isSpoiler;
      }

      await tx
        .update(artworks)
        .set(artworkUpdate)
        .where(eq(artworks.id, submission.artworkId));

      // Record Replacement Audit Log
      await tx.insert(auditLogs).values({
        action: "challenge.submission_replace",
        targetType: "challenge_submission",
        targetId: submission.id,
        actorId: actor.id,
        reason: `Penggantian media / metadata submisi challenge '${challenge.title}'.`,
      });

      return finalSub;
    });

    // POST-COMMIT: Clean up obsolete previous media files from disk
    if (oldMediaToClean) {
      await cleanupPromotedMedia(oldMediaToClean);
    }

    return updatedSub;
  } catch (err) {
    if (staged) {
      await cleanupPromotedMedia(staged);
    }
    throw err;
  }
}
