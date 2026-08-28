import Link from "next/link";
import { Compass, Home, ArrowLeft } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-[75vh] flex flex-col items-center justify-center text-center px-4 py-16">
      <div className="w-16 h-16 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-amber-400 mb-6 shadow-xl">
        <Compass className="w-8 h-8 animate-pulse" />
      </div>
      <p className="text-xs font-mono tracking-widest text-amber-500 uppercase font-semibold mb-2">
        404 — Not Found
      </p>
      <h1 className="text-3xl sm:text-4xl font-serif text-white font-medium mb-3">
        Ruang Tidak Ditemukan
      </h1>
      <p className="text-sm text-zinc-400 max-w-md mb-8 leading-relaxed">
        Karya seni, profil artist, atau tantangan yang Anda cari tidak tersedia, telah diarsipkan, atau tautan yang dimasukkan salah.
      </p>

      <div className="flex flex-col sm:flex-row items-center gap-3 w-full max-w-xs">
        <Link
          href="/gallery"
          className="w-full flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-semibold text-sm transition-all shadow-lg shadow-amber-500/10 min-h-[44px]"
        >
          <span>Jelajahi Galeri</span>
        </Link>
        <Link
          href="/"
          className="w-full flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 font-medium text-sm transition-all min-h-[44px]"
        >
          <Home className="w-4 h-4" />
          <span>Beranda</span>
        </Link>
      </div>
    </div>
  );
}
