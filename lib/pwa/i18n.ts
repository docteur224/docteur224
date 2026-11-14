/*
 * i18n AUTONOME pour la couche PWA uniquement.
 *
 * Le site est aujourd'hui mono-langue (français, `<html lang="fr">`). Plutôt
 * que d'installer un système i18n complet — qui imposerait de restructurer
 * toutes les routes sous /[locale] et casserait l'existant — on embarque ici
 * un mini-dictionnaire dédié aux seules chaînes PWA, dans les trois langues
 * cibles (fr/en/ar). L'arabe est en écriture de droite à gauche.
 *
 * La langue est déduite de `navigator.language`, avec possibilité de forçage
 * par `localStorage` (clé `d224-lang`) — ce qui branchera naturellement un
 * futur sélecteur de langue du site sans rien changer ici.
 */

export type LanguePwa = "fr" | "en" | "ar";

export const LANGUES: readonly LanguePwa[] = ["fr", "en", "ar"] as const;

export interface TextesPwa {
  install_title: string;
  install_body: string;
  install_cta: string;
  later: string;
  ios_guide_title: string;
  ios_guide: string;
  ios_share: string;
  ios_add: string;
  update_available: string;
  refresh: string;
  dismiss: string;
  offline_title: string;
  offline_body: string;
  offline_retry: string;
}

const DICTIONNAIRE: Record<LanguePwa, TextesPwa> = {
  fr: {
    install_title: "Installer Docteur 224",
    install_body:
      "Installez l'application pour prendre rendez-vous plus vite, même avec une connexion lente.",
    install_cta: "Installer",
    later: "Plus tard",
    ios_guide_title: "Installer Docteur 224",
    ios_guide:
      "Pour installer Docteur 224 : touchez le bouton Partager, puis « Sur l'écran d'accueil ».",
    ios_share: "Partager",
    ios_add: "Sur l'écran d'accueil",
    update_available: "Une nouvelle version est disponible.",
    refresh: "Actualiser",
    dismiss: "Fermer",
    offline_title: "Vous êtes hors ligne",
    offline_body: "Reconnectez-vous pour prendre rendez-vous.",
    offline_retry: "Réessayer",
  },
  en: {
    install_title: "Install Docteur 224",
    install_body:
      "Install the app to book appointments faster, even on a slow connection.",
    install_cta: "Install",
    later: "Later",
    ios_guide_title: "Install Docteur 224",
    ios_guide:
      'To install Docteur 224: tap the Share button, then "Add to Home Screen".',
    ios_share: "Share",
    ios_add: "Add to Home Screen",
    update_available: "A new version is available.",
    refresh: "Refresh",
    dismiss: "Close",
    offline_title: "You're offline",
    offline_body: "Reconnect to book an appointment.",
    offline_retry: "Retry",
  },
  ar: {
    install_title: "تثبيت Docteur 224",
    install_body: "ثبّت التطبيق لحجز المواعيد بشكل أسرع، حتى مع اتصال إنترنت بطيء.",
    install_cta: "تثبيت",
    later: "لاحقًا",
    ios_guide_title: "تثبيت Docteur 224",
    ios_guide:
      "لتثبيت Docteur 224: اضغط على زر المشاركة، ثم اختر «إضافة إلى الشاشة الرئيسية».",
    ios_share: "مشاركة",
    ios_add: "إضافة إلى الشاشة الرئيسية",
    update_available: "يتوفّر إصدار جديد.",
    refresh: "تحديث",
    dismiss: "إغلاق",
    offline_title: "أنت غير متصل بالإنترنت",
    offline_body: "أعد الاتصال لحجز موعد.",
    offline_retry: "إعادة المحاولة",
  },
};

/** Les langues RTL parmi nos cibles. */
export function directionDe(langue: LanguePwa): "rtl" | "ltr" {
  return langue === "ar" ? "rtl" : "ltr";
}

const CLE_LANG = "d224-lang";

/** Normalise un code BCP-47 (« ar-GN », « en_US ») vers une de nos langues. */
function normaliser(code: string | null | undefined): LanguePwa | null {
  if (!code) return null;
  const base = code.toLowerCase().split(/[-_]/)[0];
  return (LANGUES as readonly string[]).includes(base) ? (base as LanguePwa) : null;
}

/**
 * Déduit la langue PWA à utiliser. Forçage localStorage prioritaire, sinon
 * langue du navigateur, sinon français. Sans danger côté serveur (SSR).
 */
export function detecterLangue(): LanguePwa {
  if (typeof window === "undefined") return "fr";
  try {
    const forcee = normaliser(window.localStorage.getItem(CLE_LANG));
    if (forcee) return forcee;
  } catch {
    // localStorage indisponible (navigation privée, cookies bloqués) : on
    // retombe simplement sur la langue du navigateur.
  }
  const nav = typeof navigator !== "undefined" ? navigator : undefined;
  const candidats = nav?.languages?.length ? nav.languages : nav?.language ? [nav.language] : [];
  for (const c of candidats) {
    const l = normaliser(c);
    if (l) return l;
  }
  return "fr";
}

export function textes(langue: LanguePwa): TextesPwa {
  return DICTIONNAIRE[langue];
}
