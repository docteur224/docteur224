"use client";

import { useState } from "react";
import Link from "next/link";
import ChangerMotDePasse from "@/components/patient/ChangerMotDePasse";
import ExporterMesDonnees from "@/components/patient/ExporterMesDonnees";
import EnTeteMobile from "@/components/mobile/EnTeteMobile";
import { useProfilConnecte } from "@/lib/patient";
import { useDroitsAdmin } from "@/lib/admin";
import { PERMISSIONS } from "@/lib/permissions-admin";
import {
  basculerSuspension,
  droitsDuCompte,
  fermerMonCompte,
  LIBELLE_EVENEMENT,
  LIBELLE_STATUT_ABONNEMENT,
  MESSAGE_SANS_ABONNEMENT,
  useDossierAbonnement,
} from "@/lib/compte";

/*
 * « Mon compte » — le même écran pour les cinq rôles.
 *
 * UN SEUL COMPOSANT, et non un par espace : ce qu'un compte porte — son
 * mot de passe, son état, son abonnement — ne dépend pas du rôle. Chaque
 * espace ne fournit que sa coquille (barre latérale, tabbar) et le lien de
 * retour du bandeau mobile.
 *
 * Ce que l'écran ne promet jamais : les actions refusées par la base sont
 * masquées ou expliquées, jamais proposées pour échouer ensuite. Un
 * super-administrateur ne voit pas de bouton « Suspendre » — il lit
 * pourquoi.
 */

const NOM_ROLE: Record<string, string> = {
  patient: "Patient",
  medecin: "Médecin",
  assistant: "Assistant(e)",
  etablissement: "Établissement",
  admin: "Administrateur",
};

const NOM_FORMULE: Record<string, string> = {
  standard: "Standard",
  premium: "Premium",
  structure: "Structure de proximité",
  cabinet: "Cabinet / plateau technique",
  clinique: "Clinique / centre médical",
  hopital: "Hôpital / centre hospitalier",
};

const MOT_DE_CONFIRMATION = "FERMER";

const CONSEQUENCES: Record<string, string[]> = {
  patient: [
    "Vos rendez-vous à venir sont annulés et les créneaux rendus aux médecins.",
    "Vos proches et vos informations personnelles sont effacés.",
    "Vos consultations déjà honorées restent au dossier du praticien, sans votre identité.",
  ],
  medecin: [
    "Votre fiche disparaît de la recherche et vos rendez-vous à venir sont annulés.",
    "Vos assistant(e)s perdent l’accès à votre agenda.",
    "Les consultations déjà honorées restent au dossier de vos patients.",
  ],
  assistant: [
    "Vous perdez l’accès à l’agenda du cabinet.",
    "La place que vous occupiez dans l’équipe est rendue au médecin.",
    "Les rendez-vous que vous avez pris restent à son agenda.",
  ],
  etablissement: [
    "La fiche de l’établissement disparaît de la recherche.",
    "Les médecins encore rattachés doivent être détachés au préalable.",
    "L’abonnement en cours est clos.",
  ],
  admin: [
    "Vous perdez immédiatement l’accès à la console d’administration.",
    "Les décisions que vous avez prises restent au journal d’audit, à votre nom.",
  ],
};

const CARTE = "rounded-2xl border border-line bg-white p-5";
const TITRE_CARTE = "mb-1 text-[15px] font-extrabold";
const LIGNE = "flex flex-wrap items-center justify-between gap-[14px] border-b border-line py-[15px] last:border-b-0";
const BOUTON_LEGER =
  "rounded-[9px] border-[1.5px] border-line bg-white px-[14px] py-2 text-[12.5px] font-bold text-blue transition-colors hover:bg-bg";

const gnf = (n: number) => `${n.toLocaleString("fr-FR").replace(/ | /g, " ")} GNF`;
const jour = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }) : "—";

