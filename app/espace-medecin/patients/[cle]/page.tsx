"use client";

import { Suspense, use, useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import MedecinShell from "@/components/medecin/MedecinShell";
import {
  idOnglet,
  idPanneau,
  OngletsBureau,
  PucesMobile,
  type OngletFiche,
} from "@/components/medecin/fiche/BarreModules";
import CarteIdentite from "@/components/medecin/fiche/CarteIdentite";
import CarteRendezVous from "@/components/medecin/fiche/CarteRendezVous";
import type { ContexteFiche } from "@/components/medecin/fiche/contexte";
import { MODULE_PAR_DEFAUT, MODULES } from "@/components/medecin/fiche/modules";
import { BTN_NEUTRE, BTN_PRIMAIRE, CARTE, SqueletteModule } from "@/components/medecin/fiche/ui";
import EnTeteMobile from "@/components/mobile/EnTeteMobile";
import Icone from "@/components/site/Icone";
import Toast, { useToast } from "@/components/site/Toast";
import { lirePatientCle, useContextePro, useDossierPatient } from "@/lib/pro";
import PaletteCommandes, { type ActionPalette } from "@/components/medecin/PaletteCommandes";
import { numeroComposable } from "@/lib/rdv-utils";

/*
 * Dossier d'un patient, côté médecin.
 *
 * La page ne porte plus que le cadre : l'en-tête, la colonne de gauche
 * (identité, bloc médical, rendez-vous) et une zone de travail à onglets
 * dont les modules sont déclarés dans components/medecin/fiche/modules.tsx.
 * Ajouter un module ne touche pas à ce fichier.
 *
 * L'onglet ouvert vit dans l'URL (`?tab=`) : un lien, un rafraîchissement ou
 * une notification rouvrent le bon. L'écriture passe par
 * `history.replaceState`, que Next répercute sur `useSearchParams` sans
 * aller-retour serveur — changer d'onglet est instantané et n'empile pas
 * d'entrées dans l'historique.
 *
 * Mise en page :
 *  - ≥ lg : deux colonnes ; la gauche est toujours visible, la droite porte
 *    la barre d'onglets des modules ;
 *  - < lg : une colonne et UNE rangée de puces — Patient, Rendez-vous, puis
 *    les modules. Sans `?tab`, le téléphone ouvre sur « Patient » (qui l'on
 *    a devant soi), l'ordinateur sur le module par défaut ; la colonne de
 *    gauche y est de toute façon visible.
 */

/** Vues propres au téléphone : sur ordinateur, elles sont toujours affichées. */
const VUES_COLONNE = ["patient", "rdv"] as const;

export default function DossierPatientMedecin({
  params,
}: {
  params: Promise<{ cle: string }>;
}) {
  const { cle } = use(params);
  return (
    <MedecinShell>
      {/* `useSearchParams` exige une frontière Suspense ; le squelette tient
          la place le temps du premier rendu. */}
      <Suspense fallback={<SqueletteModule />}>
        <FichePatient cle={cle} />
      </Suspense>
    </MedecinShell>
  );
}

function FichePatient({ cle }: { cle: string }) {
  /* `medecinId` et non `medecin` : la fiche n'a besoin que de l'identifiant,
     publié dès qu'il est connu. Attendre l'objet complet — tarifs, horaires,
     assurances — retardait la première requête du dossier d'une seconde. */
  const { medecinId, medecin, role } = useContextePro();
  const {
    dossier,
    chargement,
    chargementRdvs,
    recharger: rechargerDossier,
  } = useDossierPatient(cle, medecinId ?? undefined);
  const { avis, annoncer, signalerEchec } = useToast();
  const recherche = useSearchParams();

  const { type, id } = lirePatientCle(cle);
  // Une fiche sans compte n'a pas d'espace patient : aucun document, aucun message.
  const pour = useMemo(
    () =>
      type === "compte" ? { patientId: id } : type === "proche" ? { procheId: id } : undefined,
    [type, id]
  );

  const nomComplet = dossier ? `${dossier.prenom} ${dossier.nom}` : "";
  const introuvable = !chargement && !dossier;
  const router = useRouter();

  /* ---------- Révisions : un module signale qu'il a écrit ---------- */
  const [revisions, setRevisions] = useState<Record<string, number>>({});
  const signalerChangement = useCallback(
    (module: string) => setRevisions((r) => ({ ...r, [module]: (r[module] ?? 0) + 1 })),
    []
  );

  const ctx: ContexteFiche = {
    cle,
    pour,
    dossier,
    nomComplet,
    medecinId: medecinId ?? null,
    medecin: medecin
      ? { nom: `${medecin.civilite} ${medecin.prenom} ${medecin.nom}`.trim(), specialite: medecin.specialite }
      : null,
    role,
    annoncer,
    signalerEchec,
    revision: (module) => revisions[module] ?? 0,
    signalerChangement,
  };

  /* ---------- Modules permis et onglet courant ---------- */

  // Tant que le rôle n'est pas connu, on ne retire rien : le menu ne doit
  // pas clignoter. La RLS, elle, ne laisse rien passer entre-temps.
  const modules = MODULES.filter((m) => role === null || !m.permission || m.permission(ctx));
  const idsModules = modules.map((m) => m.id);
  const estModule = (v: string | null): v is string => !!v && idsModules.includes(v);

  const demande = recherche.get("tab");
  const vueMobile =
    estModule(demande) || (VUES_COLONNE as readonly string[]).includes(demande ?? "")
      ? (demande as string)
      : "patient";
  const moduleActif = estModule(demande)
    ? demande
    : idsModules.includes(MODULE_PAR_DEFAUT)
      ? MODULE_PAR_DEFAUT
      : (idsModules[0] ?? "");

  /* Les modules déjà ouverts restent montés (masqués) : revenir sur un
     onglet ne recharge ni son code ni ses données. Les autres ne sont
     montés qu'à la première visite — c'est le chargement à la demande. */
  const [visites, setVisites] = useState<string[]>([]);

  function choisir(vue: string) {
    const parametres = new URLSearchParams(window.location.search);
    parametres.set("tab", vue);
    window.history.replaceState(null, "", `?${parametres.toString()}`);
    if (estModule(vue)) setVisites((v) => (v.includes(vue) ? v : [...v, vue]));
  }

  const ongletModule = (m: (typeof MODULES)[number]): OngletFiche => ({
    id: m.id,
    libelle: m.libelle,
    icone: m.icone,
    compteur: m.Compteur ? <m.Compteur ctx={ctx} /> : undefined,
  });

  const puces: OngletFiche[] = [
    { id: "patient", libelle: "Patient", icone: "utilisateur" },
    { id: "rdv", libelle: "Rendez-vous", icone: "calendrier" },
    ...modules.map((m) => ({ ...ongletModule(m), libelle: m.libelleCourt ?? m.libelle })),
  ];

  /** Visible sur téléphone seulement si c'est la vue choisie ; toujours au-delà de lg. */
  const surMobile = (vue: string) => (vueMobile === vue ? "" : "max-lg:hidden");

  /* Actions de la fiche, pour la palette (Ctrl/Cmd+K) : aller à une section,
     prendre un RDV, appeler. Rien d'autre que les gestes de CET écran. */
  const actionsFiche: ActionPalette[] = dossier
    ? [
        {
          id: "act-rdv",
          groupe: "Actions",
          icone: <Icone nom="plus" taille={15} epaisseur={2.4} />,
          label: "Nouveau RDV pour ce patient",
          run: () => router.push(`/espace-medecin/nouveau-rdv?patient=${encodeURIComponent(cle)}`),
        },
        ...(dossier.telephone
          ? [
              {
                id: "act-appel",
                groupe: "Actions",
                icone: <Icone nom="telephone" taille={15} />,
                label: "Appeler le patient",
                sous: dossier.telephone,
                run: () => {
                  window.location.href = `tel:${numeroComposable(dossier.telephone)}`;
                },
              } satisfies ActionPalette,
            ]
          : []),
        ...puces.map((p) => ({
          id: `act-section-${p.id}`,
          groupe: "Aller à la section",
          icone: <Icone nom={p.icone} taille={15} />,
          label: p.libelle,
          run: () => choisir(p.id),
        })),
      ]
    : [];

  return (
    <>
      <div className="md:hidden">
        <EnTeteMobile retour="/espace-medecin/patients" titre={nomComplet || "Dossier"} />
      </div>

      <Toast avis={avis} />

      {/* data-fiche : repère de la vérification navigateur, qui mesure les
          zones tactiles de CET écran et non celles de la coquille. */}
      <div data-fiche className="px-4 pb-8 md:px-0 md:pb-0">
        {/* ---- En-tête ---- */}
        <div className="hidden md:block">
          <Link
            href="/espace-medecin/patients"
            className="inline-flex min-h-11 items-center gap-1 text-[12.5px] font-bold text-muted hover:text-teal"
          >
            <Icone nom="chevron-gauche" taille={14} epaisseur={2.2} />
            Mes patients
          </Link>
        </div>
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3 pt-3 md:pt-1">
          <div>
            <h2 className="text-[22px] font-extrabold tracking-[-0.3px] md:text-[25px]">
              {nomComplet || (chargement ? "Chargement…" : "Dossier")}
            </h2>
            <small className="text-[13px] text-muted">
              Dossier clinique, ordonnances et suivi du patient
            </small>
          </div>
          {dossier && (
            <div className="flex w-full flex-wrap items-center gap-2.5 md:w-auto md:flex-nowrap">
              {/* Palette d'actions de la fiche : à gauche des boutons, bureau
                  seulement, séparée par une marge généreuse. */}
              <div className="hidden md:block md:mr-10 md:w-[440px]">
                <PaletteCommandes
                  actions={actionsFiche}
                  libelleBouton="Rechercher une action de la fiche…"
                />
              </div>
              {dossier.telephone ? (
                <a
                  href={`tel:${numeroComposable(dossier.telephone)}`}
                  className={`${BTN_NEUTRE} flex-1 md:flex-none`}
                >
                  <Icone nom="telephone" taille={15} />
                  Appeler
                </a>
              ) : (
                <span className={`${BTN_NEUTRE} pointer-events-none flex-1 opacity-45 md:flex-none`}>
                  <Icone nom="telephone" taille={15} />
                  Sans numéro
                </span>
              )}
              <Link
                href={`/espace-medecin/nouveau-rdv?patient=${encodeURIComponent(cle)}`}
                className={`${BTN_PRIMAIRE} flex-1 md:flex-none`}
              >
                <Icone nom="plus" taille={15} epaisseur={2.4} />
                Nouveau RDV
              </Link>
            </div>
          )}
        </div>

        {introuvable ? (
          <div className={`${CARTE} py-12 text-center text-[13px] text-muted`}>
            Dossier introuvable, ou hors de votre patientèle.
          </div>
        ) : (
          <>
            <PucesMobile onglets={puces} actif={vueMobile} onChoisir={choisir} />

            <div className="grid items-start gap-4 lg:grid-cols-[minmax(300px,360px)_minmax(0,1fr)]">
              {/* ================= Colonne gauche =================
                  Masquée en entier sur téléphone quand un module est
                  affiché : vide mais présente, elle ajoutait l'écart de la
                  grille sous les puces. */}
              <div className={`grid gap-4 ${estModule(vueMobile) ? "max-lg:hidden" : ""}`}>
                <section
                  id={idPanneau("patient")}
                  role="tabpanel"
                  aria-labelledby="puce-fiche-patient"
                  className={`${CARTE} ${surMobile("patient")}`}
                >
                  <CarteIdentite
                    dossier={dossier}
                    chargement={chargement}
                    cle={cle}
                    modifiable={role === "medecin"}
                    onEnregistre={(m) => {
                      rechargerDossier();
                      annoncer(m);
                    }}
                    onErreur={signalerEchec}
                  />
                </section>

                <section
                  id={idPanneau("rdv")}
                  role="tabpanel"
                  aria-labelledby="puce-fiche-rdv"
                  className={`${CARTE} ${surMobile("rdv")}`}
                >
                  <CarteRendezVous
                    rdvsInitiaux={dossier?.rdvs ?? []}
                    chargement={chargementRdvs}
                    annoncer={annoncer}
                    signalerEchec={signalerEchec}
                  />
                </section>
              </div>

              {/* ================= Zone de travail : modules ================= */}
              <div className={`min-w-0 ${estModule(vueMobile) ? "" : "max-lg:hidden"}`}>
                <OngletsBureau
                  onglets={modules.map(ongletModule)}
                  actif={moduleActif}
                  onChoisir={choisir}
                />

                {modules
                  .filter((m) => m.id === moduleActif || visites.includes(m.id))
                  .map((m) => (
                    <div
                      key={m.id}
                      id={idPanneau(m.id)}
                      role="tabpanel"
                      aria-labelledby={idOnglet(m.id)}
                      hidden={m.id !== moduleActif}
                      // Le contenu reçoit le focus après Tab depuis l'onglet,
                      // comme le prévoit le motif ARIA.
                      tabIndex={0}
                      className="outline-none focus-visible:rounded-2xl focus-visible:ring-2 focus-visible:ring-teal/40"
                    >
                      <m.Composant ctx={ctx} />
                    </div>
                  ))}
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}
