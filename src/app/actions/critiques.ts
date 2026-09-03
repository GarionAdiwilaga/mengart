"use server";

import { requireAuth } from "@/lib/rbac";
import { db } from "@/db";
import {
  artworks,
  profiles,
  critiqueComments,
  activityLogs,
  auditLogs,
} from "@/db/schema";
import { eq, and, isNull } from "drizzle-orm";
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
    throw new Error("Terlalu banyak komentar dikirim. Harap tunggu beberapa saat.");
  }

  const [profile] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.userId, user.id))
    .limit(1);

  if (!profile) throw new Error("Profil tidak ditemukan.");

  const artworkId = formData.get("artworkId") as string;
  const rawContent = (formData.get("content") as string)?.trim();
  const parentCommentId = (formData.get("parentCommentId") as string) || null;

  if (!artworkId || !rawContent) {
    throw new Error("Komentar tidak boleh kosong.");
  }

  if (rawContent.length > 2000) {
    throw new Error("Komentar melebihi batas maksimum 2000 karakter.");
  }

  // 1. Check artwork exists and is not deleted
  const [artwork] = await db
    .select()
    .from(artworks)
    .where(and(eq(artworks.id, artworkId), isNull(artworks.deletedAt)))
    .limit(1);

  if (!artwork) throw new Error("Karya tidak ditemukan.");

  // Blueprint 2.2.2 §7.5: critique_welcome is social flag only, does NOT block comments

  // 2. If parent comment is provided, verify it exists and belongs to same artwork
  if (parentCommentId) {
    const [parent] = await db
      .select()
      .from(critiqueComments)
      .where(and(eq(critiqueComments.id, parentCommentId), eq(critiqueComments.artworkId, artworkId)))
      .limit(1);
    if (!parent) {
      throw new Error("Komentar utama yang ingin dibalas tidak ditemukan.");
    }
  }

  // 3. Insert unified comment (critiqueAspect defaults to 'general' for legacy compatibility)
  const [newComment] = await db
    .insert(critiqueComments)
    .values({
      artworkId,
      userId: user.id,
      profileId: profile.id,
      parentCommentId,
      critiqueAspect: "general",
      content: rawContent,
    })
    .returning();

  // 4. Send notification to artwork author (if not self)
  if (artwork.userId !== user.id) {
    await createNotification({
      userId: artwork.userId,
      type: "artwork_critiqued",
      title: "Komentar Baru Diterima",
      body: `${profile.displayName} meninggalkan komentar pada karya "${artwork.title}".`,
      actionUrl: `/artworks/${artwork.slug}`,
    });
  }

  // 5. Log activity
  await db.insert(activityLogs).values({
    eventType: "critique_posted",
    targetType: "artwork",
    targetId: artworkId,
    metadata: {
      userId: user.id,
      artworkTitle: artwork.title,
      displayName: profile.displayName,
    },
  });

  revalidatePath(`/artworks/${artwork.slug}`);
  revalidatePath("/gallery");
  revalidatePath("/");
  return { success: true, commentId: newComment.id };
}

