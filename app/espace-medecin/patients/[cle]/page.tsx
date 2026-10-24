"use client";

import { use, useMemo, useState } from "react";
import Link from "next/link";
import MedecinShell from "@/components/medecin/MedecinShell";
import AdresserConfrere from "@/components/medecin/AdresserConfrere";
import AnnulerDocument from "@/components/medecin/AnnulerDocument";
import ApercuDocument from "@/components/medecin/ApercuDocument";
import DeposerDocument from "@/components/medecin/DeposerDocument";
import InfosMedicales from "@/components/medecin/InfosMedicales";
import EnTeteMobile from "@/components/mobile/EnTeteMobile";
import Icone, { type NomIcone } from "@/components/site/Icone";
import Toast, { useToast } from "@/components/site/Toast";
import { calculerAge, formatDateCourte } from "@/lib/dates";
import {
  confirmerRdvMedecin,
  lirePatientCle,
  qualifierRdv,
  useContextePro,
  useDossierPatient,
  type RdvDossier,
} from "@/lib/pro";
import {
  classeStatut,
  libelleStatut,
  rdvPasse,
  statutAffiche,
  type StatutAffiche,
} from "@/lib/statuts-rdv";
import { formatTelephone, numeroComposable } from "@/lib/rdv-utils";
import { libelleType, useMesDocuments, type DocumentPatient } from "@/lib/documents";

/*
 * Dossier d'un patient, côté médecin.
 *
 * Rassemble ce qui était éparpillé ou inexistant : l'identité, le bloc
 * médical qu'on relit avant de prescrire, l'historique des rendez-vous avec
 * ce praticien, les documents remis et ceux que le patient a envoyés ou
 * partagés.
 *
 * Deux règles de métier décident de presque toute la forme de cet écran :
 *
 *  - un rendez-vous PASSÉ ne reste pas « en attente ». Il attend d'être
 *    qualifié — honoré ou absent — et le geste tient en un clic, là où on
 *    lit la ligne. L'état « à qualifier » se déduit, il n'est jamais écrit
 *    (voir lib/statuts-rdv.ts) ;
 *
 *  - une pièce remise ne se supprime JAMAIS. Corriger crée une version,
 *    annuler la barre et exige un motif. Les deux passent par des fonctions
 *    de la base qui journalisent (migration 0063).
 *
 * Mise en page : deux colonnes à partir de `lg`, une seule en dessous, où
 * trois onglets évitent de faire défiler tout le dossier pour atteindre les
 * documents. Les sections inactives portent `max-lg:hidden` plutôt que
 * d'être démontées : au-delà de lg, les onglets disparaissent et tout
 * redevient visible, sans que l'état « onglet courant » n'ait à s'effacer.
 */

type Onglet = "dossier" | "rdv" | "documents";

const ONGLETS: { cle: Onglet; libelle: string }[] = [
  { cle: "dossier", libelle: "Dossier" },
  { cle: "rdv", libelle: "Rendez-vous" },
  { cle: "documents", libelle: "Documents" },
];

const PAR_PAGE_HISTORIQUE = 5;

const CARTE = "rounded-2xl border border-line bg-white p-4 md:p-5";
const TITRE_SECTION = "text-[15px] font-extrabold";
const BTN_BASE =
  "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-[10px] px-3.5 text-[12.5px] font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-45";
const BTN_PRIMAIRE = `${BTN_BASE} bg-teal text-white hover:bg-blue`;
const BTN_CONTOUR = `${BTN_BASE} border border-[#BFD3F6] bg-white text-blue hover:bg-teal-soft`;
const BTN_NEUTRE = `${BTN_BASE} border border-line bg-white text-ink hover:border-muted`;
const BTN_DANGER = `${BTN_BASE} border border-[#F4C9C9] bg-white text-red hover:bg-red-soft`;

