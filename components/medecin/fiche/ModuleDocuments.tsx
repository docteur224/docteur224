"use client";

import { useState } from "react";
import AdresserConfrere from "@/components/medecin/AdresserConfrere";
import AnnulerDocument from "@/components/medecin/AnnulerDocument";
import ApercuDocument from "@/components/medecin/ApercuDocument";
import DeposerDocument from "@/components/medecin/DeposerDocument";
import Icone, { type NomIcone } from "@/components/site/Icone";
import { calculerAge } from "@/lib/dates";
import {
  heureDe,
  jourDe,
  resumeContenu,
  titreDocument,
  useMesDocuments,
  type DocumentPatient,
} from "@/lib/documents";
import type { ContexteFiche } from "./contexte";
import {
  BTN_CONTOUR,
  BTN_DANGER,
  BTN_NEUTRE,
  BTN_PRIMAIRE,
  CARTE,
  COMPTE,
  EtatVide,
  Squelettes,
  TITRE_SECTION,
} from "./ui";

/*
 * Module « Ordonnances et documents » de la fiche patient.
 *
 * Reprend tel quel ce qu'affichait la colonne droite : documents remis (avec
 * Corriger / Annuler / Ouvrir), pièces reçues du patient, pièces partagées
 * par un confrère. Les règles n'ont pas bougé :
 *
 *  - une pièce remise ne se supprime JAMAIS. Corriger crée une version,
 *    annuler la barre et exige un motif (migration 0063) ;
 *
 *  - « le vôtre » se juge sur l'AUTEUR, pas sur le dossier : la RLS renvoie
 *    aussi les pièces d'un confrère que le patient a partagées. Sans ce
 *    tri, elles portaient des boutons Corriger/Annuler voués à l'échec.
 *
 * Seul changement visible : le titre d'une ordonnance est désormais calculé
 * (« Ordonnance du JJ/MM/AAAA », voir titreDocument), et la ligne du dessous
 * cite les premiers médicaments, pour distinguer deux ordonnances du même
 * jour sans les ouvrir.
 */
