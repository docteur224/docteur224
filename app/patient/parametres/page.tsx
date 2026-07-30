"use client";

import PatientShell from "@/components/patient/PatientShell";
import Interrupteur from "@/components/patient/Interrupteur";
import EnTeteMobile from "@/components/mobile/EnTeteMobile";
import { useParametresPatient } from "@/lib/patient";

/*
 * Paramètres — reproduit l'écran « pat-params » de la maquette web :
 * notifications, langue et sécurité. Les interrupteurs sont persistés
 * dans la table `patients` (colonnes pref_*).
 */
export default function Parametres() {
  const { parametres, basculer } = useParametresPatient();

  return (
    <PatientShell>
      {/* ===== Version mobile (écran « m-pat-params » de la maquette mobile) ===== */}
      <div className="md:hidden">
        <EnTeteMobile retour="/patient/compte" titre="Paramètres" />
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
            <h4>Sécurité</h4>
            <div className="setrow">
              <div>
                <b>Double authentification</b>
                <small>Code par SMS</small>
              </div>
              <Interrupteur
                actif={parametres.deuxFacteurs}
                onChange={(v) => basculer("deuxFacteurs", v)}
                label="Authentification à deux facteurs"
              />
            </div>
            <div className="setrow">
              <div>
                <b>Mot de passe</b>
                <small>Sera activé avec l&apos;authentification</small>
              </div>
              <button
                type="button"
                disabled
                title="Disponible avec l'authentification (Phase 3)"
                className="btnm gh"
                style={{ opacity: 0.5, cursor: "not-allowed" }}
              >
                Modifier
              </button>
            </div>
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

      <div className="rounded-2xl border border-line bg-white p-5">
        <h3 className="mb-1 text-[15px] font-extrabold">Sécurité</h3>
        <div className="flex items-center justify-between gap-[14px] border-b border-line py-[15px]">
          <div>
            <b className="block text-[13.5px] font-bold">
              Authentification à deux facteurs (2FA)
            </b>
            <small className="text-xs text-muted">Sécuriser la connexion par code SMS</small>
          </div>
          <Interrupteur
            actif={parametres.deuxFacteurs}
            onChange={(v) => basculer("deuxFacteurs", v)}
            label="Authentification à deux facteurs"
          />
        </div>
        <div className="flex items-center justify-between gap-[14px] py-[15px]">
          <div>
            <b className="block text-[13.5px] font-bold">Mot de passe</b>
            <small className="text-xs text-muted">
              Sera activé avec l’authentification (Phase 3)
            </small>
          </div>
          <button
            type="button"
            disabled
            title="Disponible avec l’authentification (Phase 3)"
            className="cursor-not-allowed rounded-[9px] border-[1.5px] border-line bg-white px-[14px] py-2 text-[12.5px] font-bold text-blue opacity-50"
          >
            Modifier
          </button>
        </div>
      </div>
      </div>
    </PatientShell>
  );
}
