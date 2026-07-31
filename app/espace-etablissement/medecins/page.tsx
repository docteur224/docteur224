"use client";

import { useState } from "react";
import EtablissementShell from "@/components/etablissement/EtablissementShell";
import {
  inviterMedecin,
  rechercherMedecinsInvitables,
  useEtablissementConnecte,
  useInvitations,
  useMedecinsRattaches,
} from "@/lib/etablissement";
import EnTeteMobile from "@/components/mobile/EnTeteMobile";
import Pagination, { usePagination } from "@/components/site/Pagination";

/*
 * Médecins — reproduit l'écran « etab-medecins » de la maquette web :
 * médecins rattachés (medecins.etablissement_id), invitation réelle d'un
 * médecin inscrit sur la plateforme, suivi du cycle envoyée → acceptée /
 * refusée (spec C.6). Le médecin répond depuis son propre compte
 * (fonction repondre_invitation, sécurisée côté base).
 */

const LIBELLES_STATUT = {
  envoyee: { texte: "En attente", classes: "bg-amber-soft text-amber" },
  acceptee: { texte: "Acceptée", classes: "bg-green-soft text-green" },
  refusee: { texte: "Refusée", classes: "bg-[#FBE9E7] text-red" },
} as const;

export default function MedecinsEtablissement() {
  const { etablissement } = useEtablissementConnecte();
  const { rattaches } = useMedecinsRattaches(etablissement?.id);
  const pagi = usePagination(rattaches, 12);
  const { invitations, recharger } = useInvitations(etablissement?.id);
  const [recherche, setRecherche] = useState("");
  const [resultats, setResultats] = useState<{ id: string; nom: string; specialite: string }[]>([]);
  const [message, setMessage] = useState("");

  async function chercher(e: React.FormEvent) {
    e.preventDefault();
    setMessage("");
    setResultats(await rechercherMedecinsInvitables(recherche));
  }

  async function inviter(medecinId: string, nom: string) {
    if (!etablissement) return;
    const res = await inviterMedecin(etablissement.id, medecinId);
    setMessage(res.erreur ? `⚠️ ${res.erreur}` : `✓ Invitation envoyée à ${nom}.`);
    if (!res.erreur) {
      setResultats([]);
      setRecherche("");
      recharger();
    }
  }

  const champ =
    "w-full rounded-[11px] border border-line bg-white px-[13px] py-3 text-[13.5px] outline-none focus:border-teal";

  const listeResultats = resultats.length > 0 && (
    <div className="mt-2 flex flex-col gap-2">
      {resultats.map((m) => (
        <div
          key={m.id}
          className="flex items-center gap-3 rounded-[13px] border-[1.5px] border-line bg-white p-3"
        >
          <span className="flex-1">
            <b className="block text-[13.5px]">{m.nom}</b>
            <small className="text-[11.5px] text-muted">{m.specialite}</small>
          </span>
          <button
            type="button"
            onClick={() => inviter(m.id, m.nom)}
            className="rounded-[9px] bg-teal px-3 py-1.5 text-[11.5px] font-bold text-white"
          >
            Inviter
          </button>
        </div>
      ))}
    </div>
  );

  const blocInvitation = (
    <>
      <form onSubmit={chercher} className="grid gap-3 sm:grid-cols-[1fr_auto]">
        <input
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
          placeholder="Nom ou spécialité d'un médecin inscrit (sans établissement)"
          aria-label="Rechercher un médecin"
          className={champ}
        />
        <button
          type="submit"
          className="rounded-[11px] bg-teal px-[18px] py-3 text-[12.5px] font-bold text-white transition-colors hover:bg-[#2790bc]"
        >
          🔍 Rechercher
        </button>
      </form>
      {listeResultats}
      {message && <p className="mt-2 text-[12.5px] font-bold text-green">{message}</p>}
    </>
  );

  const ligneInvitation = (invitation: (typeof invitations)[number]) => {
    const statut = LIBELLES_STATUT[invitation.statut];
    return (
      <div
        key={invitation.id}
        className="flex flex-wrap items-center gap-[13px] border-b border-line py-[14px] last:border-b-0"
      >
        <span
          aria-hidden
          className="grid h-[42px] w-[42px] flex-none place-items-center rounded-xl text-sm font-extrabold text-white"
          style={{ background: invitation.gradient }}
        >
          {invitation.initiales}
        </span>
        <div className="flex-1">
          <b className="block text-sm font-extrabold">{invitation.nom}</b>
          <small className="text-xs text-muted">
            {invitation.specialite} · envoyée le {invitation.envoyeeLe}
          </small>
        </div>
        <span className={`rounded-lg px-[9px] py-1 text-[11px] font-bold ${statut.classes}`}>
          {statut.texte}
        </span>
      </div>
    );
  };

  return (
    <EtablissementShell>
      {/* ===== Version mobile ===== */}
      <div className="md:hidden">
        <EnTeteMobile variante="marque" />
        <div className="appbar">
          <h3 style={{ paddingLeft: 4 }}>Médecins</h3>
        </div>
        <div className="pad">
          <div className="abannerm">
            <span aria-hidden>ℹ️</span>
            <div>
              Chaque médecin garde son agenda et son compte. L&apos;établissement gère le
              rattachement et les infos communes.
            </div>
          </div>
          <div className="card2">
            <h4>Inviter un médecin</h4>
            {blocInvitation}
          </div>
          <div className="card2">
            <h4>Invitations · {invitations.length}</h4>
            {invitations.map(ligneInvitation)}
            {invitations.length === 0 && (
              <p className="muted" style={{ fontSize: 13 }}>
                Aucune invitation envoyée.
              </p>
            )}
          </div>
          <div className="card2">
            <h4>{rattaches.length} médecins rattachés</h4>
            {pagi.tranche.map((medecin) => (
              <div key={medecin.id} className="asstrowm">
                <span className="av" aria-hidden style={{ background: medecin.gradient }}>
                  {medecin.initiales}
                </span>
                <span className="meta">
                  <b>{medecin.nom}</b>
                  <small>{medecin.specialite}</small>
                </span>
                <span className="pill ok">Actif</span>
              </div>
            ))}
            <Pagination
              page={pagi.page}
              pages={pagi.pages}
              total={pagi.total}
              premier={pagi.premier}
              dernier={pagi.dernier}
              onPage={pagi.setPage}
              libelle="médecins"
            />
          </div>
        </div>
      </div>

      {/* ===== Version web ===== */}
      <div className="hidden md:block">
        <div className="mb-5">
          <h2 className="text-[21px] font-extrabold tracking-[-0.3px]">Médecins</h2>
          <small className="text-[13px] text-muted">
            Gérez les médecins rattachés à votre établissement
          </small>
        </div>

        <div className="mb-4 rounded-2xl border border-line bg-white p-5">
          <h3 className="mb-2 text-[15px] font-extrabold">Inviter un médecin</h3>
          <p className="mb-3 text-[12.5px] text-muted">
            Le médecin reçoit l’invitation et choisit de l’accepter ou de la refuser depuis son
            espace. Un médecin ne peut être rattaché qu’à un seul établissement.
          </p>
          {blocInvitation}
        </div>

        <div className="mb-4 rounded-2xl border border-line bg-white p-5">
          <h3 className="mb-1 text-[15px] font-extrabold">Invitations ({invitations.length})</h3>
          {invitations.map(ligneInvitation)}
          {invitations.length === 0 && (
            <p className="py-2 text-[13px] text-muted">Aucune invitation envoyée.</p>
          )}
        </div>

        <div className="rounded-2xl border border-line bg-white p-5">
          <h3 className="mb-1 text-[15px] font-extrabold">
            Médecins rattachés ({rattaches.length})
          </h3>
          {pagi.tranche.map((medecin) => (
            <div
              key={medecin.id}
              className="flex flex-wrap items-center gap-[13px] border-b border-line py-[14px] last:border-b-0"
            >
              <span
                aria-hidden
                className="grid h-[42px] w-[42px] flex-none place-items-center rounded-xl text-sm font-extrabold text-white"
                style={{ background: medecin.gradient }}
              >
                {medecin.initiales}
              </span>
              <div className="flex-1">
                <b className="block text-sm font-extrabold">{medecin.nom}</b>
                <small className="text-xs text-muted">{medecin.specialite}</small>
              </div>
              <span className="rounded-lg bg-green-soft px-[9px] py-1 text-[11px] font-bold text-green">
                Actif
              </span>
            </div>
          ))}
          <Pagination
            page={pagi.page}
            pages={pagi.pages}
            total={pagi.total}
            premier={pagi.premier}
            dernier={pagi.dernier}
            onPage={pagi.setPage}
            libelle="médecins"
          />
        </div>
      </div>
    </EtablissementShell>
  );
}
