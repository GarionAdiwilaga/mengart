"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import Image from "next/image";
import {
  Star,
  Eye,
  AlertCircle,
  X,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Plus,
  Minus,
  RefreshCw,
} from "lucide-react";
import { castOrUpdateBallotAction, resetBallotAction, reconcileBallotAction } from "@/app/actions/voting";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/AccessibleDialog";
import { AtelierButton } from "@/components/ui/atoms/AtelierButton";
import { AtelierBadge } from "@/components/ui/atoms/AtelierBadge";
import { ArtworkMediaFrame } from "@/components/ui/molecules/ArtworkMediaFrame";
import { StarAllocationCounter } from "@/components/ui/molecules/StarAllocationCounter";
import { ConfirmModal } from "@/components/ui/molecules/ConfirmModal";

export interface CandidateArtwork {
  submissionId: string;
  artworkId: string;
  artistUserId: string;
  artistName: string;
  title: string;
  description?: string | null;
  softwareUsed?: string | null;
  mediaType: string;
  publicStorageKey?: string | null;
  thumbnailStorageKey?: string | null;
  totalStars: number;
  isSpoiler: boolean;
  isSelfSubmission?: boolean;
}

interface VotingWorkspaceProps {
  challengeId: string;
  challengeTitle: string;
  challengeSlug?: string;
  votingRoundId: string;
  roundType?: "main" | "tiebreak";
  roundDeadline?: Date | string | null;
  starsPerMember?: number;
  maxStars?: number;
  initialAllocations?: { [submissionId: string]: number };
  initialRemainingStars?: number;
  candidates: CandidateArtwork[];
  userId?: string | null;
  isLoggedIn?: boolean;
}

