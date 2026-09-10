import { Metadata } from "next";
import { requireAuth } from "@/lib/rbac";
import { db } from "@/db";
import {
  profiles,
  artworks,
  artworkVersions,
  portfolioEntries,
  commissionServices,
  commissionScopeRules,
} from "@/db/schema";
import { eq, desc, and, isNull } from "drizzle-orm";
import Link from "next/link";
import {
  Palette,
  Sparkles,
  Briefcase,
  Trophy,
  User,
  ArrowRight,
  ShieldCheck,
  Plus,
  Eye,
  MapPin,
  ExternalLink,
  MessageSquare,
  Clock,
  CheckCircle2,
  XCircle,
  Film,
  Image as ImageIcon,
} from "lucide-react";
import { StudioShell } from "@/components/layout/shells/StudioShell";
import { AtelierBadge } from "@/components/ui/atoms/AtelierBadge";
import { UploadArtworkModal } from "@/components/portfolio/UploadArtworkModal";

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
  },
};

export default async function DashboardPage() {
  const user = await requireAuth("/login");

  const [profile] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.userId, user.id))
    .limit(1);

  if (!profile) {
    return (
      <StudioShell headerTitle="Studio Kreator">
        <div className="glass-panel p-12 rounded-3xl text-center flex flex-col items-center gap-3">
          <p className="text-zinc-400 font-mono text-sm">Profil kreator tidak ditemukan.</p>
        </div>
      </StudioShell>
    );
  }

  const isModOrAdmin = user.role === "moderator" || user.role === "admin";

  // Fetch Artist Portfolio Artworks
  const portfolioArtworks = await db
    .select({
      id: artworks.id,
      title: artworks.title,
      slug: artworks.slug,
      mediaType: artworks.mediaType,
      isSpoiler: artworks.isSpoiler,
      publicationStatus: artworks.publicationStatus,
      thumbnailStorageKey: artworkVersions.thumbnailStorageKey,
      systemCaption: portfolioEntries.systemCaption,
      customCaption: portfolioEntries.customCaption,
      isVisible: portfolioEntries.isVisible,
    })
    .from(artworks)
    .innerJoin(
      portfolioEntries,
      and(
        eq(portfolioEntries.artworkId, artworks.id),
        eq(portfolioEntries.profileId, profile.id)
      )
    )
    .innerJoin(artworkVersions, eq(artworkVersions.id, artworks.currentVersionId))
    .where(and(eq(artworks.userId, user.id), isNull(artworks.deletedAt)))
    .orderBy(desc(artworks.createdAt));

  // Fetch Published Commission Services
  const services = await db
    .select()
    .from(commissionServices)
    .where(eq(commissionServices.profileId, profile.id))
    .orderBy(commissionServices.displayOrder);

  // Fetch Scope Rules
  const scopeRules = await db
    .select()
    .from(commissionScopeRules)
    .where(eq(commissionScopeRules.profileId, profile.id))
    .orderBy(commissionScopeRules.displayOrder);

  const doRules = scopeRules.filter((r) => r.ruleType === "do");
  const dontRules = scopeRules.filter((r) => r.ruleType === "dont");

  const statusVariant =
    profile.commissionStatus === "open"
      ? "success"
      : profile.commissionStatus === "waitlist"
      ? "amber"
      : "default";

  return (
    <StudioShell
      headerTitle="Studio Kreator"
      headerSubtitle="Pusat kelola profil publik, etalase portofolio, dan layanan komisi Anda."
      rightAction={
        <div className="flex items-center gap-2">
          {isModOrAdmin && (
            <Link
              href="/admin"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 min-h-[44px] rounded-xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-300 text-xs font-mono font-bold transition-all cursor-pointer"
            >
              <ShieldCheck className="h-4 w-4" />
              <span className="hidden sm:inline">Admin Command Center</span>
            </Link>
          )}
          <UploadArtworkModal />
        </div>
      }
    >
      <div className="flex flex-col gap-8">
        {/* Owner Preview Notice Banner */}
        <div className="p-4 rounded-2xl bg-amber-500/5 border border-amber-500/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2.5">
            <Eye className="h-4 w-4 text-amber-400 shrink-0" />
            <span className="text-zinc-300 font-sans">
              <strong>Mode Pratinjau Pemilik:</strong> Beginilah tampilan studio Anda bagi rekan komunitas dan calon klien.
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Link
              href={`/artists/${profile.slug}`}
              target="_blank"
              className="inline-flex items-center gap-1 text-amber-400 hover:text-amber-300 font-mono text-xs transition-colors"
            >
              <span>Buka Profil Publik</span>
              <ExternalLink className="h-3 w-3" />
            </Link>
          </div>
        </div>

        {/* Profile Identity Card */}
        <section className="glass-panel p-6 sm:p-8 rounded-3xl border border-white/10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="flex items-start sm:items-center gap-5">
            <div className="h-16 w-16 sm:h-20 sm:w-20 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 font-display font-extrabold text-2xl sm:text-3xl shrink-0 shadow-lg shadow-amber-500/10 overflow-hidden">
              {profile.avatarUrl ? (
                <img
                  src={profile.avatarUrl}
                  alt={profile.displayName}
                  className="w-full h-full object-cover"
                />
              ) : (
                profile.displayName?.charAt(0) || "A"
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <div className="flex flex-wrap items-center gap-2.5">
                <h2 className="font-display font-bold text-xl sm:text-2xl text-[#f6f2e9]">
                  {profile.displayName}
                </h2>
                <AtelierBadge variant={statusVariant} size="sm">
                  Komisi: {profile.commissionStatus.toUpperCase()}
                </AtelierBadge>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono uppercase bg-white/5 border border-white/10 text-zinc-400">
                  {user.role}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-400 font-mono">
                <span>@{profile.slug}</span>
                {profile.location && (
                  <span className="flex items-center gap-1 font-sans text-zinc-400">
                    <MapPin className="h-3 w-3 text-amber-400" />
                    {profile.location}
                  </span>
                )}
              </div>

              {profile.bio && (
                <p className="text-xs sm:text-sm text-zinc-300 font-sans max-w-2xl leading-relaxed mt-1">
                  {profile.bio}
                </p>
              )}

              {/* Specialties & Software Tags */}
              <div className="flex flex-wrap gap-1.5 pt-2">
                {profile.specialties?.map((spec) => (
                  <span
                    key={spec}
                    className="px-2.5 py-0.5 rounded-md bg-white/5 border border-white/10 text-xs font-sans text-zinc-300"
                  >
                    {spec}
                  </span>
                ))}
                {profile.software?.map((soft) => (
                  <span
                    key={soft}
                    className="px-2.5 py-0.5 rounded-md bg-amber-500/10 border border-amber-500/20 text-xs font-mono text-amber-300"
                  >
                    {soft}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 self-stretch md:self-auto justify-end">
            <Link
              href="/me/profile"
              className="px-4 py-2 min-h-[44px] rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-200 text-xs font-mono transition-colors flex items-center justify-center cursor-pointer"
            >
              Edit Profil
            </Link>
          </div>
        </section>

        {/* Portfolio Showcase Grid */}
        <section className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Palette className="h-4 w-4 text-amber-400" />
              <h3 className="font-display font-bold text-lg text-[#f6f2e9]">
                Portofolio ({portfolioArtworks.length})
              </h3>
            </div>
            <Link
              href="/me/portfolio"
              className="text-xs font-mono text-amber-400 hover:text-amber-300 transition-colors inline-flex items-center gap-1"
            >
              <span>Kelola Portofolio</span>
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>

          {portfolioArtworks.length === 0 ? (
            <div className="glass-panel p-12 rounded-3xl flex flex-col items-center justify-center text-center gap-3 border border-white/10">
              <ImageIcon className="h-10 w-10 text-zinc-600" />
              <h4 className="font-display font-bold text-base text-white">
                Belum ada karya di portofolio
              </h4>
              <p className="text-xs text-zinc-400 max-w-sm">
                Unggah karya digital Anda untuk mulai memamerkan eksplorasi visual kepada komunitas.
              </p>
              <UploadArtworkModal />
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
              {portfolioArtworks.map((art) => {
                const thumbUrl = art.thumbnailStorageKey
                  ? `/api/media/public/${art.thumbnailStorageKey}`
                  : null;
                const effectiveCaption = art.customCaption || art.systemCaption;

                return (
                  <div
                    key={art.id}
                    className="glass-panel rounded-2xl overflow-hidden flex flex-col justify-between border border-white/10 hover:border-amber-500/30 transition-all group"
                  >
                    <Link
                      href={`/artworks/${art.slug}`}
                      className="aspect-[4/3] bg-black/40 relative overflow-hidden block"
                    >
                      {thumbUrl ? (
                        <img
                          src={thumbUrl}
                          alt={art.title}
                          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                          loading="lazy"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-xs font-mono text-zinc-600">
                          Pratinjau...
                        </div>
                      )}

                      <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5">
                        {art.mediaType === "video" && (
                          <span className="px-2 py-0.5 rounded-md bg-black/70 backdrop-blur-md text-[10px] font-mono uppercase text-amber-300 border border-white/10 flex items-center gap-1">
                            <Film className="h-3 w-3" />
                            Video
                          </span>
                        )}
                        {!art.isVisible && (
                          <span className="px-2 py-0.5 rounded-md bg-black/80 backdrop-blur-md text-[10px] font-mono text-zinc-400 border border-white/10">
                            Tersembunyi
                          </span>
                        )}
                      </div>
                    </Link>

                    <div className="p-3.5 flex flex-col gap-1">
                      <Link
                        href={`/artworks/${art.slug}`}
                        className="font-display font-semibold text-xs text-[#f6f2e9] hover:text-amber-300 transition-colors truncate"
                      >
                        {art.title}
                      </Link>
                      {effectiveCaption ? (
                        <span className="text-[10px] font-mono text-amber-300/80 truncate">
                          ★ {effectiveCaption}
                        </span>
                      ) : (
                        <span className="text-[10px] font-mono text-zinc-500 uppercase">
                          {art.mediaType}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Commission Showcase Grid */}
        <section className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Briefcase className="h-4 w-4 text-emerald-400" />
              <h3 className="font-display font-bold text-lg text-[#f6f2e9]">
                Layanan Komisi ({services.length})
              </h3>
            </div>
            <Link
              href="/me/commissions"
              className="text-xs font-mono text-emerald-400 hover:text-emerald-300 transition-colors inline-flex items-center gap-1"
            >
              <span>Kelola Layanan Komisi</span>
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>

          {services.length === 0 ? (
            <div className="glass-panel p-8 rounded-3xl flex flex-col items-center justify-center text-center gap-3 border border-white/10">
              <Briefcase className="h-8 w-8 text-zinc-600" />
              <h4 className="font-display font-bold text-sm text-white">
                Belum ada jenis layanan komisi
              </h4>
              <p className="text-xs text-zinc-400 max-w-sm">
                Tambahkan paket komisi (misal: Sketsa, Full Color, Ilustrasi Konsep) agar pengunjung dapat melihat rentang harga dan ketentuan Anda.
              </p>
              <Link
                href="/me/commissions"
                className="px-4 py-2 min-h-[44px] rounded-xl bg-white/5 hover:bg-white/10 text-zinc-200 text-xs font-mono transition-colors flex items-center justify-center"
              >
                Buka Pengaturan Komisi
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-5">
              {services.map((service) => {
                const formattedPrice = service.minPrice
                  ? `Rp ${Number(service.minPrice).toLocaleString("id-ID")}`
                  : "Hubungi untuk Estimasi";

                return (
                  <div
                    key={service.id}
                    className="glass-panel p-5 rounded-2xl flex flex-col justify-between gap-4 border border-white/10"
                  >
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center justify-between">
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-mono uppercase bg-amber-500/10 text-amber-400 border border-amber-500/30">
                          {service.category}
                        </span>
                        <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded-md bg-white/5 text-zinc-400 border border-white/10">
                          {service.serviceStatus}
                        </span>
                      </div>

                      <h4 className="font-display font-bold text-sm text-[#f6f2e9]">
                        {service.title}
                      </h4>
                      {service.description && (
                        <p className="text-xs text-zinc-400 font-sans line-clamp-2">
                          {service.description}
                        </p>
                      )}
                    </div>

                    <div className="pt-3 border-t border-white/5 flex items-center justify-between text-xs">
                      <span className="font-display font-bold text-amber-400">
                        {formattedPrice}
                      </span>
                      {service.minTurnaroundDays && (
                        <span className="text-zinc-500 font-mono text-[11px]">
                          ~{service.minTurnaroundDays}
                          {service.maxTurnaroundDays && service.maxTurnaroundDays !== service.minTurnaroundDays
                            ? `-${service.maxTurnaroundDays}`
                            : ""}{" "}
                          hari
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Scope Rules Summary */}
        {(doRules.length > 0 || dontRules.length > 0) && (
          <section className="glass-panel p-6 rounded-3xl border border-white/10 flex flex-col gap-4">
            <h3 className="font-display font-bold text-base text-[#f6f2e9]">
              Ketentuan Scope Komisi (Do & Don't)
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-sans">
              {doRules.length > 0 && (
                <div className="flex flex-col gap-2 p-4 rounded-2xl bg-emerald-500/5 border border-emerald-500/20">
                  <span className="font-mono font-bold text-emerald-400 flex items-center gap-1.5">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    <span>Bisa Dikerjakan (Do)</span>
                  </span>
                  <ul className="list-disc list-inside text-zinc-300 space-y-1">
                    {doRules.map((r) => (
                      <li key={r.id}>
                        <span className="font-medium text-zinc-200">{r.title}</span>
                        {r.description && (
                          <span className="text-zinc-400 font-normal"> — {r.description}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {dontRules.length > 0 && (
                <div className="flex flex-col gap-2 p-4 rounded-2xl bg-rose-500/5 border border-rose-500/20">
                  <span className="font-mono font-bold text-rose-400 flex items-center gap-1.5">
                    <XCircle className="h-3.5 w-3.5" />
                    <span>Tidak Dikerjakan (Don't)</span>
                  </span>
                  <ul className="list-disc list-inside text-zinc-300 space-y-1">
                    {dontRules.map((r) => (
                      <li key={r.id}>
                        <span className="font-medium text-zinc-200">{r.title}</span>
                        {r.description && (
                          <span className="text-zinc-400 font-normal"> — {r.description}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </section>
        )}
      </div>
    </StudioShell>
  );
}
