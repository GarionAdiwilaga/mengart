"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Ban, Loader2 } from "lucide-react";
import { disqualifyChallengeCandidateAction } from "@/app/actions/challenges";
import { toast } from "sonner";

interface CandidateStaffDisqualifyButtonProps {
  submissionId: string;
  candidateTitle: string;
  challengeTitle?: string;
  isStaff: boolean;
}

export function CandidateStaffDisqualifyButton({
  submissionId,
  candidateTitle,
  challengeTitle,
  isStaff,
}: CandidateStaffDisqualifyButtonProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  if (!isStaff) return null;

  const handleDisqualify = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const reason = prompt(
      `Alasan diskualifikasi untuk "${candidateTitle}" ${
        challengeTitle ? `dalam challenge "${challengeTitle}"` : ""
      }:`,
      "Melanggar ketentuan submisi challenge."
    );
    if (reason === null) return;
    if (reason.trim().length < 5) {
      toast.error("Alasan diskualifikasi wajib diisi minimal 5 karakter.");
      return;
    }

    setIsLoading(true);
    try {
      await disqualifyChallengeCandidateAction(submissionId, reason.trim());
      toast.success(`Submisi "${candidateTitle}" telah didiskualifikasi.`);
      router.refresh();
    } catch (err: any) {
      toast.error(err?.message || "Gagal mendiskualifikasi karya.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleDisqualify}
      disabled={isLoading}
      title="Diskualifikasi submisi ini (Staff Only)"
      aria-label={`Diskualifikasi submisi ${candidateTitle}`}
      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 min-h-[36px] rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 text-[11px] font-mono transition-colors cursor-pointer disabled:opacity-50"
    >
      {isLoading ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <Ban className="h-3.5 w-3.5" />
      )}
      <span>Diskualifikasi</span>
    </button>
  );
}
