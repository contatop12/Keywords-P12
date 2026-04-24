import type { Metadata } from "next";
import { JetBrains_Mono, Sora } from "next/font/google";
import "./globals.css";

const displayMono = JetBrains_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-mono",
  weight: ["400", "500", "700"]
});

const bodySans = Sora({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-sans",
  weight: ["300", "400", "500", "600", "700"]
});

export const metadata: Metadata = {
  title: "Keywords · P12",
  description: "Console de pesquisa de interesses Meta Ads e keyword ideas Google Ads.",
  icons: {
    icon: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Crect width='16' height='16' fill='%230a0a0b'/%3E%3Crect x='3' y='3' width='10' height='10' fill='none' stroke='%23c6f432' stroke-width='1.5'/%3E%3C/svg%3E"
  }
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${displayMono.variable} ${bodySans.variable}`}>
      <body>{children}</body>
    </html>
  );
}
