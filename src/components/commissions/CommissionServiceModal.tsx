"use client";

import { useState } from "react";
import { Plus, X, Sparkles, Loader2, AlertCircle, Briefcase, DollarSign, Clock } from "lucide-react";
import { saveCommissionServiceAction, type CommissionServiceInput } from "@/app/actions/commissions";

interface CommissionServiceModalProps {
  serviceToEdit?: {
    id: string;
    title: string;
    description: string | null;
    category: string;
    pricingType: "fixed" | "starting_from" | "range" | "contact_for_quote";
    currency: string;
    minPrice: string | null;
    maxPrice: string | null;
    minTurnaroundDays: number;
    maxTurnaroundDays: number;
    includedRevisions: number;
    commercialUseAvailable: boolean;
    orderDestination: "whatsapp" | "vgen" | "artistree" | "kofi" | "trakteer" | "custom_url";
    customDestinationUrl: string | null;
    serviceStatus: "draft" | "published" | "unavailable" | "hidden";
  } | null;
  onClose?: () => void;
}

export function CommissionServiceModal({ serviceToEdit, onClose }: CommissionServiceModalProps) {
  const [isOpen, setIsOpen] = useState(!!serviceToEdit);
  const [title, setTitle] = useState(serviceToEdit?.title || "");
  const [description, setDescription] = useState(serviceToEdit?.description || "");
  const [category, setCategory] = useState(serviceToEdit?.category || "Character Illustration");
  const [pricingType, setPricingType] = useState<"fixed" | "starting_from" | "range" | "contact_for_quote">(
    serviceToEdit?.pricingType || "starting_from"
  );
  const [currency, setCurrency] = useState(serviceToEdit?.currency || "IDR");
  const [minPrice, setMinPrice] = useState<number | "">(
    serviceToEdit?.minPrice ? Number(serviceToEdit.minPrice) : 250000
  );
  const [maxPrice, setMaxPrice] = useState<number | "">(
    serviceToEdit?.maxPrice ? Number(serviceToEdit.maxPrice) : 500000
  );
  const [minTurnaroundDays, setMinTurnaroundDays] = useState(serviceToEdit?.minTurnaroundDays || 3);
  const [maxTurnaroundDays, setMaxTurnaroundDays] = useState(serviceToEdit?.maxTurnaroundDays || 14);
  const [includedRevisions, setIncludedRevisions] = useState(serviceToEdit?.includedRevisions || 2);
  const [commercialUseAvailable, setCommercialUseAvailable] = useState(
    serviceToEdit?.commercialUseAvailable || false
  );
  const [orderDestination, setOrderDestination] = useState<
    "whatsapp" | "vgen" | "artistree" | "kofi" | "trakteer" | "custom_url"
  >(serviceToEdit?.orderDestination || "whatsapp");
  const [customDestinationUrl, setCustomDestinationUrl] = useState(
    serviceToEdit?.customDestinationUrl || ""
  );
  const [serviceStatus, setServiceStatus] = useState<"draft" | "published" | "unavailable" | "hidden">(
    serviceToEdit?.serviceStatus || "published"
  );

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClose = () => {
    setIsOpen(false);
    if (onClose) onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      await saveCommissionServiceAction({
        id: serviceToEdit?.id,
        title: title.trim(),
        description: description.trim() || null,
        category,
        pricingType,
        currency,
        minPrice: minPrice === "" ? null : Number(minPrice),
        maxPrice: maxPrice === "" ? null : Number(maxPrice),
        minTurnaroundDays: Number(minTurnaroundDays),
        maxTurnaroundDays: Number(maxTurnaroundDays),
        includedRevisions: Number(includedRevisions),
        commercialUseAvailable,
        orderDestination,
        customDestinationUrl: customDestinationUrl.trim() || null,
        serviceStatus,
      });

      handleClose();
    } catch (err: any) {
      setError(err?.message || "Gagal menyimpan layanan komisi");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      {!serviceToEdit ? (
        <button
          onClick={() => setIsOpen(true)}
          className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold transition-all shadow-md shadow-amber-500/20 flex items-center gap-1.5 cursor-pointer"
        >
          <Plus className="h-4 w-4" />
          <span>Tambah Layanan Komisi</span>
        </button>
      ) : null}

      {isOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="w-full max-w-2xl glass-panel-elevated p-6 sm:p-8 rounded-3xl relative flex flex-col gap-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="h-9 w-9 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
                  <Briefcase className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-display font-bold text-lg text-[#f6f2e9]">
                    {serviceToEdit ? "Edit Layanan Komisi" : "Tambah Layanan Komisi Baru"}
                  </h3>
                </div>
              </div>
              <button
                onClick={handleClose}
                className="p-2 rounded-lg text-zinc-400 hover:text-white transition-colors cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {error ? (
              <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-xs flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
                <span>{error}</span>
              </div>
            ) : null}

            <form onSubmit={handleSubmit} className="flex flex-col gap-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5 sm:col-span-2">
                  <label className="text-xs font-mono text-zinc-300">NAMA / JENIS LAYANAN</label>
                  <input
                    type="text"
                    required
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. Bust-up Anime Character, Full Body + BG"
                    maxLength={100}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-zinc-600 focus:outline-none focus:border-amber-500/50 text-sm font-sans"
                  />
                </div>

                <div className="flex flex-col gap-1.5 sm:col-span-2">
                  <label className="text-xs font-mono text-zinc-300">DESKRIPSI RINCIAN LAYANAN</label>
                  <textarea
                    rows={2}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Sebutkan apa yang didapat klien (resolusi kanvas, format file, background standard)..."
                    className="w-full px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-zinc-600 focus:outline-none focus:border-amber-500/50 text-sm font-sans resize-none"
                  />
                </div>
              </div>

              {/* Pricing Grid */}
              <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/5 flex flex-col gap-4">
                <div className="flex items-center gap-2 text-xs font-mono text-amber-400">
                  <DollarSign className="h-4 w-4" />
                  <span>STRUKTUR HARGA</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-mono text-zinc-400">MODEL HARGA</label>
                    <select
                      value={pricingType}
                      onChange={(e) => setPricingType(e.target.value as any)}
                      className="w-full px-3 py-2 rounded-xl bg-[#181c26] border border-white/10 text-white text-xs font-sans focus:outline-none"
                    >
                      <option value="starting_from">Mulai Dari (Starting from)</option>
                      <option value="fixed">Harga Tetap (Fixed)</option>
                      <option value="range">Rentang Harga (Range)</option>
                      <option value="contact_for_quote">Hubungi untuk Estimasi</option>
                    </select>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-mono text-zinc-400">HARGA MINIMAL (IDR)</label>
                    <input
                      type="number"
                      min={0}
                      step={10000}
                      value={minPrice}
                      onChange={(e) => setMinPrice(e.target.value === "" ? "" : Number(e.target.value))}
                      placeholder="e.g. 250000"
                      className="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-xs font-mono"
                    />
                  </div>

                  {pricingType === "range" ? (
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-mono text-zinc-400">HARGA MAKSIMAL (IDR)</label>
                      <input
                        type="number"
                        min={0}
                        step={10000}
                        value={maxPrice}
                        onChange={(e) => setMaxPrice(e.target.value === "" ? "" : Number(e.target.value))}
                        placeholder="e.g. 500000"
                        className="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-xs font-mono"
                      />
                    </div>
                  ) : null}
                </div>
              </div>

              {/* Turnaround & Terms */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-mono text-zinc-300">ESTIMASI KERJA (HARI)</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={1}
                      max={180}
                      value={minTurnaroundDays}
                      onChange={(e) => setMinTurnaroundDays(Number(e.target.value))}
                      className="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-xs font-mono text-center"
                    />
                    <span className="text-zinc-500 font-mono text-xs">-</span>
                    <input
                      type="number"
                      min={minTurnaroundDays}
                      max={365}
                      value={maxTurnaroundDays}
                      onChange={(e) => setMaxTurnaroundDays(Number(e.target.value))}
                      className="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-xs font-mono text-center"
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-mono text-zinc-300">JUMLAH REVISI BEBAS</label>
                  <input
                    type="number"
                    min={0}
                    max={20}
                    value={includedRevisions}
                    onChange={(e) => setIncludedRevisions(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-xs font-mono"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-mono text-zinc-300">STATUS LAYANAN</label>
                  <select
                    value={serviceStatus}
                    onChange={(e) => setServiceStatus(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-xl bg-[#181c26] border border-white/10 text-white text-xs font-sans focus:outline-none"
                  >
                    <option value="published">Publik (Aktif)</option>
                    <option value="unavailable">Penuh / Tidak Tersedia</option>
                    <option value="draft">Draf (Sembunyikan)</option>
                  </select>
                </div>
              </div>

              {/* Destination CTA */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-mono text-zinc-300">GATEWAY PEMESANAN / CTA</label>
                  <select
                    value={orderDestination}
                    onChange={(e) => setOrderDestination(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-xl bg-[#181c26] border border-white/10 text-white text-xs font-sans focus:outline-none"
                  >
                    <option value="whatsapp">Direct WhatsApp (Rekomendasi)</option>
                    <option value="vgen">VGen</option>
                    <option value="artistree">Artistree</option>
                    <option value="kofi">Ko-fi</option>
                    <option value="trakteer">Trakteer</option>
                    <option value="custom_url">Tautan Kustom Lainnya</option>
                  </select>
                </div>

                {orderDestination !== "whatsapp" ? (
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-mono text-zinc-300">URL TUJUAN</label>
                    <input
                      type="url"
                      value={customDestinationUrl}
                      onChange={(e) => setCustomDestinationUrl(e.target.value)}
                      placeholder="https://vgen.co/..."
                      className="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-xs font-sans"
                    />
                  </div>
                ) : null}
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-3 mt-4 pt-4 border-t border-white/10">
                <button
                  type="button"
                  onClick={handleClose}
                  className="px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-300 text-xs font-medium transition-colors cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="px-6 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold transition-all shadow-md shadow-amber-500/20 flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin text-black" />
                      <span>Menyimpan...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4 text-black" />
                      <span>Simpan Layanan</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
