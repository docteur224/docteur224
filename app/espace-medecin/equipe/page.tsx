"use client";

import { useState } from "react";
import Link from "next/link";
import MedecinShell from "@/components/medecin/MedecinShell";
import Interrupteur from "@/components/patient/Interrupteur";
import EnTeteMobile from "@/components/mobile/EnTeteMobile";
import Dialogue from "@/components/site/Dialogue";
import ChampMotDePasse from "@/components/site/ChampMotDePasse";
import {
  creerAssistant,
  majPermissionsAssistant,
  majStatutAssistant,
  supprimerAssistant,
  useContextePro,
  useEquipe,
  useQuotaAssistants,
  type AssistantEquipe,
} from "@/lib/pro";
import {
  CATALOGUE_ASSISTANT,
  libelleProfil,
  permissionsDuProfil,
  PROFILS,
  type CleProfil,
} from "@/lib/permissions-assistant";
import { motDePasseProvisoire } from "@/lib/permissions-admin";

/*
 * Mes assistant(e)s — reproduit l'écran « med-equipe » de la maquette web,
 * et le rend enfin utilisable : « + Ajouter un(e) assistant(e) » était un
 * bouton désactivé, et les seuls comptes existants venaient du seed. Un
 * médecin peut désormais ouvrir un compte, en régler les permissions, le
 * désactiver ou le fermer.
 *
 * LE NOMBRE DE PLACES VIENT DE LA FORMULE (migration 0044) : Standard en
 * ouvre une, Premium trois, et l'administrateur règle ces valeurs depuis
 * /espace-admin/abonnements sans qu'une ligne de code ne change. Le plafond
 * affiché ici est lu par la même fonction SQL que celle appliquée par le
 * trigger — un plafond affiché qui ne serait pas celui appliqué serait pire
 * que pas de plafond du tout.
 *
 * Cloisonnement inchangé (spec C.4.4) : aucune permission n'ouvre les
 * dossiers médicaux ni les données financières.
 */

