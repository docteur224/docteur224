"use client";

import { useState } from "react";
import AdminShell from "@/components/admin/AdminShell";
import EnTeteMobile from "@/components/mobile/EnTeteMobile";
import Interrupteur from "@/components/patient/Interrupteur";
import ChampMotDePasse from "@/components/site/ChampMotDePasse";
import {
  creerCompteAdmin,
  majPermissionsAdmin,
  majStatutAdmin,
  supprimerCompteAdmin,
  useDroitsAdmin,
  useEquipeAdmin,
  type AdminEquipe,
} from "@/lib/admin";
import {
  CATALOGUE_PERMISSIONS,
  libelleRole,
  motDePasseProvisoire,
  permissionsDuRole,
  ROLES,
  type CleRole,
} from "@/lib/permissions-admin";

/*
 * Équipe admin — comptes administrateurs, rôles et permissions.
 *
 * L'écran promettait trois gestes qu'aucune ligne de code ne tenait :
 * « Ajouter » et « Gérer » étaient des boutons désactivés, et la grille de
 * permissions écrivait toujours sur le PREMIER admin de la liste, quel qu'il
 * soit. Les trois fonctionnent désormais, avec les mêmes garde-fous à
 * l'écran qu'en base (migration 0043) :
 *
 *   - un compte PRINCIPAL, qui détient tout et que personne ne peut
 *     désactiver, supprimer ni rétrograder — le recours quand plus personne
 *     ne peut rendre la main ;
 *   - personne ne modifie SES PROPRES droits, sinon la permission « Équipe
 *     admin » vaudrait toutes les autres en un clic ;
 *   - un compte désactivé perd ses droits en base (`est_admin()` exige
 *     `statut = 'actif'`) et sa session est fermée.
 *
 * Cloisonnement inchangé : aucun administrateur, principal ou non, n'accède
 * aux dossiers médicaux des patients.
 */

const GRADIENTS = [
  "linear-gradient(135deg,#15506B,#0B2E3D)",
  "linear-gradient(135deg,#6C5CE7,#341F97)",
  "linear-gradient(135deg,#16A085,#0E6655)",
  "linear-gradient(135deg,#2E9CCA,#15506B)",
  "linear-gradient(135deg,#E08E45,#C0392B)",
];

const gradientPour = (id: string) => {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (Math.imul(h, 31) + id.charCodeAt(i)) | 0;
  return GRADIENTS[Math.abs(h) % GRADIENTS.length];
};

const initiales = (nom: string) =>
  nom
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((m) => m.charAt(0))
    .join("")
    .toUpperCase() || "AD";

type Retour = { texte: string; erreur: boolean };

const CHAMP =
  "w-full rounded-xl border border-line bg-white p-[13px] text-[13.5px] outline-none focus:border-teal";
const ETIQUETTE = "mb-1.5 block text-[12.5px] font-bold";
const AIDE = "mt-1.5 block text-[11.5px] leading-snug text-muted";

