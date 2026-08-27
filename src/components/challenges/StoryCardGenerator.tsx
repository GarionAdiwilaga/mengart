"use client";

import { useState, useRef } from "react";
import {
  Download,
  Share2,
  Sparkles,
  Trophy,
  Crown,
  Calendar,
  Star,
  Palette,
  X,
  Loader2,
  Image as ImageIcon,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";

export interface StoryCardPodiumWinner {
  rank: number;
  title: string;
  artistName: string;
  artistSlug: string;
  starsCount: number;
  imageUrl?: string | null;
  awardTitle?: string;
}

export interface StoryCardProps {
  challenge: {
    title: string;
    slug: string;
    theme: string;
    description: string;
    promptRules?: string | null;
    submissionDeadline?: string | Date | null;
    status: string;
  };
  winners?: StoryCardPodiumWinner[];
  defaultMode?: "announcement" | "results";
}

export function StoryCardGenerator({
  challenge,
  winners = [],
  defaultMode = "results",
}: StoryCardProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [cardMode, setCardMode] = useState<"announcement" | "results">(defaultMode);
  const [isExporting, setIsExporting] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  const formattedDeadline = challenge.submissionDeadline
    ? new Intl.DateTimeFormat("id-ID", {
        timeZone: "Asia/Makassar",
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(challenge.submissionDeadline)) + " WITA"
    : "Batas Waktu Segera Diumumkan";

  const goldWinner = winners.find((w) => w.rank === 1);
  const silverWinner = winners.find((w) => w.rank === 2);
  const bronzeWinner = winners.find((w) => w.rank === 3);
  const juryWinner = winners.find((w) => w.awardTitle?.includes("Juri") || w.awardTitle?.includes("Jury"));

  const handleExportPng = async () => {
    setIsExporting(true);
    try {
      // Dynamic Canvas Rasterizer
      const canvas = document.createElement("canvas");
      canvas.width = 1080;
      canvas.height = 1920;
      const ctx = canvas.getContext("2d");

      if (!ctx) throw new Error("Gagal menginisialisasi canvas rendering context.");

      // 1. Draw Obsidian Canvas Background
      const bgGrad = ctx.createLinearGradient(0, 0, 1080, 1920);
      bgGrad.addColorStop(0, "#0e1015");
      bgGrad.addColorStop(0.5, "#13161d");
      bgGrad.addColorStop(1, "#0a0c10");
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, 1080, 1920);

      // 2. Draw Subtle Amber Glow at the top & bottom
      const glowTop = ctx.createRadialGradient(540, 200, 50, 540, 200, 600);
      glowTop.addColorStop(0, "rgba(245, 158, 11, 0.15)");
      glowTop.addColorStop(1, "transparent");
      ctx.fillStyle = glowTop;
      ctx.fillRect(0, 0, 1080, 800);

      // 3. Draw Outer Border Hairline
      ctx.strokeStyle = "rgba(255, 255, 255, 0.12)";
      ctx.lineWidth = 4;
      ctx.strokeRect(40, 40, 1000, 1840);

      // 4. Draw Header Logo & Capsule
      ctx.fillStyle = "#f59e0b";
      ctx.font = "bold 32px 'JetBrains Mono', monospace";
      ctx.fillText("MENGART ATELIER", 80, 120);

      ctx.fillStyle = "#a1a1aa";
      ctx.font = "24px 'Plus Jakarta Sans', sans-serif";
      ctx.fillText("KOMUNITAS KREATOR DIGITAL PRIVAT", 80, 160);

      // 5. Draw Content based on Card Mode
      if (cardMode === "announcement") {
        // Tag Capsule
        ctx.fillStyle = "rgba(245, 158, 11, 0.15)";
        ctx.strokeStyle = "rgba(245, 158, 11, 0.4)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(80, 240, 420, 60, 30);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = "#fbbf24";
        ctx.font = "bold 24px 'JetBrains Mono', monospace";
        ctx.fillText(`TEMA: ${challenge.theme.toUpperCase()}`, 110, 280);

        // Challenge Title
        ctx.fillStyle = "#f6f2e9";
        ctx.font = "bold 64px 'Syne', sans-serif";
        ctx.fillText(challenge.title, 80, 400, 920);

        // Description
        ctx.fillStyle = "#d4d4d8";
        ctx.font = "32px 'Plus Jakarta Sans', sans-serif";
        ctx.fillText(challenge.description.slice(0, 140) + "...", 80, 480, 920);

        // Deadline Box
        ctx.fillStyle = "rgba(255, 255, 255, 0.04)";
        ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(80, 600, 920, 240, 32);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = "#f59e0b";
        ctx.font = "bold 28px 'JetBrains Mono', monospace";
        ctx.fillText("BATAS WAKTU SUBMISI KARYA (WITA)", 120, 670);

        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 44px 'Plus Jakarta Sans', sans-serif";
        ctx.fillText(formattedDeadline, 120, 750);

        // Rules Box
        ctx.fillStyle = "rgba(255, 255, 255, 0.04)";
        ctx.beginPath();
        ctx.roundRect(80, 880, 920, 600, 32);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = "#f59e0b";
        ctx.font = "bold 28px 'JetBrains Mono', monospace";
        ctx.fillText("KETENTUAN & SISTEM VOTING", 120, 950);

        ctx.fillStyle = "#e4e4e7";
        ctx.font = "28px 'Plus Jakarta Sans', sans-serif";
        ctx.fillText("• Terbuka untuk seluruh member terverifikasi atelier.", 120, 1020);
        ctx.fillText("• Format: Ilustrasi digital 2D, 3D render, atau motion.", 120, 1080);
        ctx.fillText("• Sistem alokasi 3 Stars per member tanpa bias urutan.", 120, 1140);
        ctx.fillText("• Penghargaan Juara 1-3 & Pilihan Kurasi Dewan Juri.", 120, 1200);

        // CTA Footer
        ctx.fillStyle = "#f59e0b";
        ctx.font = "bold 36px 'Syne', sans-serif";
        ctx.fillText("Kirim Karyamu di: mengart.local/challenges", 80, 1680);
      } else {
        // Mode 2: Results & Podium
        ctx.fillStyle = "rgba(245, 158, 11, 0.15)";
        ctx.strokeStyle = "rgba(245, 158, 11, 0.4)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(80, 240, 480, 60, 30);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = "#fbbf24";
        ctx.font = "bold 24px 'JetBrains Mono', monospace";
        ctx.fillText("HASIL RESMI & HALL OF FAME", 110, 280);

        ctx.fillStyle = "#f6f2e9";
        ctx.font = "bold 56px 'Syne', sans-serif";
        ctx.fillText(challenge.title, 80, 380, 920);

        // Gold Winner #1 Card
        ctx.fillStyle = "rgba(245, 158, 11, 0.08)";
        ctx.strokeStyle = "rgba(245, 158, 11, 0.5)";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.roundRect(80, 460, 920, 420, 32);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = "#f59e0b";
        ctx.font = "bold 28px 'JetBrains Mono', monospace";
        ctx.fillText("👑 JUARA 1 FAVORIT KOMUNITAS", 120, 530);

        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 44px 'Syne', sans-serif";
        ctx.fillText(goldWinner ? `"${goldWinner.title}"` : "Karya Terpilih", 120, 610, 840);

        ctx.fillStyle = "#f59e0b";
        ctx.font = "bold 32px 'Plus Jakarta Sans', sans-serif";
        ctx.fillText(goldWinner ? `oleh ${goldWinner.artistName} (@${goldWinner.artistSlug})` : "Artist Komunitas", 120, 680);

        ctx.fillStyle = "#a1a1aa";
        ctx.font = "28px 'JetBrains Mono', monospace";
        ctx.fillText(goldWinner ? `⭐ Total Suara: ${goldWinner.starsCount} Stars` : "⭐ 0 Stars", 120, 750);

        // Silver & Bronze Cards
        if (silverWinner) {
          ctx.fillStyle = "rgba(255, 255, 255, 0.04)";
          ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.roundRect(80, 920, 920, 220, 28);
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = "#cbd5e1";
          ctx.font = "bold 24px 'JetBrains Mono', monospace";
          ctx.fillText("🥈 JUARA 2", 120, 975);

          ctx.fillStyle = "#ffffff";
          ctx.font = "bold 34px 'Syne', sans-serif";
          ctx.fillText(`"${silverWinner.title}" - ${silverWinner.artistName}`, 120, 1035, 840);

          ctx.fillStyle = "#94a3b8";
          ctx.font = "24px 'JetBrains Mono', monospace";
          ctx.fillText(`⭐ ${silverWinner.starsCount} Stars`, 120, 1090);
        }

        if (bronzeWinner) {
          ctx.fillStyle = "rgba(255, 255, 255, 0.04)";
          ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.roundRect(80, 1180, 920, 220, 28);
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = "#d97706";
          ctx.font = "bold 24px 'JetBrains Mono', monospace";
          ctx.fillText("🥉 JUARA 3", 120, 1235);

          ctx.fillStyle = "#ffffff";
          ctx.font = "bold 34px 'Syne', sans-serif";
          ctx.fillText(`"${bronzeWinner.title}" - ${bronzeWinner.artistName}`, 120, 1295, 840);

          ctx.fillStyle = "#94a3b8";
          ctx.font = "24px 'JetBrains Mono', monospace";
          ctx.fillText(`⭐ ${bronzeWinner.starsCount} Stars`, 120, 1350);
        }

        // Jury Award Box
        if (juryWinner) {
          ctx.fillStyle = "rgba(168, 85, 247, 0.08)";
          ctx.strokeStyle = "rgba(168, 85, 247, 0.4)";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.roundRect(80, 1440, 920, 200, 28);
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = "#c084fc";
          ctx.font = "bold 24px 'JetBrains Mono', monospace";
          ctx.fillText("🎖️ PILIHAN DEWAN JURI ATELIER", 120, 1495);

          ctx.fillStyle = "#ffffff";
          ctx.font = "bold 32px 'Syne', sans-serif";
          ctx.fillText(`"${juryWinner.title}" - ${juryWinner.artistName}`, 120, 1555, 840);
        }

        // Footer Handle
        ctx.fillStyle = "#a1a1aa";
        ctx.font = "26px 'JetBrains Mono', monospace";
        ctx.fillText("Arsip Lengkap: mengart.local/challenges", 80, 1780);
      }

      // 6. Download Trigger
      const dataUrl = canvas.toDataURL("image/png");
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `mengart-story-${challenge.slug}-${cardMode}.png`;
      a.click();

      toast.success("9:16 Story Card berhasil diunduh (1080×1920 px)!");
    } catch (err: any) {
      toast.error(err?.message || "Gagal menghasilkan Story Card.");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <>
      {/* Trigger Button */}
      <button
        onClick={() => setIsOpen(true)}
        className="px-4 py-2.5 min-h-[44px] rounded-2xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-300 font-mono text-xs font-bold transition-all shadow-md flex items-center gap-2 cursor-pointer"
      >
        <Share2 className="h-4 w-4" />
        <span>Ekspor 9:16 Story Card</span>
      </button>

      {/* Modal Dialog / Mobile Bottom Sheet */}
      <AnimatePresence>
        {isOpen ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
            <div className="fixed inset-0" onClick={() => setIsOpen(false)} />

            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="w-full max-w-xl glass-panel-elevated p-6 sm:p-8 rounded-3xl border border-white/15 shadow-2xl relative z-10 max-h-[92vh] overflow-y-auto flex flex-col gap-6"
            >
              {/* Header */}
              <div className="flex items-center justify-between border-b border-white/10 pb-4">
                <div className="flex items-center gap-2.5">
                  <div className="h-9 w-9 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
                    <ImageIcon className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="font-display font-bold text-lg text-[#f6f2e9]">
                      9:16 Story Card Generator
                    </h3>
                    <p className="text-xs text-zinc-400">
                      Format 1080 × 1920 px untuk Instagram Stories & WhatsApp Status.
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => setIsOpen(false)}
                  className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Mode Switcher Tabs */}
              <div className="flex items-center p-1 rounded-2xl bg-white/5 border border-white/10">
                <button
                  onClick={() => setCardMode("announcement")}
                  className={`flex-1 py-2 rounded-xl text-xs font-mono font-medium transition-all ${
                    cardMode === "announcement"
                      ? "bg-amber-500 text-black font-bold shadow-md shadow-amber-500/20"
                      : "text-zinc-400 hover:text-white"
                  }`}
                >
                  Pengumuman Challenge
                </button>
                <button
                  onClick={() => setCardMode("results")}
                  className={`flex-1 py-2 rounded-xl text-xs font-mono font-medium transition-all ${
                    cardMode === "results"
                      ? "bg-amber-500 text-black font-bold shadow-md shadow-amber-500/20"
                      : "text-zinc-400 hover:text-white"
                  }`}
                >
                  Hasil Resmi & Podium
                </button>
              </div>

              {/* Live Card Preview (Scaled down to 9:16 aspect ratio preview) */}
              <div
                ref={cardRef}
                className="w-full max-w-[270px] aspect-[9/16] mx-auto rounded-3xl bg-[#0e1015] border-2 border-amber-500/40 p-4 flex flex-col justify-between shadow-2xl relative overflow-hidden text-left select-none"
              >
                {/* Background Glow */}
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-32 bg-amber-500/20 rounded-full blur-2xl pointer-events-none" />

                {/* Top Branding */}
                <div className="flex flex-col gap-1 relative z-10">
                  <div className="flex items-center gap-1.5 text-[10px] font-mono font-bold text-amber-400">
                    <Palette className="h-3 w-3" />
                    <span>MENGART ATELIER</span>
                  </div>

                  <span className="inline-flex px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-300 text-[8px] font-mono w-fit uppercase">
                    {cardMode === "announcement" ? `TEMA: ${challenge.theme}` : "HASIL & PODIUM RESMI"}
                  </span>
                </div>

                {/* Middle Content */}
                <div className="flex flex-col gap-2 relative z-10">
                  <h4 className="font-display font-extrabold text-sm text-[#f6f2e9] leading-tight line-clamp-2">
                    {challenge.title}
                  </h4>

                  {cardMode === "announcement" ? (
                    <div className="flex flex-col gap-1.5 bg-white/5 p-2 rounded-xl border border-white/10 text-[9px] font-sans">
                      <span className="font-mono text-amber-400 font-bold text-[8px]">
                        DEADLINE (WITA):
                      </span>
                      <span className="text-white font-medium line-clamp-1">
                        {formattedDeadline}
                      </span>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-1.5 bg-amber-500/10 p-2.5 rounded-xl border border-amber-500/30 text-[9px]">
                      <span className="font-mono text-amber-400 font-bold text-[8px] flex items-center gap-1">
                        <Crown className="h-2.5 w-2.5 text-amber-400" />
                        <span>JUARA 1 KOMUNITAS:</span>
                      </span>
                      <span className="font-display font-bold text-white line-clamp-1">
                        {goldWinner ? goldWinner.title : "Karya Terpilih"}
                      </span>
                      <span className="text-zinc-300 text-[8px] font-mono">
                        {goldWinner ? `@${goldWinner.artistSlug}` : "@artist"} · {goldWinner?.starsCount || 0} ⭐
                      </span>
                    </div>
                  )}
                </div>

                {/* Bottom Footer */}
                <div className="flex items-center justify-between text-[8px] font-mono text-zinc-500 relative z-10 border-t border-white/10 pt-2">
                  <span>9:16 STORY CARD</span>
                  <span className="text-amber-400">mengart.local</span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-white/10">
                <button
                  onClick={() => setIsOpen(false)}
                  className="px-4 py-2.5 rounded-xl bg-white/5 text-zinc-400 hover:text-white text-xs font-mono"
                >
                  Tutup
                </button>

                <button
                  onClick={handleExportPng}
                  disabled={isExporting}
                  className="px-6 py-2.5 min-h-[44px] rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs font-mono transition-all shadow-md shadow-amber-500/20 flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {isExporting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin text-black" />
                      <span>Merender PNG 1080×1920...</span>
                    </>
                  ) : (
                    <>
                      <Download className="h-4 w-4" />
                      <span>Unduh Story Card (PNG)</span>
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        ) : null}
      </AnimatePresence>
    </>
  );
}
