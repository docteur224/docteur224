"use client";

import EtablissementShell from "@/components/etablissement/EtablissementShell";
import Interrupteur from "@/components/patient/Interrupteur";
import {
  ETABLISSEMENT_CONNECTE,
  enregistrerParametresEtablissement,
  useParametresEtablissement,
  type ParametresEtablissement,
} from "@/lib/mock-etablissement";

/*
 * Compte & paramètres — reproduit l'écran « etab-compte » de la maquette
 * web : compte du gestionnaire et préférences de l'établissement. Les
 * interrupteurs sont persistés en local (mock).
 */

const PARAMETRES: {
  cle: keyof ParametresEtablissement;
  titre: string;
  detail: string;
}[] = [
  {
    cle: "affichagePublic",
    titre: "Fiche visible dans la recherche",
    detail: "Les patients trouvent l'établissement et ses médecins",
  },
  {
    cle: "notifEmail",
    titre: "Notifications par e-mail",
    detail: "Nouveaux rendez-vous, réponses aux invitations",
  },
  {
    cle: "rappelsSms",
    titre: "Rappels SMS aux patients",
    detail: "Rappel automatique avant chaque rendez-vous",
  },
  {
    cle: "premiumVedette",
    titre: "Mise en avant Premium (en vedette)",
    detail: "Établissement mis en avant dans les résultats de recherche",
  },
];

export default function CompteEtablissement() {
  const parametres = useParametresEtablissement();
  const gestionnaire = ETABLISSEMENT_CONNECTE.gestionnaire;

  function basculer(cle: keyof ParametresEtablissement, valeur: boolean) {
    enregistrerParametresEtablissement({ ...parametres, [cle]: valeur });
  }

  return (
    <EtablissementShell>
      <div className="mb-5">
        <h2 className="text-[21px] font-extrabold tracking-[-0.3px]">Compte & paramètres</h2>
        <small className="text-[13px] text-muted">
          Le compte gestionnaire et les préférences de l’établissement
        </small>
      </div>

      <div className="mb-4 rounded-2xl border border-line bg-white p-5">
        <h3 className="mb-1 text-[15px] font-extrabold">Compte du gestionnaire</h3>
        <div className="flex items-center justify-between gap-[14px] border-b border-line py-[15px]">
          <div>
            <b className="block text-[13.5px] font-bold">Nom complet</b>
            <small className="text-xs text-muted">{gestionnaire.nom}</small>
          </div>
        </div>
        <div className="flex items-center justify-between gap-[14px] border-b border-line py-[15px]">
          <div>
            <b className="block text-[13.5px] font-bold">Rôle</b>
            <small className="text-xs text-muted">{gestionnaire.role}</small>
          </div>
        </div>
        <div className="flex items-center justify-between gap-[14px] border-b border-line py-[15px]">
          <div>
            <b className="block text-[13.5px] font-bold">E-mail</b>
            <small className="text-xs text-muted">{gestionnaire.email}</small>
          </div>
        </div>
        <div className="flex items-center justify-between gap-[14px] border-b border-line py-[15px]">
          <div>
            <b className="block text-[13.5px] font-bold">Téléphone</b>
            <small className="text-xs text-muted">{gestionnaire.telephone}</small>
          </div>
        </div>
        <div className="flex items-center justify-between gap-[14px] py-[15px]">
          <div>
            <b className="block text-[13.5px] font-bold">Mot de passe</b>
            <small className="text-xs text-muted">Dernière modification il y a 3 mois</small>
          </div>
          <button
            type="button"
            disabled
            title="Disponible avec l'authentification"
            className="cursor-not-allowed rounded-[9px] border-[1.5px] border-line bg-white px-3 py-1.5 text-[11.5px] font-bold text-blue opacity-50"
          >
            Changer
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-line bg-white p-5">
        <h3 className="mb-1 text-[15px] font-extrabold">Paramètres de l’établissement</h3>
        {PARAMETRES.map((parametre, i) => (
          <div
            key={parametre.cle}
            className={`flex items-center justify-between gap-[14px] py-[15px] ${
              i < PARAMETRES.length - 1 ? "border-b border-line" : ""
            }`}
          >
            <div>
              <b className="block text-[13.5px] font-bold">{parametre.titre}</b>
              <small className="text-xs text-muted">{parametre.detail}</small>
            </div>
            <Interrupteur
              actif={parametres[parametre.cle]}
              onChange={(v) => basculer(parametre.cle, v)}
              label={parametre.titre}
            />
          </div>
        ))}
        <div className="mt-1.5 flex items-start gap-[9px] rounded-xl bg-teal-soft px-[14px] py-3 text-[12.5px] font-semibold leading-relaxed text-blue">
          <span aria-hidden>ℹ️</span>
          <div>
            Préférences enregistrées automatiquement sur cet appareil (mode démonstration). Les
            notifications réelles seront branchées en Phase 10.
          </div>
        </div>
      </div>
    </EtablissementShell>
  );
}
