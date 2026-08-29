"use client";

import { useState } from "react";
import { createOrUpdateChallengeAction } from "@/app/actions/challenges";
import { Loader2, Trophy, Save, ArrowLeft, CheckCircle2, AlertCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export function ChallengeCreateForm() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [theme, setTheme] = useState("");
  const [description, setDescription] = useState("");
  const [promptRules, setPromptRules] = useState(
    "1. Karya harus merupakan kreasi orisinal (bukan AI generated).\n2. Format file: PNG / JPG / WebP / MP4.\n3. Sesuai dengan tema yang ditentukan."
  );
  const [awardMode, setAwardMode] = useState<"vote_and_jury" | "vote_only" | "jury_only" | "showcase_only">("vote_and_jury");
  const [starsPerMember, setStarsPerMember] = useState(1);
  const [allowRevisions, setAllowRevisions] = useState(true);

  // Default dates: start now, submission 7 days, voting 3 days
  const nowStr = new Date().toISOString().slice(0, 16);
  const subDeadlineStr = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 16);
  const voteStartStr = subDeadlineStr;
  const voteDeadlineStr = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString().slice(0, 16);

  const [submissionStartsAt, setSubmissionStartsAt] = useState(nowStr);
  const [submissionDeadline, setSubmissionDeadline] = useState(subDeadlineStr);
  const [votingStartsAt, setVotingStartsAt] = useState(voteStartStr);
  const [votingDeadline, setVotingDeadline] = useState(voteDeadlineStr);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    const formData = new FormData();
    formData.append("title", title.trim());
    formData.append("theme", theme.trim());
    formData.append("description", description.trim());
    formData.append("promptRules", promptRules.trim());
    formData.append("awardMode", awardMode);
    formData.append("starsPerMember", String(starsPerMember));
    formData.append("allowRevisions", String(allowRevisions));
    formData.append("submissionStartsAt", new Date(submissionStartsAt).toISOString());
    formData.append("submissionDeadline", new Date(submissionDeadline).toISOString());
    formData.append("votingStartsAt", new Date(votingStartsAt).toISOString());
    formData.append("votingDeadline", new Date(votingDeadline).toISOString());

    try {
      const res = await createOrUpdateChallengeAction(formData);
      if (res.success) {
        router.push("/admin/challenges");
      }
    } catch (err: any) {
      setError(err?.message || "Gagal membuat challenge.");
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-8 max-w-4xl">
      {error ? (
        <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
          <span>{error}</span>
        </div>
      ) : null}

      {/* Section 1: Basic Information */}
      <section className="glass-panel p-6 sm:p-8 rounded-3xl flex flex-col gap-5">
        <h2 className="font-display font-bold text-lg text-[#f6f2e9]">Informasi Utama Challenge</h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-mono text-zinc-300">JUDUL CHALLENGE</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Celestial Night: Bali Mythos"
              required
              className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-zinc-600 focus:outline-none focus:border-amber-500/60 text-sm font-sans"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-mono text-zinc-300">TEMA / KEYWORD</label>
            <input
              type="text"
              value={theme}
              onChange={(e) => setTheme(e.target.value)}
              placeholder="e.g. Dark Fantasy, Mythological Bali"
              required
              className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-zinc-600 focus:outline-none focus:border-amber-500/60 text-sm font-sans"
            />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-mono text-zinc-300">DESKRIPSI & PENGANTAR</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            required
            placeholder="Jelaskan latar belakang dan inspirasi tema untuk seluruh artist komunitas..."
            className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-zinc-600 focus:outline-none focus:border-amber-500/60 text-sm font-sans resize-none"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-mono text-zinc-300">KETENTUAN & ATURAN PROMPT (DO / DON'T)</label>
          <textarea
            value={promptRules}
            onChange={(e) => setPromptRules(e.target.value)}
            rows={5}
            required
            className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-zinc-600 focus:outline-none focus:border-amber-500/60 text-sm font-mono resize-none"
          />
        </div>
      </section>

      {/* Section 2: Awards & Voting Configuration */}
      <section className="glass-panel p-6 sm:p-8 rounded-3xl flex flex-col gap-5">
        <h2 className="font-display font-bold text-lg text-[#f6f2e9]">Mode Pemenang & Konfigurasi Voting</h2>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { key: "vote_and_jury", label: "Voting + Juri" },
            { key: "vote_only", label: "Voting Saja" },
            { key: "jury_only", label: "Juri Saja" },
            { key: "showcase_only", label: "Showcase Saja" },
          ].map((m) => (
            <button
              type="button"
              key={m.key}
              onClick={() => setAwardMode(m.key as any)}
              className={`p-3 rounded-xl text-xs font-mono border transition-all cursor-pointer ${
                awardMode === m.key
                  ? "bg-amber-500 text-black border-amber-400 font-bold"
                  : "bg-white/5 text-zinc-400 border-white/10 hover:border-white/20 hover:text-white"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-mono text-zinc-300">ALOKASI STARS / MEMBER</label>
            <input
              type="number"
              min={1}
              max={10}
              value={starsPerMember}
              onChange={(e) => setStarsPerMember(Number(e.target.value))}
              className="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-xs font-mono"
            />
          </div>

          <div className="flex flex-col gap-1.5 justify-end">
            <label className="flex items-center gap-2 p-2.5 rounded-xl bg-white/5 border border-white/10 cursor-pointer">
              <input
                type="checkbox"
                checked={allowRevisions}
                onChange={(e) => setAllowRevisions(e.target.checked)}
                className="h-4 w-4 rounded border-white/20 bg-black/50 text-amber-500 focus:ring-amber-500"
              />
              <span className="text-xs font-medium text-zinc-200">Izinkan Revisi Submisi</span>
            </label>
          </div>
        </div>
      </section>

      {/* Section 3: Authoritative Timelines (WITA) */}
      <section className="glass-panel p-6 sm:p-8 rounded-3xl flex flex-col gap-5">
        <h2 className="font-display font-bold text-lg text-[#f6f2e9]">Jadwal & Batas Waktu (WITA)</h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-mono text-zinc-300">WAKTU SUBMISI DIBUKA</label>
            <input
              type="datetime-local"
              value={submissionStartsAt}
              onChange={(e) => setSubmissionStartsAt(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-xs font-mono"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-mono text-zinc-300">DEADLINE SUBMISI KARYA</label>
            <input
              type="datetime-local"
              value={submissionDeadline}
              onChange={(e) => setSubmissionDeadline(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-xs font-mono"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-mono text-zinc-300">WAKTU VOTING DIBUKA</label>
            <input
              type="datetime-local"
              value={votingStartsAt}
              onChange={(e) => setVotingStartsAt(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-xs font-mono"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-mono text-zinc-300">DEADLINE VOTING SELESAI</label>
            <input
              type="datetime-local"
              value={votingDeadline}
              onChange={(e) => setVotingDeadline(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-xs font-mono"
            />
          </div>
        </div>
      </section>

      {/* Submit Button */}
      <div className="flex items-center justify-end gap-3">
        <Link
          href="/admin/challenges"
          className="px-5 py-3 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white text-xs font-mono transition-colors"
        >
          Batal
        </Link>
        <button
          type="submit"
          disabled={isLoading}
          className="px-8 py-3.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-sm transition-all shadow-lg shadow-amber-500/20 flex items-center gap-2 cursor-pointer disabled:opacity-50"
        >
          {isLoading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin text-black" />
              <span>Menyimpan Challenge...</span>
            </>
          ) : (
            <>
              <Save className="h-4 w-4" />
              <span>Publikasikan Challenge</span>
            </>
          )}
        </button>
      </div>
    </form>
  );
}
