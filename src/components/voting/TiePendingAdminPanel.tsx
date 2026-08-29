"use client";

import { useState } from "react";
import type { CandidateArtwork } from "@/lib/voting";
import { startTiebreakAction, resolveTieManuallyAction } from "@/app/actions/voting";
import {
  Trophy,
  Flame,
  UserCheck,
  AlertTriangle,
  Clock,
  CheckCircle2,
  AlertCircle,
  Star,
} from "lucide-react";
import Link from "next/link";

interface TiePendingAdminPanelProps {
  challengeId: string;
  challengeSlug: string;
  tiedCandidates: CandidateArtwork[];
  hasExistingTiebreakRound: boolean;
}

export function TiePendingAdminPanel({
  challengeId,
  challengeSlug,
  tiedCandidates,
  hasExistingTiebreakRound,
}: TiePendingAdminPanelProps) {
  const [showTiebreakModal, setShowTiebreakModal] = useState(false);
  const [showManualModal, setShowManualModal] = useState(false);

  // Tiebreak Form State
  const defaultDeadline = new Date(Date.now() + 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 16);
  const [customDeadline, setCustomDeadline] = useState(defaultDeadline);

  // Manual Resolve Form State
  const [selectedSubmissionId, setSelectedSubmissionId] = useState<string>(
    tiedCandidates[0]?.submissionId || ""
  );
  const [reason, setReason] = useState("");

  const [isLoading, setIsLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const handleStartTiebreak = async () => {
    setIsLoading(true);
    setFeedback(null);
    try {
      const res = await startTiebreakAction({
        challengeId,
        deadline: customDeadline ? new Date(customDeadline).toISOString() : undefined,
      });
      if (res.success) {
        setFeedback({
          type: "success",
          text: `Babak tiebreak berhasil dibuka! ${res.tiedCandidatesCount} kandidat resmi dibekukan.`,
        });
        setShowTiebreakModal(false);
      }
    } catch (err: any) {
      setFeedback({ type: "error", text: err?.message || "Gagal memulai babak tiebreak." });
    } finally {
      setIsLoading(false);
    }
  };

  const handleResolveManually = async () => {
    if (!reason || reason.trim().length < 5) {
      setFeedback({ type: "error", text: "Alasan penetapan pemenang wajib diisi minimal 5 karakter." });
      return;
    }

    setIsLoading(true);
    setFeedback(null);
    try {
      const res = await resolveTieManuallyAction({
        challengeId,
        submissionId: selectedSubmissionId,
        reason: reason.trim(),
      });
      if (res.success) {
        setFeedback({
          type: "success",
          text: "Pemenang resmi Juara 1 Komunitas berhasil ditetapkan secara manual.",
        });
        setShowManualModal(false);
      }
    } catch (err: any) {
      setFeedback({ type: "error", text: err?.message || "Gagal menetapkan pemenang manual." });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="glass-panel p-6 sm:p-8 rounded-3xl border border-amber-500/30 flex flex-col gap-6 bg-amber-500/[0.03]">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-amber-500/20 pb-6">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-400">
            <AlertTriangle className="h-6 w-6" />
          </div>
          <div>
            <span className="text-[10px] font-mono uppercase text-amber-400 font-bold tracking-wider">
              PANEL KEPUTUSAN STAF / MODERATOR
            </span>
            <h2 className="font-display font-extrabold text-xl text-[#f6f2e9]">
              Voting Berakhir — Seri Peringkat 1 Menunggu Resolusi
            </h2>
          </div>
        </div>

        {/* Action Trigger Buttons */}
        <div className="flex items-center gap-2.5 flex-wrap">
          {!hasExistingTiebreakRound ? (
            <button
              onClick={() => setShowTiebreakModal(true)}
              className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-mono font-bold text-xs flex items-center gap-2 transition-all shadow-md shadow-amber-500/20 cursor-pointer"
            >
              <Flame className="h-4 w-4" />
              <span>Mulai Babak Tiebreak</span>
            </button>
          ) : (
            <div className="px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 text-zinc-400 text-[11px] font-mono flex items-center gap-1.5">
              <span>Tiebreak 1x Telah Digunakan</span>
            </div>
          )}

          <button
            onClick={() => setShowManualModal(true)}
            className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white font-mono font-bold text-xs flex items-center gap-2 border border-white/10 transition-all cursor-pointer"
          >
            <UserCheck className="h-4 w-4 text-amber-400" />
            <span>Pilih Pemenang Manual</span>
          </button>
        </div>
      </div>

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

      {/* Tied Candidates Grid */}
      <div className="flex flex-col gap-3">
        <span className="text-xs font-mono text-zinc-400 uppercase tracking-wider">
          KANDIDAT SERI PADA PERINGKAT 1 ({tiedCandidates.length} KARYA):
        </span>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {tiedCandidates.map((cand) => (
            <div
              key={cand.submissionId}
              className="glass-panel p-4 rounded-2xl border border-white/10 flex flex-col justify-between gap-3 bg-black/40"
            >
              <div className="aspect-[4/3] rounded-xl overflow-hidden bg-black/60 relative">
                {cand.thumbnailStorageKey ? (
                  <img
                    src={`/api/media/public/${cand.thumbnailStorageKey}`}
                    alt={cand.title}
                    className="w-full h-full object-cover"
                  />
                ) : null}

                <div className="absolute top-2 right-2 px-2 py-0.5 rounded-full bg-amber-500 text-black font-mono font-bold text-[10px] flex items-center gap-1 shadow">
                  <Star className="h-3 w-3 fill-black text-black" />
                  <span>{cand.totalStars} Stars</span>
                </div>
              </div>

              <div>
                <h4 className="font-display font-bold text-sm text-[#f6f2e9] truncate">
                  {cand.title}
                </h4>
                <Link
                  href={`/artists/${cand.artistSlug}`}
                  className="text-xs text-zinc-400 hover:text-white truncate block mt-0.5"
                >
                  oleh {cand.artistName}
                </Link>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* MODAL 1: START TIEBREAK */}
      {showTiebreakModal ? (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="glass-panel max-w-lg w-full p-6 sm:p-8 rounded-3xl border border-amber-500/30 flex flex-col gap-6 bg-zinc-950 shadow-2xl">
            <div className="flex items-center gap-3 border-b border-white/10 pb-4">
              <Flame className="h-6 w-6 text-amber-400" />
              <div>
                <h3 className="font-display font-bold text-lg text-[#f6f2e9]">
                  Buka Babak Tiebreak Komunitas
                </h3>
                <p className="text-xs text-zinc-400">
                  Hanya kandidat yang seri di peringkat 1 yang akan dibekukan ke babak tiebreak (1 Star/member).
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-4">
              <div className="p-3 rounded-xl bg-white/[0.02] border border-white/10 text-xs text-zinc-300 font-mono flex flex-col gap-1">
                <span className="text-zinc-500">KANDIDAT DIBEKUKAN:</span>
                <span className="text-amber-400 font-bold">{tiedCandidates.length} Karya Terdaftar</span>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-mono text-zinc-400">
                  BATAS WAKTU TIEBREAK (WITA / UTC+8):
                </label>
                <input
                  type="datetime-local"
                  value={customDeadline}
                  onChange={(e) => setCustomDeadline(e.target.value)}
                  className="px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white font-mono text-xs focus:outline-none focus:border-amber-500"
                />
                <span className="text-[11px] text-zinc-500">
                  Default otomatis: 24 jam dari sekarang. Anda dapat menyesuaikan tanggal & jam.
                </span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/10">
              <button
                type="button"
                onClick={() => setShowTiebreakModal(false)}
                disabled={isLoading}
                className="px-4 py-2 rounded-xl text-zinc-400 hover:text-white font-mono text-xs cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleStartTiebreak}
                disabled={isLoading}
                className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-mono font-bold text-xs flex items-center gap-2 cursor-pointer shadow-lg disabled:opacity-50"
              >
                {isLoading ? "Membuka..." : "Konfirmasi Buka Tiebreak"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* MODAL 2: MANUAL RESOLVE */}
      {showManualModal ? (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="glass-panel max-w-lg w-full p-6 sm:p-8 rounded-3xl border border-white/10 flex flex-col gap-6 bg-zinc-950 shadow-2xl">
            <div className="flex items-center gap-3 border-b border-white/10 pb-4">
              <UserCheck className="h-6 w-6 text-amber-400" />
              <div>
                <h3 className="font-display font-bold text-lg text-[#f6f2e9]">
                  Penetapan Pemenang Seri Secara Manual
                </h3>
                <p className="text-xs text-zinc-400">
                  Pilih salah satu karya dari hasil seri dan berikan alasan kurasi/audit resmi.
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <label className="text-xs font-mono text-zinc-400">PILIH KARYA PEMENANG:</label>
                <div className="flex flex-col gap-2 max-h-48 overflow-y-auto pr-1">
                  {tiedCandidates.map((cand) => (
                    <label
                      key={cand.submissionId}
                      className={`p-3 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                        selectedSubmissionId === cand.submissionId
                          ? "bg-amber-500/10 border-amber-500 text-white"
                          : "bg-white/5 border-white/10 text-zinc-300 hover:border-white/20"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <input
                          type="radio"
                          name="selected_submission"
                          value={cand.submissionId}
                          checked={selectedSubmissionId === cand.submissionId}
                          onChange={(e) => setSelectedSubmissionId(e.target.value)}
                          className="text-amber-500"
                        />
                        <div>
                          <span className="font-bold text-xs block">{cand.title}</span>
                          <span className="text-[11px] text-zinc-400 font-mono">
                            oleh {cand.artistName}
                          </span>
                        </div>
                      </div>
                      <span className="text-xs font-mono text-amber-400 font-bold">
                        {cand.totalStars} Stars
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-mono text-zinc-400">
                  ALASAN PENETAPAN RESMI (WAJIB):
                </label>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Contoh: Keputusan dewan kurator atelier berdasarkan pertimbangan kesesuaian tema dan teknik komposisi..."
                  rows={3}
                  className="px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white font-sans text-xs focus:outline-none focus:border-amber-500 resize-none"
                />
                <span className="text-[11px] text-zinc-500">
                  Alasan ini akan dicatat ke dalam audit log resmi dan tidak dapat dihapus.
                </span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/10">
              <button
                type="button"
                onClick={() => setShowManualModal(false)}
                disabled={isLoading}
                className="px-4 py-2 rounded-xl text-zinc-400 hover:text-white font-mono text-xs cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleResolveManually}
                disabled={isLoading || !selectedSubmissionId || reason.trim().length < 5}
                className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-mono font-bold text-xs flex items-center gap-2 cursor-pointer shadow-lg disabled:opacity-50"
              >
                {isLoading ? "Menyimpan..." : "Tetapkan Pemenang"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