const GRADIENTS = [
  "linear-gradient(135deg,#2E9CCA,#15506B)",
  "linear-gradient(135deg,#6C5CE7,#341F97)",
  "linear-gradient(135deg,#16A085,#0E6655)",
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
    .toUpperCase() || "?";

const CHAMP =
  "w-full rounded-xl border border-line bg-white p-[13px] text-[13.5px] outline-none focus:border-teal";
const ETIQUETTE = "mb-1.5 block text-[12.5px] font-bold";
const AIDE = "mt-1.5 block text-[11.5px] leading-snug text-muted";
const BOUTON_SECONDAIRE =
  "flex-1 rounded-[11px] border-[1.5px] border-line bg-white px-[14px] py-3 text-[13px] font-bold text-blue transition-colors hover:bg-bg";
const BOUTON_PRINCIPAL =
  "flex-1 rounded-[11px] bg-teal px-[14px] py-3 text-[13px] font-bold text-white disabled:opacity-50";

const NOM_FORMULE: Record<string, string> = {
  standard: "Standard",
  premium: "Premium",
  structure: "Structure de proximité",
  cabinet: "Cabinet / plateau technique",
  clinique: "Clinique / centre médical",
  hopital: "Hôpital / centre hospitalier",
};

export default function EquipeMedecin() {
  const { medecin } = useContextePro();
  const { assistants, chargement, recharger } = useEquipe(medecin?.id);
  const [version, setVersion] = useState(0);
  const quota = useQuotaAssistants(version);

  const [creation, setCreation] = useState(false);
  const [actionsSur, setActionsSur] = useState<AssistantEquipe | null>(null);
  const [permissionsSur, setPermissionsSur] = useState<AssistantEquipe | null>(null);
  const [message, setMessage] = useState<{ texte: string; erreur: boolean } | null>(null);

  /** Le plafond se relit avec la liste : fermer un compte libère une place. */
  function terminer(res: { erreur?: string }, succes: string): boolean {
    setMessage(res.erreur ? { texte: res.erreur, erreur: true } : { texte: succes, erreur: false });
    if (!res.erreur) {
      recharger();
      setVersion((v) => v + 1);
    }
    return !res.erreur;
  }

  const complet = quota?.complet ?? false;
  const sansAbonnement = quota !== null && quota.formule === null;
  // L'accord suit le NOMBRE DE PLACES, pas celui des places prises : « 1 / 2 »
  // se lit comme un rapport, et « 1 / 2 places utilisée » ne se dit pas.
  const resumeQuota = quota
    ? `${quota.occupees} / ${quota.places} place${quota.places > 1 ? "s" : ""} utilisée${quota.places > 1 ? "s" : ""}${
        quota.formule ? ` · formule ${NOM_FORMULE[quota.formule] ?? quota.formule}` : ""
      }`
    : "…";

  const motifBlocage = sansAbonnement
    ? "Les places d’assistant(e) sont ouvertes par votre formule : activez un abonnement pour en ouvrir une."
    : complet
      ? `Votre formule ${quota?.formule ? (NOM_FORMULE[quota.formule] ?? quota.formule) : ""} ouvre ${quota?.places} place${(quota?.places ?? 0) > 1 ? "s" : ""}. Fermez un compte, ou changez de formule.`
      : null;

  function ouvrirCreation() {
    setMessage(null);
    setCreation(true);
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

  const lignes = assistants.map((a) => ({
    assistant: a,
    initiales: initiales(a.nomComplet),
    gradient: gradientPour(a.id),
    profil: libelleProfil(a.cles),
  }));

  return (
    <MedecinShell reserveAuMedecin>
      {/* ===== Version mobile (écran « m-med-equipe » de la maquette mobile) ===== */}
      <div className="md:hidden">
        <EnTeteMobile retour="/espace-medecin/compte" titre="Mes assistant(e)s" />
        <div className="pad">
          <div className="abannerm" style={{ marginTop: 0 }}>
            <span aria-hidden>👥</span>
            <div>
              <b>{resumeQuota}</b>
              {motifBlocage && <div style={{ marginTop: 2 }}>{motifBlocage}</div>}
            </div>
          </div>
          <button
            type="button"
            className="btn block"
            style={{ marginTop: 0, opacity: motifBlocage ? 0.5 : 1 }}
            disabled={!!motifBlocage}
            onClick={ouvrirCreation}
          >
            + Ajouter un(e) assistant(e)
          </button>
          {motifBlocage && (
            <Link
              href="/espace-medecin/abonnement"
              className="btn ghost block"
              style={{ marginTop: 8, display: "block", textAlign: "center" }}
            >
              Voir les formules
            </Link>
          )}

          <div className="card2" style={{ marginTop: 12 }}>
            <h4>Comptes de l’équipe · {assistants.length}</h4>
            {bandeau}
            {chargement && <p className="muted" style={{ fontSize: 12.5 }}>Chargement…</p>}
            {!chargement && lignes.length === 0 && (
              <p className="muted" style={{ fontSize: 13 }}>
                Aucun(e) assistant(e) rattaché(e) pour le moment.
              </p>
            )}
            {lignes.map(({ assistant, initiales: ini, gradient, profil }) => (
              <button
                key={assistant.id}
                type="button"
                className="asstrowm"
                style={{ width: "100%", textAlign: "left", background: "none", border: "none" }}
                onClick={() => {
                  setMessage(null);
                  setActionsSur(assistant);
                }}
              >
                <span className="av" aria-hidden style={{ background: gradient }}>
                  {ini}
                </span>
                <span className="meta">
                  <b>{assistant.nomComplet}</b>
                  <small style={{ display: "block" }}>{assistant.email}</small>
                  <small style={{ display: "block" }}>Permissions : {profil}</small>
                </span>
                <span className={`pill ${assistant.actif ? "ok" : "lock"}`}>
                  {assistant.actif ? "Actif" : "Désactivé"}
                </span>
              </button>
            ))}
          </div>

          <div className="card2">
            <h4>Ce qu’aucun(e) assistant(e) ne peut faire</h4>
            <div className="setrow">
              <div>
                <b>🔒 Dossiers médicaux</b>
                <small>Données de santé — réservées au médecin</small>
              </div>
              <span className="pill bad">Interdit</span>
            </div>
            <div className="setrow">
              <div>
                <b>🔒 Paiements et revenus</b>
                <small>Données financières — réservées au médecin</small>
              </div>
              <span className="pill bad">Interdit</span>
            </div>
          </div>
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
          <div className="flex items-center gap-2.5">
            <span className="rounded-full bg-teal-soft px-[13px] py-2 text-[12px] font-bold text-blue">
              {resumeQuota}
            </span>
            <button
              type="button"
              disabled={!!motifBlocage}
              title={motifBlocage ?? undefined}
              onClick={ouvrirCreation}
              className="rounded-[9px] bg-teal px-[14px] py-2 text-[12.5px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              + Ajouter un(e) assistant(e)
            </button>
          </div>
        </div>

        {motifBlocage && (
          <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-[#F2D9B6] bg-[#FFF5E9] px-[14px] py-3 text-[12.5px] font-semibold leading-relaxed text-[#8A5A1B]">
            <span aria-hidden>💳</span>
            <span className="flex-1">{motifBlocage}</span>
            <Link
              href="/espace-medecin/abonnement"
              className="rounded-[9px] border-[1.5px] border-[#E5C79C] bg-white px-3 py-1.5 text-[11.5px] font-bold text-[#8A5A1B]"
            >
              Voir les formules
            </Link>
          </div>
        )}

        <div className="mb-4 rounded-2xl border border-line bg-white p-5">
          <h3 className="mb-1 text-[15px] font-extrabold">Comptes de l’équipe</h3>
          {bandeau}
          {chargement && <p className="py-3 text-[13px] text-muted">Chargement…</p>}
          {!chargement && lignes.length === 0 && (
            <p className="py-3 text-[13px] text-muted">
              Aucun(e) assistant(e) rattaché(e) pour le moment.
            </p>
          )}
          {lignes.map(({ assistant, initiales: ini, gradient, profil }) => (
            <div
              key={assistant.id}
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
                <b className="block text-sm font-extrabold">{assistant.nomComplet}</b>
                <small className="text-xs text-muted">
                  {assistant.email} · {profil}
                </small>
              </div>
              <span
                className={`flex-none text-[11.5px] font-bold ${
                  assistant.actif ? "text-green" : "text-[#7E8C97]"
                }`}
              >
                <span aria-hidden>●</span> {assistant.actif ? "Actif" : "Désactivé"}
              </span>
              <button
                type="button"
                onClick={() => {
                  setMessage(null);
                  setPermissionsSur(assistant);
                }}
                className="flex-none rounded-[9px] border-[1.5px] border-line bg-white px-3 py-1.5 text-[11.5px] font-bold text-blue transition-colors hover:bg-bg"
              >
                Permissions
              </button>
              <button
                type="button"
                aria-label={`Gérer le compte de ${assistant.nomComplet}`}
                onClick={() => {
                  setMessage(null);
                  setActionsSur(assistant);
                }}
                className="flex-none rounded-[9px] border-[1.5px] border-line bg-white px-3 py-1.5 text-[13px] font-bold text-muted transition-colors hover:bg-bg"
              >
                ⋯
              </button>
            </div>
          ))}
        </div>

        <div className="rounded-2xl border border-line bg-white p-5">
          <h3 className="mb-1 text-[15px] font-extrabold">
            Ce qu’aucun(e) assistant(e) ne peut faire
          </h3>
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
      </div>

      {/* ===== Dialogues (communs aux deux mises en page) ===== */}
      {creation && (
        <DialogueCreation
          onFermer={() => setCreation(false)}
          onCree={(res, nom) => {
            if (terminer(res, `Le compte de ${nom} a été créé.`)) setCreation(false);
          }}
        />
      )}

      {actionsSur && (
        <DialogueActions
          assistant={actionsSur}
          onFermer={() => setActionsSur(null)}
          onPermissions={() => {
            setPermissionsSur(actionsSur);
            setActionsSur(null);
          }}
          onStatut={async () => {
            const res = await majStatutAssistant(actionsSur.id, !actionsSur.actif);
            const ok = terminer(
              res,
              actionsSur.actif
                ? `Le compte de ${actionsSur.nomComplet} est désactivé.`
                : `Le compte de ${actionsSur.nomComplet} est réactivé.`
            );
            if (ok) setActionsSur(null);
          }}
          onSupprimer={async () => {
            const res = await supprimerAssistant(actionsSur.id);
            const ok = terminer(
              res,
              `Le compte de ${actionsSur.nomComplet} est fermé, sa place est libérée.`
            );
            if (ok) setActionsSur(null);
          }}
        />
      )}

      {permissionsSur && (
        <DialoguePermissions
          assistant={permissionsSur}
          onFermer={() => setPermissionsSur(null)}
          onEnregistrer={async (permissions) => {
            const res = await majPermissionsAssistant(permissionsSur.id, permissions);
            const ok = terminer(res, `Permissions de ${permissionsSur.nomComplet} enregistrées.`);
            if (ok) setPermissionsSur(null);
          }}
        />
      )}
    </MedecinShell>
  );
}

/* ===================== Dialogues ===================== */

function DialogueCreation({
  onFermer,
  onCree,
}: {
  onFermer: () => void;
  onCree: (res: { erreur?: string }, nom: string) => void;
}) {
  const [nomComplet, setNomComplet] = useState("");
  const [email, setEmail] = useState("");
  const [motDePasse, setMotDePasse] = useState("");
  const [profil, setProfil] = useState<CleProfil>("secretariat");
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const definition = PROFILS.find((p) => p.cle === profil)!;

  async function soumettre(e: React.FormEvent) {
    e.preventDefault();
    setErreur(null);
    setEnCours(true);
    const res = await creerAssistant({
      nomComplet: nomComplet.trim(),
      email: email.trim(),
      motDePasse,
      permissions: permissionsDuProfil(profil),
    });
    setEnCours(false);
    // L'erreur reste DANS le dialogue : le refermer pour lire un bandeau
    // derrière ferait perdre la saisie.
    if (res.erreur) setErreur(res.erreur);
    else onCree(res, nomComplet.trim());
  }

  return (
    <Dialogue
      titre="Ajouter un(e) assistant(e)"
      icone="🧑‍💼"
      onFermer={onFermer}
      pied={
        <>
          <button type="button" onClick={onFermer} className={BOUTON_SECONDAIRE}>
            Annuler
          </button>
          <button type="submit" form="form-assistant" disabled={enCours} className={BOUTON_PRINCIPAL}>
            {enCours ? "Création…" : "Créer le compte"}
          </button>
        </>
      }
    >
      <form id="form-assistant" onSubmit={soumettre} className="p-4">
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
            placeholder="prenom@exemple.com"
            autoComplete="off"
            required
          />
          <span className={AIDE}>
            C’est avec elle que l’assistant(e) se connectera. Elle doit être différente de celle de
            vos patients et de la vôtre.
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

        <label className="block">
          <span className={ETIQUETTE}>Permissions de départ</span>
          <select
            className={CHAMP}
            value={profil}
            onChange={(e) => setProfil(e.target.value as CleProfil)}
          >
            {PROFILS.map((p) => (
              <option key={p.cle} value={p.cle}>
                {p.libelle}
              </option>
            ))}
          </select>
          <span className={AIDE}>
            {definition.detail}. Elles se règlent ensuite une par une depuis la liste.
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
      </form>
    </Dialogue>
  );
}

function DialogueActions({
  assistant,
  onFermer,
  onPermissions,
  onStatut,
  onSupprimer,
}: {
  assistant: AssistantEquipe;
  onFermer: () => void;
  onPermissions: () => void;
  onStatut: () => Promise<void>;
  onSupprimer: () => Promise<void>;
}) {
  const [confirme, setConfirme] = useState(false);
  const [enCours, setEnCours] = useState(false);

  const action =
    "flex w-full items-center gap-3 border-b border-line px-4 py-[15px] text-left text-[13.5px] font-bold last:border-b-0 disabled:opacity-40";

  async function lancer(geste: () => Promise<void>) {
    setEnCours(true);
    await geste();
    setEnCours(false);
  }

  return (
    <Dialogue
      titre={assistant.nomComplet}
      sousTitre={`${assistant.email} · ${libelleProfil(assistant.cles)}`}
      icone={
        <span
          className="grid h-[34px] w-[34px] place-items-center rounded-xl text-[12px] font-extrabold text-white"
          style={{ background: gradientPour(assistant.id) }}
        >
          {initiales(assistant.nomComplet)}
        </span>
      }
      onFermer={onFermer}
    >
      <button type="button" className={`${action} text-blue`} disabled={enCours} onClick={onPermissions}>
        <span aria-hidden>✏️</span> Modifier les permissions
      </button>

      <button
        type="button"
        className={`${action} text-amber`}
        disabled={enCours}
        onClick={() => lancer(onStatut)}
      >
        <span aria-hidden>⏻</span>
        {assistant.actif ? "Désactiver le compte" : "Réactiver le compte"}
      </button>

      <button
        type="button"
        className={`${action} text-red-600`}
        disabled={enCours}
        onClick={() => (confirme ? lancer(onSupprimer) : setConfirme(true))}
      >
        <span aria-hidden>🗑️</span>
        {enCours && confirme
          ? "Fermeture…"
          : confirme
            ? "Confirmer la fermeture"
            : "Fermer le compte"}
      </button>

      <p className="px-4 py-3 text-[12px] font-semibold leading-relaxed text-muted">
        {confirme
          ? "La fermeture est définitive : le compte est anonymisé et ne pourra plus se connecter. Les rendez-vous qu’il a pris restent à votre agenda."
          : "Un compte désactivé occupe toujours sa place ; seule la fermeture la libère pour quelqu’un d’autre."}
      </p>
    </Dialogue>
  );
}

function DialoguePermissions({
  assistant,
  onFermer,
  onEnregistrer,
}: {
  assistant: AssistantEquipe;
  onFermer: () => void;
  onEnregistrer: (permissions: string[]) => Promise<void>;
}) {
  const [brouillon, setBrouillon] = useState<string[]>(assistant.cles);
  const [enCours, setEnCours] = useState(false);
  const profilCourant = libelleProfil(brouillon);

  function basculer(cle: string, valeur: boolean) {
    setBrouillon((actuel) =>
      valeur ? [...new Set([...actuel, cle])] : actuel.filter((p) => p !== cle)
    );
  }

  return (
    <Dialogue
      titre={`Permissions — ${assistant.nomComplet}`}
      sousTitre={`Profil actuel : ${profilCourant}`}
      icone="🧑‍💼"
      onFermer={onFermer}
      pied={
        <>
          <button type="button" onClick={onFermer} className={BOUTON_SECONDAIRE}>
            Annuler
          </button>
          <button
            type="button"
            disabled={enCours}
            onClick={async () => {
              setEnCours(true);
              await onEnregistrer(brouillon);
              setEnCours(false);
            }}
            className={BOUTON_PRINCIPAL}
          >
            {enCours ? "Enregistrement…" : "Enregistrer"}
          </button>
        </>
      }
    >
      <div className="p-4">
        {/* Les profils ne sont que des raccourcis : ce qui est enregistré,
            et ce que la RLS applique, reste la liste des permissions. */}
        <span className={ETIQUETTE}>Appliquer un profil</span>
        <div className="mb-4 flex flex-wrap gap-2">
          {PROFILS.map((p) => (
            <button
              key={p.cle}
              type="button"
              title={p.detail}
              onClick={() => setBrouillon(permissionsDuProfil(p.cle))}
              className={`rounded-full border px-[13px] py-[7px] text-[11.5px] font-bold ${
                profilCourant === p.libelle
                  ? "border-blue bg-blue text-white"
                  : "border-[#CDE6F2] bg-teal-soft text-blue"
              }`}
            >
              {p.libelle}
            </button>
          ))}
        </div>

        <span className={ETIQUETTE}>Permissions</span>
        <div className="rounded-xl border border-line">
          {CATALOGUE_ASSISTANT.map((p) => (
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
              <Interrupteur
                actif={brouillon.includes(p.cle)}
                onChange={(v) => basculer(p.cle, v)}
                label={p.titre}
              />
            </div>
          ))}
        </div>

        <div className="mt-3 rounded-xl border border-[#F3C9C2] bg-red-soft px-[13px] py-3">
          <b className="block text-[13px] font-bold text-red">
            🔒 Dossiers médicaux et données financières
          </b>
          <small className="text-[11.5px] leading-snug text-muted">
            Aucune de ces permissions ne les ouvre. La barrière est posée par la base de données.
          </small>
        </div>
      </div>
    </Dialogue>
  );
}
