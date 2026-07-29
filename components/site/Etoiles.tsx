import { formatNote } from "@/lib/format";

/*
 * Étoiles d'une note sur 5. Deux usages :
 *  - `Etoiles` : affichage seul (fiche, liste d'avis) ;
 *  - `EtoilesSaisie` : saisie au clic (formulaire d'avis du patient).
 *
 * Les étoiles sont décoratives : la note est toujours redonnée en texte pour
 * les lecteurs d'écran, sinon « ★★★☆☆ » ne dit rien.
 */

export default function Etoiles({
  note,
  taille = 14,
}: {
  note: number;
  taille?: number;
}) {
  const pleines = Math.round(note);
  return (
    <span className="whitespace-nowrap" style={{ fontSize: taille }}>
      <span aria-hidden className="text-[#E8A33D]">
        {"★".repeat(pleines)}
        <span className="text-[#D6DEE4]">{"☆".repeat(5 - pleines)}</span>
      </span>
      <span className="sr-only">{formatNote(note)} sur 5</span>
    </span>
  );
}
