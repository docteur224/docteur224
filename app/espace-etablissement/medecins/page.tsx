"use client";

import { useEffect, useState } from "react";
import EtablissementShell from "@/components/etablissement/EtablissementShell";
import {
  annulerInvitation,
  detacherMedecin,
  inviterMedecin,
  rechercherMedecinsInvitables,
  PLAFOND_MEDECINS_INVITABLES,
  useEtablissementConnecte,
  useInvitations,
  useMedecinsRattaches,
  type InvitationMedecin,
  type MedecinInvitable,
  type MedecinRattache,
} from "@/lib/etablissement";
import EnTeteMobile from "@/components/mobile/EnTeteMobile";
import Pagination, { usePagination } from "@/components/site/Pagination";
import Dialogue from "@/components/site/Dialogue";
import FicheMedecin from "@/components/etablissement/FicheMedecin";

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
  /*
   * Les résultats sont gardés AVEC la recherche qui les a produits. C'est ce
   * qui permet de savoir, sans le stocker, si ce qu'on a sous la main
   * correspond encore à ce qui est demandé — et donc d'afficher « Recherche… »
   * sans poser d'état depuis l'effet.
   */
  const [resultats, setResultats] = useState<{ cle: string; liste: MedecinInvitable[] } | null>(
    null
  );
  const [message, setMessage] = useState<{ texte: string; erreur: boolean } | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [enCours, setEnCours] = useState(false);
  /** Médecin dont on regarde la fiche, rattaché ou non. */
  const [ficheId, setFicheId] = useState<string | null>(null);
  /** « Tous les disponibles » : déroule la liste complète, un second clic la replie. */
  const [toutListe, setToutListe] = useState(false);

  const saisie = recherche.trim();
  /** `null` = il n'y a rien à chercher, donc rien à montrer. */
  const cleRecherche = saisie === "" && !toutListe ? null : `${saisie}#${toutListe}`;
  const listeResultat = cleRecherche !== null && resultats?.cle === cleRecherche ? resultats.liste : null;
  const cherche = cleRecherche !== null && listeResultat === null;

  /*
   * Recherche au fil de la frappe, 300 ms après la dernière touche.
   *
   * Il fallait auparavant taper puis cliquer « Rechercher » pour voir quoi
   * que ce soit, sans savoir si un résultat existait. `annule` ignore la
   * réponse d'une frappe dépassée : deux requêtes lancées coup sur coup ne
   * reviennent pas forcément dans l'ordre, et la plus ancienne écraserait
   * sinon la plus récente.
   */
  useEffect(() => {
    if (cleRecherche === null) return;
    let annule = false;
    const minuteur = setTimeout(async () => {
      const trouves = await rechercherMedecinsInvitables(saisie);
      if (!annule) setResultats({ cle: cleRecherche, liste: trouves });
    }, 300);
    return () => {
      annule = true;
      clearTimeout(minuteur);
    };
  }, [cleRecherche, saisie]);

  /* Entrée dans le champ : on ne fait qu'empêcher le rechargement de page,
     la recherche est déjà partie. */
  function chercher(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
  }

  async function inviter(medecinId: string, nom: string) {
    if (!etablissement) return;
    const res = await inviterMedecin(etablissement.id, medecinId);
    setMessage({ texte: res.erreur ?? `Invitation envoyée à ${nom}.`, erreur: Boolean(res.erreur) });
    if (!res.erreur) {
      // Le champ se vide et la liste se replie : la recherche courante n'a
      // plus lieu d'être (la liste est dérivée de ces deux états).
      setRecherche("");
      setToutListe(false);
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

  /*
   * Une ligne de résultat doit permettre de RECONNAÎTRE quelqu'un, pas
   * seulement de lire son nom : deux praticiens peuvent porter le même nom
   * ET la même spécialité. Dans l'ordre de ce qui tranche : la photo (un
   * visage se reconnaît d'un coup d'œil), le numéro d'ordre (unique et
   * officiel), le lieu d'exercice, l'ancienneté.
   */
  const ligneResultat = (m: MedecinInvitable) => (
    <div
      key={m.id}
      className={`flex flex-wrap items-center gap-3 rounded-[13px] border-[1.5px] bg-white p-3 ${
        m.homonyme ? "border-amber" : "border-line"
      }`}
    >
      {m.photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={m.photoUrl}
          alt=""
          width={44}
          height={44}
          className="h-11 w-11 flex-none rounded-xl object-cover"
        />
      ) : (
        <span
          aria-hidden
          className="grid h-11 w-11 flex-none place-items-center rounded-xl text-[13px] font-extrabold text-white"
          style={{ background: m.gradient }}
        >
          {m.initiales}
        </span>
      )}

      <span className="min-w-0 flex-1">
        <b className="block text-[13.5px]">{m.nom}</b>
        <small className="block text-[11.5px] text-muted">
          {[
            m.specialite || "Spécialité non renseignée",
            m.numeroOrdre ? `N° ${m.numeroOrdre}` : null,
            m.lieu || null,
            m.anneesExperience !== null ? `${m.anneesExperience} ans d'exercice` : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </small>
        {/*
         * Trouvé par son e-mail ou son numéro : on le confirme sans les
         * réafficher. Le gestionnaire sait ce qu'il a tapé — il lui manque
         * seulement la certitude que c'est bien cette ligne-là.
         */}
        {m.correspondance && (
          <small className="mt-0.5 block text-[11.5px] font-bold text-green">
            ✓ Correspond {m.correspondance === "email" ? "à l’e-mail" : "au numéro"} recherché
          </small>
        )}
        {/* Quand rien ne distingue deux lignes, on le dit — plutôt que de
            laisser le gestionnaire choisir à pile ou face. */}
        {m.homonyme && (
          <small className="mt-0.5 block text-[11.5px] font-bold text-amber">
            ⚠️ Un autre médecin porte le même nom et la même spécialité — ouvrez la fiche avant
            d’inviter.
          </small>
        )}
      </span>

      <span className="flex flex-none gap-2">
        {/* La fiche s'ouvre ICI, en fenêtre : un nouvel onglet faisait
            quitter l'écran et perdre la recherche en cours. */}
        <button
          type="button"
          onClick={() => setFicheId(m.id)}
          className="rounded-[9px] border-[1.5px] border-line bg-white px-3 py-1.5 text-[11.5px] font-bold text-blue transition-colors hover:border-teal"
        >
          Fiche
        </button>
        <button
          type="button"
          onClick={() => inviter(m.id, m.nom)}
          className="rounded-[9px] bg-teal px-3 py-1.5 text-[11.5px] font-bold text-white"
        >
          Inviter
        </button>
      </span>
    </div>
  );

  const listeResultats = listeResultat !== null && (
    <div className="mt-2">
      {listeResultat.length > 0 && (
        <p className="mb-2 text-[11.5px] text-muted">
          {listeResultat.length} médecin{listeResultat.length > 1 ? "s" : ""} disponible
          {listeResultat.length > 1 ? "s" : ""}
          {/* Le filtrage se fait dans le navigateur : au-delà du plafond,
              quelqu'un pourrait manquer à l'appel sans qu'on le sache. */}
          {listeResultat.length >= PLAFOND_MEDECINS_INVITABLES &&
            " — liste plafonnée, affinez la recherche"}
        </p>
      )}
      {/*
       * La liste défile au lieu de pousser les sections suivantes hors de
       * l'écran : « Tous les disponibles » peut en aligner des centaines,
       * et les invitations comme les rattachés doivent rester accessibles.
       * Le plafond n'existe qu'à partir de quelques lignes, sinon une
       * liste de deux résultats se retrouverait dans une boîte vide.
       */}
      <div
        className={`flex flex-col gap-2 ${
          listeResultat.length > 4 ? "max-h-[420px] overflow-y-auto pr-1" : ""
        }`}
      >
        {listeResultat.map(ligneResultat)}
      </div>
      {/* Une recherche sans résultat ne disait rien : l'écran restait
          identique et on ne savait pas si elle avait eu lieu. */}
      {listeResultat.length === 0 && (
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
          onChange={(e) => {
            setMessage(null);
            setRecherche(e.target.value);
          }}
          placeholder="Nom, spécialité, ville, n° d’ordre, e-mail ou téléphone"
          aria-label="Rechercher un médecin à inviter"
          className={champ}
        />
        {/* La recherche part toute seule à la frappe ; ce bouton sert au cas
            où l'on ne sait pas quoi taper — il déroule les praticiens
            disponibles, et un second clic les replie. */}
        <button
          type="button"
          aria-expanded={toutListe}
          onClick={() => {
            setMessage(null);
            setRecherche("");
            setToutListe((ouvert) => !ouvert);
          }}
          className="rounded-[11px] border-[1.5px] border-line bg-white px-[18px] py-3 text-[12.5px] font-bold text-blue transition-colors hover:border-teal"
        >
          {toutListe ? "Masquer la liste" : "Tous les disponibles"}
        </button>
      </form>
      {cherche && <p className="mt-2 text-[11.5px] text-muted">Recherche…</p>}
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
      {/* La liste ne porte que le nom et la spécialité : « Détail » ouvre la
          fiche professionnelle, seule façon de vérifier qu'on a bien le
          praticien qu'on croit avant de le retirer. */}
      <button
        type="button"
        onClick={() => setFicheId(medecin.id)}
        className="rounded-[9px] border-[1.5px] border-line bg-white px-3 py-1.5 text-[11.5px] font-bold text-blue transition-colors hover:border-teal"
      >
        Détail
      </button>
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
            espace. Un médecin ne peut être rattaché qu’à un seul établissement. En cas de doute
            entre deux praticiens, son e-mail ou son numéro de téléphone le désigne sans
            ambiguïté.
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

      {ficheId && (
        <FicheMedecin
          medecinId={ficheId}
          onFermer={() => setFicheId(null)}
          /* Inviter depuis la fiche n'a de sens que si le praticien est
             encore libre : un rattaché ne s'invite pas. */
          onInviter={
            rattaches.some((m) => m.id === ficheId)
              ? undefined
              : (nom) => {
                  setFicheId(null);
                  inviter(ficheId, nom);
                }
          }
        />
      )}

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
