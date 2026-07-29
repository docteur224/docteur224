"use client";

import { useRouter } from "next/navigation";
import PopupAvis from "@/components/site/PopupAvis";
import { formatNote } from "@/lib/format";

/*
 * Carte médecin de la page de résultats (mobile, écran « resultats » de la
 * maquette). Toute la carte ouvre la fiche du médecin, sauf le badge de note
 * qui ouvre le détail des avis en popup — d'où un composant client (page.tsx
 * reste un composant serveur) suivant le même schéma que CarteRdv : la carte
 * se comporte comme un lien, le badge de note stoppe la propagation pour ne
 * pas déclencher l'ouverture de la fiche en plus du popup.
 */

export default function CarteResultatMobile({
  id,
  photoUrl,
  initiales,
  gradient,
  nomComplet,
  specialite,
  etablissementNom,
  ville,
  note,
  nbAvis,
  dispoLabel,
  dispoAujourdhui,
  premiereHeure,
}: {
  id: string;
  photoUrl: string | null;
  initiales: string;
  gradient: string;
  nomComplet: string;
  specialite: string;
  etablissementNom: string;
  ville: string;
  note: number;
  nbAvis: number;
  dispoLabel: string;
  dispoAujourdhui: boolean;
  /** Première heure de créneau libre, ou "" s'il n'y en a aucune. */
  premiereHeure: string;
}) {
  const router = useRouter();
  const lien = `/medecin/${id}`;

  const ouvrir = {
    role: "link" as const,
    tabIndex: 0,
    onClick: () => router.push(lien),
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        router.push(lien);
      }
    },
  };

  return (
    <div {...ouvrir} className="doc cursor-pointer" aria-label={`Voir le profil de ${nomComplet}`}>
      {photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photoUrl} alt="" className="av" style={{ objectFit: "cover" }} />
      ) : (
        <span className="av" aria-hidden style={{ background: gradient }}>
          {initiales}
        </span>
      )}
      <span className="info">
        <b>{nomComplet}</b>
        <span className="spec">{specialite}</span>
        <span className="meta">
          📍 {etablissementNom} · {ville}
        </span>
        <span className="row2">
          <PopupAvis medecinId={id} medecinNom={nomComplet} className="stars border-0 bg-transparent p-0">
            ★ {formatNote(note)} ({nbAvis})
          </PopupAvis>
          {/* Pas de tarif : la réservation est gratuite (cf. carte web). */}
          <span className="price">{premiereHeure ? `Dès ${premiereHeure}` : ""}</span>
        </span>
        <span className="row2">
          <span className={`pill ${dispoAujourdhui ? "ok" : "soon"}`}>{dispoLabel}</span>
        </span>
      </span>
    </div>
  );
}
