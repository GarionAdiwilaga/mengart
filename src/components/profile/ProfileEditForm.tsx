"use client";

import { useState } from "react";
import { updateProfileAction, type UpdateProfileInput } from "@/app/actions/profile";
import { Sparkles, Save, Loader2, CheckCircle2, AlertCircle, Phone, MessageSquare } from "lucide-react";

interface ProfileEditFormProps {
  initialProfile: {
    displayName: string;
    bio: string | null;
    specialties: string[] | null;
    software: string[] | null;
    location: string | null;
    languages: string[] | null;
    whatsappNumber: string | null;
    waConsentGiven: boolean;
    commissionStatus: "open" | "waitlist" | "closed";
    waitlistMaxSlots: number | null;
    waitlistCurrentSlots: number | null;
    slug: string;
  };
}

const COMMON_SPECIALTIES = [
  "Character Illustration",
  "Environment & Background",
  "Concept Art",
  "Pixel Art",
  "3D Modeling & Render",
  "Live2D / Rigging",
  "Animation & Motion",
  "Comic / Webtoon",
  "Chibi / Emotes",
];

const COMMON_SOFTWARE = [
  "Clip Studio Paint",
  "Adobe Photoshop",
  "Procreate",
  "Blender",
  "Paint Tool SAI",
  "Aseprite",
  "ZBrush",
  "Maya",
  "After Effects",
];

