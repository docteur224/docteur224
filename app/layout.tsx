import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Docteur 224 — Trouvez un médecin et prenez rendez-vous en ligne",
  description:
    "La plateforme guinéenne de prise de rendez-vous médicaux. Recherchez par spécialité, ville ou établissement, réservez gratuitement et recevez votre confirmation par SMS.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" className={`${jakarta.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        {children}
      </body>
    </html>
  );
}
