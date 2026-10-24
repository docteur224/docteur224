"use client";

import { useMemo, useState } from "react";
import Icone from "@/components/site/Icone";
import { formatDateCourte } from "@/lib/dates";
import { confirmerRdvMedecin, qualifierRdv, type RdvDossier } from "@/lib/pro";
import {
  classeStatut,
  libelleStatut,
  rdvPasse,
  statutAffiche,
  type StatutAffiche,
} from "@/lib/statuts-rdv";
import { BTN_NEUTRE, COMPTE, Squelettes, TITRE_SECTION } from "./ui";

const PAR_PAGE_HISTORIQUE = 5;

/**
 * Rendez-vous du patient avec ce praticien.
 *
 * Un rendez-vous PASSÉ ne reste pas « en attente » : il attend d'être
 * qualifié — honoré ou absent — et le geste tient en un clic, là où on lit
 * la ligne. L'état « à qualifier » se déduit, il n'est jamais écrit (voir
 * lib/statuts-rdv.ts).
 */
export default function CarteRendezVous({
  rdvsInitiaux,
  chargement,
  annoncer,
  signalerEchec,
}: {
  rdvsInitiaux: RdvDossier[];
  chargement: boolean;
  annoncer: (message: string) => void;
  signalerEchec: (message: string) => void;
}) {
  const [vueRdv, setVueRdv] = useState<"a_venir" | "historique">("historique");
  const [pageHistorique, setPageHistorique] = useState(0);
  /* Mises à jour optimistes : la ligne change d'état avant la réponse du
     serveur, et revient en arrière si l'écriture échoue. Sur une connexion
     lente, attendre l'aller-retour donnait l'impression d'un clic perdu. */
  const [statutsLocaux, setStatutsLocaux] = useState<Record<string, string>>({});
  const [rdvEnCours, setRdvEnCours] = useState<string | null>(null);

  const rdvs = useMemo(
    () => rdvsInitiaux.map((r) => ({ ...r, statut: statutsLocaux[r.id] ?? r.statut })),
    [rdvsInitiaux, statutsLocaux]
  );
  // Le plus proche en tête pour ce qui vient, le plus récent en tête pour ce
  // qui est passé : dans les deux cas, ce qu'on cherche est en haut.
  const aVenir = useMemo(
    () => rdvs.filter((r) => !rdvPasse(r.date, r.heure)).slice().reverse(),
    [rdvs]
  );
  const historique = useMemo(() => rdvs.filter((r) => rdvPasse(r.date, r.heure)), [rdvs]);

  const listeRdv = vueRdv === "a_venir" ? aVenir : historique;
  const pages = Math.max(1, Math.ceil(historique.length / PAR_PAGE_HISTORIQUE));
  // Borné à la lecture : si l'historique rétrécit, la page courante peut
  // sortir des clous, et corriger ça dans un effet est interdit ici.
  const page = Math.min(pageHistorique, pages - 1);
  const tranche =
    vueRdv === "historique"
      ? historique.slice(page * PAR_PAGE_HISTORIQUE, (page + 1) * PAR_PAGE_HISTORIQUE)
      : aVenir;

  /* Tant que les rendez-vous arrivent, le compteur ne dit pas « 0 » : une
     liste encore vide n'est pas une liste vide. */
  const compte = (n: number) => (chargement ? "(…)" : `(${n})`);

  async function agirSurRdv(
    rdv: RdvDossier,
    cible: "honore" | "absent" | "confirme",
    succes: string
  ) {
    if (rdvEnCours) return;
    const precedent = statutsLocaux[rdv.id];
    setRdvEnCours(rdv.id);
    setStatutsLocaux((s) => ({ ...s, [rdv.id]: cible }));

    const res =
      cible === "confirme" ? await confirmerRdvMedecin(rdv.id) : await qualifierRdv(rdv.id, cible);

    setRdvEnCours(null);
    if (res.erreur) {
      // Retour en arrière : la ligne retrouve l'état qu'elle avait, sinon
      // l'écran affirmerait un changement que la base a refusé.
      setStatutsLocaux((s) => {
        const copie = { ...s };
        if (precedent === undefined) delete copie[rdv.id];
        else copie[rdv.id] = precedent;
        return copie;
      });
      signalerEchec(res.erreur);
      return;
    }
    annoncer(
      cible === "confirme" && "previenu" in res && !res.previenu
        ? "Rendez-vous confirmé — le patient n’a pas pu être prévenu par message"
        : succes
    );
  }

  return (
    <>
      <h3 className={`${TITRE_SECTION} mb-3`}>
        Rendez-vous <span className={COMPTE}>{compte(rdvs.length)}</span>
      </h3>

      {/* Bascule à deux positions et non tablist : un tablist imbriqué dans
          les onglets de la fiche brouillerait la navigation au clavier. */}
      <div
        role="radiogroup"
        aria-label="Rendez-vous à afficher"
        className="mb-2 flex gap-0.5 rounded-[10px] bg-bg p-[3px]"
      >
        {(
          [
            ["a_venir", `À venir ${compte(aVenir.length)}`],
            ["historique", `Historique ${compte(historique.length)}`],
          ] as ["a_venir" | "historique", string][]
        ).map(([valeur, libelle]) => (
          <button
            key={valeur}
            role="radio"
            type="button"
            aria-checked={vueRdv === valeur}
            onClick={() => setVueRdv(valeur)}
            className={`min-h-11 flex-1 rounded-lg text-[13px] transition-colors ${
              vueRdv === valeur
                ? "bg-white font-extrabold text-ink shadow-[0_1px_2px_rgba(16,59,80,0.12)]"
                : "font-semibold text-muted"
            }`}
          >
            {libelle}
          </button>
        ))}
      </div>

      {chargement ? (
        <Squelettes n={3} />
      ) : listeRdv.length === 0 ? (
        <p className="py-6 text-center text-[12.5px] text-muted">
          {vueRdv === "a_venir"
            ? "Aucun rendez-vous à venir avec vous."
            : "Aucun rendez-vous passé avec vous."}
        </p>
      ) : (
        <div>
          {tranche.map((r) => (
            <LigneRdv
              key={r.id}
              rdv={r}
              occupe={rdvEnCours === r.id}
              onHonore={() => agirSurRdv(r, "honore", "Rendez-vous marqué comme honoré")}
              onAbsent={() => agirSurRdv(r, "absent", "Patient marqué absent")}
              onConfirmer={() =>
                agirSurRdv(r, "confirme", "Rendez-vous confirmé — patient prévenu")
              }
            />
          ))}
        </div>
      )}

      {vueRdv === "historique" && historique.length > PAR_PAGE_HISTORIQUE && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[12.5px] text-muted">
          <span>
            {page * PAR_PAGE_HISTORIQUE + 1}–
            {Math.min(historique.length, (page + 1) * PAR_PAGE_HISTORIQUE)} sur {historique.length}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={page === 0}
              onClick={() => setPageHistorique(Math.max(0, page - 1))}
              className={BTN_NEUTRE}
            >
              <Icone nom="chevron-gauche" taille={13} />
              Précédent
            </button>
            <button
              type="button"
              disabled={page >= pages - 1}
              onClick={() => setPageHistorique(Math.min(pages - 1, page + 1))}
              className={BTN_NEUTRE}
            >
              Suivant
              <Icone nom="chevron-droite" taille={13} />
            </button>
          </div>
        </div>
      )}
    </>
  );
}

