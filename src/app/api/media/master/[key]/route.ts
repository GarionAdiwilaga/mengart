import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { resolveStoragePath } from "@/lib/storage";
import { db } from "@/db";
import { artworkVersions, artworks, challengeSubmissionVersions, challengeSubmissions, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { canAccessMasterMedia } from "@/lib/policy";
import fs from "fs";
import fsp from "fs/promises";
import path from "path";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
  const session = await auth();
  
  // 1. Authentication Guard & DB Membership Refresh
  if (!session?.user || !session.user.id) {
    return new NextResponse("Unauthorized: Autentikasi diperlukan untuk mengakses master media orisinal.", {
      status: 401,
    });
  }

  const [dbUser] = await db
    .select({ membershipStatus: users.membershipStatus })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);

  if (!dbUser || dbUser.membershipStatus !== "active") {
    return new NextResponse("Forbidden: Akun Anda ditangguhkan atau belum aktif.", {
      status: 403,
    });
  }

  const { key } = await params;
  if (!key) {
    return new NextResponse("Kunci media tidak valid", { status: 400 });
  }

  // 2. Database Key Resolution & Authorization Check
  const [version] = await db
    .select({
      versionId: artworkVersions.id,
      artworkId: artworkVersions.artworkId,
      mimeType: artworkVersions.mimeType,
      artworkUserId: artworks.userId,
      artworkAudience: artworks.audience,
      artworkPublicationStatus: artworks.publicationStatus,
      artworkDeletedAt: artworks.deletedAt,
    })
    .from(artworkVersions)
    .innerJoin(artworks, eq(artworks.id, artworkVersions.artworkId))
    .where(eq(artworkVersions.masterStorageKey, key))
    .limit(1);

  if (!version) {
    return new NextResponse("Master Media Tidak Ditemukan", { status: 404 });
  }

  // Check if artwork was submitted to a challenge
  let challengeId: string | null = null;
  const [subVersion] = await db
    .select({
      challengeId: challengeSubmissions.challengeId,
    })
    .from(challengeSubmissionVersions)
    .innerJoin(challengeSubmissions, eq(challengeSubmissions.id, challengeSubmissionVersions.submissionId))
    .where(eq(challengeSubmissionVersions.artworkVersionId, version.versionId))
    .limit(1);

  if (subVersion) {
    challengeId = subVersion.challengeId;
  }

  const artworkEntity = {
    id: version.artworkId,
    userId: version.artworkUserId,
    audience: version.artworkAudience as any,
    publicationStatus: version.artworkPublicationStatus as any,
    deletedAt: version.artworkDeletedAt,
  };

  const hasAccess = await canAccessMasterMedia(session.user as any, artworkEntity, challengeId);
  if (!hasAccess) {
    return new NextResponse("Forbidden: Anda tidak memiliki izin akses untuk mengunduh master media karya ini.", {
      status: 403,
    });
  }

  // 3. Resolve Path with Path Traversal Protection
  const filePath = resolveStoragePath("master", key);

  try {
    const stats = await fsp.stat(filePath);
    if (!stats.isFile()) {
      return new NextResponse("Not Found", { status: 404 });
    }

    // Determine MIME type
    const ext = path.extname(filePath).toLowerCase();
    let contentType = version.mimeType || "application/octet-stream";
    if (ext === ".jpg" || ext === ".jpeg") contentType = "image/jpeg";
    else if (ext === ".png") contentType = "image/png";
    else if (ext === ".webp") contentType = "image/webp";
    else if (ext === ".gif") contentType = "image/gif";
    else if (ext === ".mp4") contentType = "video/mp4";
    else if (ext === ".webm") contentType = "video/webm";

    const nodeStream = fs.createReadStream(filePath);
    const webStream = new ReadableStream({
      start(controller) {
        nodeStream.on("data", (chunk) => controller.enqueue(chunk));
        nodeStream.on("end", () => controller.close());
        nodeStream.on("error", (err) => controller.error(err));
      },
      cancel() {
        nodeStream.destroy();
      },
    });

    return new NextResponse(webStream, {
      headers: {
        "Content-Type": contentType,
        "Content-Length": stats.size.toString(),
        "Cache-Control": "private, no-cache, no-store, must-revalidate",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err) {
    return new NextResponse("Media File Not Found on Disk", { status: 404 });
  }
}
