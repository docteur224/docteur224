"use client";

import { useState } from "react";
import AdminShell from "@/components/admin/AdminShell";
import {
  approuverDossier,
  demanderComplement,
  rejeterDossier,
  useEtablissementsEnAttente,
  useMedecinsEnAttente,
  type DossierValidation,
} from "@/lib/mock-admin";

/*
 * Validations — reproduit l'écran « admin-validation » de la maquette web :
 * dossier en cours d'examen (pièces, motif, décision), files des médecins et
 * établissements en attente. Chaque décision retire le dossier de la file et
 * est tracée en direct dans le journal d'audit (spec).
 */

const PIECES = [
  { icone: "📄", label: "Diplôme" },
  { icone: "📄", label: "Carte de l'ordre" },
  { icone: "📄", label: "Autorisation" },
  { icone: "🪪", label: "Identité" },
];

const MOTIFS = [
  "Sélectionner un motif…",
  "Document illisible ou incomplet",
  "Diplôme non conforme",
  "Pièce d'identité expirée",
  "Informations incohérentes",
];

function LigneDossier({ dossier }: { dossier: DossierValidation }) {
  return (
    <div className="flex flex-wrap items-center gap-[13px] border-b border-line py-[14px] last:border-b-0">
      <span
        aria-hidden
        className="grid h-[42px] w-[42px] flex-none place-items-center rounded-xl text-sm font-extrabold text-white"
        style={{ background: "linear-gradient(135deg,#9AA8B2,#647A89)" }}
      >
        {dossier.initiales}
      </span>
      <div className="min-w-0 flex-1">
        <b className="block text-sm font-extrabold">{dossier.nom}</b>
        <small className="text-xs text-muted">
          {dossier.detail} ·{" "}
          <button
            type="button"
            disabled
            title="Disponible avec le stockage de fichiers"
            className="cursor-not-allowed font-bold text-teal opacity-60"
          >
            📄 Voir les documents
          </button>
        </small>
      </div>
      <button
        type="button"
        onClick={() => approuverDossier(dossier)}
        className="rounded-[9px] bg-teal px-[14px] py-2 text-[12.5px] font-bold text-white transition-colors hover:bg-[#2790bc]"
      >
        Approuver
      </button>
      <button
        type="button"
        onClick={() => rejeterDossier(dossier)}
        className="rounded-[9px] border-[1.5px] border-[#F3CDC8] bg-white px-[14px] py-2 text-[12.5px] font-bold text-red transition-colors hover:bg-[#FBE9E7]"
      >
        Rejeter
      </button>
    </div>
  );
}

export default function ValidationsAdmin() {
  const medecins = useMedecinsEnAttente();
  const etablissements = useEtablissementsEnAttente();
  const [motif, setMotif] = useState(MOTIFS[0]);

  // Le dossier « en cours d'examen » est le premier médecin de la file.
  const dossierEnCours = medecins[0];

  return (
    <AdminShell>
      <div className="mb-5">
        <h2 className="text-[21px] font-extrabold tracking-[-0.3px]">Validations</h2>
        <small className="text-[13px] text-muted">
          Vérifiez et approuvez les professionnels et établissements
        </small>
      </div>

      <div className="mb-4 flex items-start gap-[9px] rounded-xl border border-[#BFE0EF] bg-teal-soft px-[14px] py-3 text-[12.5px] font-semibold leading-relaxed text-blue">
        <span aria-hidden>ℹ️</span>
        <div>
          Vérifiez les pièces (diplôme, carte de l’ordre des médecins, autorisation d’exercice,
          pièce d’identité) avant d’approuver. Un professionnel validé obtient le badge{" "}
          <b>Vérifié</b>.
        </div>
      </div>

      {dossierEnCours ? (
        <div className="mb-4 rounded-2xl border border-line bg-white p-5">
          <h3 className="mb-[14px] text-[15px] font-extrabold">
            Dossier en cours d’examen — {dossierEnCours.nom}
          </h3>
          <div className="mb-1 mt-2 flex flex-wrap gap-[10px]">
            {PIECES.map((piece) => (
              <div
                key={piece.label}
                className="flex h-[104px] w-[82px] flex-col items-center justify-center gap-1.5 rounded-[9px] border border-line bg-[#F6FAFC] text-2xl text-muted"
              >
                <span aria-hidden>{piece.icone}</span>
                <small className="text-[9.5px] font-extrabold text-blue">{piece.label}</small>
              </div>
            ))}
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-bold text-muted">Statut</label>
              <div className="rounded-[11px] border border-line bg-white px-[13px] py-3 text-[13.5px]">
                En attente · reçu le 9 juin
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-bold text-muted">
                Motif (si rejet ou complément)
              </label>
              <select
                value={motif}
                onChange={(e) => setMotif(e.target.value)}
                className="w-full rounded-[11px] border border-line bg-white px-[13px] py-3 text-[13.5px] outline-none focus:border-teal"
              >
                {MOTIFS.map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="mt-[14px] flex flex-wrap gap-[9px]">
            <button
              type="button"
              onClick={() => approuverDossier(dossierEnCours)}
              className="rounded-[9px] bg-teal px-[14px] py-2 text-[12.5px] font-bold text-white transition-colors hover:bg-[#2790bc]"
            >
              ✔ Approuver
            </button>
            <button
              type="button"
              onClick={() => demanderComplement(dossierEnCours)}
              className="rounded-[9px] border-[1.5px] border-line bg-white px-[14px] py-2 text-[12.5px] font-bold text-blue transition-colors hover:bg-bg"
            >
              📩 Demander un complément
            </button>
            <button
              type="button"
              onClick={() =>
                rejeterDossier(dossierEnCours, motif === MOTIFS[0] ? undefined : motif)
              }
              className="rounded-[9px] border-[1.5px] border-[#F3CDC8] bg-white px-[14px] py-2 text-[12.5px] font-bold text-red transition-colors hover:bg-[#FBE9E7]"
            >
              ✕ Rejeter avec motif
            </button>
          </div>
          <div className="mt-[14px] flex items-start gap-[9px] rounded-[11px] bg-teal-soft px-[13px] py-[11px] text-[12.5px] font-semibold leading-relaxed text-blue">
            <span aria-hidden>📜</span>
            <div>
              En attente depuis 4 jours. Chaque décision (approbation, rejet, demande de
              complément) est horodatée et tracée dans le <b>journal d’audit</b>.
            </div>
          </div>
        </div>
      ) : (
        <div className="mb-4 rounded-2xl border border-line bg-white p-5 text-center text-[13px] text-muted">
          ✅ Aucun dossier médecin en cours d’examen — la file est vide.
        </div>
      )}

      <div className="mb-4 rounded-2xl border border-line bg-white p-5">
        <h3 className="mb-1 text-[15px] font-extrabold">
          Médecins en attente · {medecins.length}
        </h3>
        {medecins.length === 0 && (
          <p className="py-3 text-[12.5px] text-muted">Aucun médecin en attente.</p>
        )}
        {medecins.map((dossier) => (
          <LigneDossier key={dossier.id} dossier={dossier} />
        ))}
      </div>

      <div className="rounded-2xl border border-line bg-white p-5">
        <h3 className="mb-1 text-[15px] font-extrabold">
          Établissements en attente · {etablissements.length}
        </h3>
        {etablissements.length === 0 && (
          <p className="py-3 text-[12.5px] text-muted">Aucun établissement en attente.</p>
        )}
        {etablissements.map((dossier) => (
          <LigneDossier key={dossier.id} dossier={dossier} />
        ))}
      </div>
    </AdminShell>
  );
}
