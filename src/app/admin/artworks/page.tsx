import { requireModerator } from "@/lib/rbac";
import { db } from "@/db";
import { artworks, artworkVersions, profiles } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { Palette, Sparkles, Eye, Star, Ban } from "lucide-react";
import Link from "next/link";
import { ArtworkAdminMenu } from "@/components/gallery/ArtworkAdminMenu";

export default async function AdminArtworksPage() {
  const sessionUser = await requireModerator("/login");

  const allArtworks = await db
    .select({
      id: artworks.id,
      title: artworks.title,
      slug: artworks.slug,
      publicationStatus: artworks.publicationStatus,
      audience: artworks.audience,
      mediaType: artworks.mediaType,
      critiqueMode: artworks.critiqueMode,
      createdAt: artworks.createdAt,
      artistName: profiles.displayName,
      artistSlug: profiles.slug,
      artistProfileId: profiles.id,
      thumbnailStorageKey: artworkVersions.thumbnailStorageKey,
      masterStorageKey: artworkVersions.masterStorageKey,
      fileSizeBytes: artworkVersions.fileSizeBytes,
      processingStatus: artworkVersions.processingStatus,
    })
    .from(artworks)
    .innerJoin(profiles, eq(profiles.userId, artworks.userId))
    .leftJoin(artworkVersions, eq(artworkVersions.id, artworks.currentVersionId))
    .orderBy(desc(artworks.createdAt));

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col gap-1">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-400 text-xs font-mono w-fit">
          <Sparkles className="h-3 w-3" />
          <span>KURASI & ARSIP KARYA ATELIER</span>
        </div>
        <h1 className="font-display font-extrabold text-2xl sm:text-3xl text-[#f6f2e9] tracking-tight">
          Manajemen & Kurasi Galeri
        </h1>
        <p className="text-xs text-zinc-400 font-sans">
          Inspeksi file master beresolusi penuh, tetapkan Artist of the Month / Spotlight, dan lakukan penegakan konten.
        </p>
      </div>

      {/* Artworks Table */}
      <div className="glass-panel rounded-3xl overflow-hidden border border-white/10 shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-sans">
            <thead className="bg-white/5 border-b border-white/10 text-[11px] font-mono text-zinc-400 uppercase">
              <tr>
                <th className="py-3.5 px-5">Karya & Preview</th>
                <th className="py-3.5 px-4">Artist</th>
                <th className="py-3.5 px-4">Status Publikasi</th>
                <th className="py-3.5 px-4">Visibilitas</th>
                <th className="py-3.5 px-4">Media</th>
                <th className="py-3.5 px-4">Tanggal (WITA)</th>
                <th className="py-3.5 px-5 text-right">Tindakan Admin</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-white/5">
              {allArtworks.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-zinc-500 font-mono text-xs">
                    Belum ada karya yang diunggah ke atelier.
                  </td>
                </tr>
              ) : (
                allArtworks.map((art) => {
                  const timeStr = new Intl.DateTimeFormat("id-ID", {
                    timeZone: "Asia/Makassar",
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  }).format(new Date(art.createdAt));

                  return (
                    <tr key={art.id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="py-3.5 px-5">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-14 rounded-xl overflow-hidden bg-black/50 shrink-0 border border-white/10">
                            {art.thumbnailStorageKey ? (
                              <img
                                src={`/api/media/public/${art.thumbnailStorageKey}`}
                                alt={art.title}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-[10px] text-zinc-600 font-mono">
                                No img
                              </div>
                            )}
                          </div>
                          <div className="flex flex-col">
                            <Link
                              href={`/artworks/${art.slug}`}
                              className="font-display font-bold text-sm text-[#f6f2e9] hover:text-amber-300 transition-colors line-clamp-1"
                            >
                              {art.title}
                            </Link>
                            <span className="text-[10px] font-mono text-zinc-500">
                              Slug: /{art.slug}
                            </span>
                          </div>
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        <Link
                          href={`/artists/${art.artistSlug}`}
                          className="text-zinc-300 hover:text-amber-300 font-medium transition-colors"
                        >
                          {art.artistName}
                        </Link>
                      </td>

                      <td className="py-3.5 px-4 font-mono">
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase border ${
                            art.publicationStatus === "published"
                              ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                              : "bg-red-500/10 text-red-400 border-red-500/30"
                          }`}
                        >
                          {art.publicationStatus}
                        </span>
                      </td>

                      <td className="py-3.5 px-4 font-mono text-[11px] text-zinc-400 uppercase">
                        {art.audience}
                      </td>

                      <td className="py-3.5 px-4 font-mono text-[11px] text-zinc-300 uppercase">
                        {art.mediaType}
                      </td>

                      <td className="py-3.5 px-4 font-mono text-[11px] text-zinc-400">
                        {timeStr} WITA
                      </td>

                      <td className="py-3.5 px-5 text-right">
                        <ArtworkAdminMenu
                          artworkId={art.id}
                          artworkTitle={art.title}
                          artistProfileId={art.artistProfileId}
                          masterStorageKey={art.masterStorageKey}
                          currentUserRole={sessionUser.role}
                        />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