export default function MonCompte({ retourMobile }: { retourMobile: string }) {
  const { profil, chargement } = useProfilConnecte();
  const { droits } = useDroitsAdmin(profil?.role === "admin");
  const role = profil?.role;
  const acces = droitsDuCompte(role, droits, PERMISSIONS.length);
  const dossier = useDossierAbonnement(acces.aUnAbonnement);

  const [message, setMessage] = useState<{ texte: string; erreur: boolean } | null>(null);

  const suspendu = profil?.statut === "suspendu";

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

  return (
    <>
      <div className="md:hidden">
        <EnTeteMobile retour={retourMobile} titre="Mon compte" />
      </div>

      <div className="md:pt-0">
        <div className="hidden md:mb-5 md:block">
          <h2 className="text-[21px] font-extrabold tracking-[-0.3px]">Mon compte</h2>
          <small className="text-[13px] text-muted">
            Identité, sécurité, abonnement et fermeture du compte
          </small>
        </div>

        <div className="grid gap-4 px-4 pb-6 md:px-0 md:pb-0">
          {bandeau}

          <Identite profil={profil} chargement={chargement} suspendu={suspendu} />

          <section className={CARTE}>
            <h3 className={TITRE_CARTE}>Sécurité</h3>
            <ChangerMotDePasse />
            <div className={LIGNE}>
              <div>
                <b className="block text-[13.5px] font-bold">
                  Authentification à deux facteurs (2FA)
                </b>
                <small className="text-xs text-muted">Sécuriser la connexion par code SMS</small>
              </div>
              <span className="text-[11.5px] font-bold text-muted">Bientôt disponible</span>
            </div>
          </section>

          <Abonnement acces={acces} dossier={dossier} role={role} />

          {/* L'export n'est proposé qu'au patient : la route rassemble ses
              rendez-vous, ses proches et ses avis. Pour un professionnel,
              elle rendrait un fichier à moitié vide — mieux vaut ne rien
              promettre que promettre à moitié. */}
          {role === "patient" && (
            <section className={CARTE}>
              <h3 className={TITRE_CARTE}>Mes données</h3>
              <ExporterMesDonnees />
            </section>
          )}

          <ZoneSensible
            role={role}
            suspendu={suspendu}
            acces={acces}
            onMessage={setMessage}
          />
        </div>
      </div>
    </>
  );
}

/* ===================== Identité ===================== */

function Identite({
  profil,
  chargement,
  suspendu,
}: {
  profil: ReturnType<typeof useProfilConnecte>["profil"];
  chargement: boolean;
  suspendu: boolean;
}) {
  const nom = `${profil?.prenom ?? ""} ${profil?.nom ?? ""}`.trim() || profil?.email || "…";
  const initiales =
    `${profil?.prenom?.charAt(0) ?? ""}${profil?.nom?.charAt(0) ?? ""}`.toUpperCase() || "?";

  return (
    <section className={CARTE}>
      <div className="flex flex-wrap items-center gap-[13px]">
        <span
          aria-hidden
          className="grid h-[46px] w-[46px] flex-none place-items-center rounded-xl text-[15px] font-extrabold text-white"
          style={{ background: "linear-gradient(135deg,#2E9CCA,#15506B)" }}
        >
          {initiales}
        </span>
        <div className="min-w-0 flex-1">
          <b className="block text-[15px] font-extrabold">{chargement ? "…" : nom}</b>
          <small className="text-xs text-muted">
            {profil ? `${NOM_ROLE[profil.role] ?? profil.role} · ${profil.email}` : ""}
          </small>
        </div>
        <span
          className={`flex-none rounded-lg px-[9px] py-1 text-[11px] font-bold ${
            suspendu ? "bg-amber-soft text-amber" : "bg-green-soft text-green"
          }`}
        >
          {suspendu ? "Suspendu" : "Actif"}
        </span>
      </div>
      {profil && (
        <p className="mt-3 text-[12px] text-muted">
          Membre depuis le {jour(profil.creeLe)}
        </p>
      )}
    </section>
  );
}

/* ===================== Abonnement ===================== */

