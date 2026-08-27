import Link from "next/link";
import { Palette } from "lucide-react";

export function AppFooter() {
  return (
    <footer className="w-full border-t border-white/10 bg-[#0e1015] py-8 mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs font-mono text-zinc-500">
        <div className="flex items-center gap-2">
          <Palette className="h-4 w-4 text-amber-500" />
          <span className="text-zinc-400 font-sans font-semibold">Mengart Atelier</span>
          <span>— Komunitas Kreator Seni Visual Digital Privat (WITA)</span>
        </div>

        <nav className="flex items-center gap-5 text-zinc-400">
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
        </nav>
      </div>
    </footer>
  );
}
