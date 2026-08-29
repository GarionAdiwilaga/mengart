"use client";

import { useState } from "react";
import {
  transitionChallengeStatusAction,
  revokeChallengeResultsAction,
} from "@/app/actions/challenges";
import {
  computeChallengeResultsAction,
  publishChallengeResultsAction,
} from "@/app/actions/voting";
import {
  Loader2,
  Play,
  XCircle,
  Sparkles,
  Calendar,
  RotateCcw,
  CheckCircle2,
  Users,
} from "lucide-react";
import type { EffectiveChallengeStatus } from "@/lib/challenges";

interface ChallengeTransitionButtonsProps {
  challengeId: string;
  currentStatus: EffectiveChallengeStatus;
  awardMode?: string;
}

export function ChallengeTransitionButtons({
  challengeId,
  currentStatus,
  awardMode = "vote_and_jury",
}: ChallengeTransitionButtonsProps) {
  const [isLoading, setIsLoading] = useState(false);

  const handleTransition = async (status: EffectiveChallengeStatus) => {
    if (!confirm(`Ubah status challenge menjadi "${status}"?`)) return;
    setIsLoading(true);
    try {
      await transitionChallengeStatusAction(challengeId, status);
    } catch (err: any) {
      alert(err?.message || "Gagal mengubah status.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCompute = async () => {
    if (!confirm("Kunci tahapan dan hitung akumulasi hasil challenge?")) return;
    setIsLoading(true);
    try {
      const res = await computeChallengeResultsAction(challengeId);
      alert("Hasil berhasil dihitung dan masuk ke tahap Review.");
    } catch (err: any) {
      alert(err?.message || "Gagal menghitung hasil.");
    } finally {
      setIsLoading(false);
    }
  };

  const handlePublish = async () => {
    if (!confirm("Publikasikan hasil resmi challenge ke publik dan Hall of Fame?")) return;
    setIsLoading(true);
    try {
      await publishChallengeResultsAction(challengeId);
      alert("Hasil resmi berhasil dipublikasikan.");
    } catch (err: any) {
      alert(err?.message || "Gagal mempublikasikan hasil.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleRevoke = async () => {
    const reason = prompt("Masukkan alasan pencabutan hasil resmi challenge:");
    if (!reason || reason.trim().length < 5) {
      alert("Pencabutan dibatalkan: Alasan harus diisi minimal 5 karakter.");
      return;
    }
    setIsLoading(true);
    try {
      await revokeChallengeResultsAction(challengeId, reason);
      alert("Hasil resmi telah dicabut dan challenge beralih ke status 'results_revoked'.");
    } catch (err: any) {
      alert(err?.message || "Gagal mencabut hasil.");
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return <Loader2 className="h-4 w-4 animate-spin text-amber-400" />;
  }

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {/* Draft -> Scheduled */}
      {currentStatus === "draft" ? (
        <button
          onClick={() => handleTransition("scheduled")}
          title="Jadwalkan Challenge"
          className="p-1.5 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 text-xs font-mono transition-colors flex items-center gap-1 cursor-pointer"
        >
          <Calendar className="h-3 w-3" />
          <span>Jadwalkan</span>
        </button>
      ) : null}

      {/* Scheduled -> Submission Open */}
      {currentStatus === "scheduled" ? (
        <button
          onClick={() => handleTransition("submission_open")}
          title="Buka Submisi Sekarang"
          className="p-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 text-xs font-mono transition-colors flex items-center gap-1 cursor-pointer"
        >
          <Play className="h-3 w-3" />
          <span>Buka Submisi</span>
        </button>
      ) : null}

      {/* Submission Locked -> Award Mode Aware Next Stage */}
      {currentStatus === "submission_locked" ? (
        awardMode === "jury_only" ? (
          <button
            onClick={() => handleTransition("jury_selection_open")}
            title="Buka Sesi Penilaian Juri"
            className="p-1.5 rounded-lg bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 text-xs font-mono font-bold transition-all flex items-center gap-1 cursor-pointer"
          >
            <Users className="h-3 w-3" />
            <span>Buka Sesi Juri</span>
          </button>
        ) : awardMode === "showcase_only" ? (
          <button
            onClick={() => handleTransition("review")}
            title="Masuk Tahap Review Kurator"
            className="p-1.5 rounded-lg bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 text-xs font-mono font-bold transition-all flex items-center gap-1 cursor-pointer"
          >
            <Sparkles className="h-3 w-3" />
            <span>Masuk Review</span>
          </button>
        ) : null
      ) : null}

      {/* Jury Selection Open -> Compute Results & Transition to Review */}
      {currentStatus === "jury_selection_open" ? (
        <button
          onClick={handleCompute}
          title="Kunci Penilaian Juri & Hitung Hasil (Masuk Review)"
          className="p-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 text-xs font-mono font-bold transition-all flex items-center gap-1 cursor-pointer"
        >
          <Sparkles className="h-3 w-3" />
          <span>Hitung Hasil</span>
        </button>
      ) : null}

      {/* Review -> Publish Results */}
      {currentStatus === "review" ? (
        <button
          onClick={handlePublish}
          title="Publikasikan Hasil Resmi (Finished)"
          className="p-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-mono font-bold transition-all flex items-center gap-1 cursor-pointer"
        >
          <CheckCircle2 className="h-3 w-3" />
          <span>Publikasikan</span>
        </button>
      ) : null}

      {/* Finished -> Revoke Results */}
      {currentStatus === "finished" ? (
        <button
          onClick={handleRevoke}
          title="Cabut Hasil Resmi Challenge"
          className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-xs font-mono transition-colors flex items-center gap-1 cursor-pointer"
        >
          <RotateCcw className="h-3 w-3" />
          <span>Cabut Hasil</span>
        </button>
      ) : null}

      {/* Results Revoked -> Return to Review */}
      {currentStatus === "results_revoked" ? (
        <button
          onClick={() => handleTransition("review")}
          title="Kembalikan ke Tahap Review Ulang"
          className="p-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 text-xs font-mono transition-colors flex items-center gap-1 cursor-pointer"
        >
          <Sparkles className="h-3 w-3" />
          <span>Masuk Review Ulang</span>
        </button>
      ) : null}

      {/* Cancel button */}
      {currentStatus !== "cancelled" && currentStatus !== "finished" ? (
        <button
          onClick={() => handleTransition("cancelled")}
          title="Batalkan Challenge"
          className="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs font-mono transition-colors cursor-pointer"
        >
          <XCircle className="h-3 w-3" />
        </button>
      ) : null}
    </div>
  );
}
