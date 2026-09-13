"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import EtablissementShell from "@/components/etablissement/EtablissementShell";
import Interrupteur from "@/components/patient/Interrupteur";
import {
  ETABLISSEMENT_VIDE,
  enregistrerParametresEtablissement,
  useEtablissementConnecte,
} from "@/lib/etablissement";
import EnTeteMobile from "@/components/mobile/EnTeteMobile";
import { seDeconnecter } from "@/lib/auth";
import { formaterTelephoneGN, INDICATIF_GN } from "@/lib/telephone";

type ParametresEtablissement = {
  affichagePublic: boolean;
  notifEmail: boolean;
  rappelsSms: boolean;
  premiumVedette: boolean;
};

/*
 * Compte & paramètres — le compte du gestionnaire et les préférences de
 * l'établissement (écran « etab-compte » de la maquette web).
 *
 * AUDIT — trois boutons ne faisaient pas ce qu'ils annonçaient :
 *
 *   · « Déconnexion », sur mobile, était un <Link href="/"> : il ramenait
 *     à l'accueil en laissant la session OUVERTE. Sur un téléphone
 *     partagé, le compte suivant reprenait la main sur l'établissement.
 *     C'est le bug que EtablissementShell avait déjà corrigé de son côté ;
 *     le menu mobile, lui, était resté sur le lien.
 *
 *   · « Changer » (mot de passe) était `disabled`, avec l'infobulle
 *     « Disponible avec l'authentification » — alors que
 *     /espace-etablissement/mon-compte change le mot de passe depuis la
 *     migration 0045. Il mène désormais là-bas. La mention « Dernière
 *     modification il y a 3 mois » disparaît : elle était écrite en dur.
 *
 *   · le menu mobile n'ouvrait ni « Informations » ni « Mon compte ».
 *     Le second n'était atteignable par AUCUN chemin sur téléphone : ni
 *     menu, ni onglet — donc pas de mot de passe, pas de suspension, pas
 *     d'export de données sur mobile.
 *
 * Le bandeau « Préférences enregistrées sur cet appareil (mode
 * démonstration) » était faux lui aussi : elles vont dans
 * `etablissements.parametres`, donc sur le compte, et suivent le
 * gestionnaire d'un appareil à l'autre.
 */

const PARAMETRES: {
  cle: keyof ParametresEtablissement;
  titre: string;
  detail: string;
}[] = [
  {
    cle: "affichagePublic",
    titre: "Fiche visible dans la recherche",
    detail: "Les patients trouvent l'établissement et ses médecins",
  },
  {
    cle: "notifEmail",
    titre: "Notifications par e-mail",
    detail: "Nouveaux rendez-vous, réponses aux invitations",
  },
  {
    cle: "rappelsSms",
    titre: "Rappels SMS aux patients",
    detail: "Rappel automatique avant chaque rendez-vous",
  },
  {
    cle: "premiumVedette",
    titre: "Mise en avant Premium (en vedette)",
    detail: "Établissement mis en avant dans les résultats de recherche",
  },
];

const ENTREES_MENU = [
  {
    href: "/espace-etablissement/statistiques",
    icone: "📊",
    titre: "Statistiques",
    sous: "Activité de l'établissement",
  },
  {
    href: "/espace-etablissement/medecins",
    icone: "👨‍⚕️",
    titre: "Médecins",
    sous: "Rattachements et invitations",
  },
  {
    href: "/espace-etablissement/informations",
    icone: "🏥",
    titre: "Informations",
    sous: "Fiche publique, photos",
  },
  {
    href: "/espace-etablissement/abonnement",
    icone: "💳",
    titre: "Abonnement",
    sous: "Palier de l'établissement",
  },
  {
    href: "/espace-etablissement/mon-compte",
    icone: "🔐",
    titre: "Mon compte",
    sous: "Mot de passe, suspension, données",
  },
];

