"use client";

import { useState } from "react";
import Dialogue from "@/components/site/Dialogue";
import Icone from "@/components/site/Icone";
import { formatDateCourte } from "@/lib/dates";
import {
  titreDocument,
  genererPdf,
  libelleType,
  urlSignee,
  type DocumentPatient,
  type TypeDocument,
} from "@/lib/documents";

/*
 * Aperçu d'une pièce du dossier, avant impression ou remise.
 *
 * Ce que le médecin veut relire avant de cliquer, c'est l'ordonnance telle
 * que le patient la verra : son identité, les allergies connues, les lignes
 * prescrites, la signature. L'écran précédent n'offrait que « Ouvrir », qui
 * téléchargeait un PDF dans un autre onglet — on quittait le dossier pour
 * vérifier un détail, et on y revenait à l'aveugle.
 *
 * Deux rappels qui ne sont pas décoratifs :
 *  - les ALLERGIES, en tête : c'est l'erreur que cette page doit empêcher ;
 *  - l'état d'ANNULATION, en bandeau, avec son motif. Une ordonnance annulée
 *    reste lisible — il faut savoir ce qui avait été prescrit — mais elle ne
 *    doit jamais passer pour valable.
 *
 * Le QR de vérification a sa place réservée, vide : la plateforme ne sait
 * pas encore vérifier une signature, et dessiner un code qui ne mène nulle
 * part fabriquerait une marque d'authenticité sans authenticité.
 */

/** Découpe « Amlodipine 5 mg — 1 comprimé le matin » en deux colonnes. */
function enLignes(contenu: string): { nom: string; posologie: string }[] {
  return contenu
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((ligne) => {
      // Les séparateurs que les praticiens emploient réellement, dans l'ordre
      // où on les rencontre. Sans séparateur, la ligne reste entière : mieux
      // vaut une ligne non découpée qu'une posologie inventée.
      const coupe = /\s(?:—|–|:|·)\s/.exec(ligne);
      if (!coupe) return { nom: ligne, posologie: "" };
      return {
        nom: ligne.slice(0, coupe.index).trim(),
        posologie: ligne.slice(coupe.index + coupe[0].length).trim(),
      };
    });
}

