import { requireAuth } from "@/lib/rbac";
import { db } from "@/db";
import { commissionServices, commissionScopeRules, profiles } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import Link from "next/link";
import { ArrowLeft, Briefcase, Plus, ExternalLink, Clock, RefreshCw } from "lucide-react";
import { CommissionServiceModal } from "@/components/commissions/CommissionServiceModal";
import { DeleteCommissionServiceButton } from "@/components/commissions/DeleteCommissionServiceButton";
import { ScopeRulesEditor } from "@/components/commissions/ScopeRulesEditor";

export default async function CommissionsManagerPage() {
  const user = await requireAuth("/login");

  const [profile] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.userId, user.id))
    .limit(1);

  if (!profile) {
    return (
      <main className="min-h-screen p-6 sm:p-12 max-w-6xl mx-auto flex flex-col gap-6">
        <p className="text-zinc-400 text-sm font-mono">Profil tidak ditemukan.</p>
      </main>
    );
  }

  const servicesList = await db
    .select()
    .from(commissionServices)
    .where(eq(commissionServices.profileId, profile.id))
    .orderBy(desc(commissionServices.createdAt));

  const scopeRules = await db
    .select()
    .from(commissionScopeRules)
    .where(eq(commissionScopeRules.profileId, profile.id))
    .orderBy(commissionScopeRules.displayOrder);

  return (
    <main className="p-6 sm:p-12 max-w-6xl mx-auto flex flex-col gap-10 flex-1">
      {/* Studio Header Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-6">
        <div className="flex flex-col gap-2">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1.5 text-xs font-mono text-zinc-400 hover:text-amber-400 transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Dashboard
          </Link>
          <h1 className="font-display font-extrabold text-3xl text-[#f6f2e9] tracking-tight">
            Pusat Layanan Komisi
          </h1>
          <p className="text-sm text-zinc-400">
            Atur kartu layanan, rentang harga, estimasi pengerjaan, dan ketentuan Do / Don't Anda.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <CommissionServiceModal />
        </div>
      </div>

      {/* Services List Section */}
      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display font-bold text-xl text-[#f6f2e9]">Daftar Layanan Komisi</h2>
          <span className="text-xs font-mono text-zinc-400">
            Status Komisi: <strong className="text-amber-400">{profile.commissionStatus}</strong>
          </span>
        </div>

        {servicesList.length === 0 ? (
          <div className="glass-panel p-8 rounded-3xl flex flex-col items-center justify-center text-center gap-3">
            <Briefcase className="h-10 w-10 text-zinc-500" />
            <h3 className="font-display font-bold text-base text-white">Belum Ada Layanan Dibuat</h3>
            <p className="text-xs text-zinc-400 max-w-md">
              Tambahkan kartu jenis layanan komisi seperti Full Body, Bust-up, atau Emote pack untuk ditampilkan di profil publik Anda.
            </p>
            <CommissionServiceModal />
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
            {servicesList.map((service) => {
              const formattedPrice = service.minPrice
                ? `Rp ${Number(service.minPrice).toLocaleString("id-ID")}`
                : "Hubungi untuk Estimasi";

              return (
                <div
                  key={service.id}
                  className="glass-panel p-6 rounded-3xl flex flex-col justify-between gap-5 group hover:border-white/20 transition-all"
                >
                  <div className="flex flex-col gap-2.5">
                    <div className="flex items-center justify-between">
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono uppercase bg-amber-500/10 text-amber-400 border border-amber-500/30">
                        {service.category}
                      </span>
                      <span
                        className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded-md border ${
                          service.serviceStatus === "published"
                            ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                            : "bg-zinc-500/10 text-zinc-400 border-zinc-500/30"
                        }`}
                      >
                        {service.serviceStatus}
                      </span>
                    </div>

                    <h3 className="font-display font-bold text-lg text-[#f6f2e9]">{service.title}</h3>
                    {service.description ? (
                      <p className="text-xs text-zinc-400 line-clamp-2 leading-relaxed">
                        {service.description}
                      </p>
                    ) : null}
                  </div>

                  <div className="flex flex-col gap-3 pt-3 border-t border-white/5 text-xs font-mono">
                    <div className="flex items-center justify-between text-zinc-200">
                      <span className="text-zinc-500">Harga:</span>
                      <span className="font-bold text-amber-400">{formattedPrice}</span>
                    </div>

                    <div className="flex items-center justify-between text-zinc-400 text-[11px]">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {service.minTurnaroundDays}-{service.maxTurnaroundDays} hari
                      </span>
                      <span className="flex items-center gap-1">
                        <RefreshCw className="h-3 w-3" />
                        {service.includedRevisions} revisi
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-3 border-t border-white/5">
                    <span className="text-[11px] font-mono text-zinc-500 uppercase">
                      Via {service.orderDestination}
                    </span>
                    <DeleteCommissionServiceButton serviceId={service.id} title={service.title} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Do / Don't Scope Rules Section */}
      <section className="flex flex-col gap-4 pt-6 border-t border-white/10">
        <div>
          <h2 className="font-display font-bold text-xl text-[#f6f2e9]">Cakupan Pesanan (Do / Don't Rules)</h2>
          <p className="text-xs text-zinc-400 mt-1">
            Cantumkan daftar apa yang bersedia dan tidak bersedia Anda gambar untuk transparansi klien.
          </p>
        </div>

        <ScopeRulesEditor initialRules={scopeRules} />
      </section>
    </main>
  );
}
