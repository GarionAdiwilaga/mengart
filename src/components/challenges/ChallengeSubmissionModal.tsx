"use client";

import { useState } from "react";
import { submitArtworkToChallengeAction } from "@/app/actions/challenges";
import {
  Upload,
  Sparkles,
  Loader2,
  Image as ImageIcon,
  X,
  CheckCircle2,
  AlertCircle,
  FileCode,
} from "lucide-react";

interface ChallengeSubmissionModalProps {
  challengeId: string;
  challengeTitle: string;
  isRevision?: boolean;
  initialTitle?: string;
  initialDescription?: string;
  initialSoftware?: string;
  initialSpoiler?: boolean;
}

export function ChallengeSubmissionModal({
  challengeId,
  challengeTitle,
  isRevision = false,
  initialTitle = "",
  initialDescription = "",
  initialSoftware = "",
  initialSpoiler = false,
}: ChallengeSubmissionModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const [title, setTitle] = useState(initialTitle);
  const [description, setDescription] = useState(initialDescription);
  const [softwareUsed, setSoftwareUsed] = useState(initialSoftware);

  const [isSpoiler, setIsSpoiler] = useState(initialSpoiler);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) {
      setFile(selected);
      setPreviewUrl(URL.createObjectURL(selected));
      if (!title) {
        setTitle(selected.name.replace(/\.[^/.]+$/, ""));
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file && !isRevision) {
      setError("Silakan pilih file karya untuk diunggah.");
      return;
    }

    setIsLoading(true);
    setError(null);

    const formData = new FormData();
    formData.append("challengeId", challengeId);
    formData.append("title", title.trim());
    formData.append("isSpoiler", isSpoiler ? "true" : "false");
    if (description) formData.append("description", description.trim());
    if (softwareUsed) formData.append("softwareUsed", softwareUsed.trim());

    if (file) {
      formData.append("file", file);
    }

    try {
      const res = await submitArtworkToChallengeAction(formData);
      if (res.success) {
        setSuccess(true);
        setTimeout(() => {
          setIsOpen(false);
          setSuccess(false);
        }, 2000);
      }
    } catch (err: any) {
      setError(err?.message || "Gagal mengirimkan submisi karya.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="px-6 py-3.5 rounded-2xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-sm transition-all duration-200 shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2 cursor-pointer"
      >
        <Sparkles className="h-4 w-4 text-black" />
        <span>{isRevision ? "Kirim Revisi Submisi" : "Kirim Karya Submisi"}</span>
      </button>

      {isOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="w-full max-w-xl glass-panel-elevated p-6 sm:p-8 rounded-3xl relative z-10 flex flex-col gap-6 max-h-[90vh] overflow-y-auto border border-white/15 shadow-2xl">
            {/* Header */}
            <div className="flex items-start justify-between border-b border-white/10 pb-4">
              <div className="flex flex-col">
                <span className="text-[10px] font-mono uppercase text-amber-400">
                  {isRevision ? "REVISI KARYA" : "SUBMISI RESMI"}
                </span>
                <h3 className="font-display font-bold text-xl text-[#f6f2e9]">
                  {isRevision ? "Perbarui Submisi" : "Kirim Karya ke Challenge"}
                </h3>
                <p className="text-xs text-zinc-400 mt-0.5">{challengeTitle}</p>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white transition-colors cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {success ? (
              <div className="py-12 flex flex-col items-center justify-center text-center gap-3">
                <CheckCircle2 className="h-12 w-12 text-emerald-400" />
                <h4 className="font-display font-bold text-lg text-emerald-300">
                  {isRevision ? "Revisi Berhasil Dikirim!" : "Submisi Berhasil Terkirim!"}
                </h4>
                <p className="text-xs text-zinc-400 max-w-sm">
                  Karya Anda telah tercatat pada sistem challenge dan siap memasuki babak berikutnya.
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="flex flex-col gap-5">
                {error ? (
                  <div className="p-3.5 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
                    <span>{error}</span>
                  </div>
                ) : null}

                {/* Direct Canonical File Upload */}
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-mono text-zinc-300">FILE KARYA</label>
                  <label className="border-2 border-dashed border-white/15 hover:border-amber-500/50 rounded-2xl p-6 flex flex-col items-center justify-center gap-3 cursor-pointer bg-white/[0.02] transition-colors relative overflow-hidden">
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm"
                      onChange={handleFileChange}
                      className="hidden"
                    />
                    {previewUrl ? (
                      <div className="relative w-full max-h-48 flex items-center justify-center overflow-hidden rounded-xl">
                        <img
                          src={previewUrl}
                          alt="Preview"
                          className="max-h-48 object-contain rounded-lg shadow-lg"
                        />
                      </div>
                    ) : (
                      <>
                        <div className="h-10 w-10 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-400">
                          <Upload className="h-5 w-5" />
                        </div>
                        <div className="text-center">
                          <span className="text-xs font-semibold text-zinc-200 block">
                            Pilih file atau seret & lepas di sini
                          </span>
                          <span className="text-[11px] text-zinc-500 font-mono mt-0.5 block">
                            PNG, JPG, WebP, GIF, MP4 (Maks. 25MB - 50MB)
                          </span>
                        </div>
                      </>
                    )}
                  </label>
                </div>

                {/* Submisi Details Form */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-mono text-zinc-300">JUDUL KARYA SUBMISI</label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    required
                    placeholder="e.g. Celestial Guardian of Bali"
                    className="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-zinc-600 focus:outline-none focus:border-amber-500/60 text-sm font-sans"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-mono text-zinc-300">
                    SOFTWARE YANG DIGUNAKAN
                  </label>
                  <input
                    type="text"
                    value={softwareUsed}
                    onChange={(e) => setSoftwareUsed(e.target.value)}
                    placeholder="e.g. Clip Studio Paint, Photoshop, Blender"
                    className="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-zinc-600 focus:outline-none focus:border-amber-500/60 text-xs font-mono"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-mono text-zinc-300">
                    CATATAN PROSES / DESKRIPSI KARYA
                  </label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={3}
                    placeholder="Jelaskan konsep, proses pembuatan, atau latar belakang karya Anda..."
                    className="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-zinc-600 focus:outline-none focus:border-amber-500/60 text-xs font-sans resize-none"
                  />
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="checkbox"
                    id="challengeIsSpoiler"
                    checked={isSpoiler}
                    onChange={(e) => setIsSpoiler(e.target.checked)}
                    className="rounded border-white/20 bg-white/5 text-amber-500 focus:ring-amber-500/50 h-4 w-4"
                  />
                  <label htmlFor="challengeIsSpoiler" className="text-xs font-sans text-zinc-300 select-none cursor-pointer">
                    Tandai karya ini sebagai <span className="text-amber-400 font-medium">Spoiler</span> (konten sensitif/plot cerita)
                  </label>
                </div>

                {/* Submit Action */}
                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full mt-2 py-3.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-sm transition-all duration-200 shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin text-black" />
                      <span>Memproses Submisi...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4 text-black" />
                      <span>{isRevision ? "Kirim Revisi Sekarang" : "Konfirmasi & Kirim Submisi"}</span>
                    </>
                  )}
                </button>
              </form>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
