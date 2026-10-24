"use client";

import { useCallback, useState } from "react";
import Dialogue from "@/components/site/Dialogue";
import { formatDateCourte } from "@/lib/dates";
import { derniere, enregistrerNote, type Beneficiaire, type NoteConsultation } from "@/lib/dossier-clinique";
import type { RdvDossier } from "@/lib/pro";
import { BTN_NEUTRE, BTN_PRIMAIRE } from "../ui";
import { CLASSE_CHAMP, CLASSE_ETIQUETTE } from "./commun";

/*
 * Rédaction d'une note de consultation, ou d'une nouvelle version.
 *
 * Le modèle suit le raisonnement clinique — Motif, Examen, Diagnostic,
 * Conduite à tenir — sans en imposer aucun : une note de suivi peut tenir en
 * une conduite à tenir. Modifier ne réécrit rien : la base crée la version
 * suivante et garde les précédentes (migration 0064).
 */

const LIMITE = 5000;

const CHAMPS: { cle: "motif" | "examen" | "diagnostic" | "conduite"; libelle: string; aide: string; lignes: number }[] = [
  { cle: "motif", libelle: "Motif", aide: "Pourquoi le patient consulte", lignes: 2 },
  { cle: "examen", libelle: "Examen", aide: "Interrogatoire, examen clinique, constantes relevées", lignes: 4 },
  { cle: "diagnostic", libelle: "Diagnostic", aide: "Hypothèse ou diagnostic retenu", lignes: 2 },
  { cle: "conduite", libelle: "Conduite à tenir", aide: "Traitement, examens demandés, prochain contrôle", lignes: 4 },
];

export default function EditeurNote({
  beneficiaire,
  nomPatient,
  note,
  rdvInitial,
  consultations,
  onFermer,
  onEnregistre,
}: {
  beneficiaire: Beneficiaire;
  nomPatient: string;
  /** Fournie = nouvelle version de cette note. */
  note?: NoteConsultation;
  /** Consultation à laquelle rattacher d'office une nouvelle note. */
  rdvInitial?: string | null;
  /** Consultations passées du patient, proposées au rattachement. */
  consultations: RdvDossier[];
  onFermer: () => void;
  onEnregistre: (message: string) => void;
}) {
  const depart = note ? derniere(note) : null;
  const [champs, setChamps] = useState({
    motif: depart?.motif ?? "",
    examen: depart?.examen ?? "",
    diagnostic: depart?.diagnostic ?? "",
    conduite: depart?.conduite ?? "",
  });
  const [rdv, setRdv] = useState<string>(note?.rendezVousId ?? rdvInitial ?? "");
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const remplie = Object.values(champs).some((v) => v.trim() !== "");
  const inchangee =
    !!depart &&
    champs.motif === (depart.motif ?? "") &&
    champs.examen === (depart.examen ?? "") &&
    champs.diagnostic === (depart.diagnostic ?? "") &&
    champs.conduite === (depart.conduite ?? "") &&
    rdv === (note?.rendezVousId ?? "");

  // Fonction stable : le dialogue réarme son piège de focus à chaque
  // changement de `onFermer`, ce qui renverrait le curseur au premier champ
  // à chaque frappe.
  const fermer = useCallback(() => {
    if (!enCours) onFermer();
  }, [enCours, onFermer]);

  async function enregistrer() {
    if (!remplie || enCours || inchangee) return;
    setEnCours(true);
    setErreur(null);
    const res = await enregistrerNote(beneficiaire, { ...champs, rendezVousId: rdv || null }, note?.id);
    setEnCours(false);
    if (res.erreur) {
      setErreur(res.erreur);
      return;
    }
    onEnregistre(
      note
        ? `Version ${note.versionCourante + 1} enregistrée — la précédente reste consultable`
        : "Note de consultation enregistrée"
    );
  }

  return (
    <Dialogue
      titre={note ? "Modifier la note" : "Nouvelle note de consultation"}
      sousTitre={`${nomPatient} · visible par vous seul`}
      icone="🩺"
      largeur="640px"
      onFermer={fermer}
      pied={
        <>
          <button type="button" onClick={enregistrer} disabled={!remplie || enCours || inchangee} className={BTN_PRIMAIRE}>
            {enCours ? "Enregistrement…" : note ? `Enregistrer la version ${note.versionCourante + 1}` : "Enregistrer la note"}
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
        <div>
          <label htmlFor="note-rdv" className={CLASSE_ETIQUETTE}>
            Consultation
          </label>
          <select id="note-rdv" value={rdv} onChange={(e) => setRdv(e.target.value)} className={CLASSE_CHAMP}>
            <option value="">Sans rendez-vous (note libre)</option>
            {consultations.map((r) => (
              <option key={r.id} value={r.id}>
                {formatDateCourte(r.date)} à {r.heure}
                {r.motif ? ` · ${r.motif}` : ""}
              </option>
            ))}
          </select>
        </div>

        {CHAMPS.map((c) => (
          <div key={c.cle}>
            <label htmlFor={`note-${c.cle}`} className={CLASSE_ETIQUETTE}>
              {c.libelle}
              <span className="ml-1.5 font-semibold text-muted">· {c.aide}</span>
            </label>
            <textarea
              id={`note-${c.cle}`}
              rows={c.lignes}
              maxLength={LIMITE}
              value={champs[c.cle]}
              onChange={(e) => setChamps((s) => ({ ...s, [c.cle]: e.target.value }))}
              className={`${CLASSE_CHAMP} resize-y leading-relaxed`}
            />
            {champs[c.cle].length > LIMITE * 0.8 && (
              <small className="text-[11.5px] text-muted">
                {champs[c.cle].length} / {LIMITE} caractères
              </small>
            )}
          </div>
        ))}

        <p className="rounded-xl bg-bg px-3 py-2.5 text-[12px] leading-relaxed text-muted">
          Cette note n’est visible ni par le patient, ni par votre assistant(e), ni par un confrère.
          {note && " Modifier crée une nouvelle version ; les précédentes restent consultables."}
        </p>
      </div>
    </Dialogue>
  );
}
