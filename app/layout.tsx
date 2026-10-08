import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./legal.css";
import "./theme.css";
import "./brand-refresh.css";
import {PWAProvider} from '@/components/pwa/provider';
import { ThemeProvider } from '@/components/theme/theme-provider';

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
  return <html lang="ru" suppressHydrationWarning><head><script dangerouslySetInnerHTML={{ __html: "try{var t=localStorage.getItem('polka_theme_v1');if(t==='dark'||t==='light')document.documentElement.dataset.theme=t}catch{}" }} /></head><body><ThemeProvider><PWAProvider>{children}</PWAProvider></ThemeProvider></body></html>;
}
