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

export async function handleGetMasterMedia(
  request: NextRequest,
  { params }: { params: Promise<{ key: string }> },
  sessionUserOverride?: { id: string; role?: string; membershipStatus?: string | null }
) {
  let sessionUser = sessionUserOverride;
  if (!sessionUser) {
    try {
      const session = await auth();
      sessionUser = session?.user as any;
    } catch {
      sessionUser = undefined;
    }
  }
  
  // 1. Authentication Guard & DB Membership Refresh
  if (!sessionUser || !sessionUser.id) {
    return new NextResponse("Unauthorized: Autentikasi diperlukan untuk mengakses master media orisinal.", {
      status: 401,
    });
  }

  const [dbUser] = await db
    .select({ membershipStatus: users.membershipStatus, role: users.role })
    .from(users)
    .where(eq(users.id, sessionUser.id))
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

  // Optional challenge ID context
  const searchParams = request.nextUrl.searchParams;
  const challengeId = searchParams.get("challengeId");

  const isAllowed = await canAccessMasterMedia(
    {
      id: sessionUser.id,
      role: dbUser.role as any,
      membershipStatus: dbUser.membershipStatus as any,
    },
    {
      id: version.artworkId,
      userId: version.artworkUserId,
      audience: version.artworkAudience as any,
      publicationStatus: version.artworkPublicationStatus as any,
      deletedAt: version.artworkDeletedAt,
    },
    challengeId
  );

  if (!isAllowed) {
    return new NextResponse("Forbidden: Anda tidak memiliki wewenang untuk mengakses master clean media karya ini.", {
      status: 403,
    });
  }

  // 3. Resolve file from private master storage and stream
  const filePath = resolveStoragePath("master", key);
  try {
    await fsp.access(filePath);
  } catch {
    return new NextResponse("File Media Fisik Tidak Ditemukan", { status: 404 });
  }

  const stat = await fsp.stat(filePath);
  const fileStream = fs.createReadStream(filePath);

  const headers = new Headers();
  headers.set("Content-Type", version.mimeType || "application/octet-stream");
  headers.set("Content-Length", stat.size.toString());
  headers.set("Cache-Control", "private, no-cache, no-store, must-revalidate");
  headers.set("Content-Disposition", `inline; filename="${path.basename(key)}"`);

  // Cast Node.js Readable stream to standard web ReadableStream for NextResponse
  return new NextResponse(fileStream as any, {
    status: 200,
    headers,
  });
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ key: string }> }
) {
  return handleGetMasterMedia(request, context);
}
