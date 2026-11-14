"use client";

/*
 * Chef d'orchestre de la couche PWA. Monté UNE fois dans le layout racine, il
 * ne touche ni au thème, ni à la navigation, ni au contenu : il ne fait
 * qu'ajouter, par-dessus, l'enregistrement du service worker, le toast de mise
 * à jour, et — au bon moment — la bannière d'installation ou le guide iOS.
 *
 * Rien n'est rendu côté serveur : tous les affichages dépendent d'évènements
 * navigateur (beforeinstallprompt, display-mode, langue…).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Serwist } from "@serwist/window";
import { usePlatform } from "@/hooks/usePlatform";
import { usePWADisplayMode } from "@/hooks/usePWADisplayMode";
import { usePWAInstall } from "@/hooks/usePWAInstall";
import { usePwaLangue } from "@/hooks/usePwaLangue";
import { directionDe, textes } from "@/lib/pwa/i18n";
import { dejaInstallee, memoriserRefus, refusRecemment } from "@/lib/pwa/storage";
import PWAInstallBanner from "./PWAInstallBanner";
import IOSInstallGuide from "./IOSInstallGuide";
import PWAUpdateToast from "./PWAUpdateToast";

/* Flux sensibles : on n'y propose JAMAIS l'installation (connexion,
   inscription, prise de RDV, espaces connectés…). */
const CHEMIN_SENSIBLE =
  /^\/(connexion|inscription|mot-de-passe-oublie|mes-rendez-vous|espace-[^/]+|patient|reservation|confirmation|desinscription|verifier)(\/|$)/;

export default function PWAProvider() {
  const pathname = usePathname();
  const plateforme = usePlatform();
  const affichage = usePWADisplayMode();
  const install = usePWAInstall();

  const langue = usePwaLangue();
  const [engage, setEngage] = useState(false);
  const [refuse, setRefuse] = useState(false);
  const [majDispo, setMajDispo] = useState(false);
  const swRef = useRef<Serwist | null>(null);

  // Enregistrement du service worker (production uniquement ; désactivé en dev).
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    const sw = new Serwist("/sw.js", { scope: "/" });
    swRef.current = sw;
    // Une nouvelle version attend : on invite, sans jamais recharger de force.
    sw.addEventListener("waiting", () => setMajDispo(true));
    // Le nouveau SW a pris le contrôle : on recharge pour servir la MAJ.
    sw.addEventListener("controlling", () => window.location.reload());
    sw.register().catch(() => {
      // Échec silencieux : le site fonctionne exactement comme avant sans SW.
    });
  }, []);

  // Signe d'engagement : au bout de ~25 s, à un défilement marqué, ou sur une
  // fiche médecin (intention forte). Une fois acquis, il le reste.
  useEffect(() => {
    if (engage) return;
    const surFiche = pathname?.startsWith("/medecin/");
    const minuteur = window.setTimeout(() => setEngage(true), surFiche ? 4000 : 25000);
    const surScroll = () => {
      if (window.scrollY > window.innerHeight * 1.3) setEngage(true);
    };
    window.addEventListener("scroll", surScroll, { passive: true });
    return () => {
      window.clearTimeout(minuteur);
      window.removeEventListener("scroll", surScroll);
    };
  }, [engage, pathname]);

  const actualiser = useCallback(() => {
    // Passe la main au nouveau SW ; l'évènement « controlling » rechargera.
    swRef.current?.messageSkipWaiting();
    setMajDispo(false);
  }, []);

  const plusTard = useCallback(() => {
    memoriserRefus();
    setRefuse(true);
  }, []);

  const installer = useCallback(() => {
    void install.installer();
  }, [install]);

  const t = textes(langue);
  const dir = directionDe(langue);

  // Conditions communes : prêt, non installé, non standalone, non refusé
  // récemment, hors flux sensible, et engagement atteint.
  const peutProposer =
    plateforme.prete &&
    affichage.prete &&
    !affichage.standalone &&
    !install.installee &&
    !dejaInstallee() &&
    !refuse &&
    !refusRecemment() &&
    !(pathname ? CHEMIN_SENSIBLE.test(pathname) : false) &&
    engage;

  const montrerBanniere = peutProposer && install.installable && !plateforme.estIOS;
  const montrerGuideIOS = peutProposer && plateforme.estIOS && !install.installable;

  return (
    <>
      <PWAUpdateToast visible={majDispo} dir={dir} t={t} onRefresh={actualiser} />
      <PWAInstallBanner visible={montrerBanniere} dir={dir} t={t} onInstall={installer} onLater={plusTard} />
      <IOSInstallGuide visible={montrerGuideIOS} dir={dir} t={t} onClose={plusTard} />
    </>
  );
}
