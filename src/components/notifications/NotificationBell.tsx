"use client";

import { useState } from "react";
import { Bell, Check, Sparkles, ExternalLink, X } from "lucide-react";
import { markNotificationReadAction, markAllNotificationsReadAction } from "@/app/actions/notifications";
import Link from "next/link";

interface NotificationItem {
  id: string;
  userId: string;
  type: string;
  title: string;
  body: string;
  actionUrl: string | null;
  isRead: boolean;
  priority: "normal" | "high" | "critical";
  createdAt: Date;
}

interface NotificationBellProps {
  notifications: NotificationItem[];
}

export function NotificationBell({ notifications }: NotificationBellProps) {
  const [isOpen, setIsOpen] = useState(false);
  const unreadCount = notifications.filter((n) => !n.isRead).length;

  const handleMarkAll = async () => {
    await markAllNotificationsReadAction();
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        title="Notifikasi"
        className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white transition-colors relative cursor-pointer"
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 ? (
          <span className="absolute -top-1 -right-1 h-4 min-w-4 px-1 rounded-full bg-amber-500 text-black font-mono font-bold text-[10px] flex items-center justify-center">
            {unreadCount}
          </span>
        ) : null}
      </button>

      {isOpen ? (
        <div className="absolute right-0 mt-3 w-80 sm:w-96 glass-panel-elevated p-4 rounded-3xl z-50 flex flex-col gap-3 shadow-2xl border border-white/15 animate-in fade-in zoom-in-95 duration-150">
          <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
            <div className="flex items-center gap-1.5 text-xs font-mono text-[#f6f2e9] font-bold">
              <Bell className="h-3.5 w-3.5 text-amber-400" />
              <span>NOTIFIKASI</span>
            </div>

            {unreadCount > 0 ? (
              <button
                onClick={handleMarkAll}
                className="text-[11px] font-mono text-amber-400 hover:text-amber-300 transition-colors cursor-pointer"
              >
                Tandai Semua Dibaca
              </button>
            ) : null}
          </div>

          {notifications.length === 0 ? (
            <div className="py-8 text-center text-zinc-500 text-xs font-mono">
              Belum ada notifikasi baru.
            </div>
          ) : (
            <div className="flex flex-col gap-2 max-h-80 overflow-y-auto divide-y divide-white/5">
              {notifications.map((notif) => (
                <div
                  key={notif.id}
                  className={`pt-2 flex flex-col gap-1 text-xs ${
                    notif.isRead ? "opacity-60" : "opacity-100"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-[#f6f2e9] font-display">{notif.title}</span>
                    {!notif.isRead ? (
                      <span className="h-2 w-2 rounded-full bg-amber-500" />
                    ) : null}
                  </div>
                  {notif.body ? <p className="text-zinc-400 text-[11px] leading-relaxed">{notif.body}</p> : null}
                  {notif.actionUrl ? (
                    <Link
                      href={notif.actionUrl}
                      onClick={() => {
                        markNotificationReadAction(notif.id);
                        setIsOpen(false);
                      }}
                      className="text-[11px] font-mono text-amber-400 hover:text-amber-300 transition-colors inline-flex items-center gap-1 mt-0.5"
                    >
                      <span>Buka Tautan</span>
                      <ExternalLink className="h-3 w-3" />
                    </Link>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
