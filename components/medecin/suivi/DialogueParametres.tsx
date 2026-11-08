"use client";

import { useState } from "react";
import Dialogue from "@/components/site/Dialogue";
import Icone from "@/components/site/Icone";
import { BTN_NEUTRE, BTN_PRIMAIRE } from "@/components/medecin/fiche/ui";
import {
  BORNES_SEUILS,
  MODELE_AVERTISSEMENT_DEFAUT,
  niveauRisque,
  APPARENCE_NIVEAU,
} from "@/lib/suivi-absence";
import {
  enregistrerParametresSuivi,
  type ParametresSuivi,
} from "@/lib/suivi-absence-donnees";

/*
 * Les réglages du suivi : les seuils, la période, le canal et le modèle de
 * message.
 *
 * Un aperçu accompagne les seuils, parce qu'un nombre seul ne dit pas ce
 * qu'il déclenche. « 2 absences » et « 30 % à partir de 3 rendez-vous » sont
 * abstraits ; « un patient absent 1 fois sur 3 serait à risque » l'est
 * beaucoup moins, et c'est exactement la décision que le praticien prend en
 * déplaçant ces valeurs.
 *
 * Réservé au médecin : les seuils disent à partir de quand on s'inquiète d'un
 * patient, c'est un réglage de pratique. Le secrétariat les LIT — il doit
 * savoir ce que la pastille qu'il voit signifie — mais ne les déplace pas.
 * La policy d'UPDATE le tient en base ; cet écran se contente de ne pas
 * promettre ce qu'elle refuserait.
 */

const PERIODES = [3, 6, 12, 24];

