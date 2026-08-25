import { db } from "@/db";
import { artworks, artworkVersions, profiles } from "@/db/schema";
import { eq, desc, and, or, ilike } from "drizzle-orm";
import Link from "next/link";
import { Palette, Sparkles, Filter, Search, Film, MessageSquare, ArrowRight, User } from "lucide-react";

interface GalleryPageProps {
  searchParams: Promise<{
    q?: string;
    critique?: string;
  }>;
}

export default async function PublicGalleryPage({ searchParams }: GalleryPageProps) {
  const { q, critique } = await searchParams;

  // Build query
  const queryFilters = [
    eq(artworks.audience, "public"),
    eq(artworks.publicationStatus, "published"),
  ];

  if (critique === "open") {
    queryFilters.push(eq(artworks.critiqueMode, "open_for_critique"));
  }

  if (q) {
    queryFilters.push(
      or(ilike(artworks.title, `%${q}%`), ilike(artworks.description, `%${q}%`))!
    );
  }

  const galleryItems = await db
    .select({
      id: artworks.id,
      title: artworks.title,
      slug: artworks.slug,
      critiqueMode: artworks.critiqueMode,
      createdAt: artworks.createdAt,
      mediaType: artworks.mediaType,
      artistName: profiles.displayName,
      artistSlug: profiles.slug,
      artistAvatar: profiles.avatarUrl,
      thumbnailStorageKey: artworkVersions.thumbnailStorageKey,
      publicStorageKey: artworkVersions.publicStorageKey,
      width: artworkVersions.width,
      height: artworkVersions.height,
    })
    .from(artworks)
    .innerJoin(profiles, eq(profiles.userId, artworks.userId))
    .innerJoin(artworkVersions, eq(artworkVersions.id, artworks.currentVersionId))
    .where(and(...queryFilters))
    .orderBy(desc(artworks.createdAt));

  return (
    <main className="min-h-screen p-6 sm:p-12 max-w-7xl mx-auto flex flex-col gap-8">
      {/* Global Navigation Header */}
      <header className="flex items-center justify-between border-b border-white/10 pb-4">
        <div className="flex items-center gap-3">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-amber-500 to-amber-700 flex items-center justify-center shadow-lg shadow-amber-500/20">
              <Palette className="h-4 w-4 text-black" />
            </div>
            <span className="font-display font-bold text-xl text-[#f6f2e9]">Mengart</span>
          </Link>

          <nav className="hidden md:flex items-center gap-6 ml-6 text-sm">
            <Link href="/gallery" className="text-amber-400 font-semibold">
              Galeri
            </Link>
            <Link href="/artists" className="text-zinc-400 hover:text-white transition-colors">
              Artist
            </Link>
            <Link href="/commissions" className="text-zinc-400 hover:text-white transition-colors">
              Komisi
            </Link>
          </nav>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/login"
            className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white text-xs font-mono transition-colors"
          >
            Masuk Anggota
          </Link>
        </div>
      </header>

      {/* Hero Title & Search Bar */}
      <section className="flex flex-col sm:flex-row sm:items-end justify-between gap-6">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-400 text-xs font-mono mb-2">
            <Sparkles className="h-3 w-3" />
            <span>SHOWCASE KARYA TERKURASI</span>
          </div>
          <h1 className="font-display font-extrabold text-3xl sm:text-4xl text-[#f6f2e9] tracking-tight">
            Galeri Komunitas
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            Eksplorasi karya ilustrasi, 3D, dan motion dari para kreator atelier digital.
          </p>
        </div>

        {/* Search Input */}
        <form method="GET" action="/gallery" className="w-full sm:w-72 relative">
          <input
            type="text"
            name="q"
            defaultValue={q || ""}
            placeholder="Cari judul karya..."
            className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-zinc-500 text-xs font-sans focus:outline-none focus:border-amber-500/50"
          />
          <Search className="h-4 w-4 text-zinc-500 absolute left-3 top-3" />
        </form>
      </section>

      {/* Gallery Masonry Layout */}
      {galleryItems.length === 0 ? (
        <div className="glass-panel p-16 rounded-3xl flex flex-col items-center justify-center text-center gap-3">
          <Palette className="h-10 w-10 text-zinc-600" />
          <h3 className="font-display font-bold text-lg text-white">Belum ada karya ditemukan</h3>
          <p className="text-xs text-zinc-400 max-w-sm">
            Coba ubah kata kunci pencarian Anda.
          </p>
          <Link
            href="/gallery"
            className="mt-2 text-xs font-mono text-amber-400 hover:text-amber-300 transition-colors"
          >
            Reset Pencarian →
          </Link>
        </div>
      ) : (
        <div className="columns-1 sm:columns-2 md:columns-3 lg:columns-4 gap-6 space-y-6">
          {galleryItems.map((item) => {
            const thumbUrl = item.thumbnailStorageKey
              ? `/api/media/public/${item.thumbnailStorageKey}`
              : null;

            return (
              <div
                key={item.id}
                className="break-inside-avoid glass-panel rounded-2xl overflow-hidden group transition-all duration-200 hover:border-white/20 flex flex-col justify-between"
              >
                <Link href={`/artworks/${item.slug}`} className="block relative overflow-hidden bg-black/40">
                  {thumbUrl ? (
                    <img
                      src={thumbUrl}
                      alt={item.title}
                      className="w-full h-auto object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                      loading="lazy"
                    />
                  ) : (
                    <div className="aspect-[4/3] flex items-center justify-center">
                      <Palette className="h-8 w-8 text-zinc-700" />
                    </div>
                  )}

                  {/* Overlay Badges */}
                  <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5">
                    {item.mediaType === "video" || item.mediaType === "gif" ? (
                      <span className="px-2 py-0.5 rounded-md bg-black/70 backdrop-blur-md text-[10px] font-mono uppercase text-amber-300 border border-white/10 flex items-center gap-1">
                        <Film className="h-3 w-3" />
                        {item.mediaType}
                      </span>
                    ) : null}
                    {item.critiqueMode === "open_for_critique" ? (
                      <span className="px-2 py-0.5 rounded-md bg-black/70 backdrop-blur-md text-[10px] font-mono text-emerald-400 border border-white/10 flex items-center gap-1">
                        <MessageSquare className="h-3 w-3" />
                        Critique
                      </span>
                    ) : null}
                  </div>
                </Link>

                {/* Card Footer */}
                <div className="p-4 flex flex-col gap-2">
                  <Link href={`/artworks/${item.slug}`}>
                    <h3 className="font-display font-bold text-sm text-[#f6f2e9] group-hover:text-amber-300 transition-colors truncate">
                      {item.title}
                    </h3>
                  </Link>

                  <div className="flex items-center justify-between pt-2 border-t border-white/5 text-xs">
                    <Link
                      href={`/artists/${item.artistSlug}`}
                      className="flex items-center gap-1.5 text-zinc-400 hover:text-white transition-colors"
                    >
                      <User className="h-3.5 w-3.5 text-amber-400" />
                      <span className="truncate max-w-[120px]">{item.artistName}</span>
                    </Link>

                    <span className="text-[11px] font-mono text-zinc-500 truncate max-w-[100px] uppercase">
                      {item.mediaType}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
