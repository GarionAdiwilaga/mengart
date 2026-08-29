"use client";

import { useState, useEffect, useCallback } from "react";
import type { CandidateArtwork } from "@/lib/voting";
import { castOrUpdateBallotAction, resetBallotAction } from "@/app/actions/voting";
import { BallotReviewDock } from "./BallotReviewDock";
import {
  Star,
  LayoutGrid,
  Maximize2,
  ChevronLeft,
  ChevronRight,
  Columns2,
  Info,
  CheckCircle2,
  AlertCircle,
  Image as ImageIcon,
  User,
  Sparkles,
} from "lucide-react";
import Link from "next/link";

interface VotingWorkspaceProps {
  challengeId: string;
  challengeTitle: string;
  challengeSlug: string;
  votingRoundId?: string;
  roundType?: "main" | "tiebreak";
  candidates: CandidateArtwork[];
  initialAllocations: { [submissionId: string]: number };
  maxStars: number;
  initialRemainingStars: number;
  isLoggedIn: boolean;
}

export function VotingWorkspace({
  challengeId,
  challengeTitle,
  challengeSlug,
  votingRoundId,
  roundType = "main",
  candidates,
  initialAllocations,
  maxStars,
  initialRemainingStars,
  isLoggedIn,
}: VotingWorkspaceProps) {
  const [viewMode, setViewMode] = useState<"grid" | "focus" | "compare">("grid");
  const [allocations, setAllocations] = useState<{ [submissionId: string]: number }>(
    initialAllocations
  );
  const [remainingStars, setRemainingStars] = useState(initialRemainingStars);
  const [focusIndex, setFocusIndex] = useState(0);
  const [compareIndexA, setCompareIndexA] = useState(0);
  const [compareIndexB, setCompareIndexB] = useState(candidates.length > 1 ? 1 : 0);

  const [isLoading, setIsLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Recalculate remaining stars whenever allocations change
  const updateStars = useCallback((submissionId: string, delta: number) => {
    if (!isLoggedIn) {
      setFeedback({ type: "error", text: "Silakan masuk terlebih dahulu untuk menggunakan hak suara Stars." });
      return;
    }

    const candidate = candidates.find((c) => c.submissionId === submissionId);
    if (candidate?.isSelfSubmission) {
      setFeedback({ type: "error", text: "Self-voting tidak diperbolehkan dalam aturan atelier." });
      return;
    }

    const currentCount = allocations[submissionId] || 0;
    const newCount = currentCount + delta;

    if (newCount < 0) return;
    if (delta > 0 && remainingStars <= 0) {
      setFeedback({ type: "error", text: `Seluruh ${maxStars} Stars telah Anda alokasikan.` });
      return;
    }

    const newAllocations = { ...allocations, [submissionId]: newCount };
    const newTotalAllocated = Object.values(newAllocations).reduce((a, b) => a + b, 0);

    if (newTotalAllocated > maxStars) return;

    setAllocations(newAllocations);
    setRemainingStars(maxStars - newTotalAllocated);
    setFeedback(null);
  }, [isLoggedIn, candidates, allocations, remainingStars, maxStars]);

  const handleReset = async () => {
    if (!confirm("Reset seluruh alokasi Stars Anda untuk babak voting ini?")) return;
    setIsLoading(true);
    try {
      if (votingRoundId) {
        await resetBallotAction({ votingRoundId });
      } else {
        await resetBallotAction(challengeId, roundType);
      }
      setAllocations({});
      setRemainingStars(maxStars);
      setFeedback({ type: "success", text: "Alokasi Stars berhasil direset." });
    } catch (err: any) {
      setFeedback({ type: "error", text: err?.message || "Gagal mereset suara." });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async () => {
    setIsLoading(true);
    setFeedback(null);

    const activeList = Object.entries(allocations)
      .filter(([_, count]) => count > 0)
      .map(([submissionId, starsCount]) => ({ submissionId, starsCount }));

    try {
      let res;
      if (votingRoundId) {
        res = await castOrUpdateBallotAction({ votingRoundId, votes: activeList });
      } else {
        res = await castOrUpdateBallotAction(challengeId, activeList, roundType);
      }
      if (res.success) {
        setFeedback({
          type: "success",
          text: "Suara berhasil disimpan! Anda tetap dapat mengubah alokasi hingga batas waktu voting berakhir.",
        });
      }
    } catch (err: any) {
      setFeedback({ type: "error", text: err?.message || "Gagal menyimpan suara." });
    } finally {
      setIsLoading(false);
    }
  };

  // Keyboard navigation for Focus Deck
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (viewMode === "focus") {
        if (e.key === "ArrowLeft") {
          setFocusIndex((prev) => (prev > 0 ? prev - 1 : candidates.length - 1));
        } else if (e.key === "ArrowRight") {
          setFocusIndex((prev) => (prev < candidates.length - 1 ? prev + 1 : 0));
        } else if (e.key === "1") {
          const cur = candidates[focusIndex];
          if (cur) updateStars(cur.submissionId, 1);
        }
      }
    },
    [viewMode, candidates, focusIndex, updateStars]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  const activeFocusCandidate = candidates[focusIndex];
  const compareA = candidates[compareIndexA];
  const compareB = candidates[compareIndexB];

  return (
    <div className="flex flex-col gap-6 pb-28">
      {/* Top Toolbar (Mode Switcher + Candidate Counter) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 glass-panel p-4 rounded-2xl border border-white/10">
        <div className="flex items-center gap-3">
          <span className="text-xs font-mono uppercase text-zinc-400">TAMPILAN VOTING:</span>
          <div className="flex items-center gap-1 p-1 rounded-xl bg-white/5 border border-white/10 text-xs font-mono">
            <button
              onClick={() => setViewMode("grid")}
              className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all cursor-pointer ${
                viewMode === "grid"
                  ? "bg-amber-500 text-black font-bold shadow-md"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              <span>Balanced Grid</span>
            </button>

            <button
              onClick={() => setViewMode("focus")}
              className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all cursor-pointer ${
                viewMode === "focus"
                  ? "bg-amber-500 text-black font-bold shadow-md"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              <Maximize2 className="h-3.5 w-3.5" />
              <span>Focus Deck</span>
            </button>

            {candidates.length >= 2 ? (
              <button
                onClick={() => setViewMode("compare")}
                className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all cursor-pointer ${
                  viewMode === "compare"
                    ? "bg-amber-500 text-black font-bold shadow-md"
                    : "text-zinc-400 hover:text-white"
                }`}
              >
                <Columns2 className="h-3.5 w-3.5" />
                <span>Side-by-Side</span>
              </button>
            ) : null}
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs font-mono text-zinc-400">
          <span>{candidates.length} Karya Terdaftar</span>
          <span>•</span>
          <span className="text-amber-400">Anti-Bias Random Shuffle Aktif</span>
        </div>
      </div>

      {/* Feedback Banner */}
      {feedback ? (
        <div
          className={`p-4 rounded-2xl border text-xs flex items-center gap-3 animate-in fade-in ${
            feedback.type === "success"
              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
              : "bg-red-500/10 border-red-500/30 text-red-300"
          }`}
        >
          {feedback.type === "success" ? (
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
          ) : (
            <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
          )}
          <span>{feedback.text}</span>
        </div>
      ) : null}

      {/* VIEW MODE 1: BALANCED ATELIER GRID */}
      {viewMode === "grid" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {candidates.map((cand, idx) => {
            const assigned = allocations[cand.submissionId] || 0;
            const thumbUrl = cand.thumbnailStorageKey
              ? `/api/media/public/${cand.thumbnailStorageKey}`
              : null;

            return (
              <div
                key={cand.submissionId}
                className={`glass-panel rounded-2xl overflow-hidden flex flex-col justify-between transition-all duration-200 ${
                  assigned > 0
                    ? "border-amber-500/60 shadow-lg shadow-amber-500/10 ring-1 ring-amber-500/50"
                    : "border-white/10 hover:border-white/20"
                }`}
              >
                {/* Artwork Thumbnail (Uniform Aspect Ratio for Fairness) */}
                <div
                  onClick={() => {
                    setFocusIndex(idx);
                    setViewMode("focus");
                  }}
                  className="aspect-[4/3] bg-black/40 relative overflow-hidden flex items-center justify-center cursor-pointer group"
                >
                  {thumbUrl ? (
                    <img
                      src={thumbUrl}
                      alt={cand.title}
                      className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                  ) : (
                    <ImageIcon className="h-8 w-8 text-zinc-700" />
                  )}

                  {/* Star Badge Overlay */}
                  {assigned > 0 ? (
                    <div className="absolute top-3 right-3 px-2.5 py-1 rounded-full bg-amber-500 text-black font-mono font-extrabold text-xs flex items-center gap-1 shadow-lg">
                      <Star className="h-3.5 w-3.5 fill-black text-black" />
                      <span>{assigned} Stars</span>
                    </div>
                  ) : null}

                  {cand.isSelfSubmission ? (
                    <div className="absolute top-3 left-3 px-2 py-0.5 rounded-md bg-black/80 text-zinc-400 font-mono text-[10px] border border-white/10">
                      Karya Anda
                    </div>
                  ) : null}
                </div>

                {/* Candidate Info & Star Assigner Pills */}
                <div className="p-4 flex flex-col gap-3">
                  <div>
                    <h4
                      className="font-display font-bold text-sm text-[#f6f2e9] truncate"
                      title={cand.title}
                    >
                      {cand.title}
                    </h4>
                    <Link
                      href={`/artists/${cand.artistSlug}`}
                      className="text-xs text-zinc-400 hover:text-white transition-colors truncate block mt-0.5"
                    >
                      oleh {cand.artistName}
                    </Link>
                  </div>

                  {/* Star Assignment Pill Bar */}
                  <div className="pt-3 border-t border-white/5 flex items-center justify-between">
                    {cand.isSelfSubmission ? (
                      <span className="text-[11px] font-mono text-zinc-500 italic">
                        Self-voting dilarang
                      </span>
                    ) : (
                      <>
                        <span className="text-xs font-mono text-zinc-400">
                          {assigned > 0 ? `${assigned} Bintang` : "Beri Star:"}
                        </span>

                        <div className="flex items-center gap-1.5">
                          {assigned > 0 ? (
                            <button
                              onClick={() => updateStars(cand.submissionId, -1)}
                              className="h-7 w-7 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-300 font-bold text-xs flex items-center justify-center transition-colors cursor-pointer"
                            >
                              -
                            </button>
                          ) : null}

                          <button
                            onClick={() => updateStars(cand.submissionId, 1)}
                            disabled={remainingStars <= 0}
                            className={`px-3 py-1 rounded-lg text-xs font-mono font-bold transition-all flex items-center gap-1 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                              assigned > 0
                                ? "bg-amber-500 text-black shadow-md shadow-amber-500/20"
                                : "bg-white/5 hover:bg-amber-500/20 text-zinc-300 hover:text-amber-300 border border-white/10"
                            }`}
                          >
                            <Star className={`h-3.5 w-3.5 ${assigned > 0 ? "fill-black" : ""}`} />
                            <span>+1</span>
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}

      {/* VIEW MODE 2: FOCUS DECK */}
      {viewMode === "focus" && activeFocusCandidate ? (
        <div className="flex flex-col gap-4">
          <div className="glass-panel p-6 rounded-3xl flex flex-col lg:flex-row gap-6 items-center">
            {/* Main Full Artwork Preview */}
            <div className="w-full lg:w-3/4 max-h-[65vh] aspect-[16/10] bg-black/60 rounded-2xl overflow-hidden relative flex items-center justify-center border border-white/10">
              <img
                src={
                  activeFocusCandidate.publicStorageKey
                    ? `/api/media/public/${activeFocusCandidate.publicStorageKey}`
                    : `/api/media/public/${activeFocusCandidate.thumbnailStorageKey}`
                }
                alt={activeFocusCandidate.title}
                className="max-h-full max-w-full object-contain"
              />

              {/* Prev / Next Arrows */}
              <button
                onClick={() =>
                  setFocusIndex((prev) => (prev > 0 ? prev - 1 : candidates.length - 1))
                }
                className="absolute left-4 p-3 rounded-2xl bg-black/60 hover:bg-black/80 text-white backdrop-blur-md transition-colors cursor-pointer"
              >
                <ChevronLeft className="h-6 w-6" />
              </button>

              <button
                onClick={() =>
                  setFocusIndex((prev) => (prev < candidates.length - 1 ? prev + 1 : 0))
                }
                className="absolute right-4 p-3 rounded-2xl bg-black/60 hover:bg-black/80 text-white backdrop-blur-md transition-colors cursor-pointer"
              >
                <ChevronRight className="h-6 w-6" />
              </button>
            </div>

            {/* Candidate Metadata & Focus Assigner */}
            <div className="w-full lg:w-1/4 flex flex-col justify-between gap-6 p-2">
              <div className="flex flex-col gap-3">
                <span className="text-[10px] font-mono uppercase text-amber-400">
                  KANDIDAT #{focusIndex + 1} DARI {candidates.length}
                </span>

                <h3 className="font-display font-extrabold text-2xl text-[#f6f2e9]">
                  {activeFocusCandidate.title}
                </h3>

                <Link
                  href={`/artists/${activeFocusCandidate.artistSlug}`}
                  className="text-sm text-zinc-300 hover:text-amber-400 font-semibold transition-colors inline-flex items-center gap-1.5"
                >
                  <User className="h-4 w-4 text-amber-400" />
                  <span>{activeFocusCandidate.artistName}</span>
                </Link>

                {activeFocusCandidate.softwareUsed ? (
                  <span className="text-xs font-mono text-zinc-400">
                    Software: {activeFocusCandidate.softwareUsed}
                  </span>
                ) : null}

                {activeFocusCandidate.description ? (
                  <p className="text-xs text-zinc-300 font-sans leading-relaxed mt-2 p-3 rounded-xl bg-white/[0.02] border border-white/5">
                    {activeFocusCandidate.description}
                  </p>
                ) : null}
              </div>

              {/* Star Allocation Box */}
              <div className="p-4 rounded-2xl bg-white/5 border border-white/10 flex flex-col gap-3">
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="text-zinc-400">ALOKASI STARS ANDA:</span>
                  <span className="font-bold text-amber-400">
                    {allocations[activeFocusCandidate.submissionId] || 0} Stars
                  </span>
                </div>

                {activeFocusCandidate.isSelfSubmission ? (
                  <span className="text-xs font-mono text-zinc-500 italic text-center">
                    Self-voting dilarang
                  </span>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => updateStars(activeFocusCandidate.submissionId, -1)}
                      disabled={!(allocations[activeFocusCandidate.submissionId] > 0)}
                      className="py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-300 text-xs font-mono transition-colors disabled:opacity-30 cursor-pointer"
                    >
                      - Kurangi
                    </button>
                    <button
                      onClick={() => updateStars(activeFocusCandidate.submissionId, 1)}
                      disabled={remainingStars <= 0}
                      className="py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-xs font-mono font-bold transition-all shadow-md shadow-amber-500/20 disabled:opacity-30 cursor-pointer"
                    >
                      + Beri Star
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Candidate Thumbnails Strip */}
          <div className="flex items-center gap-3 overflow-x-auto p-2 glass-panel rounded-2xl">
            {candidates.map((c, idx) => (
              <button
                key={c.submissionId}
                onClick={() => setFocusIndex(idx)}
                className={`h-16 w-24 rounded-xl overflow-hidden shrink-0 border-2 transition-all cursor-pointer relative ${
                  focusIndex === idx ? "border-amber-400 scale-105" : "border-transparent opacity-60 hover:opacity-100"
                }`}
              >
                <img
                  src={`/api/media/public/${c.thumbnailStorageKey}`}
                  alt={c.title}
                  className="w-full h-full object-cover"
                />
                {(allocations[c.submissionId] || 0) > 0 ? (
                  <span className="absolute bottom-1 right-1 px-1 rounded bg-black/80 text-[10px] font-mono text-amber-400 font-bold">
                    ★ {allocations[c.submissionId]}
                  </span>
                ) : null}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {/* VIEW MODE 3: SIDE-BY-SIDE COMPARISON */}
      {viewMode === "compare" && compareA && compareB ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Candidate A Card */}
          <div className="glass-panel p-6 rounded-3xl flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono text-amber-400">KANDIDAT A</span>
              <select
                value={compareIndexA}
                onChange={(e) => setCompareIndexA(Number(e.target.value))}
                className="px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 text-white text-xs font-mono"
              >
                {candidates.map((c, idx) => (
                  <option key={c.submissionId} value={idx} className="bg-zinc-900 text-white">
                    {c.title} ({c.artistName})
                  </option>
                ))}
              </select>
            </div>

            <div className="aspect-[4/3] bg-black/50 rounded-2xl overflow-hidden flex items-center justify-center">
              <img
                src={`/api/media/public/${compareA.publicStorageKey || compareA.thumbnailStorageKey}`}
                alt={compareA.title}
                className="max-h-full max-w-full object-contain"
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-display font-bold text-base text-[#f6f2e9]">{compareA.title}</h4>
                <p className="text-xs text-zinc-400">oleh {compareA.artistName}</p>
              </div>

              <button
                onClick={() => updateStars(compareA.submissionId, 1)}
                disabled={remainingStars <= 0 || compareA.isSelfSubmission}
                className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold font-mono transition-all disabled:opacity-40 cursor-pointer"
              >
                + Beri Star ({allocations[compareA.submissionId] || 0})
              </button>
            </div>
          </div>

          {/* Candidate B Card */}
          <div className="glass-panel p-6 rounded-3xl flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono text-amber-400">KANDIDAT B</span>
              <select
                value={compareIndexB}
                onChange={(e) => setCompareIndexB(Number(e.target.value))}
                className="px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 text-white text-xs font-mono"
              >
                {candidates.map((c, idx) => (
                  <option key={c.submissionId} value={idx} className="bg-zinc-900 text-white">
                    {c.title} ({c.artistName})
                  </option>
                ))}
              </select>
            </div>

            <div className="aspect-[4/3] bg-black/50 rounded-2xl overflow-hidden flex items-center justify-center">
              <img
                src={`/api/media/public/${compareB.publicStorageKey || compareB.thumbnailStorageKey}`}
                alt={compareB.title}
                className="max-h-full max-w-full object-contain"
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-display font-bold text-base text-[#f6f2e9]">{compareB.title}</h4>
                <p className="text-xs text-zinc-400">oleh {compareB.artistName}</p>
              </div>

              <button
                onClick={() => updateStars(compareB.submissionId, 1)}
                disabled={remainingStars <= 0 || compareB.isSelfSubmission}
                className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold font-mono transition-all disabled:opacity-40 cursor-pointer"
              >
                + Beri Star ({allocations[compareB.submissionId] || 0})
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Sticky Ballot Review Dock */}
      {isLoggedIn ? (
        <BallotReviewDock
          remainingStars={remainingStars}
          maxStars={maxStars}
          allocations={allocations}
          candidates={candidates}
          isLoading={isLoading}
          onReset={handleReset}
          onSubmit={handleSubmit}
        />
      ) : null}
    </div>
  );
}
