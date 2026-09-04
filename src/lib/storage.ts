import fs from "fs/promises";
import path from "path";
import crypto from "crypto";

const STORAGE_ROOT = process.env.STORAGE_ROOT || path.join(process.cwd(), "storage");

export const STORAGE_PATHS = {
  root: STORAGE_ROOT,
  master: path.join(STORAGE_ROOT, "master"), // Private clean full-resolution files
  public: path.join(STORAGE_ROOT, "public"), // Public resolution-capped derivatives & thumbnails
  temp: path.join(STORAGE_ROOT, "temp"), // Temporary upload staging
};

/**
 * Ensure all storage subdirectories exist on server startup
 */
export async function ensureStorageDirectories() {
  for (const dir of Object.values(STORAGE_PATHS)) {
    try {
      await fs.mkdir(dir, { recursive: true });
    } catch (err) {
      console.error(`Failed to initialize storage directory: ${dir}`, err);
    }
  }
}

/**
 * Generate a random high-entropy internal storage key
 */
export function generateStorageKey(type: "master" | "public" | "thumb" | "poster" | "temp", extension: string): string {
  const cleanExt = extension.startsWith(".") ? extension.slice(1) : extension;
  const randomHex = crypto.randomBytes(24).toString("hex");
  const timestamp = Date.now();
  return `${type}_${timestamp}_${randomHex}.${cleanExt.toLowerCase()}`;
}

/**
 * Resolve absolute file path for a storage key
 */
export function resolveStoragePath(type: "master" | "public" | "temp", storageKey: string): string {
  // Prevent directory traversal attacks
  const safeFilename = path.basename(storageKey);
  return path.join(/*turbopackIgnore: true*/ STORAGE_PATHS[type], safeFilename);
}