export default function EquipeAdmin() {
  const { admins, chargement, recharger } = useEquipeAdmin();
  const { droits } = useDroitsAdmin();

  const [creation, setCreation] = useState(false);
  const [actionsSur, setActionsSur] = useState<AdminEquipe | null>(null);
  const [permissionsSur, setPermissionsSur] = useState<AdminEquipe | null>(null);
  const [message, setMessage] = useState<Retour | null>(null);

  // La liste est rechargée à chaque succès : les droits, le statut et la
  // dernière connexion viennent tous de la base, jamais d'un état local qui
  // divergerait au premier refus.
  function terminer(res: { erreur?: string }, succes: string): boolean {
    setMessage(res.erreur ? { texte: res.erreur, erreur: true } : { texte: succes, erreur: false });
    if (!res.erreur) recharger();
    return !res.erreur;
  }

  const bandeau = message && (
    <p
      role="status"
      className={`mb-3 rounded-[11px] px-[13px] py-2.5 text-[12.5px] font-semibold ${
        message.erreur ? "bg-red-50 text-red-600" : "bg-green-soft text-green"
      }`}
    >
      {message.erreur ? "⚠️ " : "✓ "}
      {message.texte}
    </p>
  );

  const lignes = admins.map((a) => ({
    admin: a,
    initiales: initiales(a.nom),
    gradient: gradientPour(a.id),
    role: libelleRole(a.permissions),
    // Son propre compte : la base refuse qu'un administrateur touche à ses
    // droits, l'écran ne doit donc pas le lui proposer.
    soi: a.id === droits?.id,
  }));

  return (
    <AdminShell permission="equipe">
      {/* ===== Version mobile (écran « m-admin-equipe » de la maquette) ===== */}
      <div className="md:hidden">
        <EnTeteMobile retour="/espace-admin/plus" titre="Équipe admin" />
        <div className="pad">
          <div
            className="abannerm"
            style={{ background: "var(--red-soft)", borderColor: "#F3C9C2", color: "var(--red)" }}
          >
            <span aria-hidden>🔒</span>
            <div>
              <b>Cloisonnement.</b> Aucun administrateur ne peut consulter les{" "}
              <b>dossiers médicaux</b> des patients.
            </div>
          </div>
          <button
            type="button"
            className="btn block"
            style={{ marginTop: 0 }}
            onClick={() => {
              setMessage(null);
              setCreation(true);
            }}
          >
            + Créer un compte administrateur
          </button>
          <div className="card2" style={{ marginTop: 12 }}>
            <h4>Comptes administrateurs · {admins.length}</h4>
            {bandeau}
            {chargement && <p className="muted" style={{ fontSize: 12.5 }}>Chargement…</p>}
            {lignes.map(({ admin, initiales: ini, gradient, role, soi }) => (
              <button
                key={admin.id}
                type="button"
                className="asstrowm"
                style={{ width: "100%", textAlign: "left", background: "none" }}
                onClick={() => {
                  setMessage(null);
                  setActionsSur(admin);
                }}
              >
                <span className="av" aria-hidden style={{ background: gradient }}>
                  {ini}
                </span>
                <span className="meta">
                  <b>
                    {admin.nom}
                    {soi && " (vous)"}
                  </b>
                  {/* `display: block` porté ici : `.asstrowm .meta small` ne
                      le pose pas, et les deux lignes se colleraient. */}
                  <small style={{ display: "block" }}>
                    {admin.email} · {role}
                  </small>
                  <small style={{ display: "block" }}>
                    {admin.principal ? "Compte principal · " : ""}Dernière connexion :{" "}
                    {admin.derniereConnexionLibelle}
                  </small>
                </span>
                <span className={`pill ${admin.actif ? "ok" : "lock"}`}>
                  {admin.actif ? "Actif" : "Désactivé"}
                </span>
              </button>
            ))}
          </div>
          <div className="card2">
            <h4>Ce qu’aucun compte ne peut faire</h4>
            <div className="setrow">
              <div>
                <b>🔒 Dossiers médicaux</b>
                <small>Interdit à tous les profils admin, sans exception</small>
              </div>
              <span className="pill bad">Verrouillé</span>
            </div>
          </div>
        </div>
      </div>

      {/* ===== Version web ===== */}
      <div className="hidden md:block">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-[21px] font-extrabold tracking-[-0.3px]">Équipe admin</h2>
            <small className="text-[13px] text-muted">
              Comptes administrateurs, rôles et permissions
            </small>
          </div>
        </div>

        <div className="mb-4 flex items-start gap-[9px] rounded-xl border border-[#F3C9C2] bg-red-soft px-[14px] py-3 text-[12.5px] font-semibold leading-relaxed text-red">
          <span aria-hidden>🔒</span>
          <div>
            <b>Cloisonnement.</b> Aucun administrateur ne peut consulter les{" "}
            <b>dossiers médicaux</b> des patients. Ces données de santé ne sont jamais accessibles
            depuis l’espace d’administration.
          </div>
        </div>

        <div className="mb-4 overflow-hidden rounded-2xl border border-line bg-white">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
            <h3 className="text-[15px] font-extrabold">Comptes administrateurs</h3>
            <button
              type="button"
              onClick={() => {
                setMessage(null);
                setCreation(true);
              }}
              className="flex items-center gap-1.5 text-[12.5px] font-bold text-teal hover:underline"
            >
              <span aria-hidden>👤+</span> Créer un compte
            </button>
          </div>
          <div className="px-5">
            {bandeau && <div className="pt-3">{bandeau}</div>}
            {chargement && <p className="py-4 text-[12.5px] text-muted">Chargement…</p>}
            {lignes.map(({ admin, initiales: ini, gradient, role, soi }) => (
              <div
                key={admin.id}
                className="flex flex-wrap items-center gap-[13px] border-b border-line py-[14px] last:border-b-0"
              >
                <span
                  aria-hidden
                  className="grid h-[42px] w-[42px] flex-none place-items-center rounded-xl text-sm font-extrabold text-white"
                  style={{ background: gradient }}
                >
                  {ini}
                </span>
                <div className="min-w-0 flex-1">
                  <b className="flex flex-wrap items-center gap-2 text-sm font-extrabold">
                    {admin.nom}
                    {admin.principal && (
                      <span className="rounded-full bg-[#EEF1F4] px-2 py-0.5 text-[10.5px] font-bold text-[#7E8C97]">
                        compte principal
                      </span>
                    )}
                    {soi && (
                      <span className="rounded-full bg-teal-soft px-2 py-0.5 text-[10.5px] font-bold text-blue">
                        vous
                      </span>
                    )}
                  </b>
                  <small className="text-xs text-muted">
                    {admin.email} · {role}
                  </small>
                </div>
                <span
                  className={`flex-none text-[11.5px] font-bold ${
                    admin.actif ? "text-green" : "text-[#7E8C97]"
                  }`}
                >
                  <span aria-hidden>●</span> {admin.actif ? "Actif" : "Désactivé"}
                </span>
                <span className="w-[130px] flex-none text-right text-[11.5px] text-muted">
                  {admin.derniereConnexionLibelle}
                </span>
                <button
                  type="button"
                  aria-label={`Gérer le compte de ${admin.nom}`}
                  onClick={() => {
                    setMessage(null);
                    setActionsSur(admin);
                  }}
                  className="flex-none rounded-[9px] border-[1.5px] border-line bg-white px-3 py-1.5 text-[13px] font-bold text-muted transition-colors hover:bg-bg"
                >
                  ⋯
                </button>
              </div>
            ))}
            {!chargement && lignes.length === 0 && (
              <p className="py-4 text-[12.5px] text-muted">Aucun compte administrateur.</p>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-line bg-white p-5">
          <h3 className="mb-1 text-[15px] font-extrabold">Ce qu’aucun compte ne peut faire</h3>
          <div className="flex items-center justify-between gap-[14px] py-[15px]">
            <div>
              <b className="block text-[13.5px] font-bold">
                🔒 Dossiers médicaux des patients
              </b>
              <small className="text-xs text-muted">
                Interdit à tous les profils admin, y compris le compte principal
              </small>
            </div>
            <span className="rounded-lg bg-red-soft px-[9px] py-1 text-[11px] font-bold text-red">
              Verrouillé
            </span>
          </div>
        </div>
      </div>

      {/* ===== Dialogues (communs aux deux mises en page) ===== */}
      {creation && (
        <DialogueCreation
          onFermer={() => setCreation(false)}
          onCree={(res, nom) => {
            const ok = terminer(res, `Le compte de ${nom} a été créé.`);
            if (ok) setCreation(false);
            return ok;
          }}
        />
      )}

      {actionsSur && (
        <DialogueActions
          admin={actionsSur}
          soi={actionsSur.id === droits?.id}
          onFermer={() => setActionsSur(null)}
          onPermissions={() => {
            setPermissionsSur(actionsSur);
            setActionsSur(null);
          }}
          onStatut={async () => {
            const res = await majStatutAdmin(actionsSur.id, !actionsSur.actif);
            const ok = terminer(
              res,
              actionsSur.actif
                ? `Le compte de ${actionsSur.nom} est désactivé.`
                : `Le compte de ${actionsSur.nom} est réactivé.`
            );
            if (ok) setActionsSur(null);
          }}
          onSupprimer={async () => {
            const res = await supprimerCompteAdmin(actionsSur.id);
            const ok = terminer(res, `Le compte de ${actionsSur.nom} a été supprimé.`);
            if (ok) setActionsSur(null);
          }}
        />
      )}

      {permissionsSur && (
        <DialoguePermissions
          admin={permissionsSur}
          soi={permissionsSur.id === droits?.id}
          onFermer={() => setPermissionsSur(null)}
          onEnregistrer={async (permissions) => {
            const res = await majPermissionsAdmin(permissionsSur, permissions);
            const ok = terminer(res, `Permissions de ${permissionsSur.nom} enregistrées.`);
            if (ok) setPermissionsSur(null);
          }}
        />
      )}
    </AdminShell>
  );
}

/* ===================== Dialogues ===================== */

/** Enveloppe commune : feuille montante sur téléphone, carte centrée sur web. */
function Dialogue({
  titre,
  icone,
  sousTitre,
  onFermer,
  children,
}: {
  titre: string;
  icone: React.ReactNode;
  sousTitre?: string;
  onFermer: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={titre}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 md:items-center md:overflow-y-auto md:p-6"
      onClick={(e) => {
        if (e.target === e.currentTarget) onFermer();
      }}
    >
      <div className="flex max-h-[94vh] w-full flex-col rounded-t-2xl border border-line bg-white md:max-h-[90vh] md:max-w-[480px] md:rounded-2xl md:shadow-xl">
        <div className="flex items-start gap-3 border-b border-line p-4">
          <span aria-hidden className="text-[17px]">
            {icone}
          </span>
          <h4 className="flex-1 text-[15.5px] font-extrabold">
            {titre}
            {sousTitre && (
              <span className="mt-0.5 block text-[12px] font-semibold text-muted">{sousTitre}</span>
            )}
          </h4>
          <button
            type="button"
            onClick={onFermer}
            aria-label="Fermer"
            className="flex-none rounded-lg px-2 py-1 text-lg text-muted hover:bg-bg"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function DialogueCreation({
  onFermer,
  onCree,
}: {
  onFermer: () => void;
  onCree: (res: { erreur?: string }, nom: string) => boolean;
}) {
  const [nomComplet, setNomComplet] = useState("");
  const [email, setEmail] = useState("");
  const [motDePasse, setMotDePasse] = useState("");
  const [role, setRole] = useState<CleRole>("support");
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const definition = ROLES.find((r) => r.cle === role)!;

  async function soumettre(e: React.FormEvent) {
    e.preventDefault();
    setErreur(null);
    setEnCours(true);
    const res = await creerCompteAdmin({
      nomComplet: nomComplet.trim(),
      email: email.trim(),
      motDePasse,
      permissions: permissionsDuRole(role),
    });
    setEnCours(false);
    // L'erreur reste DANS le dialogue : la refermer pour lire un bandeau
    // derrière ferait perdre la saisie.
    if (res.erreur) setErreur(res.erreur);
    else onCree(res, nomComplet.trim());
  }

  return (
    <Dialogue
      titre="Créer un compte administrateur"
      icone="👤+"
      onFermer={onFermer}
    >
      {/* Le corps défile, les boutons restent visibles : sur un téléphone, un
          « Créer le compte » sous la ligne de flottaison ne se trouve pas. */}
      <form onSubmit={soumettre} className="flex min-h-0 flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <label className="mb-3 block">
          <span className={ETIQUETTE}>Nom complet</span>
          <input
            className={CHAMP}
            value={nomComplet}
            onChange={(e) => setNomComplet(e.target.value)}
            placeholder="Ex. Aïssatou Ba"
            autoComplete="off"
            required
          />
        </label>

        <label className="mb-3 block">
          <span className={ETIQUETTE}>Adresse e-mail</span>
          <input
            className={CHAMP}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="prenom@docteur224.com"
            autoComplete="off"
            required
          />
          <span className={AIDE}>
            Doit être différente des adresses des comptes membres : un compte ne peut pas être à
            la fois patient et administrateur.
          </span>
        </label>

        <div className="mb-3">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-[12.5px] font-bold">Mot de passe provisoire</span>
            <button
              type="button"
              onClick={() => setMotDePasse(motDePasseProvisoire())}
              className="text-[12px] font-bold text-teal hover:underline"
            >
              Générer
            </button>
          </div>
          <ChampMotDePasse
            valeur={motDePasse}
            onChange={setMotDePasse}
            ariaLabel="Mot de passe provisoire"
          />
          <span className={AIDE}>
            Communiquez-le à la personne : elle pourra le changer une fois connectée. Huit
            caractères au minimum.
          </span>
        </div>

        <label className="mb-1 block">
          <span className={ETIQUETTE}>Rôle</span>
          <select
            className={CHAMP}
            value={role}
            onChange={(e) => setRole(e.target.value as CleRole)}
          >
            {ROLES.map((r) => (
              <option key={r.cle} value={r.cle}>
                {r.libelle}
              </option>
            ))}
          </select>
          <span className={AIDE}>
            {definition.detail}. Les permissions se règlent ensuite une par une depuis la liste.
          </span>
        </label>

          {erreur && (
            <p
              role="alert"
              className="mt-3 rounded-[11px] bg-red-50 px-[13px] py-2.5 text-[12.5px] font-semibold text-red-600"
            >
              ⚠️ {erreur}
            </p>
          )}
        </div>

        <div className="flex flex-wrap gap-2.5 border-t border-line p-4">
          <button
            type="button"
            onClick={onFermer}
            className="flex-1 rounded-[11px] border-[1.5px] border-line bg-white px-[14px] py-3 text-[13px] font-bold text-blue transition-colors hover:bg-bg"
          >
            Annuler
          </button>
          <button
            type="submit"
            disabled={enCours}
            className="flex-1 rounded-[11px] bg-teal px-[14px] py-3 text-[13px] font-bold text-white disabled:opacity-50"
          >
            {enCours ? "Création…" : "Créer le compte"}
          </button>
        </div>
      </form>
    </Dialogue>
  );
}

function DialogueActions({
  admin,
  soi,
  onFermer,
  onPermissions,
  onStatut,
  onSupprimer,
}: {
  admin: AdminEquipe;
  soi: boolean;
  onFermer: () => void;
  onPermissions: () => void;
  onStatut: () => Promise<void>;
  onSupprimer: () => Promise<void>;
}) {
  const [confirme, setConfirme] = useState(false);
  const [enCours, setEnCours] = useState(false);

  // Le compte principal est le dernier recours de la plateforme, et personne
  // n'agit sur le sien : dans les deux cas on dit POURQUOI l'action manque.
  const empeche = admin.principal
    ? "Le compte principal ne peut être ni modifié, ni désactivé, ni supprimé."
    : soi
      ? "Vous ne pouvez pas agir sur votre propre compte administrateur."
      : null;

  const action =
    "flex w-full items-center gap-3 border-b border-line px-4 py-[15px] text-left text-[13.5px] font-bold last:border-b-0 disabled:opacity-40";

  async function lancer(geste: () => Promise<void>) {
    setEnCours(true);
    await geste();
    setEnCours(false);
  }

  return (
    <Dialogue
      titre={admin.nom}
      sousTitre={`${admin.email} · ${libelleRole(admin.permissions)}`}
      icone={
        <span
          className="grid h-[34px] w-[34px] place-items-center rounded-xl text-[12px] font-extrabold text-white"
          style={{ background: gradientPour(admin.id) }}
        >
          {initiales(admin.nom)}
        </span>
      }
      onFermer={onFermer}
    >
      <div className="overflow-y-auto">
        {empeche && (
          <p className="border-b border-line bg-bg px-4 py-3 text-[12px] font-semibold text-muted">
            {empeche}
          </p>
        )}

        <button
          type="button"
          className={`${action} text-blue`}
          disabled={!!empeche || enCours}
          onClick={onPermissions}
        >
          <span aria-hidden>✏️</span> Modifier le rôle et les permissions
        </button>

        <button
          type="button"
          className={`${action} text-amber`}
          disabled={!!empeche || enCours}
          onClick={() => lancer(onStatut)}
        >
          <span aria-hidden>⏻</span>
          {admin.actif ? "Désactiver le compte" : "Réactiver le compte"}
        </button>

        <button
          type="button"
          className={`${action} text-red-600`}
          disabled={!!empeche || enCours}
          onClick={() => (confirme ? lancer(onSupprimer) : setConfirme(true))}
        >
          <span aria-hidden>🗑️</span>
          {enCours && confirme
            ? "Suppression…"
            : confirme
              ? "Confirmer la suppression"
              : "Supprimer le compte"}
        </button>

        {confirme && (
          <p className="px-4 py-3 text-[12px] font-semibold leading-relaxed text-amber">
            La fermeture est définitive : le compte est anonymisé, ses permissions retirées et il
            ne pourra plus se connecter. Les décisions qu’il a prises restent au journal d’audit.
          </p>
        )}
      </div>
    </Dialogue>
  );
}

function DialoguePermissions({
  admin,
  soi,
  onFermer,
  onEnregistrer,
}: {
  admin: AdminEquipe;
  soi: boolean;
  onFermer: () => void;
  onEnregistrer: (permissions: string[]) => Promise<void>;
}) {
  const [brouillon, setBrouillon] = useState<string[]>(admin.permissions);
  const [enCours, setEnCours] = useState(false);

  const roleCourant = libelleRole(brouillon);
  const fige = admin.principal || soi;

  function basculer(cle: string, valeur: boolean) {
    setBrouillon((actuel) =>
      valeur ? [...new Set([...actuel, cle])] : actuel.filter((p) => p !== cle)
    );
  }

  return (
    <Dialogue
      titre={`Permissions — ${admin.nom}`}
      sousTitre={`Rôle actuel : ${roleCourant}`}
      icone="🛡️"
      onFermer={onFermer}
    >
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {/* Les rôles ne sont que des raccourcis : ce qui est enregistré, et
            ce qui commande la base, reste la liste des permissions. */}
        <span className={ETIQUETTE}>Appliquer un rôle</span>
        <div className="mb-4 flex flex-wrap gap-2">
          {ROLES.map((r) => (
            <button
              key={r.cle}
              type="button"
              disabled={fige}
              title={r.detail}
              onClick={() => setBrouillon(permissionsDuRole(r.cle))}
              className={`rounded-full border px-[13px] py-[7px] text-[11.5px] font-bold disabled:opacity-40 ${
                roleCourant === r.libelle
                  ? "border-blue bg-blue text-white"
                  : "border-[#CDE6F2] bg-teal-soft text-blue"
              }`}
            >
              {r.libelle}
            </button>
          ))}
        </div>

        <span className={ETIQUETTE}>Permissions</span>
        <div className="rounded-xl border border-line">
          {CATALOGUE_PERMISSIONS.map((p) => (
            <div
              key={p.cle}
              className="flex items-center justify-between gap-[14px] border-b border-line px-[13px] py-[13px] last:border-b-0"
            >
              <div className="min-w-0">
                <b className="block text-[13px] font-bold">
                  <span aria-hidden>{p.icone}</span> {p.titre}
                </b>
                <small className="text-[11.5px] leading-snug text-muted">{p.detail}</small>
              </div>
              {fige ? (
                <span className="flex-none rounded-lg bg-[#EEF1F4] px-[9px] py-1 text-[11px] font-bold text-[#7E8C97]">
                  {admin.principal ? "Toujours" : "Verrouillé"}
                </span>
              ) : (
                <Interrupteur
                  actif={brouillon.includes(p.cle)}
                  onChange={(v) => basculer(p.cle, v)}
                  label={p.titre}
                />
              )}
            </div>
          ))}
        </div>

        <div className="mt-3 flex items-center justify-between gap-[14px] rounded-xl border border-[#F3C9C2] bg-red-soft px-[13px] py-3">
          <div>
            <b className="block text-[13px] font-bold text-red">🔒 Dossiers médicaux</b>
            <small className="text-[11.5px] text-muted">
              Aucune permission ne l’ouvre, à personne
            </small>
          </div>
          <span className="flex-none rounded-lg bg-white px-[9px] py-1 text-[11px] font-bold text-red">
            Verrouillé
          </span>
        </div>
      </div>

      {/* Boutons hors du défilement : la liste des permissions est longue. */}
      <div className="flex flex-wrap gap-2.5 border-t border-line p-4">
        <button
          type="button"
          onClick={onFermer}
          className="flex-1 rounded-[11px] border-[1.5px] border-line bg-white px-[14px] py-3 text-[13px] font-bold text-blue transition-colors hover:bg-bg"
        >
          {fige ? "Fermer" : "Annuler"}
        </button>
        {!fige && (
          <button
            type="button"
            disabled={enCours}
            onClick={async () => {
              setEnCours(true);
              await onEnregistrer(brouillon);
              setEnCours(false);
            }}
            className="flex-1 rounded-[11px] bg-teal px-[14px] py-3 text-[13px] font-bold text-white disabled:opacity-50"
          >
            {enCours ? "Enregistrement…" : "Enregistrer"}
          </button>
        )}
      </div>
    </Dialogue>
  );
}
