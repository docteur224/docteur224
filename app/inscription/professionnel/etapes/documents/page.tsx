"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import CadreEtape from "@/components/inscription/CadreEtape";
import { useInscription } from "@/components/inscription/ContexteInscription";
import { avancerEtape } from "@/lib/inscription-pro";
import { televerserDocumentValidation, useDocumentsValidation } from "@/lib/pro";

/*
 * Étape Documents — commune praticien / établissement. Les fichiers vont
 * dans le bucket privé `validation` + la table `documents_validation`
 * (celle que l'admin examine et que /espace-medecin/profil réaffiche).
 * On peut passer l'étape, mais la validation du compte ne démarrera pas.
 */

type TypeDoc = "identite" | "diplome" | "carte_ordre" | "autorisation_exercice";

const LIBELLES: Record<TypeDoc, { titre: string; detail: string }> = {
  identite: { titre: "Pièce d’identité", detail: "CNI, passeport ou permis — du titulaire du compte." },
  diplome: { titre: "Diplôme de médecine", detail: "Diplôme d’État ou équivalent." },
  carte_ordre: { titre: "Carte de l’Ordre des médecins", detail: "Si vous êtes inscrit à l’Ordre." },
  autorisation_exercice: {
    titre: "Autorisation d’exercice",
    detail: "Agrément ou attestation délivrés par les autorités sanitaires.",
  },
};

const LIBELLES_STATUT: Record<string, string> = {
  en_attente: "En vérification",
  valide: "Validé",
  refuse: "Refusé",
};

export default function EtapeDocuments() {
  const router = useRouter();
  const { role, etabId, etape } = useInscription();
  const { documents, recharger } = useDocumentsValidation();
  const [erreur, setErreur] = useState<string | null>(null);
  const [chargementType, setChargementType] = useState<TypeDoc | null>(null);
  const [enCours, setEnCours] = useState(false);

  const medecin = role === "medecin";
  const types: TypeDoc[] = medecin
    ? ["identite", "diplome", "carte_ordre", "autorisation_exercice"]
    : ["identite", "autorisation_exercice"];
  const fournis = new Set(documents.map((d) => d.type));
  const regleOk = medecin
    ? fournis.has("identite") &&
      (fournis.has("diplome") || fournis.has("carte_ordre") || fournis.has("autorisation_exercice"))
    : fournis.has("identite") && fournis.has("autorisation_exercice");

  const suivant = medecin ? "horaires" : "recap";

  async function televerser(type: TypeDoc, fichiers: FileList | null) {
    if (!fichiers || fichiers.length === 0) return;
    setErreur(null);
    setChargementType(type);
    const res = await televerserDocumentValidation(fichiers[0], type);
    setChargementType(null);
    if (res.erreur) setErreur(res.erreur);
    else recharger();
  }

  async function avancer() {
    if (enCours) return;
    setErreur(null);
    setEnCours(true);
    const avancee = await avancerEtape(role, etabId, suivant);
    setEnCours(false);
    if (avancee.erreur) setErreur(avancee.erreur);
    else router.push(`/inscription/professionnel/etapes/${avancee.cible}`);
  }

  return (
    <CadreEtape
      titre="Documents de vérification"
      sousTitre="Ils permettent à notre équipe de valider votre compte sous 24–48 h. Privés : jamais affichés aux patients."
      retour={`/inscription/professionnel/etapes/${medecin ? "lieu" : "fiche"}`}
      progression={medecin ? 4 / 7 : 3 / 5}
      onContinuer={regleOk ? avancer : undefined}
      boutonTexte={etape === "recap" ? "Revenir au récap" : "Continuer"}
      boutonEnCours={enCours}
      secondaire={
        regleOk
          ? undefined
          : {
              texte: "Fournir plus tard — la validation de mon compte attendra ces documents",
              action: avancer,
            }
      }
      erreur={erreur}
    >
      <div className="rounded-xl border border-[#CDE6F2] bg-teal-soft px-[14px] py-3 text-[12.5px] font-semibold leading-relaxed text-blue">
        <span aria-hidden>📋</span> Règle de validation : la pièce d’identité{" "}
        {medecin
          ? "et au moins un document professionnel (diplôme, carte de l’Ordre ou autorisation d’exercice) sont requis."
          : "et l’autorisation d’exercice de l’établissement sont requises."}
      </div>

      {types.map((type) => {
        const docs = documents.filter((d) => d.type === type);
        return (
          <div key={type} className="mt-4">
            <b className="block text-[13px]">
              {LIBELLES[type].titre}
              {(type === "identite" || (!medecin && type === "autorisation_exercice")) && (
                <span className="ml-2 rounded-full bg-amber-soft px-2 py-0.5 text-[10.5px] font-extrabold text-amber">
                  Requis
                </span>
              )}
            </b>
            <small className="text-[11.5px] text-muted">{LIBELLES[type].detail}</small>
            {docs.map((doc) => (
              <div
                key={doc.id}
                className="mt-2 flex items-center gap-[10px] rounded-[11px] border border-line px-[13px] py-[10px] text-[12.5px]"
              >
                <span aria-hidden>📄</span>
                <span className="min-w-0 flex-1 truncate font-bold">
                  {doc.fichier.split("/").pop()}
                </span>
                <span
                  className={`flex-none rounded-full px-[10px] py-1 text-[11px] font-extrabold ${
                    doc.statut === "valide"
                      ? "bg-green-soft text-green"
                      : doc.statut === "refuse"
                        ? "bg-red-50 text-red-600"
                        : "bg-amber-soft text-amber"
                  }`}
                >
                  {LIBELLES_STATUT[doc.statut] ?? doc.statut}
                </span>
              </div>
            ))}
            <label className="mt-2 flex cursor-pointer items-center gap-[10px] rounded-[11px] border-[1.5px] border-dashed border-[#BCD3E0] bg-[#F6FAFC] px-[13px] py-[10px] text-[12.5px] font-bold text-blue">
              <span aria-hidden>⬆️</span>
              {chargementType === type
                ? "Envoi en cours…"
                : docs.length > 0
                  ? "Remplacer / ajouter un fichier"
                  : "Charger un fichier (PDF ou image)"}
              <input
                type="file"
                accept=".pdf,image/*"
                className="hidden"
                onChange={(e) => {
                  televerser(type, e.target.files);
                  e.target.value = "";
                }}
              />
            </label>
          </div>
        );
      })}
    </CadreEtape>
  );
}
