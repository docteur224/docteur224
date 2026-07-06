"use client";

import { useState } from "react";
import AdminShell from "@/components/admin/AdminShell";
import Interrupteur from "@/components/patient/Interrupteur";
import {
  enregistrerConfigAbonnements,
  useConfigAbonnements,
  type ConfigAbonnements,
} from "@/lib/mock-admin";

/*
 * Abonnements — reproduit l'écran « admin-abonnements » de la maquette web
 * (spec C.10.2) : tarifs des formules médecin, paliers établissement,
 * réglages de lancement et de paiement. « 💾 Enregistrer » persiste la
 * configuration en local et trace l'action dans le journal d'audit.
 */

const LANCEMENT: { cle: keyof ConfigAbonnements; titre: string; detail?: string }[] = [
  {
    cle: "periodeGratuite",
    titre: "Période gratuite de lancement",
    detail: "Aucune facturation des professionnels pendant la phase pilote",
  },
  { cle: "essaiGratuit", titre: "Essai gratuit à l'inscription", detail: "30 jours" },
  { cle: "orangeMoney", titre: "Paiement Orange Money" },
  { cle: "mtnMomo", titre: "Paiement MTN MoMo" },
];

export default function AbonnementsAdmin() {
  const config = useConfigAbonnements();
  const [brouillon, setBrouillon] = useState<ConfigAbonnements | null>(null);
  const [enregistre, setEnregistre] = useState(false);
  const valeurs = brouillon ?? config;

  function modifier(cle: keyof ConfigAbonnements, valeur: string | boolean) {
    setEnregistre(false);
    setBrouillon({ ...valeurs, [cle]: valeur });
  }

  function enregistrer() {
    enregistrerConfigAbonnements(valeurs);
    setBrouillon(null);
    setEnregistre(true);
  }

  const cellule =
    "w-full min-w-[110px] rounded-[9px] border border-line bg-white px-2 py-1.5 text-[13px] outline-none focus:border-teal";
  const enTete =
    "border-b border-line px-[10px] py-[9px] text-left text-[11px] font-extrabold uppercase tracking-[0.04em] text-muted";
  const caseTab = "border-b border-line px-[10px] py-[9px]";

  return (
    <AdminShell>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-[21px] font-extrabold tracking-[-0.3px]">Abonnements</h2>
          <small className="text-[13px] text-muted">Configurer les offres de la plateforme</small>
        </div>
        <span className="flex items-center gap-3">
          {enregistre && (
            <small className="text-[12.5px] font-bold text-green">✓ Enregistré</small>
          )}
          <button
            type="button"
            onClick={enregistrer}
            disabled={!brouillon}
            className="rounded-[9px] bg-teal px-[14px] py-2 text-[12.5px] font-bold text-white transition-colors hover:bg-[#2790bc] disabled:cursor-not-allowed disabled:opacity-50"
          >
            💾 Enregistrer
          </button>
        </span>
      </div>

      <div className="mb-4 rounded-2xl border border-line bg-white p-5">
        <h3 className="mb-[14px] text-[15px] font-extrabold">Formules médecin</h3>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr>
                {["Formule", "Mensuel (GNF)", "Annuel (GNF)", "Mise en avant"].map((th) => (
                  <th key={th} className={enTete}>
                    {th}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className={caseTab}>
                  <b>Standard</b>
                </td>
                <td className={caseTab}>
                  <input
                    value={valeurs.standardMensuel}
                    onChange={(e) => modifier("standardMensuel", e.target.value)}
                    aria-label="Standard mensuel"
                    className={cellule}
                  />
                </td>
                <td className={caseTab}>
                  <input
                    value={valeurs.standardAnnuel}
                    onChange={(e) => modifier("standardAnnuel", e.target.value)}
                    aria-label="Standard annuel"
                    className={cellule}
                  />
                </td>
                <td className={caseTab}>
                  <span className="rounded-lg bg-red-soft px-[9px] py-1 text-[11px] font-bold text-red">
                    Non
                  </span>
                </td>
              </tr>
              <tr>
                <td className={caseTab}>
                  <b>Premium</b>
                </td>
                <td className={caseTab}>
                  <input
                    value={valeurs.premiumMensuel}
                    onChange={(e) => modifier("premiumMensuel", e.target.value)}
                    aria-label="Premium mensuel"
                    className={cellule}
                  />
                </td>
                <td className={caseTab}>
                  <input
                    value={valeurs.premiumAnnuel}
                    onChange={(e) => modifier("premiumAnnuel", e.target.value)}
                    aria-label="Premium annuel"
                    className={cellule}
                  />
                </td>
                <td className={caseTab}>
                  <span className="rounded-lg bg-green-soft px-[9px] py-1 text-[11px] font-bold text-green">
                    Incluse
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="mb-4 rounded-2xl border border-line bg-white p-5">
        <h3 className="mb-[14px] text-[15px] font-extrabold">Paliers établissement</h3>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr>
                {["Palier", "Médecins", "Tarif (GNF)"].map((th) => (
                  <th key={th} className={enTete}>
                    {th}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className={caseTab}>Cabinet</td>
                <td className={caseTab}>1–3</td>
                <td className={caseTab}>
                  <input
                    value={valeurs.palierCabinet}
                    onChange={(e) => modifier("palierCabinet", e.target.value)}
                    aria-label="Tarif palier Cabinet"
                    className={cellule}
                  />
                </td>
              </tr>
              <tr>
                <td className={caseTab}>Clinique</td>
                <td className={caseTab}>4–15</td>
                <td className={caseTab}>
                  <input
                    value={valeurs.palierClinique}
                    onChange={(e) => modifier("palierClinique", e.target.value)}
                    aria-label="Tarif palier Clinique"
                    className={cellule}
                  />
                </td>
              </tr>
              <tr>
                <td className={caseTab}>Hôpital / Grand centre</td>
                <td className={caseTab}>16+</td>
                <td className={caseTab}>
                  <div className="rounded-[9px] border border-line bg-bg px-2 py-1.5 text-[13px] text-muted">
                    Sur devis
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="mt-[14px] flex items-start gap-[9px] rounded-[11px] bg-teal-soft px-[13px] py-[11px] text-[12.5px] font-semibold leading-relaxed text-blue">
          <span aria-hidden>ℹ️</span>
          <div>
            Un médecin couvert par le plan de son établissement ne paie pas en plus (pas de
            double facturation).
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-line bg-white p-5">
        <h3 className="mb-1 text-[15px] font-extrabold">Lancement & paiement</h3>
        {LANCEMENT.map((ligne) => (
          <div
            key={ligne.cle}
            className="flex items-center justify-between gap-[14px] border-b border-line py-[15px] last:border-b-0"
          >
            <div>
              <b className="block text-[13.5px] font-bold">{ligne.titre}</b>
              {ligne.detail && <small className="text-xs text-muted">{ligne.detail}</small>}
            </div>
            <Interrupteur
              actif={valeurs[ligne.cle] as boolean}
              onChange={(v) => modifier(ligne.cle, v)}
              label={ligne.titre}
            />
          </div>
        ))}
      </div>
    </AdminShell>
  );
}
