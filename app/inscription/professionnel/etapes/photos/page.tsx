"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import CadreEtape from "@/components/inscription/CadreEtape";
import { useInscription } from "@/components/inscription/ContexteInscription";
import GaleriePhotos from "@/components/pro/GaleriePhotos";
import PhotoProfil from "@/components/pro/PhotoProfil";
import { avancerEtape } from "@/lib/inscription-pro";
import { useContextePro } from "@/lib/pro";

/*
 * Étape 4 (praticien) — photo de profil et photos du cabinet.
 *
 * Ces deux éléments n'étaient demandés nulle part dans le parcours : un
 * médecin terminait son inscription avec un avatar à initiales et une
 * fiche sans aucune image, alors que c'est la première chose qu'un patient
 * regarde. Ils restaient pourtant modifiables dans l'espace — le manque
 * était donc uniquement dans le parcours.
 *
 * Rien n'est obligatoire ici : refuser d'avancer faute de photo ferait
 * abandonner un praticien qui n'en a pas sous la main. L'étape est
 * franchissable, avec un rappel explicite de ce qui sera affiché.
 *
 * Les deux composants écrivent directement (Cloudinary via
 * /api/photo-medecin et /api/galerie-photos) : il n'y a rien à enregistrer
 * au clic sur « Continuer », d'où l'absence d'écriture ici.
 */

export default function EtapePhotos() {
  const router = useRouter();
  const { etape } = useInscription();
  const { medecin, chargement } = useContextePro();
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  async function continuer() {
    if (enCours) return;
    setErreur(null);
    setEnCours(true);
    const avancee = await avancerEtape("medecin", null, "documents");
    setEnCours(false);
    if (avancee.erreur) setErreur(avancee.erreur);
    else router.push(`/inscription/professionnel/etapes/${avancee.cible}`);
  }

  return (
    <CadreEtape
      titre="Votre photo et celles du cabinet"
      sousTitre="Une fiche avec photo est nettement plus consultée. Vous pourrez les changer à tout moment depuis votre espace."
      retour="/inscription/professionnel/etapes/lieu"
      onContinuer={continuer}
      boutonTexte={etape === "recap" ? "Enregistrer et revenir au récap" : "Continuer"}
      boutonEnCours={enCours}
      erreur={erreur}
    >
      {chargement || !medecin ? (
        <p className="text-[13px] text-muted">Chargement de votre profil…</p>
      ) : (
        <>
          <b className="block text-[13.5px]">👤 Photo de profil</b>
          <p className="mb-3 mt-1 text-[11.5px] text-muted">
            Portrait en blouse ou tenue professionnelle, visage bien visible. Sans photo, vos
            initiales sur fond coloré restent affichées.
          </p>
          <PhotoProfil
            photoUrl={medecin.photoUrl}
            initiales={medecin.initiales}
            gradient={medecin.gradient}
            taille={84}
          />

          <div className="mt-6 border-t border-line pt-5">
            <b className="block text-[13.5px]">🖼️ Photos du cabinet</b>
            <p className="mb-3 mt-1 text-[11.5px] text-muted">
              Salle d’attente, salle de soins, entrée du bâtiment… Elles aident le patient à
              reconnaître les lieux le jour du rendez-vous.
            </p>
            <GaleriePhotos proprietaireId={medecin.id} type="medecin" />
          </div>

          <p className="mt-5 rounded-xl bg-teal-soft px-[14px] py-3 text-[12px] font-semibold leading-relaxed text-blue">
            ℹ️ Ces images sont publiques : elles apparaissent sur votre fiche dès que votre compte
            est validé. N’y faites figurer aucun patient.
          </p>
        </>
      )}
    </CadreEtape>
  );
}
