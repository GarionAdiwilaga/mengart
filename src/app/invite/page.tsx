import { Metadata } from "next";
import { redirect } from "next/navigation";
import { extractInviteToken, validateInviteToken } from "@/lib/invites";
import Link from "next/link";
import { Palette, Key, Sparkles, ArrowRight, ShieldCheck } from "lucide-react";

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
  },
};

interface InviteEntryPageProps {
  searchParams: Promise<{
    error?: string;
  }>;
}

export default async function InviteEntryPage({ searchParams }: InviteEntryPageProps) {
  const { error } = await searchParams;

  async function handleInviteSubmit(formData: FormData) {
    "use server";
    const rawInput = formData.get("inviteInput") as string;
    const token = extractInviteToken(rawInput);

    if (!token) {
      redirect("/invite?error=InvalidFormat");
    }

    redirect(`/invite/${encodeURIComponent(token)}`);
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-md glass-panel p-8 sm:p-10 rounded-3xl flex flex-col gap-6 relative overflow-hidden border border-white/10 shadow-2xl">
        {/* Top Glow */}
        <div className="absolute -top-16 -right-16 h-36 w-36 rounded-full bg-amber-500/10 blur-3xl pointer-events-none" />

        {/* Branding Header */}
        <div className="flex flex-col items-center text-center gap-3">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-amber-500 to-amber-700 flex items-center justify-center shadow-lg shadow-amber-500/20">
              <Palette className="h-6 w-6 text-black" />
            </div>
          </Link>
          <div className="flex flex-col gap-1">
            <h1 className="font-display font-extrabold text-2xl text-[#f6f2e9] tracking-tight">
              Akses Undangan Mengart
            </h1>
            <p className="text-xs text-zinc-400 font-sans">
              Masukkan kode undangan atau tempelkan seluruh tautan undangan yang Anda terima.
            </p>
          </div>
        </div>

        {error ? (
          <div className="p-3.5 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs text-center">
            {error === "InvalidFormat"
              ? "Format kode atau tautan undangan tidak dikenali. Silakan periksa kembali."
              : "Undangan tidak valid atau telah kedaluwarsa."}
          </div>
        ) : null}

        {/* Form */}
        <form action={handleInviteSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-mono text-zinc-300 flex items-center gap-1.5">
              <Key className="h-3.5 w-3.5 text-amber-400" />
              <span>KODE ATAU TAUTAN UNDANGAN</span>
            </label>
            <input
              type="text"
              name="inviteInput"
              required
              placeholder="e.g. inv_a8f9c2... atau https://mengart.art/invite/..."
              className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-zinc-600 focus:outline-none focus:border-amber-500/60 text-xs font-mono"
            />
            <span className="text-[11px] text-zinc-500 font-sans">
              Anda dapat memasukkan kode token saja atau menempel URL undangan lengkap.
            </span>
          </div>

          <button
            type="submit"
            className="w-full mt-2 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-sm transition-all duration-200 shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2 cursor-pointer"
          >
            <span>Lanjutkan Pendaftaran</span>
            <ArrowRight className="h-4 w-4" />
          </button>
        </form>

        <div className="pt-4 border-t border-white/10 flex flex-col items-center gap-2 text-center text-xs text-zinc-400">
          <span>Sudah memiliki akun member?</span>
          <Link
            href="/login"
            className="font-mono text-amber-400 hover:text-amber-300 transition-colors"
          >
            Masuk ke Akun →
          </Link>
        </div>
      </div>
    </main>
  );
}
