import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./legal.css";
import "./workspace.css";
import "./brand.css";
import {PWAProvider} from '@/components/pwa/provider';
import {TelegramPromo} from '@/components/community/telegram-promo';

export const metadata: Metadata = {
  title: "polka — место, где знания остаются с вами",
  description: "Собирайте учебные материалы, создавайте конспекты с ИИ и возвращайтесь к знаниям. Личная библиотека для учёбы с телефона и компьютера.",
  applicationName: "polka",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/brand/favicon.svg", type: "image/svg+xml", sizes: "any" },
      { url: "/icons/polka-favicon-32.png", type: "image/png", sizes: "32x32" },
    ],
    apple: { url: "/icons/polka-apple-180.png", sizes: "180x180", type: "image/png" },
  },
  appleWebApp: { capable: true, title: "polka", statusBarStyle: "default" },
  robots: { index: true, follow: true },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#040506", viewportFit: "cover" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ru"><body><PWAProvider>{children}<TelegramPromo /></PWAProvider></body></html>;
}
