import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Meta Interests Finder",
  description: "Pesquisa de interesses para campanhas Meta Ads"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
