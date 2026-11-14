"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import CarteResultatMobile from "@/components/site/CarteResultatMobile";
import { chargerDisposResultats } from "@/app/resultats/actions";

/**
 * Données d'une carte médecin (mobile), telles que la page serveur les connaît
 * déjà — tout sauf la prochaine heure réservable, calculée à la demande.
 */
export type CarteMedecinData = {
  id: string;
  photoUrl: string | null;
  initiales: string;
  gradient: string;
  nomComplet: string;
  specialite: string;
  etablissementNom: string;
  ville: string;
  note: number;
  nbAvis: number;
  dispoLabel: string;
  dispoAujourdhui: boolean;
};

/**
 * Suite de la liste de résultats (mobile), en défilement infini.
 *
 * La page serveur rend la première fournée (avec ses dispos) ; ce composant
 * prend le relais pour tout le reste : il dévoile une fournée de plus quand on
 * approche du bas (IntersectionObserver), et va chercher les « Dès HH:MM » de
 * ces cartes par une Server Action, sans jamais lancer une requête par
 * praticien sur toute la liste d'un coup.
 *
 * Les cartes réutilisent le même composant que la première fournée : une seule
 * mise en forme à maintenir. La prochaine heure arrive après la carte — elle
 * s'affiche dès qu'elle est connue, sans retenir l'apparition.
 */
export default function ResultatsMobileInfini({
  reste,
  pas = 8,
}: {
  reste: CarteMedecinData[];
  pas?: number;
}) {
  const [visibles, setVisibles] = useState(0);
  const [dispos, setDispos] = useState<Record<string, string>>({});
  const [, demarrer] = useTransition();
  const sentinelle = useRef<HTMLDivElement | null>(null);
  // Identifiants déjà demandés : évite de redemander une dispo à chaque rendu.
  const demandes = useRef<Set<string>>(new Set());

  const tout = visibles >= reste.length;

  // Dévoile une fournée de plus dès que la sentinelle approche (marge large :
  // la fournée suivante est prête avant qu'on n'atteigne vraiment le bas).
  useEffect(() => {
    const cible = sentinelle.current;
    if (!cible || tout) return;
    const obs = new IntersectionObserver(
      (entrees) => {
        if (entrees[0]?.isIntersecting) {
          setVisibles((v) => Math.min(v + pas, reste.length));
        }
      },
      { rootMargin: "600px 0px" }
    );
    obs.observe(cible);
    return () => obs.disconnect();
  }, [pas, reste.length, tout, visibles]);

  // Va chercher les dispos des cartes dévoilées qu'on n'a pas encore demandées.
  useEffect(() => {
    const aDemander = reste
      .slice(0, visibles)
      .map((m) => m.id)
      .filter((id) => !demandes.current.has(id));
    if (aDemander.length === 0) return;
    aDemander.forEach((id) => demandes.current.add(id));
    demarrer(async () => {
      try {
        const res = await chargerDisposResultats(aDemander);
        setDispos((d) => ({ ...d, ...res }));
      } catch {
        // Dispos indisponibles : les cartes restent sans « Dès HH:MM », plutôt
        // que de bloquer le défilement.
      }
    });
  }, [visibles, reste, demarrer]);

  const affiches = reste.slice(0, visibles);

  return (
    <>
      {affiches.map((m) => (
        <CarteResultatMobile key={m.id} {...m} premiereHeure={dispos[m.id] ?? ""} />
      ))}
      {!tout && (
        <div ref={sentinelle} className="infini-charge" role="status" aria-label="Chargement de plus de médecins">
          <span className="infini-spin" aria-hidden />
        </div>
      )}
    </>
  );
}
