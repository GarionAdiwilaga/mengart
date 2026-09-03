"use client";

import { useState, useRef } from "react";
import {
  Download,
  Share2,
  Sparkles,
  Trophy,
  Crown,
  Calendar,
  X,
  Loader2,
  Image as ImageIcon,
  Award,
  Check,
} from "lucide-react";
import { toast } from "sonner";

export interface StoryCardWinnerItem {
  title: string;
  artistName: string;
  artistSlug: string;
  starsCount?: number;
  imageUrl?: string | null;
  awardType: "community_vote_winner" | "jury_award" | "participant";
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
  winners?: StoryCardWinnerItem[];
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
  const [isSharing, setIsSharing] = useState(false);

  // Primary Winner for Results Mode (Community Winner or Jury Winner)
  const primaryWinner =
    winners.find((w) => w.awardType === "community_vote_winner") ||
    winners.find((w) => w.awardType === "jury_award") ||
    winners[0];

  const formattedDeadline = challenge.submissionDeadline
    ? new Intl.DateTimeFormat("id-ID", {
        timeZone: "Asia/Makassar",
        day: "numeric",
        month: "long",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(challenge.submissionDeadline)) + " WITA"
    : "Batas Waktu Segera Diumumkan";

  const renderCanvas = async (): Promise<HTMLCanvasElement> => {
    const canvas = document.createElement("canvas");
    canvas.width = 1080;
    canvas.height = 1920;
    const ctx = canvas.getContext("2d");

    if (!ctx) throw new Error("Gagal menginisialisasi canvas context.");

    // 1. Draw Obsidian Gradient Canvas Background
    const bgGrad = ctx.createLinearGradient(0, 0, 1080, 1920);
    bgGrad.addColorStop(0, "#0e1015");
    bgGrad.addColorStop(0.5, "#141720");
    bgGrad.addColorStop(1, "#0a0c10");
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, 1080, 1920);

    // 2. Draw Subtle Amber Radial Glow
    const glowTop = ctx.createRadialGradient(540, 240, 40, 540, 240, 700);
    glowTop.addColorStop(0, "rgba(245, 158, 11, 0.18)");
    glowTop.addColorStop(1, "transparent");
    ctx.fillStyle = glowTop;
    ctx.fillRect(0, 0, 1080, 900);

    // 3. Draw Outer Border Hairline
    ctx.strokeStyle = "rgba(255, 255, 255, 0.12)";
    ctx.lineWidth = 4;
    ctx.strokeRect(48, 48, 984, 1824);

    // 4. Draw Atelier Brand Header
    ctx.fillStyle = "#f59e0b";
    ctx.font = "bold 32px monospace";
    ctx.fillText("MENGART ATELIER", 96, 130);

    ctx.fillStyle = "#a1a1aa";
    ctx.font = "24px sans-serif";
    ctx.fillText("KOMUNITAS KREATOR DIGITAL PRIVAT", 96, 170);

    // 5. Draw Content based on Card Mode
    if (cardMode === "announcement") {
      // Theme Tag Capsule
      ctx.fillStyle = "rgba(245, 158, 11, 0.15)";
      ctx.strokeStyle = "rgba(245, 158, 11, 0.4)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(96, 260, 460, 64, 32);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = "#fbbf24";
      ctx.font = "bold 24px monospace";
      ctx.fillText(`TEMA: ${challenge.theme.toUpperCase()}`, 126, 302);

      // Challenge Title
      ctx.fillStyle = "#f6f2e9";
      ctx.font = "bold 60px sans-serif";
      ctx.fillText(challenge.title, 96, 420, 888);

      // Description Box
      ctx.fillStyle = "rgba(255, 255, 255, 0.04)";
      ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(96, 500, 888, 300, 32);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = "#d4d4d8";
      ctx.font = "32px sans-serif";
      const descLines = wrapText(ctx, challenge.description, 800);
      descLines.slice(0, 4).forEach((line, i) => {
        ctx.fillText(line, 140, 570 + i * 48, 800);
      });

      // Deadline Box
      ctx.fillStyle = "rgba(245, 158, 11, 0.08)";
      ctx.strokeStyle = "rgba(245, 158, 11, 0.4)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.roundRect(96, 860, 888, 240, 32);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = "#f59e0b";
      ctx.font = "bold 28px monospace";
      ctx.fillText("BATAS WAKTU SUBMISI KARYA (WITA)", 140, 930);

      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 44px sans-serif";
      ctx.fillText(formattedDeadline, 140, 1010, 800);

      // Participation Prompt Box
      ctx.fillStyle = "rgba(255, 255, 255, 0.04)";
      ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(96, 1160, 888, 320, 32);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = "#fbbf24";
      ctx.font = "bold 28px sans-serif";
      ctx.fillText("KETENTUAN KARYA:", 140, 1230);

      ctx.fillStyle = "#cbd5e1";
      ctx.font = "26px sans-serif";
      ctx.fillText("• Terbuka untuk seluruh anggota aktif Atelier", 140, 1290);
      ctx.fillText("• Format: JPEG, PNG, WebP (maks 25MB) atau MP4 (maks 50MB)", 140, 1340);
      ctx.fillText("• Hak cipta master karya sepenuhnya milik kreator", 140, 1390);

      // Footer
      ctx.fillStyle = "#a1a1aa";
      ctx.font = "26px monospace";
      ctx.fillText("Ikuti Tantangan: mengart.local/challenges", 96, 1780);
    } else {
      // Results Mode: Title & Award Metadata (Zero Numeric Ranks)
      const awardLabel =
        primaryWinner?.awardTitle ||
        (primaryWinner?.awardType === "community_vote_winner"
          ? "Juara Favorit Komunitas"
          : primaryWinner?.awardType === "jury_award"
          ? "Penghargaan Juri Atelier"
          : "Pemenang Challenge");

      // Challenge Badge
      ctx.fillStyle = "rgba(245, 158, 11, 0.15)";
      ctx.strokeStyle = "rgba(245, 158, 11, 0.4)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(96, 250, 480, 60, 30);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = "#fbbf24";
      ctx.font = "bold 24px monospace";
      ctx.fillText("HASIL RESMI CHALLENGE", 130, 290);

      // Challenge Title
      ctx.fillStyle = "#f6f2e9";
      ctx.font = "bold 52px sans-serif";
      ctx.fillText(challenge.title, 96, 380, 888);

      // Winner Showcase Card
      ctx.fillStyle = "rgba(255, 255, 255, 0.04)";
      ctx.strokeStyle = "rgba(245, 158, 11, 0.5)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.roundRect(96, 440, 888, 1100, 36);
      ctx.fill();
      ctx.stroke();

      // Award Label (Unranked)
      ctx.fillStyle = "#f59e0b";
      ctx.font = "bold 32px monospace";
      ctx.fillText(`🏆 ${awardLabel.toUpperCase()}`, 140, 520);

      // Artwork Title
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 48px sans-serif";
      ctx.fillText(
        primaryWinner ? `"${primaryWinner.title}"` : "Karya Pemenang",
        140,
        600,
        800
      );

      // Artist Display Name
      ctx.fillStyle = "#fbbf24";
      ctx.font = "bold 36px sans-serif";
      ctx.fillText(
        primaryWinner
          ? `oleh ${primaryWinner.artistName} (@${primaryWinner.artistSlug})`
          : "Kreator Atelier",
        140,
        670,
        800
      );

      // Artwork Image (if available)
      if (primaryWinner?.imageUrl) {
        try {
          const img = await loadImage(primaryWinner.imageUrl);
          ctx.save();
          ctx.beginPath();
          ctx.roundRect(140, 720, 800, 720, 24);
          ctx.clip();
          ctx.drawImage(img, 140, 720, 800, 720);
          ctx.restore();
        } catch (_e) {
          // Fallback placeholder box
          ctx.fillStyle = "rgba(255, 255, 255, 0.06)";
          ctx.fillRect(140, 720, 800, 720);
          ctx.fillStyle = "#71717a";
          ctx.font = "28px sans-serif";
          ctx.fillText("Pratinjau Visual Karya", 420, 1080);
        }
      } else {
        ctx.fillStyle = "rgba(255, 255, 255, 0.06)";
        ctx.fillRect(140, 720, 800, 720);
        ctx.fillStyle = "#71717a";
        ctx.font = "28px sans-serif";
        ctx.fillText("Pratinjau Visual Karya", 420, 1080);
      }

      // Footer Link
      ctx.fillStyle = "#a1a1aa";
      ctx.font = "26px monospace";
      ctx.fillText("Hall of Fame: mengart.local/challenges", 96, 1780);
    }

    return canvas;
  };

