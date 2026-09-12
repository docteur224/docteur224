"use client";

import { useState } from "react";
import Dialogue from "@/components/site/Dialogue";
import { JOURS_NOMS, ORDRE_SEMAINE } from "@/lib/horaires";
import {
  ajouterAbsence,
  etatAbsence,
  LIBELLE_ETAT,
  modifierAbsence,
  periodeLisible,
  rdvPendantAbsence,
  saisieVierge,
  supprimerAbsence,
  useAbsences,
  versSaisie,
  type Absence,
  type EtatAbsence,
  type SaisieAbsence,
} from "@/lib/absences";

/*
 * Congés et absences — la liste réelle du praticien, et les trois gestes
 * qu'elle appelle : ajouter, modifier, supprimer.
 *
 * Cet écran était une maquette : deux lignes en dur dans le JSX, les mêmes
 * pour tous les praticiens, et un bouton « + Ajouter une absence »
 * désactivé. Poser un congé ne fermait donc aucun créneau, et un médecin
 * parti trois semaines continuait de recevoir des rendez-vous.
 *
 * Partagé entre l'espace médecin et l'espace assistant(e) — comme
 * GrilleDisponibilites, et pour la même raison : poser un congé et fermer
 * une journée à la main sont le même geste, ils demandent le même droit
 * (« Ouvrir / fermer des créneaux »).
 *
 * `variante` ne change QUE l'habillage : « web » suit les cartes de la
 * maquette web, « mobile » les .card2 de la maquette mobile. Le dialogue,
 * lui, est commun — il est déjà une feuille montante sur téléphone.
 */

const COULEUR_ETAT: Record<EtatAbsence, string> = {
  en_cours: "bg-red-soft text-red",
  programme: "bg-amber-soft text-amber",
  recurrent: "bg-green-soft text-green",
  passe: "bg-bg text-muted",
};

/** Pastille mobile : la maquette n'a que trois classes, on s'y tient. */
const PILL_MOBILE: Record<EtatAbsence, string> = {
  en_cours: "pill warn",
  programme: "pill soon",
  recurrent: "pill ok",
  passe: "pill",
};

