import type { Metadata } from "next";
import { Syne, Plus_Jakarta_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { AppHeader } from "@/components/layout/AppHeader";
import { AppFooter } from "@/components/layout/AppFooter";
import { MobileBottomNav } from "@/components/layout/MobileBottomNav";
import { GlobalCommandPalette } from "@/components/layout/GlobalCommandPalette";
import { QuickUploadModal } from "@/components/artworks/QuickUploadModal";
import { auth } from "@/auth";
import { getUserNotifications } from "@/lib/notifications";

const syne = Syne({
  subsets: ["latin"],
  variable: "--font-syne",
  display: "swap",
});

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-jakarta",
  display: "swap",
});

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Mengart — Komunitas Seni Visual Digital & Atelier Privat",
  description: "Atelier digital khusus kreator seni visual. Portofolio terkurasi, pusat komisi, dan community challenge.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await auth();
  const notifications = session?.user?.id
    ? await getUserNotifications(session.user.id)
    : [];

  const currentUser = session?.user
    ? {
        id: session.user.id,
        email: session.user.email || "",
        role: session.user.role,
        displayName: session.user.name,
        slug: session.user.profileSlug,
        avatarUrl: session.user.image,
      }
    : null;

  return (
    <html lang="id" className="dark">
      <body
        className={`${syne.variable} ${jakarta.variable} ${jetbrains.variable} bg-[#0e1015] text-[#f6f2e9] antialiased min-h-screen flex flex-col`}
      >
        <Providers>
          {/* Accessible Skip Navigation Link for A11y & Keyboard Navigation */}
          <a
            href="#main-content"
            className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2.5 focus:bg-amber-500 focus:text-black focus:font-semibold focus:rounded-lg focus:shadow-2xl focus:outline-none"
          >
            Lewati ke konten utama
          </a>
          <AppHeader
            user={currentUser}
            notifications={notifications as any}
          />
          <main id="main-content" className="flex-1 flex flex-col pb-20 md:pb-0 outline-none">
            {children}
          </main>
          <AppFooter />
          <MobileBottomNav user={currentUser} />

          {/* Global Modals & Command Palette */}
          <GlobalCommandPalette />
          <QuickUploadModal />
        </Providers>
      </body>
    </html>
  );
}
