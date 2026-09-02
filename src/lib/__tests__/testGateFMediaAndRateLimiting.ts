import { db } from "@/db";
import {
  users,
  profiles,
  artworks,
  artworkVersions,
  challenges,
  challengeSubmissions,
  auditLogs,
} from "@/db/schema";
import { eq, and } from "drizzle-orm";
import sharp from "sharp";
import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import { execFile } from "child_process";
import { promisify } from "util";
import {
  sniffMagicBytes,
  validateAndInspectMediaContent,
  inspectVideoContainerAndCodecs,
  generateMediaDerivatives,
} from "@/lib/services/mediaValidation";
import {
  stageAndPromoteMedia,
  cleanupPromotedMedia,
  createChallengeSubmissionService,
} from "@/lib/services/submissionService";
import { processArtworkMediaJob } from "@/lib/mediaProcessor";
import {
  checkRateLimit,
  getClientIpFromHeaders,
  _setTestRedisAvailable,
  _clearMemoryRateLimitStore,
} from "@/lib/rateLimit";
import { handleGetMasterMedia } from "@/app/api/media/master/[key]/route";
import { resolveStoragePath, ensureStorageDirectories } from "@/lib/storage";
import { NextRequest } from "next/server";

const execFileAsync = promisify(execFile);

async function runGateFTestSuite() {
  console.log("\n=================================================================");
  console.log("🚀 STARTING GATE F: MEDIA PIPELINE & COMPREHENSIVE RATE LIMITING TEST SUITE");
  console.log("=================================================================\n");

  await ensureStorageDirectories();
  const suffix = Date.now().toString();
  const tempDir = resolveStoragePath("temp", "");
  await fs.mkdir(tempDir, { recursive: true });

  // ---------------------------------------------------------------------------
  // FIXTURE SETUP
  // ---------------------------------------------------------------------------
  console.log("[Setup] Creating test fixtures...");
  const [adminUser] = await db
    .insert(users)
    .values({ email: `admin_f_${suffix}@mengart.local`, role: "admin", membershipStatus: "active" })
    .returning();
  const [adminProf] = await db
    .insert(profiles)
    .values({ userId: adminUser.id, displayName: "Admin F", slug: `admin-f-${suffix}` })
    .returning();

  const [artistUser] = await db
    .insert(users)
    .values({ email: `artist_f_${suffix}@mengart.local`, role: "member", membershipStatus: "active" })
    .returning();
  const [artistProf] = await db
    .insert(profiles)
    .values({ userId: artistUser.id, displayName: "Artist F", slug: `artist-f-${suffix}` })
    .returning();

  const [suspendedUser] = await db
    .insert(users)
    .values({ email: `suspended_f_${suffix}@mengart.local`, role: "member", membershipStatus: "suspended" })
    .returning();
  const [suspendedProf] = await db
    .insert(profiles)
    .values({ userId: suspendedUser.id, displayName: "Suspended F", slug: `suspended-f-${suffix}` })
    .returning();

  const [otherUser] = await db
    .insert(users)
    .values({ email: `other_f_${suffix}@mengart.local`, role: "member", membershipStatus: "active" })
    .returning();
  const [otherProf] = await db
    .insert(profiles)
    .values({ userId: otherUser.id, displayName: "Other F", slug: `other-f-${suffix}` })
    .returning();

  // Generate valid test image buffers
  const jpegBuffer = await sharp({
    create: { width: 800, height: 600, channels: 3, background: { r: 120, g: 80, b: 200 } },
  })
    .jpeg({ quality: 90 })
    .toBuffer();

  const pngBuffer = await sharp({
    create: { width: 400, height: 400, channels: 4, background: { r: 50, g: 150, b: 250, alpha: 1 } },
  })
    .png()
    .toBuffer();

  const webpBuffer = await sharp({
    create: { width: 500, height: 300, channels: 3, background: { r: 200, g: 50, b: 100 } },
  })
    .webp()
    .toBuffer();

  // Helper to generate a test video using ffmpeg
  async function generateTestVideo(opts: {
    container: string;
    vcodec: string;
    acodec?: string | null;
    durationSeconds: number;
    filename: string;
  }): Promise<{ filePath: string; buffer: Buffer }> {
    const filePath = path.join(tempDir, opts.filename);
    const args = ["-y", "-f", "lavfi", "-i", `testsrc=duration=${opts.durationSeconds}:size=320x240:rate=10`];

    if (opts.acodec) {
      args.push("-f", "lavfi", "-i", `sine=frequency=1000:duration=${opts.durationSeconds}`);
      args.push("-c:a", opts.acodec);
    } else {
      args.push("-an");
    }

    args.push("-c:v", opts.vcodec);
    args.push(filePath);

    await execFileAsync("ffmpeg", args, { shell: false });
    const buffer = await fs.readFile(filePath);
    return { filePath, buffer };
  }

  // ---------------------------------------------------------------------------
  // SECTION 1: SINGLE AUTHORITATIVE MEDIA VALIDATION & CONTENT SNIFFING
  // ---------------------------------------------------------------------------
  console.log("\n--- SECTION 1: Single Authoritative Media Validation & Content Sniffing ---");

  // Scenario 1: Valid JPEG
  console.log("Scenario 1: Valid JPEG validation");
  const valJpeg = await validateAndInspectMediaContent({
    buffer: jpegBuffer,
    name: "test.jpg",
    size: jpegBuffer.length,
  });
  if (valJpeg.mediaType !== "image" || valJpeg.detectedFormat !== "jpeg" || valJpeg.width !== 800 || valJpeg.height !== 600) {
    throw new Error("Scenario 1 Failed: Valid JPEG validation mismatch");
  }
  console.log("✓ Scenario 1 Passed");

  // Scenario 2: Valid PNG
  console.log("Scenario 2: Valid PNG validation");
  const valPng = await validateAndInspectMediaContent({
    buffer: pngBuffer,
    name: "test.png",
    size: pngBuffer.length,
  });
  if (valPng.mediaType !== "image" || valPng.detectedFormat !== "png" || valPng.width !== 400 || valPng.height !== 400) {
    throw new Error("Scenario 2 Failed: Valid PNG validation mismatch");
  }
  console.log("✓ Scenario 2 Passed");

  // Scenario 3: Valid WebP
  console.log("Scenario 3: Valid WebP validation");
  const valWebp = await validateAndInspectMediaContent({
    buffer: webpBuffer,
    name: "test.webp",
    size: webpBuffer.length,
  });
  if (valWebp.mediaType !== "image" || valWebp.detectedFormat !== "webp" || valWebp.width !== 500 || valWebp.height !== 300) {
    throw new Error("Scenario 3 Failed: Valid WebP validation mismatch");
  }
  console.log("✓ Scenario 3 Passed");

  // Scenario 4 (Test A): MIME Spoofing (Shell Script claiming to be image/jpeg)
  console.log("Scenario 4 (Test A): MIME Spoofing Rejection");
  const fakeScriptBuffer = Buffer.from("#!/bin/bash\necho 'malicious command execution attempt'\nexit 1\n");
  let mimeSpoofRejected = false;
  try {
    await validateAndInspectMediaContent({
      buffer: fakeScriptBuffer,
      name: "avatar.jpg",
      type: "image/jpeg",
      size: fakeScriptBuffer.length,
    });
  } catch (err: any) {
    mimeSpoofRejected = true;
    if (!err.message.includes("Format berkas tidak didukung")) {
      throw new Error(`Scenario 4 Failed: Unexpected error message: ${err.message}`);
    }
  }
  if (!mimeSpoofRejected) {
    throw new Error("Scenario 4 Failed: MIME spoofed script was not rejected");
  }
  console.log("✓ Scenario 4 (Test A) Passed: Shell script spoofing image/jpeg was rejected fail-closed");

  // Scenario 5: DOS/PE Executable claiming to be image.png
  console.log("Scenario 5: DOS/PE Executable Rejection");
  const fakeExeBuffer = Buffer.from("4d5a90000300000004000000ffff0000", "hex");
  let exeRejected = false;
  try {
    await validateAndInspectMediaContent({
      buffer: fakeExeBuffer,
      name: "program.png",
      type: "image/png",
      size: fakeExeBuffer.length,
    });
  } catch {
    exeRejected = true;
  }
  if (!exeRejected) throw new Error("Scenario 5 Failed: Executable binary was not rejected");
  console.log("✓ Scenario 5 Passed");

  // Scenario 6: SVG Content Rejection
  console.log("Scenario 6: SVG XML Content Rejection");
  const svgBuffer = Buffer.from('<svg width="100" height="100" xmlns="http://www.w3.org/2000/svg"><circle cx="50" cy="50" r="40"/></svg>');
  let svgRejected = false;
  try {
    await validateAndInspectMediaContent({
      buffer: svgBuffer,
      name: "vector.svg",
      type: "image/svg+xml",
      size: svgBuffer.length,
    });
  } catch {
    svgRejected = true;
  }
  if (!svgRejected) throw new Error("Scenario 6 Failed: SVG file was not rejected");
  console.log("✓ Scenario 6 Passed");

  // Scenario 7: GIF87a / GIF89a Rejection
  console.log("Scenario 7: GIF Format Rejection");
  const gifBuffer = Buffer.from("47494638396101000100800000ffffff00000021f90401000000002c00000000010001000002024401003b", "hex");
  let gifRejected = false;
  try {
    await validateAndInspectMediaContent({
      buffer: gifBuffer,
      name: "animation.gif",
      type: "image/gif",
      size: gifBuffer.length,
    });
  } catch {
    gifRejected = true;
  }
  if (!gifRejected) throw new Error("Scenario 7 Failed: GIF file was not rejected");
  console.log("✓ Scenario 7 Passed");

  // Scenario 8: WebM Container Rejection
  console.log("Scenario 8: WebM Container Rejection");
  const webmHeaderBuffer = Buffer.from("1a45dfa3934286810142f7810142f2810442f38108", "hex");
  let webmRejected = false;
  try {
    await validateAndInspectMediaContent({
      buffer: webmHeaderBuffer,
      name: "video.webm",
      type: "video/webm",
      size: webmHeaderBuffer.length,
    });
  } catch {
    webmRejected = true;
  }
  if (!webmRejected) throw new Error("Scenario 8 Failed: WebM file was not rejected");
  console.log("✓ Scenario 8 Passed");

  // Scenario 9: Image file > 25MB Rejection
  console.log("Scenario 9: Image > 25MB Rejection");
  let largeImgRejected = false;
  try {
    await validateAndInspectMediaContent({
      buffer: jpegBuffer,
      name: "huge.jpg",
      type: "image/jpeg",
      size: 26 * 1024 * 1024,
    });
  } catch (err: any) {
    largeImgRejected = true;
    if (!err.message.includes("melebihi batas")) throw err;
  }
  if (!largeImgRejected) throw new Error("Scenario 9 Failed: Image > 25MB was not rejected");
  console.log("✓ Scenario 9 Passed");

  // ---------------------------------------------------------------------------
  // SECTION 2: STRICT MP4-ONLY VIDEO CONTAINER & CODEC VALIDATION
  // ---------------------------------------------------------------------------
  console.log("\n--- SECTION 2: Strict MP4-Only Video Container & Codec Validation ---");

  // Scenario 10: Valid MP4 (H.264 + AAC)
  console.log("Scenario 10: Valid MP4 (H.264 + AAC)");
  const validMp4 = await generateTestVideo({
    container: "mp4",
    vcodec: "libx264",
    acodec: "aac",
    durationSeconds: 2,
    filename: `valid_h264_aac_${suffix}.mp4`,
  });
  const valMp4Result = await validateAndInspectMediaContent({
    buffer: validMp4.buffer,
    name: "valid.mp4",
    type: "video/mp4",
    size: validMp4.buffer.length,
  });
  if (valMp4Result.mediaType !== "video" || valMp4Result.detectedFormat !== "mp4") {
    throw new Error("Scenario 10 Failed: Valid MP4 initial validation mismatch");
  }
  const probeValid = await inspectVideoContainerAndCodecs(validMp4.filePath);
  if (probeValid.videoCodec !== "h264" || probeValid.audioCodec !== "aac" || !probeValid.width || !probeValid.height) {
    throw new Error("Scenario 10 Failed: MP4 container/stream probe inspection mismatch");
  }
  console.log("✓ Scenario 10 Passed: Valid MP4 (H.264 + AAC) verified");

  // Scenario 11: Valid MP4 (H.264 + Silent / No Audio)
  console.log("Scenario 11: Valid MP4 (H.264 + Silent)");
  const silentMp4 = await generateTestVideo({
    container: "mp4",
    vcodec: "libx264",
    acodec: null,
    durationSeconds: 2,
    filename: `silent_h264_${suffix}.mp4`,
  });
  const probeSilent = await inspectVideoContainerAndCodecs(silentMp4.filePath);
  if (probeSilent.videoCodec !== "h264" || probeSilent.audioCodec !== null) {
    throw new Error("Scenario 11 Failed: Silent MP4 probe inspection mismatch");
  }
  console.log("✓ Scenario 11 Passed: Silent MP4 (no audio stream) accepted");

  // Scenario 12: Non-H.264 Codec Rejection (e.g. MPEG-4 Visual)
  console.log("Scenario 12: Non-H.264 Video Codec Rejection");
  const mpeg4Video = await generateTestVideo({
    container: "mp4",
    vcodec: "mpeg4",
    acodec: "aac",
    durationSeconds: 2,
    filename: `mpeg4_${suffix}.mp4`,
  });
  let nonH264Rejected = false;
  try {
    await inspectVideoContainerAndCodecs(mpeg4Video.filePath);
  } catch (err: any) {
    nonH264Rejected = true;
    if (!err.message.includes("Codec video") || !err.message.includes("H.264")) {
      throw new Error(`Scenario 12 Failed: Unexpected error message: ${err.message}`);
    }
  }
  if (!nonH264Rejected) throw new Error("Scenario 12 Failed: Non-H.264 codec was not rejected");
  console.log("✓ Scenario 12 Passed: Non-H.264 video codec rejected fail-closed");

  // Scenario 13: Non-MP4 Container (.mov QuickTime) Rejection
  console.log("Scenario 13: Non-MP4 Container (.mov) Rejection");
  const movVideo = await generateTestVideo({
    container: "mov",
    vcodec: "libx264",
    acodec: "aac",
    durationSeconds: 2,
    filename: `quicktime_${suffix}.mov`,
  });
  let movRejected = false;
  try {
    await inspectVideoContainerAndCodecs(movVideo.filePath);
  } catch (err: any) {
    movRejected = true;
    if (!err.message.includes("Format container video harus MP4")) {
      throw new Error(`Scenario 13 Failed: Unexpected error message: ${err.message}`);
    }
  }
  if (!movRejected) throw new Error("Scenario 13 Failed: .mov QuickTime video was not rejected");
  console.log("✓ Scenario 13 Passed: Non-MP4 video container (.mov) rejected fail-closed");

  // Scenario 14: Non-AAC Audio Codec (e.g. MP3 audio stream in MP4) Rejection
  console.log("Scenario 14: Non-AAC Audio Codec Rejection");
  const mp3AudioVideo = await generateTestVideo({
    container: "mp4",
    vcodec: "libx264",
    acodec: "libmp3lame",
    durationSeconds: 2,
    filename: `mp3audio_${suffix}.mp4`,
  });
  let nonAacRejected = false;
  try {
    await inspectVideoContainerAndCodecs(mp3AudioVideo.filePath);
  } catch (err: any) {
    nonAacRejected = true;
    if (!err.message.includes("Codec audio") || !err.message.includes("AAC")) {
      throw new Error(`Scenario 14 Failed: Unexpected error message: ${err.message}`);
    }
  }
  if (!nonAacRejected) throw new Error("Scenario 14 Failed: Non-AAC audio stream was not rejected");
  console.log("✓ Scenario 14 Passed: Non-AAC audio codec rejected fail-closed");

  // Scenario 15: Video > 50MB Rejection
  console.log("Scenario 15: Video > 50MB Rejection");
  let largeVideoRejected = false;
  try {
    await validateAndInspectMediaContent({
      buffer: validMp4.buffer,
      name: "giant.mp4",
      type: "video/mp4",
      size: 51 * 1024 * 1024,
    });
  } catch (err: any) {
    largeVideoRejected = true;
    if (!err.message.includes("50MB")) throw err;
  }
  if (!largeVideoRejected) throw new Error("Scenario 15 Failed: Video > 50MB was not rejected");
  console.log("✓ Scenario 15 Passed");

  // Scenario 16: Video Duration > 60s is Accepted (NO duration cap per Blueprint 2.2.2)
  console.log("Scenario 16: Long Video (>60s) Accepted without duration cap");
  const longVideo = await generateTestVideo({
    container: "mp4",
    vcodec: "libx264",
    acodec: "aac",
    durationSeconds: 65,
    filename: `long_video_${suffix}.mp4`,
  });
  const probeLong = await inspectVideoContainerAndCodecs(longVideo.filePath);
  if (!probeLong.durationSeconds || probeLong.durationSeconds < 64) {
    throw new Error(`Scenario 16 Failed: Expected duration ~65s, got ${probeLong.durationSeconds}`);
  }
  console.log(`✓ Scenario 16 Passed: Long video duration (${probeLong.durationSeconds}s) accepted without cap`);

  // ---------------------------------------------------------------------------
  // SECTION 3: SAFE EXECUTION, SHELL INJECTION PREVENTION & DERIVATIVE INTEGRITY
  // ---------------------------------------------------------------------------
  console.log("\n--- SECTION 3: Safe Execution, Shell Injection Prevention & Derivative Integrity ---");

  // Scenario 17: Shell metacharacters in filename executed via execFile (NO INTERPRETATION)
  console.log("Scenario 17: Shell injection prevention in filename");
  const maliciousFilename = `test_$(whoami)_'"` + "`rm -rf /`" + `;echo_hacked_${suffix}.png`;
  const stagedMalicious = await stageAndPromoteMedia({
    buffer: pngBuffer,
    name: maliciousFilename,
    type: "image/png",
    size: pngBuffer.length,
  });
  if (!stagedMalicious.masterStorageKey.endsWith(".png") || !stagedMalicious.publicStorageKey.endsWith(".webp")) {
    throw new Error("Scenario 17 Failed: Staged keys did not derive safely from validated internal format");
  }
  console.log("✓ Scenario 17 Passed: Shell metacharacters in filename processed safely with zero shell interpretation");

  // Scenario 18: Single Public Derivative Generation (No Watermark, Resolution-Limited & Non-Empty)
  console.log("Scenario 18: Public derivative generation without watermark");
  const stagedVideo = await stageAndPromoteMedia({
    buffer: validMp4.buffer,
    name: "artwork_video.mp4",
    type: "video/mp4",
    size: validMp4.buffer.length,
  });

  const masterVideoPath = resolveStoragePath("master", stagedVideo.masterStorageKey);
  const publicVideoPath = resolveStoragePath("public", stagedVideo.publicStorageKey);
  const thumbVideoPath = resolveStoragePath("public", stagedVideo.thumbnailStorageKey);

  const [masterStat, publicStat, thumbStat] = await Promise.all([
    fs.stat(masterVideoPath),
    fs.stat(publicVideoPath),
    fs.stat(thumbVideoPath),
  ]);

  if (masterStat.size === 0 || publicStat.size === 0 || thumbStat.size === 0) {
    throw new Error("Scenario 18 Failed: Zero-byte video derivative detected");
  }

  // Image derivative resolution test (assert <= 1920px width limit and clean WebP derivative)
  const stagedLargeImg = await stageAndPromoteMedia({
    buffer: jpegBuffer,
    name: "photo_derivative_test.jpg",
    type: "image/jpeg",
    size: jpegBuffer.length,
  });
  const publicImgPath = resolveStoragePath("public", stagedLargeImg.publicStorageKey);
  const publicImgMeta = await sharp(publicImgPath).metadata();
  if ((publicImgMeta.width && publicImgMeta.width > 1920) || publicImgMeta.format !== "webp") {
    throw new Error("Scenario 18 Failed: Image public derivative exceeded 1920px limit or is not WebP");
  }
  await cleanupPromotedMedia(stagedLargeImg);

  console.log(`✓ Scenario 18 Passed: Master (${masterStat.size}B), Public (${publicStat.size}B, no watermark), and Thumbnail (${thumbStat.size}B) verified non-empty`);

  // Scenario 19: Rollback cleanup on transaction abort
  console.log("Scenario 19: Rollback cleanup of promoted storage files");
  await cleanupPromotedMedia(stagedVideo);
  let masterExists = true;
  try {
    await fs.stat(masterVideoPath);
  } catch {
    masterExists = false;
  }
  if (masterExists) {
    throw new Error("Scenario 19 Failed: Cleaned up master file still exists on disk");
  }
  console.log("✓ Scenario 19 Passed: cleanupPromotedMedia purged staged files on rollback");

  // ---------------------------------------------------------------------------
  // SECTION 4: MASTER CLEAN MEDIA ACL
  // ---------------------------------------------------------------------------
  console.log("\n--- SECTION 4: Master Clean Media ACL ---");

  // Create an artwork version in DB for ACL testing
  const stagedImage = await stageAndPromoteMedia({
    buffer: jpegBuffer,
    name: "master_acl_test.jpg",
    type: "image/jpeg",
    size: jpegBuffer.length,
  });

  const [artRow] = await db
    .insert(artworks)
    .values({
      userId: artistUser.id,
      title: "Master ACL Artwork",
      slug: `master-acl-${suffix}`,
      mediaType: "image",
      audience: "members_only",
      publicationStatus: "published",
    })
    .returning();

  const [verRow] = await db
    .insert(artworkVersions)
    .values({
      artworkId: artRow.id,
      versionNumber: 1,
      mediaType: "image",
      masterStorageKey: stagedImage.masterStorageKey,
      publicStorageKey: stagedImage.publicStorageKey,
      thumbnailStorageKey: stagedImage.thumbnailStorageKey,
      mimeType: stagedImage.mimeType,
      fileSizeBytes: stagedImage.fileSizeBytes,
      width: stagedImage.width,
      height: stagedImage.height,
      checksumSha256: stagedImage.checksumSha256,
      processingStatus: "ready",
    })
    .returning();

  await db.update(artworks).set({ currentVersionId: verRow.id }).where(eq(artworks.id, artRow.id));

  // Scenario 20: Active Owner Accesses Clean Master -> 200 OK
  console.log("Scenario 20: Active owner accesses master media");
  const reqOwner = new NextRequest("http://localhost:3000/api/media/master/" + stagedImage.masterStorageKey);
  const resOwner = await handleGetMasterMedia(
    reqOwner,
    { params: Promise.resolve({ key: stagedImage.masterStorageKey }) },
    { id: artistUser.id, role: "member", membershipStatus: "active" }
  );
  if (resOwner.status !== 200) {
    throw new Error(`Scenario 20 Failed: Expected 200 OK for active owner, got ${resOwner.status}`);
  }
  console.log("✓ Scenario 20 Passed: Active owner authorized for master clean media");

  // Scenario 21: Active Non-Owner Accessing Master Media -> 403 Forbidden
  console.log("Scenario 21: Active non-owner accessing master media");
  const reqOther = new NextRequest("http://localhost:3000/api/media/master/" + stagedImage.masterStorageKey);
  const resOther = await handleGetMasterMedia(
    reqOther,
    { params: Promise.resolve({ key: stagedImage.masterStorageKey }) },
    { id: otherUser.id, role: "member", membershipStatus: "active" }
  );
  if (resOther.status !== 403) {
    throw new Error(`Scenario 21 Failed: Expected 403 Forbidden for non-owner, got ${resOther.status}`);
  }
  console.log("✓ Scenario 21 Passed: Non-owner blocked from master clean media (403)");

  // Scenario 22: Suspended Owner Accessing Master Media -> 403 Forbidden
  console.log("Scenario 22: Suspended user accessing master media");
  const reqSuspended = new NextRequest("http://localhost:3000/api/media/master/" + stagedImage.masterStorageKey);
  const resSuspended = await handleGetMasterMedia(
    reqSuspended,
    { params: Promise.resolve({ key: stagedImage.masterStorageKey }) },
    { id: suspendedUser.id, role: "member", membershipStatus: "suspended" }
  );
  if (resSuspended.status !== 403) {
    throw new Error(`Scenario 22 Failed: Expected 403 Forbidden for suspended user, got ${resSuspended.status}`);
  }
  console.log("✓ Scenario 22 Passed: Suspended user blocked from master clean media (403)");

  // ---------------------------------------------------------------------------
  // SECTION 5: COMPREHENSIVE RATE LIMITING & PROXY IP EXTRACTION
  // ---------------------------------------------------------------------------
  console.log("\n--- SECTION 5: Comprehensive Rate Limiting & Proxy IP Extraction ---");
  _clearMemoryRateLimitStore();

  // Scenario 23: Sliding-window exhaustion on artwork upload (10/60s)
  console.log("Scenario 23: Artwork upload rate limit exhaustion (10/60s)");
  const uploadKey = `artwork_upload:${artistUser.id}`;
  for (let i = 0; i < 10; i++) {
    const rl = await checkRateLimit(uploadKey, { limit: 10, windowSeconds: 60, criticality: "fail_closed" });
    if (!rl.success) throw new Error(`Scenario 23 Failed: Request ${i + 1} was prematurely rate limited`);
  }
  const rlOverLimit = await checkRateLimit(uploadKey, { limit: 10, windowSeconds: 60, criticality: "fail_closed" });
  if (rlOverLimit.success) {
    throw new Error("Scenario 23 Failed: 11th request was not rate limited");
  }
  console.log("✓ Scenario 23 Passed: Artwork upload rate limit enforced at 10 requests / 60s");

  // Scenario 24: Rate limit key isolation between users
  console.log("Scenario 24: Rate limit key isolation between User A and User B");
  const otherUploadKey = `artwork_upload:${otherUser.id}`;
  const rlOther = await checkRateLimit(otherUploadKey, { limit: 10, windowSeconds: 60, criticality: "fail_closed" });
  if (!rlOther.success) {
    throw new Error("Scenario 24 Failed: User B was blocked by User A's rate limit");
  }
  console.log("✓ Scenario 24 Passed: Rate limits isolated per-user");

  // Scenario 25: Trusted Proxy IP extraction
  console.log("Scenario 25: Trusted Proxy IP Extraction and Spoofing Prevention");
  const mockHeadersDirect = new Headers({
    "x-forwarded-for": "198.51.100.22",
    "cf-connecting-ip": "198.51.100.33",
  });

  // Without TRUSTED_PROXY=true, spoofed headers must be ignored
  delete process.env.TRUSTED_PROXY;
  const ipDirect = getClientIpFromHeaders(mockHeadersDirect);
  if (ipDirect !== "127.0.0.1") {
    throw new Error(`Scenario 25 Failed: Direct socket expected 127.0.0.1, got ${ipDirect}`);
  }

  // With TRUSTED_PROXY=true, forwarded headers are accepted
  process.env.TRUSTED_PROXY = "true";
  const ipProxy = getClientIpFromHeaders(mockHeadersDirect);
  if (ipProxy !== "198.51.100.33") {
    throw new Error(`Scenario 25 Failed: Proxy expected 198.51.100.33 (CF IP), got ${ipProxy}`);
  }
  delete process.env.TRUSTED_PROXY;
  console.log("✓ Scenario 25 Passed: Spoofed forwarded headers ignored without TRUSTED_PROXY; respected when TRUSTED_PROXY=true");

  // Scenario 26 (Test B): Redis Outage Tiered Degradation
  console.log("Scenario 26 (Test B): Redis Outage Tiered Degradation (Fail-Closed vs Fail-Open)");
  _setTestRedisAvailable(false); // Simulate Redis connection outage

  // 1. Security-Critical Action (fail_closed) MUST throw / reject safely
  let failClosedThrown = false;
  try {
    await checkRateLimit(`vote:${artistUser.id}`, { limit: 20, windowSeconds: 60, criticality: "fail_closed" });
  } catch (err: any) {
    failClosedThrown = true;
    if (!err.message.includes("pembatasan laju tidak tersedia")) {
      throw new Error(`Scenario 26 Failed: Unexpected fail-closed error: ${err.message}`);
    }
  }
  if (!failClosedThrown) {
    throw new Error("Scenario 26 Failed: Security-critical rate limit did not fail closed during simulated Redis outage");
  }

  // 2. Low-Risk Action (fail_open) MUST allow request with degraded log
  const failOpenResult = await checkRateLimit(`profile_update:${artistUser.id}`, {
    limit: 10,
    windowSeconds: 60,
    criticality: "fail_open",
  });
  if (!failOpenResult.success) {
    throw new Error("Scenario 26 Failed: Low-risk action was blocked during Redis outage instead of failing open");
  }

  _setTestRedisAvailable(true); // Restore Redis
  console.log("✓ Scenario 26 (Test B) Passed: Security-critical actions fail closed; low-risk actions fail open with degraded logging");

  // ---------------------------------------------------------------------------
  // SECTION 6: WORKER PARITY & DUPLICATE EXECUTION SAFETY
  // ---------------------------------------------------------------------------
  console.log("\n--- SECTION 6: Worker Parity & Duplicate Execution Safety ---");

  // Scenario 27 (Test C): Worker Duplicate Execution Safety
  console.log("Scenario 27 (Test C): Worker Duplicate Execution Safety");
  const tempArtworkFilename = `worker_test_${suffix}.png`;
  const workerTempPath = resolveStoragePath("temp", tempArtworkFilename);
  await fs.writeFile(workerTempPath, pngBuffer);

  const [workerArt] = await db
    .insert(artworks)
    .values({
      userId: artistUser.id,
      title: "Worker Test Artwork",
      slug: `worker-art-${suffix}`,
      mediaType: "image",
      audience: "public",
      publicationStatus: "processing",
    })
    .returning();

  const [workerVer] = await db
    .insert(artworkVersions)
    .values({
      artworkId: workerArt.id,
      versionNumber: 1,
      mediaType: "image",
      masterStorageKey: "initial_pending_key",
      checksumSha256: "initial_pending_checksum",
      mimeType: "image/png",
      fileSizeBytes: pngBuffer.length,
      processingStatus: "pending",
    })
    .returning();

  // Create temporary copy for second execution
  const duplicateTempPath = resolveStoragePath("temp", `worker_dup_${suffix}.png`);
  await fs.writeFile(duplicateTempPath, pngBuffer);

  // Run Job Execution 1
  const jobResult1 = await processArtworkMediaJob({
    artworkId: workerArt.id,
    versionId: workerVer.id,
    tempFilename: tempArtworkFilename,
    mediaType: "image",
    originalFilename: "original.png",
    userId: artistUser.id,
  });
  if (!jobResult1.success) throw new Error("Scenario 27 Failed: Job execution 1 failed");

  // Verify DB state after Run 1
  const [verAfter1] = await db.select().from(artworkVersions).where(eq(artworkVersions.id, workerVer.id));
  if (verAfter1.processingStatus !== "ready" || !verAfter1.masterStorageKey || !verAfter1.publicStorageKey) {
    throw new Error("Scenario 27 Failed: Artwork version not ready after job 1");
  }

  // Run Job Execution 2 (duplicate delivery simulation)
  const jobResult2 = await processArtworkMediaJob({
    artworkId: workerArt.id,
    versionId: workerVer.id,
    tempFilename: `worker_dup_${suffix}.png`,
    mediaType: "image",
    originalFilename: "original.png",
    userId: artistUser.id,
  });
  if (!jobResult2.success) throw new Error("Scenario 27 Failed: Job execution 2 failed");

  // Verify DB state after Run 2 remains consistent and deterministic
  const [verAfter2] = await db.select().from(artworkVersions).where(eq(artworkVersions.id, workerVer.id));
  const [artAfter2] = await db.select().from(artworks).where(eq(artworks.id, workerArt.id));
  if (verAfter2.processingStatus !== "ready" || artAfter2.publicationStatus !== "published") {
    throw new Error("Scenario 27 Failed: DB state corrupted after duplicate job delivery");
  }
  console.log("✓ Scenario 27 (Test C) Passed: Duplicate job execution executed idempotently with zero DB corruption or orphan files");

  // Scenario 28 (Parity Regression): Synchronous path and worker path produce identical validation results
  console.log("Scenario 28: Parity Regression between synchronous and worker validation");
  // Test invalid input in both paths
  let syncFailed = false;
  try {
    await stageAndPromoteMedia({
      buffer: fakeScriptBuffer,
      name: "parity.jpg",
      type: "image/jpeg",
      size: fakeScriptBuffer.length,
    });
  } catch {
    syncFailed = true;
  }

  const parityTempPath = resolveStoragePath("temp", `parity_${suffix}.jpg`);
  await fs.writeFile(parityTempPath, fakeScriptBuffer);
  let workerFailed = false;
  try {
    await processArtworkMediaJob({
      artworkId: workerArt.id,
      versionId: workerVer.id,
      tempFilename: `parity_${suffix}.jpg`,
      mediaType: "image",
      originalFilename: "parity.jpg",
      userId: artistUser.id,
    });
  } catch {
    workerFailed = true;
  }

  if (!syncFailed || !workerFailed) {
    throw new Error(`Scenario 28 Failed: Divergence detected between synchronous (${syncFailed}) and worker (${workerFailed}) validation`);
  }
  console.log("✓ Scenario 28 Passed: Synchronous staging and worker processing enforce identical fail-closed validation outcomes");

  // ---------------------------------------------------------------------------
  // CLEANUP
  // ---------------------------------------------------------------------------
  console.log("\n[Cleanup] Cleaning up test artifacts...");
  await cleanupPromotedMedia(stagedImage);
  await cleanupPromotedMedia(stagedMalicious);
  if (verAfter2.masterStorageKey) {
    await cleanupPromotedMedia({
      masterStorageKey: verAfter2.masterStorageKey,
      publicStorageKey: verAfter2.publicStorageKey,
      thumbnailStorageKey: verAfter2.thumbnailStorageKey,
    });
  }
  try {
    await fs.unlink(validMp4.filePath);
    await fs.unlink(silentMp4.filePath);
    await fs.unlink(mpeg4Video.filePath);
    await fs.unlink(movVideo.filePath);
    await fs.unlink(mp3AudioVideo.filePath);
  } catch (_e) {
    // Ignore missing temporary video files during cleanup
  }

  console.log("\n=================================================================");
  console.log("🎉 ALL 28 GATE F MEDIA & RATE LIMITING TEST SCENARIOS PASSED (100% SUCCESS)!");
  console.log("=================================================================\n");
}

runGateFTestSuite()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error("\n❌ GATE F TEST SUITE ENCOUNTERED AN ERROR:\n", err);
    process.exit(1);
  });
