"use client";

import { useState } from "react";
import {
  postCritiqueCommentAction,
  deleteCritiqueCommentAction,
  togglePinCritiqueAction,
} from "@/app/actions/critiques";
import {
  MessageSquare,
  Sparkles,
  Pin,
  Trash2,
  CornerDownRight,
  Loader2,
  ShieldCheck,
  Send,
  Info,
} from "lucide-react";
import Link from "next/link";

interface CritiqueCommentItem {
  id: string;
  userId: string;
  artistName: string;
  artistSlug: string;
  artistAvatar: string | null;
  critiqueAspect: "general" | "composition" | "color_lighting" | "anatomy_perspective" | "technique";
  content: string;
  isPinned: boolean;
  createdAt: Date;
  parentCommentId: string | null;
}

interface CritiqueSectionProps {
  artworkId: string;
  artworkSlug: string;
  critiqueMode: "open" | "structured" | "showcase_only";
  artworkOwnerUserId: string;
  currentUserId?: string;
  currentUserRole?: string;
  comments: CritiqueCommentItem[];
}

export function CritiqueSection({
  artworkId,
  artworkSlug,
  critiqueMode,
  artworkOwnerUserId,
  currentUserId,
  currentUserRole,
  comments,
}: CritiqueSectionProps) {
  const [content, setContent] = useState("");
  const [aspect, setAspect] = useState<"general" | "composition" | "color_lighting" | "anatomy_perspective" | "technique">("general");
  const [replyParentId, setReplyParentId] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isOwner = currentUserId === artworkOwnerUserId;
  const isModOrAdmin = currentUserRole === "moderator" || currentUserRole === "admin";

  const handlePostComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;

    setIsLoading(true);
    setError(null);

    const formData = new FormData();
    formData.append("artworkId", artworkId);
    formData.append("content", content.trim());
    formData.append("critiqueAspect", aspect);

    try {
      const res = await postCritiqueCommentAction(formData);
      if (res.success) {
        setContent("");
      }
    } catch (err: any) {
      setError(err?.message || "Gagal mengirimkan kritik.");
    } finally {
      setIsLoading(false);
    }
  };

  const handlePostReply = async (parentId: string) => {
    if (!replyContent.trim()) return;
    setIsLoading(true);

    const formData = new FormData();
    formData.append("artworkId", artworkId);
    formData.append("content", replyContent.trim());
    formData.append("critiqueAspect", "general");
    formData.append("parentCommentId", parentId);

    try {
      const res = await postCritiqueCommentAction(formData);
      if (res.success) {
        setReplyContent("");
        setReplyParentId(null);
      }
    } catch (err: any) {
      alert(err?.message || "Gagal membalas.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (commentId: string) => {
    if (!confirm("Hapus kritik/komentar ini?")) return;
    try {
      await deleteCritiqueCommentAction(commentId, artworkSlug);
    } catch (err: any) {
      alert(err?.message || "Gagal menghapus.");
    }
  };

  const handleTogglePin = async (commentId: string) => {
    try {
      await togglePinCritiqueAction(commentId, artworkSlug);
    } catch (err: any) {
      alert(err?.message || "Gagal menyematkan.");
    }
  };

  // Group root comments and replies
  const rootComments = comments.filter((c) => !c.parentCommentId);
  const replies = comments.filter((c) => c.parentCommentId);

  // Aspect label mapping
  const aspectLabels = {
    general: "Umum",
    composition: "Komposisi",
    color_lighting: "Warna & Cahaya",
    anatomy_perspective: "Anatomi / Perspektif",
    technique: "Teknik / Brushwork",
  };

  return (
    <section className="glass-panel p-6 sm:p-8 rounded-3xl flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/10 pb-4">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5 text-amber-400" />
          <h3 className="font-display font-bold text-xl text-[#f6f2e9]">
            Kritik Konstruktif & Masukan ({comments.length})
          </h3>
        </div>

        <span className="px-3 py-1 rounded-full text-xs font-mono uppercase bg-amber-500/10 text-amber-400 border border-amber-500/30">
          MODE: {critiqueMode.replace(/_/g, " ")}
        </span>
      </div>

      {critiqueMode === "showcase_only" ? (
        <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/10 text-xs font-mono text-zinc-400 flex items-center gap-2">
          <Info className="h-4 w-4 text-amber-400 shrink-0" />
          <span>Artist mengatur karya ini dalam mode apresiasi visual (showcase only / tanpa feedback).</span>
        </div>
      ) : (
        <>
          {/* Constructive Critique Code of Conduct Banner */}
          <div className="p-4 rounded-2xl bg-amber-500/5 border border-amber-500/20 flex items-start gap-3 text-xs">
            <ShieldCheck className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
            <div className="flex flex-col gap-0.5">
              <span className="font-mono font-bold text-amber-300">
                Pedoman Kritik Komunitas Atelier Mengart
              </span>
              <p className="text-zinc-300 leading-relaxed font-sans">
                Berikan masukan yang berfokus pada teknik spesifik (komposisi, pencahayaan, anatomi). Kritik konstruktif bertujuan memajukan kemampuan rekan artist secara suportif.
              </p>
            </div>
          </div>

          {/* New Critique Form */}
          {currentUserId ? (
            <form onSubmit={handlePostComment} className="flex flex-col gap-3">
              {error ? <span className="text-xs text-red-400">{error}</span> : null}

              {/* Aspect Selector Buttons (for structured/open) */}
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs font-mono text-zinc-400 mr-1">Fokus Aspek:</span>
                {(Object.keys(aspectLabels) as (keyof typeof aspectLabels)[]).map((asp) => (
                  <button
                    type="button"
                    key={asp}
                    onClick={() => setAspect(asp)}
                    className={`px-3 py-1 rounded-lg text-xs font-mono transition-all cursor-pointer ${
                      aspect === asp
                        ? "bg-amber-500 text-black font-bold shadow-md shadow-amber-500/20"
                        : "bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white border border-white/10"
                    }`}
                  >
                    {aspectLabels[asp]}
                  </button>
                ))}
              </div>

              <div className="flex gap-2">
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  rows={3}
                  placeholder="Tuliskan apresiasi dan saran konstruktif untuk karya ini..."
                  className="w-full px-4 py-3 rounded-2xl bg-white/5 border border-white/10 text-white placeholder:text-zinc-600 focus:outline-none focus:border-amber-500/60 text-xs font-sans resize-none"
                />
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={isLoading || !content.trim()}
                  className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs font-mono transition-all shadow-md shadow-amber-500/20 flex items-center gap-2 cursor-pointer disabled:opacity-40"
                >
                  {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                  <span>Kirim Kritik</span>
                </button>
              </div>
            </form>
          ) : (
            <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/10 flex items-center justify-between text-xs">
              <span className="text-zinc-400 font-sans">
                Masuk ke akun member atelier Anda untuk memberikan kritik dan masukan konstruktif.
              </span>
              <Link
                href="/login"
                className="px-4 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold font-mono text-xs"
              >
                Masuk
              </Link>
            </div>
          )}

          {/* Comments List */}
          <div className="flex flex-col gap-4 mt-2">
            {rootComments.length === 0 ? (
              <span className="text-xs font-mono text-zinc-500 text-center py-6">
                Belum ada masukan untuk karya ini. Jadilah yang pertama memberikan apresiasi!
              </span>
            ) : (
              rootComments.map((comment) => {
                const commentReplies = replies.filter((r) => r.parentCommentId === comment.id);

                return (
                  <div
                    key={comment.id}
                    className={`p-4 rounded-2xl border flex flex-col gap-3 transition-colors ${
                      comment.isPinned
                        ? "bg-amber-500/5 border-amber-500/40 ring-1 ring-amber-500/20"
                        : "bg-white/[0.02] border-white/5"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="h-7 w-7 rounded-lg bg-amber-500/20 text-amber-400 font-bold font-mono flex items-center justify-center text-xs">
                          {comment.artistName.charAt(0)}
                        </div>
                        <Link
                          href={`/artists/${comment.artistSlug}`}
                          className="font-display font-bold text-xs text-[#f6f2e9] hover:text-amber-300 transition-colors"
                        >
                          {comment.artistName}
                        </Link>
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-mono bg-white/5 border border-white/10 text-amber-400 uppercase">
                          {aspectLabels[comment.critiqueAspect]}
                        </span>
                        {comment.isPinned ? (
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-mono bg-amber-500 text-black font-bold flex items-center gap-1">
                            <Pin className="h-2.5 w-2.5" /> DISEMATHKAN ARTIST
                          </span>
                        ) : null}
                      </div>

                      <div className="flex items-center gap-2 text-zinc-500 text-[11px] font-mono">
                        <span>
                          {new Intl.DateTimeFormat("id-ID", {
                            timeZone: "Asia/Makassar",
                            day: "numeric",
                            month: "short",
                            hour: "2-digit",
                            minute: "2-digit",
                          }).format(new Date(comment.createdAt))}
                        </span>

                        {isOwner ? (
                          <button
                            onClick={() => handleTogglePin(comment.id)}
                            title="Sematkan Kritik Terbaik"
                            className="p-1 hover:text-amber-400 transition-colors cursor-pointer"
                          >
                            <Pin className="h-3.5 w-3.5" />
                          </button>
                        ) : null}

                        {currentUserId === comment.userId || isModOrAdmin ? (
                          <button
                            onClick={() => handleDelete(comment.id)}
                            title="Hapus Komentar"
                            className="p-1 hover:text-red-400 transition-colors cursor-pointer"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        ) : null}
                      </div>
                    </div>

                    <p className="text-xs text-zinc-200 font-sans leading-relaxed whitespace-pre-line pl-9">
                      {comment.content}
                    </p>

                    {/* Reply Action */}
                    <div className="pl-9 flex items-center gap-3">
                      {currentUserId ? (
                        <button
                          onClick={() =>
                            setReplyParentId(replyParentId === comment.id ? null : comment.id)
                          }
                          className="text-[11px] font-mono text-zinc-400 hover:text-amber-400 flex items-center gap-1 cursor-pointer"
                        >
                          <CornerDownRight className="h-3 w-3" />
                          <span>Balas</span>
                        </button>
                      ) : null}
                    </div>

                    {/* Reply Input Form */}
                    {replyParentId === comment.id ? (
                      <div className="pl-9 flex flex-col gap-2 mt-2">
                        <textarea
                          value={replyContent}
                          onChange={(e) => setReplyContent(e.target.value)}
                          rows={2}
                          placeholder={`Balas ${comment.artistName}...`}
                          className="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-xs font-sans resize-none"
                        />
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => setReplyParentId(null)}
                            className="px-3 py-1 rounded-lg text-xs font-mono text-zinc-400 hover:text-white"
                          >
                            Batal
                          </button>
                          <button
                            onClick={() => handlePostReply(comment.id)}
                            disabled={isLoading || !replyContent.trim()}
                            className="px-4 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs font-mono"
                          >
                            Kirim Balasan
                          </button>
                        </div>
                      </div>
                    ) : null}

                    {/* Threaded Replies */}
                    {commentReplies.length > 0 ? (
                      <div className="pl-9 flex flex-col gap-2 mt-2 pt-2 border-t border-white/5">
                        {commentReplies.map((rep) => (
                          <div
                            key={rep.id}
                            className="p-3 rounded-xl bg-white/[0.02] border border-white/5 flex flex-col gap-1.5"
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-display font-bold text-xs text-[#f6f2e9]">
                                {rep.artistName}
                              </span>
                              <span className="text-[10px] font-mono text-zinc-500">
                                {new Intl.DateTimeFormat("id-ID", {
                                  timeZone: "Asia/Makassar",
                                  day: "numeric",
                                  month: "short",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                }).format(new Date(rep.createdAt))}
                              </span>
                            </div>
                            <p className="text-xs text-zinc-300 font-sans">{rep.content}</p>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                );
              })
            )}
          </div>
        </>
      )}
    </section>
  );
}
