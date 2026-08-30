"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  createJuryAwardAction,
  updateJuryAwardAction,
  deleteJuryAwardAction,
  publishJuryResultsAction,
  cancelJuryChallengeAction,
  assignJuryRecorderAction,
  addJuryAssignmentAction,
  removeJuryAssignmentAction,
  correctCommunityWinnerAction,
  republishChallengeResultsAction,
  cancelRevokedChallengeAction,
} from "@/app/actions/jury";
import {
  Award,
  Crown,
  Star,
  Users,
  Shield,
  Sparkles,
  Trash2,
  Edit2,
  Plus,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  XCircle,
  AlertCircle,
  HelpCircle,
  UserPlus,
  UserMinus,
  RefreshCw,
} from "lucide-react";

interface JuryAssignmentItem {
  id: string;
  userId: string;
  isRecorder: boolean;
  displayName: string;
  avatarUrl?: string | null;
  slug?: string;
}

interface AvailableMemberItem {
  userId: string;
  profileId: string;
  displayName: string;
  slug: string;
  avatarUrl?: string | null;
}

interface CandidateItem {
  submissionId: string;
  userId: string;
  title: string | null;
  description?: string | null;
  softwareUsed?: string | null;
  thumbnailStorageKey?: string | null;
  publicStorageKey?: string | null;
  artistName: string | null;
  artistSlug?: string | null;
  artistAvatar?: string | null;
  communityStars: number;
  isCommunityWinner: boolean;
}

interface DraftAwardItem {
  id: string;
  submissionId: string;
  categoryLabel?: string | null;
  recordedByUserId?: string | null;
  createdAt: Date | string;
  title: string | null;
  artistName: string | null;
  artistSlug?: string | null;
  thumbnailStorageKey?: string | null;
}

interface JuryAwardWorkspaceProps {
  challenge: {
    id: string;
    slug: string;
    title: string;
    awardMode: string;
    status: string;
  };
  juryAssignments: JuryAssignmentItem[];
  readiness: {
    ready: boolean;
    reason?: string;
    recorder?: any;
  };
  communityWinner?: {
    resultId?: string;
    submissionId: string;
    awardType?: string;
    resolutionMethod?: string | null;
    title?: string | null;
    artistName?: string | null;
    artistSlug?: string | null;
    totalCommunityStars: number;
    thumbnailStorageKey?: string | null;
  } | null;
  candidates: CandidateItem[];
  draftAwards: DraftAwardItem[];
  isAssignedJury: boolean;
  isRecorder: boolean;
  isAdmin: boolean;
  isModerator: boolean;
  availableMembers?: AvailableMemberItem[];
}

