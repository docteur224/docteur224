"use client";

import Link from "next/link";
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
      {/* ===== Version mobile (écran « m-etab-compte » de la maquette mobile) ===== */}
      <div className="md:hidden">
        <div className="appbar">
          <h3 style={{ paddingLeft: 4 }}>Compte &amp; paramètres</h3>
        </div>
        <div className="pad">
          <div className="acctop">
            <span className="av" aria-hidden style={{ background: ETABLISSEMENT_CONNECTE.gradient }}>
              🏥
            </span>
            <div>
              <b>{ETABLISSEMENT_CONNECTE.nomCourt}</b>
              <small>Gestionnaire : {gestionnaire.nom}</small>
            </div>
          </div>
          <div className="menu">
            <Link href="/espace-etablissement/statistiques" className="mrow">
              <span className="mi" aria-hidden>
                📊
              </span>
              <span>
                <b>Statistiques</b>
                <small>Activité de l&apos;établissement</small>
              </span>
              <span className="ch" aria-hidden>
                ›
              </span>
            </Link>
            <Link href="/espace-etablissement/medecins" className="mrow">
              <span className="mi" aria-hidden>
                👨‍⚕️
              </span>
              <span>
                <b>Médecins</b>
                <small>Gérer les rattachements</small>
              </span>
              <span className="ch" aria-hidden>
                ›
              </span>
            </Link>
            <Link href="/espace-etablissement/abonnement" className="mrow">
              <span className="mi" aria-hidden>
                💳
              </span>
              <span>
                <b>Abonnement</b>
                <small>Palier de l&apos;établissement</small>
              </span>
              <span className="ch" aria-hidden>
                ›
              </span>
            </Link>
            <Link href="/" className="mrow">
              <span className="mi" aria-hidden>
                ↩️
              </span>
              <span>
                <b>Déconnexion</b>
              </span>
              <span className="ch" aria-hidden>
                ›
              </span>
            </Link>
          </div>
          <div className="card2" style={{ marginTop: 12 }}>
            <h4>Gestionnaire</h4>
            <div className="setrow">
              <div>
                <b>Nom</b>
                <small>{gestionnaire.nom}</small>
              </div>
            </div>
            <div className="setrow">
              <div>
                <b>Rôle</b>
                <small>{gestionnaire.role}</small>
              </div>
            </div>
            <div className="setrow">
              <div>
                <b>E-mail</b>
                <small>{gestionnaire.email}</small>
              </div>
            </div>
            <div className="setrow">
              <div>
                <b>Téléphone</b>
                <small>{gestionnaire.telephone}</small>
              </div>
            </div>
          </div>
          <div className="card2">
            <h4>Paramètres</h4>
            {PARAMETRES.map((parametre) => (
              <div key={parametre.cle} className="setrow">
                <div>
                  <b>{parametre.titre}</b>
                  <small>{parametre.detail}</small>
                </div>
                <Interrupteur
                  actif={parametres[parametre.cle]}
                  onChange={(v) => basculer(parametre.cle, v)}
                  label={parametre.titre}
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ===== Version web (inchangée) ===== */}
      <div className="hidden md:block">
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
            notifications simulées sont visibles dans le centre de notifications (🔔).
          </div>
        </div>
      </div>
      </div>
    </EtablissementShell>
  );
}
