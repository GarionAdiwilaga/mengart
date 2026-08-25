import Link from "next/link";
import { Sparkles, Palette, Trophy, ShieldCheck, ArrowRight } from "lucide-react";

export default function HomePage() {
  return (
    <main className="min-h-screen flex flex-col justify-between p-6 sm:p-12 max-w-7xl mx-auto">
      {/* Navigation Header */}
      <header className="flex items-center justify-between py-4 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-amber-500 to-amber-700 flex items-center justify-center shadow-lg shadow-amber-500/20">
            <Palette className="h-5 w-5 text-black" />
          </div>
          <span className="font-display font-bold text-2xl tracking-tight text-[#f6f2e9]">
            Mengart
          </span>
        </div>
        <div className="flex items-center gap-4">
          <Link
            href="/login"
            className="px-4 py-2 text-sm font-medium text-zinc-300 hover:text-white transition-colors"
          >
            Masuk Anggota
          </Link>
          <Link
            href="/gallery"
            className="px-4 py-2 text-sm font-semibold rounded-xl bg-amber-500 text-black hover:bg-amber-400 transition-all duration-200 shadow-md shadow-amber-500/20 flex items-center gap-1.5 cursor-pointer"
          >
            Jelajahi Galeri <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </header>

      {/* Hero Section */}
      <section className="py-20 sm:py-28 flex flex-col items-start gap-8">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-400 text-xs font-mono tracking-wide">
          <Sparkles className="h-3.5 w-3.5" />
          <span>KOMUNITAS DIGITAL ART & ATELIER</span>
        </div>

        <h1 className="font-display text-4xl sm:text-6xl lg:text-7xl font-extrabold text-[#f6f2e9] tracking-tight leading-[1.1]">
          Ruang Karya & <br />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-400 via-amber-200 to-amber-500">
            Kolektif Kreator Digital.
          </span>
        </h1>

        <p className="text-lg sm:text-xl text-zinc-400 max-w-2xl font-sans leading-relaxed">
          Atelier digital khusus kreator seni visual. Temukan portofolio terkurasi, buka layanan komisi langsung via WhatsApp, dan ikuti community challenge dengan sistem voting Stars yang adil.
        </p>

        {/* Feature Highlights Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 w-full mt-6">
          <div className="glass-panel p-6 rounded-2xl flex flex-col gap-3">
            <div className="h-10 w-10 rounded-lg bg-white/5 flex items-center justify-center text-amber-400">
              <Palette className="h-5 w-5" />
            </div>
            <h3 className="font-display font-semibold text-lg text-[#f6f2e9]">Portofolio Terkurasi</h3>
            <p className="text-sm text-zinc-400 leading-relaxed">
              Showcase publik ber-watermark terlindungi berdampingan dengan arsip master penuh bagi sesama anggota.
            </p>
          </div>

          <div className="glass-panel p-6 rounded-2xl flex flex-col gap-3">
            <div className="h-10 w-10 rounded-lg bg-white/5 flex items-center justify-center text-amber-400">
              <Trophy className="h-5 w-5" />
            </div>
            <h3 className="font-display font-semibold text-lg text-[#f6f2e9]">Art Challenge</h3>
            <p className="text-sm text-zinc-400 leading-relaxed">
              Voting suara anonim dengan alokasi Stars serta penilaian juri tanpa bias urutan scroll.
            </p>
          </div>

          <div className="glass-panel p-6 rounded-2xl flex flex-col gap-3">
            <div className="h-10 w-10 rounded-lg bg-white/5 flex items-center justify-center text-amber-400">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <h3 className="font-display font-semibold text-lg text-[#f6f2e9]">Pusat Komisi</h3>
            <p className="text-sm text-zinc-400 leading-relaxed">
              Informasi ketersediaan slot, transparansi ketentuan do/don't, dan pemesanan langsung via WhatsApp.
            </p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-6 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-zinc-500 font-mono">
        <div>© {new Date().getFullYear()} Mengart Community. Hak cipta dilindungi.</div>
        <div className="flex items-center gap-6">
          <span>Zona Waktu: Asia/Makassar (WITA)</span>
          <span>Status: Fase 1 Selesai</span>
        </div>
      </footer>
    </main>
  );
}
