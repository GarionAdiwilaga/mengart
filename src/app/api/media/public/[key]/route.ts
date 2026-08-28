import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import { resolveStoragePath } from "@/lib/storage";
import { auth } from "@/auth";
import { db } from "@/db";
import { artworkVersions, artworks } from "@/db/schema";
import { eq, or } from "drizzle-orm";
import { canViewArtwork } from "@/lib/policy";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
  try {
    const { key } = await params;
    const safeKey = path.basename(key);
    const filePath = resolveStoragePath("public", safeKey);

    let stats: fs.Stats;
    try {
      stats = await fsp.stat(filePath);
      if (!stats.isFile()) {
        return new NextResponse("Not Found", { status: 404 });
      }
    } catch {
      return new NextResponse("Media derivative not found", { status: 404 });
    }

    // 1. Artwork Visibility ACL Resolution
    // Resolve key if it corresponds to a public, thumbnail, or poster derivative
    const [versionRow] = await db
      .select({
        artworkId: artworks.id,
        userId: artworks.userId,
        audience: artworks.audience,
        publicationStatus: artworks.publicationStatus,
        deletedAt: artworks.deletedAt,
      })
      .from(artworkVersions)
      .innerJoin(artworks, eq(artworks.id, artworkVersions.artworkId))
      .where(
        or(
          eq(artworkVersions.publicStorageKey, safeKey),
          eq(artworkVersions.thumbnailStorageKey, safeKey),
          eq(artworkVersions.posterStorageKey, safeKey)
        )
      )
      .limit(1);

    if (versionRow) {
      const session = await auth();
      const isAllowed = canViewArtwork(session?.user as any, {
        id: versionRow.artworkId,
        userId: versionRow.userId,
        audience: versionRow.audience as any,
        publicationStatus: versionRow.publicationStatus as any,
        deletedAt: versionRow.deletedAt,
      });

      if (!isAllowed) {
        if (!session?.user) {
          return new NextResponse("Unauthorized: Akses ke media ini memerlukan autentikasi member.", {
            status: 401,
          });
        }
        return new NextResponse("Forbidden: Anda tidak memiliki hak akses untuk melihat karya ini.", {
          status: 403,
        });
      }
    }

    const ext = path.extname(safeKey).toLowerCase();
    let contentType = "image/webp";
    if (ext === ".jpg" || ext === ".jpeg") contentType = "image/jpeg";
    else if (ext === ".png") contentType = "image/png";
    else if (ext === ".gif") contentType = "image/gif";
    else if (ext === ".mp4") contentType = "video/mp4";
    else if (ext === ".webm") contentType = "video/webm";

    const fileSize = stats.size;
    const rangeHeader = request.headers.get("range");

    // HTTP Range Request Handling (206 Partial Content)
    if (rangeHeader && rangeHeader.startsWith("bytes=")) {
      const parts = rangeHeader.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

      // Range validation (416 Range Not Satisfiable)
      if (isNaN(start) || isNaN(end) || start < 0 || end >= fileSize || start > end) {
        return new NextResponse(null, {
          status: 416,
          headers: {
            "Content-Range": `bytes */${fileSize}`,
            "X-Content-Type-Options": "nosniff",
          },
        });
      }

      const chunkSize = end - start + 1;
      const nodeStream = fs.createReadStream(filePath, { start, end });

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
        status: 206,
        headers: {
          "Content-Range": `bytes ${start}-${end}/${fileSize}`,
          "Accept-Ranges": "bytes",
          "Content-Length": chunkSize.toString(),
          "Content-Type": contentType,
          "Cache-Control": versionRow?.audience === "public" ? "public, max-age=31536000, immutable" : "private, no-cache",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }

    // Full File Streaming (200 OK)
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
      status: 200,
      headers: {
        "Content-Length": fileSize.toString(),
        "Content-Type": contentType,
        "Accept-Ranges": "bytes",
        "Cache-Control": versionRow?.audience === "public" ? "public, max-age=31536000, immutable" : "private, no-cache",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("Public media streaming error:", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
