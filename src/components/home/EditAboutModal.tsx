"use client";

import { useState } from "react";
import { updateSiteSettingAction } from "@/app/actions/settings";
import { Edit3, X, Loader2, Check } from "lucide-react";
import { toast } from "sonner";

interface EditAboutModalProps {
  initialContent: string;
}

export function EditAboutModal({ initialContent }: EditAboutModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [content, setContent] = useState(initialContent);
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;

    setIsSaving(true);
    try {
      await updateSiteSettingAction("about_community", content.trim());
      toast.success("Deskripsi Tentang Komunitas berhasil diperbarui.");
      setIsOpen(false);
    } catch (err: any) {
      toast.error(err?.message || "Gagal memperbarui deskripsi.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="px-3.5 py-2 min-h-[44px] rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 text-xs font-mono font-medium flex items-center gap-1.5 transition-colors focus:outline-none focus:ring-2 focus:ring-amber-500 cursor-pointer"
        aria-label="Edit deskripsi Tentang Komunitas"
      >
        <Edit3 className="h-3.5 w-3.5" />
        <span>Edit Tentang Komunitas (Admin)</span>
      </button>

      {isOpen ? (
        <div
          role="dialog"
          aria-labelledby="edit-about-title"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"
        >
          <div className="w-full max-w-2xl rounded-3xl bg-[#0e1015] border border-amber-500/30 shadow-2xl p-6 sm:p-8 flex flex-col gap-6">
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div className="flex items-center gap-2.5">
                <div className="h-9 w-9 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
                  <Edit3 className="h-4 w-4" />
                </div>
                <div>
                  <h3 id="edit-about-title" className="font-display font-bold text-lg text-[#f6f2e9]">
                    Edit "Tentang Komunitas Mengart"
                  </h3>
                  <p className="text-xs text-zinc-400 font-sans">
                    Perubahan akan langsung tampil pada beranda publik Mengart Atelier.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="p-2 min-h-[44px] min-w-[44px] rounded-xl text-zinc-400 hover:text-white hover:bg-white/5 transition-colors flex items-center justify-center cursor-pointer"
                aria-label="Tutup dialog"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="flex flex-col gap-5">
              <div className="flex flex-col gap-2">
                <label htmlFor="about-content" className="text-xs font-mono text-zinc-300">
                  Konten Narasi / Profil Atelier:
                </label>
                <textarea
                  id="about-content"
                  rows={6}
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Tuliskan visi, kurasi karya, dan etos kolektif Mengart Atelier..."
                  className="w-full rounded-2xl bg-black/50 border border-white/15 p-4 text-sm text-[#f6f2e9] font-sans placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-amber-500 resize-y"
                  required
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  disabled={isSaving}
                  className="px-4 py-2.5 min-h-[44px] rounded-xl bg-white/5 hover:bg-white/10 text-xs font-mono text-zinc-300 transition-colors cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSaving || !content.trim()}
                  className="px-5 py-2.5 min-h-[44px] rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-xs font-mono font-bold transition-all shadow-md shadow-amber-500/20 flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      <span>Menyimpan...</span>
                    </>
                  ) : (
                    <>
                      <Check className="h-3.5 w-3.5" />
                      <span>Simpan Perubahan</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
