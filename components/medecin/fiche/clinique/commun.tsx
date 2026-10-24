import Icone from "@/components/site/Icone";
import { heureDe, jourDe } from "@/lib/documents";
import type { Niveau } from "@/lib/normes-constantes";

/** « 24/10/2026 à 09:30 », à l'heure de Conakry. */
export const dateHeure = (iso: string) => `${jourDe(iso)} à ${heureDe(iso)}`;

const STYLE_ETAT: Record<Niveau, string> = {
  normal: "bg-green-soft text-green",
  attention: "bg-amber-soft text-amber",
  alerte: "bg-red-soft text-red",
};

/**
 * État d'une valeur : couleur ET icône ET libellé. Une couleur seule ne se
 * lit pas sous daltonisme ni à l'impression, et « rouge » ne dit pas en quoi
 * la valeur est anormale.
 */
export function PastilleEtat({ niveau, libelle }: { niveau: Niveau; libelle: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-bold ${STYLE_ETAT[niveau]}`}
    >
      <Icone nom={niveau === "normal" ? "coche" : "alerte"} taille={11} epaisseur={2.6} />
      {libelle}
    </span>
  );
}

/** Champ de formulaire étiqueté, partagé par les dialogues de la clinique. */
export const CLASSE_CHAMP =
  "w-full rounded-[11px] border border-line bg-white px-[13px] py-2.5 text-[13.5px] outline-none transition-colors focus:border-teal pointer-coarse:min-h-11";
export const CLASSE_ETIQUETTE = "mb-1.5 block text-[12.5px] font-bold";
