"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  postCritiqueCommentAction,
  deleteCritiqueCommentAction,
  togglePinCritiqueAction,
} from "@/app/actions/critiques";
import { toast } from "sonner";

export function usePostCritiqueMutation(artworkSlug: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (formData: FormData) => {
      const res = await postCritiqueCommentAction(formData);
      if (!res.success) throw new Error("Gagal mengirimkan kritik.");
      return res;
    },
    onSuccess: () => {
      toast.success("Kritik konstruktif berhasil dikirim!");
      queryClient.invalidateQueries({ queryKey: ["critiques", artworkSlug] });
    },
    onError: (err: any) => {
      toast.error(err?.message || "Gagal mengirimkan masukan.");
    },
  });
}

export function useDeleteCritiqueMutation(artworkSlug: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (commentId: string) => {
      return await deleteCritiqueCommentAction(commentId, artworkSlug);
    },
    onSuccess: () => {
      toast.success("Komentar berhasil dihapus.");
      queryClient.invalidateQueries({ queryKey: ["critiques", artworkSlug] });
    },
    onError: (err: any) => {
      toast.error(err?.message || "Gagal menghapus komentar.");
    },
  });
}

export function useTogglePinCritiqueMutation(artworkSlug: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (commentId: string) => {
      return await togglePinCritiqueAction(commentId, artworkSlug);
    },
    onSuccess: (res) => {
      toast.success(res.isPinned ? "Kritik disematkan ke atas!" : "Semat kritik dilepas.");
      queryClient.invalidateQueries({ queryKey: ["critiques", artworkSlug] });
    },
    onError: (err: any) => {
      toast.error(err?.message || "Gagal menyematkan komentar.");
    },
  });
}
