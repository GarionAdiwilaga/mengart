import { db } from "@/db";
import { commissionServices, profiles, users } from "@/db/schema";
import { eq, desc, and, inArray, or, ilike, isNull } from "drizzle-orm";
import Link from "next/link";
import {
  Sparkles,
  Search,
  Briefcase,
  Clock,
  RefreshCw,
  ExternalLink,
  MessageSquare,
  User,
} from "lucide-react";
import { CommunityShell } from "@/components/layout/shells/CommunityShell";
import { AtelierBadge } from "@/components/ui/atoms/AtelierBadge";

interface CommissionsPageProps {
  searchParams: Promise<{
    category?: string;
    q?: string;
  }>;
}

const CATEGORIES = [
  "Semua",
  "Character Illustration",
  "Environment & Background",
  "Concept Art",
  "Pixel Art",
  "3D Modeling & Render",
  "Animation & Motion",
];

export default async function PublicCommissionsPage({ searchParams }: CommissionsPageProps) {
  const { category, q } = await searchParams;

  const queryFilters = [
    eq(commissionServices.serviceStatus, "published"),
    inArray(profiles.commissionStatus, ["open", "waitlist"]),
    eq(profiles.profileStatus, "active_public"),
    isNull(profiles.deletedAt),
    eq(users.membershipStatus, "active"),
    isNull(users.deletedAt),
  ];

  if (category && category !== "Semua") {
    queryFilters.push(eq(commissionServices.category, category));
  }

  if (q) {
    queryFilters.push(
      or(
        ilike(commissionServices.title, `%${q}%`),
        ilike(commissionServices.description, `%${q}%`),
        ilike(profiles.displayName, `%${q}%`)
      )!
    );
  }

  const servicesList = await db
    .select({
      id: commissionServices.id,
      title: commissionServices.title,
      description: commissionServices.description,
      category: commissionServices.category,
      pricingType: commissionServices.pricingType,
      minPrice: commissionServices.minPrice,
      maxPrice: commissionServices.maxPrice,
      minTurnaroundDays: commissionServices.minTurnaroundDays,
      maxTurnaroundDays: commissionServices.maxTurnaroundDays,
      includedRevisions: commissionServices.includedRevisions,
      orderDestination: commissionServices.orderDestination,
      customDestinationUrl: commissionServices.customDestinationUrl,
      artistName: profiles.displayName,
      artistSlug: profiles.slug,
      artistAvatar: profiles.avatarUrl,
      artistCommissionStatus: profiles.commissionStatus,
      waitlistCurrentSlots: profiles.waitlistCurrentSlots,
      waitlistMaxSlots: profiles.waitlistMaxSlots,
      artistWhatsappNumber: profiles.whatsappNumber,
      artistWhatsappEnabled: profiles.waConsentGiven,
    })
    .from(commissionServices)
    .innerJoin(profiles, eq(profiles.id, commissionServices.profileId))
    .innerJoin(users, eq(users.id, profiles.userId))
    .where(and(...queryFilters))
    .orderBy(desc(commissionServices.createdAt));

  return (
    <CommunityShell>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 flex flex-col gap-8 flex-1">
        {/* Hero Section */}
        <section className="flex flex-col sm:flex-row sm:items-end justify-between gap-6">
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <AtelierBadge variant="amber" className="w-fit font-mono">
                <Sparkles className="h-3 w-3 inline mr-1 text-amber-400" />
                Layanan Komisi
              </AtelierBadge>
            </div>
            <h1 className="font-display font-extrabold text-2xl sm:text-4xl text-[#f6f2e9] tracking-tight">
              Kolektif Komisi Kreator
            </h1>
            <p className="text-xs sm:text-sm text-zinc-400 max-w-xl font-sans leading-relaxed">
              Jelajahi tawaran layanan ilustrasi dan seni visual dari para kreator terverifikasi di Mengart Atelier.
            </p>
          </div>

          {/* Search Form */}
          <form method="GET" action="/commissions" className="w-full sm:w-80 relative">
            <input
              type="text"
              name="q"
              defaultValue={q || ""}
              placeholder="Cari layanan atau nama kreator..."
              className="w-full pl-10 pr-4 py-3 sm:py-2.5 rounded-2xl bg-white/5 border border-white/10 text-white placeholder:text-zinc-500 text-base sm:text-xs font-sans focus:outline-none focus:border-amber-500/50 transition-colors"
            />
            <Search className="h-4 w-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
          </form>
        </section>

        {/* Category Filter Pills */}
        <section className="flex items-center gap-2 overflow-x-auto pb-2 -mx-4 px-4 sm:mx-0 sm:px-0 scrollbar-none">
          {CATEGORIES.map((cat) => {
            const isActive = (!category && cat === "Semua") || category === cat;
            const href =
              cat === "Semua" ? "/commissions" : `/commissions?category=${encodeURIComponent(cat)}`;

            return (
              <Link
                key={cat}
                href={href}
                className={`px-4 py-2 rounded-full text-xs font-medium whitespace-nowrap transition-all border shrink-0 min-h-[38px] flex items-center ${
                  isActive
                    ? "bg-amber-400 text-black border-amber-400 font-bold shadow-md shadow-amber-400/20"
                    : "bg-white/5 text-zinc-400 border-white/10 hover:border-white/25 hover:text-zinc-200"
                }`}
              >
                {cat}
              </Link>
            );
          })}
        </section>

        {/* Services Grid */}
        {servicesList.length === 0 ? (
          <div className="glass-panel p-12 sm:p-16 rounded-3xl flex flex-col items-center justify-center text-center gap-3 border border-white/10 my-8">
            <div className="h-12 w-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-zinc-500">
              <Briefcase className="h-6 w-6" />
            </div>
            <h3 className="font-display font-bold text-lg text-white">
              Belum ada layanan komisi aktif
            </h3>
            <p className="text-xs text-zinc-400 max-w-sm font-sans leading-relaxed">
              Saat ini belum ada kreator yang membuka slot pada kategori yang dipilih. Silakan cek kategori lain atau kembali nanti.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {servicesList.map((service) => {
              let formattedPrice = "Hubungi untuk Estimasi";
              if (service.pricingType === "fixed" && service.minPrice) {
                formattedPrice = `Rp ${Number(service.minPrice).toLocaleString("id-ID")}`;
              } else if (service.pricingType === "starting_from" && service.minPrice) {
                formattedPrice = `Mulai Rp ${Number(service.minPrice).toLocaleString("id-ID")}`;
              } else if (service.pricingType === "range" && service.minPrice && service.maxPrice) {
                formattedPrice = `Rp ${Number(service.minPrice).toLocaleString("id-ID")} - ${Number(service.maxPrice).toLocaleString("id-ID")}`;
              } else if (service.minPrice) {
                formattedPrice = `Rp ${Number(service.minPrice).toLocaleString("id-ID")}`;
              }

              const waNumber = service.artistWhatsappNumber?.replace(/\D/g, "");
              const isDirectWaAvailable =
                service.orderDestination === "whatsapp" &&
                waNumber &&
                service.artistWhatsappEnabled;

              let orderLink = `/artists/${service.artistSlug}`;
              let isExternal = false;
              let ctaLabel = "Lihat Profil Kreator";

              if (isDirectWaAvailable) {
                const msg = encodeURIComponent(
                  `Halo ${service.artistName}, saya tertarik memesan layanan komisi "${service.title}" via Mengart Atelier.`
                );
                orderLink = `https://wa.me/${waNumber}?text=${msg}`;
                isExternal = true;
                ctaLabel = "Pesan via WhatsApp";
              } else if (service.customDestinationUrl) {
                orderLink = service.customDestinationUrl;
                isExternal = true;
                ctaLabel = "Kunjungi Laman Komisi";
              }

              return (
                <div
                  key={service.id}
                  className="glass-panel p-6 rounded-3xl flex flex-col justify-between gap-6 group hover:border-amber-500/30 transition-all duration-200 border border-white/10"
                >
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="px-2.5 py-1 rounded-md text-[10px] font-mono uppercase bg-amber-500/10 text-amber-400 border border-amber-500/20">
                        {service.category}
                      </span>
                      <div className="flex items-center gap-1.5">
                        {service.artistCommissionStatus === "waitlist" ? (
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded-md border bg-amber-500/10 text-amber-400 border-amber-500/30">
                            Waitlist
                            {service.waitlistMaxSlots ? ` (${service.waitlistCurrentSlots}/${service.waitlistMaxSlots})` : ""}
                          </span>
                        ) : (
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded-md border bg-emerald-500/10 text-emerald-400 border-emerald-500/30">
                            Terbuka
                          </span>
                        )}
                      </div>
                    </div>

                    <h3 className="font-display font-bold text-lg text-[#f6f2e9] group-hover:text-amber-300 transition-colors">
                      {service.title}
                    </h3>

                    {service.description ? (
                      <p className="text-xs text-zinc-300 font-sans line-clamp-3 leading-relaxed">
                        {service.description}
                      </p>
                    ) : null}
                  </div>

                  {/* Artist Info & Pricing Bar */}
                  <div className="flex flex-col gap-3.5 pt-4 border-t border-white/5">
                    <Link
                      href={`/artists/${service.artistSlug}`}
                      className="flex items-center gap-2.5 group/artist hover:text-amber-300 transition-colors"
                    >
                      {service.artistAvatar ? (
                        <img
                          src={service.artistAvatar}
                          alt={service.artistName}
                          className="h-7 w-7 rounded-full object-cover border border-white/10 shrink-0"
                        />
                      ) : (
                        <div className="h-7 w-7 rounded-full bg-amber-500/20 flex items-center justify-center text-amber-400 text-xs font-bold font-display shrink-0">
                          {service.artistName?.charAt(0) || "A"}
                        </div>
                      )}
                      <span className="text-xs font-semibold text-[#f6f2e9] group-hover/artist:text-amber-300 truncate">
                        {service.artistName}
                      </span>
                    </Link>

                    <div className="flex items-baseline justify-between text-xs">
                      <span className="text-zinc-500 font-sans text-[11px]">Estimasi Biaya:</span>
                      <span className="font-display font-bold text-amber-400 text-sm">
                        {formattedPrice}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-zinc-400 text-[11px] font-mono">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3 text-zinc-500" />
                        ~{service.minTurnaroundDays}
                        {service.maxTurnaroundDays !== service.minTurnaroundDays ? `-${service.maxTurnaroundDays}` : ""} hari
                      </span>
                      <span className="flex items-center gap-1">
                        <RefreshCw className="h-3 w-3 text-zinc-500" />
                        {service.includedRevisions}x revisi
                      </span>
                    </div>

                    <a
                      href={orderLink}
                      target={isExternal ? "_blank" : undefined}
                      rel={isExternal ? "noopener noreferrer" : undefined}
                      className="mt-1 w-full min-h-[44px] py-2.5 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold font-sans transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-md shadow-amber-500/10 active:scale-[0.98]"
                    >
                      {isDirectWaAvailable ? (
                        <MessageSquare className="h-3.5 w-3.5" />
                      ) : isExternal ? (
                        <ExternalLink className="h-3.5 w-3.5" />
                      ) : (
                        <User className="h-3.5 w-3.5" />
                      )}
                      <span>{ctaLabel}</span>
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </CommunityShell>
  );
}
