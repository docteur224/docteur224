"use client";

import Link from "next/link";
import AssistantShell from "@/components/assistant/AssistantShell";
import { usePermissionsAssistante, type PermissionsAssistante } from "@/lib/mock-medecin";

/*
 * Mon compte (assistant(e)) — reproduit l'écran « asst-compte » de la
 * maquette web : profil et permissions accordées par le médecin, en LECTURE
 * SEULE. Les pastilles reflètent en direct la grille réglée par le médecin.
 */

const LIGNES_PERMISSIONS: { cle: keyof PermissionsAssistante; titre: string }[] = [
  { cle: "voirAgenda", titre: "Voir l'agenda" },
  { cle: "confirmerAnnuler", titre: "Confirmer / annuler les rendez-vous" },
  { cle: "reprogrammer", titre: "Reprogrammer un rendez-vous" },
  { cle: "creerRdv", titre: "Créer un rendez-vous pour un patient" },
  { cle: "messagerie", titre: "Messagerie patients" },
  { cle: "gererCreneaux", titre: "Ouvrir / fermer des créneaux" },
];

export default function CompteAssistant() {
  const permissions = usePermissionsAssistante();

  return (
    <AssistantShell>
      {/* ===== Version mobile (écran « m-asst-compte » de la maquette mobile) ===== */}
      <div className="md:hidden">
        <div className="appbar">
          <h3 style={{ paddingLeft: 4 }}>Mon compte</h3>
        </div>
        <div className="pad">
          <div className="acctop">
            <span
              className="av"
              aria-hidden
              style={{ background: "linear-gradient(135deg,#2E9CCA,#15506B)" }}
            >
              HD
            </span>
            <div>
              <b>Hawa Diallo</b>
              <small>Assistante · Dr A. Barry</small>
            </div>
          </div>
          <div className="menu">
            <Link href="/espace-assistant/creneaux" className="mrow">
              <span className="mi" aria-hidden>
                🕐
              </span>
              <span>
                <b>Créneaux &amp; dispos</b>
                <small>Ouvrir/fermer les créneaux</small>
              </span>
              <span className="ch" aria-hidden>
                ›
              </span>
            </Link>
            <Link href="/espace-assistant/patients" className="mrow">
              <span className="mi" aria-hidden>
                👥
              </span>
              <span>
                <b>Patients</b>
                <small>Coordonnées pour les RDV</small>
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
            <h4>Mes permissions</h4>
            <p className="muted" style={{ fontSize: 11, margin: "-4px 0 10px" }}>
              Définies par le médecin · lecture seule.
            </p>
            {LIGNES_PERMISSIONS.map((ligne) => (
              <div key={ligne.cle} className="setrow">
                <div>
                  <b>{ligne.titre}</b>
                </div>
                {permissions[ligne.cle] ? (
                  <span className="pill ok">Autorisé</span>
                ) : (
                  <span className="pill bad">Interdit</span>
                )}
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
                Les dossiers médicaux et les données financières restent réservés au médecin.
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ===== Version web (inchangée) ===== */}
      <div className="hidden md:block">
      <div className="mb-5">
        <h2 className="text-[21px] font-extrabold tracking-[-0.3px]">Mon compte</h2>
        <small className="text-[13px] text-muted">
          Vos informations et les permissions accordées par le médecin
        </small>
      </div>

      <div className="mb-4 rounded-2xl border border-line bg-white p-5">
        <h3 className="mb-1 text-[15px] font-extrabold">Mon profil</h3>
        <div className="flex items-center justify-between gap-[14px] border-b border-line py-[15px]">
          <div>
            <b className="block text-[13.5px] font-bold">Nom complet</b>
            <small className="text-xs text-muted">Hawa Diallo</small>
          </div>
        </div>
        <div className="flex items-center justify-between gap-[14px] border-b border-line py-[15px]">
          <div>
            <b className="block text-[13.5px] font-bold">Rôle</b>
            <small className="text-xs text-muted">Secrétaire / Assistante</small>
          </div>
        </div>
        <div className="flex items-center justify-between gap-[14px] border-b border-line py-[15px]">
          <div>
            <b className="block text-[13.5px] font-bold">Téléphone</b>
            <small className="text-xs text-muted">+224 622 33 44 55</small>
          </div>
        </div>
        <div className="flex items-center justify-between gap-[14px] border-b border-line py-[15px]">
          <div>
            <b className="block text-[13.5px] font-bold">E-mail</b>
            <small className="text-xs text-muted">hawa.diallo@docteur224.gn</small>
          </div>
        </div>
        <div className="flex items-center justify-between gap-[14px] py-[15px]">
          <div>
            <b className="block text-[13.5px] font-bold">Rattachée à</b>
            <small className="text-xs text-muted">Dr Aïssata Barry · Pédiatrie</small>
          </div>
          <span className="rounded-lg bg-green-soft px-[9px] py-1 text-[11px] font-bold text-green">
            Actif
          </span>
        </div>
      </div>

      <div className="rounded-2xl border border-line bg-white p-5">
        <h3 className="mb-2 text-[15px] font-extrabold">Mes permissions</h3>
        <p className="mb-3 text-[12.5px] text-muted">
          Définies par le médecin. Vous ne pouvez pas les modifier vous-même.
        </p>
        {LIGNES_PERMISSIONS.map((ligne) => (
          <div
            key={ligne.cle}
            className="flex items-center justify-between gap-[14px] border-b border-line py-[15px]"
          >
            <b className="text-[13.5px] font-bold">{ligne.titre}</b>
            {permissions[ligne.cle] ? (
              <span className="rounded-lg bg-green-soft px-[9px] py-1 text-[11px] font-bold text-green">
                Autorisé
              </span>
            ) : (
              <span className="rounded-lg bg-[#FBE9E7] px-[9px] py-1 text-[11px] font-bold text-red">
                Interdit
              </span>
            )}
          </div>
        ))}
        <div className="flex items-center justify-between gap-[14px] border-b border-line py-[15px]">
          <b className="text-[13.5px] font-bold">🔒 Voir les dossiers médicaux</b>
          <span className="rounded-lg bg-[#FBE9E7] px-[9px] py-1 text-[11px] font-bold text-red">
            Interdit
          </span>
        </div>
        <div className="flex items-center justify-between gap-[14px] py-[15px]">
          <b className="text-[13.5px] font-bold">🔒 Voir les paiements et revenus</b>
          <span className="rounded-lg bg-[#FBE9E7] px-[9px] py-1 text-[11px] font-bold text-red">
            Interdit
          </span>
        </div>
        <div className="mt-1.5 flex items-start gap-[9px] rounded-xl border border-[#F2D9B6] bg-[#FFF5E9] px-[14px] py-3 text-[12.5px] font-semibold leading-relaxed text-[#8A5A1B]">
          <span aria-hidden>🔒</span>
          <div>
            Les dossiers médicaux et les données financières restent réservés au médecin, quelles
            que soient les permissions accordées.
          </div>
        </div>
      </div>
      </div>
    </AssistantShell>
  );
}
