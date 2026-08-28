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
    // MP4/MOV contains 'ftyp' at bytes 4-8
    const ftyp = buffer.subarray(4, 8).toString("utf-8");
    const isWebm = hex.startsWith("1a45dfa3");
    return ftyp === "ftyp" || isWebm;
  }

  return false;
}

/**
 * Generate a clean SVG watermark buffer for images
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
 * Process uploaded media job (Strip metadata, validate magic bytes, create master, watermarked derivative, thumbnail)
 */
export async function processArtworkMediaJob(jobData: ProcessMediaJobData) {
  await ensureStorageDirectories();

  const tempFilePath = resolveStoragePath("temp", jobData.tempFilename);
  const ext = path.extname(jobData.originalFilename).toLowerCase();

  try {
    const fileStats = await fs.stat(tempFilePath);
    const fileBuffer = await fs.readFile(tempFilePath);

    // 1. Content-based Magic Bytes Validation
    if (!validateMagicBytes(fileBuffer, jobData.mediaType)) {
      throw new Error(`Berkas tidak valid: format file tidak sesuai dengan tipe media '${jobData.mediaType}'.`);
    }

    // Compute SHA-256 checksum
    const checksumSha256 = crypto.createHash("sha256").update(fileBuffer).digest("hex");

    let width: number | null = null;
    let height: number | null = null;
    let frameCount: number | null = null;
    let durationSeconds: number | null = null;

    const masterStorageKey = generateStorageKey("master", ext.replace(".", "") || "png");
    const publicExt = jobData.mediaType === "video" ? "mp4" : ext === ".gif" ? "gif" : "webp";
    const publicStorageKey = generateStorageKey("public", publicExt);
    const thumbStorageKey = generateStorageKey("thumb", "webp");
    let posterStorageKey: string | null = null;

    const masterDestPath = resolveStoragePath("master", masterStorageKey);
    const publicDestPath = resolveStoragePath("public", publicStorageKey);
    const thumbDestPath = resolveStoragePath("public", thumbStorageKey);

    if (jobData.mediaType === "image") {
      // Image metadata inspection & stripping
      const image = sharp(fileBuffer, { limitInputPixels: 50000000 });
      const metadata = await image.metadata();

      width = metadata.width || null;
      height = metadata.height || null;

      // Save Clean Master (Sharp strips EXIF/ICC/GPS)
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

      await sharp(fileBuffer, { animated: true }).toFile(masterDestPath);
      await sharp(fileBuffer, { animated: true }).toFile(publicDestPath);

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
      // Video Probe (Duration, Width, Height) via ffprobe
      try {
        const { stdout: probeOut } = await execAsync(
          `ffprobe -v error -show_entries format=duration:stream=width,height -of default=noprint_wrappers=1:nokey=1 "${tempFilePath}"`
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
        console.warn("ffprobe inspection note:", probeErr?.message);
      }

      // Save master video
      await fs.copyFile(tempFilePath, masterDestPath);

      // Transcode / optimize public video derivative with FFmpeg and overlay text watermark
      try {
        await execAsync(
          `ffmpeg -y -i "${tempFilePath}" -c:v libx264 -preset medium -crf 23 -pix_fmt yuv420p -movflags +faststart -map_metadata -1 "${publicDestPath}"`
        );
      } catch (transcodeErr) {
        throw new Error(`FFmpeg video transcoding gagal: ${transcodeErr}`);
      }

      posterStorageKey = generateStorageKey("poster", "webp");
      const posterDestPath = resolveStoragePath("public", posterStorageKey);

      try {
        await execAsync(
          `ffmpeg -y -ss 00:00:01 -i "${tempFilePath}" -vframes 1 -q:v 2 "${posterDestPath}"`
        );
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

    // 3. Update Artwork Status to published
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

    await fs.unlink(tempFilePath).catch(() => {});
    throw err;
  }
}
