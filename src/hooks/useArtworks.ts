"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createArtworkUploadAction } from "@/app/actions/artworks";
import { toast } from "sonner";

export interface ArtworkListItem {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  mediaType: "image" | "gif" | "video";
  audience: "public" | "members_only" | "unlisted" | "private";
  critiqueMode: "showcase_only" | "open_for_critique";
  isSpoiler?: boolean;
  createdAt: string;
  artistName: string;
  artistSlug: string;
  artistAvatar: string | null;
  artistCommissionStatus: "open" | "waitlist" | "closed";
  thumbnailStorageKey: string | null;
  publicStorageKey: string | null;
  masterStorageKey: string | null;
  width: number | null;
  height: number | null;
}

export function useArtworksQuery(filters: {
  search?: string;
  tag?: string | null;
  mediaType?: string;
  critiqueMode?: string;
}) {
  return useQuery({
    queryKey: ["artworks", filters],
    queryFn: async (): Promise<ArtworkListItem[]> => {
      const params = new URLSearchParams();
      if (filters.search) params.set("search", filters.search);
      if (filters.tag) params.set("tag", filters.tag);
      if (filters.mediaType && filters.mediaType !== "all") params.set("mediaType", filters.mediaType);
      if (filters.critiqueMode && filters.critiqueMode !== "all") params.set("critiqueMode", filters.critiqueMode);

      const res = await fetch(`/api/artworks?${params.toString()}`);
      if (!res.ok) throw new Error("Gagal memuat galeri karya.");
      const data = await res.json();
      return data.items || [];
    },
  });
}

export function useUploadArtworkMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (formData: FormData) => {
      const res = await createArtworkUploadAction(formData);
      if (!res.success) throw new Error("Gagal mengunggah karya.");
      return res;
    },
    onSuccess: () => {
      toast.success("Karya berhasil diunggah dan sedang diproses!");
      queryClient.invalidateQueries({ queryKey: ["artworks"] });
      queryClient.invalidateQueries({ queryKey: ["my-portfolio"] });
    },
    onError: (err: any) => {
      toast.error(err?.message || "Gagal mengunggah karya.");
    },
  });
}
