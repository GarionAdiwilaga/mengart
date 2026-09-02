import sharp from "sharp";
import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import crypto from "crypto";

const execFileAsync = promisify(execFile);

export type ValidatedMediaType = "image" | "video";

export interface ValidatedMediaResult {
  mediaType: ValidatedMediaType;
  detectedFormat: string;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
  mimeType: string;
  fileSizeBytes: number;
  checksumSha256: string;
}

/**
 * Sniffs initial magic bytes to strictly distinguish accepted formats under Blueprint 2.2.2:
 * - JPEG (ffd8ff)
 * - PNG (89504e470d0a1a0a)
 * - WebP (52494646....57454250)
 * - MP4 (....ftyp.... with mp4/iso brand)
 * Explicitly rejects: QuickTime (ftypqt), GIF (47494638), WebM/MKV (1a45dfa3), SVG, executables, scripts.
 */
export function sniffMagicBytes(buffer: Buffer): "image" | "video" | "unsupported" {
  if (!buffer || buffer.length < 12) return "unsupported";

  const hex = buffer.subarray(0, 12).toString("hex").toLowerCase();

  // Explicit rejections
  if (hex.startsWith("47494638")) return "unsupported"; // GIF87a / GIF89a
  if (hex.startsWith("1a45dfa3")) return "unsupported"; // WebM / MKV
  if (hex.startsWith("4d5a")) return "unsupported"; // DOS/PE executable

  // Check XML / SVG / HTML text files
  const first32Str = buffer.subarray(0, Math.min(64, buffer.length)).toString("utf-8").toLowerCase();
  if (
    first32Str.includes("<svg") ||
    first32Str.includes("<?xml") ||
    first32Str.includes("<html") ||
    first32Str.includes("<!doctype") ||
    first32Str.includes("#!/")
  ) {
    return "unsupported";
  }

  // Accepted Images
  const isJpeg = hex.startsWith("ffd8ff");
  const isPng = hex.startsWith("89504e470d0a1a0a");
  const isWebp = hex.startsWith("52494646") && buffer.subarray(8, 12).toString("utf-8") === "WEBP";

  if (isJpeg || isPng || isWebp) {
    return "image";
  }

  // Accepted Video (MP4 container has 'ftyp' at bytes 4-8)
  const ftyp = buffer.subarray(4, 8).toString("utf-8");
  if (ftyp === "ftyp") {
    const brand = buffer.subarray(8, 12).toString("utf-8").toLowerCase();
    // Reject QuickTime container
    if (brand.startsWith("qt")) {
      return "unsupported";
    }
    return "video";
  }

  return "unsupported";
}

/**
 * Authoritative single media validation function.
 * Validates payload buffer size, magic bytes, and runs deep Sharp decode validation on images.
 */
export async function validateAndInspectMediaContent(file: {
  buffer: Buffer;
  name: string;
  type?: string;
  size: number;
}): Promise<{
  mediaType: ValidatedMediaType;
  detectedFormat: string;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
  mimeType: string;
  fileSizeBytes: number;
  checksumSha256: string;
}> {
  const sniffed = sniffMagicBytes(file.buffer);
  if (sniffed === "unsupported") {
    throw new Error(
      "Format berkas tidak didukung. Format yang diterima: JPEG, PNG, WebP (maks 25MB) atau MP4 H.264 (maks 50MB)."
    );
  }

  const mediaType: ValidatedMediaType = sniffed;
  const maxBytes = mediaType === "video" ? 50 * 1024 * 1024 : 25 * 1024 * 1024;
  const actualSize = file.buffer.length;

  if (actualSize > maxBytes || file.size > maxBytes) {
    throw new Error(`Ukuran berkas melebihi batas maksimum (${mediaType === "video" ? "50MB" : "25MB"}).`);
  }

  const checksumSha256 = crypto.createHash("sha256").update(file.buffer).digest("hex");

  if (mediaType === "image") {
    // Deep Sharp decode validation with decompression bomb protection (limit 50M pixels)
    const image = sharp(file.buffer, { limitInputPixels: 50000000 });
    let meta: sharp.Metadata;
    try {
      meta = await image.metadata();
    } catch (err: any) {
      throw new Error(`Berkas gambar rusak atau tidak dapat didekode: ${err?.message || "Format tidak valid"}`);
    }

    if (!meta.width || !meta.height || meta.width <= 0 || meta.height <= 0) {
      throw new Error("Dimensi gambar tidak valid.");
    }

    if (meta.format !== "jpeg" && meta.format !== "png" && meta.format !== "webp") {
      throw new Error(`Format gambar '${meta.format}' tidak didukung. Harap unggah JPEG, PNG, atau WebP.`);
    }

    const mimeMap: Record<string, string> = {
      jpeg: "image/jpeg",
      png: "image/png",
      webp: "image/webp",
    };

    return {
      mediaType: "image",
      detectedFormat: meta.format,
      width: meta.width,
      height: meta.height,
      durationSeconds: null,
      mimeType: mimeMap[meta.format] || "image/png",
      fileSizeBytes: actualSize,
      checksumSha256,
    };
  } else {
    // Video: Initial container check passed (ftyp), deep ffprobe inspection is executed on disk
    return {
      mediaType: "video",
      detectedFormat: "mp4",
      width: null,
      height: null,
      durationSeconds: null,
      mimeType: "video/mp4",
      fileSizeBytes: actualSize,
      checksumSha256,
    };
  }
}