export default function DossierPatientMedecin({
  params,
}: {
  params: Promise<{ cle: string }>;
}) {
  const { cle } = use(params);
  /* `medecinId` et non `medecin` : la fiche n a besoin que de l identifiant,
     publie des qu il est connu. Attendre l objet complet — tarifs, horaires,
     assurances — retardait la premiere requete du dossier d une seconde. */
  const { medecinId, role } = useContextePro();
  const {
    dossier,
    chargement,
    chargementRdvs,
    recharger: rechargerDossier,
  } = useDossierPatient(cle, medecinId ?? undefined);
  const { avis, annoncer, signalerEchec } = useToast();

  const { type, id } = lirePatientCle(cle);
  // Une fiche sans compte n'a pas d'espace patient : aucun document possible.
  const pour =
    type === "compte" ? { patientId: id } : type === "proche" ? { procheId: id } : undefined;
  const { documents, chargement: chargementDocs, recharger } = useMesDocumentsDuDossier(pour);

  const [onglet, setOnglet] = useState<Onglet>("dossier");
  const [vueRdv, setVueRdv] = useState<"a_venir" | "historique">("historique");
  const [pageHistorique, setPageHistorique] = useState(0);
  const [apercu, setApercu] = useState<DocumentPatient | null>(null);
  const [aAnnuler, setAAnnuler] = useState<DocumentPatient | null>(null);
  /* Mises à jour optimistes : la ligne change d'état avant la réponse du
     serveur, et revient en arrière si l'écriture échoue. Sur une connexion
     lente, attendre l'aller-retour donnait l'impression d'un clic perdu. */
  const [statutsLocaux, setStatutsLocaux] = useState<Record<string, string>>({});
  const [rdvEnCours, setRdvEnCours] = useState<string | null>(null);

  const nomComplet = dossier ? `${dossier.prenom} ${dossier.nom}` : "";
  const introuvable = !chargement && !dossier;

  /* ---------- Rendez-vous ---------- */

  const rdvs = useMemo(
    () =>
      (dossier?.rdvs ?? []).map((r) => ({
        ...r,
        statut: statutsLocaux[r.id] ?? r.statut,
      })),
    [dossier?.rdvs, statutsLocaux]
  );
  // Le plus proche en tête pour ce qui vient, le plus récent en tête pour ce
  // qui est passé : dans les deux cas, ce qu'on cherche est en haut.
  const aVenir = useMemo(
    () => rdvs.filter((r) => !rdvPasse(r.date, r.heure)).slice().reverse(),
    [rdvs]
  );
  const historique = useMemo(() => rdvs.filter((r) => rdvPasse(r.date, r.heure)), [rdvs]);

  const listeRdv = vueRdv === "a_venir" ? aVenir : historique;
  const pages = Math.max(1, Math.ceil(historique.length / PAR_PAGE_HISTORIQUE));
  // Borné à la lecture : si l'historique rétrécit, la page courante peut
  // sortir des clous, et corriger ça dans un effet est interdit ici.
  const page = Math.min(pageHistorique, pages - 1);
  const tranche =
    vueRdv === "historique"
      ? historique.slice(page * PAR_PAGE_HISTORIQUE, (page + 1) * PAR_PAGE_HISTORIQUE)
      : aVenir;

  async function agirSurRdv(
    rdv: RdvDossier,
    cible: "honore" | "absent" | "confirme",
    succes: string
  ) {
    if (rdvEnCours) return;
    const precedent = statutsLocaux[rdv.id];
    setRdvEnCours(rdv.id);
    setStatutsLocaux((s) => ({ ...s, [rdv.id]: cible }));

    const res =
      cible === "confirme" ? await confirmerRdvMedecin(rdv.id) : await qualifierRdv(rdv.id, cible);

    setRdvEnCours(null);
    if (res.erreur) {
      // Retour en arrière : la ligne retrouve l'état qu'elle avait, sinon
      // l'écran affirmerait un changement que la base a refusé.
      setStatutsLocaux((s) => {
        const copie = { ...s };
        if (precedent === undefined) delete copie[rdv.id];
        else copie[rdv.id] = precedent;
        return copie;
      });
      signalerEchec(res.erreur);
      return;
    }
    annoncer(
      cible === "confirme" && "previenu" in res && !res.previenu
        ? "Rendez-vous confirmé — le patient n’a pas pu être prévenu par message"
        : succes
    );
  }

  /* ---------- Documents ---------- */

  /* `useMesDocuments` filtre par patient/proche, pas par auteur : la RLS peut
     aussi renvoyer un document rédigé par un CONFRÈRE et simplement partagé
     avec ce médecin (table partages_document). Sans cette distinction, un tel
     document apparaissait comme « le vôtre », avec des actions qui
     échouaient silencieusement. */
  const estMoi = (d: DocumentPatient) => d.medecinId === medecinId;
  // Seules les versions EN COURS sont listées : les précédentes restent
  // consultables, mais depuis l'aperçu de la pièce, pas comme des documents
  // séparés — sinon une ordonnance corrigée deux fois occuperait trois
  // lignes dont deux périmées.
  const remis = documents.filter((d) => d.origine === "medecin" && estMoi(d) && !d.remplaceParId);
  const recus = documents.filter((d) => d.origine === "patient" && estMoi(d) && !d.remplaceParId);
  const partages = documents.filter((d) => !estMoi(d) && !d.remplaceParId);

  /** Les versions antérieures d'une pièce, de la plus récente à la plus ancienne. */
  const versionsDe = (d: DocumentPatient) => {
    const racine = d.documentParentId ?? d.id;
    return documents
      .filter((x) => x.id !== d.id && (x.documentParentId ?? x.id) === racine)
      .sort((a, b) => b.version - a.version);
  };

  /* ---------- Rendu ---------- */

  const pan = (o: Onglet) => (onglet === o ? "" : "max-lg:hidden");

  /* Tant que les rendez-vous arrivent, le compteur ne dit pas « 0 » : une
     liste encore vide n est pas une liste vide, et annoncer zéro pour se
     corriger une seconde plus tard se lit comme une erreur. */
  const compte = (n: number) => (chargementRdvs ? "(…)" : `(${n})`);

  const carteDocument = (d: DocumentPatient, variante: "remis" | "recu" | "partage") => {
    const annule = !!d.annuleLe;
    const etiquette = annule
      ? { texte: "Annulée", classe: "bg-red-soft text-red" }
      : d.version > 1
        ? { texte: `Corrigée · v${d.version}`, classe: "bg-amber-soft text-amber" }
        : variante === "remis"
          ? { texte: "Remise", classe: "bg-bg text-muted" }
          : null;

    const icone: NomIcone = d.type === "ordonnance" ? "gelule" : "document";
    const teinte =
      variante === "remis"
        ? "bg-teal-soft text-teal"
        : variante === "recu"
          ? "bg-green-soft text-green"
          : "bg-amber-soft text-amber";

    const dateLigne =
      variante === "recu"
        ? `Reçu le ${formatDateCourte(d.creeLe.slice(0, 10))} · envoyé par le patient`
        : variante === "partage"
          ? `${formatDateCourte(d.creeLe.slice(0, 10))} · ${
              d.origine === "patient" ? "transmis par le patient" : `rédigé par ${d.medecinNom}`
            }`
          : `Émise le ${formatDateCourte(d.creeLe.slice(0, 10))}${
              annule ? ` · annulée, motif : ${d.motifAnnulation}` : ""
            }`;

    return (
      <article
        key={d.id}
        className="flex flex-wrap items-center gap-3 rounded-xl border border-line p-3.5 transition-colors hover:border-[#CBD8E4]"
      >
        <span className={`grid h-[38px] w-[38px] flex-none place-items-center rounded-[10px] ${teinte}`}>
          <Icone nom={icone} taille={18} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <b className={`text-[14px] font-extrabold ${annule ? "text-muted line-through" : ""}`}>
              {d.titre || libelleType(d.type)}
            </b>
            {etiquette && (
              <span
                className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${etiquette.classe}`}
              >
                {etiquette.texte}
              </span>
            )}
          </div>
          <div className="mt-0.5 text-[12px] text-muted">{dateLigne}</div>
        </div>
        <div className="flex w-full flex-wrap justify-end gap-2 md:w-auto">
          {variante === "remis" && !annule && (
            <>
              <DeposerDocument
                cle={cle}
                nomPatient={nomComplet}
                document={d}
                classeDeclencheur={`${BTN_NEUTRE} max-md:flex-1`}
                apres={(m) => {
                  recharger();
                  annoncer(m);
                }}
              />
              <button
                type="button"
                onClick={() => setAAnnuler(d)}
                className={`${BTN_DANGER} max-md:flex-1`}
              >
                Annuler
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => setApercu(d)}
            className={`${
              variante === "partage" ? BTN_CONTOUR : BTN_PRIMAIRE
            } max-md:flex-1`}
          >
            Ouvrir
          </button>
        </div>
      </article>
    );
  };

  const squelettes = (n: number) => (
    <div className="grid gap-3" aria-hidden>
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="h-[66px] animate-pulse rounded-xl border border-line bg-bg" />
      ))}
    </div>
  );

  return (
    <MedecinShell>
      <div className="md:hidden">
        <EnTeteMobile retour="/espace-medecin/patients" titre={nomComplet || "Dossier"} />
      </div>

      <Toast avis={avis} />

      {apercu && dossier && (
        <ApercuDocument
          document={apercu}
          versions={versionsDe(apercu)}
          destinataire={pour ?? null}
          patient={{
            nom: nomComplet,
            age: dossier.dateNaissance ? calculerAge(dossier.dateNaissance) : null,
            ville: dossier.ville,
            allergies: dossier.infos.allergies,
          }}
          onFermer={() => setApercu(null)}
          onErreur={signalerEchec}
        />
      )}

      {aAnnuler && (
        <AnnulerDocument
          document={aAnnuler}
          onFermer={() => setAAnnuler(null)}
          onErreur={signalerEchec}
          onAnnule={() => {
            setAAnnuler(null);
            recharger();
            annoncer("Document annulé — il reste au dossier, barré, avec son motif");
          }}
        />
      )}

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
              Historique, documents remis et pièces reçues
            </small>
          </div>
          {dossier && (
            <div className="flex w-full gap-2.5 md:w-auto">
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
            {/* ---- Onglets : seulement là où la page tient sur une colonne ---- */}
            <div
              role="tablist"
              aria-label="Sections du dossier"
              className="mb-4 flex gap-1 rounded-xl bg-[#DFE7EF] p-1 lg:hidden"
            >
              {ONGLETS.map((o) => (
                <button
                  key={o.cle}
                  role="tab"
                  type="button"
                  aria-selected={onglet === o.cle}
                  onClick={() => setOnglet(o.cle)}
                  className={`min-h-11 flex-1 rounded-[9px] text-[13.5px] transition-colors ${
                    onglet === o.cle
                      ? "bg-white font-extrabold text-ink shadow-[0_1px_2px_rgba(16,59,80,0.12)]"
                      : "font-semibold text-muted"
                  }`}
                >
                  {o.libelle}
                </button>
              ))}
            </div>

            <div className="grid items-start gap-4 lg:grid-cols-[minmax(300px,360px)_1fr]">
              {/* ================= Colonne gauche ================= */}
              <div className="grid gap-4">
                {/* ---- Identité ---- */}
                <section className={`${CARTE} ${pan("dossier")}`}>
                  {chargement || !dossier ? (
                    squelettes(3)
                  ) : (
                    <>
                      <div className="mb-4 flex items-center gap-3.5">
                        <span
                          aria-hidden
                          className="grid h-[52px] w-[52px] flex-none place-items-center rounded-2xl text-[17px] font-extrabold text-white"
                          style={{ background: dossier.gradient }}
                        >
                          {`${dossier.prenom.charAt(0)}${dossier.nom.charAt(0)}`.toUpperCase()}
                        </span>
                        <div className="min-w-0">
                          <b className="block text-[17px] font-extrabold">{nomComplet}</b>
                          <div className="text-[12.5px] text-muted">
                            {dossier.type === "proche"
                              ? `${dossier.lien} de ${dossier.titulaire}`
                              : dossier.type === "sans_compte"
                                ? "Fiche cabinet (sans compte)"
                                : "Compte patient"}
                          </div>
                        </div>
                      </div>

                      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2.5 text-[13px]">
                        {(
                          [
                            ["Téléphone", dossier.telephone ? formatTelephone(dossier.telephone) : "—"],
                            [
                              "Naissance",
                              dossier.dateNaissance
                                ? `${formatDateCourte(dossier.dateNaissance)} · ${calculerAge(
                                    dossier.dateNaissance
                                  )} ans`
                                : "—",
                            ],
                            [
                              "Sexe",
                              dossier.genre === "M"
                                ? "Masculin"
                                : dossier.genre === "F"
                                  ? "Féminin"
                                  : "—",
                            ],
                            ["Ville", dossier.ville || "—"],
                            ["E-mail", dossier.email || "—"],
                          ] as [string, string][]
                        ).map(([libelle, valeur]) => (
                          <div key={libelle} className="contents">
                            <dt className="text-muted">{libelle}</dt>
                            <dd className="m-0 break-all text-right font-semibold">{valeur}</dd>
                          </div>
                        ))}
                      </dl>

                      <InfosMedicales
                        infos={dossier.infos}
                        cle={cle}
                        modifiable={role === "medecin"}
                        onEnregistre={(m) => {
                          rechargerDossier();
                          annoncer(m);
                        }}
                        onErreur={signalerEchec}
                      />
                    </>
                  )}
                </section>

                {/* ---- Rendez-vous ---- */}
                <section className={`${CARTE} ${pan("rdv")}`}>
                  <h3 className={`${TITRE_SECTION} mb-3`}>
                    Rendez-vous{" "}
                    <span className="text-[12.5px] font-semibold text-muted">{compte(rdvs.length)}</span>
                  </h3>

                  <div role="tablist" className="mb-2 flex gap-0.5 rounded-[10px] bg-bg p-[3px]">
                    {(
                      [
                        ["a_venir", `À venir ${compte(aVenir.length)}`],
                        ["historique", `Historique ${compte(historique.length)}`],
                      ] as ["a_venir" | "historique", string][]
                    ).map(([valeur, libelle]) => (
                      <button
                        key={valeur}
                        role="tab"
                        type="button"
                        aria-selected={vueRdv === valeur}
                        onClick={() => setVueRdv(valeur)}
                        className={`min-h-11 flex-1 rounded-lg text-[13px] transition-colors ${
                          vueRdv === valeur
                            ? "bg-white font-extrabold text-ink shadow-[0_1px_2px_rgba(16,59,80,0.12)]"
                            : "font-semibold text-muted"
                        }`}
                      >
                        {libelle}
                      </button>
                    ))}
                  </div>

                  {chargementRdvs ? (
                    squelettes(3)
                  ) : listeRdv.length === 0 ? (
                    <p className="py-6 text-center text-[12.5px] text-muted">
                      {vueRdv === "a_venir"
                        ? "Aucun rendez-vous à venir avec vous."
                        : "Aucun rendez-vous passé avec vous."}
                    </p>
                  ) : (
                    <div>
                      {tranche.map((r) => (
                        <LigneRdv
                          key={r.id}
                          rdv={r}
                          occupe={rdvEnCours === r.id}
                          onHonore={() =>
                            agirSurRdv(r, "honore", "Rendez-vous marqué comme honoré")
                          }
                          onAbsent={() => agirSurRdv(r, "absent", "Patient marqué absent")}
                          onConfirmer={() =>
                            agirSurRdv(r, "confirme", "Rendez-vous confirmé — patient prévenu")
                          }
                        />
                      ))}
                    </div>
                  )}

                  {vueRdv === "historique" && historique.length > PAR_PAGE_HISTORIQUE && (
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[12.5px] text-muted">
                      <span>
                        {page * PAR_PAGE_HISTORIQUE + 1}–
                        {Math.min(historique.length, (page + 1) * PAR_PAGE_HISTORIQUE)} sur{" "}
                        {historique.length}
                      </span>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          disabled={page === 0}
                          onClick={() => setPageHistorique(Math.max(0, page - 1))}
                          className={BTN_NEUTRE}
                        >
                          <Icone nom="chevron-gauche" taille={13} />
                          Précédent
                        </button>
                        <button
                          type="button"
                          disabled={page >= pages - 1}
                          onClick={() => setPageHistorique(Math.min(pages - 1, page + 1))}
                          className={BTN_NEUTRE}
                        >
                          Suivant
                          <Icone nom="chevron-droite" taille={13} />
                        </button>
                      </div>
                    </div>
                  )}
                </section>
              </div>

              {/* ================= Colonne droite ================= */}
              <div className="grid gap-4">
                {/* ---- Documents remis ---- */}
                <section className={`${CARTE} ${pan("documents")}`}>
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-2.5">
                    <h3 className={TITRE_SECTION}>
                      Documents remis{" "}
                      <span className="text-[12.5px] font-semibold text-muted">
                        ({remis.length})
                      </span>
                    </h3>
                    {pour && (
                      <div className="flex w-full gap-2 md:w-auto">
                        <DeposerDocument
                          cle={cle}
                          nomPatient={nomComplet}
                          declencheur="+ Document"
                          classeDeclencheur={`${BTN_PRIMAIRE} flex-1 md:flex-none`}
                          apres={(m) => {
                            recharger();
                            annoncer(m);
                          }}
                        />
                        {/* Les pièces proposées sont celles que ce médecin a le
                            droit de joindre : ses dépôts et ce que le patient
                            lui a adressé. */}
                        <AdresserConfrere
                          cle={cle}
                          nomPatient={nomComplet}
                          documents={[...remis, ...recus]}
                          classeDeclencheur={`${BTN_CONTOUR} flex-1 md:flex-none`}
                          apres={(m) => {
                            recharger();
                            annoncer(m);
                          }}
                        />
                      </div>
                    )}
                  </div>

                  {!pour ? (
                    <p className="text-[12.5px] text-muted">
                      Fiche créée au cabinet : ce patient n’a pas d’espace où consulter un document.
                    </p>
                  ) : chargementDocs ? (
                    squelettes(2)
                  ) : remis.length === 0 ? (
                    <p className="py-6 text-center text-[12.5px] text-muted">
                      Aucun document remis pour l’instant. « + Document » génère une ordonnance ou
                      joint une pièce.
                    </p>
                  ) : (
                    <div className="grid gap-3">{remis.map((d) => carteDocument(d, "remis"))}</div>
                  )}
                </section>

                {/* ---- Reçus du patient ---- */}
                <section className={`${CARTE} ${pan("documents")}`}>
                  <h3 className={`${TITRE_SECTION} mb-3`}>
                    Reçus du patient{" "}
                    <span className="text-[12.5px] font-semibold text-muted">({recus.length})</span>
                  </h3>
                  {chargementDocs ? (
                    squelettes(1)
                  ) : recus.length === 0 ? (
                    <p className="text-[12.5px] text-muted">
                      Rien pour l’instant. Le patient peut vous transmettre un résultat d’analyse
                      depuis son espace.
                    </p>
                  ) : (
                    <div className="grid gap-3">{recus.map((d) => carteDocument(d, "recu"))}</div>
                  )}
                </section>

                {/* ---- Partagés par un confrère ---- */}
                {partages.length > 0 && (
                  <section className={`${CARTE} ${pan("documents")}`}>
                    <h3 className={`${TITRE_SECTION} mb-1.5`}>
                      Partagés par un confrère{" "}
                      <span className="text-[12.5px] font-semibold text-muted">
                        ({partages.length})
                      </span>
                    </h3>
                    <p className="mb-3 text-[12.5px] text-muted">
                      Le patient a donné accès à des documents rédigés ou reçus par un autre
                      médecin. Vous pouvez les lire, pas les modifier.
                    </p>
                    <div className="grid gap-3">
                      {partages.map((d) => carteDocument(d, "partage"))}
                    </div>
                  </section>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </MedecinShell>
  );
}

/**
 * Une ligne de rendez-vous. Les deux boutons de qualification ne paraissent
 * que là où ils ont un sens : sur un rendez-vous passé et non tranché. Le
 * reste du temps, seul le badge parle.
 */
function LigneRdv({
  rdv,
  occupe,
  onHonore,
  onAbsent,
  onConfirmer,
}: {
  rdv: RdvDossier;
  occupe: boolean;
  onHonore: () => void;
  onAbsent: () => void;
  onConfirmer: () => void;
}) {
  const etat: StatutAffiche = statutAffiche(rdv);
  const petit =
    "inline-flex min-h-11 items-center gap-1 rounded-lg border border-line bg-white px-2.5 text-[12px] font-bold text-ink transition-colors hover:border-muted disabled:opacity-45";

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line py-3 last:border-b-0">
      <div className="min-w-0">
        <b className="font-extrabold">
          {formatDateCourte(rdv.date)} · {rdv.heure}
        </b>
        {rdv.motif && <div className="truncate text-[12.5px] text-muted">{rdv.motif}</div>}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {etat === "a_qualifier" && (
          <>
            <button type="button" onClick={onHonore} disabled={occupe} className={petit}>
              <Icone nom="coche" taille={13} />
              Honoré
            </button>
            <button type="button" onClick={onAbsent} disabled={occupe} className={petit}>
              <Icone nom="croix" taille={13} />
              Absent
            </button>
          </>
        )}
        {etat === "en_attente" && (
          <button type="button" onClick={onConfirmer} disabled={occupe} className={petit}>
            Confirmer
          </button>
        )}
        <span
          className={`whitespace-nowrap rounded-full px-2.5 py-1 text-[12px] font-bold ${classeStatut(
            etat
          )}`}
        >
          {libelleStatut(etat)}
        </span>
      </div>
    </div>
  );
}

/**
 * Enveloppe de `useMesDocuments` : une fiche sans compte n'a pas d'espace
 * patient, donc aucun document. On le dit ici une fois plutôt que de semer
 * des `pour ?? { patientId: "aucun" }` dans le corps de la page.
 */
function useMesDocumentsDuDossier(pour?: { patientId?: string; procheId?: string }) {
  // `toutesVersions` : la fiche a besoin de la chaîne entière pour offrir
  // les versions précédentes dans l aperçu. Elle écarte elle-même les
  // versions remplacées des listes.
  const resultat = useMesDocuments(pour ?? { patientId: "aucun" }, { toutesVersions: true });
  return pour ? resultat : { ...resultat, documents: [], chargement: false };
}