export default function ApercuDocument({
  document: doc,
  patient,
  versions,
  destinataire,
  onFermer,
  onErreur,
}: {
  document: DocumentPatient;
  patient: { nom: string; age: number | null; ville: string; allergies: string[] };
  /** Versions précédentes de la même pièce, de la plus récente à la plus ancienne. */
  versions: DocumentPatient[];
  /** Pour régénérer le PDF d'une pièce rédigée en clair, sans fichier joint. */
  destinataire: { patientId?: string; procheId?: string } | null;
  onFermer: () => void;
  onErreur: (message: string) => void;
}) {
  const [enCours, setEnCours] = useState<"imprimer" | "pdf" | null>(null);
  const [versionsVisibles, setVersionsVisibles] = useState(false);

  const estOrdonnance = doc.type === "ordonnance";
  const annulee = !!doc.annuleLe;
  const lignes = doc.contenu ? enLignes(doc.contenu) : [];

  /**
   * Le PDF, d'où qu'il vienne : le fichier déposé s'il existe, sinon celui
   * que le serveur recompose à partir du texte. Dans les deux cas on rend
   * une URL ouvrable — et jamais une URL publique, le bucket reste privé.
   */
  async function urlDuPdf(): Promise<string | null> {
    if (doc.fichierPath) {
      const res = await urlSignee(doc.fichierPath);
      if (res.erreur || !res.url) {
        onErreur(res.erreur ?? "Fichier introuvable.");
        return null;
      }
      return res.url;
    }
    if (!destinataire || !doc.contenu) {
      onErreur("Ce document n’a ni fichier ni contenu à imprimer.");
      return null;
    }
    const res = await genererPdf({
      ...destinataire,
      type: doc.type as TypeDocument,
      titre: titreDocument(doc),
      contenu: doc.contenu,
    });
    if (res.erreur || !res.fichier) {
      onErreur(res.erreur ?? "La génération du PDF a échoué.");
      return null;
    }
    return URL.createObjectURL(res.fichier);
  }

  async function imprimer() {
    if (enCours) return;
    setEnCours("imprimer");
    const url = await urlDuPdf();
    setEnCours(null);
    // Le PDF s'ouvre dans un onglet : l'impression part de la visionneuse du
    // navigateur, qui sait composer les pages. Imprimer cette modale
    // imprimerait la fiche entière, menu compris.
    if (url) window.open(url, "_blank", "noopener,noreferrer");
  }

  async function telecharger() {
    if (enCours) return;
    setEnCours("pdf");
    const url = await urlDuPdf();
    setEnCours(null);
    if (!url) return;
    const lien = window.document.createElement("a");
    lien.href = url;
    lien.download = `${titreDocument(doc).replace(/[^\w\s.\-]+/g, "").trim() || "document"}.pdf`.replace(
      /\s+/g,
      "-"
    );
    window.document.body.appendChild(lien);
    lien.click();
    lien.remove();
  }

  const titreAffiche =
    doc.version > 1 ? `${titreDocument(doc)} (v${doc.version})` : titreDocument(doc);

  return (
    <Dialogue
      titre={titreAffiche}
      icone={<Icone nom={estOrdonnance ? "gelule" : "document"} taille={18} />}
      sousTitre={`${libelleType(doc.type)} · émis le ${formatDateCourte(doc.creeLe.slice(0, 10))}${
        doc.origine === "patient" ? " · envoyé par le patient" : ` · ${doc.medecinNom}`
      }`}
      largeur="560px"
      onFermer={onFermer}
      pied={
        <>
          <button
            type="button"
            onClick={imprimer}
            disabled={enCours !== null}
            className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-[10px] border border-line bg-white px-4 text-[13px] font-bold text-ink transition-colors hover:border-muted disabled:opacity-45 md:flex-none"
          >
            <Icone nom="imprimante" taille={15} />
            {enCours === "imprimer" ? "Préparation…" : "Imprimer"}
          </button>
          <button
            type="button"
            onClick={telecharger}
            disabled={enCours !== null}
            className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-[10px] border border-[#BFD3F6] bg-white px-4 text-[13px] font-bold text-blue transition-colors hover:bg-teal-soft disabled:opacity-45 md:flex-none"
          >
            <Icone nom="telecharger" taille={15} />
            {enCours === "pdf" ? "Préparation…" : "Télécharger le PDF"}
          </button>
          <button
            type="button"
            onClick={onFermer}
            className="min-h-11 flex-1 rounded-[10px] bg-teal px-4 text-[13px] font-bold text-white transition-colors hover:bg-blue md:flex-none"
          >
            Fermer
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-3.5 p-4">
        {annulee && (
          <p className="flex items-start gap-2 rounded-[10px] border border-[#F4C9C9] bg-red-soft px-3 py-2.5 text-[12.5px] font-bold text-red">
            <Icone nom="interdit" taille={15} className="mt-px flex-none" />
            <span>
              Document annulé le {formatDateCourte(doc.annuleLe!.slice(0, 10))} — motif :{" "}
              {doc.motifAnnulation}. Il n’est plus valable en pharmacie.
            </span>
          </p>
        )}

        <div className="flex flex-wrap justify-between gap-2 text-[13px]">
          <div>
            <span className="text-muted">Patient : </span>
            <b className="font-extrabold">{patient.nom}</b>
            {patient.age !== null && <span className="text-muted">, {patient.age} ans</span>}
          </div>
          {patient.ville && <div className="text-muted">{patient.ville}</div>}
        </div>

        {/* Toujours affiché, même vide : « aucune allergie connue » est une
            information, et son absence se lirait comme un oubli. */}
        <p
          className={`flex items-start gap-2 rounded-[10px] px-3 py-2.5 text-[12.5px] font-bold ${
            patient.allergies.length
              ? "border border-[#F3D9B8] bg-amber-soft text-amber"
              : "border border-line bg-bg text-muted"
          }`}
        >
          <Icone nom="alerte" taille={15} className="mt-px flex-none" />
          <span>
            {patient.allergies.length
              ? `Allergies connues : ${patient.allergies.join(", ")}`
              : "Aucune allergie renseignée au dossier."}
          </span>
        </p>

        {lignes.length > 0 ? (
          <div>
            {lignes.map((l, i) => (
              <div
                key={`${l.nom}-${i}`}
                className="flex flex-wrap justify-between gap-3 border-b border-dashed border-line py-2.5 last:border-b-0"
              >
                <div className="font-bold">{l.nom}</div>
                {l.posologie && (
                  <div className="text-right text-[12.5px] text-muted">{l.posologie}</div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="rounded-[10px] border border-line bg-bg px-3 py-6 text-center text-[12.5px] text-muted">
            {doc.fichierPath
              ? "Cette pièce est un fichier joint, sans texte saisi : ouvrez-le avec « Imprimer » ou « Télécharger le PDF »."
              : "Document sans contenu."}
          </p>
        )}

        <div className="flex flex-wrap items-end justify-between gap-3.5 pt-1.5">
          <div>
            <b className="block text-[13px] font-extrabold">{doc.medecinNom}</b>
            <span className="text-[11.5px] text-muted">
              Signature électronique · généré par Docteur 224
            </span>
          </div>
          <div className="grid h-[84px] w-[84px] place-items-center rounded-[10px] border-[1.5px] border-dashed border-muted px-1.5 text-center text-[10.5px] leading-tight text-muted">
            QR de vérification
            <br />à venir
          </div>
        </div>

        {versions.length > 0 && (
          <div className="border-t border-line pt-3">
            <button
              type="button"
              onClick={() => setVersionsVisibles((v) => !v)}
              aria-expanded={versionsVisibles}
              className="inline-flex min-h-11 items-center gap-1.5 text-[12.5px] font-bold text-teal hover:underline"
            >
              <Icone nom="historique" taille={14} />
              {versionsVisibles
                ? "Masquer les versions précédentes"
                : `Voir les ${versions.length} version${versions.length > 1 ? "s" : ""} précédente${
                    versions.length > 1 ? "s" : ""
                  }`}
            </button>
            {versionsVisibles && (
              <ul className="mt-2 grid gap-1.5">
                {versions.map((v) => (
                  <li
                    key={v.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-[9px] border border-line px-3 py-2 text-[12.5px]"
                  >
                    <span>
                      <b className="font-bold">v{v.version}</b>
                      <span className="text-muted">
                        {" "}
                        · {formatDateCourte(v.creeLe.slice(0, 10))}
                      </span>
                    </span>
                    {v.fichierPath && (
                      <button
                        type="button"
                        onClick={async () => {
                          const res = await urlSignee(v.fichierPath!);
                          if (res.erreur || !res.url) {
                            onErreur(res.erreur ?? "Fichier introuvable.");
                            return;
                          }
                          window.open(res.url, "_blank", "noopener,noreferrer");
                        }}
                        className="min-h-11 rounded-[8px] border border-line px-2.5 text-[11.5px] font-bold text-ink transition-colors hover:border-muted"
                      >
                        Ouvrir
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </Dialogue>
  );
}
