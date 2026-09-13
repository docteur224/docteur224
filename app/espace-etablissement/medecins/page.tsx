"use client";

import { useState } from "react";
import EtablissementShell from "@/components/etablissement/EtablissementShell";
import {
  annulerInvitation,
  detacherMedecin,
  inviterMedecin,
  rechercherMedecinsInvitables,
  useEtablissementConnecte,
  useInvitations,
  useMedecinsRattaches,
  type InvitationMedecin,
  type MedecinRattache,
} from "@/lib/etablissement";
import EnTeteMobile from "@/components/mobile/EnTeteMobile";
import Pagination, { usePagination } from "@/components/site/Pagination";
import Dialogue from "@/components/site/Dialogue";

/*
 * Médecins — reproduit l'écran « etab-medecins » de la maquette web :
 * médecins rattachés (medecins.etablissement_id), invitation réelle d'un
 * médecin inscrit sur la plateforme, suivi du cycle envoyée → acceptée /
 * refusée (spec C.6). Le médecin répond depuis son propre compte
 * (fonction repondre_invitation, sécurisée côté base).
 *
 * AUDIT — deux actions manquaient, et l'écran Abonnement promettait
 * pourtant les deux (« invitez ou retirez des médecins depuis l'onglet
 * Médecins ») :
 *
 *   · ANNULER une invitation partie par erreur. La policy
 *     `del_invitations` l'autorise depuis la migration 0006 (« le
 *     gestionnaire peut annuler ») mais aucun bouton ne l'appelait :
 *     l'invitation restait « En attente » pour toujours.
 *
 *   · RETIRER un médecin rattaché. Impossible côté client — la RLS
 *     réserve l'écriture de `medecins.etablissement_id` au médecin —
 *     d'où la fonction `detacher_medecin` de la migration 0054.
 *
 * Les deux passent par une confirmation : elles touchent le compte d'un
 * tiers, et le médecin en est notifié.
 */

const LIBELLES_STATUT = {
  envoyee: { texte: "En attente", classes: "bg-amber-soft text-amber" },
  acceptee: { texte: "Acceptée", classes: "bg-green-soft text-green" },
  refusee: { texte: "Refusée", classes: "bg-[#FBE9E7] text-red" },
} as const;

/** Ce que la confirmation en cours va faire, et à qui. */
type Confirmation =
  | { genre: "retirer"; id: string; nom: string }
  | { genre: "annuler"; id: string; nom: string };