/**
 * Deep inspection of video container and stream codecs via ffprobe with argument arrays and shell: false.
 * Strictly enforces:
 * - MP4 container only (rejects .mov, .webm, .mkv, .avi)
 * - Video stream codec: H.264 (avc1)
 * - Audio stream codec: AAC (or no audio stream / silent)
 * - NO duration cap
 */
export async function inspectVideoContainerAndCodecs(filePath: string): Promise<{
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
  videoCodec: string;
  audioCodec: string | null;
}> {
  try {
    const { stdout } = await execFileAsync(
      "ffprobe",
      [
        "-v",
        "error",
        "-show_format",
        "-show_streams",
        "-print_format",
        "json",
        filePath,
      ],
      { shell: false }
    );

    const data = JSON.parse(stdout);
    const formatName = (data.format?.format_name || "").toLowerCase();
    const majorBrand = (data.format?.tags?.major_brand || "").toLowerCase().trim();
    const compatibleBrands = (data.format?.tags?.compatible_brands || "").toLowerCase();

    // 1. Enforce MP4 container only (QuickTime / MOV / Matroska / WebM / AVI rejected)
    const mp4Brands = ["isom", "iso2", "mp41", "mp42", "avc1", "dash", "m4v", "msnv"];
    const isMp4Brand = mp4Brands.some((b) => majorBrand.includes(b) || compatibleBrands.includes(b));

    if (
      majorBrand === "qt" ||
      majorBrand.startsWith("qt") ||
      compatibleBrands === "qt" ||
      compatibleBrands.startsWith("qt") ||
      !isMp4Brand ||
      formatName === "mov,qt" ||
      formatName.includes("matroska") ||
      formatName.includes("webm") ||
      formatName.includes("avi")
    ) {
      throw new Error("Format container video harus MP4. Format MOV, WebM, MKV, dan AVI tidak didukung.");
    }

    // 2. Enforce Video Stream Codec (H.264)
    const streams = data.streams || [];
    const videoStream = streams.find((s: any) => s.codec_type === "video");
    if (!videoStream) {
      throw new Error("Berkas video tidak memiliki video stream yang valid.");
    }

    const videoCodec = (videoStream.codec_name || "").toLowerCase();
    if (videoCodec !== "h264" && videoCodec !== "avc1") {
      throw new Error(`Codec video '${videoCodec}' tidak didukung. Video harus menggunakan codec H.264 (AVC).`);
    }

    const width = parseInt(videoStream.width, 10) || null;
    const height = parseInt(videoStream.height, 10) || null;

    // 3. Enforce Audio Stream Codec (AAC or Silent)
    const audioStream = streams.find((s: any) => s.codec_type === "audio");
    let audioCodec: string | null = null;
    if (audioStream) {
      audioCodec = (audioStream.codec_name || "").toLowerCase();
      if (audioCodec !== "aac") {
        throw new Error(`Codec audio '${audioCodec}' tidak didukung. Audio harus menggunakan format AAC atau tanpa audio.`);
      }
    }

    // 4. Extract Duration (NO duration limit per Blueprint 2.2.2)
    const rawDuration = data.format?.duration || videoStream.duration;
    const durationSeconds = rawDuration ? parseFloat(rawDuration) : null;

    return {
      width,
      height,
      durationSeconds,
      videoCodec,
      audioCodec,
    };
  } catch (err: any) {
    if (err?.message && (err.message.includes("Format container") || err.message.includes("Codec video") || err.message.includes("Codec audio"))) {
      throw err;
    }
    throw new Error(`Gagal memvalidasi struktur berkas video: ${err?.message || "ffprobe inspection error"}`);
  }
}

