"use client";

import { useState, useEffect, useRef } from "react";
import { submitArtworkToChallengeAction } from "@/app/actions/challenges";
import {
  Sparkles,
  Upload,
  Image as ImageIcon,
  CheckCircle2,
  AlertCircle,
  FileCode,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/AccessibleDialog";
import { AtelierButton } from "@/components/ui/atoms/AtelierButton";
import { AtelierInput } from "@/components/ui/atoms/AtelierInput";
import { AtelierTextarea } from "@/components/ui/atoms/AtelierTextarea";
import { SubmissionRecoveryBanner } from "@/components/ui/molecules/SubmissionRecoveryBanner";

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

  const [isRecovered, setIsRecovered] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const draftKey = `mengart_sub_draft:${challengeId}`;

  // Restore draft from localStorage on modal open if not a revision
  useEffect(() => {
    if (isOpen && !isRevision) {
      try {
        const savedDraft = localStorage.getItem(draftKey);
        if (savedDraft) {
          const parsed = JSON.parse(savedDraft);
          if (parsed.title || parsed.description || parsed.softwareUsed) {
            setTitle(parsed.title || "");
            setDescription(parsed.description || "");
            setSoftwareUsed(parsed.softwareUsed || "");
            setIsSpoiler(Boolean(parsed.isSpoiler));
            setIsRecovered(true);
          }
        }
      } catch {
        // Ignore local storage parse errors
      }
    }
  }, [isOpen, isRevision, draftKey]);

  // Persist draft to localStorage as the user types
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const handleFieldChange = (
    field: "title" | "description" | "software" | "spoiler",
    value: any
  ) => {
    if (field === "title") setTitle(value);
    if (field === "description") setDescription(value);
    if (field === "software") setSoftwareUsed(value);
    if (field === "spoiler") setIsSpoiler(value);

    if (!isRevision) {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(() => {
        try {
          const draftPayload = {
            title: field === "title" ? value : title,
            description: field === "description" ? value : description,
            softwareUsed: field === "software" ? value : softwareUsed,
            isSpoiler: field === "spoiler" ? value : isSpoiler,
          };
          localStorage.setItem(draftKey, JSON.stringify(draftPayload));
        } catch {
          // Ignore local storage save errors
        }
      }, 500);
    }
  };

  const handleDiscardDraft = () => {
    try {
      localStorage.removeItem(draftKey);
    } catch {
      // Ignore
    }
    setTitle(initialTitle);
    setDescription(initialDescription);
    setSoftwareUsed(initialSoftware);
    setIsSpoiler(initialSpoiler);
    setIsRecovered(false);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) {
      setFile(selected);
      setPreviewUrl(URL.createObjectURL(selected));
      if (!title) {
        handleFieldChange("title", selected.name.replace(/\.[^/.]+$/, ""));
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file && !isRevision) {
      setError("Silakan pilih berkas karya untuk diunggah.");
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
        // Clear draft on successful submission
        try {
          localStorage.removeItem(draftKey);
        } catch {
          // Ignore
        }
        setSuccess(true);
        setTimeout(() => {
          setIsOpen(false);
          setSuccess(false);
        }, 2200);
      }
    } catch (err: any) {
      setError(err?.message || "Gagal mengirimkan submisi karya.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <AtelierButton
        type="button"
        variant="primary"
        onClick={() => setIsOpen(true)}
        leftIcon={<Sparkles className="h-4 w-4" />}
      >
        {isRevision ? "Kirim Revisi Submisi" : "Kirim Karya Submisi"}
      </AtelierButton>

      <Dialog open={isOpen} onOpenChange={(open) => !open && setIsOpen(false)}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto p-6 sm:p-8">
          <DialogHeader>
            <DialogTitle>
              {isRevision ? "Perbarui Submisi Karya" : "Kirim Karya ke Challenge"}
            </DialogTitle>
            <DialogDescription>
              {challengeTitle}
            </DialogDescription>
          </DialogHeader>

          {success ? (
            <div className="py-12 flex flex-col items-center justify-center text-center gap-3">
              <div className="h-12 w-12 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                <CheckCircle2 className="h-7 w-7" />
              </div>
              <h4 className="font-display font-bold text-lg text-emerald-300">
                {isRevision ? "Revisi Berhasil Dikirim!" : "Karya Berhasil Terkirim!"}
              </h4>
              <p className="text-xs text-zinc-400 max-w-sm font-sans">
                Karya berhasil dikirim. Perubahan masih dapat dilakukan sebelum batas waktu.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-5 mt-2">
              {/* Draft text recovery banner */}
              {isRecovered && (
                <SubmissionRecoveryBanner onDiscard={handleDiscardDraft} />
              )}

              {error && (
                <div
                  role="alert"
                  className="p-3.5 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs flex items-center gap-2"
                >
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {/* Media File Picker */}
              <div className="flex flex-col gap-2">
                <label className="text-xs font-sans font-medium text-zinc-300">
                  Berkas Karya (PNG, JPG, WebP maks 25MB · MP4 H.264 maks 50MB){" "}
                  {!isRevision && <span className="text-red-400">*</span>}
                </label>

                {previewUrl ? (
                  <div className="relative rounded-2xl overflow-hidden border border-white/10 bg-black/40 aspect-[16/9] flex items-center justify-center group">
                    {file?.type.startsWith("video/") ? (
                      <video
                        src={previewUrl}
                        controls
                        className="w-full h-full object-contain"
                      />
                    ) : (
                      <img
                        src={previewUrl}
                        alt="Pratinjau Berkas"
                        className="w-full h-full object-contain"
                      />
                    )}
                    <label className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center gap-2 cursor-pointer transition-opacity backdrop-blur-xs">
                      <Upload className="h-6 w-6 text-amber-400" />
                      <span className="text-xs font-sans text-white font-medium">
                        Ganti Berkas
                      </span>
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp,video/mp4"
                        onChange={handleFileChange}
                        className="hidden"
                      />
                    </label>
                  </div>
                ) : (
                  <label className="border-2 border-dashed border-white/15 hover:border-amber-500/50 rounded-2xl p-6 flex flex-col items-center justify-center gap-2.5 bg-white/[0.02] hover:bg-white/[0.04] transition-all cursor-pointer min-h-[140px]">
                    <div className="h-10 w-10 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-400">
                      <ImageIcon className="h-5 w-5" />
                    </div>
                    <div className="flex flex-col items-center text-center">
                      <span className="text-xs font-sans font-medium text-[#f6f2e9]">
                        {isRevision
                          ? "Pilih berkas baru untuk mengganti karya saat ini"
                          : "Klik untuk memilih berkas karya"}
                      </span>
                      <span className="text-[11px] font-sans text-zinc-500 mt-0.5">
                        Format didukung: PNG, JPEG, WebP, MP4
                      </span>
                    </div>
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp,video/mp4"
                      onChange={handleFileChange}
                      className="hidden"
                    />
                  </label>
                )}
              </div>

              {/* Title Input */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-sans font-medium text-zinc-300">
                  Judul Karya <span className="text-red-400">*</span>
                </label>
                <AtelierInput
                  required
                  placeholder="Beri judul untuk karya kamu"
                  value={title}
                  onChange={(e) => handleFieldChange("title", e.target.value)}
                  maxLength={100}
                />
              </div>

              {/* Software Tags */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-sans font-medium text-zinc-300">
                  Software yang Digunakan (Opsional)
                </label>
                <AtelierInput
                  placeholder="Contoh: Blender, Photoshop, Procreate"
                  value={softwareUsed}
                  onChange={(e) => handleFieldChange("software", e.target.value)}
                  leftIcon={<FileCode className="h-4 w-4" />}
                />
              </div>

              {/* Description Input */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-sans font-medium text-zinc-300">
                  Deskripsi Karya (Opsional)
                </label>
                <AtelierTextarea
                  placeholder="Ceritakan konsep atau eksplorasi di balik karya ini..."
                  value={description}
                  onChange={(e) => handleFieldChange("description", e.target.value)}
                  rows={3}
                  charCount={{ current: description.length, max: 2000 }}
                />
              </div>

              {/* Spoiler Toggle */}
              <div className="flex items-center justify-between p-3.5 rounded-2xl bg-white/[0.03] border border-white/10">
                <div className="flex flex-col">
                  <span className="text-xs font-sans font-medium text-[#f6f2e9]">
                    Tandai sebagai Konten Spoiler
                  </span>
                  <span className="text-[11px] font-sans text-zinc-500">
                    Gambar akan disamarkan dengan efek blur hingga dibuka penonton.
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={isSpoiler}
                  onChange={(e) => handleFieldChange("spoiler", e.target.checked)}
                  className="h-5 w-5 rounded-md accent-amber-500 cursor-pointer"
                />
              </div>

              {/* Submit Buttons */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-white/10">
                <AtelierButton
                  type="button"
                  variant="ghost"
                  onClick={() => setIsOpen(false)}
                  disabled={isLoading}
                >
                  Batal
                </AtelierButton>
                <AtelierButton
                  type="submit"
                  variant="primary"
                  isLoading={isLoading}
                >
                  {isRevision ? "Simpan Perubahan" : "Kirim Karya"}
                </AtelierButton>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