export async function editCritiqueCommentAction(
  commentId: string,
  artworkSlug: string,
  newContent: string
) {
  const user = await requireAuth("/login");

  const rl = await checkRateLimit(`critique_post:${user.id}`, {
    limit: 15,
    windowSeconds: 60,
    criticality: "fail_open",
  });
  if (!rl.success) {
    throw new Error("Terlalu banyak permintaan. Harap tunggu beberapa saat.");
  }

  const content = newContent?.trim();
  if (!content) {
    throw new Error("Komentar tidak boleh kosong.");
  }
  if (content.length > 2000) {
    throw new Error("Komentar melebihi batas maksimum 2000 karakter.");
  }

  const [comment] = await db
    .select()
    .from(critiqueComments)
    .where(and(eq(critiqueComments.id, commentId), isNull(critiqueComments.deletedAt)))
    .limit(1);

  if (!comment) {
    throw new Error("Komentar tidak ditemukan atau telah dihapus.");
  }

  if (comment.userId !== user.id) {
    throw new Error("Hanya penulis yang dapat mengedit komentar.");
  }

  await db
    .update(critiqueComments)
    .set({
      content,
      isEdited: true,
      updatedAt: new Date(),
    })
    .where(eq(critiqueComments.id, commentId));

  revalidatePath(`/artworks/${artworkSlug}`);
  return { success: true };
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
    .set({
      deletedAt: new Date(),
      deletedBy: user.id,
      deletionReason: isOwner ? "Dihapus oleh penulis" : "Dihapus oleh moderator",
    })
    .where(eq(critiqueComments.id, commentId));

  if (!isOwner && isModOrAdmin) {
    await db.insert(auditLogs).values({
      actorId: user.id,
      action: "comment.delete",
      targetType: "critique_comment",
      targetId: commentId,
      metadata: {
        artworkSlug,
        authorUserId: comment.userId,
      },
    });
  }

  revalidatePath(`/artworks/${artworkSlug}`);
  revalidatePath("/gallery");
  revalidatePath("/");
  return { success: true };
}

export async function hideCritiqueCommentAction(
  commentId: string,
  artworkSlug: string,
  reason: string
) {
  const user = await requireAuth("/login");

  if (user.role !== "moderator" && user.role !== "admin") {
    throw new Error("Hanya Staf/Moderator yang dapat menyembunyikan komentar.");
  }

  const trimmedReason = reason?.trim();
  if (!trimmedReason || trimmedReason.length < 5) {
    throw new Error("Alasan moderasi wajib diisi minimal 5 karakter.");
  }

  const [comment] = await db
    .select()
    .from(critiqueComments)
    .where(eq(critiqueComments.id, commentId))
    .limit(1);

  if (!comment) throw new Error("Komentar tidak ditemukan.");

  await db
    .update(critiqueComments)
    .set({
      isHidden: true,
      hiddenBy: user.id,
      hiddenReason: trimmedReason,
      updatedAt: new Date(),
    })
    .where(eq(critiqueComments.id, commentId));

  await db.insert(auditLogs).values({
    actorId: user.id,
    action: "comment.hide",
    targetType: "critique_comment",
    targetId: commentId,
    reason: trimmedReason,
    metadata: {
      artworkSlug,
      authorUserId: comment.userId,
      hiddenReason: trimmedReason,
    },
  });

  revalidatePath(`/artworks/${artworkSlug}`);
  revalidatePath("/gallery");
  revalidatePath("/");
  return { success: true };
}

export async function restoreCritiqueCommentAction(commentId: string, artworkSlug: string) {
  const user = await requireAuth("/login");

  if (user.role !== "moderator" && user.role !== "admin") {
    throw new Error("Hanya Staf/Moderator yang dapat memulihkan komentar.");
  }

  const [comment] = await db
    .select()
    .from(critiqueComments)
    .where(eq(critiqueComments.id, commentId))
    .limit(1);

  if (!comment) throw new Error("Komentar tidak ditemukan.");

  await db
    .update(critiqueComments)
    .set({
      isHidden: false,
      hiddenBy: null,
      hiddenReason: null,
      updatedAt: new Date(),
    })
    .where(eq(critiqueComments.id, commentId));

  await db.insert(auditLogs).values({
    actorId: user.id,
    action: "comment.restore",
    targetType: "critique_comment",
    targetId: commentId,
    metadata: {
      artworkSlug,
      authorUserId: comment.userId,
    },
  });

  revalidatePath(`/artworks/${artworkSlug}`);
  revalidatePath("/gallery");
  revalidatePath("/");
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
    throw new Error("Hanya pemilik karya yang dapat menyematkan komentar.");
  }

  await db
    .update(critiqueComments)
    .set({ isPinned: !comment.isPinned, updatedAt: new Date() })
    .where(eq(critiqueComments.id, commentId));

  revalidatePath(`/artworks/${artworkSlug}`);
  return { success: true, isPinned: !comment.isPinned };
}
