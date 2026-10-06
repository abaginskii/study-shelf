import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./legal.css";

export const metadata: Metadata = {
  title: "Полка — место, где знания остаются с вами",
  description: "Собирайте учебные материалы, создавайте конспекты с ИИ и возвращайтесь к знаниям. Личная библиотека для учёбы с телефона и компьютера.",
  applicationName: "Полка",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon.svg", apple: "/icon.svg" },
  robots: { index: true, follow: true },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#f8f7fc" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ru"><body>{children}</body></html>;
}
