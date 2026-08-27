"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Trophy,
  Sparkles,
  Plus,
  Trash2,
  Crown,
  Loader2,
  Calendar,
  Save,
  CheckCircle2,
} from "lucide-react";
import { importHistoricalChallengeAction, type HistoricalEntryInput } from "@/app/actions/historicalBackfill";
import { toast } from "sonner";

interface ArtistOption {
  userId: string;
  displayName: string;
  email: string;
  slug: string;
}

interface HistoricalImportFormProps {
  artists: ArtistOption[];
}

export function HistoricalImportForm({ artists }: HistoricalImportFormProps) {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);

  // Challenge Details
  const [title, setTitle] = useState("Cyberpunk Archipelago 2025");
  const [slug, setSlug] = useState("cyberpunk-archipelago-2025");
  const [theme, setTheme] = useState("Futuristik Nusantara");
  const [description, setDescription] = useState(
    "Eksplorasi visual perpaduan estetika cyberpunk fiksi ilmiah dengan elemen arsitektur dan budaya maritim Nusantara."
  );
  const [promptRules, setPromptRules] = useState(
    "Format 2D/3D orisinal. Menampilkan pencahayaan neon malam hari dan elemen budaya kepulauan."
  );

  // Dates (WITA)
  const [submissionStartsAt, setSubmissionStartsAt] = useState("2025-11-01T00:00");
  const [submissionDeadline, setSubmissionDeadline] = useState("2025-11-20T23:59");
  const [votingStartsAt, setVotingStartsAt] = useState("2025-11-21T00:00");
  const [votingDeadline, setVotingDeadline] = useState("2025-11-28T23:59");

  // Entries
  const defaultUser1 = artists[0]?.userId || "";
  const defaultUser2 = artists[1]?.userId || defaultUser1;
  const defaultUser3 = artists[2]?.userId || defaultUser1;

  const [entries, setEntries] = useState<HistoricalEntryInput[]>([
    {
      userId: defaultUser1,
      artworkTitle: "Neon Harbor of Batavia 2099",
      artworkDescription: "Ilustrasi pelabuhan futuristik dengan kapal layar berteknologi fotonik.",
      softwareUsed: "Clip Studio Paint, Photoshop",
      mediaType: "image",
      masterStorageKey: "master_sample_batavia.png",
      publicStorageKey: "public_sample_batavia.webp",
      thumbnailStorageKey: "thumb_sample_batavia.webp",
      finalRank: 1,
      totalCommunityStars: 28,
      juryScore: 96.5,
      winnerSlotType: "community_vote",
      slotTitle: "Juara 1 Favorit Komunitas",
    },
    {
      userId: defaultUser2,
      artworkTitle: "Garuda Cyber Mech Unit",
      artworkDescription: "Konsep 3D armor tempur dengan ornamen ukiran tradisional Bali.",
      softwareUsed: "Blender, Substance Painter",
      mediaType: "image",
      masterStorageKey: "master_sample_garuda.png",
      publicStorageKey: "public_sample_garuda.webp",
      thumbnailStorageKey: "thumb_sample_garuda.webp",
      finalRank: 2,
      totalCommunityStars: 21,
      juryScore: 92.0,
      winnerSlotType: "community_vote",
      slotTitle: "Juara 2 Favorit Komunitas",
    },
    {
      userId: defaultUser3,
      artworkTitle: "Floating Lantern Alley",
      artworkDescription: "Pemandangan lorong kota apung dengan lampion holografik interaktif.",
      softwareUsed: "Procreate",
      mediaType: "image",
      masterStorageKey: "master_sample_lantern.png",
      publicStorageKey: "public_sample_lantern.webp",
      thumbnailStorageKey: "thumb_sample_lantern.webp",
      finalRank: 3,
      totalCommunityStars: 17,
      juryScore: 94.0,
      winnerSlotType: "jury_award",
      slotTitle: "Pilihan Dewan Juri Atelier",
    },
  ]);

  const handleEntryChange = (index: number, field: keyof HistoricalEntryInput, value: any) => {
    setEntries((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const handleAddEntry = () => {
    setEntries((prev) => [
      ...prev,
      {
        userId: artists[0]?.userId || "",
        artworkTitle: `Karya Submisi Historis #${prev.length + 1}`,
        mediaType: "image",
        masterStorageKey: `master_sample_${prev.length + 1}.png`,
        publicStorageKey: `public_sample_${prev.length + 1}.webp`,
        thumbnailStorageKey: `thumb_sample_${prev.length + 1}.webp`,
        finalRank: prev.length + 1,
        totalCommunityStars: Math.max(15 - prev.length * 2, 1),
        winnerSlotType: "none",
      },
    ]);
  };

  const handleRemoveEntry = (index: number) => {
    if (entries.length <= 1) return;
    setEntries((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !slug.trim()) return;

    setIsPending(true);
    try {
      const res = await importHistoricalChallengeAction({
        title: title.trim(),
        slug: slug.trim(),
        theme: theme.trim(),
        description: description.trim(),
        promptRules: promptRules.trim(),
        submissionStartsAt,
        submissionDeadline,
        votingStartsAt,
        votingDeadline,
        entries,
      });

      toast.success(`Challenge historis "${title}" berhasil diimpor ke Hall of Fame!`);
      router.push(`/challenges/${res.slug}/results`);
    } catch (err: any) {
      toast.error(err?.message || "Gagal mengimpor data historis.");
    } finally {
      setIsPending(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-8">
      {/* 1. Challenge Details Card */}
      <section className="glass-panel p-6 sm:p-8 rounded-3xl border border-white/10 flex flex-col gap-6">
        <div className="flex items-center gap-2 border-b border-white/10 pb-4">
          <Trophy className="h-5 w-5 text-amber-400" />
          <h2 className="font-display font-bold text-lg text-[#f6f2e9]">
            1. Informasi Event Challenge Masa Lalu
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-mono text-zinc-300">JUDUL CHALLENGE</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              className="w-full px-4 py-2.5 min-h-[44px] rounded-xl bg-white/5 border border-white/10 text-white text-base sm:text-sm font-sans focus:outline-none focus:border-amber-500/60"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-mono text-zinc-300">SLUG URL UNIK</label>
            <input
              type="text"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              required
              className="w-full px-4 py-2.5 min-h-[44px] rounded-xl bg-white/5 border border-white/10 text-amber-300 text-base sm:text-sm font-mono focus:outline-none focus:border-amber-500/60"
            />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-mono text-zinc-300">TEMA EVENT</label>
          <input
            type="text"
            value={theme}
            onChange={(e) => setTheme(e.target.value)}
            required
            className="w-full px-4 py-2.5 min-h-[44px] rounded-xl bg-white/5 border border-white/10 text-white text-base sm:text-sm font-sans focus:outline-none focus:border-amber-500/60"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-mono text-zinc-300">DESKRIPSI & LATAR BELAKANG</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-base sm:text-sm font-sans resize-none focus:outline-none focus:border-amber-500/60"
          />
        </div>

        {/* Timestamps Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-2">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-mono text-zinc-400">MULAI SUBMISI</label>
            <input
              type="datetime-local"
              value={submissionStartsAt}
              onChange={(e) => setSubmissionStartsAt(e.target.value)}
              className="px-3 py-2 rounded-xl bg-[#191c23] border border-white/10 text-xs font-mono text-zinc-200"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-mono text-zinc-400">DEADLINE SUBMISI</label>
            <input
              type="datetime-local"
              value={submissionDeadline}
              onChange={(e) => setSubmissionDeadline(e.target.value)}
              className="px-3 py-2 rounded-xl bg-[#191c23] border border-white/10 text-xs font-mono text-zinc-200"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-mono text-zinc-400">MULAI VOTING</label>
            <input
              type="datetime-local"
              value={votingStartsAt}
              onChange={(e) => setVotingStartsAt(e.target.value)}
              className="px-3 py-2 rounded-xl bg-[#191c23] border border-white/10 text-xs font-mono text-zinc-200"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-mono text-zinc-400">AKHIR VOTING</label>
            <input
              type="datetime-local"
              value={votingDeadline}
              onChange={(e) => setVotingDeadline(e.target.value)}
              className="px-3 py-2 rounded-xl bg-[#191c23] border border-white/10 text-xs font-mono text-zinc-200"
            />
          </div>
        </div>
      </section>

      {/* 2. Participant Entries & Podium Section */}
      <section className="glass-panel p-6 sm:p-8 rounded-3xl border border-white/10 flex flex-col gap-6">
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <div className="flex items-center gap-2">
            <Crown className="h-5 w-5 text-amber-400" />
            <h2 className="font-display font-bold text-lg text-[#f6f2e9]">
              2. Daftar Karya & Peringkat Podium ({entries.length} Karya)
            </h2>
          </div>

          <button
            type="button"
            onClick={handleAddEntry}
            className="px-3.5 py-1.5 min-h-[38px] rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-amber-400 text-xs font-mono transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            <span>Tambah Karya Submisi</span>
          </button>
        </div>

        <div className="flex flex-col gap-6">
          {entries.map((entry, idx) => (
            <div
              key={idx}
              className="p-5 rounded-2xl bg-white/[0.02] border border-white/10 flex flex-col gap-4 relative"
            >
              <div className="flex items-center justify-between">
                <span className="px-3 py-1 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 font-mono text-xs font-bold uppercase">
                  Peringkat #{entry.finalRank}
                </span>

                {entries.length > 1 ? (
                  <button
                    type="button"
                    onClick={() => handleRemoveEntry(idx)}
                    className="p-1.5 rounded-lg text-zinc-500 hover:text-red-400 hover:bg-white/5 transition-colors"
                    title="Hapus Baris"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                ) : null}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {/* Artist User Select */}
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-mono text-zinc-400">ARTIST MEMBER</label>
                  <select
                    value={entry.userId}
                    onChange={(e) => handleEntryChange(idx, "userId", e.target.value)}
                    className="w-full px-3 py-2 min-h-[44px] rounded-xl bg-[#191c23] border border-white/10 text-white text-xs font-mono focus:outline-none"
                  >
                    {artists.map((a) => (
                      <option key={a.userId} value={a.userId}>
                        {a.displayName} (@{a.slug})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Artwork Title */}
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-mono text-zinc-400">JUDUL KARYA</label>
                  <input
                    type="text"
                    value={entry.artworkTitle}
                    onChange={(e) => handleEntryChange(idx, "artworkTitle", e.target.value)}
                    required
                    className="w-full px-3 py-2 min-h-[44px] rounded-xl bg-white/5 border border-white/10 text-white text-base sm:text-xs font-sans focus:outline-none"
                  />
                </div>

                {/* Stars Count */}
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-mono text-zinc-400">TOTAL SUARA STARS</label>
                  <input
                    type="number"
                    value={entry.totalCommunityStars}
                    onChange={(e) => handleEntryChange(idx, "totalCommunityStars", parseInt(e.target.value) || 0)}
                    min={0}
                    className="w-full px-3 py-2 min-h-[44px] rounded-xl bg-white/5 border border-white/10 text-amber-300 font-mono text-base sm:text-xs focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Slot Type */}
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-mono text-zinc-400">KATEGORI PENGHARGAAN</label>
                  <select
                    value={entry.winnerSlotType}
                    onChange={(e) => handleEntryChange(idx, "winnerSlotType", e.target.value)}
                    className="w-full px-3 py-2 min-h-[44px] rounded-xl bg-[#191c23] border border-white/10 text-white text-xs font-mono focus:outline-none"
                  >
                    <option value="community_vote">Podium Favorit Komunitas (Juara 1, 2, 3)</option>
                    <option value="jury_award">Penghargaan Khusus Juri</option>
                    <option value="none">Partisipan Submisi Reguler</option>
                  </select>
                </div>

                {/* Software Used */}
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-mono text-zinc-400">SOFTWARE DIGUNAKAN</label>
                  <input
                    type="text"
                    value={entry.softwareUsed || ""}
                    onChange={(e) => handleEntryChange(idx, "softwareUsed", e.target.value)}
                    placeholder="Photoshop, Blender, Clip Studio..."
                    className="w-full px-3 py-2 min-h-[44px] rounded-xl bg-white/5 border border-white/10 text-white text-base sm:text-xs font-sans focus:outline-none"
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Submit Action */}
      <div className="flex items-center justify-end gap-4">
        <button
          type="button"
          onClick={() => router.push("/admin/challenges")}
          className="px-5 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white text-xs font-mono transition-colors"
        >
          Batal
        </button>

        <button
          type="submit"
          disabled={isPending}
          className="px-8 py-3 min-h-[44px] rounded-2xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs font-mono transition-all shadow-lg shadow-amber-500/20 flex items-center gap-2 cursor-pointer disabled:opacity-50"
        >
          {isPending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin text-black" />
              <span>Mengimpor Challenge ke Hall of Fame...</span>
            </>
          ) : (
            <>
              <Save className="h-4 w-4" />
              <span>Simpan & Terbitkan ke Hall of Fame</span>
            </>
          )}
        </button>
      </div>
    </form>
  );
}
