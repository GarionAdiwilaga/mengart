"use client";

import { useState } from "react";
import { createReportAction } from "@/app/actions/moderation";
import { Flag, X, Loader2, CheckCircle2, AlertCircle } from "lucide-react";

interface ReportModalProps {
  targetType: "artwork" | "comment" | "user" | "challenge_submission";
  targetId: string;
  targetTitle: string;
}

export function ReportModal({ targetType, targetId, targetTitle }: ReportModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [reason, setReason] = useState<string>("ai_generated");
  const [details, setDetails] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    const formData = new FormData();
    formData.append("targetType", targetType);
    formData.append("targetId", targetId);
    formData.append("reason", reason);
    if (details) formData.append("details", details.trim());

    try {
      const res = await createReportAction(formData);
      if (res.success) {
        setIsSuccess(true);
        setTimeout(() => {
          setIsOpen(false);
          setIsSuccess(false);
        }, 2000);
      }
    } catch (err: any) {
      setError(err?.message || "Gagal mengirimkan laporan.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="p-2 rounded-xl bg-white/5 hover:bg-red-500/10 text-zinc-400 hover:text-red-400 text-xs font-mono transition-colors flex items-center gap-1.5 cursor-pointer"
      >
        <Flag className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Laporkan</span>
      </button>

      {isOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in">
          <div className="w-full max-w-md glass-panel-elevated p-6 sm:p-8 rounded-3xl border border-white/10 shadow-2xl flex flex-col gap-5">
            <div className="flex items-start justify-between border-b border-white/10 pb-3">
              <div>
                <span className="text-[10px] font-mono text-red-400 uppercase">MODERASI KOMUNITAS</span>
                <h3 className="font-display font-bold text-lg text-[#f6f2e9]">Laporkan Konten</h3>
                <p className="text-xs text-zinc-400 truncate max-w-xs">{targetTitle}</p>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {isSuccess ? (
              <div className="py-8 flex flex-col items-center justify-center text-center gap-2">
                <CheckCircle2 className="h-10 w-10 text-emerald-400" />
                <h4 className="font-display font-bold text-base text-emerald-300">
                  Laporan Berhasil Terkirim
                </h4>
                <p className="text-xs text-zinc-400 max-w-xs">
                  Tim kurator dan moderator kami akan segera meninjau laporan ini. Terima kasih telah menjaga integritas atelier.
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                {error ? (
                  <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
                    <span>{error}</span>
                  </div>
                ) : null}

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-mono text-zinc-300">ALASAN PELAPORAN</label>
                  <select
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-xs font-mono"
                  >
                    <option value="ai_generated" className="bg-zinc-900 text-white">
                      AI Generated (Melanggar aturan karya orisinal)
                    </option>
                    <option value="nsfw_unmarked" className="bg-zinc-900 text-white">
                      NSFW / Konten Sensitif Tanpa Penanda
                    </option>
                    <option value="copyright_infringement" className="bg-zinc-900 text-white">
                      Plagiarisme / Pelanggaran Hak Cipta
                    </option>
                    <option value="harassment" className="bg-zinc-900 text-white">
                      Pelecehan / Ujaran Kebencian
                    </option>
                    <option value="other" className="bg-zinc-900 text-white">
                      Alasan Lainnya
                    </option>
                  </select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-mono text-zinc-300">RINCIAN / BUKTI TAMBAHAN</label>
                  <textarea
                    value={details}
                    onChange={(e) => setDetails(e.target.value)}
                    rows={3}
                    placeholder="Jelaskan bagian mana yang melanggar ketentuan komunitas..."
                    className="w-full px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-xs font-sans resize-none"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full py-3 rounded-xl bg-red-500 hover:bg-red-400 text-white font-bold text-xs font-mono transition-all shadow-md shadow-red-500/20 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Flag className="h-4 w-4" />}
                  <span>Kirim Laporan</span>
                </button>
              </form>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
