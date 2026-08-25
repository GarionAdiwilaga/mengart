import { db } from "@/db";
import { profiles, users } from "@/db/schema";
import { eq, desc, and, or, ilike } from "drizzle-orm";
import Link from "next/link";
import { Palette, Sparkles, Search, User, Briefcase, MapPin, ArrowRight } from "lucide-react";

interface ArtistsPageProps {
  searchParams: Promise<{
    q?: string;
    status?: string;
  }>;
}

export default async function ArtistsDirectoryPage({ searchParams }: ArtistsPageProps) {
  const { q, status } = await searchParams;

  const queryFilters = [eq(profiles.profileStatus, "active_public")];

  if (status && ["open", "waitlist", "closed"].includes(status.toLowerCase())) {
    queryFilters.push(eq(profiles.commissionStatus, status.toLowerCase() as any));
  }

  if (q) {
    queryFilters.push(
      or(ilike(profiles.displayName, `%${q}%`), ilike(profiles.bio, `%${q}%`))!
    );
  }

  const artistsList = await db
    .select({
      id: profiles.id,
      displayName: profiles.displayName,
      slug: profiles.slug,
      bio: profiles.bio,
      avatarUrl: profiles.avatarUrl,
      location: profiles.location,
      specialties: profiles.specialties,
      software: profiles.software,
      commissionStatus: profiles.commissionStatus,
      waitlistCurrentSlots: profiles.waitlistCurrentSlots,
      waitlistMaxSlots: profiles.waitlistMaxSlots,
    })
    .from(profiles)
    .where(and(...queryFilters))
    .orderBy(desc(profiles.createdAt));

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
            <Link href="/artists" className="text-amber-400 font-semibold">
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

      {/* Hero & Search */}
      <section className="flex flex-col sm:flex-row sm:items-end justify-between gap-6">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-400 text-xs font-mono mb-2">
            <Sparkles className="h-3 w-3" />
            <span>DIREKTORI KREATOR</span>
          </div>
          <h1 className="font-display font-extrabold text-3xl sm:text-4xl text-[#f6f2e9] tracking-tight">
            Kolektif Artist Digital
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            Temukan kreator terverifikasi, pelajari spesialisasi mereka, dan buka pemesanan komisi.
          </p>
        </div>

        {/* Search */}
        <form method="GET" action="/artists" className="w-full sm:w-72 relative">
          <input
            type="text"
            name="q"
            defaultValue={q || ""}
            placeholder="Cari nama artist..."
            className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-zinc-500 text-xs font-sans focus:outline-none focus:border-amber-500/50"
          />
          <Search className="h-4 w-4 text-zinc-500 absolute left-3 top-3" />
        </form>
      </section>

      {/* Status Filter Pills */}
      <section className="flex items-center gap-2">
        {[
          { label: "Semua Status", val: "" },
          { label: "Commission: OPEN", val: "open" },
          { label: "Commission: WAITLIST", val: "waitlist" },
          { label: "Commission: CLOSED", val: "closed" },
        ].map((st) => {
          const isActive = (!status && st.val === "") || status === st.val;
          const href = st.val === "" ? "/artists" : `/artists?status=${st.val}`;

          return (
            <Link
              key={st.val}
              href={href}
              className={`px-3.5 py-1.5 rounded-full text-xs font-mono transition-all border ${
                isActive
                  ? "bg-amber-500 text-black border-amber-400 font-bold"
                  : "bg-white/5 text-zinc-400 border-white/10 hover:border-white/20 hover:text-white"
              }`}
            >
              {st.label}
            </Link>
          );
        })}
      </section>

      {/* Artists Grid */}
      {artistsList.length === 0 ? (
        <div className="glass-panel p-16 rounded-3xl flex flex-col items-center justify-center text-center gap-3">
          <User className="h-10 w-10 text-zinc-600" />
          <h3 className="font-display font-bold text-lg text-white">Tidak ada artist ditemukan</h3>
          <p className="text-xs text-zinc-400 max-w-sm">
            Coba gunakan kata kunci pencarian yang berbeda.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {artistsList.map((artist) => {
            const statusClass =
              artist.commissionStatus === "open"
                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                : artist.commissionStatus === "waitlist"
                ? "bg-amber-500/10 text-amber-400 border-amber-500/30"
                : "bg-zinc-500/10 text-zinc-400 border-zinc-500/30";

            return (
              <div
                key={artist.id}
                className="glass-panel p-6 rounded-3xl flex flex-col justify-between gap-6 group hover:border-white/20 transition-all duration-200"
              >
                <div className="flex flex-col gap-4">
                  {/* Artist Header */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3.5">
                      <div className="h-14 w-14 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 font-display font-bold text-xl shrink-0">
                        {artist.displayName?.charAt(0) || "A"}
                      </div>
                      <div className="flex flex-col">
                        <Link
                          href={`/artists/${artist.slug}`}
                          className="font-display font-bold text-base text-[#f6f2e9] group-hover:text-amber-300 transition-colors truncate"
                        >
                          {artist.displayName}
                        </Link>
                        {artist.location ? (
                          <span className="text-[11px] font-sans text-zinc-400 flex items-center gap-1">
                            <MapPin className="h-3 w-3 text-zinc-500" />
                            {artist.location}
                          </span>
                        ) : null}
                      </div>
                    </div>

                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono uppercase border shrink-0 ${statusClass}`}
                    >
                      {artist.commissionStatus}
                    </span>
                  </div>

                  {/* Bio */}
                  {artist.bio ? (
                    <p className="text-xs text-zinc-300 line-clamp-3 leading-relaxed">
                      {artist.bio}
                    </p>
                  ) : null}

                  {/* Specialties */}
                  {artist.specialties && artist.specialties.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5 pt-2">
                      {artist.specialties.slice(0, 3).map((spec) => (
                        <span
                          key={spec}
                          className="px-2 py-0.5 rounded-md bg-white/5 border border-white/10 text-[11px] font-sans text-zinc-300"
                        >
                          {spec}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>

                {/* Footer Action */}
                <div className="pt-3 border-t border-white/5 flex items-center justify-between">
                  <span className="text-[11px] font-mono text-zinc-500">
                    /artists/{artist.slug}
                  </span>
                  <Link
                    href={`/artists/${artist.slug}`}
                    className="text-xs font-mono text-amber-400 hover:text-amber-300 transition-colors inline-flex items-center gap-1"
                  >
                    <span>Buka Profil</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
