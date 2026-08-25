import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { resolveStoragePath } from "@/lib/storage";
import fs from "fs";
import fsp from "fs/promises";
import path from "path";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
  const session = await auth();
  
  // 1. Authorization Guard
  if (!session?.user || !session.user.id) {
    return new NextResponse("Unauthorized: Authentication required to view full-quality master media.", {
      status: 401,
    });
  }

  if (session.user.membershipStatus !== "active") {
    return new NextResponse("Forbidden: Account is not in active standing.", {
      status: 403,
    });
  }

  const { key } = await params;
  if (!key) {
    return new NextResponse("Missing media key", { status: 400 });
  }

  // 2. Resolve Path with Path Traversal Protection
  const filePath = resolveStoragePath("master", key);

  try {
    const stats = await fsp.stat(filePath);
    if (!stats.isFile()) {
      return new NextResponse("Not Found", { status: 404 });
    }

    // Determine MIME type based on extension
    const ext = path.extname(filePath).toLowerCase();
    let contentType = "application/octet-stream";
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
    return new NextResponse("Media Not Found", { status: 404 });
  }
}