export default function CompteEtablissement() {
  const router = useRouter();
  const { etablissement, recharger } = useEtablissementConnecte();
  const etab = etablissement ?? ETABLISSEMENT_VIDE;
  const parametres = {
    affichagePublic: true,
    notifEmail: true,
    rappelsSms: true,
    premiumVedette: false,
    ...etab.parametres,
  };
  const gestionnaire = etab.gestionnaire;
  const telephoneLisible = gestionnaire.telephone
    ? `${INDICATIF_GN} ${formaterTelephoneGN(gestionnaire.telephone)}`
    : "Non renseigné";

  async function basculer(cle: keyof ParametresEtablissement, valeur: boolean) {
    if (!etablissement) return;
    await enregistrerParametresEtablissement(etablissement.id, { ...parametres, [cle]: valeur });
    recharger();
  }

  async function deconnexion() {
    await seDeconnecter();
    router.push("/");
  }

  return (
    <EtablissementShell>
      {/* ===== Version mobile (écran « m-etab-compte » de la maquette mobile) ===== */}
      <div className="md:hidden">
        <EnTeteMobile variante="marque" />
        <div className="appbar">
          <h3 style={{ paddingLeft: 4 }}>Compte &amp; paramètres</h3>
        </div>
        <div className="pad">
          <div className="acctop">
            <span className="av" aria-hidden style={{ background: etab.gradient }}>
              🏥
            </span>
            <div>
              <b>{etab.nomCourt}</b>
              <small>Gestionnaire : {gestionnaire.nom || "—"}</small>
            </div>
          </div>
          <div className="menu">
            {ENTREES_MENU.map((e) => (
              <Link key={e.href} href={e.href} className="mrow">
                <span className="mi" aria-hidden>
                  {e.icone}
                </span>
                <span>
                  <b>{e.titre}</b>
                  <small>{e.sous}</small>
                </span>
                <span className="ch" aria-hidden>
                  ›
                </span>
              </Link>
            ))}
            {/* Vraie déconnexion, et non un lien vers l'accueil. */}
            <button type="button" onClick={deconnexion} className="mrow">
              <span className="mi" aria-hidden>
                ↩️
              </span>
              <span>
                <b>Déconnexion</b>
              </span>
              <span className="ch" aria-hidden>
                ›
              </span>
            </button>
          </div>
          <div className="card2" style={{ marginTop: 12 }}>
            <h4>Gestionnaire</h4>
            <div className="setrow">
              <div>
                <b>Nom</b>
                <small>{gestionnaire.nom || "—"}</small>
              </div>
            </div>
            <div className="setrow">
              <div>
                <b>Rôle</b>
                <small>{gestionnaire.role}</small>
              </div>
            </div>
            <div className="setrow">
              <div>
                <b>E-mail</b>
                <small>{gestionnaire.email || "—"}</small>
              </div>
            </div>
            <div className="setrow">
              <div>
                <b>Téléphone</b>
                <small>{telephoneLisible}</small>
              </div>
            </div>
            <div className="setrow">
              <div>
                <b>Mot de passe</b>
                <small>Modifiable depuis « Mon compte »</small>
              </div>
              <Link href="/espace-etablissement/mon-compte" className="btnm gh">
                Changer
              </Link>
            </div>
          </div>
          <div className="card2">
            <h4>Paramètres</h4>
            {PARAMETRES.map((parametre) => (
              <div key={parametre.cle} className="setrow">
                <div>
                  <b>{parametre.titre}</b>
                  <small>{parametre.detail}</small>
                </div>
                <Interrupteur
                  actif={parametres[parametre.cle]}
                  onChange={(val) => basculer(parametre.cle, val)}
                  label={parametre.titre}
                />
              </div>
            ))}
            <p className="muted" style={{ fontSize: 11.5, marginTop: 8 }}>
              Ces préférences sont enregistrées sur le compte de l&apos;établissement : vous les
              retrouvez sur tous vos appareils.
            </p>
          </div>
        </div>
      </div>

      {/* ===== Version web ===== */}
      <div className="hidden md:block">
        <div className="mb-5">
          <h2 className="text-[21px] font-extrabold tracking-[-0.3px]">Compte &amp; paramètres</h2>
          <small className="text-[13px] text-muted">
            Le compte gestionnaire et les préférences de l’établissement
          </small>
        </div>

        <div className="mb-4 rounded-2xl border border-line bg-white p-5">
          <h3 className="mb-1 text-[15px] font-extrabold">Compte du gestionnaire</h3>
          {[
            { titre: "Nom complet", valeur: gestionnaire.nom || "—" },
            { titre: "Rôle", valeur: gestionnaire.role },
            { titre: "E-mail", valeur: gestionnaire.email || "—" },
            { titre: "Téléphone", valeur: telephoneLisible },
          ].map((ligne) => (
            <div
              key={ligne.titre}
              className="flex items-center justify-between gap-[14px] border-b border-line py-[15px]"
            >
              <div>
                <b className="block text-[13.5px] font-bold">{ligne.titre}</b>
                <small className="text-xs text-muted">{ligne.valeur}</small>
              </div>
            </div>
          ))}
          <div className="flex items-center justify-between gap-[14px] py-[15px]">
            <div>
              <b className="block text-[13.5px] font-bold">Mot de passe</b>
              <small className="text-xs text-muted">
                Modifiable depuis « Mon compte », avec l’e-mail et la suspension
              </small>
            </div>
            <Link
              href="/espace-etablissement/mon-compte"
              className="rounded-[9px] border-[1.5px] border-line bg-white px-3 py-1.5 text-[11.5px] font-bold text-blue transition-colors hover:bg-bg"
            >
              Changer
            </Link>
          </div>
        </div>

        <div className="rounded-2xl border border-line bg-white p-5">
          <h3 className="mb-1 text-[15px] font-extrabold">Paramètres de l’établissement</h3>
          {PARAMETRES.map((parametre, i) => (
            <div
              key={parametre.cle}
              className={`flex items-center justify-between gap-[14px] py-[15px] ${
                i < PARAMETRES.length - 1 ? "border-b border-line" : ""
              }`}
            >
              <div>
                <b className="block text-[13.5px] font-bold">{parametre.titre}</b>
                <small className="text-xs text-muted">{parametre.detail}</small>
              </div>
              <Interrupteur
                actif={parametres[parametre.cle]}
                onChange={(val) => basculer(parametre.cle, val)}
                label={parametre.titre}
              />
            </div>
          ))}
          <div className="mt-1.5 flex items-start gap-[9px] rounded-xl bg-teal-soft px-[14px] py-3 text-[12.5px] font-semibold leading-relaxed text-blue">
            <span aria-hidden>ℹ️</span>
            <div>
              Ces préférences sont enregistrées sur le compte de l’établissement — vous les
              retrouvez sur tous vos appareils. Les notifications sont visibles dans le centre de
              notifications (🔔).
            </div>
          </div>
        </div>
      </div>
    </EtablissementShell>
  );
}