export default function DialogueParametres({
  medecinId,
  parametres,
  modifiable,
  onFermer,
  onFait,
  onErreur,
}: {
  medecinId: string;
  parametres: ParametresSuivi;
  /** Faux pour un(e) assistant(e) : lecture seule, et c'est dit. */
  modifiable: boolean;
  onFermer: () => void;
  onFait: (message: string) => void;
  onErreur: (message: string) => void;
}) {
  const [brouillon, setBrouillon] = useState<ParametresSuivi>(parametres);
  const [envoi, setEnvoi] = useState(false);

  const majNombre = (champ: "seuilBas" | "seuilHaut" | "miniRdv" | "periodeMois", v: string) =>
    setBrouillon((p) => ({ ...p, [champ]: Math.max(1, Number(v) || 1) }));

  async function enregistrer() {
    if (brouillon.seuilHaut < brouillon.seuilBas) {
      onErreur("Le seuil « à risque » doit être au moins égal au seuil « à surveiller ».");
      return;
    }
    setEnvoi(true);
    const { erreur } = await enregistrerParametresSuivi(medecinId, brouillon);
    setEnvoi(false);
    if (erreur) {
      onErreur(erreur);
      return;
    }
    onFait("Réglages enregistrés.");
  }

  return (
    <Dialogue
      titre="Réglages du suivi"
      sousTitre={modifiable ? "Seuils, période et message" : "Lecture seule"}
      icone={<Icone nom="crayon" taille={18} />}
      onFermer={onFermer}
      largeur="560px"
      pied={
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={onFermer} className={`${BTN_NEUTRE} flex-1`}>
            Fermer
          </button>
          {modifiable && (
            <button
              type="button"
              onClick={enregistrer}
              disabled={envoi}
              className={`${BTN_PRIMAIRE} flex-1`}
            >
              {envoi ? "Enregistrement…" : "Enregistrer"}
            </button>
          )}
        </div>
      }
    >
      {!modifiable && (
        <p className="mb-4 rounded-xl bg-amber-soft px-3 py-2.5 text-[12px] leading-relaxed text-amber">
          Ces seuils relèvent du compte du médecin. Vous les voyez pour savoir ce que signifient
          les signaux ; leur modification lui revient.
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Champ
          id="seuil-bas"
          libelle="« À surveiller » à partir de"
          suffixe="absences"
          valeur={brouillon.seuilBas}
          min={BORNES_SEUILS.seuil.min}
          max={BORNES_SEUILS.seuil.max}
          modifiable={modifiable}
          onChange={(v) => majNombre("seuilBas", v)}
        />
        <Champ
          id="seuil-haut"
          libelle="« À risque » à partir de"
          suffixe="absences"
          valeur={brouillon.seuilHaut}
          min={BORNES_SEUILS.seuil.min}
          max={BORNES_SEUILS.seuil.max}
          modifiable={modifiable}
          onChange={(v) => majNombre("seuilHaut", v)}
        />
        <Champ
          id="taux-haut"
          libelle="…ou un taux de no-show de"
          suffixe="%"
          valeur={Math.round(brouillon.tauxHaut * 100)}
          min={BORNES_SEUILS.taux.min}
          max={BORNES_SEUILS.taux.max}
          modifiable={modifiable}
          onChange={(v) =>
            setBrouillon((p) => ({
              ...p,
              tauxHaut: Math.min(1, Math.max(0.05, (Number(v) || 30) / 100)),
            }))
          }
        />
        <Champ
          id="mini-rdv"
          libelle="…à partir de"
          suffixe="rendez-vous terminés"
          valeur={brouillon.miniRdv}
          min={BORNES_SEUILS.miniRdv.min}
          max={BORNES_SEUILS.miniRdv.max}
          modifiable={modifiable}
          onChange={(v) => majNombre("miniRdv", v)}
        />
      </div>

      <Apercu seuils={brouillon} />

      <label htmlFor="periode" className="mt-5 mb-2 block text-[12px] font-bold text-muted">
        Période observée
      </label>
      <select
        id="periode"
        value={brouillon.periodeMois}
        disabled={!modifiable}
        onChange={(e) => majNombre("periodeMois", e.target.value)}
        className="min-h-11 w-full rounded-xl border border-line bg-white px-3 text-[13px] font-semibold disabled:opacity-60"
      >
        {PERIODES.map((m) => (
          <option key={m} value={m}>
            {m} mois glissants
          </option>
        ))}
      </select>

      <label htmlFor="canal" className="mt-4 mb-2 block text-[12px] font-bold text-muted">
        Canal d’avertissement par défaut
      </label>
      <select
        id="canal"
        value={brouillon.canalDefaut}
        disabled={!modifiable}
        onChange={(e) =>
          setBrouillon((p) => ({
            ...p,
            canalDefaut: e.target.value as ParametresSuivi["canalDefaut"],
          }))
        }
        className="min-h-11 w-full rounded-xl border border-line bg-white px-3 text-[13px] font-semibold disabled:opacity-60"
      >
        <option value="whatsapp">WhatsApp</option>
        <option value="sms">SMS</option>
        <option value="email">E-mail</option>
      </select>

      <div className="mt-4 flex items-end justify-between gap-2">
        <label htmlFor="modele" className="block text-[12px] font-bold text-muted">
          Modèle de message
        </label>
        {modifiable && brouillon.modele !== MODELE_AVERTISSEMENT_DEFAUT && (
          <button
            type="button"
            onClick={() => setBrouillon((p) => ({ ...p, modele: MODELE_AVERTISSEMENT_DEFAUT }))}
            className="text-[11.5px] font-bold text-blue underline"
          >
            Rétablir le modèle d’origine
          </button>
        )}
      </div>
      <textarea
        id="modele"
        value={brouillon.modele}
        maxLength={1000}
        disabled={!modifiable}
        onChange={(e) => setBrouillon((p) => ({ ...p, modele: e.target.value }))}
        rows={5}
        className="mt-2 w-full rounded-xl border border-line bg-white p-3 text-[13px] leading-relaxed disabled:opacity-60"
      />
      <p className="mt-1 text-[11px] leading-relaxed text-muted">
        <code>[Prénom]</code> et <code>[professionnel]</code> sont remplacés à l’envoi. Le
        message est relu et modifiable patient par patient avant de partir.
      </p>
    </Dialogue>
  );
}

function Champ({
  id,
  libelle,
  suffixe,
  valeur,
  min,
  max,
  modifiable,
  onChange,
}: {
  id: string;
  libelle: string;
  suffixe: string;
  valeur: number;
  min: number;
  max: number;
  modifiable: boolean;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-[12px] font-bold text-muted">
        {libelle}
      </label>
      <div className="flex items-center gap-2">
        <input
          id={id}
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          value={valeur}
          disabled={!modifiable}
          onChange={(e) => onChange(e.target.value)}
          className="min-h-11 w-[84px] rounded-xl border border-line bg-white px-3 text-[13px] font-extrabold disabled:opacity-60"
        />
        <span className="text-[12px] text-muted">{suffixe}</span>
      </div>
    </div>
  );
}

/**
 * Trois cas concrets, recalculés avec les seuils en cours de saisie. C'est la
 * même fonction que celle qui décide des pastilles — l'aperçu ne peut donc
 * pas mentir sur ce que le réglage produira.
 */
function Apercu({ seuils }: { seuils: ParametresSuivi }) {
  const cas = [
    { absences: 1, termines: 1 },
    { absences: 1, termines: 3 },
    { absences: 3, termines: 40 },
  ];
  return (
    <div className="mt-4 rounded-xl border border-line bg-bg p-3">
      <b className="block text-[11.5px] font-extrabold uppercase tracking-[.03em] text-muted">
        Avec ces réglages
      </b>
      <ul className="mt-2 grid gap-1.5">
        {cas.map((c) => {
          const n = niveauRisque(c, seuils);
          return (
            <li key={`${c.absences}/${c.termines}`} className="flex items-center gap-2 text-[12px]">
              <span className="flex-1 text-muted">
                {c.absences} absence{c.absences > 1 ? "s" : ""} sur {c.termines} rendez-vous
              </span>
              <span
                className={`rounded-[20px] px-2 py-0.5 text-[10.5px] font-extrabold ${APPARENCE_NIVEAU[n].classe}`}
              >
                {APPARENCE_NIVEAU[n].libelle}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
