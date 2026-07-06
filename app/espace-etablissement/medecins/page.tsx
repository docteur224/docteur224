"use client";

import { useState } from "react";
import EtablissementShell from "@/components/etablissement/EtablissementShell";
import {
  accepterInvitation,
  inviterMedecin,
  refuserInvitation,
  useInvitations,
  useMedecinsRattaches,
} from "@/lib/mock-etablissement";

/*
 * Médecins — reproduit l'écran « etab-medecins » de la maquette web :
 * médecins rattachés, formulaire d'invitation et suivi du cycle
 * envoyée → acceptée / refusée (spec C.6). En attendant les vrais comptes,
 * la réponse du médecin se simule depuis cette page.
 */

const LIBELLES_STATUT = {
  envoyee: { texte: "En attente", classes: "bg-amber-soft text-amber" },
  acceptee: { texte: "Acceptée", classes: "bg-green-soft text-green" },
  refusee: { texte: "Refusée", classes: "bg-[#FBE9E7] text-red" },
} as const;

export default function MedecinsEtablissement() {
  const rattaches = useMedecinsRattaches();
  const invitations = useInvitations();
  const [nom, setNom] = useState("");
  const [specialite, setSpecialite] = useState("");

  function envoyerInvitation(e: React.FormEvent) {
    e.preventDefault();
    if (!nom.trim() || !specialite.trim()) return;
    inviterMedecin(nom.trim(), specialite.trim());
    setNom("");
    setSpecialite("");
  }

  const champ =
    "w-full rounded-[11px] border border-line bg-white px-[13px] py-3 text-[13.5px] outline-none focus:border-teal";

  return (
    <EtablissementShell>
      {/* ===== Version mobile (écran « m-etab-medecins » de la maquette mobile) ===== */}
      <div className="md:hidden">
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
            <form onSubmit={envoyerInvitation}>
              <input
                className="inp"
                value={nom}
                onChange={(e) => setNom(e.target.value)}
                placeholder="Nom du médecin, ex. Dr Oumar Baldé"
                aria-label="Nom du médecin"
              />
              <input
                className="inp"
                value={specialite}
                onChange={(e) => setSpecialite(e.target.value)}
                placeholder="Spécialité, ex. Ophtalmologie"
                aria-label="Spécialité"
              />
              <button type="submit" className="btn block" style={{ marginTop: 0 }}>
                + Inviter un médecin
              </button>
            </form>
          </div>
          <div className="card2">
            <h4>Invitations · {invitations.length}</h4>
            {invitations.map((invitation) => {
              const statut = LIBELLES_STATUT[invitation.statut];
              return (
                <div key={invitation.id} className="asstrowm">
                  <span className="av" aria-hidden style={{ background: invitation.gradient }}>
                    {invitation.initiales}
                  </span>
                  <span className="meta">
                    <b>{invitation.nom}</b>
                    <small>
                      {invitation.specialite} · envoyée le {invitation.envoyeeLe}
                    </small>
                  </span>
                  {invitation.statut === "envoyee" ? (
                    <span style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                      <button
                        type="button"
                        className="btnm"
                        onClick={() => accepterInvitation(invitation.id)}
                      >
                        Simuler : accepte
                      </button>
                      <button
                        type="button"
                        className="btnm dg"
                        onClick={() => refuserInvitation(invitation.id)}
                      >
                        Simuler : refuse
                      </button>
                    </span>
                  ) : (
                    <span
                      className={`pill ${
                        invitation.statut === "acceptee"
                          ? "ok"
                          : invitation.statut === "refusee"
                            ? "bad"
                            : "soon"
                      }`}
                    >
                      {statut.texte}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
          <div className="card2">
            <h4>{rattaches.length} médecins rattachés</h4>
            {rattaches.map((medecin) => (
              <div key={medecin.id} className="asstrowm">
                <span className="av" aria-hidden style={{ background: medecin.gradient }}>
                  {medecin.initiales}
                </span>
                <span className="meta">
                  <b>{medecin.nom}</b>
                  <small>
                    {medecin.specialite} · {medecin.rdvSemaine} RDV cette semaine
                  </small>
                </span>
                <span className="pill ok">Actif</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ===== Version web (inchangée) ===== */}
      <div className="hidden md:block">
      <div className="mb-5">
        <h2 className="text-[21px] font-extrabold tracking-[-0.3px]">Médecins</h2>
        <small className="text-[13px] text-muted">
          Gérez les médecins rattachés à votre établissement
        </small>
      </div>

      {/* Invitation */}
      <div className="mb-4 rounded-2xl border border-line bg-white p-5">
        <h3 className="mb-2 text-[15px] font-extrabold">Inviter un médecin</h3>
        <p className="mb-3 text-[12.5px] text-muted">
          Le médecin reçoit l’invitation et choisit de l’accepter ou de la refuser. Un médecin ne
          peut être rattaché qu’à un seul établissement.
        </p>
        <form onSubmit={envoyerInvitation} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
          <input
            value={nom}
            onChange={(e) => setNom(e.target.value)}
            placeholder="Nom du médecin, ex. Dr Oumar Baldé"
            aria-label="Nom du médecin"
            className={champ}
          />
          <input
            value={specialite}
            onChange={(e) => setSpecialite(e.target.value)}
            placeholder="Spécialité, ex. Ophtalmologie"
            aria-label="Spécialité"
            className={champ}
          />
          <button
            type="submit"
            className="rounded-[11px] bg-teal px-[18px] py-3 text-[12.5px] font-bold text-white transition-colors hover:bg-[#2790bc]"
          >
            Envoyer l’invitation
          </button>
        </form>
      </div>

      {/* Invitations en cours */}
      <div className="mb-4 rounded-2xl border border-line bg-white p-5">
        <h3 className="mb-1 text-[15px] font-extrabold">Invitations ({invitations.length})</h3>
        {invitations.map((invitation) => {
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
              {invitation.statut === "envoyee" && (
                <span className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => accepterInvitation(invitation.id)}
                    className="rounded-[9px] border-[1.5px] border-[#BFE3CC] bg-green-soft px-3 py-1.5 text-[11.5px] font-bold text-green"
                  >
                    Simuler : accepte
                  </button>
                  <button
                    type="button"
                    onClick={() => refuserInvitation(invitation.id)}
                    className="rounded-[9px] border-[1.5px] border-[#F3CDC8] bg-[#FBE9E7] px-3 py-1.5 text-[11.5px] font-bold text-red"
                  >
                    Simuler : refuse
                  </button>
                </span>
              )}
            </div>
          );
        })}
        <p className="mt-3 text-[11.5px] text-muted">
          Mode démonstration : la réponse du médecin se simule ici. En réel, il répondra depuis
          son propre espace.
        </p>
      </div>

      {/* Médecins rattachés */}
      <div className="rounded-2xl border border-line bg-white p-5">
        <h3 className="mb-1 text-[15px] font-extrabold">
          Médecins rattachés ({rattaches.length})
        </h3>
        {rattaches.map((medecin) => (
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
            <small className="text-xs font-semibold text-muted">
              {medecin.rdvSemaine} RDV cette semaine
            </small>
            <span className="rounded-lg bg-green-soft px-[9px] py-1 text-[11px] font-bold text-green">
              Actif
            </span>
          </div>
        ))}
      </div>
      </div>
    </EtablissementShell>
  );
}
