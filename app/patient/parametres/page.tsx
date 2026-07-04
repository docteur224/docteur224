"use client";

import PatientShell from "@/components/patient/PatientShell";
import Interrupteur from "@/components/patient/Interrupteur";
import {
  enregistrerParametresLocaux,
  useParametresLocaux,
  type ParametresLocaux,
} from "@/lib/mock-parametres";

/*
 * Paramètres — reproduit l'écran « pat-params » de la maquette web :
 * notifications, langue et sécurité. Les interrupteurs sont persistés
 * en local (mock des futurs réglages en base).
 */
export default function Parametres() {
  const parametres = useParametresLocaux();

  function basculer(cle: keyof ParametresLocaux, valeur: boolean) {
    enregistrerParametresLocaux({ ...parametres, [cle]: valeur });
  }

  return (
    <PatientShell>
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
    </PatientShell>
  );
}
