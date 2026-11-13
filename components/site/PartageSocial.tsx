"use client";

import { useEffect, useState } from "react";

/*
 * Partage d'une page de conseils santé sur les réseaux.
 *
 * L'URL partagée est TOUJOURS celle de la page affichée, lue au moment du clic
 * (window.location.href) : ainsi le composant marche à l'identique sur la liste
 * et sur chaque fiche, sans qu'on ait à lui passer une adresse — et sans risque
 * d'écart entre le rendu serveur et l'hydratation.
 *
 * WhatsApp vient en premier : c'est le canal de partage le plus utilisé auprès
 * du public visé. Le partage natif (menu du téléphone) s'affiche en plus quand
 * le navigateur le propose — c'est le geste le plus naturel sur mobile.
 */

type Reseau = {
  cle: string;
  libelle: string;
  couleur: string;
  lien: (url: string, titre: string) => string;
  chemin: string; // tracé SVG de l'icône (24×24)
};

const RESEAUX: Reseau[] = [
  {
    cle: "whatsapp",
    libelle: "WhatsApp",
    couleur: "#25D366",
    lien: (url, titre) => `https://wa.me/?text=${encodeURIComponent(`${titre} ${url}`)}`,
    chemin:
      "M12.04 2a9.9 9.9 0 0 0-8.46 15.04L2 22l5.1-1.34A9.9 9.9 0 1 0 12.04 2Zm0 1.8a8.1 8.1 0 0 1 5.73 13.82 8.1 8.1 0 0 1-9.84 1.2l-.35-.2-3.02.79.81-2.94-.23-.37A8.1 8.1 0 0 1 12.04 3.8Zm-2.6 4.3c-.18 0-.47.07-.72.34-.25.27-.95.93-.95 2.26 0 1.33.97 2.62 1.1 2.8.14.18 1.9 2.9 4.6 3.96 2.26.89 2.72.71 3.21.67.49-.05 1.58-.65 1.8-1.27.22-.62.22-1.15.16-1.27-.07-.1-.25-.17-.52-.3-.27-.14-1.58-.78-1.82-.87-.25-.09-.43-.13-.6.14-.18.27-.7.87-.86 1.05-.16.18-.32.2-.59.07-.27-.14-1.13-.42-2.15-1.33-.79-.71-1.33-1.58-1.49-1.85-.16-.27-.02-.42.12-.55.12-.12.27-.32.4-.48.14-.16.18-.27.27-.46.09-.18.05-.34-.02-.48-.07-.14-.6-1.46-.84-2-.22-.52-.44-.45-.6-.46h-.52Z",
  },
  {
    cle: "facebook",
    libelle: "Facebook",
    couleur: "#1877F2",
    lien: (url) => `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
    chemin:
      "M22 12.06C22 6.5 17.52 2 12 2S2 6.5 2 12.06c0 5 3.66 9.15 8.44 9.94v-7.03H7.9v-2.9h2.54V9.85c0-2.52 1.49-3.9 3.78-3.9 1.1 0 2.24.19 2.24.19v2.47h-1.26c-1.24 0-1.63.78-1.63 1.57v1.88h2.78l-.44 2.9h-2.34V22c4.78-.79 8.44-4.94 8.44-9.94Z",
  },
  {
    cle: "x",
    libelle: "X",
    couleur: "#0f1419",
    lien: (url, titre) =>
      `https://twitter.com/intent/tweet?text=${encodeURIComponent(titre)}&url=${encodeURIComponent(url)}`,
    chemin:
      "M18.24 2.25h3.3l-7.2 8.23L22.8 21.75h-6.6l-5.17-6.76-5.92 6.76H1.8l7.71-8.8L1.2 2.25h6.78l4.67 6.17 5.59-6.17Zm-1.16 17.52h1.83L7.01 4.13H5.04l12.04 15.64Z",
  },
  {
    cle: "linkedin",
    libelle: "LinkedIn",
    couleur: "#0A66C2",
    lien: (url) => `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`,
    chemin:
      "M4.98 3.5A2.5 2.5 0 1 0 5 8.5a2.5 2.5 0 0 0-.02-5ZM3 9.75h4V21H3V9.75ZM9.5 9.75h3.83v1.54h.05c.53-.96 1.84-1.97 3.78-1.97 4.04 0 4.79 2.5 4.79 5.74V21h-4v-4.98c0-1.19-.02-2.72-1.76-2.72-1.76 0-2.03 1.3-2.03 2.64V21h-4V9.75Z",
  },
];

