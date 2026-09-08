import { requireAuth } from "@/lib/rbac";
import { db } from "@/db";
import { artworks, artworkVersions, profiles, portfolioEntries } from "@/db/schema";
import { eq, desc, and, isNull } from "drizzle-orm";
import Link from "next/link";
import { ArrowLeft, Image as ImageIcon, Sparkles, Film, Clock, ExternalLink } from "lucide-react";
import { UploadArtworkModal } from "@/components/portfolio/UploadArtworkModal";
import { DeleteArtworkButton } from "@/components/portfolio/DeleteArtworkButton";
import { PortfolioItemActions } from "@/components/portfolio/PortfolioItemActions";
import { StudioShell } from "@/components/layout/shells/StudioShell";

export default async function PortfolioManagerPage() {
  const user = await requireAuth("/login");

  const [profile] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.userId, user.id))
    .limit(1);

  if (!profile) {
    return (
      <StudioShell headerTitle="Studio Portofolio">
        <div className="glass-panel p-12 rounded-3xl text-center flex flex-col items-center gap-3">
          <p className="text-zinc-400 font-mono text-sm">Profil tidak ditemukan.</p>
        </div>
      </StudioShell>
    );
  }

  const artworksList = await db
    .select({
      id: artworks.id,
      title: artworks.title,
      slug: artworks.slug,
      audience: artworks.audience,
      critiqueMode: artworks.critiqueMode,
      isSpoiler: artworks.isSpoiler,
      publicationStatus: artworks.publicationStatus,
      createdAt: artworks.createdAt,
      mediaType: artworks.mediaType,
      versionId: artworkVersions.id,
      thumbnailStorageKey: artworkVersions.thumbnailStorageKey,
      publicStorageKey: artworkVersions.publicStorageKey,
      width: artworkVersions.width,
      height: artworkVersions.height,
      processingStatus: artworkVersions.processingStatus,
      isVisible: portfolioEntries.isVisible,
      systemCaption: portfolioEntries.systemCaption,
      customCaption: portfolioEntries.customCaption,
    })
    .from(artworks)
    .leftJoin(
      portfolioEntries,
      and(
        eq(portfolioEntries.artworkId, artworks.id),
        eq(portfolioEntries.profileId, profile.id)
      )
    )
    .leftJoin(artworkVersions, eq(artworkVersions.id, artworks.currentVersionId))
    .where(and(eq(artworks.userId, user.id), isNull(artworks.deletedAt)))
    .orderBy(desc(artworks.createdAt));

  return (
    <StudioShell
      headerTitle="Vault Portofolio Saya"
      headerSubtitle="Kelola arsip master, versi publik terlindungi, dan kurasi etalase profil Anda."
      rightAction={<UploadArtworkModal />}
    >
      {/* Artworks List */}
      {artworksList.length === 0 ? (
        <div className="glass-panel p-12 rounded-3xl flex flex-col items-center justify-center text-center gap-4">
          <div className="h-14 w-14 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
            <ImageIcon className="h-7 w-7" />
          </div>
          <div>
            <h3 className="font-display font-bold text-lg text-[#f6f2e9]">Belum ada karya diunggah</h3>
            <p className="text-xs text-zinc-400 max-w-md mt-1">
              Mulai unggah karya ilustrasi, 3D, atau animasi Anda. Sistem akan otomatis membersihkan metadata dan membuat versi publik yang aman.
            </p>
          </div>
          <UploadArtworkModal />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {artworksList.map((art) => {
            const isProcessing =
              art.processingStatus === "pending" ||
              art.processingStatus === "processing" ||
              art.publicationStatus === "processing";
            const isFailed =
              art.processingStatus === "failed" || art.publicationStatus === "processing_failed";
            const thumbUrl = art.thumbnailStorageKey
              ? `/api/media/public/${art.thumbnailStorageKey}`
              : null;

            const effectiveCaption = art.customCaption || art.systemCaption;

            return (
              <div
                key={art.id}
                className="glass-panel rounded-2xl overflow-hidden flex flex-col justify-between group transition-all duration-200 hover:border-white/20"
              >
                {/* Artwork Thumbnail Container */}
                <div className="aspect-[4/3] bg-black/40 relative overflow-hidden flex items-center justify-center">
                  {thumbUrl ? (
                    <img
                      src={thumbUrl}
                      alt={art.title}
                      className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                  ) : isProcessing ? (
                    <div className="flex flex-col items-center gap-2 p-4 text-center">
                      <Clock className="h-6 w-6 text-amber-400 animate-spin" />
                      <span className="text-[11px] font-mono text-amber-300">Memproses Media...</span>
                    </div>
                  ) : (
                    <ImageIcon className="h-8 w-8 text-zinc-600" />
                  )}

                  {/* Badges on Thumbnail */}
                  <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5">
                    {art.mediaType === "video" ? (
                      <span className="px-2 py-0.5 rounded-md bg-black/70 backdrop-blur-md text-[10px] font-mono uppercase text-amber-300 border border-white/10 flex items-center gap-1">
                        <Film className="h-3 w-3" />
                        {art.mediaType}
                      </span>
                    ) : null}
                    <span className="px-2 py-0.5 rounded-md bg-black/70 backdrop-blur-md text-[10px] font-mono uppercase text-zinc-300 border border-white/10">
                      {art.audience}
                    </span>
                  </div>

                  {isFailed ? (
                    <div className="absolute inset-0 bg-red-950/80 backdrop-blur-sm flex items-center justify-center p-3 text-center">
                      <span className="text-xs font-mono text-red-300">Gagal Memproses Media</span>
                    </div>
                  ) : null}
                </div>

                {/* Metadata & Actions */}
                <div className="p-4 flex flex-col gap-3">
                  <div>
                    <h4 className="font-display font-bold text-sm text-[#f6f2e9] truncate" title={art.title}>
                      {art.title}
                    </h4>
                    <span className="text-[11px] font-mono text-zinc-400 truncate block uppercase">
                      {art.mediaType} • {art.critiqueMode}
                    </span>
                    {effectiveCaption && (
                      <span className="text-[11px] font-sans text-amber-400/90 truncate block mt-1">
                        {effectiveCaption}
                      </span>
                    )}
                  </div>

                    <div className="flex items-center justify-between pt-2 border-t border-white/5 w-full">
                      <PortfolioItemActions
                        artworkId={art.id}
                        initialIsVisible={art.isVisible ?? true}
                        isSpoiler={art.isSpoiler}
                        systemCaption={art.systemCaption}
                        initialCustomCaption={art.customCaption}
                      />

                    <div className="flex items-center gap-2">
                      <Link
                        href={`/artworks/${art.slug}`}
                        className="text-xs font-mono text-amber-400 hover:text-amber-300 transition-colors inline-flex items-center gap-1"
                      >
                        <ExternalLink className="h-3 w-3" />
                      </Link>

                      <DeleteArtworkButton artworkId={art.id} title={art.title} />
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </StudioShell>
  );
}