export function VotingWorkspace({
  challengeId,
  challengeTitle,
  challengeSlug,
  votingRoundId,
  roundType,
  roundDeadline,
  starsPerMember = 1,
  maxStars: explicitMaxStars,
  initialAllocations = {},
  initialRemainingStars,
  candidates,
  userId,
  isLoggedIn = false,
}: VotingWorkspaceProps) {
  const maxStars = explicitMaxStars ?? starsPerMember ?? 1;
  const computedInitialRemaining =
    initialRemainingStars !== undefined
      ? initialRemainingStars
      : maxStars - Object.values(initialAllocations).reduce((a, b) => a + b, 0);

  // Authoritative server-confirmed snapshot
  const confirmedAllocationsRef = useRef<{ [submissionId: string]: number }>({
    ...initialAllocations,
  });

  // User and Round Generation tracking for clean invalidation
  const currentGen = `${userId || "anon"}:${votingRoundId}`;
  const generationRef = useRef(currentGen);
  const seqRef = useRef(0);
  const pendingCountRef = useRef(0);

  // Local optimistic allocations
  const [allocations, setAllocations] = useState<{ [submissionId: string]: number }>(
    initialAllocations
  );
  const [remainingStars, setRemainingStars] = useState(computedInitialRemaining);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPermanentError, setIsPermanentError] = useState(false);
  const [isUncertain, setIsUncertain] = useState(false);
  const isUncertainRef = useRef(false);
  const [isReconciling, setIsReconciling] = useState(false);

  // Failed intent storage for explicit retry
  const failedIntentRef = useRef<{ [submissionId: string]: number } | null>(null);
  const busyPendingRefreshRef = useRef<{
    allocations: Record<string, number>;
    remaining: number;
  } | null>(null);

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

  // Serialized FIFO Promise Queue to ensure database write ordering
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isUnmountedRef = useRef(false);

  useEffect(() => {
    return () => {
      isUnmountedRef.current = true;
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, []);

  // Invalidate pending queue operations and sync state immediately on account or round generation change
  useEffect(() => {
    const newGen = `${userId || "anon"}:${votingRoundId}`;
    if (generationRef.current !== newGen) {
      generationRef.current = newGen;
      pendingCountRef.current = 0;
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      confirmedAllocationsRef.current = { ...initialAllocations };
      setAllocations(initialAllocations);
      const total = Object.values(initialAllocations).reduce((a, b) => a + b, 0);
      setRemainingStars(maxStars - total);
      setSaveStatus("idle");
      setErrorMessage(null);
      setIsPermanentError(false);
      setIsUncertain(false);
      isUncertainRef.current = false;
      failedIntentRef.current = null;
      busyPendingRefreshRef.current = null;
    }
  }, [userId, votingRoundId, initialAllocations, maxStars]);

  // Synchronize refreshed server props when mounted
  useEffect(() => {
    // If the queue is busy processing writes, do not overwrite optimistic state with stale refresh
    if (pendingCountRef.current > 0) {
      busyPendingRefreshRef.current = {
        allocations: initialAllocations,
        remaining: computedInitialRemaining,
      };
      return;
    }

    // Queue is idle: safely synchronize confirmed server allocations
    confirmedAllocationsRef.current = { ...initialAllocations };
    setAllocations(initialAllocations);
    setRemainingStars(computedInitialRemaining);
  }, [initialAllocations, computedInitialRemaining]);

  // Enqueue serialized save operation
  const enqueueSave = useCallback(
    (targetAllocations: { [submissionId: string]: number }) => {
      if (!isLoggedIn) {
        setErrorMessage("Silakan masuk terlebih dahulu untuk memberikan suara Star.");
        setSaveStatus("error");
        setIsPermanentError(true);
        return;
      }

      // Uncertainty gate: pause subsequent writes while outcome is unresolved
      if (isUncertainRef.current) {
        setErrorMessage(
          "Status alokasi suara sebelumnya belum pasti karena gangguan jaringan. Harap periksa status suara terlebih dahulu."
        );
        setSaveStatus("error");
        return;
      }

      const opGen = generationRef.current;
      const opSeq = ++seqRef.current;
      pendingCountRef.current++;

      // 1. Optimistic UI update
      setAllocations(targetAllocations);
      const newTotal = Object.values(targetAllocations).reduce((a, b) => a + b, 0);
      setRemainingStars(maxStars - newTotal);
      setSaveStatus("saving");
      setErrorMessage(null);

      // Clear any pending transition back to idle
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);

      const activeVotes = Object.entries(targetAllocations)
        .filter(([_, count]) => count > 0)
        .map(([submissionId, starsCount]) => ({ submissionId, starsCount }));

      // 2. Chain onto FIFO Promise Queue
      queueRef.current = queueRef.current
        .then(async () => {
          // Invalidation check: skip if unmounted or account/round generation changed
          if (isUnmountedRef.current || generationRef.current !== opGen) {
            pendingCountRef.current = Math.max(0, pendingCountRef.current - 1);
            return;
          }

          // Check client-side deadline closure
          if (roundDeadline && new Date() >= new Date(roundDeadline)) {
            pendingCountRef.current = Math.max(0, pendingCountRef.current - 1);
            setSaveStatus("error");
            setErrorMessage("Batas waktu voting untuk babak ini telah berakhir.");
            setIsPermanentError(true);
            return;
          }

          // When this mutation actually runs, reset status & clear idle timers
          setSaveStatus("saving");
          if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);

          let res: any;
          try {
            res = await castOrUpdateBallotAction({
              votingRoundId,
              votes: activeVotes,
            });
          } catch (err: any) {
            if (isUnmountedRef.current || generationRef.current !== opGen) {
              pendingCountRef.current = Math.max(0, pendingCountRef.current - 1);
              return;
            }

            pendingCountRef.current = Math.max(0, pendingCountRef.current - 1);
            const msg: string = err?.message || "Gagal menyimpan alokasi suara.";

            const isConfirmedRejection =
              msg.includes("Karya sendiri") ||
              msg.includes("sedang tidak dibuka") ||
              msg.includes("telah berakhir") ||
              msg.includes("ditangguhkan") ||
              msg.includes("melebihi alokasi") ||
              msg.includes("didiskualifikasi") ||
              msg.includes("tidak terdaftar") ||
              msg.includes("Format") ||
              msg.includes("Akses ditolak");

            if (isConfirmedRejection) {
              const isPermanent =
                msg.includes("Karya sendiri") ||
                msg.includes("sedang tidak dibuka") ||
                msg.includes("telah berakhir") ||
                msg.includes("ditangguhkan") ||
                msg.includes("didiskualifikasi");

              setIsPermanentError(isPermanent);
              setSaveStatus("error");
              setErrorMessage(msg);
              failedIntentRef.current = targetAllocations;

              // Rollback optimistic state ONLY if this was the latest enqueued operation
              if (opSeq === seqRef.current) {
                setAllocations(confirmedAllocationsRef.current);
                const rolledBackTotal = Object.values(confirmedAllocationsRef.current).reduce(
                  (a, b) => a + b,
                  0
                );
                setRemainingStars(maxStars - rolledBackTotal);
              }
            } else {
              // UNCERTAIN OUTCOME: Network error, timeout, or 500
              isUncertainRef.current = true;
              setIsUncertain(true);
              setSaveStatus("error");
              setErrorMessage(
                "Koneksi terputus saat menyimpan suara. Harap periksa status suara untuk memastikan alokasi tersimpan."
              );
              failedIntentRef.current = targetAllocations;
            }
            return;
          }

          if (isUnmountedRef.current || generationRef.current !== opGen) {
            pendingCountRef.current = Math.max(0, pendingCountRef.current - 1);
            return;
          }

          pendingCountRef.current = Math.max(0, pendingCountRef.current - 1);

          if (res?.success) {
            confirmedAllocationsRef.current = targetAllocations;
            failedIntentRef.current = null;
            setIsPermanentError(false);
            isUncertainRef.current = false;
            setIsUncertain(false);

            // If this is the latest enqueued operation, update allocations & remainingStars
            if (opSeq === seqRef.current) {
              setAllocations(targetAllocations);
              const total = Object.values(targetAllocations).reduce((a, b) => a + b, 0);
              setRemainingStars(maxStars - total);
            }

            // Only transition to "saved" if no newer work is pending in queue
            if (pendingCountRef.current === 0) {
              setSaveStatus("saved");
              if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
              saveTimeoutRef.current = setTimeout(() => {
                if (!isUnmountedRef.current && pendingCountRef.current === 0) {
                  setSaveStatus("idle");
                }
              }, 2500);

              // Queue is now idle: discard stale refresh buffer
              busyPendingRefreshRef.current = null;
            } else {
              setSaveStatus("saving");
            }
          }
        })
        .catch((err) => {
          console.error("Voting queue execution error:", err);
        });
    },
    [isLoggedIn, maxStars, roundDeadline, votingRoundId]
  );

  // Retry failed intent
  const handleRetryFailedIntent = () => {
    if (!failedIntentRef.current || isPermanentError) return;
    isUncertainRef.current = false;
    setIsUncertain(false);
    enqueueSave(failedIntentRef.current);
  };

  // Reconcile ballot status with server
  const handleReconcile = async () => {
    setIsReconciling(true);
    setErrorMessage(null);
    try {
      const roundData = await reconcileBallotAction(votingRoundId);
      if (roundData?.votingRound?.id && roundData.votingRound.id !== votingRoundId) {
        throw new Error("ID babak voting tidak sesuai dengan babak aktif.");
      }

      const serverAllocations: Record<string, number> = {};
      if (roundData?.candidates) {
        roundData.candidates.forEach((c: any) => {
          if (c.userAllocatedStars && c.userAllocatedStars > 0) {
            serverAllocations[c.submissionId] = c.userAllocatedStars;
          }
        });
      }
      confirmedAllocationsRef.current = serverAllocations;
      setAllocations(serverAllocations);
      const serverTotal = Object.values(serverAllocations).reduce((a, b) => a + b, 0);
      setRemainingStars(maxStars - serverTotal);
      failedIntentRef.current = null;
      isUncertainRef.current = false;
      setIsUncertain(false);
      setIsPermanentError(false);
      setSaveStatus("saved");
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(() => {
        if (!isUnmountedRef.current) setSaveStatus("idle");
      }, 2000);
    } catch (err: any) {
      setErrorMessage(err?.message || "Gagal memeriksa status suara.");
      setSaveStatus("error");
    } finally {
      setIsReconciling(false);
    }
  };

  // Increment Star allocation for multi-star budgets
  const handleIncrementStar = (targetCandidate: CandidateArtwork) => {
    if (!isLoggedIn) {
      setErrorMessage("Silakan masuk terlebih dahulu untuk memberikan suara Star.");
      setSaveStatus("error");
      setIsPermanentError(true);
      return;
    }

    if (targetCandidate.isSelfSubmission) {
      setErrorMessage("Star tidak dapat diberikan untuk karya sendiri.");
      setSaveStatus("error");
      setIsPermanentError(true);
      return;
    }

    if (remainingStars <= 0) {
      setErrorMessage(
        `Semua ${maxStars} Star sudah kamu gunakan. Kurangi alokasi dari karya lain terlebih dahulu.`
      );
      setSaveStatus("error");
      setIsPermanentError(false);
      return;
    }

    const currentCount = allocations[targetCandidate.submissionId] || 0;
    const nextCount = currentCount + 1;
    const nextAllocations = { ...allocations, [targetCandidate.submissionId]: nextCount };
    enqueueSave(nextAllocations);
  };

  // Decrement Star allocation for multi-star budgets
  const handleDecrementStar = (targetCandidate: CandidateArtwork) => {
    if (!isLoggedIn) return;
    const currentCount = allocations[targetCandidate.submissionId] || 0;
    if (currentCount <= 0) return;

    const nextCount = currentCount - 1;
    const nextAllocations = { ...allocations };
    if (nextCount === 0) {
      delete nextAllocations[targetCandidate.submissionId];
    } else {
      nextAllocations[targetCandidate.submissionId] = nextCount;
    }
    enqueueSave(nextAllocations);
  };

  // Single-star tap toggle (for maxStars === 1)
  const handleToggleStar = useCallback(
    (targetCandidate: CandidateArtwork) => {
      if (!isLoggedIn) {
        setErrorMessage("Silakan masuk terlebih dahulu untuk memberikan suara Star.");
        setSaveStatus("error");
        setIsPermanentError(true);
        return;
      }

      if (targetCandidate.isSelfSubmission) {
        setErrorMessage("Star tidak dapat diberikan untuk karya sendiri.");
        setSaveStatus("error");
        setIsPermanentError(true);
        return;
      }

      const currentCount = allocations[targetCandidate.submissionId] || 0;

      // If already allocated, remove Star
      if (currentCount > 0) {
        const nextAllocations = { ...allocations };
        delete nextAllocations[targetCandidate.submissionId];
        enqueueSave(nextAllocations);
        return;
      }

      // If not yet allocated and budget remaining, allocate 1 Star
      if (remainingStars > 0) {
        const nextAllocations = { ...allocations, [targetCandidate.submissionId]: 1 };
        enqueueSave(nextAllocations);
        return;
      }

      // If remainingStars === 0 and maxStars === 1 -> Open confirmation modal to move star
      if (maxStars === 1) {
        const currentVotedSubId = Object.keys(allocations).find((id) => allocations[id] > 0);
        const currentVotedCandidate = candidates.find(
          (c) => c.submissionId === currentVotedSubId
        );

        if (
          currentVotedCandidate &&
          currentVotedCandidate.submissionId !== targetCandidate.submissionId
        ) {
          setMoveStarModal({
            isOpen: true,
            fromCandidate: currentVotedCandidate,
            toCandidate: targetCandidate,
          });
          return;
        }
      }

      setErrorMessage(
        `Alokasi ${maxStars} Star telah digunakan. Kurangi alokasi dari karya lain terlebih dahulu.`
      );
      setSaveStatus("error");
      setIsPermanentError(false);
    },
    [isLoggedIn, allocations, remainingStars, maxStars, candidates, enqueueSave]
  );

  // Confirm moving single Star
  const handleConfirmMoveStar = () => {
    if (!moveStarModal.toCandidate) return;

    const nextAllocations: { [submissionId: string]: number } = {
      [moveStarModal.toCandidate.submissionId]: 1,
    };

    setMoveStarModal({ isOpen: false, fromCandidate: null, toCandidate: null });
    enqueueSave(nextAllocations);
  };

  // Reset ballot inside serialized queue
  const handleConfirmReset = async () => {
    setIsResetting(true);
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    const opGen = generationRef.current;

    queueRef.current = queueRef.current
      .then(async () => {
        if (isUnmountedRef.current || generationRef.current !== opGen) return;

        setSaveStatus("saving");
        try {
          await resetBallotAction({ votingRoundId });
          if (isUnmountedRef.current || generationRef.current !== opGen) return;

          confirmedAllocationsRef.current = {};
          failedIntentRef.current = null;
          isUncertainRef.current = false;
          setIsUncertain(false);
          setAllocations({});
          setRemainingStars(maxStars);
          setSaveStatus("saved");
          setIsResetModalOpen(false);
          if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
          saveTimeoutRef.current = setTimeout(() => {
            if (!isUnmountedRef.current) setSaveStatus("idle");
          }, 2000);
        } catch (err: any) {
          if (isUnmountedRef.current || generationRef.current !== opGen) return;
          setSaveStatus("error");
          setErrorMessage(err?.message || "Gagal mereset suara.");
        }
      })
      .catch((err) => {
        console.error("Voting reset queue error:", err);
      });

    try {
      await queueRef.current;
    } finally {
      if (!isUnmountedRef.current) {
        setIsResetting(false);
      }
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
      {/* Top Guidance / Error Banner with Retry & Reconciliation */}
      {errorMessage && saveStatus === "error" && (
        <div
          role="alert"
          className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs font-sans flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-md"
        >
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-amber-400 shrink-0" />
            <span>{errorMessage}</span>
          </div>
          <div className="flex items-center gap-2 self-end sm:self-auto">
            {!isPermanentError && failedIntentRef.current && (
              <button
                type="button"
                onClick={handleRetryFailedIntent}
                className="px-2.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-semibold text-xs font-sans transition-colors cursor-pointer min-h-[36px]"
              >
                Coba simpan ulang
              </button>
            )}
            <button
              type="button"
              onClick={handleReconcile}
              disabled={isReconciling}
              className="px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-zinc-200 font-sans text-xs transition-colors flex items-center gap-1.5 cursor-pointer min-h-[36px]"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isReconciling ? "animate-spin" : ""}`} />
              <span>Periksa status suara</span>
            </button>
            <button
              type="button"
              onClick={() => setErrorMessage(null)}
              aria-label="Tutup pesan kesalahan"
              className="h-11 w-11 min-h-[44px] min-w-[44px] rounded-lg hover:bg-white/10 text-zinc-400 hover:text-white flex items-center justify-center cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* 2-Column Mobile Overview Grid (Grill-Me & Blueprint v0.3) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-5">
        {candidates.map((cand, index) => {
          const candidateVoteCount = allocations[cand.submissionId] || 0;
          const isVoted = candidateVoteCount > 0;
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
                role="button"
                tabIndex={0}
                onClick={() => openDetailFocus(cand, index)}
                onKeyDown={(e) => {
                  if (e.target !== e.currentTarget) return;
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    openDetailFocus(cand, index);
                  }
                }}
                aria-label={`Buka detail karya ${cand.title}`}
                className="relative aspect-[4/3] bg-black/60 overflow-hidden cursor-pointer group flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-amber-500/50"
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

                {/* Public Aggregate Total Stars */}
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

                {/* Multi-Star Stepper or Single-Star Toggle */}
                {maxStars > 1 ? (
                  <div className="w-full flex flex-col gap-1.5 bg-white/[0.04] p-1.5 rounded-xl border border-white/10">
                    <div className="flex items-center justify-center gap-1 py-0.5 text-xs font-mono font-bold text-[#f6f2e9]">
                      <Star
                        className={`h-3.5 w-3.5 ${
                          candidateVoteCount > 0 ? "fill-amber-400 text-amber-400" : "text-zinc-500"
                        }`}
                      />
                      <span>{candidateVoteCount} Star</span>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5 w-full">
                      <button
                        type="button"
                        disabled={cand.isSelfSubmission || candidateVoteCount <= 0}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDecrementStar(cand);
                        }}
                        aria-label={`Kurangi Star untuk ${cand.title}`}
                        className="w-full h-11 min-h-[44px] rounded-lg bg-white/5 hover:bg-white/10 disabled:opacity-30 disabled:pointer-events-none flex items-center justify-center text-zinc-200 transition-colors cursor-pointer"
                      >
                        <Minus className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        disabled={cand.isSelfSubmission || remainingStars <= 0}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleIncrementStar(cand);
                        }}
                        aria-label={`Tambah Star untuk ${cand.title}`}
                        className="w-full h-11 min-h-[44px] rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 disabled:opacity-30 disabled:pointer-events-none flex items-center justify-center transition-colors cursor-pointer"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    disabled={cand.isSelfSubmission}
                    onClick={() => handleToggleStar(cand)}
                    aria-label={
                      cand.isSelfSubmission
                        ? "Karya sendiri, tidak dapat dipilih"
                        : isVoted
                        ? "Cabut Star"
                        : "Beri Star"
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
                )}
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

              {/* Stepper or Action Button inside Detail Focus */}
              <div className="flex items-center gap-3">
                {maxStars > 1 ? (
                  <div className="flex items-center gap-2 bg-white/5 p-1.5 rounded-2xl border border-white/10">
                    <button
                      type="button"
                      disabled={
                        focusedCandidate.isSelfSubmission ||
                        (allocations[focusedCandidate.submissionId] || 0) <= 0
                      }
                      onClick={() => handleDecrementStar(focusedCandidate)}
                      aria-label={`Kurangi Star untuk ${focusedCandidate.title}`}
                      className="h-11 w-11 min-h-[44px] min-w-[44px] rounded-xl bg-white/5 hover:bg-white/10 disabled:opacity-30 disabled:pointer-events-none flex items-center justify-center text-zinc-200 transition-colors cursor-pointer"
                    >
                      <Minus className="h-4 w-4" />
                    </button>
                    <span className="font-mono text-sm font-bold text-amber-300 px-2 min-w-[4rem] text-center">
                      {allocations[focusedCandidate.submissionId] || 0} Star
                    </span>
                    <button
                      type="button"
                      disabled={focusedCandidate.isSelfSubmission || remainingStars <= 0}
                      onClick={() => handleIncrementStar(focusedCandidate)}
                      aria-label={`Tambah Star untuk ${focusedCandidate.title}`}
                      className="h-11 w-11 min-h-[44px] min-w-[44px] rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 disabled:opacity-30 disabled:pointer-events-none flex items-center justify-center transition-colors cursor-pointer"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
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
                )}
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
