import { auth } from "@/auth";
import { Sparkles, Palette } from "lucide-react";
import { GalleryGrid } from "@/components/gallery/GalleryGrid";

export default async function PublicGalleryPage() {
  const session = await auth();

  return (
    <main className="p-6 sm:p-12 max-w-7xl mx-auto flex flex-col gap-8 flex-1">
      {/* Hero Header */}
      <section className="flex flex-col gap-2">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-400 text-xs font-mono w-fit">
          <Sparkles className="h-3 w-3" />
          <span>SHOWCASE KARYA DIGITAL TERKURASI</span>
        </div>
        <h1 className="font-display font-extrabold text-3xl sm:text-4xl text-[#f6f2e9] tracking-tight">
          Galeri Kolektif Atelier
        </h1>
        <p className="text-xs sm:text-sm text-zinc-400 max-w-2xl font-sans leading-relaxed">
          Eksplorasi karya ilustrasi konsep, 3D, dan motion visual dari rekan artist komunitas. Anggota terverifikasi dapat mengakses arsip master beresolusi penuh.
        </p>
      </section>

      {/* Reactive Gallery Grid with React Query & Zustand */}
      <GalleryGrid currentUserRole={session?.user?.role} />
    </main>
  );
}
