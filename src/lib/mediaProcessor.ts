import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import sharp from "sharp";
import { exec } from "child_process";
import { promisify } from "util";
import { db } from "@/db";
import { artworks, artworkVersions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { resolveStoragePath, generateStorageKey, ensureStorageDirectories } from "./storage";
import type { ProcessMediaJobData } from "./queue";

const execAsync = promisify(exec);

/**
 * Generate a clean SVG watermark buffer for the community
 */
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

/**
 * Process uploaded media job (Strip metadata, create master, watermarked derivative, thumbnail)
 */
export async function processArtworkMediaJob(jobData: ProcessMediaJobData) {
  await ensureStorageDirectories();

  const tempFilePath = resolveStoragePath("temp", jobData.tempFilename);
  const ext = path.extname(jobData.originalFilename).toLowerCase();

  try {
    const fileStats = await fs.stat(tempFilePath);
    const fileBuffer = await fs.readFile(tempFilePath);

    // Compute SHA-256 checksum
    const checksumSha256 = crypto.createHash("sha256").update(fileBuffer).digest("hex");

    let width: number | null = null;
    let height: number | null = null;
    let frameCount: number | null = null;
    let durationSeconds: number | null = null;

    const masterStorageKey = generateStorageKey("master", ext);
    const publicStorageKey = generateStorageKey("public", ext === ".gif" ? "gif" : "webp");
    const thumbStorageKey = generateStorageKey("thumb", "webp");
    let posterStorageKey: string | null = null;

    const masterDestPath = resolveStoragePath("master", masterStorageKey);
    const publicDestPath = resolveStoragePath("public", publicStorageKey);
    const thumbDestPath = resolveStoragePath("public", thumbStorageKey);

    if (jobData.mediaType === "image") {
      // 1. Image metadata inspection & stripping
      const image = sharp(fileBuffer, { limitInputPixels: 50000000 }); // Decompression bomb defense
      const metadata = await image.metadata();

      width = metadata.width || null;
      height = metadata.height || null;

      // Save Clean Master (Sharp strips EXIF/ICC/GPS by default)
      await sharp(fileBuffer).toFile(masterDestPath);

      // Generate Public Watermarked Derivative (Max width 1920, watermarked)
      if (width && height) {
        const targetWidth = Math.min(width, 1920);
        const targetHeight = Math.round((height / width) * targetWidth);
        const watermarkSvg = createWatermarkSvg(targetWidth, targetHeight);

        await sharp(fileBuffer)
          .resize(targetWidth, targetHeight, { fit: "inside" })
          .composite([{ input: watermarkSvg, top: 0, left: 0 }])
          .webp({ quality: 82 })
          .toFile(publicDestPath);

        // Generate Grid Thumbnail (Max 600px width)
        await sharp(fileBuffer)
          .resize(600, null, { fit: "inside", withoutEnlargement: true })
          .webp({ quality: 80 })
          .toFile(thumbDestPath);
      }
    } else if (jobData.mediaType === "gif") {
      // GIF Processing
      const gif = sharp(fileBuffer, { animated: true, limitInputPixels: 50000000 });
      const metadata = await gif.metadata();

      width = metadata.width || null;
      height = metadata.height || null;
      frameCount = metadata.pages || null;

      // Save master GIF
      await sharp(fileBuffer, { animated: true }).toFile(masterDestPath);

      // Save public GIF derivative
      await sharp(fileBuffer, { animated: true }).toFile(publicDestPath);

      // Extract first frame as static poster & thumbnail
      posterStorageKey = generateStorageKey("poster", "webp");
      const posterDestPath = resolveStoragePath("public", posterStorageKey);

      await sharp(fileBuffer, { page: 0 })
        .webp({ quality: 85 })
        .toFile(posterDestPath);

      await sharp(fileBuffer, { page: 0 })
        .resize(600, null, { fit: "inside", withoutEnlargement: true })
        .webp({ quality: 80 })
        .toFile(thumbDestPath);
    } else if (jobData.mediaType === "video") {
      // Video Processing (MP4 / WebM)
      // Save master video
      await fs.copyFile(tempFilePath, masterDestPath);

      // For public video, copy or serve
      await fs.copyFile(tempFilePath, publicDestPath);

      posterStorageKey = generateStorageKey("poster", "webp");
      const posterDestPath = resolveStoragePath("public", posterStorageKey);

      // Extract video poster frame via ffmpeg
      try {
        await execAsync(
          `ffmpeg -y -ss 00:00:01 -i "${tempFilePath}" -vframes 1 -q:v 2 "${posterDestPath}"`
        );
        // Thumbnail from poster
        await sharp(posterDestPath)
          .resize(600, null, { fit: "inside", withoutEnlargement: true })
          .webp({ quality: 80 })
          .toFile(thumbDestPath);
      } catch (ffmpegErr) {
        console.warn("FFmpeg poster extraction fallback:", ffmpegErr);
      }
    }

    // 2. Update Artwork Version record
    await db
      .update(artworkVersions)
      .set({
        masterStorageKey,
        publicStorageKey,
        thumbnailStorageKey: thumbStorageKey,
        posterStorageKey,
        width,
        height,
        frameCount,
        durationSeconds: durationSeconds ? String(durationSeconds) : null,
        fileSizeBytes: fileStats.size,
        checksumSha256,
        processingStatus: "ready",
        processingError: null,
      })
      .where(eq(artworkVersions.id, jobData.versionId));

    // 3. Update Artwork Status to published/ready
    await db
      .update(artworks)
      .set({
        currentVersionId: jobData.versionId,
        publicationStatus: "published",
        updatedAt: new Date(),
      })
      .where(eq(artworks.id, jobData.artworkId));

    // 4. Delete temp file cleanly
    await fs.unlink(tempFilePath).catch(() => {});

    console.log(`✓ Media processing completed for artwork: ${jobData.artworkId}`);
    return { success: true };
  } catch (err: any) {
    console.error(`❌ Media processing failed for version ${jobData.versionId}:`, err);

    await db
      .update(artworkVersions)
      .set({
        processingStatus: "failed",
        processingError: err?.message || "Media processing failed",
      })
      .where(eq(artworkVersions.id, jobData.versionId));

    await db
      .update(artworks)
      .set({
        publicationStatus: "processing_failed",
        updatedAt: new Date(),
      })
      .where(eq(artworks.id, jobData.artworkId));

    // Attempt temp cleanup
    await fs.unlink(tempFilePath).catch(() => {});
    throw err;
  }
}
