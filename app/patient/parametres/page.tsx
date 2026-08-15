"use client";

import Link from "next/link";
import PatientShell from "@/components/patient/PatientShell";
import Interrupteur from "@/components/patient/Interrupteur";
import EnTeteMobile from "@/components/mobile/EnTeteMobile";
import { useParametresPatient } from "@/lib/patient";

/*
 * Paramètres — reproduit l'écran « pat-params » de la maquette web :
 * notifications et langue. Les interrupteurs sont persistés dans la table
 * `patients` (colonnes pref_*).
 *
 * Tout ce qui touche au COMPTE lui-même — mot de passe, export des données,
 * suspension, fermeture — a rejoint « Mon compte », l'écran commun aux cinq
 * rôles. Deux endroits pour changer son mot de passe, c'était un de trop :
 * seul le patient en avait un, et les corrections n'y arrivaient jamais.
 */
export default function Parametres() {
  const { parametres, basculer } = useParametresPatient();

  return (
    <PatientShell>
      {/* ===== Version mobile (écran « m-pat-params » de la maquette mobile) ===== */}
      <div className="md:hidden">
        <EnTeteMobile retour="/patient/compte" titre="Paramètres" recherche />
        <div className="pad">
          <div className="card2">
            <h4>Notifications</h4>
            <div className="setrow">
              <div>
                <b>Rappels par SMS</b>
                <small>Avant chaque rendez-vous</small>
              </div>
              <Interrupteur
                actif={parametres.rappelsSms}
                onChange={(v) => basculer("rappelsSms", v)}
                label="Rappels par SMS"
              />
            </div>
            <div className="setrow">
              <div>
                <b>Rappels par e-mail</b>
                <small>Confirmations</small>
              </div>
              <Interrupteur
                actif={parametres.rappelsEmail}
                onChange={(v) => basculer("rappelsEmail", v)}
                label="Rappels par e-mail"
              />
            </div>
            <div className="setrow">
              <div>
                <b>Offres et nouveautés</b>
                <small>Nouveaux médecins</small>
              </div>
              <Interrupteur
                actif={parametres.offres}
                onChange={(v) => basculer("offres", v)}
                label="Offres et nouveautés"
              />
            </div>
          </div>
          <div className="card2">
            <h4>Langue</h4>
            <div className="setrow">
              <div>
                <b>Langue de l&apos;interface</b>
                <small>Français</small>
              </div>
              <button
                type="button"
                disabled
                title="L'anglais est prévu dans une évolution future"
                className="btnm gh"
                style={{ opacity: 0.5, cursor: "not-allowed" }}
              >
                Changer
              </button>
            </div>
          </div>
          <div className="card2">
            <h4>Mon compte</h4>
            <p className="muted" style={{ fontSize: 12.5, marginBottom: 10 }}>
              Mot de passe, export de vos données, suspension et fermeture du compte.
            </p>
            <Link href="/patient/mon-compte" className="btn block" style={{ display: "block", textAlign: "center" }}>
              Ouvrir « Mon compte »
            </Link>
          </div>
        </div>
      </div>

      {/* ===== Version web (inchangée) ===== */}
      <div className="hidden md:block">
      <div className="mb-5">
        <h2 className="text-[21px] font-extrabold tracking-[-0.3px]">Paramètres</h2>
        <small className="text-[13px] text-muted">Notifications, langue et sécurité</small>
      </div>

      <div className="mb-4 rounded-2xl border border-line bg-white p-5">
        <h3 className="mb-1 text-[15px] font-extrabold">Notifications</h3>
        <div className="flex items-center justify-between gap-[14px] border-b border-line py-[15px]">
          <div>
            <b className="block text-[13.5px] font-bold">Rappels par SMS</b>
            <small className="text-xs text-muted">Recevoir un SMS avant chaque rendez-vous</small>
          </div>
          <Interrupteur
            actif={parametres.rappelsSms}
            onChange={(v) => basculer("rappelsSms", v)}
            label="Rappels par SMS"
          />
        </div>
        <div className="flex items-center justify-between gap-[14px] border-b border-line py-[15px]">
          <div>
            <b className="block text-[13.5px] font-bold">Rappels par e-mail</b>
            <small className="text-xs text-muted">Recevoir un e-mail de confirmation</small>
          </div>
          <Interrupteur
            actif={parametres.rappelsEmail}
            onChange={(v) => basculer("rappelsEmail", v)}
            label="Rappels par e-mail"
          />
        </div>
        <div className="flex items-center justify-between gap-[14px] py-[15px]">
          <div>
            <b className="block text-[13.5px] font-bold">Offres et nouveautés</b>
            <small className="text-xs text-muted">Informations sur de nouveaux médecins</small>
          </div>
          <Interrupteur
            actif={parametres.offres}
            onChange={(v) => basculer("offres", v)}
            label="Offres et nouveautés"
          />
        </div>
      </div>

      <div className="mb-4 rounded-2xl border border-line bg-white p-5">
        <h3 className="mb-1 text-[15px] font-extrabold">Langue</h3>
        <div className="flex items-center justify-between gap-[14px] py-[15px]">
          <div>
            <b className="block text-[13.5px] font-bold">Langue de l’interface</b>
            <small className="text-xs text-muted">Français</small>
          </div>
          <button
            type="button"
            disabled
            title="L’anglais est prévu dans une évolution future"
            className="cursor-not-allowed rounded-[9px] border-[1.5px] border-line bg-white px-[14px] py-2 text-[12.5px] font-bold text-blue opacity-50"
          >
            Changer
          </button>
        </div>
      </div>

      <div className="mb-4 rounded-2xl border border-line bg-white p-5">
        <h3 className="mb-1 text-[15px] font-extrabold">Mon compte</h3>
        <div className="flex flex-wrap items-center justify-between gap-[14px] py-[15px]">
          <div>
            <b className="block text-[13.5px] font-bold">Sécurité, données et fermeture</b>
            <small className="text-xs text-muted">
              Mot de passe, export de vos données, suspension et fermeture du compte
            </small>
          </div>
          <Link
            href="/patient/mon-compte"
            className="rounded-[9px] border-[1.5px] border-line bg-white px-[14px] py-2 text-[12.5px] font-bold text-blue transition-colors hover:bg-bg"
          >
            Ouvrir « Mon compte »
          </Link>
        </div>
      </div>
      </div>
    </PatientShell>
  );
}
