import Link from "next/link";
import { Activity, Sparkles, Image as ImageIcon, Trophy, User, MessageSquare } from "lucide-react";
import type { getRecentCommunityActivity } from "@/lib/activity";

interface HomeActivityFeedProps {
  activities: Awaited<ReturnType<typeof getRecentCommunityActivity>>;
}

export function HomeActivityFeed({ activities }: HomeActivityFeedProps) {
  if (activities.length === 0) {
    return null;
  }

  const formatActivityLabel = (act: (typeof activities)[0]) => {
    const meta = act.metadata as Record<string, any>;
    switch (act.eventType) {
      case "artwork_published":
        return `mempublikasikan karya "${meta?.title || "karya baru"}" ke galeri`;
      case "critique_posted":
        return `memberikan masukan ${meta?.aspect ? String(meta.aspect).replace(/_/g, " ") : ""} pada "${meta?.artworkTitle || "karya"}"`;
      case "challenge_submitted":
        return "mengirimkan submisi challenge";
      case "spotlight_published":
        return "terpilih sebagai Artist of the Month";
      default:
        return "berinteraksi di komunitas atelier";
    }
  };

  return (
    <section className="glass-panel p-6 sm:p-8 rounded-3xl flex flex-col gap-5 border border-white/10">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="h-5 w-5 text-amber-400" />
          <h3 className="font-display font-bold text-xl text-[#f6f2e9]">Aktivitas Komunitas Terkini</h3>
        </div>
        <span className="text-[10px] font-mono text-amber-400 uppercase bg-amber-500/10 px-2.5 py-0.5 rounded-full border border-amber-500/30">
          LIVE FEED
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {activities.map((act) => {
          const meta = act.metadata as Record<string, any>;
          const actorName = meta?.displayName || meta?.artistName || "Artist Atelier";
          const timeStr = new Intl.DateTimeFormat("id-ID", {
            timeZone: "Asia/Makassar",
            day: "numeric",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
          }).format(new Date(act.createdAt));

          return (
            <div
              key={act.id}
              className="p-4 rounded-2xl bg-white/[0.02] border border-white/5 flex flex-col justify-between gap-2 hover:border-white/10 transition-colors"
            >
              <div className="flex items-center gap-2">
                <div className="h-7 w-7 rounded-lg bg-amber-500/20 text-amber-400 font-bold font-mono flex items-center justify-center text-xs shrink-0">
                  {actorName.charAt(0)}
                </div>
                <div className="flex flex-col truncate">
                  <span className="font-display font-bold text-xs text-[#f6f2e9] truncate">
                    {actorName}
                  </span>
                  <span className="text-[10px] font-mono text-zinc-500">{timeStr}</span>
                </div>
              </div>

              <p className="text-xs text-zinc-300 font-sans line-clamp-2">
                {formatActivityLabel(act)}
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