/**
 * Une ligne de rendez-vous. Les deux boutons de qualification ne paraissent
 * que là où ils ont un sens : sur un rendez-vous passé et non tranché. Le
 * reste du temps, seul le badge parle.
 */
function LigneRdv({
  rdv,
  occupe,
  onHonore,
  onAbsent,
  onConfirmer,
}: {
  rdv: RdvDossier;
  occupe: boolean;
  onHonore: () => void;
  onAbsent: () => void;
  onConfirmer: () => void;
}) {
  const etat: StatutAffiche = statutAffiche(rdv);
  const petit =
    "inline-flex min-h-11 items-center gap-1 rounded-lg border border-line bg-white px-2.5 text-[12px] font-bold text-ink transition-colors hover:border-muted disabled:opacity-45";

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line py-3 last:border-b-0">
      <div className="min-w-0">
        <b className="font-extrabold">
          {formatDateCourte(rdv.date)} · {rdv.heure}
        </b>
        {rdv.motif && <div className="truncate text-[12.5px] text-muted">{rdv.motif}</div>}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {etat === "a_qualifier" && (
          <>
            <button type="button" onClick={onHonore} disabled={occupe} className={petit}>
              <Icone nom="coche" taille={13} />
              Honoré
            </button>
            <button type="button" onClick={onAbsent} disabled={occupe} className={petit}>
              <Icone nom="croix" taille={13} />
              Absent
            </button>
          </>
        )}
        {etat === "en_attente" && (
          <button type="button" onClick={onConfirmer} disabled={occupe} className={petit}>
            Confirmer
          </button>
        )}
        <span
          className={`whitespace-nowrap rounded-full px-2.5 py-1 text-[12px] font-bold ${classeStatut(
            etat
          )}`}
        >
          {libelleStatut(etat)}
        </span>
      </div>
    </div>
  );
}
