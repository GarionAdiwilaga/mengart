"use client";

import { useState, useRef } from "react";
import { Plus, X, UploadCloud, Image, Film, Sparkles, Loader2, AlertCircle, Check } from "lucide-react";
import { createArtworkUploadAction } from "@/app/actions/artworks";

export function UploadArtworkModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [caption, setCaption] = useState("");
  const [specialty, setSpecialty] = useState("Character Illustration");
  const [medium, setMedium] = useState("2D Digital");
  const [softwareUsed, setSoftwareUsed] = useState("Clip Studio Paint");
  const [audience, setAudience] = useState<"public" | "members_only" | "unlisted" | "private">("public");
  const [critiqueMode, setCritiqueMode] = useState<"showcase_only" | "open_for_critique">("showcase_only");
  const [isSpoiler, setIsSpoiler] = useState(false);
  const [tags, setTags] = useState("");

  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;

    setFile(selected);
    if (selected.type.startsWith("image/")) {
      setFilePreviewUrl(URL.createObjectURL(selected));
    } else {
      setFilePreviewUrl(null);
    }
  };

  const handleClose = () => {
    setIsOpen(false);
    setFile(null);
    setFilePreviewUrl(null);
    setTitle("");
    setCaption("");
    setIsSpoiler(false);
    setTags("");
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      setError("Silakan pilih file karya terlebih dahulu.");
      return;
    }

    setIsUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("title", title.trim() || "Untitled");
      formData.append("caption", caption.trim());
      formData.append("specialty", specialty);
      formData.append("medium", medium);
      formData.append("softwareUsed", softwareUsed);
      formData.append("audience", audience);
      formData.append("critiqueMode", critiqueMode);
      formData.append("isSpoiler", isSpoiler ? "true" : "false");
      formData.append("tags", tags);

      await createArtworkUploadAction(formData);
      handleClose();
    } catch (err: any) {
      setError(err?.message || "Gagal mengunggah karya");
      setIsUploading(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold transition-all shadow-md shadow-amber-500/20 flex items-center gap-1.5 cursor-pointer"
      >
        <Plus className="h-4 w-4" />
        <span>Unggah Karya Baru</span>
      </button>

      {isOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="w-full max-w-2xl glass-panel-elevated p-6 sm:p-8 rounded-3xl relative flex flex-col gap-6 max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="h-9 w-9 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
                  <UploadCloud className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-display font-bold text-lg text-[#f6f2e9]">
                    Unggah Karya ke Vault Portofolio
                  </h3>
                  <p className="text-xs text-zinc-400">
                    File master clean disimpan privat; versi teroptimasi digenerate otomatis untuk publik.
                  </p>
                </div>
              </div>
              <button
                onClick={handleClose}
                className="p-2 rounded-lg text-zinc-400 hover:text-white transition-colors cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {error ? (
              <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
                <span>{error}</span>
              </div>
            ) : null}

            <form onSubmit={handleSubmit} className="flex flex-col gap-5">
              {/* File Upload Zone */}
              <div
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-2xl p-6 flex flex-col items-center justify-center text-center cursor-pointer transition-all ${
                  file
                    ? "border-amber-500/50 bg-amber-500/5"
                    : "border-white/10 hover:border-amber-500/30 bg-white/[0.02]"
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,video/mp4"
                  onChange={handleFileChange}
                  className="hidden"
                />

                {file ? (
                  <div className="flex flex-col items-center gap-3">
                    {filePreviewUrl ? (
                      <img
                        src={filePreviewUrl}
                        alt="Preview"
                        className="max-h-48 rounded-xl object-contain shadow-md"
                      />
                    ) : (
                      <Film className="h-12 w-12 text-amber-400" />
                    )}
                    <span className="font-mono text-xs text-zinc-200">{file.name}</span>
                    <span className="text-[11px] text-zinc-500 font-mono">
                      ({(file.size / (1024 * 1024)).toFixed(2)} MB) • Klik untuk mengganti
                    </span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2">
                    <UploadCloud className="h-10 w-10 text-zinc-400 mb-1" />
                    <span className="text-sm font-semibold text-zinc-200">
                      Pilih file karya atau seret ke sini
                    </span>
                    <span className="text-xs text-zinc-500">
                      Mendukung JPG, PNG, WebP (maks. 25MB) & Video MP4 (maks. 50MB)
                    </span>
                  </div>
                )}
              </div>

              {/* Title & Caption */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5 sm:col-span-2">
                  <label className="text-xs font-mono text-zinc-300">JUDUL KARYA</label>
                  <input
                    type="text"
                    required
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. Guardian of the Celestial Shrine"
                    maxLength={100}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-zinc-600 focus:outline-none focus:border-amber-500/50 text-sm font-sans"
                  />
                </div>

                <div className="flex flex-col gap-1.5 sm:col-span-2">
                  <label className="text-xs font-mono text-zinc-300">DESKRIPSI / CATATAN PROSES</label>
                  <textarea
                    rows={2}
                    value={caption}
                    onChange={(e) => setCaption(e.target.value)}
                    placeholder="Ceritakan latar belakang konsep, inspirasi, atau proses pembuatan karya..."
                    className="w-full px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-zinc-600 focus:outline-none focus:border-amber-500/50 text-sm font-sans resize-none"
                  />
                </div>
              </div>

              {/* Specialty, Medium, Software */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-mono text-zinc-300">KATEGORI SPESIALISASI</label>
                  <select
                    value={specialty}
                    onChange={(e) => setSpecialty(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-[#181c26] border border-white/10 text-white text-xs font-sans focus:outline-none"
                  >
                    <option value="Character Illustration">Character Illustration</option>
                    <option value="Environment & Background">Environment & Background</option>
                    <option value="Concept Art">Concept Art</option>
                    <option value="Pixel Art">Pixel Art</option>
                    <option value="3D Modeling & Render">3D Modeling & Render</option>
                    <option value="Animation & Motion">Animation & Motion</option>
                    <option value="Comic / Webtoon">Comic / Webtoon</option>
                  </select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-mono text-zinc-300">MEDIUM</label>
                  <select
                    value={medium}
                    onChange={(e) => setMedium(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-[#181c26] border border-white/10 text-white text-xs font-sans focus:outline-none"
                  >
                    <option value="2D Digital">2D Digital</option>
                    <option value="3D Digital">3D Digital</option>
                    <option value="Vector Art">Vector Art</option>
                    <option value="Pixel Art">Pixel Art</option>
                    <option value="Traditional Hybrid">Traditional Hybrid</option>
                  </select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-mono text-zinc-300">SOFTWARE UTAMA</label>
                  <input
                    type="text"
                    value={softwareUsed}
                    onChange={(e) => setSoftwareUsed(e.target.value)}
                    placeholder="e.g. Clip Studio, Blender"
                    className="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-xs font-sans focus:outline-none"
                  />
                </div>
              </div>

              {/* Audience & Critique Mode */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-mono text-zinc-300">TARGET AUDIENS / AKSES</label>
                  <select
                    value={audience}
                    onChange={(e) => setAudience(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-xl bg-[#181c26] border border-white/10 text-white text-xs font-sans focus:outline-none"
                  >
                    <option value="public">Publik (Tampil di Showcase Galeri)</option>
                    <option value="members_only">Hanya Anggota Terdaftar</option>
                    <option value="unlisted">Unlisted (Hanya via Tautan Langsung)</option>
                    <option value="private">Privat (Hanya Saya)</option>
                  </select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-mono text-zinc-300">MODE KOMENTAR & KRITIK</label>
                  <select
                    value={critiqueMode}
                    onChange={(e) => setCritiqueMode(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-xl bg-[#181c26] border border-white/10 text-white text-xs font-sans focus:outline-none"
                  >
                    <option value="showcase_only">Showcase Saja (Apresiasi Standar)</option>
                    <option value="open_for_critique">Buka Kritik Konstruktif (Feedback)</option>
                  </select>
                </div>
              </div>

              {/* Tags */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-mono text-zinc-300">TAGS (PISAHKAN DENGAN KOMA)</label>
                <input
                  type="text"
                  value={tags}
                  onChange={(e) => setTags(e.target.value)}
                  placeholder="fantasy, cyber, oc, mecha, anime"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-zinc-600 focus:outline-none text-xs font-sans"
                />
              </div>

              {/* Spoiler */}
              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="portfolioIsSpoiler"
                  checked={isSpoiler}
                  onChange={(e) => setIsSpoiler(e.target.checked)}
                  className="rounded border-white/20 bg-white/5 text-amber-500 focus:ring-amber-500/50 h-4 w-4"
                />
                <label htmlFor="portfolioIsSpoiler" className="text-xs font-sans text-zinc-300 select-none cursor-pointer">
                  Tandai karya ini sebagai <span className="text-amber-400 font-medium">Spoiler</span> (konten sensitif/plot)
                </label>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-3 mt-4 pt-4 border-t border-white/10">
                <button
                  type="button"
                  onClick={handleClose}
                  className="px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-300 text-xs font-medium transition-colors cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isUploading}
                  className="px-6 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold transition-all shadow-md shadow-amber-500/20 flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {isUploading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin text-black" />
                      <span>Mengunggah & Memproses...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4 text-black" />
                      <span>Publikasikan Karya</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
