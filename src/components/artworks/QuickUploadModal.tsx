"use client";

import { useState, useRef, useEffect } from "react";
import { useModalStore } from "@/stores/useModalStore";
import { useUploadArtworkMutation } from "@/hooks/useArtworks";
import { Upload, Image as ImageIcon, Loader2, Sparkles } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/AccessibleDialog";

export function QuickUploadModal() {
  const { isUploadModalOpen, closeUploadModal } = useModalStore();
  const uploadMutation = useUploadArtworkMutation();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [audience, setAudience] = useState<"public" | "members_only" | "unlisted" | "private">("public");
  const [critiqueMode, setCritiqueMode] = useState<"showcase_only" | "open_for_critique">("open_for_critique");
  const [tagsInput, setTagsInput] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Clean up object URLs to prevent memory leaks
  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  const handleFileSelect = (selectedFile: File) => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setFile(selectedFile);
    setPreviewUrl(URL.createObjectURL(selectedFile));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) {
      handleFileSelect(selected);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const droppedFile = e.dataTransfer.files?.[0];
    if (droppedFile) {
      handleFileSelect(droppedFile);
    }
  };

  const isVideo = file?.type.startsWith("video/") || file?.name.toLowerCase().endsWith(".mp4");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !title.trim()) return;

    const formData = new FormData();
    formData.append("file", file);
    formData.append("title", title.trim());
    formData.append("description", description.trim());
    formData.append("audience", audience);
    formData.append("critiqueMode", critiqueMode);
    if (tagsInput.trim()) formData.append("tags", tagsInput.trim());

    uploadMutation.mutate(formData, {
      onSuccess: () => {
        closeUploadModal();
        setTitle("");
        setDescription("");
        setTagsInput("");
        setFile(null);
        setPreviewUrl(null);
      },
    });
  };

  return (
    <Dialog
      open={isUploadModalOpen}
      onOpenChange={(open) => {
        if (!open) closeUploadModal();
      }}
    >
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Upload className="h-4 w-4" />
            </div>
            <div>
              <DialogTitle>Unggah Karya Master</DialogTitle>
              <DialogDescription>
                File master dilindungi, otomatis diekstrak WebP & watermark publik.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-5 pt-2">
          {/* File Dropzone / Dynamic Preview (Image vs Video) */}
          <div
            onClick={() => fileInputRef.current?.click()}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-3xl p-6 flex flex-col items-center justify-center text-center gap-3 transition-all cursor-pointer min-h-[160px] ${
              isDragging
                ? "border-amber-400 bg-amber-500/15 scale-[1.01]"
                : previewUrl
                ? "border-amber-500/40 bg-amber-500/5"
                : "border-white/15 hover:border-amber-500/50 bg-white/[0.02]"
            }`}
          >
            <input
              ref={fileInputRef}
              id="artwork-file-input"
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif,video/mp4"
              onChange={handleFileChange}
              className="hidden"
            />

            {previewUrl ? (
              <div className="relative w-full max-h-64 rounded-2xl overflow-hidden flex items-center justify-center bg-black/40 p-2">
                {isVideo ? (
                  <video
                    src={previewUrl}
                    controls
                    className="max-h-56 w-full object-contain rounded-xl"
                  />
                ) : (
                  <img
                    src={previewUrl}
                    alt="Pratinjau Karya"
                    className="max-h-56 object-contain rounded-xl"
                  />
                )}
              </div>
            ) : (
              <div className="py-6 flex flex-col items-center gap-2">
                <div className="h-12 w-12 rounded-2xl bg-white/5 flex items-center justify-center text-amber-400">
                  <ImageIcon className="h-6 w-6" />
                </div>
                <span className="font-display font-semibold text-sm text-[#f6f2e9]">
                  Pilih atau Seret File Karya (PNG, JPG, WEBP, GIF, MP4)
                </span>
                <span className="text-xs font-mono text-zinc-500">
                  Resolusi master asli dilindungi tanpa kompresi kasar
                </span>
              </div>
            )}
          </div>

          {/* Title & Tags */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="artwork-title" className="text-xs font-mono text-zinc-300">
                JUDUL KARYA <span className="text-amber-400">*</span>
              </label>
              <input
                id="artwork-title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="contoh: Ethereal Forest Sanctuary"
                required
                className="w-full px-4 py-2.5 min-h-[44px] rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-zinc-600 focus:outline-none focus:border-amber-500/60 text-base sm:text-sm font-sans"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="artwork-tags" className="text-xs font-mono text-zinc-300">
                TAGS (PISAHKAN KOMA)
              </label>
              <input
                id="artwork-tags"
                type="text"
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                placeholder="fantasy, landscape, conceptart"
                className="w-full px-4 py-2.5 min-h-[44px] rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-zinc-600 focus:outline-none focus:border-amber-500/60 text-base sm:text-sm font-sans"
              />
            </div>
          </div>

          {/* Description */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="artwork-description" className="text-xs font-mono text-zinc-300">
              DESKRIPSI & PROSES KREATIF
            </label>
            <textarea
              id="artwork-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Ceritakan latar belakang karya, software yang digunakan (Photoshop, Blender, dll)..."
              className="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-zinc-600 focus:outline-none focus:border-amber-500/60 text-base sm:text-sm font-sans resize-none"
            />
          </div>

          {/* Settings Grid: Audience & Critique Mode */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="artwork-audience" className="text-xs font-mono text-zinc-300">
                VISIBILITAS KARYA
              </label>
              <select
                id="artwork-audience"
                value={audience}
                onChange={(e) => setAudience(e.target.value as any)}
                className="w-full px-4 py-2.5 min-h-[44px] rounded-xl bg-[#191c23] border border-white/10 text-white text-base sm:text-xs font-mono focus:outline-none"
              >
                <option value="public">Publik (Tampil di Galeri Utama)</option>
                <option value="members_only">Khusus Member Atelier</option>
                <option value="unlisted">Unlisted (Hanya via Tautan Langsung)</option>
                <option value="private">Privat (Hanya Anda & Admin)</option>
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="artwork-critique-mode" className="text-xs font-mono text-zinc-300">
                MODE MASUKAN & KRITIK
              </label>
              <select
                id="artwork-critique-mode"
                value={critiqueMode}
                onChange={(e) => setCritiqueMode(e.target.value as any)}
                className="w-full px-4 py-2.5 min-h-[44px] rounded-xl bg-[#191c23] border border-white/10 text-white text-base sm:text-xs font-mono focus:outline-none"
              >
                <option value="open_for_critique">Buka untuk Kritik Konstruktif</option>
                <option value="showcase_only">Showcase Only (Apresiasi Saja)</option>
              </select>
            </div>
          </div>

          {/* Submit Buttons */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-white/10">
            <button
              type="button"
              onClick={closeUploadModal}
              aria-label="Batalkan pengunggahan karya"
              className="px-4 py-2.5 min-h-[44px] rounded-xl bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white text-xs font-mono transition-colors cursor-pointer"
            >
              Batal
            </button>

            <button
              type="submit"
              disabled={uploadMutation.isPending || !file || !title.trim()}
              aria-label="Publikasikan karya master ke galeri"
              className="px-6 py-2.5 min-h-[44px] rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs font-mono transition-all shadow-md shadow-amber-500/20 flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {uploadMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin text-black" />
                  <span>Memproses Karya...</span>
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  <span>Publikasikan Karya</span>
                </>
              )}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