export function JuryAwardWorkspace({
  challenge,
  juryAssignments,
  readiness,
  communityWinner,
  candidates,
  draftAwards,
  isAssignedJury,
  isRecorder,
  isAdmin,
  isModerator,
  availableMembers = [],
}: JuryAwardWorkspaceProps) {
  const isModOrAdmin = isAdmin || isModerator;
  const isJuryOpen = challenge.status === "jury_selection_open";
  const isRevoked = challenge.status === "results_revoked";

  // Lifecycle-aware editing permission:
  // In JURY_SELECTION_OPEN: Recorder or Admin can edit awards (Moderator is read-only unless they are Recorder).
  // In RESULTS_REVOKED: Admin or Moderator can perform governance corrections (former Recorder alone is read-only).
  const canEditAwards = isJuryOpen
    ? (isRecorder || isAdmin)
    : isRevoked
    ? (isAdmin || isModerator)
    : false;

  const canPublishOrCancel = isJuryOpen
    ? (isRecorder || isAdmin || isModerator)
    : isRevoked
    ? (isAdmin || isModerator)
    : false;

  const [selectedSubmissionId, setSelectedSubmissionId] = useState<string>("");
  const [categoryLabel, setCategoryLabel] = useState<string>("");
  const [confirmDuplicateSubmission, setConfirmDuplicateSubmission] = useState(false);
  const [editingAwardId, setEditingAwardId] = useState<string | null>(null);

  // Panel Management State
  const [selectedNewJurorId, setSelectedNewJurorId] = useState<string>("");

  // Governance Community Winner Correction State
  const [activeGovernanceTab, setActiveGovernanceTab] = useState<"replace" | "clear">("replace");
  const [replaceWinnerSubmissionId, setReplaceWinnerSubmissionId] = useState<string>("");
  const [replaceWinnerReason, setReplaceWinnerReason] = useState<string>("");
  const [clearWinnerReason, setClearWinnerReason] = useState<string>("");
  const [confirmClearWinner, setConfirmClearWinner] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Cancellation Modal State
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");

  // Duplicate category detection
  const isDuplicateCategory =
    Boolean(categoryLabel.trim()) &&
    draftAwards.some(
      (a) =>
        a.categoryLabel?.trim().toLowerCase() === categoryLabel.trim().toLowerCase() &&
        a.id !== editingAwardId
    );

  // Duplicate artwork detection
  const isDuplicateArtwork = Boolean(
    selectedSubmissionId &&
      draftAwards.some(
        (a) => a.submissionId === selectedSubmissionId && a.id !== editingAwardId
      )
  );

  const handleSaveAward = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSubmissionId) {
      setError("Pilih karya submisi terlebih dahulu.");
      return;
    }

    setIsLoading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      if (editingAwardId) {
        const res = await updateJuryAwardAction({
          challengeId: challenge.id,
          awardId: editingAwardId,
          submissionId: selectedSubmissionId,
          categoryLabel: categoryLabel.trim() || null,
          confirmDuplicateSubmission,
        });

        if (res.requiresConfirmation) {
          setError(res.message);
          setIsLoading(false);
          return;
        }

        setSuccessMessage("Penghargaan juri berhasil diperbarui.");
        setEditingAwardId(null);
      } else {
        const res = await createJuryAwardAction({
          challengeId: challenge.id,
          submissionId: selectedSubmissionId,
          categoryLabel: categoryLabel.trim() || null,
          confirmDuplicateSubmission,
        });

        if (res.requiresConfirmation) {
          setError(res.message);
          setIsLoading(false);
          return;
        }

        setSuccessMessage("Penghargaan juri berhasil dicatat.");
      }

      setSelectedSubmissionId("");
      setCategoryLabel("");
      setConfirmDuplicateSubmission(false);
    } catch (err: any) {
      setError(err?.message || "Gagal menyimpan penghargaan juri.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleEditAward = (award: DraftAwardItem) => {
    setEditingAwardId(award.id);
    setSelectedSubmissionId(award.submissionId);
    setCategoryLabel(award.categoryLabel || "");
    setConfirmDuplicateSubmission(true);
    window.scrollTo({ top: 400, behavior: "smooth" });
  };

  const handleDeleteAward = async (awardId: string) => {
    if (!confirm("Hapus penghargaan dewan juri ini?")) return;
    setIsLoading(true);
    setError(null);
    try {
      await deleteJuryAwardAction({ challengeId: challenge.id, awardId });
      setSuccessMessage("Penghargaan juri berhasil dihapus.");
      if (editingAwardId === awardId) {
        setEditingAwardId(null);
        setSelectedSubmissionId("");
        setCategoryLabel("");
      }
    } catch (err: any) {
      setError(err?.message || "Gagal menghapus penghargaan.");
    } finally {
      setIsLoading(false);
    }
  };

  const handlePublish = async (publishCommunityOnly: boolean = false) => {
    if (isRevoked) {
      const reason = prompt("Masukkan alasan publikasi ulang hasil challenge:");
      if (!reason || reason.trim().length < 5) {
        setError("Alasan publikasi ulang harus diisi minimal 5 karakter.");
        return;
      }
      setIsLoading(true);
      setError(null);
      try {
        await republishChallengeResultsAction({
          challengeId: challenge.id,
          reason: reason.trim(),
        });
        alert("Hasil resmi berhasil dipublikasikan ulang ke Hall of Fame!");
      } catch (err: any) {
        setError(err?.message || "Gagal mempublikasikan ulang hasil.");
      } finally {
        setIsLoading(false);
      }
      return;
    }

    const confirmPrompt = publishCommunityOnly
      ? "Publikasikan pemenang komunitas saja (0 penghargaan juri) ke Hall of Fame?"
      : "Publikasikan seluruh hasil resmi dewan juri ke Hall of Fame?";

    if (!confirm(confirmPrompt)) return;

    setIsLoading(true);
    setError(null);
    try {
      await publishJuryResultsAction({
        challengeId: challenge.id,
        publishCommunityOnly,
      });
      alert("Hasil resmi berhasil dipublikasikan ke Hall of Fame!");
    } catch (err: any) {
      setError(err?.message || "Gagal mempublikasikan hasil.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancelChallenge = async () => {
    if (!cancelReason || cancelReason.trim().length < 5) {
      setError("Alasan pembatalan harus diisi minimal 5 karakter.");
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      if (isRevoked) {
        await cancelRevokedChallengeAction({
          challengeId: challenge.id,
          reason: cancelReason.trim(),
        });
      } else {
        await cancelJuryChallengeAction({
          challengeId: challenge.id,
          reason: cancelReason.trim(),
        });
      }
      alert("Challenge resmi dibatalkan.");
      setIsCancelModalOpen(false);
    } catch (err: any) {
      setError(err?.message || "Gagal membatalkan challenge.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSetRecorder = async (userId: string) => {
    if (!confirm("Tunjuk anggota juri ini sebagai Jury Recorder?")) return;
    setIsLoading(true);
    setError(null);
    try {
      await assignJuryRecorderAction({ challengeId: challenge.id, userId });
      setSuccessMessage("Jury Recorder berhasil ditetapkan.");
    } catch (err: any) {
      setError(err?.message || "Gagal menetapkan Jury Recorder.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddJuror = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!selectedNewJurorId) {
      setError("Pilih anggota yang ingin ditambahkan sebagai dewan juri.");
      return;
    }
    setIsLoading(true);
    setError(null);
    setSuccessMessage(null);
    try {
      await addJuryAssignmentAction({
        challengeId: challenge.id,
        targetUserId: selectedNewJurorId,
      });
      setSuccessMessage("Anggota dewan juri berhasil ditambahkan.");
      setSelectedNewJurorId("");
    } catch (err: any) {
      setError(err?.message || "Gagal menambahkan dewan juri.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleRemoveJuror = async (targetUserId: string, name: string) => {
    if (!confirm(`Hapus ${name} dari panel dewan juri?`)) return;
    setIsLoading(true);
    setError(null);
    setSuccessMessage(null);
    try {
      await removeJuryAssignmentAction({
        challengeId: challenge.id,
        targetUserId,
      });
      setSuccessMessage("Anggota dewan juri berhasil dihapus.");
    } catch (err: any) {
      setError(err?.message || "Gagal menghapus dewan juri.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleReplaceCommunityWinner = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replaceWinnerSubmissionId) {
      setError("Pilih karya pengganti Pemenang Komunitas.");
      return;
    }
    if (!replaceWinnerReason || replaceWinnerReason.trim().length < 5) {
      setError("Alasan penggantian pemenang komunitas harus diisi minimal 5 karakter.");
      return;
    }
    setIsLoading(true);
    setError(null);
    setSuccessMessage(null);
    try {
      await correctCommunityWinnerAction({
        challengeId: challenge.id,
        action: "replace",
        replacementSubmissionId: replaceWinnerSubmissionId,
        reason: replaceWinnerReason.trim(),
      });
      setSuccessMessage("Pemenang Komunitas berhasil diganti.");
      setReplaceWinnerSubmissionId("");
      setReplaceWinnerReason("");
    } catch (err: any) {
      setError(err?.message || "Gagal mengganti Pemenang Komunitas.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearCommunityWinner = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!confirmClearWinner) {
      setError("Centang konfirmasi penghapusan terlebih dahulu.");
      return;
    }
    if (!clearWinnerReason || clearWinnerReason.trim().length < 5) {
      setError("Alasan penghapusan pemenang komunitas harus diisi minimal 5 karakter.");
      return;
    }
    setIsLoading(true);
    setError(null);
    setSuccessMessage(null);
    try {
      await correctCommunityWinnerAction({
        challengeId: challenge.id,
        action: "clear",
        reason: clearWinnerReason.trim(),
      });
      setSuccessMessage("Status Pemenang Komunitas berhasil dihapus.");
      setClearWinnerReason("");
      setConfirmClearWinner(false);
    } catch (err: any) {
      setError(err?.message || "Gagal menghapus Pemenang Komunitas.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-10">
      {/* 1. Jury Panel Banner & Management */}
      <section className="glass-panel p-6 sm:p-8 rounded-3xl flex flex-col gap-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-display font-bold text-lg text-[#f6f2e9]">
                Panel Dewan Juri
              </h2>
              <p className="text-xs text-zinc-400 font-sans">
                {juryAssignments.length} Juri Terdaftar • {readiness.recorder ? "1 Jury Recorder Bertanggung Jawab" : "Belum Ada Recorder"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {juryAssignments.map((j) => (
              <div
                key={j.id}
                className={`px-3 py-1.5 rounded-2xl border text-xs font-mono flex items-center gap-2 ${
                  j.isRecorder
                    ? "bg-amber-500/15 border-amber-500/40 text-amber-300 font-bold"
                    : "bg-white/5 border-white/10 text-zinc-300"
                }`}
              >
                {j.isRecorder ? (
                  <Shield className="h-3.5 w-3.5 text-amber-400" />
                ) : (
                  <div className="h-2 w-2 rounded-full bg-zinc-500" />
                )}
                <span>{j.displayName}</span>
                {j.isRecorder ? (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 uppercase">
                    Recorder
                  </span>
                ) : isModOrAdmin ? (
                  <div className="flex items-center gap-1.5 ml-1">
                    <button
                      onClick={() => handleSetRecorder(j.userId)}
                      title="Tunjuk sebagai Recorder"
                      className="text-[10px] text-zinc-400 hover:text-amber-400 underline cursor-pointer"
                    >
                      Set Recorder
                    </button>
                    <button
                      onClick={() => handleRemoveJuror(j.userId, j.displayName)}
                      title="Hapus dari Dewan Juri"
                      className="text-[10px] text-zinc-500 hover:text-rose-400 cursor-pointer p-0.5"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>

        {/* Add Juror Control for Admin / Moderator */}
        {isModOrAdmin ? (
          <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <UserPlus className="h-4 w-4 text-amber-400" />
              <span className="text-xs font-mono text-zinc-200 font-bold">
                Tambah Anggota Dewan Juri:
              </span>
            </div>

            <div className="flex items-center gap-3 flex-1 max-w-md">
              <select
                value={selectedNewJurorId}
                onChange={(e) => setSelectedNewJurorId(e.target.value)}
                className="flex-1 px-3 py-2 min-h-[44px] rounded-xl bg-zinc-900 border border-white/10 text-white text-xs font-mono focus:outline-none focus:border-amber-500/60"
              >
                <option value="" className="bg-zinc-900 text-zinc-500">
                  -- Pilih Anggota Komunitas --
                </option>
                {availableMembers.map((m) => (
                  <option key={m.userId} value={m.userId} className="bg-zinc-900 text-white">
                    {m.displayName} (@{m.slug})
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={handleAddJuror}
                disabled={isLoading || !selectedNewJurorId}
                className="px-4 py-2 min-h-[44px] rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs font-mono transition-all flex items-center gap-1.5 disabled:opacity-50 cursor-pointer shrink-0"
              >
                {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                <span>Tambah</span>
              </button>
            </div>
          </div>
        ) : null}

        {/* Empty Panel Banner */}
        {juryAssignments.length === 0 ? (
          <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 shrink-0 text-amber-400" />
            <div className="flex flex-col gap-0.5">
              <span className="font-bold">Belum Ada Dewan Juri Ditugaskan</span>
              <p className="text-amber-200/80">
                Challenge ini belum memiliki anggota dewan juri. Tambahkan juri di atas dan tunjuk satu orang sebagai Jury Recorder untuk mengaktifkan sesi kurasi.
              </p>
            </div>
          </div>
        ) : !readiness.ready ? (
          /* Unready Banner for Missing Recorder */
          <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 shrink-0 text-rose-400" />
            <div className="flex flex-col gap-0.5">
              <span className="font-bold">Panel Juri Belum Siap Operasional</span>
              <p className="text-rose-200/80">{readiness.reason}</p>
            </div>
          </div>
        ) : null}
      </section>

      {/* 2a. Mixed Mode: Community Vote Winner Banner */}
      {challenge.awardMode === "vote_and_jury" && communityWinner ? (
        <section className="glass-panel p-6 sm:p-8 rounded-3xl border border-amber-500/20 bg-amber-500/[0.02] flex flex-col sm:flex-row sm:items-center justify-between gap-6">
          <div className="flex items-center gap-5">
            <div className="h-16 w-16 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
              <Crown className="h-8 w-8" />
            </div>
            <div className="flex flex-col gap-1">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-[11px] font-mono font-bold w-fit">
                <Crown className="h-3 w-3" />
                <span>JUARA FAVORIT KOMUNITAS</span>
              </div>
              <h3 className="font-display font-bold text-lg text-[#f6f2e9]">
                {communityWinner.title}
              </h3>
              <p className="text-xs text-zinc-400 font-sans">
                Oleh <span className="text-zinc-200 font-bold">{communityWinner.artistName}</span> • Meraih {communityWinner.totalCommunityStars} Stars pada voting komunitas.
              </p>
            </div>
          </div>

          <div className="px-4 py-2 rounded-2xl bg-white/5 border border-white/10 text-xs font-mono text-zinc-400">
            Dikecualikan dari Penjurian (Blueprint 2.2.1)
          </div>
        </section>
      ) : null}

      {/* 2b. Governance Correction Panel for Community Winner (RESULTS_REVOKED only) */}
      {isRevoked && isModOrAdmin && (challenge.awardMode === "vote_only" || challenge.awardMode === "vote_and_jury") ? (
        <section className="glass-panel p-6 sm:p-8 rounded-3xl border border-amber-500/30 bg-amber-500/[0.03] flex flex-col gap-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-2xl bg-amber-500/20 text-amber-400 flex items-center justify-center border border-amber-500/30">
                <Crown className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-display font-bold text-lg text-[#f6f2e9]">
                  Koreksi Tata Kelola: Pemenang Komunitas
                </h3>
                <p className="text-xs text-zinc-400 font-sans">
                  Status challenge <span className="font-mono text-rose-400">results_revoked</span>. Admin/Moderator dapat mengoreksi atau menghapus Pemenang Komunitas sebelum publikasi ulang.
                </p>
              </div>
            </div>

            {/* Current Community Winner Status Pill */}
            <div className="px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 text-xs font-mono flex items-center gap-2">
              <span className="text-zinc-400">Pemenang Saat Ini:</span>
              <span className="font-bold text-amber-300">
                {communityWinner ? `${communityWinner.title} (${communityWinner.totalCommunityStars} Stars)` : "Tidak Ada"}
              </span>
            </div>
          </div>

          {/* Governance Mode Tabs */}
          <div className="flex items-center gap-2 border-b border-white/10 pb-3">
            <button
              type="button"
              onClick={() => setActiveGovernanceTab("replace")}
              className={`px-4 py-2 rounded-xl text-xs font-mono font-bold transition-colors cursor-pointer ${
                activeGovernanceTab === "replace"
                  ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              Ganti Pemenang Komunitas
            </button>
            <button
              type="button"
              onClick={() => setActiveGovernanceTab("clear")}
              className={`px-4 py-2 rounded-xl text-xs font-mono font-bold transition-colors cursor-pointer ${
                activeGovernanceTab === "clear"
                  ? "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              Hapus Pemenang Komunitas
            </button>
          </div>

          {/* Tab 1: Replace Community Winner */}
          {activeGovernanceTab === "replace" ? (
            <form onSubmit={handleReplaceCommunityWinner} className="flex flex-col gap-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-mono text-zinc-300">PILIH KARYA PENGGANTI</label>
                  <select
                    value={replaceWinnerSubmissionId}
                    onChange={(e) => setReplaceWinnerSubmissionId(e.target.value)}
                    required
                    className="w-full px-4 py-3 rounded-xl bg-zinc-900 border border-white/10 text-white text-xs font-mono focus:outline-none focus:border-amber-500/60"
                  >
                    <option value="" className="bg-zinc-900 text-zinc-500">
                      -- Pilih Karya Pengganti --
                    </option>
                    {candidates.map((c) => {
                      const holdsAward =
                        challenge.awardMode === "vote_and_jury" &&
                        draftAwards.some((a) => a.submissionId === c.submissionId);
                      return (
                        <option
                          key={c.submissionId}
                          value={c.submissionId}
                          disabled={holdsAward}
                          className="bg-zinc-900 text-white"
                        >
                          {c.title} — {c.artistName} ({c.communityStars} Stars) {holdsAward ? "[Penerima Jury Award]" : ""}
                        </option>
                      );
                    })}
                  </select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-mono text-zinc-300">ALASAN KOREKSI (MIN. 5 KARAKTER)</label>
                  <input
                    type="text"
                    value={replaceWinnerReason}
                    onChange={(e) => setReplaceWinnerReason(e.target.value)}
                    required
                    placeholder="e.g. Koreksi penghitungan audit pasca diskualifikasi submisi #1 sebelumnya"
                    className="w-full px-4 py-3 rounded-xl bg-zinc-900 border border-white/10 text-white text-xs font-mono focus:outline-none focus:border-amber-500/60 placeholder:text-zinc-600"
                  />
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  disabled={isLoading || !replaceWinnerSubmissionId || replaceWinnerReason.trim().length < 5}
                  className="px-6 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs font-mono transition-all flex items-center gap-2 disabled:opacity-50 cursor-pointer shadow-lg shadow-amber-500/20"
                >
                  {isLoading ? <Loader2 className="h-4 w-4 animate-spin text-black" /> : <RefreshCw className="h-4 w-4 text-black" />}
                  <span>Tetapkan Pemenang Pengganti</span>
                </button>
              </div>
            </form>
          ) : (
            /* Tab 2: Clear Community Winner */
            <form onSubmit={handleClearCommunityWinner} className="flex flex-col gap-4">
              <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex flex-col gap-2">
                <span className="font-bold">Perhatian Tata Kelola:</span>
                <p className="text-rose-200/80">
                  Tindakan ini akan menghapus Pemenang Komunitas dari challenge ini. Pada mode vote_only, publikasi ulang tanpa pemenang hanya diizinkan jika total suara komunitas adalah 0.
                </p>
                <label className="flex items-center gap-2 pt-2 cursor-pointer text-white">
                  <input
                    type="checkbox"
                    checked={confirmClearWinner}
                    onChange={(e) => setConfirmClearWinner(e.target.checked)}
                    className="rounded border-rose-400 text-rose-500 focus:ring-rose-500"
                  />
                  <span>Saya mengonfirmasi penghapusan status Pemenang Komunitas.</span>
                </label>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-mono text-zinc-300">ALASAN PENGHAPUSAN (MIN. 5 KARAKTER)</label>
                <input
                  type="text"
                  value={clearWinnerReason}
                  onChange={(e) => setClearWinnerReason(e.target.value)}
                  required
                  placeholder="e.g. Pembatalan pemenang voting komunitas karena seluruh peserta didiskualifikasi"
                  className="w-full px-4 py-3 rounded-xl bg-zinc-900 border border-white/10 text-white text-xs font-mono focus:outline-none focus:border-rose-500/60 placeholder:text-zinc-600"
                />
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  disabled={isLoading || !confirmClearWinner || clearWinnerReason.trim().length < 5}
                  className="px-6 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs font-mono transition-all flex items-center gap-2 disabled:opacity-50 cursor-pointer shadow-lg shadow-rose-500/20"
                >
                  {isLoading ? <Loader2 className="h-4 w-4 animate-spin text-white" /> : <Trash2 className="h-4 w-4 text-white" />}
                  <span>Hapus Pemenang Komunitas</span>
                </button>
              </div>
            </form>
          )}
        </section>
      ) : null}

      {/* 3. Alerts / Messages */}
      {error ? (
        <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-zinc-400 hover:text-white text-xs">
            ✕
          </button>
        </div>
      ) : null}

      {successMessage ? (
        <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
            <span>{successMessage}</span>
          </div>
          <button onClick={() => setSuccessMessage(null)} className="text-zinc-400 hover:text-white text-xs">
            ✕
          </button>
        </div>
      ) : null}

      {/* 4. Active Draft Awards Table */}
      <section className="glass-panel p-6 sm:p-8 rounded-3xl flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <Award className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-display font-bold text-lg text-[#f6f2e9]">
                Daftar Penghargaan Dewan Juri ({draftAwards.length})
              </h3>
              <p className="text-xs text-zinc-400 font-sans">
                Kategori dinamis yang telah disepakati oleh dewan juri.
              </p>
            </div>
          </div>
        </div>

        {draftAwards.length === 0 ? (
          <div className="p-8 rounded-2xl bg-white/[0.02] border border-white/5 text-center text-xs text-zinc-500 font-mono">
            Belum ada penghargaan juri yang dicatat.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {draftAwards.map((award) => (
              <div
                key={award.id}
                className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 flex items-center justify-between gap-4"
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className="h-12 w-12 rounded-xl bg-zinc-800 border border-white/10 relative overflow-hidden shrink-0">
                    {award.thumbnailStorageKey ? (
                      <Image
                        src={`/api/media/public/${award.thumbnailStorageKey}`}
                        alt={award.title || "Karya"}
                        fill
                        sizes="48px"
                        className="object-cover"
                      />
                    ) : (
                      <div className="h-full w-full flex items-center justify-center text-zinc-600">
                        <Award className="h-5 w-5" />
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col gap-0.5 min-w-0">
                    <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-mono text-[11px] font-bold w-fit truncate">
                      {award.categoryLabel || "Jury Winner"}
                    </span>
                    <span className="text-xs font-bold text-white truncate">{award.title}</span>
                    <span className="text-[11px] text-zinc-400 truncate">Oleh {award.artistName}</span>
                  </div>
                </div>

                {canEditAwards ? (
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => handleEditAward(award)}
                      title="Edit Kategori / Karya"
                      className="p-2 rounded-xl hover:bg-white/10 text-zinc-400 hover:text-amber-400 transition-colors cursor-pointer"
                    >
                      <Edit2 className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleDeleteAward(award.id)}
                      title="Hapus Penghargaan"
                      className="p-2 rounded-xl hover:bg-red-500/10 text-zinc-400 hover:text-red-400 transition-colors cursor-pointer"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 5. Recorder Award Builder Form (For Recorder / Admin only) */}
      {canEditAwards ? (
        <section className="glass-panel p-6 sm:p-8 rounded-3xl flex flex-col gap-6">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              {editingAwardId ? <Edit2 className="h-5 w-5" /> : <Plus className="h-5 w-5" />}
            </div>
            <div>
              <h3 className="font-display font-bold text-lg text-[#f6f2e9]">
                {editingAwardId ? "Edit Penghargaan Dewan Juri" : "Catat Penghargaan Baru"}
              </h3>
              <p className="text-xs text-zinc-400 font-sans">
                Pilih karya terpilih dan tuliskan nama kategori penghargaan bebas (opsional).
              </p>
            </div>
          </div>

          <form onSubmit={handleSaveAward} className="flex flex-col gap-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Submission Selector */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-mono text-zinc-300">PILIH KARYA SUBMISI</label>
                <select
                  value={selectedSubmissionId}
                  onChange={(e) => {
                    setSelectedSubmissionId(e.target.value);
                    setConfirmDuplicateSubmission(false);
                  }}
                  required
                  className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white text-xs font-mono focus:outline-none focus:border-amber-500/60"
                >
                  <option value="" className="bg-zinc-900 text-zinc-500">
                    -- Pilih Karya --
                  </option>
                  {candidates
                    .filter((c) => !c.isCommunityWinner)
                    .map((c) => (
                      <option key={c.submissionId} value={c.submissionId} className="bg-zinc-900 text-white">
                        {c.title} — {c.artistName} ({c.communityStars} Stars)
                      </option>
                    ))}
                </select>
              </div>

              {/* Category Label Input */}
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-mono text-zinc-300">KATEGORI PENGHARGAAN (OPSIONAL)</label>
                  <span className="text-[10px] text-zinc-500 font-mono">Kosong = &quot;Jury Winner&quot;</span>
                </div>
                <input
                  type="text"
                  value={categoryLabel}
                  onChange={(e) => setCategoryLabel(e.target.value)}
                  placeholder="e.g. Best Lighting, Best Character Design, Pilihan Juri"
                  maxLength={100}
                  className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-zinc-600 focus:outline-none focus:border-amber-500/60 text-xs font-mono"
                />
              </div>
            </div>

            {/* Warnings */}
            {isDuplicateCategory ? (
              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" />
                <span>Peringatan: Kategori &quot;{categoryLabel.trim()}&quot; sudah digunakan pada karya lain dalam challenge ini.</span>
              </div>
            ) : null}

            {isDuplicateArtwork ? (
              <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-rose-400" />
                  <span className="font-bold">Karya ini sudah menerima penghargaan lain pada challenge ini.</span>
                </div>
                <label className="flex items-center gap-2 text-xs text-rose-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={confirmDuplicateSubmission}
                    onChange={(e) => setConfirmDuplicateSubmission(e.target.checked)}
                    className="rounded border-rose-400 text-amber-500 focus:ring-amber-500"
                  />
                  <span>Konfirmasi: Saya secara eksplisit menyetujui pemberian penghargaan ganda untuk karya ini.</span>
                </label>
              </div>
            ) : null}

            <div className="flex items-center justify-end gap-3 pt-2">
              {editingAwardId ? (
                <button
                  type="button"
                  onClick={() => {
                    setEditingAwardId(null);
                    setSelectedSubmissionId("");
                    setCategoryLabel("");
                    setConfirmDuplicateSubmission(false);
                  }}
                  className="px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-400 text-xs font-mono transition-all"
                >
                  Batal Edit
                </button>
              ) : null}

              <button
                type="submit"
                disabled={isLoading || (isDuplicateArtwork && !confirmDuplicateSubmission)}
                className="px-6 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs font-mono transition-all flex items-center gap-2 disabled:opacity-50 cursor-pointer shadow-lg shadow-amber-500/20"
              >
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Award className="h-4 w-4" />}
                <span>{editingAwardId ? "Simpan Perubahan" : "Simpan Penghargaan"}</span>
              </button>
            </div>
          </form>
        </section>
      ) : null}

      {/* 6. Candidate Gallery Overview */}
      <section className="glass-panel p-6 sm:p-8 rounded-3xl flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-display font-bold text-lg text-[#f6f2e9]">
                Galeri Karya Submisi Peserta ({candidates.length})
              </h3>
              <p className="text-xs text-zinc-400 font-sans">
                Seluruh karya peserta aktif yang memenuhi syarat kurasi juri.
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {candidates.map((cand) => (
            <div
              key={cand.submissionId}
              className={`p-3.5 rounded-2xl border flex flex-col gap-3 transition-all ${
                cand.isCommunityWinner
                  ? "bg-amber-500/5 border-amber-500/30 opacity-75"
                  : selectedSubmissionId === cand.submissionId
                  ? "bg-amber-500/10 border-amber-500/60 ring-1 ring-amber-500/50"
                  : "bg-white/[0.02] border-white/10 hover:border-white/20"
              }`}
            >
              <div className="aspect-square rounded-xl bg-zinc-900 border border-white/10 relative overflow-hidden">
                {cand.thumbnailStorageKey ? (
                  <Image
                    src={`/api/media/public/${cand.thumbnailStorageKey}`}
                    alt={cand.title || "Karya"}
                    fill
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                    className="object-cover"
                  />
                ) : (
                  <div className="h-full w-full flex items-center justify-center text-zinc-600 font-mono text-xs">
                    No Preview
                  </div>
                )}

                {cand.isCommunityWinner ? (
                  <div className="absolute top-2 left-2 px-2 py-1 rounded-lg bg-amber-500 text-black text-[10px] font-mono font-bold flex items-center gap-1 shadow">
                    <Crown className="h-3 w-3" />
                    <span>COMMUNITY WINNER</span>
                  </div>
                ) : (
                  <div className="absolute top-2 right-2 px-2 py-0.5 rounded-md bg-black/70 backdrop-blur text-amber-400 text-[10px] font-mono font-bold flex items-center gap-1 border border-white/10">
                    <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                    <span>{cand.communityStars}</span>
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-0.5">
                <span className="font-bold text-xs text-white truncate">{cand.title}</span>
                <span className="text-[11px] text-zinc-400 truncate">Oleh {cand.artistName}</span>
              </div>

              {canEditAwards && !cand.isCommunityWinner ? (
                <button
                  onClick={() => {
                    setSelectedSubmissionId(cand.submissionId);
                    setConfirmDuplicateSubmission(false);
                  }}
                  className={`mt-auto px-3 py-1.5 rounded-xl text-xs font-mono font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                    selectedSubmissionId === cand.submissionId
                      ? "bg-amber-500 text-black"
                      : "bg-white/5 hover:bg-white/10 text-zinc-300"
                  }`}
                >
                  <Award className="h-3.5 w-3.5" />
                  <span>{selectedSubmissionId === cand.submissionId ? "Terpilih" : "Beri Penghargaan"}</span>
                </button>
              ) : null}
            </div>
          ))}
        </div>
      </section>

      {/* 7. Publication & Cancellation Governance Panel */}
      {canPublishOrCancel ? (
        <section className="glass-panel p-6 sm:p-8 rounded-3xl border border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-6">
          <div className="flex flex-col gap-1">
            <h4 className="font-display font-bold text-base text-[#f6f2e9]">
              {isRevoked ? "Tata Kelola & Publikasi Ulang Hasil" : "Kontrol Publikasi Hasil Resmi"}
            </h4>
            <p className="text-xs text-zinc-400 font-sans">
              {isRevoked
                ? "Publikasikan ulang hasil yang telah dikoreksi ke Hall of Fame atau batalkan challenge secara permanen."
                : "Publikasikan penghargaan juri ke Hall of Fame atau batalkan challenge jika terjadi anomali kurasi."}
            </p>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            {/* Republish Button (For RESULTS_REVOKED) */}
            {isRevoked ? (
              <button
                onClick={() => handlePublish(false)}
                disabled={isLoading}
                className="px-6 py-3 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-xs font-mono transition-all flex items-center gap-2 shadow-lg shadow-emerald-500/20 cursor-pointer disabled:opacity-50"
              >
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin text-black" /> : <Sparkles className="h-4 w-4 text-black" />}
                <span>Publikasikan Ulang Hasil</span>
              </button>
            ) : (
              <>
                {/* Standard Publish Button */}
                {draftAwards.length >= 1 ? (
                  <button
                    onClick={() => handlePublish(false)}
                    disabled={isLoading}
                    className="px-6 py-3 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-xs font-mono transition-all flex items-center gap-2 shadow-lg shadow-emerald-500/20 cursor-pointer disabled:opacity-50"
                  >
                    {isLoading ? <Loader2 className="h-4 w-4 animate-spin text-black" /> : <Sparkles className="h-4 w-4 text-black" />}
                    <span>Publikasikan Hasil Penjurian</span>
                  </button>
                ) : null}

                {/* Publish Community Only Button (Strictly for mixed mode with Community Winner and 0 Jury Awards) */}
                {challenge.awardMode === "vote_and_jury" && communityWinner && draftAwards.length === 0 ? (
                  <button
                    onClick={() => handlePublish(true)}
                    disabled={isLoading}
                    className="px-6 py-3 rounded-2xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs font-mono transition-all flex items-center gap-2 shadow-lg shadow-amber-500/20 cursor-pointer disabled:opacity-50"
                  >
                    {isLoading ? <Loader2 className="h-4 w-4 animate-spin text-black" /> : <Crown className="h-4 w-4 text-black" />}
                    <span>Publikasikan Pemenang Komunitas Saja</span>
                  </button>
                ) : null}
              </>
            )}

            {/* Cancel Challenge Button */}
            <button
              onClick={() => setIsCancelModalOpen(true)}
              disabled={isLoading}
              className="px-5 py-3 rounded-2xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 font-bold text-xs font-mono transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <XCircle className="h-4 w-4 text-rose-400" />
              <span>Batalkan Challenge</span>
            </button>
          </div>
        </section>
      ) : null}

      {/* Cancellation Modal */}
      {isCancelModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="glass-panel p-6 sm:p-8 rounded-3xl max-w-lg w-full border border-rose-500/30 bg-zinc-950 flex flex-col gap-5">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-2xl bg-rose-500/20 text-rose-400 flex items-center justify-center">
                <XCircle className="h-6 w-6" />
              </div>
              <h3 className="font-display font-bold text-lg text-white">
                Batalkan Challenge
              </h3>
            </div>

            <p className="text-xs text-zinc-300 font-sans leading-relaxed">
              Pembatalan challenge akan menghentikan seluruh tahapan dan menandai challenge sebagai dibatalkan. Masukkan alasan pembatalan untuk riwayat audit:
            </p>

            <textarea
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              rows={3}
              placeholder="e.g. Pembatalan sesi penjurian karena tidak ada karya yang memenuhi standar tema..."
              className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-zinc-600 focus:outline-none focus:border-rose-500/60 text-xs font-sans resize-none"
            />

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setIsCancelModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-400 text-xs font-mono"
              >
                Tutup
              </button>
              <button
                type="button"
                onClick={handleCancelChallenge}
                disabled={isLoading || cancelReason.trim().length < 5}
                className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs font-mono transition-all disabled:opacity-50 cursor-pointer"
              >
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Konfirmasi Pembatalan"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
