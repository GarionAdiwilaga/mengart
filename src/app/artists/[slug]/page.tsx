import { db } from "@/db";
import {
  profiles,
  artworks,
  artworkVersions,
  commissionServices,
  commissionScopeRules,
} from "@/db/schema";
import { eq, desc, and } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";
import {
  Palette,
  ArrowLeft,
  MapPin,
  MessageSquare,
  Sparkles,
  ShieldCheck,
  Ban,
  Clock,
  RefreshCw,
  ExternalLink,
  DollarSign,
  Phone,
  Image as ImageIcon,
} from "lucide-react";

interface ArtistProfilePageProps {
  params: Promise<{ slug: string }>;
}

export default async function ArtistProfilePage({ params }: ArtistProfilePageProps) {
  const { slug } = await params;

  const [artist] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.slug, slug))
    .limit(1);

  if (!artist) {
    notFound();
  }

  // Fetch Artist Portfolio Artworks
  const portfolioArtworks = await db
    .select({
      id: artworks.id,
      title: artworks.title,
      slug: artworks.slug,
      mediaType: artworks.mediaType,
      thumbnailStorageKey: artworkVersions.thumbnailStorageKey,
    })
    .from(artworks)
    .innerJoin(artworkVersions, eq(artworkVersions.id, artworks.currentVersionId))
    .where(
      and(
        eq(artworks.userId, artist.userId),
        eq(artworks.audience, "public"),
        eq(artworks.publicationStatus, "published")
      )
    )
    .orderBy(desc(artworks.createdAt));

  // Fetch Published Commission Services
  const services = await db
    .select()
    .from(commissionServices)
    .where(
      and(
        eq(commissionServices.profileId, artist.id),
        eq(commissionServices.serviceStatus, "published")
      )
    )
    .orderBy(commissionServices.displayOrder);

  // Fetch Scope Rules
  const scopeRules = await db
    .select()
    .from(commissionScopeRules)
    .where(eq(commissionScopeRules.profileId, artist.id))
    .orderBy(commissionScopeRules.displayOrder);

  const doRules = scopeRules.filter((r) => r.ruleType === "do");
  const dontRules = scopeRules.filter((r) => r.ruleType === "dont");
  const generalRules = scopeRules.filter((r) => r.ruleType === "general");

  const statusClass =
    artist.commissionStatus === "open"
      ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
      : artist.commissionStatus === "waitlist"
      ? "bg-amber-500/10 text-amber-400 border-amber-500/30"
      : "bg-zinc-500/10 text-zinc-400 border-zinc-500/30";

  // Format WhatsApp message URL
  const waNumber = artist.whatsappNumber?.replace(/\D/g, "");
  const waMessage = encodeURIComponent(
    `Halo ${artist.displayName}, saya melihat profil dan portofolio Anda di Mengart Atelier dan ingin menanyakan informasi pemesanan komisi art.`
  );
  const waUrl = waNumber ? `https://wa.me/${waNumber}?text=${waMessage}` : null;

  return (
    <main className="min-h-screen p-6 sm:p-12 max-w-7xl mx-auto flex flex-col gap-12">
      {/* Top Header */}
      <header className="flex items-center justify-between border-b border-white/10 pb-4">
        <div className="flex items-center gap-4">
          <Link
            href="/artists"
            className="inline-flex items-center gap-1.5 text-xs font-mono text-zinc-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Direktori Artist
          </Link>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/gallery"
            className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white text-xs font-mono transition-colors"
          >
            Galeri
          </Link>
        </div>
      </header>

      {/* Artist Profile Hero Banner */}
      <section className="glass-panel p-8 sm:p-10 rounded-3xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-8">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6">
          <div className="h-20 w-20 rounded-3xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 font-display font-extrabold text-3xl shrink-0 shadow-lg shadow-amber-500/10">
            {artist.displayName?.charAt(0) || "A"}
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="font-display font-extrabold text-3xl sm:text-4xl text-[#f6f2e9] tracking-tight">
                {artist.displayName}
              </h1>
              <span className={`px-3 py-1 rounded-full text-xs font-mono font-bold border uppercase ${statusClass}`}>
                COMMISSION: {artist.commissionStatus}
              </span>
            </div>

            {artist.location ? (
              <span className="text-xs text-zinc-400 font-sans flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5 text-amber-400" />
                {artist.location}
              </span>
            ) : null}

            {artist.bio ? (
              <p className="text-sm text-zinc-300 font-sans max-w-2xl leading-relaxed mt-1">
                {artist.bio}
              </p>
            ) : null}

            {/* Specialties & Software */}
            <div className="flex flex-wrap gap-2 pt-2">
              {artist.specialties?.map((spec) => (
                <span
                  key={spec}
                  className="px-2.5 py-0.5 rounded-full bg-white/5 border border-white/10 text-xs font-sans text-zinc-300"
                >
                  {spec}
                </span>
              ))}
              {artist.software?.map((soft) => (
                <span
                  key={soft}
                  className="px-2.5 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-xs font-mono text-amber-300"
                >
                  {soft}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* WhatsApp Direct Order CTA Button */}
        {artist.waConsentGiven && waUrl && artist.commissionStatus !== "closed" ? (
          <a
            href={waUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full sm:w-auto px-6 py-3.5 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-sm transition-all duration-200 shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2.5 shrink-0 cursor-pointer"
          >
            <Phone className="h-4 w-4" />
            <span>Hubungi via WhatsApp</span>
          </a>
        ) : null}
      </section>

      {/* Commission Services Showcase */}
      {services.length > 0 ? (
        <section className="flex flex-col gap-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-display font-bold text-2xl text-[#f6f2e9]">Layanan Komisi</h2>
              <p className="text-xs text-zinc-400 mt-0.5">
                Pilih jenis layanan komisi yang Anda minati untuk melihat detail harga dan estimasi.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {services.map((service) => {
              const formattedPrice = service.minPrice
                ? `Rp ${Number(service.minPrice).toLocaleString("id-ID")}`
                : "Hubungi untuk Estimasi";

              let orderLink = "#";
              if (service.orderDestination === "whatsapp" && waUrl) {
                const serviceMsg = encodeURIComponent(
                  `Halo ${artist.displayName}, saya tertarik memesan layanan komisi: "${service.title}" via Mengart Atelier.`
                );
                orderLink = `https://wa.me/${waNumber}?text=${serviceMsg}`;
              } else if (service.customDestinationUrl) {
                orderLink = service.customDestinationUrl;
              }

              return (
                <div
                  key={service.id}
                  className="glass-panel p-6 rounded-3xl flex flex-col justify-between gap-6 group hover:border-white/20 transition-all duration-200"
                >
                  <div className="flex flex-col gap-3">
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono uppercase bg-amber-500/10 text-amber-400 border border-amber-500/30 w-fit">
                      {service.category}
                    </span>

                    <h3 className="font-display font-bold text-lg text-[#f6f2e9]">
                      {service.title}
                    </h3>

                    {service.description ? (
                      <p className="text-xs text-zinc-300 font-sans leading-relaxed">
                        {service.description}
                      </p>
                    ) : null}
                  </div>

                  <div className="flex flex-col gap-3 pt-4 border-t border-white/5 text-xs font-mono">
                    <div className="flex items-center justify-between text-zinc-200">
                      <span className="text-zinc-500">Harga:</span>
                      <span className="font-bold text-amber-400 text-sm">{formattedPrice}</span>
                    </div>

                    <div className="flex items-center justify-between text-zinc-400 text-[11px]">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {service.minTurnaroundDays}-{service.maxTurnaroundDays} hari
                      </span>
                      <span className="flex items-center gap-1">
                        <RefreshCw className="h-3 w-3" />
                        {service.includedRevisions} revisi bebas
                      </span>
                    </div>

                    {orderLink !== "#" ? (
                      <a
                        href={orderLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-2 w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold font-sans transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-md shadow-amber-500/10"
                      >
                        <span>Pesan Layanan Ini</span>
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      {/* Do / Don't Scope Rules Section */}
      {scopeRules.length > 0 ? (
        <section className="flex flex-col gap-4">
          <div>
            <h2 className="font-display font-bold text-2xl text-[#f6f2e9]">Cakupan Pesanan (Do / Don't)</h2>
            <p className="text-xs text-zinc-400 mt-0.5">
              Panduan transparansi apa yang diterima dan tidak diterima oleh artist.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {/* DO */}
            <div className="glass-panel p-5 rounded-2xl flex flex-col gap-3">
              <div className="flex items-center gap-2 text-xs font-mono text-emerald-400 border-b border-white/5 pb-2 font-bold">
                <ShieldCheck className="h-4 w-4" />
                <span>DO (MENERIMA)</span>
              </div>
              <ul className="flex flex-col gap-2">
                {doRules.map((rule, idx) => (
                  <li key={idx} className="text-xs text-zinc-300 p-2 rounded-lg bg-emerald-500/5 border border-emerald-500/15">
                    {rule.title}
                  </li>
                ))}
              </ul>
            </div>

            {/* DON'T */}
            <div className="glass-panel p-5 rounded-2xl flex flex-col gap-3">
              <div className="flex items-center gap-2 text-xs font-mono text-red-400 border-b border-white/5 pb-2 font-bold">
                <Ban className="h-4 w-4" />
                <span>DON'T (TIDAK MENERIMA)</span>
              </div>
              <ul className="flex flex-col gap-2">
                {dontRules.map((rule, idx) => (
                  <li key={idx} className="text-xs text-zinc-300 p-2 rounded-lg bg-red-500/5 border border-red-500/15">
                    {rule.title}
                  </li>
                ))}
              </ul>
            </div>

            {/* GENERAL */}
            <div className="glass-panel p-5 rounded-2xl flex flex-col gap-3">
              <div className="flex items-center gap-2 text-xs font-mono text-blue-400 border-b border-white/5 pb-2 font-bold">
                <Sparkles className="h-4 w-4" />
                <span>KETENTUAN UMUM</span>
              </div>
              <ul className="flex flex-col gap-2">
                {generalRules.map((rule, idx) => (
                  <li key={idx} className="text-xs text-zinc-300 p-2 rounded-lg bg-blue-500/5 border border-blue-500/15">
                    {rule.title}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      ) : null}

      {/* Portfolio Showcase Grid */}
      <section className="flex flex-col gap-6">
        <div>
          <h2 className="font-display font-bold text-2xl text-[#f6f2e9]">Showcase Portofolio</h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            Arsip karya yang dipublikasikan oleh {artist.displayName}.
          </p>
        </div>

        {portfolioArtworks.length === 0 ? (
          <div className="glass-panel p-12 rounded-3xl flex flex-col items-center justify-center text-center gap-3">
            <ImageIcon className="h-10 w-10 text-zinc-600" />
            <span className="text-xs text-zinc-400">Belum ada karya publik yang diunggah.</span>
          </div>
        ) : (
          <div className="columns-1 sm:columns-2 md:columns-3 lg:columns-4 gap-6 space-y-6">
            {portfolioArtworks.map((item) => {
              const thumbUrl = item.thumbnailStorageKey
                ? `/api/media/public/${item.thumbnailStorageKey}`
                : null;

              return (
                <div
                  key={item.id}
                  className="break-inside-avoid glass-panel rounded-2xl overflow-hidden group hover:border-white/20 transition-all"
                >
                  <Link href={`/artworks/${item.slug}`} className="block relative bg-black/40">
                    {thumbUrl ? (
                      <img
                        src={thumbUrl}
                        alt={item.title}
                        className="w-full h-auto object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                        loading="lazy"
                      />
                    ) : (
                      <div className="aspect-[4/3] flex items-center justify-center">
                        <ImageIcon className="h-8 w-8 text-zinc-700" />
                      </div>
                    )}
                  </Link>
                  <div className="p-4 flex flex-col gap-1">
                    <Link href={`/artworks/${item.slug}`}>
                      <h4 className="font-display font-bold text-sm text-[#f6f2e9] group-hover:text-amber-300 transition-colors truncate">
                        {item.title}
                      </h4>
                    </Link>
                    <span className="text-[11px] font-mono text-zinc-500 uppercase">
                      {item.mediaType}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
