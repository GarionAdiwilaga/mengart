import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import sharp from "sharp";
import { exec } from "child_process";
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

const execAsync = promisify(exec);

/**
 * Validate buffer magic bytes against expected media format
 */
function validateMagicBytes(buffer: Buffer, mediaType: "image" | "gif" | "video"): boolean {
  if (buffer.length < 12) return false;

  const hex = buffer.subarray(0, 12).toString("hex").toLowerCase();

  if (mediaType === "image") {
    const isJpeg = hex.startsWith("ffd8ff");
    const isPng = hex.startsWith("89504e470d0a1a0a");
    const isWebp = hex.startsWith("52494646") && buffer.subarray(8, 12).toString("utf-8") === "WEBP";
    return isJpeg || isPng || isWebp;
  }

  if (mediaType === "gif") {
    return hex.startsWith("47494638"); // GIF87a or GIF89a
  }

  if (mediaType === "video") {
    const ftyp = buffer.subarray(4, 8).toString("utf-8");
    const isWebm = hex.startsWith("1a45dfa3");
    return ftyp === "ftyp" || isWebm;
  }

  return false;
}

function createWatermarkSvg(width: number, height: number): Buffer {
  const fontSize = Math.max(14, Math.min(36, Math.floor(width / 35)));
  const padding = Math.max(12, Math.floor(width / 50));

  return Buffer.from(`
    <svg width="${width}" height="${height}">
      <style>
        .watermark-text {
          fill: rgba(255, 255, 255, 0.45);
          font-family: 'Plus Jakarta Sans', sans-serif;
          font-size: ${fontSize}px;
          font-weight: 700;
          letter-spacing: 1.5px;
        }
        .watermark-sub {
          fill: rgba(255, 255, 255, 0.3);
          font-family: 'JetBrains Mono', monospace;
          font-size: ${Math.max(10, Math.floor(fontSize * 0.65))}px;
        }
      </style>
      <g transform="translate(${width - padding}, ${height - padding})" text-anchor="end">
        <text x="0" y="-${Math.floor(fontSize * 0.8)}" class="watermark-text">MENGART ATELIER</text>
        <text x="0" y="0" class="watermark-sub">COMMUNITY PREVIEW</text>
      </g>
    </svg>
  `);
}

export interface StagedMediaResult {
  masterStorageKey: string;
  publicStorageKey: string;
  thumbnailStorageKey: string;
  checksumSha256: string;
  mimeType: string;
  fileSizeBytes: number;
  width: number | null;
  height: number | null;
  mediaType: "image" | "gif" | "video";
}

/**
 * Validates, processes derivatives, and promotes media files to durable unreferenced storage keys.
 * Implements safe decode limits, metadata stripping, usable non-empty derivatives, and internal partial-file cleanup.
 */
