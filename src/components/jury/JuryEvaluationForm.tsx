"use client";

import { useState } from "react";
import { submitJuryScoreAction } from "@/app/actions/voting";
import { Loader2, Save, Award, MessageSquare, Star, CheckCircle2 } from "lucide-react";

interface WinnerSlotOption {
  id: string;
  title: string;
  slotType: "community_vote" | "jury_award";
  rank: number;
}

interface JuryEvaluationFormProps {
  challengeId: string;
  submissionId: string;
  winnerSlots: WinnerSlotOption[];
  initialSlotId?: string | null;
  initialScore?: number | null;
  initialNotes?: string | null;
}

export function JuryEvaluationForm({
  challengeId,
  submissionId,
  winnerSlots,
  initialSlotId = null,
  initialScore = null,
  initialNotes = "",
}: JuryEvaluationFormProps) {
  const [selectedSlotId, setSelectedSlotId] = useState<string>(initialSlotId || "");
  const [score, setScore] = useState<string>(initialScore ? String(initialScore) : "");
  const [critiqueNotes, setCritiqueNotes] = useState<string>(initialNotes || "");

  const [isLoading, setIsLoading] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    setIsSaved(false);

    try {
      await submitJuryScoreAction(
        challengeId,
        submissionId,
        selectedSlotId || undefined,
        score ? Number(score) : undefined,
        critiqueNotes || undefined
      );
      setIsSaved(true);
      setTimeout(() => setIsSaved(false), 3000);
    } catch (err: any) {
      setError(err?.message || "Gagal menyimpan evaluasi juri.");
    } finally {
      setIsLoading(false);
    }
  };

  const jurySlots = winnerSlots.filter((s) => s.slotType === "jury_award");

  return (
    <form onSubmit={handleSubmit} className="p-4 rounded-2xl bg-white/[0.02] border border-white/10 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-mono text-amber-400 font-bold flex items-center gap-1.5">
          <Award className="h-3.5 w-3.5" />
          <span>EVALUASI JURI</span>
        </span>
        {isSaved ? (
          <span className="text-[11px] font-mono text-emerald-400 flex items-center gap-1">
            <CheckCircle2 className="h-3 w-3" /> Tersimpan
          </span>
        ) : null}
      </div>

      {error ? <span className="text-xs text-red-400">{error}</span> : null}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-mono text-zinc-400">NOMINASI SLOT JUARA</label>
          <select
            value={selectedSlotId}
            onChange={(e) => setSelectedSlotId(e.target.value)}
            className="px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 text-white text-xs font-mono"
          >
            <option value="" className="bg-zinc-900 text-zinc-400">
              -- Tidak Ada Slot Khusus --
            </option>
            {jurySlots.map((s) => (
              <option key={s.id} value={s.id} className="bg-zinc-900 text-white">
                {s.title}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-mono text-zinc-400">SKOR KUALITAS (1 - 100)</label>
          <input
            type="number"
            min={1}
            max={100}
            value={score}
            onChange={(e) => setScore(e.target.value)}
            placeholder="e.g. 92"
            className="px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 text-white text-xs font-mono"
          />
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-[10px] font-mono text-zinc-400">CATATAN KRITIK & APRESIASI JURI</label>
        <textarea
          value={critiqueNotes}
          onChange={(e) => setCritiqueNotes(e.target.value)}
          rows={2}
          placeholder="Tuliskan apresiasi visual, aspek teknik pencahayaan, atau saran pengembangan..."
          className="px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 text-white text-xs font-sans resize-none"
        />
      </div>

      <button
        type="submit"
        disabled={isLoading}
        className="self-end px-4 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs font-mono transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
      >
        {isLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
        <span>Simpan Evaluasi</span>
      </button>
    </form>
  );
}
