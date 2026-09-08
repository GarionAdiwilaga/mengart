"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { CandidateArtwork } from "@/lib/voting";
import { castOrUpdateBallotAction, resetBallotAction } from "@/app/actions/voting";
import {
  Star,
  ChevronLeft,
  ChevronRight,
  X,
  AlertCircle,
  Eye,
} from "lucide-react";
import { ArtworkMediaFrame } from "@/components/ui/molecules/ArtworkMediaFrame";
import { ConfirmModal } from "@/components/ui/molecules/ConfirmModal";
import { StarAllocationCounter } from "@/components/ui/molecules/StarAllocationCounter";
import { AtelierButton } from "@/components/ui/atoms/AtelierButton";
import { AtelierBadge } from "@/components/ui/atoms/AtelierBadge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/AccessibleDialog";

interface VotingWorkspaceProps {
  challengeId: string;
  challengeTitle: string;
  challengeSlug: string;
  votingRoundId: string;
  roundType?: "main" | "tiebreak";
  candidates: CandidateArtwork[];
  initialAllocations: { [submissionId: string]: number };
  maxStars: number;
  initialRemainingStars: number;
  isLoggedIn: boolean;
}

export function VotingWorkspace({
  challengeTitle,
  votingRoundId,
  roundType = "main",
  candidates,
  initialAllocations,
  maxStars,
  initialRemainingStars,
  isLoggedIn,
}: VotingWorkspaceProps) {
  const [allocations, setAllocations] = useState<{ [submissionId: string]: number }>(
    initialAllocations
  );
  const [remainingStars, setRemainingStars] = useState(initialRemainingStars);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Focus detail view state
  const [focusedCandidate, setFocusedCandidate] = useState<CandidateArtwork | null>(null);
  const [focusIndex, setFocusIndex] = useState(0);

  // Single-star movement modal state
  const [moveStarModal, setMoveStarModal] = useState<{
    isOpen: boolean;
    fromCandidate: CandidateArtwork | null;
    toCandidate: CandidateArtwork | null;
  }>({
    isOpen: false,
    fromCandidate: null,
    toCandidate: null,
  });

  // Reset confirmation modal state
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  // Server save queue ref to prevent race conditions
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const saveToServer = useCallback(
    async (newAllocations: { [submissionId: string]: number }) => {
      setSaveStatus("saving");
      setErrorMessage(null);

      const activeVotes = Object.entries(newAllocations)
        .filter(([_, count]) => count > 0)
        .map(([submissionId, starsCount]) => ({ submissionId, starsCount }));

      try {
        const res = await castOrUpdateBallotAction({
          votingRoundId,
          votes: activeVotes,
        });

        if (res.success) {
          setSaveStatus("saved");
          if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
          saveTimeoutRef.current = setTimeout(() => {
            setSaveStatus("idle");
          }, 2500);
        }
      } catch (err: any) {
        setSaveStatus("error");
        setErrorMessage(err?.message || "Gagal menyimpan suara.");
      }
    },
    [votingRoundId]
  );

  // Handle Star allocation/de-allocation
  const handleToggleStar = useCallback(
    (targetCandidate: CandidateArtwork) => {
      if (!isLoggedIn) {
        setErrorMessage("Silakan masuk terlebih dahulu untuk memberikan suara Star.");
        setSaveStatus("error");
        return;
      }

      if (targetCandidate.isSelfSubmission) {
        setErrorMessage("Star tidak dapat diberikan untuk karya sendiri.");
        setSaveStatus("error");
        return;
      }

      const currentCount = allocations[targetCandidate.submissionId] || 0;

      // If already allocated, remove Star (decrement)
      if (currentCount > 0) {
        const newAllocations = { ...allocations, [targetCandidate.submissionId]: 0 };
        const newTotalAllocated = Object.values(newAllocations).reduce((a, b) => a + b, 0);
        setAllocations(newAllocations);
        setRemainingStars(maxStars - newTotalAllocated);
        saveToServer(newAllocations);
        return;
      }

      // If not yet allocated, allocate Star
      if (remainingStars > 0) {
        const newAllocations = { ...allocations, [targetCandidate.submissionId]: 1 };
        const newTotalAllocated = Object.values(newAllocations).reduce((a, b) => a + b, 0);
        setAllocations(newAllocations);
        setRemainingStars(maxStars - newTotalAllocated);
        saveToServer(newAllocations);
        return;
      }

      // If remainingStars === 0:
      // Case 1: maxStars === 1 (Single Star mode) -> Pop up move confirmation modal
      if (maxStars === 1) {
        const currentVotedSubId = Object.keys(allocations).find(
          (id) => allocations[id] > 0
        );
        const currentVotedCandidate = candidates.find(
          (c) => c.submissionId === currentVotedSubId
        );

        if (currentVotedCandidate && currentVotedCandidate.submissionId !== targetCandidate.submissionId) {
          setMoveStarModal({
            isOpen: true,
            fromCandidate: currentVotedCandidate,
            toCandidate: targetCandidate,
          });
          return;
        }
      }

      // Case 2: Multi-Star mode exhausted -> Informative guidance
      setErrorMessage(
        `Semua ${maxStars} Star sudah kamu gunakan. Kurangi alokasi dari karya lain terlebih dahulu sebelum memilih karya ini.`
      );
      setSaveStatus("error");
    },
    [isLoggedIn, allocations, remainingStars, maxStars, candidates, saveToServer]
  );

  // Confirm moving single Star
  const handleConfirmMoveStar = () => {
    if (!moveStarModal.toCandidate) return;

    const newAllocations: { [submissionId: string]: number } = {
      [moveStarModal.toCandidate.submissionId]: 1,
    };

    setAllocations(newAllocations);
    setRemainingStars(0);
    setMoveStarModal({ isOpen: false, fromCandidate: null, toCandidate: null });
    saveToServer(newAllocations);
  };

  // Reset ballot
  const handleConfirmReset = async () => {
    setIsResetting(true);
    try {
      await resetBallotAction({ votingRoundId });
      setAllocations({});
      setRemainingStars(maxStars);
      setSaveStatus("saved");
      setIsResetModalOpen(false);
      setTimeout(() => setSaveStatus("idle"), 2000);
    } catch (err: any) {
      setSaveStatus("error");
      setErrorMessage(err?.message || "Gagal mereset suara.");
    } finally {
      setIsResetting(false);
    }
  };

  // Keyboard navigation for focus inspection
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!focusedCandidate) return;

      if (e.key === "ArrowLeft") {
        const nextIdx = focusIndex > 0 ? focusIndex - 1 : candidates.length - 1;
        setFocusIndex(nextIdx);
        setFocusedCandidate(candidates[nextIdx]);
      } else if (e.key === "ArrowRight") {
        const nextIdx = focusIndex < candidates.length - 1 ? focusIndex + 1 : 0;
        setFocusIndex(nextIdx);
        setFocusedCandidate(candidates[nextIdx]);
      } else if (e.key === "Escape") {
        setFocusedCandidate(null);
      }
    },
    [focusedCandidate, focusIndex, candidates]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  const openDetailFocus = (cand: CandidateArtwork, index: number) => {
    setFocusIndex(index);
    setFocusedCandidate(cand);
  };

  const totalAllocated = maxStars - remainingStars;

  return (
    <div className="w-full flex flex-col gap-6 pb-28">
      {/* Top Guidance / Error Banner if needed */}
      {errorMessage && saveStatus === "error" && (
        <div
          role="alert"
          className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs font-sans flex items-center justify-between gap-3 shadow-md"
        >
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-amber-400 shrink-0" />
            <span>{errorMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setErrorMessage(null)}
            className="p-1 rounded-lg hover:bg-white/10 text-zinc-400 hover:text-white"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* 2-Column Mobile Overview Grid (Grill-Me & Blueprint v0.3) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-5">
        {candidates.map((cand, index) => {
          const isVoted = (allocations[cand.submissionId] || 0) > 0;
          const mediaUrl = cand.publicStorageKey
            ? `/api/media/public/${cand.publicStorageKey}`
            : cand.thumbnailStorageKey
            ? `/api/media/public/${cand.thumbnailStorageKey}`
            : "";

          return (
            <div
              key={cand.submissionId}
              className={`glass-panel rounded-2xl overflow-hidden flex flex-col justify-between border transition-all ${
                isVoted
                  ? "border-amber-500/50 bg-amber-500/[0.03] shadow-lg shadow-amber-500/10"
                  : "border-white/10 hover:border-white/20"
              }`}
            >
              {/* Media Frame (Aspect Ratio Preserved Uncropped) */}
              <div
                onClick={() => openDetailFocus(cand, index)}
                className="relative aspect-[4/3] bg-black/60 overflow-hidden cursor-pointer group flex items-center justify-center"
              >
                {mediaUrl ? (
                  <ArtworkMediaFrame
                    src={mediaUrl}
                    alt={cand.title}
                    isSpoiler={cand.isSpoiler}
                    fill
                    showPlayIndicator={cand.mediaType === "video"}
                  />
                ) : (
                  <div className="h-full w-full flex items-center justify-center text-zinc-600 font-mono text-xs">
                    Karya
                  </div>
                )}

                {/* Candidate Order Node */}
                <div className="absolute top-2 left-2 z-10">
                  <AtelierBadge variant="default" size="sm">
                    #{index + 1}
                  </AtelierBadge>
                </div>

                {/* Public Aggregate Total Stars (Anti-Bias & Public Dynamics) */}
                <div className="absolute top-2 right-2 z-10">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-black/75 backdrop-blur-md border border-white/15 text-[11px] font-mono font-medium text-amber-300">
                    <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                    <span>{cand.totalStars}</span>
                  </span>
                </div>

                {/* Hover Inspect Cue */}
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                  <div className="px-3 py-1.5 rounded-xl bg-black/70 text-xs font-sans text-white flex items-center gap-1.5 backdrop-blur-sm">
                    <Eye className="h-3.5 w-3.5" />
                    <span>Periksa Detail</span>
                  </div>
                </div>
              </div>

              {/* Card Meta & Voting Control */}
              <div className="p-3 sm:p-4 flex flex-col gap-2.5">
                <div className="flex flex-col min-w-0">
                  <h4
                    onClick={() => openDetailFocus(cand, index)}
                    className="font-display font-bold text-xs sm:text-sm text-[#f6f2e9] truncate cursor-pointer hover:text-amber-300 transition-colors"
                  >
                    {cand.title}
                  </h4>
                  <span className="text-[11px] text-zinc-400 font-sans truncate">
                    oleh {cand.artistName}
                  </span>
                </div>

                {/* Interactive Star Button */}
                <button
                  type="button"
                  disabled={cand.isSelfSubmission}
                  onClick={() => handleToggleStar(cand)}
                  aria-label={
                    cand.isSelfSubmission
                      ? "Karya sendiri, tidak dapat dipilih"
                      : isVoted
                      ? "Cabut Star"
                      : "Berikan Star"
                  }
                  className={`w-full py-2 min-h-[44px] rounded-xl flex items-center justify-center gap-1.5 text-xs font-sans font-medium transition-all duration-150 cursor-pointer border ${
                    cand.isSelfSubmission
                      ? "bg-white/[0.02] text-zinc-600 border-white/5 cursor-not-allowed"
                      : isVoted
                      ? "bg-amber-500 text-black border-amber-400 font-bold shadow-md shadow-amber-500/20 active:scale-98"
                      : "bg-white/[0.04] hover:bg-amber-500/15 text-zinc-300 hover:text-amber-300 border-white/10 hover:border-amber-500/30 active:scale-98"
                  }`}
                >
                  <Star
                    className={`h-4 w-4 ${
                      isVoted ? "fill-black text-black" : "text-amber-400"
                    }`}
                  />
                  <span>
                    {cand.isSelfSubmission
                      ? "Karya Sendiri"
                      : isVoted
                      ? "Star Diberikan"
                      : "Beri Star"}
                  </span>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Detail Focus Modal (Focused Inspection Mode) */}
      {focusedCandidate && (
        <Dialog
          open={!!focusedCandidate}
          onOpenChange={(open) => !open && setFocusedCandidate(null)}
        >
          <DialogContent className="max-w-4xl p-4 sm:p-6 max-h-[95vh] overflow-y-auto">
            <DialogHeader className="border-b-0 pb-0">
              <div className="flex items-center justify-between w-full pr-8">
                <div className="flex items-center gap-2">
                  <AtelierBadge variant="amber" size="sm">
                    Karya #{focusIndex + 1} dari {candidates.length}
                  </AtelierBadge>
                  <span className="text-xs font-mono text-zinc-400">
                    {challengeTitle}
                  </span>
                </div>
              </div>
            </DialogHeader>

            {/* Large Artwork Canvas */}
            <div className="relative w-full max-h-[65vh] rounded-2xl overflow-hidden bg-black/60 flex items-center justify-center my-2">
              <ArtworkMediaFrame
                src={
                  focusedCandidate.publicStorageKey
                    ? `/api/media/public/${focusedCandidate.publicStorageKey}`
                    : `/api/media/public/${focusedCandidate.thumbnailStorageKey}`
                }
                alt={focusedCandidate.title}
                isSpoiler={focusedCandidate.isSpoiler}
                mediaType={focusedCandidate.mediaType as any}
                priority
              />

              {/* Prev / Next Arrows */}
              <button
                type="button"
                onClick={() => {
                  const nextIdx =
                    focusIndex > 0 ? focusIndex - 1 : candidates.length - 1;
                  setFocusIndex(nextIdx);
                  setFocusedCandidate(candidates[nextIdx]);
                }}
                className="absolute left-3 top-1/2 -translate-y-1/2 p-2.5 rounded-full bg-black/60 hover:bg-black/90 text-white backdrop-blur-md border border-white/15 transition-all min-h-[44px] min-w-[44px] flex items-center justify-center cursor-pointer"
                aria-label="Karya Sebelumnya"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={() => {
                  const nextIdx =
                    focusIndex < candidates.length - 1 ? focusIndex + 1 : 0;
                  setFocusIndex(nextIdx);
                  setFocusedCandidate(candidates[nextIdx]);
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-2.5 rounded-full bg-black/60 hover:bg-black/90 text-white backdrop-blur-md border border-white/15 transition-all min-h-[44px] min-w-[44px] flex items-center justify-center cursor-pointer"
                aria-label="Karya Berikutnya"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </div>

            {/* Info & Voting Bar in Focus View */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-3 border-t border-white/10">
              <div className="flex flex-col">
                <DialogTitle className="text-xl">
                  {focusedCandidate.title}
                </DialogTitle>
                <DialogDescription className="text-zinc-300 text-xs mt-0.5">
                  Karya oleh{" "}
                  <span className="text-[#f6f2e9] font-medium">
                    {focusedCandidate.artistName}
                  </span>
                  {focusedCandidate.softwareUsed && (
                    <span className="ml-2 font-mono text-zinc-500">
                      · Software: {focusedCandidate.softwareUsed}
                    </span>
                  )}
                </DialogDescription>
              </div>

              {/* Voting Button inside Detail Focus */}
              <div className="flex items-center gap-3">
                <AtelierButton
                  type="button"
                  variant={
                    (allocations[focusedCandidate.submissionId] || 0) > 0
                      ? "primary"
                      : "surface"
                  }
                  disabled={focusedCandidate.isSelfSubmission}
                  onClick={() => handleToggleStar(focusedCandidate)}
                  leftIcon={<Star className="h-4 w-4 fill-current" />}
                >
                  {focusedCandidate.isSelfSubmission
                    ? "Karya Sendiri"
                    : (allocations[focusedCandidate.submissionId] || 0) > 0
                    ? "Star Diberikan (Ketuk untuk Cabut)"
                    : "Beri Star untuk Karya Ini"}
                </AtelierButton>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Single-Star Movement Modal (Grill-Me Decision #6) */}
      {moveStarModal.isOpen && moveStarModal.fromCandidate && moveStarModal.toCandidate && (
        <ConfirmModal
          isOpen={moveStarModal.isOpen}
          onClose={() =>
            setMoveStarModal({ isOpen: false, fromCandidate: null, toCandidate: null })
          }
          onConfirm={handleConfirmMoveStar}
          title="Pindahkan Star?"
          description={`Pindahkan Star dari "${moveStarModal.fromCandidate.title}" ke "${moveStarModal.toCandidate.title}"?`}
          confirmText="Pindahkan Star"
          cancelText="Batal"
        />
      )}

      {/* Reset Confirmation Modal */}
      {isResetModalOpen && (
        <ConfirmModal
          isOpen={isResetModalOpen}
          onClose={() => setIsResetModalOpen(false)}
          onConfirm={handleConfirmReset}
          title="Hapus Semua Alokasi Star?"
          description="Seluruh alokasi Star kamu pada babak voting ini akan dihapus. Kamu tetap dapat memberikan suara baru sebelum deadline berakhir."
          confirmText="Hapus Semua Star"
          cancelText="Batal"
          variant="danger"
          isLoading={isResetting}
        />
      )}

      {/* Floating Bottom Sticky Action Bar (Ergonomic Thumb Bar) */}
      <aside
        aria-label="Ringkasan Alokasi Star"
        className="fixed bottom-4 left-0 right-0 z-40 px-4 flex justify-center pointer-events-none"
      >
        <div className="pointer-events-auto">
          <StarAllocationCounter
            allocatedStars={totalAllocated}
            maxStars={maxStars}
            saveStatus={saveStatus}
            errorMessage={errorMessage || undefined}
            onReset={totalAllocated > 0 ? () => setIsResetModalOpen(true) : undefined}
          />
        </div>
      </aside>
    </div>
  );
}
