"use client";

import Link from "next/link";
import Icone from "@/components/site/Icone";
import { formatDateCourte } from "@/lib/dates";
import { APPARENCE_NIVEAU, detailAbsences, estSignale } from "@/lib/suivi-absence";
import type { SignalAbsence } from "@/lib/suivi-absence-donnees";

/*
 * Le signal d'absence, posé à côté d'un nom.
 *
 * UN seul composant pour les deux endroits où il apparaît — la demande à
 * confirmer du tableau de bord et l'identité de la fiche patient. C'est ce
 * qui garantit que les deux disent la même chose : même seuil, même libellé,
 * même détail, même destination. Deux pastilles écrites séparément auraient
 * fini par se contredire.
 *
 * Trois règles tenues ici :
 *
 *   • le signal INFORME. Il ne désactive aucun bouton, n'empêche aucune
 *     confirmation, ne cache aucune action. Le praticien confirme, refuse ou
 *     confirme en envoyant d'abord un rappel — c'est son choix, pas celui de
 *     la pastille ;
 *
 *   • il se lit SANS la couleur : un libellé (« À surveiller », « À risque »),
 *     un nombre et une icône. Ambre et orange ne font que renforcer. Rien en
 *     rouge, qui est la couleur des échecs ailleurs dans l'application et
 *     ferait lire un reproche là où il n'y a qu'un constat ;
 *
 *   • il est CLIQUABLE, et mène à la fiche du patient dans le menu « Suivi
 *     d'absence ». C'est le fil qui relie le moment de la décision au détail
 *     et aux actions.
 *
 * Un patient sans absence n'a pas de pastille du tout : pas de « 0 absence »,
 * pas de vert rassurant. Un écran couvert de badges ne signale plus rien.
 */
export default function PastilleAbsence({
  signal,
  cle,
  nom,
  compact = false,
}: {
  /** `undefined` quand le patient n'a aucune absence : rien ne s'affiche. */
  signal: SignalAbsence | undefined;
  cle: string;
  /** Nom du patient, pour que le libellé accessible désigne QUI est concerné. */
  nom?: string;
  /** Version resserrée : le nombre seul, le libellé passe en infobulle. */
  compact?: boolean;
}) {
  if (!signal || !estSignale(signal.niveau)) return null;

  const apparence = APPARENCE_NIVEAU[signal.niveau];
  const detail =
    `${detailAbsences(signal)}` +
    (signal.derniereAbsence ? ` · dernière le ${formatDateCourte(signal.derniereAbsence)}` : "");

  return (
    <Link
      href={`/espace-medecin/suivi-absence?patient=${encodeURIComponent(cle)}`}
      title={detail}
      aria-label={`${apparence.libelle} : ${detail}${nom ? ` — ${nom}` : ""}. Ouvrir le suivi d’absence.`}
      className={`pointer-coarse:min-h-11 inline-flex min-h-[28px] max-w-full items-center gap-1.5 rounded-[20px] px-2.5 py-1 text-[11.5px] font-bold transition-opacity hover:opacity-80 ${apparence.classe}`}
    >
      <Icone nom={apparence.icone} taille={13} />
      <span>{signal.absences}</span>
      {!compact && (
        <span className="truncate font-bold">
          {signal.absences > 1 ? "absences" : "absence"} · {apparence.libelle}
        </span>
      )}
    </Link>
  );
}

/**
 * La même information, en bloc, pour la colonne d'identité de la fiche
 * patient : il y a la place d'écrire la phrase entière, et c'est l'endroit
 * où l'on prend le temps de lire.
 */
export function BlocAbsence({
  signal,
  cle,
  nom,
}: {
  signal: SignalAbsence | undefined;
  cle: string;
  nom?: string;
}) {
  if (!signal || !estSignale(signal.niveau)) return null;

  const apparence = APPARENCE_NIVEAU[signal.niveau];

  return (
    <Link
      href={`/espace-medecin/suivi-absence?patient=${encodeURIComponent(cle)}`}
      aria-label={`${apparence.libelle}. Ouvrir le suivi d’absence${nom ? ` de ${nom}` : ""}.`}
      className={`pointer-coarse:py-3 mt-3 flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-left transition-opacity hover:opacity-85 ${apparence.classe}`}
    >
      <Icone nom={apparence.icone} taille={18} />
      <span className="min-w-0 flex-1">
        <b className="block text-[12.5px] font-extrabold">{apparence.libelle}</b>
        <small className="block text-[11.5px] font-semibold opacity-90">
          {detailAbsences(signal)}
          {signal.derniereAbsence ? ` · dernière le ${formatDateCourte(signal.derniereAbsence)}` : ""}
        </small>
      </span>
      <span aria-hidden className="text-[13px] font-extrabold opacity-60">
        ›
      </span>
    </Link>
  );
}
