"use client";

import Link from "next/link";
import { useState } from "react";
import AssistantShell from "@/components/assistant/AssistantShell";
import { versISO } from "@/lib/dates";
import { majStatutRdv, useAgenda, useContextePro } from "@/lib/pro";
import EnTeteMobile from "@/components/mobile/EnTeteMobile";

/*
 * Tableau de bord assistant(e) — reproduit l'écran « asst-dash » de la
 * maquette web : bandeau d'accès limité, statistiques, demandes à
 * confirmer (vrais RDV en_attente, gérés selon la permission), raccourcis.
 */
export default function TableauDeBordAssistant() {
  const { medecin, permissions, utilisateur } = useContextePro();
  const { creneauxJour, rdvs, recharger } = useAgenda(medecin?.id);
  const [erreur, setErreur] = useState("");

  const prenomAssistant = utilisateur?.prenom ?? "";
  const nomMedecin = medecin
    ? `${medecin.civilite} ${medecin.prenom.charAt(0)}. ${medecin.nom}`
    : "votre médecin";

  const aujourdhui = versISO(new Date());
  const rdvJour = creneauxJour(aujourdhui).filter((c) => c.statut === "reserve");
  const demandes = rdvs
    .filter((r) => r.statut === "en_attente" && r.date >= aujourdhui)
    .map((r) => ({
      id: r.id,
      heure: r.heure,
      patient: r.beneficiaire,
      detail: `Demande pour le ${r.date}${r.motif ? ` · ${r.motif}` : ""}`,
    }));

  async function traiterDemande(id: string) {
    if (!permissions.confirmerAnnuler) {
      setErreur(
        "⛔ Action refusée : la permission « Confirmer / annuler les rendez-vous » ne vous a pas été accordée par le médecin."
      );
      return;
    }
    setErreur("");
    await majStatutRdv(id, "confirme");
    recharger();
  }

  return (
    <AssistantShell>
      {/* ===== Version mobile (écran « m-asst-dash » de la maquette mobile) ===== */}
      <div className="md:hidden">
        <EnTeteMobile variante="marque" />
        <div className="appbar">
          <h3 style={{ paddingLeft: 4 }}>Bonjour {prenomAssistant} 👋</h3>
        </div>
        <div className="pad">
          <div className="abannerm">
            <span aria-hidden>🔒</span>
            <div>
              Espace assistant(e) · vous assistez <b>{nomMedecin}</b>. Accès limité aux RDV et à
              la communication.
            </div>
          </div>
          <div className="statcards inpad">
            <div className="sc b1">
              <b>{rdvJour.length}</b>
              <small>RDV aujourd&apos;hui</small>
            </div>
            <div className="sc b2">
              <b>{demandes.length}</b>
              <small>À confirmer</small>
            </div>
            <div className="sc b3">
              <b>5</b>
              <small>Messages</small>
            </div>
          </div>
          {erreur && (
            <div className="noteboxm" style={{ marginTop: 12, background: "var(--red-soft)", borderColor: "#F3C9C2", color: "var(--red)" }}>
              <div>{erreur}</div>
            </div>
          )}
          <div className="card2" style={{ marginTop: 12 }}>
            <h4>Demandes à confirmer</h4>
            {demandes.map((demande) => (
              <div key={demande.id} className="aptm">
                <div className="tm">{demande.heure}</div>
                <div className="meta">
                  <b>{demande.patient}</b>
                  <small>{demande.detail}</small>
                </div>
                <div className="acts">
                  <button
                    type="button"
                    className="btnm"
                    style={permissions.confirmerAnnuler ? undefined : { opacity: 0.5 }}
                    onClick={() => traiterDemande(demande.id)}
                  >
                    Confirmer
                  </button>
                  <button
                    type="button"
                    className="btnm dg"
                    style={permissions.confirmerAnnuler ? undefined : { opacity: 0.5 }}
                    onClick={() => traiterDemande(demande.id)}
                  >
                    Refuser
                  </button>
                </div>
              </div>
            ))}
            {demandes.length === 0 && (
              <p className="muted" style={{ fontSize: 13 }}>
                Toutes les demandes ont été traitées. 👍
              </p>
            )}
          </div>
          <div className="card2">
            <h4>Prochains rendez-vous</h4>
            {rdvJour.slice(0, 4).map((creneau) => (
              <div key={creneau.heure} className="aptm">
                <div className="tm">{creneau.heure}</div>
                <div className="meta">
                  <b>{creneau.patient}</b>
                  <small>{creneau.motif} · confirmé</small>
                </div>
                <div className="acts">
                  <Link href="/espace-assistant/rendez-vous" className="btnm gh">
                    Gérer
                  </Link>
                </div>
              </div>
            ))}
            {rdvJour.length === 0 && (
              <p className="muted" style={{ fontSize: 13 }}>
                Aucun rendez-vous aujourd&apos;hui.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* ===== Version web (inchangée) ===== */}
      <div className="hidden md:block">
      <div className="mb-5">
        <h2 className="text-[21px] font-extrabold tracking-[-0.3px]">Bonjour {prenomAssistant} 👋</h2>
        <small className="text-[13px] text-muted">
          Espace assistant(e) · vous assistez {nomMedecin}
        </small>
      </div>

      <div className="mb-[18px] flex items-start gap-[9px] rounded-xl border border-[#BFE0EF] bg-teal-soft px-[14px] py-3 text-[12.5px] font-semibold leading-relaxed text-blue">
        <span aria-hidden>🔒</span>
        <div>
          Vous gérez les <b>rendez-vous</b>, les <b>créneaux</b> et la <b>communication</b> selon
          les permissions accordées par le médecin. Les dossiers médicaux et les revenus ne vous
          sont pas visibles.
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-2xl border border-line bg-white p-[18px]">
          <span className="text-lg" aria-hidden>
            📅
          </span>
          <b className="mt-2 block text-[26px] font-extrabold tracking-[-0.6px] text-blue">
            {rdvJour.length}
          </b>
          <small className="text-xs font-semibold text-muted">RDV aujourd’hui</small>
        </div>
        <div className="rounded-2xl border border-line bg-white p-[18px]">
          <span className="text-lg" aria-hidden>
            ⏳
          </span>
          <b className="mt-2 block text-[26px] font-extrabold tracking-[-0.6px] text-amber">
            {demandes.length}
          </b>
          <small className="text-xs font-semibold text-muted">À confirmer</small>
        </div>
        <div className="rounded-2xl border border-line bg-white p-[18px]">
          <span className="text-lg" aria-hidden>
            💬
          </span>
          <b className="mt-2 block text-[26px] font-extrabold tracking-[-0.6px] text-green">5</b>
          <small className="text-xs font-semibold text-muted">Messages non lus</small>
        </div>
        <div className="rounded-2xl border border-line bg-white p-[18px]">
          <span className="text-lg" aria-hidden>
            ✅
          </span>
          <b className="mt-2 block text-[26px] font-extrabold tracking-[-0.6px] text-blue">12</b>
          <small className="text-xs font-semibold text-muted">Confirmés cette semaine</small>
        </div>
      </div>

      {erreur && (
        <div className="mb-4 rounded-xl border border-[#F3C9C2] bg-red-soft px-[14px] py-3 text-[12.5px] font-bold text-red">
          {erreur}
        </div>
      )}

      <div className="mb-4 rounded-2xl border border-line bg-white p-5">
        <h3 className="mb-[14px] text-[15px] font-extrabold">Demandes à confirmer</h3>
        {demandes.map((demande) => (
          <div
            key={demande.id}
            className="mb-[10px] flex flex-wrap items-center gap-3 rounded-xl border border-line p-[13px] last:mb-0"
          >
            <span className="flex-none rounded-[9px] bg-teal-soft px-[11px] py-[9px] text-[13px] font-extrabold text-blue">
              {demande.heure}
            </span>
            <span className="min-w-0 flex-1">
              <b className="block text-[13.5px]">{demande.patient}</b>
              <small className="text-xs text-muted">{demande.detail}</small>
            </span>
            <span className="flex gap-2">
              <button
                type="button"
                onClick={() => traiterDemande(demande.id)}
                className={`rounded-[9px] bg-teal px-[14px] py-2 text-[12.5px] font-bold text-white transition-colors hover:bg-[#2790bc] ${
                  permissions.confirmerAnnuler ? "" : "opacity-50"
                }`}
              >
                Confirmer
              </button>
              <button
                type="button"
                onClick={() => traiterDemande(demande.id)}
                className={`rounded-[9px] border-[1.5px] border-[#F3C9C2] bg-white px-[14px] py-2 text-[12.5px] font-bold text-red transition-colors hover:bg-red-soft ${
                  permissions.confirmerAnnuler ? "" : "opacity-50"
                }`}
              >
                Refuser
              </button>
            </span>
          </div>
        ))}
        {demandes.length === 0 && (
          <p className="text-[13px] text-muted">Toutes les demandes ont été traitées. 👍</p>
        )}
      </div>

      <div className="rounded-2xl border border-line bg-white p-5">
        <h3 className="mb-[14px] text-[15px] font-extrabold">Raccourcis</h3>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/espace-assistant/rendez-vous"
            className="rounded-full border border-[#CDE6F2] bg-teal-soft px-[14px] py-2 text-xs font-bold text-blue"
          >
            📅 Gérer les rendez-vous
          </Link>
          <Link
            href="/espace-assistant/creneaux"
            className="rounded-full border border-[#CDE6F2] bg-teal-soft px-[14px] py-2 text-xs font-bold text-blue"
          >
            🕐 Ouvrir/fermer des créneaux
          </Link>
          <Link
            href="/espace-assistant/messages"
            className="rounded-full border border-[#CDE6F2] bg-teal-soft px-[14px] py-2 text-xs font-bold text-blue"
          >
            💬 Répondre aux messages
          </Link>
        </div>
      </div>
      </div>
    </AssistantShell>
  );
}
