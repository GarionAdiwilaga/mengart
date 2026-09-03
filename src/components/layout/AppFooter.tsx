import Link from "next/link";
import { Palette, Clock } from "lucide-react";

export function AppFooter() {
  return (
    <footer className="w-full border-t border-white/10 bg-[#0e1015] py-8 mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-8 flex flex-col sm:flex-row items-center justify-between gap-6 text-xs font-mono text-zinc-500">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-4">
          <div className="flex items-center gap-2">
            <Palette className="h-4 w-4 text-amber-500" />
            <span className="text-zinc-300 font-sans font-semibold">Mengart Atelier</span>
          </div>
          <span className="hidden sm:inline text-zinc-700">|</span>
          <div className="flex items-center gap-1.5 text-zinc-400">
            <Clock className="h-3.5 w-3.5 text-amber-400/80" />
            <span>Zona Waktu Operasional: WITA (Asia/Makassar · UTC+8)</span>
          </div>
        </div>

        <nav className="flex flex-wrap items-center gap-5 text-zinc-400">
          <Link href="/gallery" className="hover:text-amber-400 transition-colors">
            Galeri
          </Link>
          <Link href="/artists" className="hover:text-amber-400 transition-colors">
            Artist
          </Link>
          <Link href="/commissions" className="hover:text-amber-400 transition-colors">
            Komisi
          </Link>
          <Link href="/challenges" className="hover:text-amber-400 transition-colors">
            Challenge
          </Link>
          <Link href="/invite" className="hover:text-amber-400 transition-colors">
            Gabung Kolektif
          </Link>
        </nav>
      </div>
      <div className="max-w-7xl mx-auto px-4 sm:px-8 mt-4 pt-4 border-t border-white/5 flex flex-col sm:flex-row items-center justify-between gap-2 text-[11px] font-mono text-zinc-600">
        <p>© {new Date().getFullYear()} Mengart Atelier. All rights reserved.</p>
        <p>Atelier Privat & Platform Portofolio Terkurasi Kreator Visual Indonesia.</p>
      </div>
    </footer>
  );
}
