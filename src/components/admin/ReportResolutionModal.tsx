"use client";

import { useState } from "react";
import { resolveReportAction } from "@/app/actions/moderation";
import { ShieldCheck, XCircle, Trash2, Ban, Loader2, CheckCircle2 } from "lucide-react";

interface ReportResolutionModalProps {
  reportId: string;
  targetType: string;
  targetId: string;
  reason: string;
}

export function ReportResolutionModal({
  reportId,
  targetType,
  targetId,
  reason,
}: ReportResolutionModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [resolutionNotes, setResolutionNotes] = useState("");
  const [enforceAction, setEnforceAction] = useState<"takedown_artwork" | "suspend_user" | undefined>(
    undefined
  );
  const [isLoading, setIsLoading] = useState(false);

  const handleResolve = async (status: "resolved" | "dismissed") => {
    if (!resolutionNotes.trim()) {
      alert("Harap masukkan catatan resolusi tindakan moderator.");
      return;
    }

    setIsLoading(true);
    try {
      await resolveReportAction(reportId, status, resolutionNotes.trim(), enforceAction);
      setIsOpen(false);
    } catch (err: any) {
      alert(err?.message || "Gagal menyelesaikan laporan.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="px-3 py-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 text-xs font-mono font-semibold transition-colors cursor-pointer"
      >
        Tinjau & Tindak
      </button>

      {isOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in">
          <div className="w-full max-w-lg glass-panel-elevated p-6 sm:p-8 rounded-3xl border border-white/10 shadow-2xl flex flex-col gap-5">
            <div className="flex items-start justify-between border-b border-white/10 pb-3">
              <div>
                <span className="text-[10px] font-mono text-amber-400 uppercase">TINDAKAN MODERASI</span>
                <h3 className="font-display font-bold text-lg text-[#f6f2e9]">Resolusi Laporan</h3>
                <p className="text-xs text-zinc-400">
                  Target: {targetType} • Alasan: {reason}
                </p>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="flex flex-col gap-3 text-xs">
              <label className="font-mono text-zinc-300">OPSI PENEGAKAN SANKSI:</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 font-mono">
                {targetType === "artwork" ? (
                  <button
                    type="button"
                    onClick={() =>
                      setEnforceAction(enforceAction === "takedown_artwork" ? undefined : "takedown_artwork")
                    }
                    className={`p-3 rounded-xl border flex items-center gap-2 transition-all cursor-pointer ${
                      enforceAction === "takedown_artwork"
                        ? "bg-red-500/20 border-red-500 text-red-300 font-bold"
                        : "bg-white/5 border-white/10 text-zinc-400 hover:text-white"
                    }`}
                  >
                    <Trash2 className="h-4 w-4" />
                    <span>Take Down Karya</span>
                  </button>
                ) : null}

                <button
                  type="button"
                  onClick={() =>
                    setEnforceAction(enforceAction === "suspend_user" ? undefined : "suspend_user")
                  }
                  className={`p-3 rounded-xl border flex items-center gap-2 transition-all cursor-pointer ${
                    enforceAction === "suspend_user"
                      ? "bg-red-500/20 border-red-500 text-red-300 font-bold"
                      : "bg-white/5 border-white/10 text-zinc-400 hover:text-white"
                  }`}
                >
                  <Ban className="h-4 w-4" />
                  <span>Suspend Akun</span>
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-mono text-zinc-300">CATATAN RESOLUSI MODERATOR</label>
              <textarea
                value={resolutionNotes}
                onChange={(e) => setResolutionNotes(e.target.value)}
                rows={3}
                required
                placeholder="Tuliskan temuan investigasi, alasan keputusan, atau tindakan yang diambil..."
                className="w-full px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-xs font-sans resize-none"
              />
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-white/10">
              <button
                type="button"
                onClick={() => handleResolve("dismissed")}
                disabled={isLoading}
                className="px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white text-xs font-mono transition-colors cursor-pointer"
              >
                Abaikan (Non-Pelanggaran)
              </button>

              <button
                type="button"
                onClick={() => handleResolve("resolved")}
                disabled={isLoading}
                className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs font-mono transition-all shadow-md shadow-amber-500/20 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                <span>Terapkan Sanksi & Selesaikan</span>
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
