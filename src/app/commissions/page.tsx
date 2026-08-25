import { db } from "@/db";
import { commissionServices, profiles } from "@/db/schema";
import { eq, desc, and, inArray, or, ilike } from "drizzle-orm";
import Link from "next/link";
import {
  Palette,
  Sparkles,
  Search,
  Briefcase,
  Clock,
  RefreshCw,
  ExternalLink,
  User,
  ArrowRight,
} from "lucide-react";

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
      artistWhatsappNumber: profiles.whatsappNumber,
      artistWhatsappEnabled: profiles.waConsentGiven,
    })
    .from(commissionServices)
    .innerJoin(profiles, eq(profiles.id, commissionServices.profileId))
    .where(and(...queryFilters))
    .orderBy(desc(commissionServices.createdAt));

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
            <Link href="/gallery" className="text-zinc-400 hover:text-white transition-colors">
              Galeri
            </Link>
            <Link href="/artists" className="text-zinc-400 hover:text-white transition-colors">
              Artist
            </Link>
            <Link href="/commissions" className="text-amber-400 font-semibold">
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

      {/* Hero & Search */}
      <section className="flex flex-col sm:flex-row sm:items-end justify-between gap-6">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-400 text-xs font-mono mb-2">
            <Sparkles className="h-3 w-3" />
            <span>HUB LAYANAN KREATOR</span>
          </div>
          <h1 className="font-display font-extrabold text-3xl sm:text-4xl text-[#f6f2e9] tracking-tight">
            Direktori Komisi Art
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            Jelajahi penawaran layanan komisi terbuka dari para artist komunitas Mengart.
          </p>
        </div>

        {/* Search */}
        <form method="GET" action="/commissions" className="w-full sm:w-72 relative">
          <input
            type="text"
            name="q"
            defaultValue={q || ""}
            placeholder="Cari layanan atau nama artist..."
            className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-zinc-500 text-xs font-sans focus:outline-none focus:border-amber-500/50"
          />
          <Search className="h-4 w-4 text-zinc-500 absolute left-3 top-3" />
        </form>
      </section>

      {/* Category Filter Tabs */}
      <section className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
        {CATEGORIES.map((cat) => {
          const isActive = (!category && cat === "Semua") || category === cat;
          const href =
            cat === "Semua" ? "/commissions" : `/commissions?category=${encodeURIComponent(cat)}`;

          return (
            <Link
              key={cat}
              href={href}
              className={`px-3.5 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all border ${
                isActive
                  ? "bg-amber-500 text-black border-amber-400 font-bold"
                  : "bg-white/5 text-zinc-400 border-white/10 hover:border-white/20 hover:text-white"
              }`}
            >
              {cat}
            </Link>
          );
        })}
      </section>

      {/* Services Grid */}
      {servicesList.length === 0 ? (
        <div className="glass-panel p-16 rounded-3xl flex flex-col items-center justify-center text-center gap-3">
          <Briefcase className="h-10 w-10 text-zinc-600" />
          <h3 className="font-display font-bold text-lg text-white">
            Belum ada layanan komisi aktif
          </h3>
          <p className="text-xs text-zinc-400 max-w-sm">
            Saat ini belum ada artist yang membuka slot pada kategori yang dipilih.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {servicesList.map((service) => {
            const formattedPrice = service.minPrice
              ? `Rp ${Number(service.minPrice).toLocaleString("id-ID")}`
              : "Hubungi untuk Estimasi";

            const waNumber = service.artistWhatsappNumber?.replace(/\D/g, "");
            let orderLink = `/artists/${service.artistSlug}`;

            if (service.orderDestination === "whatsapp" && waNumber) {
              const msg = encodeURIComponent(
                `Halo ${service.artistName}, saya tertarik memesan layanan komisi: "${service.title}" via Mengart Atelier.`
              );
              orderLink = `https://wa.me/${waNumber}?text=${msg}`;
            } else if (service.customDestinationUrl) {
              orderLink = service.customDestinationUrl;
            }

            return (
              <div
                key={service.id}
                className="glass-panel p-6 rounded-3xl flex flex-col justify-between gap-6 group hover:border-white/20 transition-all duration-200"
              >
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono uppercase bg-amber-500/10 text-amber-400 border border-amber-500/30">
                      {service.category}
                    </span>
                    <span
                      className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded-full border ${
                        service.artistCommissionStatus === "open"
                          ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                          : "bg-amber-500/10 text-amber-400 border-amber-500/30"
                      }`}
                    >
                      {service.artistCommissionStatus}
                    </span>
                  </div>

                  <h3 className="font-display font-bold text-lg text-[#f6f2e9]">{service.title}</h3>

                  {service.description ? (
                    <p className="text-xs text-zinc-300 font-sans line-clamp-3 leading-relaxed">
                      {service.description}
                    </p>
                  ) : null}
                </div>

                {/* Artist Info & Price */}
                <div className="flex flex-col gap-3 pt-4 border-t border-white/5">
                  <Link
                    href={`/artists/${service.artistSlug}`}
                    className="flex items-center gap-2.5 group-hover:text-amber-300 transition-colors"
                  >
                    <div className="h-7 w-7 rounded-lg bg-amber-500/20 flex items-center justify-center text-amber-400 text-xs font-bold font-display shrink-0">
                      {service.artistName?.charAt(0) || "A"}
                    </div>
                    <span className="text-xs font-semibold text-[#f6f2e9] truncate">
                      {service.artistName}
                    </span>
                  </Link>

                  <div className="flex items-center justify-between text-xs font-mono">
                    <span className="text-zinc-500">Harga Mulai:</span>
                    <span className="font-bold text-amber-400 text-sm">{formattedPrice}</span>
                  </div>

                  <div className="flex items-center justify-between text-zinc-400 text-[11px] font-mono">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {service.minTurnaroundDays}-{service.maxTurnaroundDays} hari
                    </span>
                    <span className="flex items-center gap-1">
                      <RefreshCw className="h-3 w-3" />
                      {service.includedRevisions} revisi
                    </span>
                  </div>

                  <a
                    href={orderLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold font-sans transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-md shadow-amber-500/10"
                  >
                    <span>Pesan / Tanya Detail</span>
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
