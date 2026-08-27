"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Bell, X, CheckCheck, Sparkles, MessageSquare, Trophy, AlertTriangle } from "lucide-react";
import Link from "next/link";
import { markNotificationReadAction, markAllNotificationsReadAction } from "@/app/actions/notifications";

export interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string | null;
  actionUrl: string | null;
  isRead: boolean;
  createdAt: Date;
}

interface NotificationDrawerProps {
  notifications: NotificationItem[];
}

export function NotificationDrawer({ notifications }: NotificationDrawerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const unreadCount = notifications.filter((n) => !n.isRead).length;

  const handleMarkAllRead = async () => {
    try {
      await markAllNotificationsReadAction();
    } catch (err) {
      console.error(err);
    }
  };

  const handleNotificationClick = async (notif: NotificationItem) => {
    if (!notif.isRead) {
      await markNotificationReadAction(notif.id);
    }
    setIsOpen(false);
  };

  const getIcon = (type: string) => {
    switch (type) {
      case "artwork_critiqued":
        return <MessageSquare className="h-4 w-4 text-amber-400" />;
      case "challenge_awarded":
      case "challenge_results_published":
        return <Trophy className="h-4 w-4 text-amber-400" />;
      case "submission_disqualified":
        return <AlertTriangle className="h-4 w-4 text-red-400" />;
      default:
        return <Sparkles className="h-4 w-4 text-amber-400" />;
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white transition-colors cursor-pointer"
        aria-label="Buka Notifikasi"
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 ? (
          <span className="absolute top-1.5 right-1.5 h-2.5 w-2.5 rounded-full bg-amber-500 ring-2 ring-[#0e1015]" />
        ) : null}
      </button>

      <AnimatePresence>
        {isOpen ? (
          <>
            {/* Backdrop */}
            <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />

            {/* Dropdown Panel */}
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.95 }}
              transition={{ duration: 0.15 }}
              className="absolute right-0 mt-3 w-80 sm:w-96 glass-panel-elevated rounded-3xl border border-white/15 shadow-2xl p-4 z-50 flex flex-col gap-3"
            >
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <div className="flex items-center gap-2">
                  <Bell className="h-4 w-4 text-amber-400" />
                  <h4 className="font-display font-bold text-sm text-[#f6f2e9]">Notifikasi</h4>
                  {unreadCount > 0 ? (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-500 text-black">
                      {unreadCount} baru
                    </span>
                  ) : null}
                </div>

                {unreadCount > 0 ? (
                  <button
                    onClick={handleMarkAllRead}
                    className="text-[11px] font-mono text-zinc-400 hover:text-amber-400 flex items-center gap-1 transition-colors cursor-pointer"
                  >
                    <CheckCheck className="h-3.5 w-3.5" />
                    <span>Tandai dibaca</span>
                  </button>
                ) : null}
              </div>

              <div className="max-h-80 overflow-y-auto flex flex-col gap-1 divide-y divide-white/5">
                {notifications.length === 0 ? (
                  <div className="py-8 text-center text-xs font-mono text-zinc-500">
                    Belum ada notifikasi baru untuk Anda.
                  </div>
                ) : (
                  notifications.map((notif) => {
                    const timeStr = new Intl.DateTimeFormat("id-ID", {
                      timeZone: "Asia/Makassar",
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    }).format(new Date(notif.createdAt));

                    const content = (
                      <div
                        onClick={() => handleNotificationClick(notif)}
                        className={`p-3 rounded-2xl flex items-start gap-3 transition-colors cursor-pointer ${
                          notif.isRead
                            ? "hover:bg-white/[0.03] opacity-75"
                            : "bg-amber-500/5 hover:bg-amber-500/10 border border-amber-500/20"
                        }`}
                      >
                        <div className="p-2 rounded-xl bg-white/5 shrink-0 mt-0.5">
                          {getIcon(notif.type)}
                        </div>
                        <div className="flex flex-col gap-0.5 truncate">
                          <span className="font-display font-bold text-xs text-[#f6f2e9] truncate">
                            {notif.title}
                          </span>
                          {notif.body ? (
                            <p className="text-[11px] text-zinc-400 line-clamp-2 leading-relaxed">
                              {notif.body}
                            </p>
                          ) : null}
                          <span className="text-[10px] font-mono text-zinc-500 mt-1">
                            {timeStr} WITA
                          </span>
                        </div>
                      </div>
                    );

                    return notif.actionUrl ? (
                      <Link key={notif.id} href={notif.actionUrl}>
                        {content}
                      </Link>
                    ) : (
                      <div key={notif.id}>{content}</div>
                    );
                  })
                )}
              </div>
            </motion.div>
          </>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
