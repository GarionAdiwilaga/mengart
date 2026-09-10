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
import {
  saveSubmissionDraftAsync,
  loadSubmissionDraftAsync,
  clearSubmissionDraftAsync,
  getDraftGeneration,
  purgeLegacyDrafts,
  setActiveDraftContext,
  clearActiveDraftContext,
  registerPendingDraftAutosave,
  cancelPendingDraftAutosave,
} from "@/lib/utils/draftStorage";

interface ChallengeSubmissionModalProps {
  challengeId: string;
  challengeTitle: string;
  userId?: string;
  submissionDeadline?: Date | string | null;
  isRevision?: boolean;
  initialTitle?: string;
  initialDescription?: string;
  initialSoftware?: string;
  initialSpoiler?: boolean;
}

export function ChallengeSubmissionModal({
  challengeId,
  challengeTitle,
  userId,
  submissionDeadline,
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

  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isDraftActiveRef = useRef(false);
  const prevUserIdRef = useRef<string | null>(userId ?? null);
  const userIdRef = useRef(userId);
  const isOpenRef = useRef(isOpen);
  const activeGenerationRef = useRef<number>(1);

  useEffect(() => {
    userIdRef.current = userId;
  }, [userId]);

  useEffect(() => {
    isOpenRef.current = isOpen;
  }, [isOpen]);

  const latestValuesRef = useRef({
    title: initialTitle,
    description: initialDescription,
    softwareUsed: initialSoftware,
    isSpoiler: initialSpoiler,
  });

  useEffect(() => {
    latestValuesRef.current = { title, description, softwareUsed, isSpoiler };
  }, [title, description, softwareUsed, isSpoiler]);

  const flushPendingDraft = async () => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }
    const currentUid = userIdRef.current;
    if (!currentUid || isRevision || !isDraftActiveRef.current) return;
    if (submissionDeadline && new Date(submissionDeadline).getTime() <= Date.now()) return;

    cancelPendingDraftAutosave(currentUid, challengeId);
    const vals = latestValuesRef.current;
    await saveSubmissionDraftAsync(
      currentUid,
      challengeId,
      {
        title: vals.title,
        description: vals.description,
        softwareUsed: vals.softwareUsed,
        isSpoiler: vals.isSpoiler,
      },
      activeGenerationRef.current
    );
  };

  const handleCloseModal = () => {
    void flushPendingDraft();
    setIsOpen(false);
  };

  // Purge legacy unscoped drafts on mount & flush on unmount
  useEffect(() => {
    purgeLegacyDrafts();
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }
      const currentUid = userIdRef.current;
      if (isDraftActiveRef.current && currentUid && !isRevision) {
        const vals = latestValuesRef.current;
        const gen = activeGenerationRef.current;
        void saveSubmissionDraftAsync(
          currentUid,
          challengeId,
          {
            title: vals.title,
            description: vals.description,
            softwareUsed: vals.softwareUsed,
            isSpoiler: vals.isSpoiler,
          },
          gen
        );
      }
    };
  }, [challengeId, isRevision]);

  // Handle identity change or form initialization (decoupled from isOpen)
  useEffect(() => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }

    // Account-switch / anonymous logout cleanup: purge stored drafts for old account on this specific challenge
    if (prevUserIdRef.current && prevUserIdRef.current !== userId) {
      void clearSubmissionDraftAsync(prevUserIdRef.current, challengeId);
      if (!userId) {
        clearActiveDraftContext();
      }
    }
    prevUserIdRef.current = userId ?? null;
    if (userId) {
      activeGenerationRef.current = getDraftGeneration(userId, challengeId);
      if (isOpenRef.current) {
        setActiveDraftContext(userId, challengeId);
      }
    } else {
      clearActiveDraftContext();
    }

    isDraftActiveRef.current = false;
    setTitle(initialTitle);
    setDescription(initialDescription);
    setSoftwareUsed(initialSoftware);
    setIsSpoiler(initialSpoiler);
    setIsRecovered(false);
    setFile(null);
    setPreviewUrl(null);
    setError(null);
  }, [userId, challengeId, initialTitle, initialDescription, initialSoftware, initialSpoiler]);

  // Restore draft from localStorage on modal open if not a revision
  useEffect(() => {
    if (isOpen && !isRevision && userId) {
      setActiveDraftContext(userId, challengeId);
      activeGenerationRef.current = getDraftGeneration(userId, challengeId);

      // Validate deadline eligibility: if submission window expired, clear & do not restore
      if (submissionDeadline && new Date(submissionDeadline).getTime() <= Date.now()) {
        void clearSubmissionDraftAsync(userId, challengeId);
        clearActiveDraftContext();
        return;
      }

      // If draft is already active in memory, keep in-memory state
      if (isDraftActiveRef.current) {
        return;
      }

      let isCancelled = false;
      void (async () => {
        const savedDraft = await loadSubmissionDraftAsync(userId, challengeId);
        if (isCancelled) return;
        if (savedDraft) {
          if (savedDraft.title || savedDraft.description || savedDraft.softwareUsed) {
            setTitle(savedDraft.title || "");
            setDescription(savedDraft.description || "");
            setSoftwareUsed(savedDraft.softwareUsed || "");
            setIsSpoiler(Boolean(savedDraft.isSpoiler));
            setIsRecovered(true);
            isDraftActiveRef.current = true;
          }
        }
      })();

      return () => {
        isCancelled = true;
      };
    }
  }, [isOpen, isRevision, userId, challengeId, submissionDeadline]);

  // Cross-tab and same-tab invalidation listener
  useEffect(() => {
    const handleStorageOrInvalidation = () => {
      if (!userId) return;
      const currentGen = getDraftGeneration(userId, challengeId);
      if (currentGen !== activeGenerationRef.current) {
        if (saveTimeoutRef.current) {
          clearTimeout(saveTimeoutRef.current);
          saveTimeoutRef.current = null;
        }
        activeGenerationRef.current = currentGen;
        isDraftActiveRef.current = false;
        setTitle(initialTitle);
        setDescription(initialDescription);
        setSoftwareUsed(initialSoftware);
        setIsSpoiler(initialSpoiler);
        setIsRecovered(false);
      }
    };

    window.addEventListener("storage", handleStorageOrInvalidation);
    window.addEventListener("mengart_draft_invalidated", handleStorageOrInvalidation as EventListener);
    return () => {
      window.removeEventListener("storage", handleStorageOrInvalidation);
      window.removeEventListener("mengart_draft_invalidated", handleStorageOrInvalidation as EventListener);
    };
  }, [userId, challengeId, initialTitle, initialDescription, initialSoftware, initialSpoiler]);

  const handleFieldChange = (
    field: "title" | "description" | "software" | "spoiler",
    value: any
  ) => {
    const nextTitle = field === "title" ? value : title;
    const nextDesc = field === "description" ? value : description;
    const nextSoft = field === "software" ? value : softwareUsed;
    const nextSpoiler = field === "spoiler" ? value : isSpoiler;

    if (field === "title") setTitle(value);
    if (field === "description") setDescription(value);
    if (field === "software") setSoftwareUsed(value);
    if (field === "spoiler") setIsSpoiler(value);

    isDraftActiveRef.current = true;

    if (!isRevision && userId) {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        cancelPendingDraftAutosave(userId, challengeId);
      }
      const capturedUserId = userId;
      const capturedChallengeId = challengeId;
      const capturedGen = activeGenerationRef.current;

      setActiveDraftContext(capturedUserId, capturedChallengeId);

      const timer = setTimeout(async () => {
        cancelPendingDraftAutosave(capturedUserId, capturedChallengeId);
        if (!isDraftActiveRef.current) return;
        // Re-check deadline before autosave write
        if (submissionDeadline && new Date(submissionDeadline).getTime() <= Date.now()) {
          return;
        }
        // Save with expected generation check: if invalidated during 500ms debounce, save is rejected
        await saveSubmissionDraftAsync(
          capturedUserId,
          capturedChallengeId,
          {
            title: nextTitle,
            description: nextDesc,
            softwareUsed: nextSoft,
            isSpoiler: nextSpoiler,
          },
          capturedGen
        );
      }, 500);

      saveTimeoutRef.current = timer;
      registerPendingDraftAutosave(capturedUserId, capturedChallengeId, timer);
    }
  };

  const handleDiscardDraft = async () => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }
    isDraftActiveRef.current = false;
    if (userId) {
      cancelPendingDraftAutosave(userId, challengeId);
      await clearSubmissionDraftAsync(userId, challengeId);
      clearActiveDraftContext();
      activeGenerationRef.current = getDraftGeneration(userId, challengeId);
    }
    setTitle(initialTitle);
    setDescription(initialDescription);
    setSoftwareUsed(initialSoftware);
    setIsSpoiler(initialSpoiler);
    setIsRecovered(false);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;

    // Reject GIF explicitly
    if (selected.type === "image/gif") {
      setError("Format GIF tidak didukung. Harap unggah PNG, JPEG, WebP, atau MP4.");
      return;
    }

    setFile(selected);
    const mime = selected.type;
    if (mime.startsWith("image/")) {
      const url = URL.createObjectURL(selected);
      setPreviewUrl(url);
    } else {
      setPreviewUrl(null);
    }
    
    if (!title) {
      handleFieldChange("title", selected.name.replace(/\.[^/.]+$/, ""));
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
        if (saveTimeoutRef.current) {
          clearTimeout(saveTimeoutRef.current);
          saveTimeoutRef.current = null;
        }
        isDraftActiveRef.current = false;
        if (userId) {
          cancelPendingDraftAutosave(userId, challengeId);
          await clearSubmissionDraftAsync(userId, challengeId);
          clearActiveDraftContext();
          activeGenerationRef.current = getDraftGeneration(userId, challengeId);
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
        {isRevision ? "Kirim Revisi Karya" : "Kirim Karya"}
      </AtelierButton>

      <Dialog
        open={isOpen}
        onOpenChange={(open) => {
          if (!open) {
            handleCloseModal();
          } else {
            setIsOpen(true);
          }
        }}
      >
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
                  onClick={handleCloseModal}
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
