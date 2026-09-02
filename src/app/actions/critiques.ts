"use server";

import { requireAuth } from "@/lib/rbac";
import { db } from "@/db";
import {
  artworks,
  profiles,
  critiqueComments,
  activityLogs,
  type critiqueAspectEnum,
} from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { createNotification } from "@/lib/notifications";
import { checkRateLimit } from "@/lib/rateLimit";

export async function postCritiqueCommentAction(formData: FormData) {
  const user = await requireAuth("/login");

  // Rate Limiting (Low-Risk / Operational, Fail-Open with logging)
  const rl = await checkRateLimit(`critique_post:${user.id}`, {
    limit: 15,
    windowSeconds: 60,
    criticality: "fail_open",
  });
  if (!rl.success) {
    throw new Error("Terlalu banyak komentar kritik dikirim. Harap tunggu beberapa saat.");
  }

  const [profile] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.userId, user.id))
    .limit(1);

  if (!profile) throw new Error("Profil tidak ditemukan.");

  const artworkId = formData.get("artworkId") as string;
  const content = (formData.get("content") as string)?.trim();
  const critiqueAspect = (formData.get("critiqueAspect") as any) || "general";
  const parentCommentId = (formData.get("parentCommentId") as string) || null;

  if (!artworkId || !content) {
    throw new Error("Komentar tidak boleh kosong.");
  }

  // 1. Check artwork critique mode
  const [artwork] = await db
    .select()
    .from(artworks)
    .where(eq(artworks.id, artworkId))
    .limit(1);

  if (!artwork) throw new Error("Karya tidak ditemukan.");

  if (artwork.critiqueMode === "showcase_only") {
    throw new Error("Artist mengatur karya ini dalam mode showcase saja (tanpa feedback).");
  }

  // 2. Insert critique comment
  const [newComment] = await db
    .insert(critiqueComments)
    .values({
      artworkId,
      userId: user.id,
      profileId: profile.id,
      parentCommentId,
      critiqueAspect,
      content,
    })
    .returning();

  // 3. Send notification to artwork author (if not self)
  if (artwork.userId !== user.id) {
    await createNotification({
      userId: artwork.userId,
      type: "artwork_critiqued",
      title: "Kritik Baru Diterima",
      body: `${profile.displayName} memberikan masukan ${critiqueAspect.replace(/_/g, " ")} pada karya "${artwork.title}".`,
      actionUrl: `/artworks/${artwork.slug}`,
    });
  }

  // 4. Log activity
  await db.insert(activityLogs).values({
    eventType: "critique_posted",
    targetType: "artwork",
    targetId: artworkId,
    metadata: {
      userId: user.id,
      aspect: critiqueAspect,
      artworkTitle: artwork.title,
      displayName: profile.displayName,
    },
  });

  revalidatePath(`/artworks/${artwork.slug}`);
  return { success: true, commentId: newComment.id };
}

export async function deleteCritiqueCommentAction(commentId: string, artworkSlug: string) {
  const user = await requireAuth("/login");

  const rl = await checkRateLimit(`critique_post:${user.id}`, {
    limit: 15,
    windowSeconds: 60,
    criticality: "fail_open",
  });
  if (!rl.success) {
    throw new Error("Terlalu banyak permintaan. Harap tunggu beberapa saat.");
  }

  const [comment] = await db
    .select()
    .from(critiqueComments)
    .where(eq(critiqueComments.id, commentId))
    .limit(1);

  if (!comment) throw new Error("Komentar tidak ditemukan.");

  const isOwner = comment.userId === user.id;
  const isModOrAdmin = user.role === "moderator" || user.role === "admin";

  if (!isOwner && !isModOrAdmin) {
    throw new Error("Tidak memiliki hak untuk menghapus komentar ini.");
  }

  await db
    .update(critiqueComments)
    .set({ deletedAt: new Date() })
    .where(eq(critiqueComments.id, commentId));

  revalidatePath(`/artworks/${artworkSlug}`);
  return { success: true };
}

export async function togglePinCritiqueAction(commentId: string, artworkSlug: string) {
  const user = await requireAuth("/login");

  const rl = await checkRateLimit(`critique_post:${user.id}`, {
    limit: 15,
    windowSeconds: 60,
    criticality: "fail_open",
  });
  if (!rl.success) {
    throw new Error("Terlalu banyak permintaan. Harap tunggu beberapa saat.");
  }

  const [comment] = await db
    .select()
    .from(critiqueComments)
    .where(eq(critiqueComments.id, commentId))
    .limit(1);

  if (!comment) throw new Error("Komentar tidak ditemukan.");

  const [artwork] = await db
    .select()
    .from(artworks)
    .where(eq(artworks.id, comment.artworkId))
    .limit(1);

  if (!artwork || artwork.userId !== user.id) {
    throw new Error("Hanya pemilik karya yang dapat menyematkan kritik.");
  }

  await db
    .update(critiqueComments)
    .set({ isPinned: !comment.isPinned, updatedAt: new Date() })
    .where(eq(critiqueComments.id, commentId));

  revalidatePath(`/artworks/${artworkSlug}`);
  return { success: true, isPinned: !comment.isPinned };
}
