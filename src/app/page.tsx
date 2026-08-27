import Link from "next/link";
import { Sparkles, Palette, Trophy, ShieldCheck, ArrowRight, Star, Crown, User } from "lucide-react";
import { getCurrentMonthlySpotlight, getRecentCommunityActivity } from "@/lib/activity";
import { HomeActivityFeed } from "@/components/home/HomeActivityFeed";

export default async function HomePage() {
  const spotlight = await getCurrentMonthlySpotlight();
  const activities = await getRecentCommunityActivity(8);

  return (
    <main className="p-6 sm:p-12 max-w-7xl mx-auto flex flex-col gap-16 flex-1">
      <div className="flex flex-col gap-16">
        {/* Hero Section */}
        <section className="py-6 sm:py-12 flex flex-col items-start gap-8">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-400 text-xs font-mono tracking-wide">
            <Sparkles className="h-3.5 w-3.5" />
            <span>KOMUNITAS DIGITAL ART & ATELIER PRIVAT</span>
          </div>

          <h1 className="font-display text-4xl sm:text-6xl lg:text-7xl font-extrabold text-[#f6f2e9] tracking-tight leading-[1.1]">
            Ruang Karya & <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-400 via-amber-200 to-amber-500">
              Kolektif Kreator Digital.
            </span>
          </h1>

          <p className="text-lg sm:text-xl text-zinc-400 max-w-2xl font-sans leading-relaxed">
            Atelier digital khusus kreator seni visual. Temukan portofolio terkurasi, buka layanan komisi langsung via WhatsApp, dan ikuti community challenge dengan sistem voting Stars yang adil.
          </p>

          {/* Feature Highlights Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 w-full mt-6">
            <div className="glass-panel p-6 rounded-2xl flex flex-col gap-3">
              <div className="h-10 w-10 rounded-lg bg-white/5 flex items-center justify-center text-amber-400">
                <Palette className="h-5 w-5" />
              </div>
              <h3 className="font-display font-semibold text-lg text-[#f6f2e9]">Portofolio Terkurasi</h3>
              <p className="text-sm text-zinc-400 leading-relaxed">
                Showcase publik ber-watermark terlindungi berdampingan dengan arsip master penuh bagi sesama anggota.
              </p>
            </div>

            <div className="glass-panel p-6 rounded-2xl flex flex-col gap-3">
              <div className="h-10 w-10 rounded-lg bg-white/5 flex items-center justify-center text-amber-400">
                <Trophy className="h-5 w-5" />
              </div>
              <h3 className="font-display font-semibold text-lg text-[#f6f2e9]">Art Challenge</h3>
              <p className="text-sm text-zinc-400 leading-relaxed">
                Voting suara anonim dengan alokasi Stars serta penilaian juri tanpa bias urutan scroll.
              </p>
            </div>

            <div className="glass-panel p-6 rounded-2xl flex flex-col gap-3">
              <div className="h-10 w-10 rounded-lg bg-white/5 flex items-center justify-center text-amber-400">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <h3 className="font-display font-semibold text-lg text-[#f6f2e9]">Pusat Komisi</h3>
              <p className="text-sm text-zinc-400 leading-relaxed">
                Informasi ketersediaan slot, transparansi ketentuan do/don't, dan pemesanan langsung via WhatsApp.
              </p>
            </div>
          </div>
        </section>

        {/* Featured Monthly Artist Spotlight */}
        {spotlight ? (
          <section className="glass-panel-elevated p-8 sm:p-12 rounded-3xl border border-amber-500/30 flex flex-col lg:flex-row items-center gap-8 relative overflow-hidden shadow-2xl">
            <div className="flex flex-col gap-4 flex-1">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30 text-xs font-mono w-fit">
                <Crown className="h-3.5 w-3.5" />
                <span>ARTIST OF THE MONTH · BULAN INI</span>
              </div>

              <h2 className="font-display font-extrabold text-3xl sm:text-4xl text-[#f6f2e9] tracking-tight">
                {spotlight.artistName}
              </h2>

              <blockquote className="p-4 rounded-2xl bg-white/[0.02] border-l-2 border-amber-400 text-xs sm:text-sm text-zinc-300 font-sans italic leading-relaxed">
                "{spotlight.curatorQuote}"
              </blockquote>

              <div className="flex items-center gap-3 pt-2">
                <Link
                  href={`/artists/${spotlight.artistSlug}`}
                  className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs font-mono transition-all shadow-md shadow-amber-500/20 flex items-center gap-1.5"
                >
                  <User className="h-3.5 w-3.5" />
                  <span>Kunjungi Profil Artist</span>
                </Link>
                {spotlight.artworkSlug ? (
                  <Link
                    href={`/artworks/${spotlight.artworkSlug}`}
                    className="px-5 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white text-xs font-mono transition-colors"
                  >
                    Lihat Karya Sorotan
                  </Link>
                ) : null}
              </div>
            </div>

            {spotlight.thumbnailStorageKey ? (
              <div className="w-full lg:w-96 aspect-[4/3] rounded-2xl overflow-hidden border border-white/10 bg-black/40 shadow-xl shrink-0">
                <img
                  src={`/api/media/public/${spotlight.thumbnailStorageKey}`}
                  alt={spotlight.artistName}
                  className="w-full h-full object-cover"
                />
              </div>
            ) : null}
          </section>
        ) : null}

        {/* Live Community Activity Feed */}
        <HomeActivityFeed activities={activities} />
      </div>
    </main>
  );
}