  const handleDownloadPng = async () => {
    setIsExporting(true);
    try {
      const canvas = await renderCanvas();
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/png")
      );
      if (!blob) throw new Error("Gagal mengekspor berkas PNG.");

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `mengart-story-${challenge.slug}-${cardMode}.png`;
      a.click();
      URL.revokeObjectURL(url);

      toast.success("9:16 Story Card berhasil diunduh (1080×1920 px)!");
    } catch (err: any) {
      toast.error(err?.message || "Gagal menghasilkan Story Card.");
    } finally {
      setIsExporting(false);
    }
  };

  const handleWebShare = async () => {
    setIsSharing(true);
    try {
      const canvas = await renderCanvas();
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/png")
      );
      if (!blob) throw new Error("Gagal menyiapkan gambar untuk dibagikan.");

      const file = new File(
        [blob],
        `mengart-story-${challenge.slug}-${cardMode}.png`,
        { type: "image/png" }
      );

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: `Mengart Atelier: ${challenge.title}`,
          text: `Simak ${
            cardMode === "results" ? "karya pemenang" : "tantangan karya"
          } di Mengart Atelier!`,
          files: [file],
        });
        toast.success("Story Card berhasil dibagikan!");
      } else if (navigator.share) {
        await navigator.share({
          title: `Mengart Atelier: ${challenge.title}`,
          text: `Simak ${challenge.title} di Mengart Atelier: https://mengart.local/challenges/${challenge.slug}`,
          url: `https://mengart.local/challenges/${challenge.slug}`,
        });
        toast.success("Tautan berhasil dibagikan!");
      } else {
        // Fallback to direct download
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `mengart-story-${challenge.slug}-${cardMode}.png`;
        a.click();
        URL.revokeObjectURL(url);
        toast.info("Web Share tidak didukung di perangkat ini. File telah diunduh otomatis.");
      }
    } catch (err: any) {
      if (err.name !== "AbortError") {
        toast.error(err?.message || "Gagal membagikan Story Card.");
      }
    } finally {
      setIsSharing(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="px-4 py-2.5 min-h-[44px] rounded-2xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-400 font-mono text-xs font-bold transition-all shadow-md flex items-center gap-2 cursor-pointer focus:outline-none focus:ring-2 focus:ring-amber-500"
        aria-label="Ekspor 9:16 Story Card untuk Instagram Stories & WhatsApp Status"
      >
        <Share2 className="h-4 w-4" />
        <span>Ekspor 9:16 Story Card</span>
      </button>

      {isOpen ? (
        <div
          role="dialog"
          aria-labelledby="story-card-title"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200"
        >
          <div className="w-full max-w-xl rounded-3xl bg-[#0e1015] border border-white/15 p-6 sm:p-8 shadow-2xl relative z-10 max-h-[92vh] overflow-y-auto flex flex-col gap-6">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div className="flex items-center gap-2.5">
                <div className="h-9 w-9 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
                  <ImageIcon className="h-4 w-4" />
                </div>
                <div>
                  <h3 id="story-card-title" className="font-display font-bold text-lg text-[#f6f2e9]">
                    9:16 Story Card Generator
                  </h3>
                  <p className="text-xs text-zinc-400 font-sans">
                    Format resolusi tinggi 1080 × 1920 px untuk Instagram Stories & WhatsApp Status.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="p-2 min-h-[44px] min-w-[44px] rounded-xl text-zinc-400 hover:text-white hover:bg-white/5 transition-colors flex items-center justify-center cursor-pointer"
                aria-label="Tutup dialog generator"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Mode Switcher Tabs */}
            <div className="flex items-center p-1 rounded-2xl bg-white/5 border border-white/10">
              <button
                type="button"
                onClick={() => setCardMode("results")}
                className={`flex-1 py-2.5 min-h-[44px] rounded-xl text-xs font-mono font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                  cardMode === "results"
                    ? "bg-amber-500 text-black shadow-md"
                    : "text-zinc-400 hover:text-white"
                }`}
              >
                <Trophy className="h-3.5 w-3.5" />
                <span>Hasil & Pemenang</span>
              </button>
              <button
                type="button"
                onClick={() => setCardMode("announcement")}
                className={`flex-1 py-2.5 min-h-[44px] rounded-xl text-xs font-mono font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                  cardMode === "announcement"
                    ? "bg-amber-500 text-black shadow-md"
                    : "text-zinc-400 hover:text-white"
                }`}
              >
                <Calendar className="h-3.5 w-3.5" />
                <span>Pengumuman & Deadline</span>
              </button>
            </div>

            {/* Live Visual Card Preview */}
            <div className="p-4 rounded-2xl bg-black/50 border border-white/10 flex flex-col gap-3">
              <span className="text-[11px] font-mono text-zinc-400 uppercase tracking-wider">
                Pratinjau Desain Story:
              </span>
              <div className="aspect-[9/16] w-full max-w-[260px] mx-auto rounded-2xl bg-gradient-to-b from-[#141720] to-[#0a0c10] border border-amber-500/30 p-4 flex flex-col justify-between shadow-2xl relative overflow-hidden text-center">
                <div className="flex flex-col items-center gap-1 pt-1">
                  <span className="text-[10px] font-mono text-amber-400 font-bold tracking-widest">
                    MENGART ATELIER
                  </span>
                  <span className="text-[9px] font-sans text-zinc-400">
                    {cardMode === "results"
                      ? "HASIL RESMI CHALLENGE"
                      : "PENGUMUMAN TANTANGAN"}
                  </span>
                </div>

                {cardMode === "results" ? (
                  <div className="flex flex-col items-center gap-2 my-auto">
                    <div className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-[10px] font-mono border border-amber-500/40">
                      🏆{" "}
                      {primaryWinner?.awardTitle ||
                        (primaryWinner?.awardType === "community_vote_winner"
                          ? "Juara Favorit Komunitas"
                          : "Penghargaan Juri")}
                    </div>
                    <span className="font-display font-bold text-sm text-[#f6f2e9] line-clamp-2">
                      {primaryWinner ? `"${primaryWinner.title}"` : challenge.title}
                    </span>
                    <span className="text-[11px] text-amber-400 font-sans">
                      {primaryWinner ? `oleh ${primaryWinner.artistName}` : "Artist Atelier"}
                    </span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2 my-auto">
                    <div className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-[10px] font-mono border border-amber-500/40">
                      TEMA: {challenge.theme.toUpperCase()}
                    </div>
                    <span className="font-display font-bold text-sm text-[#f6f2e9] line-clamp-2">
                      {challenge.title}
                    </span>
                    <span className="text-[10px] font-mono text-zinc-400">
                      Batas Submisi (WITA):
                    </span>
                    <span className="text-[11px] font-mono text-white font-bold">
                      {formattedDeadline}
                    </span>
                  </div>
                )}

                <span className="text-[8px] font-mono text-zinc-500 pb-1">
                  mengart.local/challenges
                </span>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
              <button
                type="button"
                onClick={handleWebShare}
                disabled={isSharing || isExporting}
                className="w-full sm:flex-1 py-3 min-h-[44px] rounded-2xl bg-amber-500 hover:bg-amber-400 text-black text-xs font-mono font-bold transition-all shadow-md shadow-amber-500/20 flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
              >
                {isSharing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Menyiapkan Share...</span>
                  </>
                ) : (
                  <>
                    <Share2 className="h-4 w-4" />
                    <span>Bagikan Langsung</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleDownloadPng}
                disabled={isExporting || isSharing}
                className="w-full sm:flex-1 py-3 min-h-[44px] rounded-2xl bg-white/5 hover:bg-white/10 text-xs font-mono text-zinc-300 hover:text-white border border-white/10 transition-colors flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
              >
                {isExporting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Mengekspor PNG...</span>
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4" />
                    <span>Unduh PNG (1080×1920)</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let currentLine = words[0] || "";

  for (let i = 1; i < words.length; i++) {
    const word = words[i];
    const width = ctx.measureText(currentLine + " " + word).width;
    if (width < maxWidth) {
      currentLine += " " + word;
    } else {
      lines.push(currentLine);
      currentLine = word;
    }
  }
  if (currentLine) {
    lines.push(currentLine);
  }
  return lines;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}
