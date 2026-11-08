"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import EnTeteMobile from "@/components/mobile/EnTeteMobile";
import Icone from "@/components/site/Icone";
import Toast, { useToast } from "@/components/site/Toast";
import Indicateurs from "@/components/medecin/suivi/Indicateurs";
import ListeSuivi, { type Tri } from "@/components/medecin/suivi/ListeSuivi";
import DialoguePatient from "@/components/medecin/suivi/DialoguePatient";
import DialogueParametres from "@/components/medecin/suivi/DialogueParametres";
import { useContextePro } from "@/lib/pro";
import { useSuiviAbsence, type LigneSuivi } from "@/lib/suivi-absence-donnees";
import type { NiveauAbsence } from "@/lib/suivi-absence";

/*
 * Suivi d'absence — un outil d'aide à la décision, pas un registre de
 * sanctions.
 *
 * Ce que l'écran fait : il rassemble ce que l'application sait déjà des
 * rendez-vous non honorés (statut 'absent', posé par `qualifier_rdv` depuis
 * la migration 0075), le met en perspective — un taux, une période, une
 * dernière date — et propose deux gestes : avertir avec tact, ou passer
 * l'éponge.
 *
 * Ce que l'écran ne fait pas, et ne fera pas : bloquer un patient, fermer un
 * créneau, refuser une réservation, ou marquer un dossier d'une mention qui
 * suivrait le patient ailleurs. Les trois signaux de l'application (ici, sur
 * les demandes à confirmer, sur la fiche patient) informent celui qui décide.
 *
 * L'écran est MONTÉ PAR DEUX ESPACES — celui du médecin et celui de
 * l'assistant(e) — chacun avec sa coquille et donc son menu. C'est pour cela
 * qu'il vit ici et non dans un `app/…/page.tsx` : le secrétariat doit y
 * accéder sans être renvoyé dans un espace qui n'est pas le sien, et la
 * recopier aurait fait deux écrans à corriger au lieu d'un.
 *
 * Une seule copie du contenu pour les deux largeurs — seul l'en-tête change.
 * Dupliquer le bloc, comme le font les écrans issus des deux maquettes,
 * dédoublerait ici les identifiants des champs de filtre, et un `<label for>`
 * ne saurait plus lequel il désigne.
 */

const NIVEAUX_FILTRE: { cle: "tous" | NiveauAbsence; libelle: string }[] = [
  { cle: "tous", libelle: "Tous" },
  { cle: "a_surveiller", libelle: "À surveiller" },
  { cle: "a_risque", libelle: "Absences répétées" },
];

const PERIODES: { mois: number | null; libelle: string }[] = [
  { mois: null, libelle: "Ma période" },
  { mois: 3, libelle: "3 mois" },
  { mois: 6, libelle: "6 mois" },
  { mois: 12, libelle: "12 mois" },
  { mois: 24, libelle: "24 mois" },
];

