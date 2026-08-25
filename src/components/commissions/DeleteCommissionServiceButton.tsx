"use client";

import { useState } from "react";
import { Trash2, Loader2 } from "lucide-react";
import { deleteCommissionServiceAction } from "@/app/actions/commissions";

interface DeleteCommissionServiceButtonProps {
  serviceId: string;
  title: string;
}

export function DeleteCommissionServiceButton({ serviceId, title }: DeleteCommissionServiceButtonProps) {
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    if (!confirm(`Hapus layanan komisi "${title}"?`)) return;

    setIsDeleting(true);
    try {
      await deleteCommissionServiceAction(serviceId);
    } catch (err: any) {
      alert(err?.message || "Gagal menghapus layanan");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <button
      onClick={handleDelete}
      disabled={isDeleting}
      title="Hapus Layanan"
      className="p-2 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs transition-colors border border-red-500/20 cursor-pointer disabled:opacity-50"
    >
      {isDeleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
    </button>
  );
}
