/**
 * Icônes au trait, dessinées en ligne.
 *
 * Le reste de l'application pose des emoji (☰, 📊, 💊). C'est lisible, mais
 * ça rend mal dans une fiche médicale : le glyphe change d'un système à
 * l'autre, il ne prend pas la couleur du texte, et une ordonnance annoncée
 * par 💊 fait jouet. Ici les icônes suivent `currentColor` et l'épaisseur du
 * trait reste la même partout.
 *
 * Aucune dépendance ajoutée : les tracés sont repris du vocabulaire
 * habituel (style Lucide, licence ISC), redessinés sur la grille 24×24.
 *
 * Décoratives par défaut (`aria-hidden`) : le sens est toujours porté par le
 * texte à côté, ou par l'`aria-label` du bouton qui les contient.
 */

const TRACES = {
  "chevron-gauche": "M15 18l-6-6 6-6",
  "chevron-droite": "M9 6l6 6-6 6",
  telephone:
    "M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z",
  plus: "M12 5v14M5 12h14",
  croix: "M6 6l12 12M18 6L6 18",
  coche: "M20 6L9 17l-5-5",
  pouls: "M22 12h-4l-3 9L9 3l-3 9H2",
  gelule: "M10.5 20.5 3.5 13.5a4.95 4.95 0 0 1 7-7l7 7a4.95 4.95 0 0 1-7 7zM8.5 8.5l7 7",
  document: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M9 13h6M9 17h6",
  crayon: "M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z",
  interdit: "M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18M5.6 5.6l12.8 12.8",
  alerte: "M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01",
  imprimante: "M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v8H6z",
  telecharger: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3",
  partager: "M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8M16 6l-4-4-4 4M12 2v13",
  calendrier: "M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM16 2v4M8 2v4M3 10h18",
  horloge: "M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18M12 7v5l3 2",
  historique: "M3 3v18h18M7 14l3-4 3 3 4-6",
} as const;

export type NomIcone = keyof typeof TRACES;

export default function Icone({
  nom,
  taille = 16,
  epaisseur = 2,
  className,
}: {
  nom: NomIcone;
  taille?: number;
  epaisseur?: number;
  className?: string;
}) {
  return (
    <svg
      aria-hidden
      focusable="false"
      width={taille}
      height={taille}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={epaisseur}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d={TRACES[nom]} />
    </svg>
  );
}
