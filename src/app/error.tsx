"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Global application runtime error:", error);
  }, [error]);

  return (
    <div className="min-h-[75vh] flex flex-col items-center justify-center text-center px-4 py-16">
      <div className="w-16 h-16 rounded-2xl bg-red-950/30 border border-red-500/30 flex items-center justify-center text-red-400 mb-6 shadow-xl shadow-red-950/20">
        <AlertTriangle className="w-8 h-8" />
      </div>
      <h1 className="text-2xl sm:text-3xl font-serif text-white font-medium mb-3">
        Terjadi Kesalahan di Atelier
      </h1>
      <p className="text-sm text-zinc-400 max-w-md mb-8 leading-relaxed">
        Sistem mengalami gangguan tak terduga saat memproses permintaan Anda. Tim teknis atelier telah mencatat kejadian ini.
      </p>

      <div className="flex flex-col sm:flex-row items-center gap-3 w-full max-w-xs">
        <button
          onClick={() => reset()}
          className="w-full flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-semibold text-sm transition-all shadow-lg shadow-amber-500/10 min-h-[44px]"
        >
          <RefreshCw className="w-4 h-4" />
          <span>Coba Lagi</span>
        </button>
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
