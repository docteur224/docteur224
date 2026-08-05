"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import CadreEtape from "@/components/inscription/CadreEtape";
import { useInscription } from "@/components/inscription/ContexteInscription";
import HorairesHebdo, {
  JOURS_DEFAUT,
  depuisPlages,
  premiereErreurHoraires,
  versPlages,
  type JourEdition,
} from "@/components/pro/HorairesHebdo";
import { avancerEtape, enregistrerHorairesHebdo } from "@/lib/inscription-pro";
import { creerClientNavigateur } from "@/lib/supabase/client";

/*
 * Étape 6 (praticien) — horaires type de la semaine (`horaires_types`,
 * 0 = dimanche). Gabarit Lundi–Vendredi 08:00–17:00 pré-rempli. L'éditeur
 * est le même que celui de /espace-medecin/profil, où le médecin les
 * corrigera ; /espace-medecin/disponibilites ne gère, lui, que les
 * exceptions ponctuelles.
 */

export default function EtapeHoraires() {
  const router = useRouter();
  const { etape } = useInscription();
  const [jours, setJours] = useState<Record<number, JourEdition>>(JOURS_DEFAUT);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  useEffect(() => {
    let actif = true;
    (async () => {
      const supabase = creerClientNavigateur();
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return;
      const { data } = await supabase
        .from("horaires_types")
        .select("jour_semaine, heure_debut, heure_fin")
        .eq("medecin_id", auth.user.id);
      if (!actif || !data || data.length === 0) return;
      setJours(depuisPlages(data));
    })();
    return () => {
      actif = false;
    };
  }, []);

  function majJour(jour: number, maj: Partial<JourEdition>) {
    setJours((j) => ({ ...j, [jour]: { ...j[jour], ...maj } }));
  }

  async function continuer() {
    if (enCours) return;
    setErreur(null);
    const probleme = premiereErreurHoraires(jours);
    if (probleme) return setErreur(probleme);
    setEnCours(true);
    let cible = "abonnement";
    const res = await enregistrerHorairesHebdo(versPlages(jours));
    if (!res.erreur) {
      const avancee = await avancerEtape("medecin", null, "abonnement");
      if (avancee.erreur) res.erreur = avancee.erreur;
      else cible = avancee.cible;
    }
    setEnCours(false);
    if (res.erreur) setErreur(res.erreur);
    else router.push(`/inscription/professionnel/etapes/${cible}`);
  }

  return (
    <CadreEtape
      titre="Vos jours et heures de consultation"
      sousTitre="Ils déterminent les créneaux réservables par les patients, et s’affichent sur votre fiche dans « Lieu de consultation ». Vous pourrez ajouter pauses et exceptions depuis votre espace."
      retour="/inscription/professionnel/etapes/documents"
      onContinuer={continuer}
      boutonTexte={etape === "recap" ? "Enregistrer et revenir au récap" : "Continuer"}
      boutonEnCours={enCours}
      erreur={erreur}
    >
      <HorairesHebdo jours={jours} onChange={majJour} />
    </CadreEtape>
  );
}
