"use client";

import { useState } from "react";
import {
  postCritiqueCommentAction,
  editCritiqueCommentAction,
  deleteCritiqueCommentAction,
  hideCritiqueCommentAction,
  restoreCritiqueCommentAction,
  togglePinCritiqueAction,
} from "@/app/actions/critiques";
import {
  MessageSquare,
  Sparkles,
  Pin,
  Trash2,
  Edit2,
  EyeOff,
  Eye,
  CornerDownRight,
  Loader2,
  ShieldCheck,
  Send,
  X,
  Check,
  AlertTriangle,
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

export interface CritiqueCommentItem {
  id: string;
  userId: string;
  artistName: string;
  artistSlug: string;
  artistAvatar: string | null;
  content: string;
  isPinned: boolean;
  isEdited?: boolean;
  isHidden?: boolean;
  hiddenReason?: string | null;
  createdAt: Date;
  updatedAt?: Date;
  parentCommentId: string | null;
}

interface CritiqueSectionProps {
  artworkId: string;
  artworkSlug: string;
  critiqueMode: "open" | "structured" | "showcase_only" | "open_for_critique";
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
  const [replyParentId, setReplyParentId] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState("");
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [hideModalCommentId, setHideModalCommentId] = useState<string | null>(null);
  const [hideReason, setHideReason] = useState("");

  const [isLoading, setIsLoading] = useState(false);
  const [isSubmittingReply, setIsSubmittingReply] = useState(false);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [isHiding, setIsHiding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isOwner = currentUserId === artworkOwnerUserId;
  const isModOrAdmin = currentUserRole === "moderator" || currentUserRole === "admin";
  const isCritiqueWelcome =
    critiqueMode === "open_for_critique" ||
    critiqueMode === "open" ||
    critiqueMode === "structured";

  const handlePostComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;

    setIsLoading(true);
    setError(null);

    const formData = new FormData();
    formData.append("artworkId", artworkId);
    formData.append("content", content.trim());

    try {
      const res = await postCritiqueCommentAction(formData);
      if (res.success) {
        setContent("");
        toast.success("Komentar berhasil dikirim.");
      }
    } catch (err: any) {
      setError(err?.message || "Gagal mengirimkan komentar.");
      toast.error(err?.message || "Gagal mengirimkan komentar.");
    } finally {
      setIsLoading(false);
    }
  };

  const handlePostReply = async (parentId: string) => {
    if (!replyContent.trim()) return;
    setIsSubmittingReply(true);

    const formData = new FormData();
    formData.append("artworkId", artworkId);
    formData.append("content", replyContent.trim());
    formData.append("parentCommentId", parentId);

    try {
      const res = await postCritiqueCommentAction(formData);
      if (res.success) {
        setReplyContent("");
        setReplyParentId(null);
        toast.success("Balasan berhasil dikirim.");
      }
    } catch (err: any) {
      toast.error(err?.message || "Gagal mengirimkan balasan.");
    } finally {
      setIsSubmittingReply(false);
    }
  };

  const handleSaveEdit = async (commentId: string) => {
    if (!editContent.trim()) return;
    setIsSavingEdit(true);

    try {
      await editCritiqueCommentAction(commentId, artworkSlug, editContent.trim());
      setEditingCommentId(null);
      setEditContent("");
      toast.success("Komentar berhasil diperbarui.");
    } catch (err: any) {
      toast.error(err?.message || "Gagal memperbarui komentar.");
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleDelete = async (commentId: string) => {
    if (!confirm("Hapus komentar ini?")) return;
    try {
      await deleteCritiqueCommentAction(commentId, artworkSlug);
      toast.success("Komentar berhasil dihapus.");
    } catch (err: any) {
      toast.error(err?.message || "Gagal menghapus komentar.");
    }
  };

  const handleHideConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hideModalCommentId || !hideReason.trim() || hideReason.trim().length < 5) {
      toast.error("Alasan moderasi wajib diisi minimal 5 karakter.");
      return;
    }

    setIsHiding(true);
    try {
      await hideCritiqueCommentAction(hideModalCommentId, artworkSlug, hideReason.trim());
      setHideModalCommentId(null);
      setHideReason("");
      toast.success("Komentar berhasil disembunyikan oleh moderator.");
    } catch (err: any) {
      toast.error(err?.message || "Gagal menyembunyikan komentar.");
    } finally {
      setIsHiding(false);
    }
  };

  const handleRestore = async (commentId: string) => {
    try {
      await restoreCritiqueCommentAction(commentId, artworkSlug);
      toast.success("Komentar berhasil dipulihkan.");
    } catch (err: any) {
      toast.error(err?.message || "Gagal memulihkan komentar.");
    }
  };

  const handleTogglePin = async (commentId: string) => {
    try {
      const res = await togglePinCritiqueAction(commentId, artworkSlug);
      toast.success(res.isPinned ? "Komentar disematkan." : "Semat komentar dicabut.");
    } catch (err: any) {
      toast.error(err?.message || "Gagal menyematkan komentar.");
    }
  };

  // Group root comments and replies
  const rootComments = comments.filter((c) => !c.parentCommentId);
  const replies = comments.filter((c) => c.parentCommentId);

  return (
    <section className="glass-panel p-6 sm:p-8 rounded-3xl flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
        <div className="flex items-center gap-2.5">
          <MessageSquare className="h-5 w-5 text-amber-400" />
          <h3 className="font-display font-bold text-xl text-[#f6f2e9]">
            Apresiasi & Komentar ({comments.length})
          </h3>
        </div>

        {/* Social Flag Only (Blueprint 2.2.2 §7.5) */}
        {isCritiqueWelcome ? (
          <span className="px-3 py-1 rounded-full text-xs font-mono font-medium bg-amber-500/10 text-amber-400 border border-amber-500/30 flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5" />
            <span>Kritik Dipersilakan</span>
          </span>
        ) : (
          <span className="px-3 py-1 rounded-full text-xs font-mono font-medium bg-white/5 text-zinc-400 border border-white/10 flex items-center gap-1.5">
            <span>Showcase</span>
          </span>
        )}
      </div>

      {/* Constructive Code of Conduct Tip */}
      {isCritiqueWelcome ? (
        <div className="p-4 rounded-2xl bg-amber-500/5 border border-amber-500/20 flex items-start gap-3 text-xs">
          <ShieldCheck className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
          <div className="flex flex-col gap-0.5">
            <span className="font-mono font-bold text-amber-300">
              Kreator menyambut kritik & saran konstruktif
            </span>
            <p className="text-zinc-300 leading-relaxed font-sans">
              Berikan masukan berfokus pada teknik, pencahayaan, atau komposisi visual untuk mendukung kemajuan rekan artist.
            </p>
          </div>
        </div>
      ) : null}

      {/* New Unified Comment Form */}
      {currentUserId ? (
        <form onSubmit={handlePostComment} className="flex flex-col gap-3">
          {error ? <span className="text-xs text-red-400">{error}</span> : null}

          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={3}
            placeholder={
              isCritiqueWelcome
                ? "Tuliskan komentar, apresiasi, atau kritik konstruktif..."
                : "Tuliskan apresiasi untuk karya ini..."
            }
            className="w-full px-4 py-3 rounded-2xl bg-white/5 border border-white/10 text-[#f6f2e9] placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-amber-500 text-xs font-sans resize-none"
            required
          />

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={isLoading || !content.trim()}
              className="px-5 py-2.5 min-h-[44px] rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs font-mono transition-all shadow-md shadow-amber-500/20 flex items-center gap-2 cursor-pointer disabled:opacity-40"
            >
              {isLoading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Send className="h-3.5 w-3.5" />
              )}
              <span>Kirim Komentar</span>
            </button>
          </div>
        </form>
      ) : (
        <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
          <span className="text-zinc-400 font-sans">
            Masuk dengan akun anggota aktif Mengart untuk meninggalkan komentar atau balasan.
          </span>
          <Link
            href={`/login?callbackUrl=/artworks/${artworkSlug}`}
            className="px-4 py-2 min-h-[44px] rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold font-mono text-xs flex items-center shrink-0"
          >
            Masuk Akun
          </Link>
        </div>
      )}

      {/* Unified Comments Thread List */}
      <div className="flex flex-col gap-4 mt-2">
        {rootComments.length === 0 ? (
          <span className="text-xs font-mono text-zinc-500 text-center py-6">
            Belum ada komentar untuk karya ini. Jadilah yang pertama meninggalkan apresiasi!
          </span>
        ) : (
          rootComments.map((comment) => {
            const commentReplies = replies.filter((r) => r.parentCommentId === comment.id);
            const isCommentAuthor = currentUserId === comment.userId;
            const isHiddenComment = comment.isHidden;

            // If comment is hidden and viewer is not staff, hide content
            if (isHiddenComment && !isModOrAdmin) {
              return (
                <div
                  key={comment.id}
                  className="p-4 rounded-2xl border border-white/5 bg-white/[0.01] text-xs font-mono text-zinc-500 italic flex items-center gap-2"
                >
                  <EyeOff className="h-3.5 w-3.5" />
                  <span>Komentar ini telah disembunyikan oleh moderator.</span>
                </div>
              );
            }

            return (
              <div
                key={comment.id}
                className={`p-4 rounded-2xl border flex flex-col gap-3 transition-colors ${
                  comment.isPinned
                    ? "border-amber-500/40 bg-amber-500/5 shadow-md shadow-amber-500/5"
                    : isHiddenComment
                    ? "border-rose-500/30 bg-rose-950/20"
                    : "border-white/10 bg-white/[0.02]"
                }`}
              >
                {/* Comment Author Header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-full overflow-hidden bg-white/5 border border-white/10 flex items-center justify-center text-xs font-bold text-amber-400">
                      {comment.artistAvatar ? (
                        <img
                          src={comment.artistAvatar}
                          alt={comment.artistName}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        comment.artistName.charAt(0).toUpperCase()
                      )}
                    </div>
                    <div className="flex flex-col">
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/artists/${comment.artistSlug}`}
                          className="font-display font-semibold text-xs text-[#f6f2e9] hover:text-amber-400 transition-colors"
                        >
                          {comment.artistName}
                        </Link>
                        {comment.userId === artworkOwnerUserId ? (
                          <span className="px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 text-[10px] font-mono border border-amber-500/30">
                            Creator
                          </span>
                        ) : null}
                      </div>
                      <div className="flex items-center gap-1.5 text-[10px] font-mono text-zinc-500">
                        <span>
                          {new Intl.DateTimeFormat("id-ID", {
                            timeZone: "Asia/Makassar",
                            day: "numeric",
                            month: "short",
                            hour: "2-digit",
                            minute: "2-digit",
                          }).format(new Date(comment.createdAt))}
                        </span>
                        {comment.isEdited ? (
                          <span className="text-zinc-400">(diedit)</span>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  {/* Actions (Pin, Edit, Delete, Hide/Restore) */}
                  <div className="flex items-center gap-1">
                    {comment.isPinned ? (
                      <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-[10px] font-mono border border-amber-500/30 flex items-center gap-1 mr-1">
                        <Pin className="h-3 w-3 fill-amber-300" />
                        <span>Disematkan</span>
                      </span>
                    ) : null}

                    {isOwner ? (
                      <button
                        type="button"
                        onClick={() => handleTogglePin(comment.id)}
                        className="p-1.5 min-h-[36px] min-w-[36px] rounded-lg text-zinc-400 hover:text-amber-400 hover:bg-white/5 transition-colors flex items-center justify-center cursor-pointer"
                        title={comment.isPinned ? "Cabut Sematan" : "Sematkan Komentar"}
                        aria-label="Sematkan komentar"
                      >
                        <Pin className="h-3.5 w-3.5" />
                      </button>
                    ) : null}

                    {isCommentAuthor && !isHiddenComment ? (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingCommentId(comment.id);
                          setEditContent(comment.content);
                        }}
                        className="p-1.5 min-h-[36px] min-w-[36px] rounded-lg text-zinc-400 hover:text-white hover:bg-white/5 transition-colors flex items-center justify-center cursor-pointer"
                        title="Edit Komentar"
                        aria-label="Edit komentar"
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                      </button>
                    ) : null}

                    {isCommentAuthor || isModOrAdmin ? (
                      <button
                        type="button"
                        onClick={() => handleDelete(comment.id)}
                        className="p-1.5 min-h-[36px] min-w-[36px] rounded-lg text-zinc-400 hover:text-red-400 hover:bg-white/5 transition-colors flex items-center justify-center cursor-pointer"
                        title="Hapus Komentar"
                        aria-label="Hapus komentar"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    ) : null}

                    {isModOrAdmin ? (
                      isHiddenComment ? (
                        <button
                          type="button"
                          onClick={() => handleRestore(comment.id)}
                          className="px-2 py-1 min-h-[36px] rounded-lg bg-rose-500/20 text-rose-300 hover:bg-rose-500/30 text-[10px] font-mono transition-colors flex items-center gap-1 cursor-pointer"
                          title="Pulihkan Komentar"
                        >
                          <Eye className="h-3 w-3" />
                          <span>Pulihkan</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setHideModalCommentId(comment.id);
                            setHideReason("");
                          }}
                          className="p-1.5 min-h-[36px] min-w-[36px] rounded-lg text-zinc-400 hover:text-amber-400 hover:bg-white/5 transition-colors flex items-center justify-center cursor-pointer"
                          title="Sembunyikan Komentar (Moderator)"
                          aria-label="Sembunyikan komentar"
                        >
                          <EyeOff className="h-3.5 w-3.5" />
                        </button>
                      )
                    ) : null}
                  </div>
                </div>

                {/* Hidden Notice for Staff */}
                {isHiddenComment && isModOrAdmin ? (
                  <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-[11px] font-mono text-rose-300 flex items-center gap-2">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                    <span>
                      Disembunyikan oleh moderator: "{comment.hiddenReason}"
                    </span>
                  </div>
                ) : null}

                {/* Comment Content or Edit Mode */}
                {editingCommentId === comment.id ? (
                  <div className="flex flex-col gap-2 pt-1">
                    <textarea
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      rows={3}
                      className="w-full px-3 py-2 rounded-xl bg-black/40 border border-amber-500/40 text-xs text-[#f6f2e9] focus:outline-none resize-none font-sans"
                      required
                    />
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingCommentId(null);
                          setEditContent("");
                        }}
                        className="px-3 py-1.5 min-h-[36px] rounded-lg bg-white/5 hover:bg-white/10 text-xs font-mono text-zinc-400 cursor-pointer"
                      >
                        Batal
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSaveEdit(comment.id)}
                        disabled={isSavingEdit || !editContent.trim()}
                        className="px-3 py-1.5 min-h-[36px] rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs font-mono flex items-center gap-1 cursor-pointer disabled:opacity-50"
                      >
                        {isSavingEdit ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Check className="h-3 w-3" />
                        )}
                        <span>Simpan</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs sm:text-sm text-zinc-300 leading-relaxed whitespace-pre-line font-sans pl-1">
                    {comment.content}
                  </p>
                )}

                {/* Reply Trigger */}
                {currentUserId && editingCommentId !== comment.id ? (
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() =>
                        setReplyParentId(replyParentId === comment.id ? null : comment.id)
                      }
                      className="text-[11px] font-mono text-zinc-400 hover:text-amber-400 transition-colors flex items-center gap-1 cursor-pointer py-1"
                    >
                      <CornerDownRight className="h-3 w-3" />
                      <span>{replyParentId === comment.id ? "Tutup Balasan" : "Balas"}</span>
                    </button>
                  </div>
                ) : null}

                {/* Inline Reply Form */}
                {replyParentId === comment.id ? (
                  <div className="flex flex-col gap-2 pl-4 border-l-2 border-amber-500/30 mt-2">
                    <textarea
                      value={replyContent}
                      onChange={(e) => setReplyContent(e.target.value)}
                      rows={2}
                      placeholder={`Balas kepada ${comment.artistName}...`}
                      className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/10 text-xs text-white placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-amber-500 resize-none font-sans"
                      required
                    />
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setReplyParentId(null);
                          setReplyContent("");
                        }}
                        className="px-3 py-1.5 min-h-[36px] rounded-lg bg-white/5 hover:bg-white/10 text-xs font-mono text-zinc-400 cursor-pointer"
                      >
                        Batal
                      </button>
                      <button
                        type="button"
                        onClick={() => handlePostReply(comment.id)}
                        disabled={isSubmittingReply || !replyContent.trim()}
                        className="px-3.5 py-1.5 min-h-[36px] rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs font-mono flex items-center gap-1 cursor-pointer disabled:opacity-50"
                      >
                        {isSubmittingReply ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Send className="h-3 w-3" />
                        )}
                        <span>Kirim Balasan</span>
                      </button>
                    </div>
                  </div>
                ) : null}

                {/* Nested Replies List */}
                {commentReplies.length > 0 ? (
                  <div className="flex flex-col gap-3 pl-4 sm:pl-6 border-l-2 border-white/10 mt-2">
                    {commentReplies.map((reply) => {
                      const isReplyAuthor = currentUserId === reply.userId;
                      const isHiddenReply = reply.isHidden;

                      if (isHiddenReply && !isModOrAdmin) {
                        return (
                          <div
                            key={reply.id}
                            className="p-3 rounded-xl border border-white/5 bg-white/[0.01] text-[11px] font-mono text-zinc-500 italic flex items-center gap-2"
                          >
                            <EyeOff className="h-3 w-3" />
                            <span>Balasan ini disembunyikan oleh moderator.</span>
                          </div>
                        );
                      }

                      return (
                        <div
                          key={reply.id}
                          className={`p-3 rounded-xl border flex flex-col gap-2 ${
                            isHiddenReply
                              ? "border-rose-500/30 bg-rose-950/20"
                              : "border-white/5 bg-white/[0.01]"
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <div className="h-6 w-6 rounded-full overflow-hidden bg-white/5 border border-white/10 flex items-center justify-center text-[10px] font-bold text-amber-400">
                                {reply.artistAvatar ? (
                                  <img
                                    src={reply.artistAvatar}
                                    alt={reply.artistName}
                                    className="h-full w-full object-cover"
                                  />
                                ) : (
                                  reply.artistName.charAt(0).toUpperCase()
                                )}
                              </div>
                              <Link
                                href={`/artists/${reply.artistSlug}`}
                                className="font-display font-semibold text-xs text-[#f6f2e9] hover:text-amber-400 transition-colors"
                              >
                                {reply.artistName}
                              </Link>
                              {reply.userId === artworkOwnerUserId ? (
                                <span className="px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 text-[9px] font-mono border border-amber-500/30">
                                  Creator
                                </span>
                              ) : null}
                              <span className="text-[10px] font-mono text-zinc-500">
                                {new Intl.DateTimeFormat("id-ID", {
                                  timeZone: "Asia/Makassar",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                }).format(new Date(reply.createdAt))}
                              </span>
                              {reply.isEdited ? (
                                <span className="text-[10px] font-mono text-zinc-400">
                                  (diedit)
                                </span>
                              ) : null}
                            </div>

                            <div className="flex items-center gap-1">
                              {isReplyAuthor && !isHiddenReply ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingCommentId(reply.id);
                                    setEditContent(reply.content);
                                  }}
                                  className="p-1 rounded text-zinc-400 hover:text-white"
                                  title="Edit Balasan"
                                  aria-label="Edit balasan"
                                >
                                  <Edit2 className="h-3 w-3" />
                                </button>
                              ) : null}

                              {isReplyAuthor || isModOrAdmin ? (
                                <button
                                  type="button"
                                  onClick={() => handleDelete(reply.id)}
                                  className="p-1 rounded text-zinc-400 hover:text-red-400"
                                  title="Hapus Balasan"
                                  aria-label="Hapus balasan"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              ) : null}

                              {isModOrAdmin ? (
                                isHiddenReply ? (
                                  <button
                                    type="button"
                                    onClick={() => handleRestore(reply.id)}
                                    className="text-[9px] font-mono text-rose-300 hover:underline"
                                  >
                                    Pulihkan
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setHideModalCommentId(reply.id);
                                      setHideReason("");
                                    }}
                                    className="p-1 rounded text-zinc-400 hover:text-amber-400"
                                    title="Sembunyikan Balasan"
                                    aria-label="Sembunyikan balasan"
                                  >
                                    <EyeOff className="h-3 w-3" />
                                  </button>
                                )
                              ) : null}
                            </div>
                          </div>

                          {editingCommentId === reply.id ? (
                            <div className="flex flex-col gap-2 pt-1">
                              <textarea
                                value={editContent}
                                onChange={(e) => setEditContent(e.target.value)}
                                rows={2}
                                className="w-full px-3 py-2 rounded-xl bg-black/40 border border-amber-500/40 text-xs text-[#f6f2e9] focus:outline-none resize-none font-sans"
                                required
                              />
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingCommentId(null);
                                    setEditContent("");
                                  }}
                                  className="px-2.5 py-1 rounded bg-white/5 text-xs font-mono text-zinc-400 cursor-pointer"
                                >
                                  Batal
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleSaveEdit(reply.id)}
                                  disabled={isSavingEdit || !editContent.trim()}
                                  className="px-3 py-1 rounded bg-amber-500 text-black font-bold text-xs font-mono cursor-pointer disabled:opacity-50"
                                >
                                  Simpan
                                </button>
                              </div>
                            </div>
                          ) : (
                            <p className="text-xs text-zinc-300 leading-relaxed whitespace-pre-line font-sans">
                              {reply.content}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            );
          })
        )}
      </div>

      {/* Staff Hide Comment Modal */}
      {hideModalCommentId ? (
        <div
          role="dialog"
          aria-labelledby="hide-comment-title"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"
        >
          <div className="w-full max-w-md rounded-3xl bg-[#0e1015] border border-rose-500/40 shadow-2xl p-6 flex flex-col gap-5">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-rose-400" />
                <h3 id="hide-comment-title" className="font-display font-bold text-base text-[#f6f2e9]">
                  Sembunyikan Komentar (Moderasi)
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setHideModalCommentId(null)}
                className="p-1 rounded-lg text-zinc-400 hover:text-white"
                aria-label="Tutup dialog"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleHideConfirm} className="flex flex-col gap-4">
              <p className="text-xs text-zinc-400 font-sans leading-relaxed">
                Komentar akan disembunyikan dari audiens publik, namun tetap tercatat dalam log audit staf.
              </p>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="hide-reason" className="text-xs font-mono text-zinc-300">
                  Alasan Moderasi (Wajib min. 5 karakter):
                </label>
                <input
                  id="hide-reason"
                  type="text"
                  value={hideReason}
                  onChange={(e) => setHideReason(e.target.value)}
                  placeholder="Misal: Mengandung ujaran kebencian / spam"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-black/50 border border-white/15 text-xs text-[#f6f2e9] font-sans focus:outline-none focus:ring-2 focus:ring-rose-500"
                  required
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setHideModalCommentId(null)}
                  disabled={isHiding}
                  className="px-4 py-2 min-h-[44px] rounded-xl bg-white/5 hover:bg-white/10 text-xs font-mono text-zinc-300 cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isHiding || hideReason.trim().length < 5}
                  className="px-4 py-2 min-h-[44px] rounded-xl bg-rose-500 hover:bg-rose-600 text-white font-bold text-xs font-mono transition-all flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                >
                  {isHiding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                  <span>Sembunyikan Komentar</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </section>
  );
}