/**
 * Transforms validated media and writes clean master, resolution-limited public derivative (no watermark), and WebP thumbnail.
 * Guarantees that all created derivatives exist and are non-empty.
 */
export async function generateMediaDerivatives(params: {
  buffer: Buffer;
  mediaType: ValidatedMediaType;
  masterPath: string;
  publicPath: string;
  thumbPath: string;
  posterTempPath: string;
}): Promise<{
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
}> {
  const { buffer, mediaType, masterPath, publicPath, thumbPath, posterTempPath } = params;

  if (mediaType === "image") {
    // 1. Write Clean Master (Metadata stripped)
    await sharp(buffer, { limitInputPixels: 50000000 }).toFile(masterPath);

    const image = sharp(buffer, { limitInputPixels: 50000000 });
    const meta = await image.metadata();
    const width = meta.width || null;
    const height = meta.height || null;

    // 2. Generate Optimized Public Derivative (.webp <= 1920px, no watermark overlay)
    if (width && height) {
      const targetWidth = Math.min(width, 1920);
      const targetHeight = Math.round((height / width) * targetWidth);

      await sharp(buffer, { limitInputPixels: 50000000 })
        .resize(targetWidth, targetHeight, { fit: "inside" })
        .webp({ quality: 82 })
        .toFile(publicPath);
    } else {
      await sharp(buffer, { limitInputPixels: 50000000 })
        .webp({ quality: 82 })
        .toFile(publicPath);
    }

    // 3. Generate Grid Thumbnail (.webp 400x400 cover)
    await sharp(buffer, { limitInputPixels: 50000000 })
      .resize(400, 400, { fit: "cover", position: "center" })
      .webp({ quality: 80 })
      .toFile(thumbPath);

    // Verify non-empty files
    const masterStat = await fs.stat(masterPath);
    const publicStat = await fs.stat(publicPath);
    const thumbStat = await fs.stat(thumbPath);

    if (masterStat.size === 0 || publicStat.size === 0 || thumbStat.size === 0) {
      throw new Error("Gagal membuat derivatif gambar (berkas kosong 0-byte terdeteksi).");
    }

    return { width, height, durationSeconds: null };
  } else {
    // Video Processing Pipeline
    // 1. Write Master Video
    await fs.writeFile(masterPath, buffer);

    // 2. ffprobe Deep Container & Codec Inspection
    const probe = await inspectVideoContainerAndCodecs(masterPath);

    // 3. Transcode canonical public video derivative via ffmpeg (NO SHELL INTERPRETATION)
    await execFileAsync(
      "ffmpeg",
      [
        "-y",
        "-i",
        masterPath,
        "-c:v",
        "libx264",
        "-preset",
        "fast",
        "-crf",
        "23",
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
        "-map_metadata",
        "-1",
        publicPath,
      ],
      { shell: false }
    );

    // 4. Extract Poster Frame 0 and generate WebP thumbnail
    let posterCreated = false;
    try {
      await execFileAsync(
        "ffmpeg",
        [
          "-y",
          "-ss",
          "00:00:00",
          "-i",
          masterPath,
          "-vframes",
          "1",
          "-q:v",
          "2",
          posterTempPath,
        ],
        { shell: false }
      );
      await fs.access(posterTempPath);
      posterCreated = true;
    } catch (ffmpegErr) {
      console.warn("Video poster extraction fallback:", ffmpegErr);
      posterCreated = false;
    }

    if (posterCreated) {
      await sharp(posterTempPath)
        .resize(400, 400, { fit: "cover", position: "center" })
        .webp({ quality: 80 })
        .toFile(thumbPath);
      await fs.unlink(posterTempPath).catch(() => {});
    } else {
      // Fallback: create solid placeholder WebP thumbnail if extraction fails
      await sharp({
        create: {
          width: 400,
          height: 400,
          channels: 4,
          background: { r: 18, g: 18, b: 20, alpha: 1 },
        },
      })
        .webp({ quality: 80 })
        .toFile(thumbPath);
    }

    // Verify non-empty files
    const masterStat = await fs.stat(masterPath);
    const publicStat = await fs.stat(publicPath);
    const thumbStat = await fs.stat(thumbPath);

    if (masterStat.size === 0 || publicStat.size === 0 || thumbStat.size === 0) {
      throw new Error("Gagal membuat derivatif video (berkas kosong 0-byte terdeteksi).");
    }

    return {
      width: probe.width,
      height: probe.height,
      durationSeconds: probe.durationSeconds,
    };
  }
}

/**
 * Backward compatibility alias for generateMediaDerivatives
 */
export const generateWatermarkedDerivatives = generateMediaDerivatives;
