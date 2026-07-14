"use client";

import { useState } from "react";
import MedecinShell from "@/components/medecin/MedecinShell";
import Interrupteur from "@/components/patient/Interrupteur";
import AppBarMobile from "@/components/mobile/AppBarMobile";
import {
  majPermissionAssistant,
  useContextePro,
  useEquipe,
  type PermissionsAssistante,
} from "@/lib/pro";

/*
 * Mes assistant(e)s — reproduit l'écran « med-equipe » de la maquette web :
 * comptes de l'équipe (table `assistants`) et grille de permissions
 * (spec C.4.3), modifiées en base et appliquées par la RLS.
 * Dossiers médicaux et finances restent toujours interdits.
 */

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

const GRADIENTS = [
  "linear-gradient(135deg,#2E9CCA,#15506B)",
  "linear-gradient(135deg,#6C5CE7,#341F97)",
  "linear-gradient(135deg,#16A085,#0E6655)",
];

export default function EquipeMedecin() {
  const { medecin } = useContextePro();
  const { assistants, recharger } = useEquipe(medecin?.id);
  const [selectionne, setSelectionne] = useState<string | null>(null);

  const assistantActif =
    assistants.find((a) => a.id === selectionne) ?? assistants[0] ?? null;

  async function basculer(cle: keyof PermissionsAssistante, valeur: boolean) {
    if (!assistantActif) return;
    await majPermissionAssistant(assistantActif.id, cle, valeur);
    recharger();
  }

  const nomComplet = (a: { prenom: string; nom: string }) => `${a.prenom} ${a.nom}`.trim();
  const initiales = (a: { prenom: string; nom: string }) =>
    `${a.prenom.charAt(0)}${a.nom.charAt(0)}`.toUpperCase() || "?";

  return (
    <MedecinShell>
      {/* ===== Version mobile (écran « m-med-equipe » de la maquette mobile) ===== */}
      <div className="md:hidden">
        <AppBarMobile retour="/espace-medecin/compte" titre="Mes assistant(e)s" />
        <div className="pad">
          <p className="muted" style={{ fontSize: 11.5, margin: "-2px 0 12px", lineHeight: 1.5 }}>
            Choisissez précisément ce que chaque assistant(e) peut faire.
          </p>
          <div className="card2">
            <h4>Comptes de l&apos;équipe</h4>
            {assistants.map((membre, i) => (
              <button
                key={membre.id}
                type="button"
                className="asstrowm"
                style={{ width: "100%", textAlign: "left", background: "none", border: "none" }}
                onClick={() => setSelectionne(membre.id)}
              >
                <span className="av" aria-hidden style={{ background: GRADIENTS[i % GRADIENTS.length] }}>
                  {initiales(membre)}
                </span>
                <span className="meta">
                  <b>{nomComplet(membre)}</b>
                  <small>{membre.email}</small>
                </span>
                <span className="pill ok">Actif</span>
              </button>
            ))}
            {assistants.length === 0 && (
              <p className="muted" style={{ fontSize: 13 }}>
                Aucun(e) assistant(e) rattaché(e) pour le moment.
              </p>
            )}
          </div>
          {assistantActif && (
            <div className="card2" style={{ marginTop: 12 }}>
              <h4>Permissions — {nomComplet(assistantActif)}</h4>
              {PERMISSIONS.map((permission) => (
                <div key={permission.cle} className="setrow">
                  <div>
                    <b>{permission.titre}</b>
                    <small>{permission.detail}</small>
                  </div>
                  <Interrupteur
                    actif={assistantActif.permissions[permission.cle]}
                    onChange={(v) => basculer(permission.cle, v)}
                    label={permission.titre}
                  />
                </div>
              ))}
              <div className="setrow">
                <div>
                  <b>🔒 Dossiers médicaux</b>
                </div>
                <span className="pill bad">Interdit</span>
              </div>
              <div className="setrow">
                <div>
                  <b>🔒 Paiements et revenus</b>
                </div>
                <span className="pill bad">Interdit</span>
              </div>
              <div className="noteboxm">
                <span aria-hidden>🔒</span>
                <div>
                  Les dossiers médicaux et les données financières ne sont <b>jamais</b> accessibles
                  aux assistant(e)s.
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ===== Version web ===== */}
      <div className="hidden md:block">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-[21px] font-extrabold tracking-[-0.3px]">Mes assistant(e)s</h2>
            <small className="text-[13px] text-muted">
              Définissez précisément les permissions de chaque assistant(e)
            </small>
          </div>
          <button
            type="button"
            disabled
            title="Création de compte assistant : disponible dans une phase ultérieure"
            className="cursor-not-allowed rounded-[9px] bg-teal px-[14px] py-2 text-[12.5px] font-bold text-white opacity-50"
          >
            + Ajouter un(e) assistant(e)
          </button>
        </div>

        <div className="mb-4 rounded-2xl border border-line bg-white p-5">
          <h3 className="mb-1 text-[15px] font-extrabold">Comptes de l’équipe</h3>
          {assistants.map((membre, i) => (
            <div
              key={membre.id}
              className="flex flex-wrap items-center gap-[13px] border-b border-line py-[14px] last:border-b-0"
            >
              <span
                aria-hidden
                className="grid h-[42px] w-[42px] flex-none place-items-center rounded-xl text-sm font-extrabold text-white"
                style={{ background: GRADIENTS[i % GRADIENTS.length] }}
              >
                {initiales(membre)}
              </span>
              <div className="flex-1">
                <b className="block text-sm font-extrabold">{nomComplet(membre)}</b>
                <small className="text-xs text-muted">{membre.email}</small>
              </div>
              <span className="rounded-lg bg-green-soft px-[9px] py-1 text-[11px] font-bold text-green">
                Actif
              </span>
              <button
                type="button"
                onClick={() => setSelectionne(membre.id)}
                className={`rounded-[9px] border-[1.5px] px-3 py-1.5 text-[11.5px] font-bold transition-colors ${
                  assistantActif?.id === membre.id
                    ? "border-blue bg-blue text-white"
                    : "border-line bg-white text-blue hover:bg-bg"
                }`}
              >
                Permissions
              </button>
            </div>
          ))}
          {assistants.length === 0 && (
            <p className="py-3 text-[13px] text-muted">
              Aucun(e) assistant(e) rattaché(e) pour le moment.
            </p>
          )}
        </div>

        {assistantActif && (
          <div className="rounded-2xl border border-line bg-white p-5">
            <h3 className="mb-1 text-[15px] font-extrabold">
              Permissions — {nomComplet(assistantActif)}
            </h3>
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
                  actif={assistantActif.permissions[permission.cle]}
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
                barrière est appliquée par la base de données (RLS).
              </div>
            </div>
          </div>
        )}
      </div>
    </MedecinShell>
  );
}
