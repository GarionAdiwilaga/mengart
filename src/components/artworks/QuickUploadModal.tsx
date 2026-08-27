"use client";

import { useState, useRef } from "react";
import { useModalStore } from "@/stores/useModalStore";
import { useUploadArtworkMutation } from "@/hooks/useArtworks";
import { motion, AnimatePresence } from "framer-motion";
import { Upload, X, Image as ImageIcon, Loader2, Sparkles, AlertCircle } from "lucide-react";

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
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) {
      setFile(selected);
      setPreviewUrl(URL.createObjectURL(selected));
    }
  };

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
    <AnimatePresence>
      {isUploadModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-md">
          <div className="fixed inset-0" onClick={closeUploadModal} />

          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 40 }}
            transition={{ type: "spring", stiffness: 350, damping: 30 }}
            className="w-full max-w-2xl glass-panel-elevated p-5 sm:p-8 rounded-t-3xl sm:rounded-3xl border border-white/15 shadow-2xl relative z-10 max-h-[90vh] overflow-y-auto flex flex-col gap-5 sm:gap-6"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div className="flex items-center gap-2.5">
                <div className="h-9 w-9 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
                  <Upload className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="font-display font-bold text-lg text-[#f6f2e9]">Unggah Karya Master</h3>
                  <p className="text-xs text-zinc-400">
                    File master dilindungi, otomatis diekstrak WebP & watermark publik.
                  </p>
                </div>
              </div>

              <button
                onClick={closeUploadModal}
                className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white transition-colors cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="flex flex-col gap-5">
              {/* File Dropzone / Preview */}
              <div
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-3xl p-6 flex flex-col items-center justify-center text-center gap-3 transition-all cursor-pointer ${
                  previewUrl
                    ? "border-amber-500/40 bg-amber-500/5"
                    : "border-white/15 hover:border-amber-500/50 bg-white/[0.02]"
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif,video/mp4"
                  onChange={handleFileChange}
                  className="hidden"
                />

                {previewUrl ? (
                  <div className="relative w-full max-h-56 rounded-2xl overflow-hidden flex items-center justify-center bg-black/40">
                    <img
                      src={previewUrl}
                      alt="Preview"
                      className="max-h-56 object-contain rounded-xl"
                    />
                    <div className="absolute inset-0 bg-black/40 opacity-0 hover:opacity-100 flex items-center justify-center transition-opacity text-xs font-mono text-white">
                      Klik untuk mengganti file
                    </div>
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
                      Resolusi master asli tanpa batas kompresi kasar
                    </span>
                  </div>
                )}
              </div>

              {/* Title & Tags */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-mono text-zinc-300">JUDUL KARYA</label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="contoh: Ethereal Forest Sanctuary"
                    required
                    className="w-full px-4 py-2.5 min-h-[44px] rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-zinc-600 focus:outline-none focus:border-amber-500/60 text-base sm:text-sm font-sans"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-mono text-zinc-300">TAGS (PISAHKAN KOMA)</label>
                  <input
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
                <label className="text-xs font-mono text-zinc-300">DESKRIPSI & PROSES KREATIF</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  placeholder="Ceritakan latar belakang karya, inspirasi, software yang digunakan (Photoshop, Clip Studio, Blender)..."
                  className="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-zinc-600 focus:outline-none focus:border-amber-500/60 text-base sm:text-sm font-sans resize-none"
                />
              </div>

              {/* Settings Grid: Audience & Critique Mode */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-mono text-zinc-300">VISIBILITAS KARYA</label>
                  <select
                    value={audience}
                    onChange={(e) => setAudience(e.target.value as any)}
                    className="w-full px-4 py-2.5 min-h-[44px] rounded-xl bg-[#191c23] border border-white/10 text-white text-base sm:text-xs font-mono focus:outline-none"
                  >
                    <option value="public">Publik (Tampil di Galeri Utama)</option>
                    <option value="members_only">Khusus Member Atelier</option>
                    <option value="unlisted">Unlisted (Hanya via Tautan Langsung)</option>
                  </select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-mono text-zinc-300">MODE MASUKAN & KRITIK</label>
                  <select
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
                  className="px-4 py-2.5 min-h-[44px] rounded-xl bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white text-xs font-mono transition-colors cursor-pointer"
                >
                  Batal
                </button>

                <button
                  type="submit"
                  disabled={uploadMutation.isPending || !file || !title.trim()}
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
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>
  );
}