function Abonnement({
  acces,
  dossier,
  role,
}: {
  acces: ReturnType<typeof droitsDuCompte>;
  dossier: ReturnType<typeof useDossierAbonnement>;
  role: string | undefined;
}) {
  const [onglet, setOnglet] = useState<"actuel" | "historique" | "versements">("actuel");

  if (!acces.aUnAbonnement) {
    return (
      <section className={CARTE}>
        <h3 className={TITRE_CARTE}>Abonnement</h3>
        <p className="py-3 text-[12.5px] leading-relaxed text-muted">{MESSAGE_SANS_ABONNEMENT}</p>
      </section>
    );
  }

  const a = dossier.abonnement;
  const lienFormules =
    role === "etablissement" ? "/espace-etablissement/abonnement" : "/espace-medecin/abonnement";

  const onglets = [
    { cle: "actuel" as const, libelle: "Abonnement actuel" },
    { cle: "historique" as const, libelle: `Historique (${dossier.historique.length})` },
    { cle: "versements" as const, libelle: `Versements (${dossier.versements.length})` },
  ];

  return (
    <section className={CARTE}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-[15px] font-extrabold">Abonnement</h3>
        <Link href={lienFormules} className={BOUTON_LEGER}>
          Changer de formule
        </Link>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {onglets.map((o) => (
          <button
            key={o.cle}
            type="button"
            onClick={() => setOnglet(o.cle)}
            className={`rounded-full border px-[13px] py-[7px] text-[11.5px] font-bold ${
              onglet === o.cle
                ? "border-blue bg-blue text-white"
                : "border-[#CDE6F2] bg-teal-soft text-blue"
            }`}
          >
            {o.libelle}
          </button>
        ))}
      </div>

      {dossier.chargement && <p className="py-3 text-[12.5px] text-muted">Chargement…</p>}

      {!dossier.chargement && onglet === "actuel" && (
        <>
          {!a && (
            <p className="py-3 text-[12.5px] text-muted">
              Aucun abonnement ouvert. Choisissez une formule pour activer votre fiche.
            </p>
          )}
          {a && (
            <>
              <div className="mb-3 flex flex-wrap items-center gap-2.5">
                <b className="text-[17px] font-extrabold">{NOM_FORMULE[a.formule] ?? a.formule}</b>
                <span
                  className={`rounded-lg px-[9px] py-1 text-[11px] font-bold ${
                    a.statut === "actif"
                      ? "bg-green-soft text-green"
                      : a.statut === "essai"
                        ? "bg-teal-soft text-blue"
                        : "bg-amber-soft text-amber"
                  }`}
                >
                  {LIBELLE_STATUT_ABONNEMENT[a.statut] ?? a.statut}
                </span>
                {a.joursRestants !== null && a.joursRestants <= 30 && (
                  <span className="rounded-lg bg-amber-soft px-[9px] py-1 text-[11px] font-bold text-amber">
                    {a.joursRestants === 0
                      ? "Échéance aujourd’hui"
                      : `${a.joursRestants} jour${a.joursRestants > 1 ? "s" : ""} restant${a.joursRestants > 1 ? "s" : ""}`}
                  </span>
                )}
              </div>
              <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
                <Detail titre="Périodicité" valeur={a.periode === "annuel" ? "Annuelle" : "Mensuelle"} />
                <Detail
                  titre="Montant"
                  valeur={gnf(a.periode === "annuel" ? a.prixAnnuel : a.prixMensuel)}
                  precision={a.periode === "annuel" ? "par an" : "par mois"}
                />
                <Detail titre="Souscrit le" valeur={jour(a.dateDebut)} />
                <Detail
                  titre="Échéance"
                  valeur={a.dateFin ? jour(a.dateFin) : "Sans terme"}
                  precision={a.dateFin ? undefined : "période gratuite de lancement"}
                />
                <Detail
                  titre="SMS inclus"
                  valeur={`${a.quotaSms.toLocaleString("fr-FR")} par mois`}
                  precision="quota du contrat"
                />
                {role === "medecin" && (
                  <Detail
                    titre="Assistant(e)s inclus(es)"
                    valeur={`${a.assistantsInclus} place${a.assistantsInclus > 1 ? "s" : ""}`}
                  />
                )}
              </dl>
            </>
          )}
        </>
      )}

      {!dossier.chargement && onglet === "historique" && (
        <>
          {dossier.historique.length === 0 && (
            <p className="py-3 text-[12.5px] text-muted">Aucun mouvement enregistré.</p>
          )}
          <ol className="relative">
            {dossier.historique.map((h) => (
              <li key={h.id} className="flex gap-3 border-b border-line py-3 last:border-b-0">
                <span
                  aria-hidden
                  className="mt-1 h-2 w-2 flex-none rounded-full"
                  style={{ background: h.evenement === "resiliation" ? "#C0392B" : "#2E9CCA" }}
                />
                <div className="min-w-0 flex-1">
                  <b className="block text-[13px] font-bold">
                    {LIBELLE_EVENEMENT[h.evenement] ?? h.evenement}
                  </b>
                  <small className="block text-[11.5px] text-muted">{h.detail}</small>
                </div>
                <small className="flex-none text-right text-[11.5px] text-muted">
                  {jour(h.creeLe)}
                  {h.parLaPlateforme && <span className="block">par la plateforme</span>}
                </small>
              </li>
            ))}
          </ol>
        </>
      )}

      {!dossier.chargement && onglet === "versements" && (
        <>
          {dossier.versements.length === 0 && (
            <p className="py-3 text-[12.5px] text-muted">
              Aucun versement. Les règlements apparaîtront ici, avec leur référence.
            </p>
          )}
          {dossier.versements.map((v) => (
            <div key={v.id} className="flex flex-wrap items-center gap-3 border-b border-line py-3 last:border-b-0">
              <div className="min-w-0 flex-1">
                <b className="block text-[13px] font-bold">{v.objet}</b>
                <small className="text-[11.5px] text-muted">
                  {jour(v.date)}
                  {v.moyen ? ` · ${v.moyen}` : ""}
                  {v.reference ? ` · ${v.reference}` : ""}
                  {v.motif ? ` · ${v.motif}` : ""}
                </small>
              </div>
              <b className="flex-none text-[13px] font-extrabold">{gnf(v.montantGnf)}</b>
              <span
                className={`flex-none rounded-lg px-[9px] py-1 text-[11px] font-bold ${
                  v.statut === "confirme"
                    ? "bg-green-soft text-green"
                    : v.statut === "refuse"
                      ? "bg-red-soft text-red"
                      : "bg-amber-soft text-amber"
                }`}
              >
                {v.statut === "confirme"
                  ? "Confirmé"
                  : v.statut === "refuse"
                    ? "Refusé"
                    : v.statut === "rembourse"
                      ? "Remboursé"
                      : "En attente"}
              </span>
            </div>
          ))}
        </>
      )}
    </section>
  );
}