export default function ModuleDocuments({ ctx }: { ctx: ContexteFiche }) {
  const { cle, pour, dossier, nomComplet, medecinId, annoncer, signalerEchec } = ctx;
  const { documents, chargement, recharger } = useDocumentsDuDossier(pour);
  const [apercu, setApercu] = useState<DocumentPatient | null>(null);
  const [aAnnuler, setAAnnuler] = useState<DocumentPatient | null>(null);

  /** Après toute écriture : la liste ET le compteur de l'onglet se rechargent. */
  const apresEcriture = (message: string) => {
    recharger();
    ctx.signalerChangement("documents");
    annoncer(message);
  };

  const estMoi = (d: DocumentPatient) => d.medecinId === medecinId;
  // Seules les versions EN COURS sont listées : les précédentes se relisent
  // depuis l'aperçu de la pièce, pas comme des documents séparés.
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

    const jour = jourDe(d.creeLe);
    const heure = heureDe(d.creeLe);
    const resume = d.type === "ordonnance" ? resumeContenu(d.contenu) : "";
    const dateLigne =
      variante === "recu"
        ? `Reçu le ${jour} · envoyé par le patient`
        : variante === "partage"
          ? `${jour} · ${
              d.origine === "patient" ? "transmis par le patient" : `rédigé par ${d.medecinNom}`
            }`
          : `Émise le ${jour}${heure ? ` à ${heure}` : ""}${
              annule ? ` · annulée, motif : ${d.motifAnnulation}` : resume ? ` · ${resume}` : ""
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
              {titreDocument(d)}
            </b>
            {etiquette && (
              <span className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${etiquette.classe}`}>
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
                apres={apresEcriture}
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
            className={`${variante === "partage" ? BTN_CONTOUR : BTN_PRIMAIRE} max-md:flex-1`}
          >
            Ouvrir
          </button>
        </div>
      </article>
    );
  };

  return (
    <div className="grid gap-4">
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
            apresEcriture("Document annulé — il reste au dossier, barré, avec son motif");
          }}
        />
      )}

      {/* ---- Documents remis ---- */}
      <section className={CARTE} aria-labelledby="titre-docs-remis">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2.5">
          <h3 id="titre-docs-remis" className={TITRE_SECTION}>
            Documents remis <span className={COMPTE}>({remis.length})</span>
          </h3>
          {pour && (
            <div className="flex w-full gap-2 md:w-auto">
              <DeposerDocument
                cle={cle}
                nomPatient={nomComplet}
                declencheur="+ Document"
                classeDeclencheur={`${BTN_PRIMAIRE} flex-1 md:flex-none`}
                apres={apresEcriture}
              />
              {/* Les pièces proposées sont celles que ce médecin a le droit
                  de joindre : ses dépôts et ce que le patient lui a adressé. */}
              <AdresserConfrere
                cle={cle}
                nomPatient={nomComplet}
                documents={[...remis, ...recus]}
                classeDeclencheur={`${BTN_CONTOUR} flex-1 md:flex-none`}
                apres={apresEcriture}
              />
            </div>
          )}
        </div>

        {!pour ? (
          <p className="text-[12.5px] text-muted">
            Fiche créée au cabinet : ce patient n’a pas d’espace où consulter un document.
          </p>
        ) : chargement ? (
          <Squelettes n={2} />
        ) : remis.length === 0 ? (
          <EtatVide
            icone="gelule"
            titre="Aucun document remis pour l’instant"
            texte="« + Document » génère une ordonnance à votre en-tête ou joint une pièce existante."
          />
        ) : (
          <div className="grid gap-3">{remis.map((d) => carteDocument(d, "remis"))}</div>
        )}
      </section>

      {/* ---- Reçus du patient ---- */}
      <section className={CARTE} aria-labelledby="titre-docs-recus">
        <h3 id="titre-docs-recus" className={`${TITRE_SECTION} mb-3`}>
          Reçus du patient <span className={COMPTE}>({recus.length})</span>
        </h3>
        {chargement && pour ? (
          <Squelettes n={1} />
        ) : recus.length === 0 ? (
          <p className="text-[12.5px] text-muted">
            Rien pour l’instant. Le patient peut vous transmettre un résultat d’analyse depuis son
            espace.
          </p>
        ) : (
          <div className="grid gap-3">{recus.map((d) => carteDocument(d, "recu"))}</div>
        )}
      </section>

      {/* ---- Partagés par un confrère ---- */}
      {partages.length > 0 && (
        <section className={CARTE} aria-labelledby="titre-docs-partages">
          <h3 id="titre-docs-partages" className={`${TITRE_SECTION} mb-1.5`}>
            Partagés par un confrère <span className={COMPTE}>({partages.length})</span>
          </h3>
          <p className="mb-3 text-[12.5px] text-muted">
            Le patient a donné accès à des documents rédigés ou reçus par un autre médecin. Vous
            pouvez les lire, pas les modifier.
          </p>
          <div className="grid gap-3">{partages.map((d) => carteDocument(d, "partage"))}</div>
        </section>
      )}

    </div>
  );
}

/**
 * Enveloppe de `useMesDocuments` : une fiche sans compte n'a pas d'espace
 * patient, donc aucun document. On le dit ici une fois plutôt que de semer
 * des `pour ?? { patientId: "aucun" }` dans le module.
 */
function useDocumentsDuDossier(pour?: { patientId?: string; procheId?: string }) {
  // `toutesVersions` : la fiche a besoin de la chaîne entière pour offrir les
  // versions précédentes dans l'aperçu. Elle écarte elle-même les versions
  // remplacées des listes.
  const resultat = useMesDocuments(pour ?? { patientId: "aucun" }, { toutesVersions: true });
  return pour ? resultat : { ...resultat, documents: [], chargement: false };
}
