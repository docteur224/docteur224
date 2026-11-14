"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { oublierRefus } from "@/lib/pwa/storage";

/*
 * Capture l'évènement `beforeinstallprompt` (Android/Chromium) pour pouvoir
 * déclencher l'invite d'installation au bon moment, depuis NOTRE bannière.
 * Suit aussi `appinstalled` pour ne plus jamais reproposer.
 */

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export interface EtatInstall {
  /** L'invite native est disponible (donc installable, non installée). */
  installable: boolean;
  /** L'évènement `appinstalled` a été reçu pendant cette session. */
  installee: boolean;
  /** Déclenche l'invite native. Renvoie le choix de l'utilisateur. */
  installer: () => Promise<"accepted" | "dismissed" | "indisponible">;
}

export function usePWAInstall(): EtatInstall {
  const invite = useRef<BeforeInstallPromptEvent | null>(null);
  const [installable, setInstallable] = useState(false);
  const [installee, setInstallee] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const surInvite = (e: Event) => {
      // Empêche la mini-infobar native : on présente NOTRE bannière à la place.
      e.preventDefault();
      invite.current = e as BeforeInstallPromptEvent;
      setInstallable(true);
    };

    const surInstallee = () => {
      invite.current = null;
      setInstallable(false);
      setInstallee(true);
      // On nettoie la mémoire du refus : si l'app est un jour désinstallée,
      // rien de périmé ne bloquera une nouvelle proposition d'installation.
      oublierRefus();
    };

    window.addEventListener("beforeinstallprompt", surInvite);
    window.addEventListener("appinstalled", surInstallee);
    return () => {
      window.removeEventListener("beforeinstallprompt", surInvite);
      window.removeEventListener("appinstalled", surInstallee);
    };
  }, []);

  const installer = useCallback(async () => {
    const e = invite.current;
    if (!e) return "indisponible" as const;
    await e.prompt();
    const { outcome } = await e.userChoice;
    // L'invite n'est utilisable qu'une fois.
    invite.current = null;
    setInstallable(false);
    return outcome;
  }, []);

  return { installable, installee, installer };
}