export async function stageAndPromoteMedia(file: {
  buffer: Buffer;
  name: string;
  type: string;
  size: number;
}): Promise<StagedMediaResult> {
  await ensureStorageDirectories();

  const ext = path.extname(file.name).toLowerCase() || ".png";
  let mediaType: "image" | "gif" | "video" = "image";
  if (file.type.startsWith("video/")) {
    mediaType = "video";
  } else if (file.type === "image/gif") {
    mediaType = "gif";
  }

  // Size limit validation (Image <= 25MB, Video <= 50MB)
  const maxBytes = mediaType === "video" ? 50 * 1024 * 1024 : 25 * 1024 * 1024;
  if (file.size > maxBytes || file.buffer.length > maxBytes) {
    throw new Error(`Ukuran berkas melebihi batas maksimum (${mediaType === "video" ? "50MB" : "25MB"}).`);
  }

  // Magic bytes validation
  if (!validateMagicBytes(file.buffer, mediaType)) {
    throw new Error(`Format berkas tidak valid untuk tipe media '${mediaType}'.`);
  }

  const checksumSha256 = crypto.createHash("sha256").update(file.buffer).digest("hex");
  const masterStorageKey = generateStorageKey("master", ext.replace(".", "") || (mediaType === "video" ? "mp4" : "png"));
  const publicExt = mediaType === "video" ? "mp4" : ext === ".gif" ? "gif" : "webp";
  const publicStorageKey = generateStorageKey("public", publicExt);
  const thumbnailStorageKey = generateStorageKey("thumb", "webp");

  const masterPath = resolveStoragePath("master", masterStorageKey);
  const publicPath = resolveStoragePath("public", publicStorageKey);
  const thumbPath = resolveStoragePath("public", thumbnailStorageKey);

  const writtenFiles: string[] = [];

  try {
    let width: number | null = null;
    let height: number | null = null;
    let durationSeconds: number | null = null;

    if (mediaType === "image") {
      // Safe image decode limits (50 million pixels max) & EXIF/ICC metadata stripping
      const image = sharp(file.buffer, { limitInputPixels: 50000000 });
      const meta = await image.metadata();
      width = meta.width || null;
      height = meta.height || null;

      // 1. Write Clean Master (Metadata stripped)
      await sharp(file.buffer, { limitInputPixels: 50000000 }).toFile(masterPath);
      writtenFiles.push(masterPath);

      // 2. Generate Watermarked Public Derivative (.webp)
      if (width && height) {
        const targetWidth = Math.min(width, 1920);
        const targetHeight = Math.round((height / width) * targetWidth);
        const watermarkSvg = createWatermarkSvg(targetWidth, targetHeight);

        await sharp(file.buffer, { limitInputPixels: 50000000 })
          .resize(targetWidth, targetHeight, { fit: "inside" })
          .composite([{ input: watermarkSvg, top: 0, left: 0 }])
          .webp({ quality: 82 })
          .toFile(publicPath);
      } else {
        await sharp(file.buffer, { limitInputPixels: 50000000 })
          .webp({ quality: 82 })
          .toFile(publicPath);
      }
      writtenFiles.push(publicPath);

      // 3. Generate Thumbnail (.webp)
      await sharp(file.buffer, { limitInputPixels: 50000000 })
        .resize(400, 400, { fit: "cover", position: "center" })
        .webp({ quality: 80 })
        .toFile(thumbPath);
      writtenFiles.push(thumbPath);
    } else if (mediaType === "gif") {
      const gif = sharp(file.buffer, { animated: true, limitInputPixels: 50000000 });
      const meta = await gif.metadata();
      width = meta.width || null;
      height = meta.height || null;

      await sharp(file.buffer, { animated: true }).toFile(masterPath);
      writtenFiles.push(masterPath);

      await sharp(file.buffer, { animated: true }).toFile(publicPath);
      writtenFiles.push(publicPath);

      await sharp(file.buffer, { page: 0 })
        .resize(400, 400, { fit: "cover", position: "center" })
        .webp({ quality: 80 })
        .toFile(thumbPath);
      writtenFiles.push(thumbPath);
    } else if (mediaType === "video") {
      // 1. Write Master Video
      await fs.writeFile(masterPath, file.buffer);
      writtenFiles.push(masterPath);

      // 2. ffprobe duration & dimensions
      try {
        const { stdout: probeOut } = await execAsync(
          `ffprobe -v error -show_entries format=duration:stream=width,height -of default=noprint_wrappers=1:nokey=1 "${masterPath}"`
        );
        const lines = probeOut.trim().split("\n");
        if (lines.length >= 2) {
          width = parseInt(lines[0], 10) || null;
          height = parseInt(lines[1], 10) || null;
          durationSeconds = parseFloat(lines[lines.length - 1]) || null;
        }

        if (durationSeconds && durationSeconds > 60) {
          throw new Error(`Durasi video (${Math.round(durationSeconds)}s) melebihi batas maksimal 60 detik.`);
        }
      } catch (probeErr: any) {
        if (probeErr?.message?.includes("melebihi batas")) {
          throw probeErr;
        }
        console.warn("ffprobe inspection note:", probeErr?.message);
      }

      // 3. Transcode public video derivative via ffmpeg
      await execAsync(
        `ffmpeg -y -i "${masterPath}" -c:v libx264 -preset medium -crf 23 -pix_fmt yuv420p -movflags +faststart -map_metadata -1 "${publicPath}"`
      );
      writtenFiles.push(publicPath);

      // 4. Extract video poster at 0s & generate thumbnail
      const posterTempPath = resolveStoragePath("temp", `poster_${Date.now()}_${crypto.randomBytes(4).toString("hex")}.png`);
      try {
        await execAsync(
          `ffmpeg -y -ss 00:00:00 -i "${masterPath}" -vframes 1 -q:v 2 "${posterTempPath}"`
        );
        await sharp(posterTempPath)
          .resize(400, 400, { fit: "cover", position: "center" })
          .webp({ quality: 80 })
          .toFile(thumbPath);
        writtenFiles.push(thumbPath);
      } finally {
        await fs.unlink(posterTempPath).catch(() => {});
      }
    }

    // Derivative Usability & Non-Empty Validation
    const [publicStat, thumbStat] = await Promise.all([
      fs.stat(publicPath),
      fs.stat(thumbPath),
    ]);

    if (publicStat.size === 0 || thumbStat.size === 0) {
      throw new Error("Gagal memproses derivatif media: berkas derivatif atau thumbnail kosong.");
    }

    return {
      masterStorageKey,
      publicStorageKey,
      thumbnailStorageKey,
      checksumSha256,
      mimeType: file.type || "application/octet-stream",
      fileSizeBytes: file.size || file.buffer.length,
      width,
      height,
      mediaType,
    };
  } catch (err) {
    // Internal Partial Processing Failure Cleanup: Unlink all files written during this attempt
    for (const filePath of writtenFiles) {
      await fs.unlink(filePath).catch(() => {});
    }
    throw err;
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

  try {
    return await db.transaction(async (tx) => {
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

        await tx
          .update(artworks)
          .set({
            currentVersionId: newVersion.id,
            updatedAt: new Date(),
          })
          .where(eq(artworks.id, submission.artworkId));
      }

      const newTitle = params.title !== undefined ? params.title.trim() : submission.title;
      const newDescription = params.description !== undefined ? (params.description?.trim() || null) : submission.description;
      const newSoftware = params.softwareUsed !== undefined ? (params.softwareUsed?.trim() || null) : submission.softwareUsed;

      // Update challenge_submissions
      const [updatedSub] = await tx
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

      return updatedSub;
    });
  } catch (err) {
    if (staged) {
      await cleanupPromotedMedia(staged);
    }
    throw err;
  }
}
