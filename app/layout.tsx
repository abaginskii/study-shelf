import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./legal.css";
import "./design-v2.css";
import "./brand.css";
import {PWAProvider} from '@/components/pwa/provider';
import {TelegramPromo} from '@/components/community/telegram-promo';

export const metadata: Metadata = {
  title: "polka — место, где знания остаются с вами",
  description: "Собирайте учебные материалы, создавайте конспекты с ИИ и возвращайтесь к знаниям. Личная библиотека для учёбы с телефона и компьютера.",
  applicationName: "polka",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon.svg", apple: "/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: "polka", statusBarStyle: "default" },
  robots: { index: true, follow: true },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#f8f7fc", viewportFit: "cover" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ru"><body><PWAProvider>{children}<TelegramPromo /></PWAProvider></body></html>;
}