export default function CongesAbsences({
  medecinId,
  peutModifier,
  variante = "web",
}: {
  medecinId: string;
  /** Faux : la liste se consulte, les trois gestes disparaissent. */
  peutModifier: boolean;
  variante?: "web" | "mobile";
}) {
  const { absences, chargement, recharger } = useAbsences(medecinId);
  const [saisie, setSaisie] = useState<SaisieAbsence | null>(null);
  const [enEdition, setEnEdition] = useState<Absence | null>(null);
  const [aSupprimer, setASupprimer] = useState<Absence | null>(null);
  const [erreur, setErreur] = useState("");
  const [message, setMessage] = useState("");
  const [enCours, setEnCours] = useState(false);
  /** Rendez-vous déjà pris sur la période saisie : un avertissement, pas un refus. */
  const [conflits, setConflits] = useState<number | null>(null);

  function ouvrirAjout() {
    setEnEdition(null);
    setSaisie(saisieVierge());
    setConflits(null);
    setErreur("");
  }

  function ouvrirEdition(a: Absence) {
    setEnEdition(a);
    setSaisie(versSaisie(a));
    setConflits(null);
    setErreur("");
  }

  function fermer() {
    setSaisie(null);
    setEnEdition(null);
    setConflits(null);
    setErreur("");
  }

  /*
   * Poser un congé n'annule aucun rendez-vous : ce serait décider à la
   * place du praticien, et prévenir les patients demande un geste qui lui
   * appartient. Mais partir sans savoir qu'on laisse six personnes devant
   * une porte fermée n'est pas acceptable — on compte, et on le dit.
   */
  async function compterConflits(s: SaisieAbsence) {
    setConflits(await rdvPendantAbsence(medecinId, s));
  }

  function majSaisie(champs: Partial<SaisieAbsence>) {
    if (!saisie) return;
    const suivant = { ...saisie, ...champs };
    setSaisie(suivant);
    setErreur("");
    // Le comptage suit la saisie : l'avertissement doit parler de ce qui est
    // à l'écran, pas de ce qui y était il y a trois champs.
    setConflits(null);
  }

  async function enregistrer() {
    if (!saisie || enCours) return;
    setEnCours(true);
    setErreur("");
    const res = enEdition
      ? await modifierAbsence(enEdition.id, saisie)
      : await ajouterAbsence(medecinId, saisie);
    setEnCours(false);
    if (res.erreur) {
      setErreur(res.erreur);
      return;
    }
    setMessage(enEdition ? "Absence modifiée." : "Absence enregistrée.");
    fermer();
    recharger();
  }

  async function supprimer() {
    if (!aSupprimer || enCours) return;
    setEnCours(true);
    const res = await supprimerAbsence(aSupprimer.id);
    setEnCours(false);
    if (res.erreur) {
      setErreur(res.erreur);
      setASupprimer(null);
      return;
    }
    setMessage("Absence annulée.");
    setASupprimer(null);
    recharger();
  }

  const champ =
    "w-full rounded-[10px] border border-line bg-white px-3 py-2.5 text-[13px] outline-none focus:border-teal";
  const etiquette = "mb-1 block text-[12px] font-bold text-muted";

  /* ===================== Le dialogue de saisie ===================== */
  const dialogue = saisie && (
    <Dialogue
      titre={enEdition ? "Modifier l’absence" : "Nouvelle absence"}
      icone="🌴"
      sousTitre="Les créneaux concernés seront fermés à la réservation."
      onFermer={fermer}
      pied={
        <>
          <button
            type="button"
            onClick={enregistrer}
            disabled={enCours}
            className="flex-1 rounded-[11px] bg-teal px-4 py-2.5 text-[13px] font-bold text-white disabled:opacity-50"
          >
            {enCours ? "Enregistrement…" : enEdition ? "Enregistrer" : "Ajouter l’absence"}
          </button>
          <button
            type="button"
            onClick={fermer}
            className="rounded-[11px] border-[1.5px] border-line bg-white px-4 py-2.5 text-[13px] font-bold text-blue"
          >
            Annuler
          </button>
        </>
      }
    >
      <div className="space-y-3.5 p-4">
        <div>
          <label className={etiquette} htmlFor="abs-motif">
            Motif
          </label>
          <input
            id="abs-motif"
            className={champ}
            value={saisie.motif}
            maxLength={80}
            placeholder="Vacances annuelles, congrès, formation…"
            onChange={(e) => majSaisie({ motif: e.target.value })}
          />
        </div>

        {/* Période ou récurrence : deux formes, jamais les deux à la fois. */}
        <div>
          <span className={etiquette}>Type d’absence</span>
          <div className="flex gap-2">
            {(
              [
                ["periode", "Sur une période"],
                ["recurrente", "Chaque semaine"],
              ] as const
            ).map(([forme, libelle]) => (
              <button
                key={forme}
                type="button"
                onClick={() => majSaisie({ forme })}
                className={`flex-1 rounded-[10px] border-[1.5px] px-3 py-2 text-[12.5px] font-bold transition ${
                  saisie.forme === forme
                    ? "border-teal bg-teal-soft text-blue"
                    : "border-line bg-white text-muted"
                }`}
              >
                {libelle}
              </button>
            ))}
          </div>
        </div>

        {saisie.forme === "periode" ? (
          <div className="flex gap-3">
            <div className="flex-1">
              <label className={etiquette} htmlFor="abs-debut">
                Du
              </label>
              <input
                id="abs-debut"
                type="date"
                className={champ}
                value={saisie.dateDebut}
                onChange={(e) => {
                  const dateDebut = e.target.value;
                  // La fin suit le début tant qu'elle le précède : sans cela,
                  // reculer le départ laisse une période à l'envers que la
                  // base refuse, sans que l'on comprenne pourquoi.
                  majSaisie({
                    dateDebut,
                    dateFin: saisie.dateFin < dateDebut ? dateDebut : saisie.dateFin,
                  });
                }}
              />
            </div>
            <div className="flex-1">
              <label className={etiquette} htmlFor="abs-fin">
                Au
              </label>
              <input
                id="abs-fin"
                type="date"
                className={champ}
                min={saisie.dateDebut}
                value={saisie.dateFin}
                onChange={(e) => majSaisie({ dateFin: e.target.value })}
              />
            </div>
          </div>
        ) : (
          <div>
            <label className={etiquette} htmlFor="abs-jour">
              Jour de la semaine
            </label>
            <select
              id="abs-jour"
              className={champ}
              value={saisie.jourSemaine}
              onChange={(e) => majSaisie({ jourSemaine: Number(e.target.value) })}
            >
              {ORDRE_SEMAINE.map((j) => (
                <option key={j} value={j}>
                  {JOURS_NOMS[j]}
                </option>
              ))}
            </select>
          </div>
        )}

        <label className="flex cursor-pointer items-center gap-2.5">
          <input
            type="checkbox"
            checked={saisie.journeeEntiere}
            onChange={(e) => majSaisie({ journeeEntiere: e.target.checked })}
            className="h-4 w-4 accent-teal"
          />
          <span className="text-[13px] font-bold">Journée entière</span>
        </label>

        {!saisie.journeeEntiere && (
          <div className="flex gap-3">
            <div className="flex-1">
              <label className={etiquette} htmlFor="abs-h-debut">
                De
              </label>
              <input
                id="abs-h-debut"
                type="time"
                step={1800}
                className={champ}
                value={saisie.heureDebut}
                onChange={(e) => majSaisie({ heureDebut: e.target.value })}
              />
            </div>
            <div className="flex-1">
              <label className={etiquette} htmlFor="abs-h-fin">
                À
              </label>
              <input
                id="abs-h-fin"
                type="time"
                step={1800}
                className={champ}
                value={saisie.heureFin}
                onChange={(e) => majSaisie({ heureFin: e.target.value })}
              />
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={() => compterConflits(saisie)}
          className="w-full rounded-[10px] border-[1.5px] border-line bg-white px-3 py-2 text-[12.5px] font-bold text-blue"
        >
          Vérifier les rendez-vous déjà pris
        </button>

        {conflits !== null && (
          <p
            className={`rounded-[10px] px-3 py-2.5 text-[12.5px] font-semibold leading-relaxed ${
              conflits > 0 ? "bg-amber-soft text-amber" : "bg-green-soft text-green"
            }`}
          >
            {conflits === 0
              ? "✓ Aucun rendez-vous n’est pris sur cette période."
              : `⚠️ ${conflits} rendez-vous ${conflits > 1 ? "sont déjà pris" : "est déjà pris"} sur cette période. Ils ne seront pas annulés : prévenez ces patients depuis votre agenda.`}
          </p>
        )}

        {erreur && (
          <p role="alert" className="rounded-[10px] bg-red-50 px-3 py-2.5 text-[12.5px] font-bold text-red">
            ⚠️ {erreur}
          </p>
        )}
      </div>
    </Dialogue>
  );

  /* ===================== La confirmation de suppression ===================== */
  const confirmation = aSupprimer && (
    <Dialogue
      titre="Annuler cette absence ?"
      icone="🗑️"
      onFermer={() => setASupprimer(null)}
      pied={
        <>
          <button
            type="button"
            onClick={supprimer}
            disabled={enCours}
            className="flex-1 rounded-[11px] bg-red px-4 py-2.5 text-[13px] font-bold text-white disabled:opacity-50"
          >
            {enCours ? "Suppression…" : "Oui, annuler l’absence"}
          </button>
          <button
            type="button"
            onClick={() => setASupprimer(null)}
            className="rounded-[11px] border-[1.5px] border-line bg-white px-4 py-2.5 text-[13px] font-bold text-blue"
          >
            Garder
          </button>
        </>
      }
    >
      <p className="p-4 text-[13px] leading-relaxed text-muted">
        <b className="text-blue">{aSupprimer.motif}</b> — {periodeLisible(aSupprimer)}.
        <br />
        Les créneaux concernés redeviendront réservables.
      </p>
    </Dialogue>
  );

  /* ===================== Version mobile ===================== */
  if (variante === "mobile") {
    return (
      <>
        <div className="card2" style={{ marginTop: 12 }}>
          <h4>Congés et absences</h4>
          {chargement ? (
            <p className="muted" style={{ fontSize: 12.5, padding: "8px 0" }}>
              Chargement…
            </p>
          ) : absences.length === 0 ? (
            <p className="muted" style={{ fontSize: 12.5, padding: "8px 0", lineHeight: 1.5 }}>
              Aucune absence enregistrée. Ajoutez vos vacances ou votre jour de repos : les
              créneaux concernés ne seront plus proposés aux patients.
            </p>
          ) : (
            absences.map((a) => {
              const etat = etatAbsence(a);
              return (
                <div className="setrow" key={a.id}>
                  <div>
                    <b>{a.motif}</b>
                    <small>{periodeLisible(a)}</small>
                    {peutModifier && (
                      <div style={{ display: "flex", gap: 12, marginTop: 6 }}>
                        <button
                          type="button"
                          onClick={() => ouvrirEdition(a)}
                          style={{ fontSize: 11.5, fontWeight: 700, color: "var(--teal)" }}
                        >
                          Modifier
                        </button>
                        <button
                          type="button"
                          onClick={() => setASupprimer(a)}
                          style={{ fontSize: 11.5, fontWeight: 700, color: "var(--red)" }}
                        >
                          Annuler
                        </button>
                      </div>
                    )}
                  </div>
                  <span className={PILL_MOBILE[etat]}>{LIBELLE_ETAT[etat]}</span>
                </div>
              );
            })
          )}
          {message && (
            <p style={{ fontSize: 12, fontWeight: 700, color: "var(--green)", paddingTop: 8 }}>
              ✓ {message}
            </p>
          )}
        </div>
        {peutModifier && (
          <button type="button" className="btn ghost block" onClick={ouvrirAjout}>
            + Ajouter une absence
          </button>
        )}
        {dialogue}
        {confirmation}
      </>
    );
  }

  /* ===================== Version web ===================== */
  return (
    <div className="rounded-2xl border border-line bg-white p-5">
      <h3 className="mb-1 text-[15px] font-extrabold">Congés et absences</h3>
      <small className="mb-1 block text-xs text-muted">
        Les créneaux couverts par une absence ne sont plus proposés aux patients.
      </small>

      {chargement ? (
        <p className="py-4 text-[13px] text-muted">Chargement…</p>
      ) : absences.length === 0 ? (
        <p className="py-4 text-[13px] leading-relaxed text-muted">
          Aucune absence enregistrée. Ajoutez vos vacances, une formation ou votre jour de repos
          hebdomadaire.
        </p>
      ) : (
        absences.map((a, i) => {
          const etat = etatAbsence(a);
          return (
            <div
              key={a.id}
              className={`flex flex-wrap items-center justify-between gap-[14px] py-[15px] ${
                i < absences.length - 1 ? "border-b border-line" : ""
              }`}
            >
              <div className="min-w-0">
                <b className="block text-[13.5px] font-bold">{a.motif}</b>
                <small className="text-xs text-muted">{periodeLisible(a)}</small>
              </div>
              <div className="flex items-center gap-2.5">
                {peutModifier && (
                  <>
                    <button
                      type="button"
                      onClick={() => ouvrirEdition(a)}
                      className="rounded-lg border-[1.5px] border-line bg-white px-2.5 py-1 text-[11.5px] font-bold text-blue hover:border-teal"
                    >
                      Modifier
                    </button>
                    <button
                      type="button"
                      onClick={() => setASupprimer(a)}
                      className="rounded-lg border-[1.5px] border-line bg-white px-2.5 py-1 text-[11.5px] font-bold text-red hover:border-red"
                    >
                      Annuler
                    </button>
                  </>
                )}
                <span
                  className={`rounded-lg px-[9px] py-1 text-[11px] font-bold ${COULEUR_ETAT[etat]}`}
                >
                  {LIBELLE_ETAT[etat]}
                </span>
              </div>
            </div>
          );
        })
      )}

      {peutModifier && (
        <button
          type="button"
          onClick={ouvrirAjout}
          className="mt-[14px] rounded-[9px] border-[1.5px] border-line bg-white px-[14px] py-2 text-[12.5px] font-bold text-blue transition hover:border-teal"
        >
          + Ajouter une absence
        </button>
      )}

      {message && (
        <p className="mt-3 text-[12.5px] font-bold text-green">✓ {message}</p>
      )}
      {erreur && !saisie && (
        <p role="alert" className="mt-3 text-[12.5px] font-bold text-red">
          ⚠️ {erreur}
        </p>
      )}

      {dialogue}
      {confirmation}
    </div>
  );
}
