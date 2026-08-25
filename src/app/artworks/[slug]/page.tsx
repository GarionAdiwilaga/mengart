import { db } from "@/db";
import { artworks, artworkVersions, profiles, tags, artworkTags } from "@/db/schema";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import Link from "next/link";
import {
  Palette,
  ArrowLeft,
  User,
  Clock,
  Sparkles,
  MessageSquare,
  ShieldCheck,
  Tag,
  Monitor,
  Calendar,
} from "lucide-react";
import { ArtworkLightbox } from "@/components/gallery/ArtworkLightbox";

interface ArtworkDetailPageProps {
  params: Promise<{ slug: string }>;
}

export default async function ArtworkDetailPage({ params }: ArtworkDetailPageProps) {
  const { slug } = await params;
  const session = await auth();
  const isMember = !!session?.user?.id;

  const [artwork] = await db
    .select({
      id: artworks.id,
      title: artworks.title,
      slug: artworks.slug,
      description: artworks.description,
      mediaType: artworks.mediaType,
      audience: artworks.audience,
      critiqueMode: artworks.critiqueMode,
      createdAt: artworks.createdAt,
      userId: artworks.userId,
      artistName: profiles.displayName,
      artistSlug: profiles.slug,
      artistBio: profiles.bio,
      artistAvatar: profiles.avatarUrl,
      artistCommissionStatus: profiles.commissionStatus,
      versionId: artworkVersions.id,
      publicStorageKey: artworkVersions.publicStorageKey,
      masterStorageKey: artworkVersions.masterStorageKey,
      width: artworkVersions.width,
      height: artworkVersions.height,
      fileSizeBytes: artworkVersions.fileSizeBytes,
      processingStatus: artworkVersions.processingStatus,
    })
    .from(artworks)
    .innerJoin(profiles, eq(profiles.userId, artworks.userId))
    .leftJoin(artworkVersions, eq(artworkVersions.id, artworks.currentVersionId))
    .where(eq(artworks.slug, slug))
    .limit(1);

  if (!artwork) {
    notFound();
  }

  // Fetch Tags
  const attachedTags = await db
    .select({
      name: tags.name,
      slug: tags.slug,
    })
    .from(artworkTags)
    .innerJoin(tags, eq(tags.id, artworkTags.tagId))
    .where(eq(artworkTags.artworkId, artwork.id));

  const publicMediaUrl = artwork.publicStorageKey
    ? `/api/media/public/${artwork.publicStorageKey}`
    : "/placeholder.png";

  const masterMediaUrl =
    isMember && artwork.masterStorageKey
      ? `/api/media/master/${artwork.masterStorageKey}`
      : null;

  const formattedDate = new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Makassar",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(artwork.createdAt)) + " WITA";

  return (
    <main className="min-h-screen p-6 sm:p-12 max-w-7xl mx-auto flex flex-col gap-8">
      {/* Top Header & Breadcrumb */}
      <header className="flex items-center justify-between border-b border-white/10 pb-4">
        <div className="flex items-center gap-4">
          <Link
            href="/gallery"
            className="inline-flex items-center gap-1.5 text-xs font-mono text-zinc-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Kembali ke Galeri
          </Link>
          <span className="text-zinc-600 font-mono text-xs">/</span>
          <span className="text-zinc-300 font-mono text-xs truncate max-w-[200px]">
            {artwork.title}
          </span>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href={`/artists/${artwork.artistSlug}`}
            className="px-3.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white text-xs font-mono transition-colors flex items-center gap-1.5"
          >
            <User className="h-3.5 w-3.5 text-amber-400" />
            <span>Lihat Profil Artist</span>
          </Link>
        </div>
      </header>

      {/* Main Content Layout: Viewer (Left) + Details Sidebar (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Lightbox / Media Viewer */}
        <div className="lg:col-span-2 flex flex-col gap-6">
          <ArtworkLightbox
            publicMediaUrl={publicMediaUrl}
            masterMediaUrl={masterMediaUrl}
            isMember={isMember}
            title={artwork.title}
            mediaType={artwork.mediaType as any}
            width={artwork.width}
            height={artwork.height}
          />

          {/* Artwork Description & Process Notes */}
          <section className="glass-panel p-6 sm:p-8 rounded-3xl flex flex-col gap-4">
            <h2 className="font-display font-bold text-xl text-[#f6f2e9]">{artwork.title}</h2>

            {artwork.description ? (
              <p className="text-sm text-zinc-300 font-sans leading-relaxed whitespace-pre-line">
                {artwork.description}
              </p>
            ) : (
              <p className="text-xs text-zinc-500 italic">Tidak ada deskripsi tambahan.</p>
            )}

            {/* Tags */}
            {attachedTags.length > 0 ? (
              <div className="flex flex-wrap gap-2 pt-4 border-t border-white/5">
                {attachedTags.map((t) => (
                  <span
                    key={t.slug}
                    className="px-3 py-1 rounded-full bg-white/5 border border-white/10 text-zinc-300 text-xs font-mono flex items-center gap-1"
                  >
                    <Tag className="h-3 w-3 text-amber-400" />
                    #{t.name}
                  </span>
                ))}
              </div>
            ) : null}
          </section>

          {/* Critique Section */}
          <section className="glass-panel p-6 sm:p-8 rounded-3xl flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-amber-400" />
                <h3 className="font-display font-bold text-base text-[#f6f2e9]">
                  {artwork.critiqueMode === "open_for_critique"
                    ? "Diskusi & Kritik Konstruktif"
                    : "Apresiasi Karya"}
                </h3>
              </div>
              <span
                className={`text-[10px] font-mono uppercase px-2.5 py-0.5 rounded-full border ${
                  artwork.critiqueMode === "open_for_critique"
                    ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                    : "bg-zinc-500/10 text-zinc-400 border-zinc-500/30"
                }`}
              >
                {artwork.critiqueMode === "open_for_critique" ? "Open for Critique" : "Showcase Only"}
              </span>
            </div>

            <p className="text-xs text-zinc-400 leading-relaxed">
              {artwork.critiqueMode === "open_for_critique"
                ? "Artist membuka karya ini untuk masukan konstruktif terkait pencahayaan, proporsi anatomi, nilai kontras, dan komposisi visual."
                : "Ruang komentar apresiasi untuk sesama anggota komunitas atelier."}
            </p>

            <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/5 text-xs text-zinc-500 font-mono text-center">
              Komentar komunitas akan aktif pada pembaruan Phase 5.
            </div>
          </section>
        </div>

        {/* Right Column: Artist Bio Card & Technical Metadata */}
        <div className="flex flex-col gap-6">
          {/* Artist Card */}
          <div className="glass-panel p-6 rounded-3xl flex flex-col gap-5">
            <div className="flex items-center gap-4">
              <div className="h-14 w-14 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 font-display font-bold text-xl">
                {artwork.artistName?.charAt(0) || "A"}
              </div>
              <div className="flex flex-col">
                <Link
                  href={`/artists/${artwork.artistSlug}`}
                  className="font-display font-bold text-lg text-[#f6f2e9] hover:text-amber-300 transition-colors truncate"
                >
                  {artwork.artistName}
                </Link>
                <span
                  className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded-full border w-fit mt-1 ${
                    artwork.artistCommissionStatus === "open"
                      ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                      : artwork.artistCommissionStatus === "waitlist"
                      ? "bg-amber-500/10 text-amber-400 border-amber-500/30"
                      : "bg-zinc-500/10 text-zinc-400 border-zinc-500/30"
                  }`}
                >
                  Commission: {artwork.artistCommissionStatus}
                </span>
              </div>
            </div>

            {artwork.artistBio ? (
              <p className="text-xs text-zinc-400 line-clamp-3 leading-relaxed">
                {artwork.artistBio}
              </p>
            ) : null}

            <Link
              href={`/artists/${artwork.artistSlug}`}
              className="w-full py-2.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-400 text-xs font-mono font-semibold transition-colors flex items-center justify-center gap-1.5"
            >
              <span>Kunjungi Profil Artist</span>
            </Link>
          </div>

          {/* Technical Specs Panel */}
          <div className="glass-panel p-6 rounded-3xl flex flex-col gap-4 text-xs font-mono">
            <h4 className="font-display font-bold text-sm text-[#f6f2e9]">Detail Teknis Karya</h4>

            <div className="flex flex-col gap-2.5 divide-y divide-white/5">
              <div className="flex items-center justify-between pt-1">
                <span className="text-zinc-500">Tipe Media:</span>
                <span className="text-zinc-200 uppercase">{artwork.mediaType}</span>
              </div>

              {artwork.width && artwork.height ? (
                <div className="flex items-center justify-between pt-2.5">
                  <span className="text-zinc-500">Resolusi Kanvas:</span>
                  <span className="text-zinc-200 tabular-nums">
                    {artwork.width} × {artwork.height} px
                  </span>
                </div>
              ) : null}

              <div className="flex items-center justify-between pt-2.5">
                <span className="text-zinc-500">Diunggah:</span>
                <span className="text-zinc-400 text-[11px]">{formattedDate}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
