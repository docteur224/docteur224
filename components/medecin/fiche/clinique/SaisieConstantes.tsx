"use client";

import { useCallback, useState } from "react";
import Dialogue from "@/components/site/Dialogue";
import { formatDateCourte } from "@/lib/dates";
import { ajouterConstantes, type Beneficiaire } from "@/lib/dossier-clinique";
import {
  evaluerGlycemie,
  evaluerTension,
  LIBELLES_CONTEXTE,
  lireNombre,
  type ContexteGlycemie,
} from "@/lib/normes-constantes";
import type { RdvDossier } from "@/lib/pro";
import { BTN_NEUTRE, BTN_PRIMAIRE } from "../ui";
import { CLASSE_CHAMP, CLASSE_ETIQUETTE, PastilleEtat } from "./commun";

/*
 * Saisie rapide des constantes : une, deux ou les trois mesures d'un coup.
 *
 * Pensée pour le téléphone posé sur le bureau de consultation : clavier
 * numérique (`inputMode="decimal"`), virgule acceptée, unité affichée dans
 * le champ, et l'état de la valeur (normale, élevée…) qui s'affiche pendant
 * la frappe — on voit l'anomalie avant d'enregistrer, pas après.
 */

/** « 2026-10-24T09:30 » à l'heure de l'appareil, pour un champ datetime-local. */
function maintenantLocal(): string {
  const d = new Date();
  const z = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}T${z(d.getHours())}:${z(d.getMinutes())}`;
}

function Unite({ children }: { children: string }) {
  return (
    <span aria-hidden className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[12px] font-bold text-muted">
      {children}
    </span>
  );
}

export default function SaisieConstantes({
  beneficiaire,
  nomPatient,
  consultations,
  onFermer,
  onEnregistre,
}: {
  beneficiaire: Beneficiaire;
  nomPatient: string;
  consultations: RdvDossier[];
  onFermer: () => void;
  onEnregistre: (message: string) => void;
}) {
  const [quand, setQuand] = useState(maintenantLocal);
  const [poids, setPoids] = useState("");
  const [sys, setSys] = useState("");
  const [dia, setDia] = useState("");
  const [glycemie, setGlycemie] = useState("");
  const [contexte, setContexte] = useState<ContexteGlycemie>("a_jeun");
  const [rdv, setRdv] = useState("");
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const vPoids = lireNombre(poids);
  const vSys = lireNombre(sys);
  const vDia = lireNombre(dia);
  const vGly = lireNombre(glycemie);

  // Messages de saisie : ce qui empêche d'enregistrer, champ par champ.
  const problemes: string[] = [];
  if (Number.isNaN(vPoids)) problemes.push("Poids : un nombre, par exemple 72,5.");
  if (Number.isNaN(vSys) || Number.isNaN(vDia)) problemes.push("Tension : deux nombres entiers, par exemple 120 et 80.");
  else if ((vSys === null) !== (vDia === null)) problemes.push("Tension : renseignez la systolique ET la diastolique.");
  else if (vSys !== null && vDia !== null && vSys <= vDia) problemes.push("Tension : la systolique doit dépasser la diastolique.");
  if (Number.isNaN(vGly)) problemes.push("Glycémie : un nombre en g/L, par exemple 1,05.");
  const aucune = vPoids === null && vSys === null && vGly === null;

  const tension =
    vSys !== null && vDia !== null && !Number.isNaN(vSys) && !Number.isNaN(vDia) && vSys > vDia
      ? evaluerTension(vSys, vDia)
      : null;
  const gly = vGly !== null && !Number.isNaN(vGly) ? evaluerGlycemie(vGly, contexte) : null;

  const fermer = useCallback(() => {
    if (!enCours) onFermer();
  }, [enCours, onFermer]);

  async function enregistrer() {
    if (aucune || problemes.length || enCours) return;
    setEnCours(true);
    setErreur(null);
    const res = await ajouterConstantes(beneficiaire, {
      le: quand ? new Date(quand).toISOString() : null,
      poidsKg: vPoids,
      sys: vSys,
      dia: vDia,
      glycemie: vGly,
      contexte: vGly === null ? null : contexte,
      rendezVousId: rdv || null,
    });
    setEnCours(false);
    if (res.erreur) {
      setErreur(res.erreur);
      return;
    }
    const alerte = [tension, gly].some((e) => e && e.niveau !== "normal");
    onEnregistre(alerte ? "Constantes enregistrées — une valeur sort des repères usuels" : "Constantes enregistrées");
  }

  return (
    <Dialogue
      titre="Saisir des constantes"
      sousTitre={nomPatient}
      icone="📈"
      largeur="560px"
      onFermer={fermer}
      pied={
        <>
          <button type="button" onClick={enregistrer} disabled={aucune || problemes.length > 0 || enCours} className={BTN_PRIMAIRE}>
            {enCours ? "Enregistrement…" : "Enregistrer"}
          </button>
          <button type="button" onClick={fermer} className={BTN_NEUTRE}>
            Annuler
          </button>
          {erreur && (
            <p role="alert" className="w-full text-[12.5px] font-bold text-red">
              {erreur}
            </p>
          )}
        </>
      }
    >
      <div className="grid gap-4 p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="cst-quand" className={CLASSE_ETIQUETTE}>
              Mesurée le
            </label>
            <input
              id="cst-quand"
              type="datetime-local"
              value={quand}
              onChange={(e) => setQuand(e.target.value)}
              className={CLASSE_CHAMP}
            />
          </div>
          <div>
            <label htmlFor="cst-rdv" className={CLASSE_ETIQUETTE}>
              Consultation
            </label>
            <select id="cst-rdv" value={rdv} onChange={(e) => setRdv(e.target.value)} className={CLASSE_CHAMP}>
              <option value="">Aucune</option>
              {consultations.map((r) => (
                <option key={r.id} value={r.id}>
                  {formatDateCourte(r.date)} à {r.heure}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label htmlFor="cst-poids" className={CLASSE_ETIQUETTE}>
            Poids
          </label>
          <div className="relative max-w-[200px]">
            <input
              id="cst-poids"
              inputMode="decimal"
              autoComplete="off"
              placeholder="72,5"
              value={poids}
              onChange={(e) => setPoids(e.target.value)}
              className={`${CLASSE_CHAMP} pr-10`}
            />
            <Unite>kg</Unite>
          </div>
        </div>

        <fieldset>
          <legend className={CLASSE_ETIQUETTE}>Tension artérielle</legend>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-[118px]">
              <label htmlFor="cst-sys" className="sr-only">
                Systolique
              </label>
              <input
                id="cst-sys"
                inputMode="numeric"
                autoComplete="off"
                placeholder="120"
                value={sys}
                onChange={(e) => setSys(e.target.value)}
                className={`${CLASSE_CHAMP} pr-11`}
              />
              <Unite>sys</Unite>
            </div>
            <span aria-hidden className="text-[18px] text-muted">
              /
            </span>
            <div className="relative w-[118px]">
              <label htmlFor="cst-dia" className="sr-only">
                Diastolique
              </label>
              <input
                id="cst-dia"
                inputMode="numeric"
                autoComplete="off"
                placeholder="80"
                value={dia}
                onChange={(e) => setDia(e.target.value)}
                className={`${CLASSE_CHAMP} pr-11`}
              />
              <Unite>dia</Unite>
            </div>
            <span className="text-[12px] font-bold text-muted">mmHg</span>
            {tension && <PastilleEtat {...tension} />}
          </div>
        </fieldset>

        <fieldset>
          <legend className={CLASSE_ETIQUETTE}>Glycémie</legend>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-[140px]">
              <label htmlFor="cst-gly" className="sr-only">
                Glycémie en grammes par litre
              </label>
              <input
                id="cst-gly"
                inputMode="decimal"
                autoComplete="off"
                placeholder="1,05"
                value={glycemie}
                onChange={(e) => setGlycemie(e.target.value)}
                className={`${CLASSE_CHAMP} pr-11`}
              />
              <Unite>g/L</Unite>
            </div>
            <label htmlFor="cst-contexte" className="sr-only">
              Moment de la mesure
            </label>
            <select
              id="cst-contexte"
              value={contexte}
              onChange={(e) => setContexte(e.target.value as ContexteGlycemie)}
              className={`${CLASSE_CHAMP} w-auto`}
            >
              {(Object.keys(LIBELLES_CONTEXTE) as ContexteGlycemie[]).map((c) => (
                <option key={c} value={c}>
                  {LIBELLES_CONTEXTE[c]}
                </option>
              ))}
            </select>
            {gly && <PastilleEtat {...gly} />}
          </div>
        </fieldset>

        {problemes.length > 0 && (
          <ul className="grid gap-1 rounded-xl bg-red-soft px-3 py-2.5 text-[12px] font-semibold text-red">
            {problemes.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        )}
        <p className="text-[11.5px] leading-relaxed text-muted">
          Repères adultes usuels : une aide à la lecture, pas un diagnostic.
        </p>
      </div>
    </Dialogue>
  );
}
