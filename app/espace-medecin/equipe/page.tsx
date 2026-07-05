"use client";

import Link from "next/link";
import MedecinShell from "@/components/medecin/MedecinShell";
import Interrupteur from "@/components/patient/Interrupteur";
import {
  enregistrerPermissionsAssistante,
  usePermissionsAssistante,
  type PermissionsAssistante,
} from "@/lib/mock-medecin";

/*
 * Mes assistant(e)s — reproduit l'écran « med-equipe » de la maquette web :
 * comptes de l'équipe et grille de permissions (spec C.4.3). Les permissions
 * de Hawa Diallo sont persistées : elles encadreront l'espace assistant(e)
 * en Phase 7. Dossiers médicaux et finances restent toujours interdits.
 */

const EQUIPE = [
  {
    initiales: "HD",
    gradient: "linear-gradient(135deg,#2E9CCA,#15506B)",
    nom: "Hawa Diallo",
    detail: "Secrétaire · gère l'agenda et les messages",
    statut: "Actif",
  },
  {
    initiales: "FC",
    gradient: "linear-gradient(135deg,#6C5CE7,#341F97)",
    nom: "Fatou Camara",
    detail: "Assistante · confirme les rendez-vous",
    statut: "Actif",
  },
  {
    initiales: "MB",
    gradient: "linear-gradient(135deg,#9AA8B2,#647A89)",
    nom: "Mariam Bah",
    detail: "Assistante · accès suspendu",
    statut: "Inactif",
  },
];

const PERMISSIONS: { cle: keyof PermissionsAssistante; titre: string; detail: string }[] = [
  { cle: "voirAgenda", titre: "Voir l'agenda", detail: "Consulter les rendez-vous du médecin" },
  {
    cle: "confirmerAnnuler",
    titre: "Confirmer / annuler les rendez-vous",
    detail: "Traiter les demandes des patients",
  },
  {
    cle: "reprogrammer",
    titre: "Reprogrammer un rendez-vous",
    detail: "Déplacer un RDV vers un autre créneau",
  },
  {
    cle: "creerRdv",
    titre: "Créer un rendez-vous pour un patient",
    detail: "Réservation déléguée au nom d'un patient",
  },
  {
    cle: "messagerie",
    titre: "Messagerie patients",
    detail: "Répondre aux messages (WhatsApp, chat)",
  },
  {
    cle: "gererCreneaux",
    titre: "Ouvrir / fermer des créneaux",
    detail: "Activer/désactiver les disponibilités",
  },
];

export default function EquipeMedecin() {
  const permissions = usePermissionsAssistante();

  function basculer(cle: keyof PermissionsAssistante, valeur: boolean) {
    enregistrerPermissionsAssistante({ ...permissions, [cle]: valeur });
  }

  return (
    <MedecinShell>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-[21px] font-extrabold tracking-[-0.3px]">Mes assistant(e)s</h2>
          <small className="text-[13px] text-muted">
            Créez des comptes et définissez précisément leurs permissions
          </small>
        </div>
        <button
          type="button"
          disabled
          title="Disponible en Phase 7 (espace assistant)"
          className="cursor-not-allowed rounded-[9px] bg-teal px-[14px] py-2 text-[12.5px] font-bold text-white opacity-50"
        >
          + Ajouter un(e) assistant(e)
        </button>
      </div>

      <div className="mb-4 rounded-2xl border border-line bg-white p-5">
        <h3 className="mb-1 text-[15px] font-extrabold">Comptes de l’équipe</h3>
        {EQUIPE.map((membre) => (
          <div
            key={membre.nom}
            className="flex flex-wrap items-center gap-[13px] border-b border-line py-[14px] last:border-b-0"
          >
            <span
              aria-hidden
              className="grid h-[42px] w-[42px] flex-none place-items-center rounded-xl text-sm font-extrabold text-white"
              style={{ background: membre.gradient }}
            >
              {membre.initiales}
            </span>
            <div className="flex-1">
              <b className="block text-sm font-extrabold">{membre.nom}</b>
              <small className="text-xs text-muted">{membre.detail}</small>
            </div>
            <span
              className={`rounded-lg px-[9px] py-1 text-[11px] font-bold ${
                membre.statut === "Actif"
                  ? "bg-green-soft text-green"
                  : "bg-[#EEF1F4] text-[#7E8C97]"
              }`}
            >
              {membre.statut}
            </span>
            {membre.nom === "Hawa Diallo" ? (
              <Link
                href="/espace-assistant"
                className="rounded-[9px] border-[1.5px] border-line bg-white px-3 py-1.5 text-[11.5px] font-bold text-blue transition-colors hover:bg-bg"
              >
                Voir l&apos;espace
              </Link>
            ) : (
              <button
                type="button"
                disabled
                title="Comptes multiples : disponible dans une phase ultérieure"
                className="cursor-not-allowed rounded-[9px] border-[1.5px] border-line bg-white px-3 py-1.5 text-[11.5px] font-bold text-blue opacity-50"
              >
                {membre.statut === "Actif" ? "Permissions" : "Réactiver"}
              </button>
            )}
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-line bg-white p-5">
        <h3 className="mb-1 text-[15px] font-extrabold">Permissions — Hawa Diallo</h3>
        {PERMISSIONS.map((permission) => (
          <div
            key={permission.cle}
            className="flex items-center justify-between gap-[14px] border-b border-line py-[15px]"
          >
            <div>
              <b className="block text-[13.5px] font-bold">{permission.titre}</b>
              <small className="text-xs text-muted">{permission.detail}</small>
            </div>
            <Interrupteur
              actif={permissions[permission.cle]}
              onChange={(v) => basculer(permission.cle, v)}
              label={permission.titre}
            />
          </div>
        ))}
        <div className="flex items-center justify-between gap-[14px] border-b border-line py-[15px]">
          <div>
            <b className="block text-[13.5px] font-bold">🔒 Voir les dossiers médicaux</b>
            <small className="text-xs text-muted">Données de santé — réservé au médecin</small>
          </div>
          <span className="rounded-lg bg-[#FBE9E7] px-[9px] py-1 text-[11px] font-bold text-red">
            Interdit
          </span>
        </div>
        <div className="flex items-center justify-between gap-[14px] py-[15px]">
          <div>
            <b className="block text-[13.5px] font-bold">🔒 Voir les paiements et revenus</b>
            <small className="text-xs text-muted">Données financières — réservé au médecin</small>
          </div>
          <span className="rounded-lg bg-[#FBE9E7] px-[9px] py-1 text-[11px] font-bold text-red">
            Interdit
          </span>
        </div>
        <div className="mt-1.5 flex items-start gap-[9px] rounded-xl border border-[#F2D9B6] bg-[#FFF5E9] px-[14px] py-3 text-[12.5px] font-semibold leading-relaxed text-[#8A5A1B]">
          <span aria-hidden>🔒</span>
          <div>
            Les <b>dossiers médicaux</b> et les <b>données financières</b> ne sont jamais
            accessibles aux assistant(e)s, quelles que soient les permissions accordées. Cette
            barrière est intégrée à la plateforme.
          </div>
        </div>
      </div>
    </MedecinShell>
  );
}