export default function EcranSuiviAbsence({
  retourMobile,
}: {
  /** Où remonte la flèche de l'en-tête mobile, selon l'espace qui nous monte. */
  retourMobile: string;
}) {
  const { medecin, medecinId, role, chargement: chargementPro } = useContextePro();
  const [periode, setPeriode] = useState<number | null>(null);
  const [niveau, setNiveau] = useState<"tous" | NiveauAbsence>("tous");
  const [tri, setTri] = useState<Tri>("absences");
  const [choisi, setChoisi] = useState<LigneSuivi | null>(null);
  const [reglages, setReglages] = useState(false);
  const { avis, annoncer, signalerEchec } = useToast();

  const { lignes, resume, mois, parametres, chargement, recharger } = useSuiviAbsence(
    medecinId ?? undefined,
    periode
  );

  /*
   * Arrivée depuis une pastille (`?patient=c-…`) : la fiche demandée s'ouvre
   * d'elle-même. C'est le fil entre le moment de la décision et le détail —
   * sans quoi le praticien atterrirait sur une liste où il devrait retrouver
   * à la main le nom qu'il vient de toucher.
   *
   * DÉDUIT, et non posé par un effet : tant que l'URL n'a pas été
   * « consommée » (fermeture du dialogue, ou ouverture d'un autre patient),
   * le dialogue ouvert est celui que l'URL désigne. Un effet qui appellerait
   * setState rouvrirait le dialogue à chaque rechargement de la liste — après
   * un envoi, par exemple — et provoquerait un rendu en cascade.
   */
  const parametresUrl = useSearchParams();
  const cleDemandee = parametresUrl.get("patient");
  const [urlConsommee, setUrlConsommee] = useState(false);
  const depuisUrl =
    !urlConsommee && cleDemandee ? (lignes.find((l) => l.cle === cleDemandee) ?? null) : null;
  const ouvert = choisi ?? depuisUrl;

  /** Ouvrir un patient, ou refermer : les deux neutralisent l'URL. */
  const ouvrir = (l: LigneSuivi | null) => {
    setUrlConsommee(true);
    setChoisi(l);
  };

  const parNiveau = useMemo(() => {
    const compte: Record<NiveauAbsence, number> = { correct: 0, a_surveiller: 0, a_risque: 0 };
    for (const l of lignes) compte[l.niveau] += 1;
    return compte;
  }, [lignes]);

  const filtrees = useMemo(
    () => (niveau === "tous" ? lignes : lignes.filter((l) => l.niveau === niveau)),
    [lignes, niveau]
  );

  const nomProfessionnel = medecin
    ? `${medecin.civilite} ${medecin.prenom} ${medecin.nom}`.replace(/\s+/g, " ").trim()
    : "votre praticien";

  /** Un succès annonce, recharge, et referme : trois gestes, un seul endroit. */
  function reussi(message: string) {
    annoncer(message);
    ouvrir(null);
    setReglages(false);
    recharger();
  }

  return (
    <>
      <div className="md:hidden">
        <EnTeteMobile retour={retourMobile} titre="Suivi d’absence" />
      </div>

      <div className="mb-5 hidden flex-wrap items-center justify-between gap-3 md:flex">
        <div>
          <h2 className="text-[21px] font-extrabold tracking-[-0.3px]">Suivi d’absence</h2>
          <small className="text-[13px] text-muted">
            Les rendez-vous non honorés, pour en parler au bon moment
          </small>
        </div>
        <button
          type="button"
          onClick={() => setReglages(true)}
          className="pointer-coarse:py-[13px] inline-flex items-center gap-1.5 rounded-[9px] border-[1.5px] border-line bg-white px-[14px] py-2 text-[12.5px] font-bold text-blue transition-colors hover:bg-bg"
        >
          <Icone nom="crayon" taille={14} />
          Réglages
        </button>
      </div>

      <div data-suivi className="px-4 pb-4 pt-3.5 md:px-0 md:pb-0 md:pt-0">
        <Indicateurs resume={resume} mois={mois} parNiveau={parNiveau} chargement={chargement} />

        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Niveau de signal">
            {NIVEAUX_FILTRE.map((n) => (
              <button
                key={n.cle}
                type="button"
                aria-pressed={niveau === n.cle}
                onClick={() => setNiveau(n.cle)}
                className={`min-h-11 rounded-[10px] border px-3 text-[12.5px] font-bold transition-colors ${
                  niveau === n.cle
                    ? "border-teal bg-teal-soft text-blue"
                    : "border-line bg-white text-ink"
                }`}
              >
                {n.libelle}
                {n.cle !== "tous" && (
                  <span className="ml-1 font-extrabold opacity-70">
                    {n.cle === "a_risque" ? parNiveau.a_risque : parNiveau.a_surveiller}
                  </span>
                )}
              </button>
            ))}
          </div>

          <label htmlFor="periode-filtre" className="sr-only">
            Période observée
          </label>
          <select
            id="periode-filtre"
            value={periode === null ? "defaut" : `${periode}`}
            onChange={(e) =>
              setPeriode(e.target.value === "defaut" ? null : Number(e.target.value))
            }
            className="ml-auto min-h-11 rounded-[10px] border border-line bg-white px-3 text-[12.5px] font-bold"
          >
            {PERIODES.map((p) => (
              <option key={p.libelle} value={p.mois === null ? "defaut" : `${p.mois}`}>
                {p.libelle}
              </option>
            ))}
          </select>
        </div>

        <ListeSuivi
          lignes={filtrees}
          tri={tri}
          onTri={setTri}
          onOuvrir={ouvrir}
          chargement={chargement}
          filtre={niveau !== "tous"}
        />

        {/* Le téléphone n'a pas de barre d'en-tête à boutons : les réglages
            ont leur ligne, en bas, là où on les cherche. */}
        <button
          type="button"
          onClick={() => setReglages(true)}
          className="mt-3 flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl border border-line bg-white text-[12.5px] font-bold text-blue md:hidden"
        >
          <Icone nom="crayon" taille={14} />
          Réglages du suivi
        </button>

        <p className="mt-4 text-[11.5px] leading-relaxed text-muted">
          Les rendez-vous annulés à l’avance ne comptent pas comme des absences. Un patient
          signalé garde exactement les mêmes droits de réservation : cet écran informe, il ne
          restreint rien.
        </p>
      </div>

      {ouvert && (
        <DialoguePatient
          ligne={ouvert}
          parametres={parametres}
          nomProfessionnel={nomProfessionnel}
          onFermer={() => ouvrir(null)}
          onFait={reussi}
          onErreur={signalerEchec}
        />
      )}

      {reglages && medecinId && (
        <DialogueParametres
          medecinId={medecinId}
          parametres={parametres}
          modifiable={!chargementPro && role === "medecin"}
          onFermer={() => setReglages(false)}
          onFait={reussi}
          onErreur={signalerEchec}
        />
      )}

      <Toast avis={avis} />
    </>
  );
}
