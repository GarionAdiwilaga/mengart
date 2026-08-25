"use client";

import { useState } from "react";
import { transitionChallengeStatusAction } from "@/app/actions/challenges";
import { Loader2, Play, Lock, Vote, Pause, XCircle } from "lucide-react";
import type { EffectiveChallengeStatus } from "@/lib/challenges";

interface ChallengeTransitionButtonsProps {
  challengeId: string;
  currentStatus: EffectiveChallengeStatus;
}

export function ChallengeTransitionButtons({
  challengeId,
  currentStatus,
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

  if (isLoading) {
    return <Loader2 className="h-4 w-4 animate-spin text-amber-400" />;
  }

  return (
    <div className="flex items-center gap-1.5">
      {currentStatus === "scheduled" || currentStatus === "draft" ? (
        <button
          onClick={() => handleTransition("submission_open")}
          title="Buka Submisi Sekarang"
          className="p-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 text-xs font-mono transition-colors flex items-center gap-1 cursor-pointer"
        >
          <Play className="h-3 w-3" />
          <span>Buka Submisi</span>
        </button>
      ) : null}

      {currentStatus === "submission_open" ? (
        <button
          onClick={() => handleTransition("submission_locked")}
          title="Kunci Submisi (Tutup Pendaftaran)"
          className="p-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 text-xs font-mono transition-colors flex items-center gap-1 cursor-pointer"
        >
          <Lock className="h-3 w-3" />
          <span>Kunci Submisi</span>
        </button>
      ) : null}

      {currentStatus === "submission_locked" ? (
        <button
          onClick={() => handleTransition("voting_open")}
          title="Buka Babak Voting Komunitas"
          className="p-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black text-xs font-mono font-bold transition-all flex items-center gap-1 cursor-pointer"
        >
          <Vote className="h-3 w-3" />
          <span>Buka Voting</span>
        </button>
      ) : null}

      {currentStatus === "voting_open" ? (
        <button
          onClick={() => handleTransition("review")}
          title="Tutup Voting & Masuk Tahap Review"
          className="p-1.5 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 text-xs font-mono transition-colors flex items-center gap-1 cursor-pointer"
        >
          <Lock className="h-3 w-3" />
          <span>Tutup Voting</span>
        </button>
      ) : null}

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