export default function MedecinsEtablissement() {
  const { etablissement } = useEtablissementConnecte();
  const { rattaches, recharger: rechargerRattaches } = useMedecinsRattaches(etablissement?.id);
  const { invitations, recharger } = useInvitations(etablissement?.id);
  const pagi = usePagination(rattaches, 12);
  const pagiInvitations = usePagination(invitations, 10);
  const [recherche, setRecherche] = useState("");
  const [cherche, setCherche] = useState(false);
  const [resultats, setResultats] = useState<{ id: string; nom: string; specialite: string }[] | null>(
    null
  );
  const [message, setMessage] = useState<{ texte: string; erreur: boolean } | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [enCours, setEnCours] = useState(false);

  async function chercher(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    setCherche(true);
    try {
      setResultats(await rechercherMedecinsInvitables(recherche));
    } finally {
      setCherche(false);
    }
  }

  async function inviter(medecinId: string, nom: string) {
    if (!etablissement) return;
    const res = await inviterMedecin(etablissement.id, medecinId);
    setMessage({ texte: res.erreur ?? `Invitation envoyée à ${nom}.`, erreur: Boolean(res.erreur) });
    if (!res.erreur) {
      setResultats(null);
      setRecherche("");
      recharger();
    }
  }

  /* Exécution de l'action confirmée : retrait ou annulation. */
  async function confirmer() {
    if (!confirmation) return;
    setEnCours(true);
    const res =
      confirmation.genre === "retirer"
        ? await detacherMedecin(confirmation.id)
        : await annulerInvitation(confirmation.id);
    setEnCours(false);
    setConfirmation(null);
    if (res.erreur) {
      setMessage({ texte: res.erreur, erreur: true });
      return;
    }
    setMessage({
      texte:
        confirmation.genre === "retirer"
          ? `${confirmation.nom} n'est plus rattaché à l'établissement.`
          : `Invitation de ${confirmation.nom} annulée.`,
      erreur: false,
    });
    // Un retrait change les deux listes : le médecin sort des rattachés
    // et son invitation acceptée disparaît (voir detacher_medecin).
    rechargerRattaches();
    recharger();
  }

  const champ =
    "w-full rounded-[11px] border border-line bg-white px-[13px] py-3 text-[13.5px] outline-none focus:border-teal";
  const boutonDiscret =
    "rounded-[9px] border-[1.5px] border-line bg-white px-3 py-1.5 text-[11.5px] font-bold text-muted transition-colors hover:border-[#E08E45] hover:text-[#C0392B]";

  const listeResultats = resultats !== null && (
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
      {/* Une recherche sans résultat ne disait rien : l'écran restait
          identique et on ne savait pas si elle avait eu lieu. */}
      {resultats.length === 0 && (
        <p className="text-[12.5px] text-muted">
          Aucun médecin ne correspond. Seuls les médecins déjà inscrits, validés et rattachés à
          aucun établissement peuvent être invités.
        </p>
      )}
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
          disabled={cherche}
          className="rounded-[11px] bg-teal px-[18px] py-3 text-[12.5px] font-bold text-white transition-colors hover:bg-[#2790bc] disabled:opacity-60"
        >
          {cherche ? "Recherche…" : "🔍 Rechercher"}
        </button>
      </form>
      {listeResultats}
      {message && (
        <p
          className={`mt-2 text-[12.5px] font-bold ${message.erreur ? "text-[#C0392B]" : "text-green"}`}
          role="status"
        >
          {message.erreur ? "⚠️ " : "✓ "}
          {message.texte}
        </p>
      )}
    </>
  );

  const ligneInvitation = (invitation: InvitationMedecin) => {
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
        {/* Seule une invitation encore en attente s'annule : une réponse
            déjà donnée appartient au médecin. */}
        {invitation.statut === "envoyee" && (
          <button
            type="button"
            onClick={() =>
              setConfirmation({ genre: "annuler", id: invitation.id, nom: invitation.nom })
            }
            className={boutonDiscret}
          >
            Annuler
          </button>
        )}
      </div>
    );
  };

  const ligneRattache = (medecin: MedecinRattache) => (
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
      <button
        type="button"
        onClick={() => setConfirmation({ genre: "retirer", id: medecin.id, nom: medecin.nom })}
        className={boutonDiscret}
      >
        Retirer
      </button>
    </div>
  );

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
            {pagiInvitations.tranche.map(ligneInvitation)}
            {invitations.length === 0 && (
              <p className="muted" style={{ fontSize: 13 }}>
                Aucune invitation envoyée.
              </p>
            )}
            <Pagination
              page={pagiInvitations.page}
              pages={pagiInvitations.pages}
              total={pagiInvitations.total}
              premier={pagiInvitations.premier}
              dernier={pagiInvitations.dernier}
              onPage={pagiInvitations.setPage}
              libelle="invitations"
            />
          </div>
          <div className="card2">
            <h4>{rattaches.length} médecins rattachés</h4>
            {pagi.tranche.map(ligneRattache)}
            {rattaches.length === 0 && (
              <p className="muted" style={{ fontSize: 13 }}>
                Aucun médecin rattaché pour l&apos;instant.
              </p>
            )}
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
          {pagiInvitations.tranche.map(ligneInvitation)}
          {invitations.length === 0 && (
            <p className="py-2 text-[13px] text-muted">Aucune invitation envoyée.</p>
          )}
          <Pagination
            page={pagiInvitations.page}
            pages={pagiInvitations.pages}
            total={pagiInvitations.total}
            premier={pagiInvitations.premier}
            dernier={pagiInvitations.dernier}
            onPage={pagiInvitations.setPage}
            libelle="invitations"
          />
        </div>

        <div className="rounded-2xl border border-line bg-white p-5">
          <h3 className="mb-1 text-[15px] font-extrabold">
            Médecins rattachés ({rattaches.length})
          </h3>
          {pagi.tranche.map(ligneRattache)}
          {rattaches.length === 0 && (
            <p className="py-2 text-[13px] text-muted">
              Aucun médecin rattaché pour l’instant : invitez-en un ci-dessus.
            </p>
          )}
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

      {confirmation && (
        <Dialogue
          titre={
            confirmation.genre === "retirer" ? "Retirer ce médecin ?" : "Annuler cette invitation ?"
          }
          icone={confirmation.genre === "retirer" ? "🔓" : "✉️"}
          sousTitre={confirmation.nom}
          onFermer={() => setConfirmation(null)}
          pied={
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmation(null)}
                className="rounded-[9px] border-[1.5px] border-line bg-white px-[14px] py-2 text-[12.5px] font-bold text-muted"
              >
                Retour
              </button>
              <button
                type="button"
                onClick={confirmer}
                disabled={enCours}
                className="rounded-[9px] bg-[#C0392B] px-[14px] py-2 text-[12.5px] font-bold text-white disabled:opacity-60"
              >
                {enCours
                  ? "…"
                  : confirmation.genre === "retirer"
                    ? "Retirer"
                    : "Annuler l’invitation"}
              </button>
            </div>
          }
        >
          <p className="p-4 text-[13px] leading-relaxed text-muted">
            {confirmation.genre === "retirer" ? (
              <>
                {confirmation.nom} ne sera plus rattaché à l’établissement et en sera notifié. Son
                compte, son agenda et ses rendez-vous ne changent pas : seul le rattachement est
                défait. Vous pourrez l’inviter à nouveau.
              </>
            ) : (
              <>
                L’invitation envoyée à {confirmation.nom} sera retirée. Le médecin ne pourra plus y
                répondre, et vous pourrez lui en envoyer une nouvelle.
              </>
            )}
          </p>
        </Dialogue>
      )}
    </EtablissementShell>
  );
}
