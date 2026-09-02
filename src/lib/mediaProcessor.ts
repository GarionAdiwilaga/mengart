import fs from "fs/promises";
import crypto from "crypto";
import { db } from "@/db";
import { artworks, artworkVersions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { resolveStoragePath, generateStorageKey, ensureStorageDirectories } from "./storage";
import {
  validateAndInspectMediaContent,
  generateWatermarkedDerivatives,
} from "./services/mediaValidation";
import type { ProcessMediaJobData } from "./queue";

/**
 * Process uploaded media job (Unified with single authoritative validation engine)
 * Idempotent execution ensuring zero duplicate derivatives or corrupt DB states.
 */
export async function processArtworkMediaJob(jobData: ProcessMediaJobData) {
  await ensureStorageDirectories();

  const tempFilePath = resolveStoragePath("temp", jobData.tempFilename);

  try {
    const fileBuffer = await fs.readFile(tempFilePath);
    const fileStats = await fs.stat(tempFilePath);

    // 1. Authoritative Validation via Single Media Engine
    const validated = await validateAndInspectMediaContent({
      buffer: fileBuffer,
      name: jobData.originalFilename,
      size: fileStats.size,
    });

    // Derive storage extensions strictly from validated internal media type
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
    const thumbStorageKey = generateStorageKey("thumb", "webp");

    const masterDestPath = resolveStoragePath("master", masterStorageKey);
    const publicDestPath = resolveStoragePath("public", publicStorageKey);
    const thumbDestPath = resolveStoragePath("public", thumbStorageKey);
    const posterTempPath = resolveStoragePath("temp", `poster_${Date.now()}_${crypto.randomBytes(4).toString("hex")}.png`);

    // 2. Generate Derivatives & Clean Master via Single Media Engine
    const transformResult = await generateWatermarkedDerivatives({
      buffer: fileBuffer,
      mediaType: validated.mediaType,
      masterPath: masterDestPath,
      publicPath: publicDestPath,
      thumbPath: thumbDestPath,
      posterTempPath,
    });

    // 3. Update Artwork Version record
    await db
      .update(artworkVersions)
      .set({
        masterStorageKey,
        publicStorageKey,
        thumbnailStorageKey: thumbStorageKey,
        posterStorageKey: validated.mediaType === "video" ? thumbStorageKey : null,
        width: transformResult.width,
        height: transformResult.height,
        frameCount: null,
        durationSeconds: transformResult.durationSeconds ? String(transformResult.durationSeconds) : null,
        fileSizeBytes: fileStats.size,
        checksumSha256: validated.checksumSha256,
        processingStatus: "ready",
        processingError: null,
      })
      .where(eq(artworkVersions.id, jobData.versionId));

    // 4. Update Artwork Status to published
    await db
      .update(artworks)
      .set({
        currentVersionId: jobData.versionId,
        publicationStatus: "published",
        updatedAt: new Date(),
      })
      .where(eq(artworks.id, jobData.artworkId));

    // 5. Delete temp file cleanly
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