function Detail({
  titre,
  valeur,
  precision,
}: {
  titre: string;
  valeur: string;
  precision?: string;
}) {
  return (
    <div>
      <dt className="text-[11.5px] font-bold uppercase tracking-[0.04em] text-muted">{titre}</dt>
      <dd className="text-[13.5px] font-bold">
        {valeur}
        {precision && <span className="ml-1 text-[11.5px] font-semibold text-muted">{precision}</span>}
      </dd>
    </div>
  );
}

/* ===================== Suspension et fermeture ===================== */

function ZoneSensible({
  role,
  suspendu,
  acces,
  onMessage,
}: {
  role: string | undefined;
  suspendu: boolean;
  acces: ReturnType<typeof droitsDuCompte>;
  onMessage: (m: { texte: string; erreur: boolean } | null) => void;
}) {
  const [ouvert, setOuvert] = useState(false);
  const [saisie, setSaisie] = useState("");
  const [enCours, setEnCours] = useState<"suspension" | "fermeture" | null>(null);

  const confirme = saisie.trim().toUpperCase() === MOT_DE_CONFIRMATION;
  const consequences = CONSEQUENCES[role ?? "patient"] ?? CONSEQUENCES.patient;

  async function basculer() {
    setEnCours("suspension");
    const res = await basculerSuspension(!suspendu);
    setEnCours(null);
    onMessage(
      res.erreur
        ? { texte: res.erreur, erreur: true }
        : {
            texte: suspendu
              ? "Compte réactivé. Vous êtes de nouveau visible."
              : "Compte suspendu. Vous pouvez le réactiver à tout moment.",
            erreur: false,
          }
    );
    // Rechargement complet : le statut commande les coquilles de tous les
    // espaces, et le cache du profil vit au niveau du module.
    if (!res.erreur) window.location.reload();
  }

  async function fermer() {
    if (!confirme) return;
    setEnCours("fermeture");
    const res = await fermerMonCompte();
    if (res.erreur) {
      setEnCours(null);
      onMessage({ texte: res.erreur, erreur: true });
      return;
    }
    // Rechargement complet plutôt qu'une navigation : la session est close
    // et tous les caches de module doivent repartir à zéro.
    window.location.assign("/");
  }

  if (acces.motifBlocage) {
    return (
      <section className={CARTE}>
        <h3 className={TITRE_CARTE}>Suspendre ou fermer mon compte</h3>
        <p className="py-3 text-[12.5px] leading-relaxed text-muted">{acces.motifBlocage}</p>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-[#F3C9C2] bg-white p-5">
      <h3 className="mb-1 text-[15px] font-extrabold text-red">Zone sensible</h3>

      {/* Les deux gestes s'empilent sous 640 px : côte à côte, le texte se
          réduisait à une colonne d'un mot contre le bouton. */}
      <div className="flex flex-col gap-3 border-b border-line py-[15px] sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-[14px]">
        <div className="min-w-0 flex-1">
          <b className="block text-[13.5px] font-bold">
            {suspendu ? "Réactiver mon compte" : "Suspendre mon compte"}
          </b>
          <small className="text-xs leading-snug text-muted">
            {suspendu
              ? "Vous redevenez visible et pouvez de nouveau utiliser la plateforme."
              : "Mise en pause réversible : rien n’est effacé. " +
                (role === "medecin"
                  ? "Votre fiche quitte la recherche et vous ne recevez plus de nouveaux rendez-vous."
                  : role === "etablissement"
                    ? "La fiche de l’établissement quitte la recherche."
                    : "Vous ne pouvez plus réserver tant que le compte est en pause.")}
          </small>
        </div>
        <button
          type="button"
          onClick={basculer}
          disabled={enCours !== null}
          className={`${BOUTON_LEGER} w-full flex-none disabled:opacity-50 sm:w-auto ${
            suspendu ? "!text-green" : "!text-amber"
          }`}
        >
          {enCours === "suspension"
            ? "…"
            : suspendu
              ? "Réactiver mon compte"
              : "Suspendre mon compte"}
        </button>
      </div>

      <div className="flex flex-col gap-3 py-[15px] sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-[14px]">
        <div className="min-w-0 flex-1">
          <b className="block text-[13.5px] font-bold">Fermer définitivement mon compte</b>
          <small className="text-xs text-muted">
            Votre compte est anonymisé et la connexion devient impossible.
          </small>
        </div>
        <button
          type="button"
          onClick={() => {
            setOuvert((o) => !o);
            setSaisie("");
          }}
          className="w-full flex-none rounded-[9px] border-[1.5px] border-[#F3C9C2] bg-white px-[14px] py-2 text-[12.5px] font-bold text-red transition-colors hover:bg-red-soft sm:w-auto"
        >
          {ouvert ? "Annuler" : "Fermer mon compte"}
        </button>
      </div>

      {ouvert && (
        <div className="border-t border-line pt-4">
          <ul className="mb-4 list-disc space-y-1 rounded-xl bg-red-soft py-3 pl-8 pr-4 text-[12.5px] font-semibold text-red">
            {consequences.map((c) => (
              <li key={c}>{c}</li>
            ))}
            <li>Cette action est définitive.</li>
          </ul>
          <label className="mb-1.5 block text-xs font-bold text-muted">
            Tapez « {MOT_DE_CONFIRMATION} » pour confirmer
          </label>
          <input
            className="w-full max-w-[280px] rounded-[11px] border border-line bg-white px-[13px] py-3 text-[13.5px] outline-none focus:border-red"
            placeholder={MOT_DE_CONFIRMATION}
            value={saisie}
            onChange={(e) => setSaisie(e.target.value)}
          />
          <div className="mt-4">
            <button
              type="button"
              onClick={fermer}
              disabled={!confirme || enCours !== null}
              className="rounded-[9px] bg-red px-[14px] py-2 text-[12.5px] font-bold text-white transition-colors hover:bg-[#a5301f] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {enCours === "fermeture" ? "Fermeture…" : "Fermer définitivement"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
