import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./legal.css";
import "./design-v2.css";
import {PWAProvider} from '@/components/pwa/provider';

export const metadata: Metadata = {
  title: "Полка — место, где знания остаются с вами",
  description: "Собирайте учебные материалы, создавайте конспекты с ИИ и возвращайтесь к знаниям. Личная библиотека для учёбы с телефона и компьютера.",
  applicationName: "Полка",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon.svg", apple: "/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: "Полка", statusBarStyle: "default" },
  robots: { index: true, follow: true },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#f8f7fc", viewportFit: "cover" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ru"><body><PWAProvider>{children}</PWAProvider></body></html>;
}