export function ProfileEditForm({ initialProfile }: ProfileEditFormProps) {
  const [displayName, setDisplayName] = useState(initialProfile.displayName || "");
  const [bio, setBio] = useState(initialProfile.bio || "");
  const [location, setLocation] = useState(initialProfile.location || "");
  const [specialties, setSpecialties] = useState<string[]>(initialProfile.specialties || []);
  const [software, setSoftware] = useState<string[]>(initialProfile.software || []);
  const [commissionStatus, setCommissionStatus] = useState<"open" | "waitlist" | "closed">(
    initialProfile.commissionStatus || "closed"
  );
  const [waitlistMaxSlots, setWaitlistMaxSlots] = useState<number>(
    initialProfile.waitlistMaxSlots || 5
  );
  const [waitlistCurrentSlots, setWaitlistCurrentSlots] = useState<number>(
    initialProfile.waitlistCurrentSlots || 0
  );
  const [whatsappNumber, setWhatsappNumber] = useState(initialProfile.whatsappNumber || "");
  const [whatsappEnabled, setWhatsappEnabled] = useState(initialProfile.waConsentGiven || false);

  const [isLoading, setIsLoading] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleSpecialty = (item: string) => {
    setSpecialties((prev) =>
      prev.includes(item) ? prev.filter((s) => s !== item) : [...prev, item]
    );
  };

  const toggleSoftware = (item: string) => {
    setSoftware((prev) =>
      prev.includes(item) ? prev.filter((s) => s !== item) : [...prev, item]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    setSavedSuccess(false);

    try {
      await updateProfileAction({
        displayName: displayName.trim(),
        bio: bio.trim() || null,
        location: location.trim() || null,
        specialties,
        software,
        commissionStatus,
        waitlistMaxSlots: commissionStatus === "waitlist" ? waitlistMaxSlots : null,
        waitlistCurrentSlots: commissionStatus === "waitlist" ? waitlistCurrentSlots : null,
        whatsappNumber: whatsappNumber.trim() || null,
        whatsappEnabled,
      });

      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3000);
    } catch (err: any) {
      setError(err?.message || "Gagal menyimpan perubahan profil.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-8">
      {savedSuccess ? (
        <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
          <span>Perubahan profil berhasil disimpan!</span>
        </div>
      ) : null}

      {error ? (
        <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
          <span>{error}</span>
        </div>
      ) : null}

      {/* Basic Profile Details Section */}
      <section className="glass-panel p-6 sm:p-8 rounded-3xl flex flex-col gap-6">
        <h2 className="font-display font-bold text-lg text-[#f6f2e9]">Informasi Dasar Profil</h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-mono text-zinc-300">NAMA ARTIST / DISPLAY NAME</label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required
              maxLength={50}
              placeholder="e.g. Ren Kisaragi"
              className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-zinc-600 focus:outline-none focus:border-amber-500/60 text-sm font-sans"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-mono text-zinc-300">LOKASI / DOMISILI (OPSIONAL)</label>
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              maxLength={100}
              placeholder="e.g. Bali, Indonesia"
              className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-zinc-600 focus:outline-none focus:border-amber-500/60 text-sm font-sans"
            />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-mono text-zinc-300">BIOGRAFI KREATOR</label>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            rows={4}
            maxLength={1000}
            placeholder="Ceritakan latar belakang artistik, fokus karya, dan gaya visual Anda..."
            className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-zinc-600 focus:outline-none focus:border-amber-500/60 text-sm font-sans resize-none"
          />
        </div>
      </section>

      {/* Specialties & Software */}
      <section className="glass-panel p-6 sm:p-8 rounded-3xl flex flex-col gap-6">
        <h2 className="font-display font-bold text-lg text-[#f6f2e9]">Spesialisasi & Software</h2>

        <div className="flex flex-col gap-3">
          <label className="text-xs font-mono text-zinc-300">SPESIALISASI ART</label>
          <div className="flex flex-wrap gap-2">
            {COMMON_SPECIALTIES.map((spec) => {
              const isSelected = specialties.includes(spec);
              return (
                <button
                  type="button"
                  key={spec}
                  onClick={() => toggleSpecialty(spec)}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition-all cursor-pointer border ${
                    isSelected
                      ? "bg-amber-500 text-black border-amber-400 font-semibold"
                      : "bg-white/5 text-zinc-400 border-white/10 hover:border-white/20 hover:text-white"
                  }`}
                >
                  {spec}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-col gap-3 pt-4 border-t border-white/5">
          <label className="text-xs font-mono text-zinc-300">SOFTWARE UTAMA</label>
          <div className="flex flex-wrap gap-2">
            {COMMON_SOFTWARE.map((soft) => {
              const isSelected = software.includes(soft);
              return (
                <button
                  type="button"
                  key={soft}
                  onClick={() => toggleSoftware(soft)}
                  className={`px-3 py-1 rounded-xl text-xs font-mono transition-all cursor-pointer border ${
                    isSelected
                      ? "bg-amber-500/20 text-amber-300 border-amber-500/50"
                      : "bg-white/5 text-zinc-400 border-white/10 hover:border-white/20 hover:text-white"
                  }`}
                >
                  {soft}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* Commission Status & WhatsApp Gate */}
      <section className="glass-panel p-6 sm:p-8 rounded-3xl flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <h2 className="font-display font-bold text-lg text-[#f6f2e9]">Status Layanan Komisi</h2>
          <span
            className={`px-3 py-1 rounded-full text-xs font-mono font-bold border uppercase ${
              commissionStatus === "open"
                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                : commissionStatus === "waitlist"
                ? "bg-amber-500/10 text-amber-400 border-amber-500/30"
                : "bg-zinc-500/10 text-zinc-400 border-zinc-500/30"
            }`}
          >
            STATUS: {commissionStatus}
          </span>
        </div>

        <div className="grid grid-cols-3 gap-3">
          {(["open", "waitlist", "closed"] as const).map((status) => (
            <button
              type="button"
              key={status}
              onClick={() => setCommissionStatus(status)}
              className={`py-3 px-4 rounded-2xl text-xs font-mono font-semibold transition-all border cursor-pointer text-center uppercase ${
                commissionStatus === status
                  ? "bg-amber-500 text-black border-amber-400"
                  : "bg-white/5 text-zinc-400 border-white/10 hover:border-white/20"
              }`}
            >
              {status === "open"
                ? "OPEN (Buka)"
                : status === "waitlist"
                ? "WAITLIST (Antrean)"
                : "CLOSED (Tutup)"}
            </button>
          ))}
        </div>

        {commissionStatus === "waitlist" ? (
          <div className="grid grid-cols-2 gap-4 p-4 rounded-2xl bg-amber-500/5 border border-amber-500/20">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-mono text-amber-300">TOTAL SLOT WAITLIST</label>
              <input
                type="number"
                min={1}
                max={50}
                value={waitlistMaxSlots}
                onChange={(e) => setWaitlistMaxSlots(Number(e.target.value))}
                className="w-full px-3.5 py-2 rounded-xl bg-black/40 border border-white/10 text-white text-xs font-mono"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-mono text-amber-300">SLOT TERISI SAAT INI</label>
              <input
                type="number"
                min={0}
                max={waitlistMaxSlots}
                value={waitlistCurrentSlots}
                onChange={(e) => setWaitlistCurrentSlots(Number(e.target.value))}
                className="w-full px-3.5 py-2 rounded-xl bg-black/40 border border-white/10 text-white text-xs font-mono"
              />
            </div>
          </div>
        ) : null}

        {/* WhatsApp Gateway Settings */}
        <div className="flex flex-col gap-4 pt-4 border-t border-white/5">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-mono text-zinc-300 flex items-center gap-1.5">
              <Phone className="h-3.5 w-3.5 text-amber-400" />
              <span>NOMOR WHATSAPP UNTUK ORDER KOMISI</span>
            </label>
            <input
              type="text"
              value={whatsappNumber}
              onChange={(e) => setWhatsappNumber(e.target.value)}
              placeholder="e.g. 6281234567890 (format internasional)"
              className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-zinc-600 focus:outline-none focus:border-amber-500/60 text-sm font-mono"
            />
            <span className="text-[11px] text-zinc-500 font-mono">
              Gunakan awalan kode negara (62 untuk Indonesia tanpa tanda +).
            </span>
          </div>

          <label className="flex items-start gap-3 p-3.5 rounded-2xl bg-white/[0.02] border border-white/5 cursor-pointer">
            <input
              type="checkbox"
              checked={whatsappEnabled}
              onChange={(e) => setWhatsappEnabled(e.target.checked)}
              className="mt-1 h-4 w-4 rounded border-white/20 bg-black/50 text-amber-500 focus:ring-amber-500"
            />
            <div className="flex flex-col gap-0.5">
              <span className="text-xs font-medium text-zinc-200">
                Aktifkan Tombol "Hubungi via WhatsApp" di Profil Publik
              </span>
              <span className="text-[11px] text-zinc-500 leading-relaxed">
                Pengunjung profil Anda dapat menekan tombol CTA untuk langsung membuka chat WhatsApp dengan pesan template komisi.
              </span>
            </div>
          </label>
        </div>
      </section>

      {/* Sticky Save Bar */}
      <div className="sticky bottom-6 z-20 glass-panel-elevated p-4 rounded-2xl flex items-center justify-between gap-4">
        <span className="text-xs font-mono text-zinc-400">
          Slug Profil Publik: <strong className="text-zinc-200">/artists/{initialProfile.slug}</strong>
        </span>
        <button
          type="submit"
          disabled={isLoading}
          className="px-6 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-sm transition-all shadow-md shadow-amber-500/20 flex items-center gap-2 cursor-pointer disabled:opacity-50"
        >
          {isLoading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin text-black" />
              <span>Menyimpan...</span>
            </>
          ) : (
            <>
              <Save className="h-4 w-4" />
              <span>Simpan Profil</span>
            </>
          )}
        </button>
      </div>
    </form>
  );
}
