import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import ModeLocal from "@/components/site/ModeLocal";
import PliageLocal from "@/components/site/PliageLocal";
import CharteLocalePublique from "@/components/site/CharteLocalePublique";
import SuivreChartePublique from "@/components/site/SuivreChartePublique";
import RevelationAuScroll from "@/components/site/RevelationAuScroll";
import TransitionPage from "@/components/site/TransitionPage";
import PWAProvider from "@/components/pwa/PWAProvider";

/*
 * Splash screens iOS (apple-touch-startup-image) : plus d'écran blanc au
 * lancement en mode standalone. Un media query par gabarit d'iPhone courant
 * (dimensions CSS + densité de pixels). Les images sont générées aux couleurs
 * de marque dans /public/splash.
 */
const SPLASH_IOS: { w: number; h: number; cw: number; ch: number; dpr: number }[] = [
  { w: 750, h: 1334, cw: 375, ch: 667, dpr: 2 },
  { w: 828, h: 1792, cw: 414, ch: 896, dpr: 2 },
  { w: 1125, h: 2436, cw: 375, ch: 812, dpr: 3 },
  { w: 1170, h: 2532, cw: 390, ch: 844, dpr: 3 },
  { w: 1179, h: 2556, cw: 393, ch: 852, dpr: 3 },
  { w: 1242, h: 2688, cw: 414, ch: 896, dpr: 3 },
  { w: 1284, h: 2778, cw: 428, ch: 926, dpr: 3 },
  { w: 1290, h: 2796, cw: 430, ch: 932, dpr: 3 },
  { w: 1320, h: 2868, cw: 440, ch: 956, dpr: 3 },
];

const STARTUP_IMAGES = SPLASH_IOS.map(({ w, h, cw, ch, dpr }) => ({
  url: `/splash/apple-splash-${w}-${h}.png`,
  media: `(device-width: ${cw}px) and (device-height: ${ch}px) and (-webkit-device-pixel-ratio: ${dpr}) and (orientation: portrait)`,
}));

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Docteur 224 — Trouvez un médecin et prenez rendez-vous en ligne",
  description:
    "La plateforme guinéenne de prise de rendez-vous médicaux. Recherchez par spécialité, ville ou établissement, réservez gratuitement et recevez votre confirmation par SMS.",
  applicationName: "Docteur 224",
  // Métadonnées PWA iOS. Le lien <link rel="manifest"> est injecté
  // automatiquement par app/manifest.ts : inutile de le poser ici.
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Docteur224",
    startupImage: STARTUP_IMAGES,
  },
};

/*
 * `viewport-fit: cover` + couleur de thème de marque. Couleur unique
 * (#15506b) plutôt que des media queries clair/sombre : le site ne suit PAS le
 * mode sombre du système (choix de conception existant, voir globals.css), une
 * barre d'adresse qui s'assombrirait seule jurerait avec une page restée
 * claire. Le bleu de marque reste élégant dans les deux modes.
 */
export const viewport: Viewport = {
  themeColor: "#15506b",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" className={`${jakarta.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        {/* Pose le mode clair/sombre avant la première peinture (anti-flash),
            pour tout le site. Indépendant de la charte. */}
        <ModeLocal />
        {/* Pose l'état plié/déplié de la barre latérale avant la première
            peinture (anti-saut de largeur), pour les cinq espaces connectés. */}
        <PliageLocal />
        {/* Charte de campagne du SITE PUBLIC (ex. Octobre Rose), posée avant
            la première peinture et cantonnée aux pages publiques. N'a aucun
            lien avec la charte d'espace : routes mutuellement exclusives. */}
        <CharteLocalePublique />
        <SuivreChartePublique />
        {/* Enveloppes d'animation uniquement : transition de page et
            apparition au défilement (voir les deux composants). */}
        <TransitionPage>{children}</TransitionPage>
        <RevelationAuScroll />
        {/* Couche PWA (service worker, toast de MAJ, bannière d'installation,
            guide iOS). Montée une seule fois, elle ne rend rien tant qu'aucune
            condition n'est réunie et n'affecte ni le thème ni la navigation. */}
        <PWAProvider />
      </body>
    </html>
  );
}
