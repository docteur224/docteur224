"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import CadreEtape from "@/components/inscription/CadreEtape";
import { useInscription } from "@/components/inscription/ContexteInscription";
import { avancerEtape, enregistrerHorairesHebdo } from "@/lib/inscription-pro";
import { creerClientNavigateur } from "@/lib/supabase/client";

/*
 * Étape 5 (praticien) — horaires type de la semaine (`horaires_types`,
 * 0 = dimanche). Un interrupteur par jour + une plage début/fin ; gabarit
 * Lundi–Vendredi 08:00–17:00 pré-rempli. Affinable ensuite dans
 * /espace-medecin/disponibilites (pauses, exceptions…).
 */

const JOURS: { jour: number; nom: string }[] = [
  { jour: 1, nom: "Lundi" },
  { jour: 2, nom: "Mardi" },
  { jour: 3, nom: "Mercredi" },
  { jour: 4, nom: "Jeudi" },
  { jour: 5, nom: "Vendredi" },
  { jour: 6, nom: "Samedi" },
  { jour: 0, nom: "Dimanche" },
];

interface Jour {
  ouvert: boolean;
  debut: string;
  fin: string;
}

const DEFAUT: Record<number, Jour> = Object.fromEntries(
  JOURS.map(({ jour }) => [jour, { ouvert: jour >= 1 && jour <= 5, debut: "08:00", fin: "17:00" }])
);

export default function EtapeHoraires() {
  const router = useRouter();
  const { etape } = useInscription();
  const [jours, setJours] = useState<Record<number, Jour>>(DEFAUT);
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
      const repris: Record<number, Jour> = Object.fromEntries(
        JOURS.map(({ jour }) => [jour, { ouvert: false, debut: "08:00", fin: "17:00" }])
      );
      for (const h of data) {
        repris[h.jour_semaine] = {
          ouvert: true,
          debut: h.heure_debut.slice(0, 5),
          fin: h.heure_fin.slice(0, 5),
        };
      }
      setJours(repris);
    })();
    return () => {
      actif = false;
    };
  }, []);

  function majJour(jour: number, maj: Partial<Jour>) {
    setJours((j) => ({ ...j, [jour]: { ...j[jour], ...maj } }));
  }

  async function continuer() {
    if (enCours) return;
    setErreur(null);
    const ouverts = JOURS.filter(({ jour }) => jours[jour].ouvert);
    if (ouverts.length === 0)
      return setErreur("Ouvrez au moins un jour de consultation.");
    for (const { jour, nom } of ouverts) {
      if (jours[jour].debut >= jours[jour].fin)
        return setErreur(`${nom} : l’heure de fin doit être après l’heure de début.`);
    }
    setEnCours(true);
    const res = await enregistrerHorairesHebdo(
      ouverts.map(({ jour }) => ({ jour, debut: jours[jour].debut, fin: jours[jour].fin }))
    );
    if (!res.erreur) {
      const avancee = await avancerEtape("medecin", null, "recap");
      if (avancee.erreur) res.erreur = avancee.erreur;
    }
    setEnCours(false);
    if (res.erreur) setErreur(res.erreur);
    else router.push("/inscription/professionnel/etapes/recap");
  }

  return (
    <CadreEtape
      titre="Vos jours et heures de consultation"
      sousTitre="Ils déterminent les créneaux réservables par les patients. Vous pourrez ajouter pauses et exceptions depuis votre espace."
      retour="/inscription/professionnel/etapes/documents"
      progression={5 / 7}
      onContinuer={continuer}
      boutonTexte={etape === "recap" ? "Enregistrer et revenir au récap" : "Continuer"}
      boutonEnCours={enCours}
      erreur={erreur}
    >
      <div className="flex flex-col gap-2">
        {JOURS.map(({ jour, nom }) => {
          const j = jours[jour];
          return (
            <div key={jour} className="rounded-xl border border-line px-[14px] py-3">
              <label className="flex cursor-pointer items-center gap-3">
                <input
                  type="checkbox"
                  checked={j.ouvert}
                  onChange={(e) => majJour(jour, { ouvert: e.target.checked })}
                  className="h-[18px] w-[18px] accent-[#2E9CCA]"
                />
                <b className="flex-1 text-[13.5px]">{nom}</b>
                <small className={`text-[12px] font-bold ${j.ouvert ? "text-blue" : "text-muted"}`}>
                  {j.ouvert ? `${j.debut} – ${j.fin}` : "Fermé"}
                </small>
              </label>
              {j.ouvert && (
                <div className="mt-3 flex items-center gap-2 text-[12.5px] font-semibold text-muted">
                  De
                  <input
                    type="time"
                    value={j.debut}
                    onChange={(e) => majJour(jour, { debut: e.target.value })}
                    className="rounded-lg border border-line bg-white px-2 py-1.5 text-[13px] text-ink outline-none focus:border-teal"
                  />
                  à
                  <input
                    type="time"
                    value={j.fin}
                    onChange={(e) => majJour(jour, { fin: e.target.value })}
                    className="rounded-lg border border-line bg-white px-2 py-1.5 text-[13px] text-ink outline-none focus:border-teal"
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </CadreEtape>
  );
}
