"use server";

import { requireAuth } from "@/lib/rbac";
import { db } from "@/db";
import { revalidatePath } from "next/cache";
import {
  stageAndPromoteMedia,
  cleanupPromotedMedia,
} from "@/lib/services/submissionService";
import {
  createArtworkUploadService,
  updateArtworkService,
  toggleArtworkSpoilerService,
  deleteArtworkService,
} from "@/lib/services/artworkService";
import {
  togglePortfolioEntryVisibilityService,
  updatePortfolioEntryCustomCaptionService,
} from "@/lib/services/portfolioService";

export async function createArtworkUploadAction(formData: FormData) {
  const user = await requireAuth("/login");

  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) {
    throw new Error("Silakan pilih file karya untuk diunggah.");
  }

  // Pre-allocation file size check
  const isVideo = file.type.startsWith("video/");
  const maxBytes = isVideo ? 50 * 1024 * 1024 : 25 * 1024 * 1024;
  if (file.size > maxBytes) {
    throw new Error(`Ukuran berkas melebihi batas maksimum (${isVideo ? "50MB" : "25MB"}).`);
  }

  const title = (formData.get("title") as string)?.trim() || "Untitled Artwork";
  const description = (formData.get("caption") as string)?.trim() || null;
  const audience = ((formData.get("audience") as string) || "public") as
    | "public"
    | "members_only"
    | "unlisted"
    | "private";
  const critiqueMode = ((formData.get("critiqueMode") as string) || "showcase_only") as
    | "showcase_only"
    | "open_for_critique";
  const isSpoiler = formData.get("isSpoiler") === "true" || formData.get("isSpoiler") === "1" || formData.get("isSpoiler") === "on";
  const tagsRaw = (formData.get("tags") as string) || "";

  const tagsList = tagsRaw
    ? tagsRaw
        .split(",")
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean)
    : [];

  const buffer = Buffer.from(await file.arrayBuffer());

  // 1. Stage and process media before DB transaction
  const staged = await stageAndPromoteMedia({
    buffer,
    name: file.name,
    type: file.type,
    size: file.size,
  });

  let result: any;
  try {
    result = await db.transaction(async (tx) => {
      return await createArtworkUploadService(tx, {
        actorUserId: user.id,
        title,
        description,
        audience,
        critiqueMode,
        isSpoiler,
        tagsList,
        staged,
      });
    });
  } catch (err) {
    // If DB transaction fails before commit, clean up unreferenced staged media
    await cleanupPromotedMedia(staged);
    throw err;
  }

  // 2. Post-commit cache revalidation (failures here MUST NOT delete committed media)
  try {
    revalidatePath("/me/portfolio");
    revalidatePath("/gallery");
    revalidatePath(`/artists/${result.profile.slug}`);
  } catch (revalidateErr) {
    console.warn("revalidatePath warning:", revalidateErr);
  }

  return { success: true, artworkId: result.artwork.id, slug: result.artwork.slug };
}

export async function updateArtworkAction(formData: FormData) {
  const user = await requireAuth("/login");

  const artworkId = formData.get("artworkId") as string;
  const title = (formData.get("title") as string)?.trim();
  const description = (formData.get("description") as string)?.trim() || null;
  const audience = (formData.get("audience") as string) as "public" | "members_only" | "unlisted" | "private" | undefined;
  const critiqueMode = (formData.get("critiqueMode") as string) as "showcase_only" | "general" | "detailed" | undefined;
  const isSpoilerVal = formData.get("isSpoiler");
  const isSpoiler = isSpoilerVal !== null ? (isSpoilerVal === "true" || isSpoilerVal === "1" || isSpoilerVal === "on") : undefined;

  if (!artworkId || !title) {
    throw new Error("Data karya tidak lengkap.");
  }

  const updated = await db.transaction(async (tx) => {
    return await updateArtworkService(tx, {
      actorUserId: user.id,
      artworkId,
      title,
      description,
      audience,
      critiqueMode: critiqueMode as any,
      isSpoiler,
    });
  });

  try {
    revalidatePath("/me/portfolio");
    revalidatePath("/gallery");
    revalidatePath(`/artworks/${updated.slug}`);
  } catch (revalidateErr) {
    console.warn("revalidatePath warning:", revalidateErr);
  }

  return { success: true, artwork: updated };
}

export async function toggleArtworkSpoilerAction(artworkId: string, isSpoiler: boolean) {
  const user = await requireAuth("/login");

  const updated = await db.transaction(async (tx) => {
    return await toggleArtworkSpoilerService(tx, {
      actorUserId: user.id,
      artworkId,
      isSpoiler,
    });
  });

  try {
    revalidatePath("/me/portfolio");
    revalidatePath("/gallery");
    revalidatePath(`/artworks/${updated.slug}`);
  } catch (revalidateErr) {
    console.warn("revalidatePath warning:", revalidateErr);
  }

  return { success: true, artwork: updated };
}

export async function toggleArtworkPortfolioVisibilityAction(artworkId: string, isVisible: boolean) {
  const user = await requireAuth("/login");

  const result = await db.transaction(async (tx) => {
    return await togglePortfolioEntryVisibilityService(tx, {
      actorUserId: user.id,
      artworkId,
      isVisible,
    });
  });

  try {
    revalidatePath("/me/portfolio");
    revalidatePath("/gallery");
  } catch (revalidateErr) {
    console.warn("revalidatePath warning:", revalidateErr);
  }

  return { success: true, result };
}

export async function updatePortfolioCustomCaptionAction(artworkId: string, customCaption: string | null) {
  const user = await requireAuth("/login");

  const result = await db.transaction(async (tx) => {
    return await updatePortfolioEntryCustomCaptionService(tx, {
      actorUserId: user.id,
      artworkId,
      customCaption,
    });
  });

  try {
    revalidatePath("/me/portfolio");
  } catch (revalidateErr) {
    console.warn("revalidatePath warning:", revalidateErr);
  }

  return { success: true, result };
}

export async function deleteArtworkAction(artworkId: string) {
  const user = await requireAuth("/login");

  const deleted = await db.transaction(async (tx) => {
    return await deleteArtworkService(tx, {
      actorUserId: user.id,
      artworkId,
    });
  });

  try {
    revalidatePath("/me/portfolio");
    revalidatePath("/gallery");
    revalidatePath(`/artworks/${deleted.slug}`);
  } catch (revalidateErr) {
    console.warn("revalidatePath warning:", revalidateErr);
  }

  return { success: true };
}