export default function PartageSocial({
  titre,
  compact = false,
}: {
  /** Texte d'accroche joint au lien (WhatsApp, X). */
  titre: string;
  /** Variante resserrée (pied de fiche) sans le libellé de section. */
  compact?: boolean;
}) {
  const [copie, setCopie] = useState(false);
  const [partageNatif, setPartageNatif] = useState(false);

  useEffect(() => {
    // Détection du partage natif APRÈS le montage (jamais au rendu serveur, où
    // `navigator` n'existe pas) : on la diffère d'une micro-tâche pour ne pas
    // poser l'état dans le corps même de l'effet.
    let actif = true;
    Promise.resolve().then(() => {
      if (actif) {
        setPartageNatif(typeof navigator !== "undefined" && typeof navigator.share === "function");
      }
    });
    return () => {
      actif = false;
    };
  }, []);

  const urlCourante = () => (typeof window !== "undefined" ? window.location.href : "");

  function ouvrir(reseau: Reseau) {
    const lien = reseau.lien(urlCourante(), titre);
    window.open(lien, "_blank", "noopener,noreferrer,width=600,height=640");
  }

  async function partagerNatif() {
    try {
      await navigator.share({ title: titre, text: titre, url: urlCourante() });
    } catch {
      /* partage annulé : rien à signaler */
    }
  }

  async function copier() {
    try {
      await navigator.clipboard.writeText(urlCourante());
      setCopie(true);
      setTimeout(() => setCopie(false), 2000);
    } catch {
      /* presse-papiers indisponible */
    }
  }

  return (
    <div
      className={
        compact
          ? "flex flex-wrap items-center gap-2"
          : "rounded-2xl border border-line bg-white p-[16px] md:p-5"
      }
    >
      {!compact && (
        <b className="mb-3 block text-[13px] font-extrabold text-blue md:text-[14px]">
          Partager ces conseils
        </b>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {partageNatif && (
          <button
            type="button"
            onClick={partagerNatif}
            className="inline-flex items-center gap-2 rounded-full bg-teal px-[14px] py-2.5 text-[12.5px] font-bold text-white transition-colors hover:bg-teal-hover"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M18 8a3 3 0 1 0-2.83-4H15a3 3 0 0 0 .17 1.01L8.9 8.49a3 3 0 1 0 0 7.02l6.27 3.48A3 3 0 1 0 18 16a3 3 0 0 0-2.1.86L9.63 13.4a3 3 0 0 0 0-2.8l6.27-3.46A3 3 0 0 0 18 8Z"
                fill="currentColor"
              />
            </svg>
            Partager
          </button>
        )}

        {RESEAUX.map((r) => (
          <button
            key={r.cle}
            type="button"
            onClick={() => ouvrir(r)}
            aria-label={`Partager sur ${r.libelle}`}
            title={`Partager sur ${r.libelle}`}
            className="group inline-grid h-[40px] w-[40px] place-items-center rounded-full border border-line bg-white text-muted transition-all hover:-translate-y-0.5 hover:border-transparent hover:text-white"
            style={{ ["--marque" as string]: r.couleur }}
            onMouseEnter={(e) => (e.currentTarget.style.background = r.couleur)}
            onMouseLeave={(e) => (e.currentTarget.style.background = "")}
          >
            <svg width="19" height="19" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d={r.chemin} />
            </svg>
          </button>
        ))}

        <button
          type="button"
          onClick={copier}
          aria-label="Copier le lien"
          title="Copier le lien"
          className="inline-flex items-center gap-2 rounded-full border border-line bg-white px-[14px] py-2.5 text-[12.5px] font-bold text-blue transition-colors hover:border-teal"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M9.5 14.5 14.5 9.5M8 12H6.5a3.5 3.5 0 0 1 0-7H10a3.5 3.5 0 0 1 3.5 3.5M16 12h1.5a3.5 3.5 0 0 1 0 7H14a3.5 3.5 0 0 1-3.5-3.5"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          </svg>
          {copie ? "Lien copié ✓" : "Copier le lien"}
        </button>
      </div>
    </div>
  );
}
