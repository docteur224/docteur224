"use client";

import Link from "next/link";
import MedecinShell from "@/components/medecin/MedecinShell";
import { capitaliser, formatDateLongue, versISO } from "@/lib/dates";
import { formatNote } from "@/lib/format";
import { majStatutRdv, useAgenda, useContextePro } from "@/lib/pro";
import EnTeteMobile from "@/components/mobile/EnTeteMobile";

/*
 * Tableau de bord médecin — reproduit l'écran « medecin » de la maquette web :
 * salutation, 4 cartes de statistiques, demandes à confirmer, agenda du jour.
 * Les demandes sont les vrais rendez-vous « en_attente » ; confirmer/refuser
 * écrit le nouveau statut dans la table `rendez_vous`.
 */
export default function TableauDeBordMedecin() {
  const { medecin, utilisateur } = useContextePro();
  const { creneauxJour, rdvs, recharger } = useAgenda(medecin?.id);

  const medecinConnecte = medecin ?? {
    civilite: "Dr",
    nom: utilisateur?.nom ?? "",
    note: 0,
  };

  const aujourdhui = versISO(new Date());
  const agendaJour = creneauxJour(aujourdhui).filter((c) => c.statut === "reserve");
  const demandes = rdvs
    .filter((r) => r.statut === "en_attente" && r.date >= aujourdhui)
    .map((r) => ({
      id: r.id,
      heure: r.heure,
      patient: r.beneficiaire,
      detail: r.motif || "Consultation",
    }));

  async function traiterDemande(id: string, decision: "confirme" | "annule") {
    await majStatutRdv(id, decision);
    recharger();
  }

  return (
    <MedecinShell>
      {/* ===== Version mobile (écran « medecin » de la maquette mobile) ===== */}
      <div className="md:hidden">
        <EnTeteMobile variante="marque" />
        <div className="greet">
          <b>
            Bonjour, {medecinConnecte.civilite} {medecinConnecte.nom} 👋
          </b>
          <br />
          <small>
            {capitaliser(formatDateLongue(aujourdhui))} · {agendaJour.length} rendez-vous
            aujourd&apos;hui
          </small>
        </div>
        <div className="statcards">
          <div className="sc b1">
            <b>{agendaJour.length}</b>
            <small>RDV aujourd&apos;hui</small>
          </div>
          <div className="sc b2">
            <b>{demandes.length}</b>
            <small>À confirmer</small>
          </div>
          <div className="sc b3">
            <b>96%</b>
            <small>Taux de présence</small>
          </div>
        </div>
        <div className="pad" style={{ paddingTop: 18 }}>
          <div className="section-t" style={{ marginTop: 0 }}>
            Demandes à confirmer
          </div>
          {demandes.map((demande) => (
            <div key={demande.id} className="agitem">
              <div className="t">{demande.heure}</div>
              <div className="who">
                <b>{demande.patient}</b>
                <small>{demande.detail}</small>
              </div>
              <div className="mini">
                <button
                  type="button"
                  className="no"
                  aria-label={`Refuser la demande de ${demande.patient}`}
                  onClick={() => traiterDemande(demande.id, "annule")}
                >
                  ✕
                </button>
                <button
                  type="button"
                  className="yes"
                  aria-label={`Confirmer la demande de ${demande.patient}`}
                  onClick={() => traiterDemande(demande.id, "confirme")}
                >
                  ✓
                </button>
              </div>
            </div>
          ))}
          {demandes.length === 0 && (
            <p className="muted" style={{ fontSize: 13 }}>
              Toutes les demandes ont été traitées. 👍
            </p>
          )}

          <div className="section-t">Agenda du jour</div>
          {agendaJour.map((creneau) => (
            <div key={creneau.heure} className="agitem">
              <div className="t">{creneau.heure}</div>
              <div className="who">
                <b>{creneau.patient}</b>
                <small>{creneau.motif}</small>
              </div>
              <span className="badge ok" style={{ marginLeft: "auto" }}>
                Confirmé
              </span>
            </div>
          ))}
          {agendaJour.length === 0 && (
            <p className="muted" style={{ fontSize: 13 }}>
              Aucun rendez-vous aujourd&apos;hui.
            </p>
          )}
        </div>
      </div>

      {/* ===== Version web (inchangée) ===== */}
      <div className="hidden md:block">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-[21px] font-extrabold tracking-[-0.3px]">
            Bonjour, {medecinConnecte.civilite} {medecinConnecte.nom} 👋
          </h2>
          <small className="text-[13px] text-muted">
            {capitaliser(formatDateLongue(aujourdhui))} · {agendaJour.length} rendez-vous
            aujourd’hui
          </small>
        </div>
        <div className="flex gap-2">
          <Link
            href="/espace-medecin/nouveau-rdv"
            className="rounded-[9px] bg-teal px-[14px] py-2 text-[12.5px] font-bold text-white transition-colors hover:bg-[#2790bc]"
          >
            + Nouveau RDV
          </Link>
          <Link
            href="/espace-medecin/disponibilites"
            className="rounded-[9px] border-[1.5px] border-line bg-white px-[14px] py-2 text-[12.5px] font-bold text-blue transition-colors hover:bg-bg"
          >
            + Ajouter un créneau
          </Link>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-2xl border border-line bg-white p-[18px]">
          <span className="text-lg" aria-hidden>
            📅
          </span>
          <b className="mt-2 block text-[26px] font-extrabold tracking-[-0.6px] text-blue">
            {agendaJour.length}
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
            ✅
          </span>
          <b className="mt-2 block text-[26px] font-extrabold tracking-[-0.6px] text-green">96%</b>
          <small className="text-xs font-semibold text-muted">Taux de présence</small>
        </div>
        <div className="rounded-2xl border border-line bg-white p-[18px]">
          <span className="text-lg" aria-hidden>
            ⭐
          </span>
          <b className="mt-2 block text-[26px] font-extrabold tracking-[-0.6px] text-teal">
            {formatNote(medecinConnecte.note)}
          </b>
          <small className="text-xs font-semibold text-muted">Note moyenne</small>
        </div>
      </div>

      {/* Demandes à confirmer (données de démonstration) */}
      <div className="mb-[18px] overflow-hidden rounded-2xl border border-line bg-white">
        <div className="flex items-center justify-between border-b border-line px-5 py-4 text-sm font-extrabold">
          Demandes à confirmer
          <span className="rounded-[20px] bg-amber-soft px-[10px] py-1 text-[11.5px] font-bold text-amber">
            {demandes.length} en attente
          </span>
        </div>
        {demandes.map((demande) => (
          <div
            key={demande.id}
            className="grid grid-cols-[62px_1fr_auto] items-center gap-4 border-b border-line px-5 py-[14px] last:border-b-0"
          >
            <div className="text-sm font-extrabold text-blue">{demande.heure}</div>
            <div>
              <b className="block text-[13.5px] font-extrabold">{demande.patient}</b>
              <small className="text-xs text-muted">{demande.detail}</small>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => traiterDemande(demande.id, "annule")}
                aria-label={`Refuser la demande de ${demande.patient}`}
                className="grid h-9 w-9 place-items-center rounded-[10px] bg-red-soft text-[15px] text-red"
              >
                ✕
              </button>
              <button
                type="button"
                onClick={() => traiterDemande(demande.id, "confirme")}
                aria-label={`Confirmer la demande de ${demande.patient}`}
                className="grid h-9 w-9 place-items-center rounded-[10px] bg-green-soft text-[15px] text-green"
              >
                ✓
              </button>
            </div>
          </div>
        ))}
        {demandes.length === 0 && (
          <p className="px-5 py-[14px] text-[13px] text-muted">
            Toutes les demandes ont été traitées. 👍
          </p>
        )}
      </div>

      {/* Agenda du jour */}
      <div className="overflow-hidden rounded-2xl border border-line bg-white">
        <div className="border-b border-line px-5 py-4 text-sm font-extrabold">Agenda du jour</div>
        {agendaJour.map((creneau) => (
          <div
            key={creneau.heure}
            className="grid grid-cols-[62px_1fr_auto] items-center gap-4 border-b border-line px-5 py-[14px] last:border-b-0"
          >
            <div className="text-sm font-extrabold text-blue">{creneau.heure}</div>
            <div>
              <b className="block text-[13.5px] font-extrabold">{creneau.patient}</b>
              <small className="text-xs text-muted">{creneau.motif}</small>
            </div>
            <span className="rounded-lg bg-green-soft px-[10px] py-[5px] text-[10.5px] font-extrabold uppercase tracking-[.03em] text-green">
              Confirmé
            </span>
          </div>
        ))}
        {agendaJour.length === 0 && (
          <p className="px-5 py-[14px] text-[13px] text-muted">
            Aucun rendez-vous aujourd’hui.
          </p>
        )}
      </div>
      </div>
    </MedecinShell>
  );
}
