"use client";

import { useState } from "react";
import { Trash2, Loader2 } from "lucide-react";
import { deleteArtworkAction } from "@/app/actions/artworks";

interface DeleteArtworkButtonProps {
  artworkId: string;
  title: string;
}

export function DeleteArtworkButton({ artworkId, title }: DeleteArtworkButtonProps) {
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    if (!confirm(`Apakah Anda yakin ingin menghapus karya "${title}"? Tindakan ini tidak dapat dibatalkan.`)) {
      return;
    }

    setIsDeleting(true);
    try {
      await deleteArtworkAction(artworkId);
    } catch (err: any) {
      alert(err?.message || "Gagal menghapus karya");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <button
      onClick={handleDelete}
      disabled={isDeleting}
      title="Hapus Karya"
      className="p-2 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs transition-colors border border-red-500/20 cursor-pointer disabled:opacity-50"
    >
      {isDeleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
    </button>
  );
}
