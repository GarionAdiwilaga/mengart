import { resolveStoragePath } from "@/lib/storage";
import fs from "fs/promises";
import path from "path";
import { db } from "@/db";
import { challengeKitFiles } from "@/db/schema";
import { eq } from "drizzle-orm";

interface KitRouteProps {
  params: Promise<{ fileKey: string }>;
}

export async function GET(request: Request, props: KitRouteProps) {
  const { fileKey } = await props.params;

  const [kit] = await db
    .select()
    .from(challengeKitFiles)
    .where(eq(challengeKitFiles.fileStorageKey, fileKey))
    .limit(1);

  const filePath = resolveStoragePath("public", fileKey);

  try {
    const fileBuffer = await fs.readFile(filePath);
    const headers = new Headers();
    headers.set("Content-Type", kit?.mimeType || "application/octet-stream");
    headers.set(
      "Content-Disposition",
      `attachment; filename="${encodeURIComponent(kit?.fileName || fileKey)}"`
    );
    headers.set("Content-Length", String(fileBuffer.length));

    return new Response(fileBuffer, { headers });
  } catch (err) {
    return new Response("Kit file not found", { status: 404 });
  }
}
