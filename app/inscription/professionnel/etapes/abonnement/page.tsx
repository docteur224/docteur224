"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import CadreEtape from "@/components/inscription/CadreEtape";
import { useInscription } from "@/components/inscription/ContexteInscription";
import { avancerEtape } from "@/lib/inscription-pro";

/*
 * Étape « Abonnement » — le professionnel choisit ce qu'il souscrit.
 *
 * Le choix est enregistré tout de suite (/api/inscription/abonnement), donc
 * il survit à une reprise du parcours. Ce que le professionnel DOIT est
 * calculé côté serveur : ici on ne fait qu'afficher les tarifs réels de
 * /espace-admin/abonnements et l'état de gratuité en vigueur.
 *
 * Il n'y a pas de paiement en ligne : sans période gratuite ni essai,
 * l'abonnement est créé « à régler », à encaisser hors ligne et à activer
 * depuis l'espace admin.
 */

const LIBELLE_FORMULE: Record<string, string> = {
  standard: "Standard",
  premium: "Premium",
  cabinet: "Cabinet",
  clinique: "Clinique",
  hopital: "Hôpital / Grand centre",
};

const ARGUMENTS: Record<string, string[]> = {
  standard: ["Profil public et prise de rendez-vous", "Agenda et gestion des patients"],
  premium: ["Tout le Standard", "Mise en avant dans les résultats de recherche"],
};

interface Formule {
  formule: string;
  prixMensuel: number;
  prixAnnuel: number;
  quotaSms: number;
}
interface Donnees {
  choixPossible: boolean;
  formules: Formule[];
  gratuite: { periodeGratuite: boolean; essaiGratuit: boolean; essaiJours: number };
  choix: { formule: string; periode: string } | null;
}

const gnf = (n: number) => `${n.toLocaleString("fr-FR").replace(/ | /g, " ")} GNF`;

export default function EtapeAbonnement() {
  const router = useRouter();
  const { role, etabId, etape } = useInscription();
  const [donnees, setDonnees] = useState<Donnees | null>(null);
  const [formule, setFormule] = useState<string | null>(null);
  const [periode, setPeriode] = useState<"mensuel" | "annuel">("mensuel");
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  useEffect(() => {
    let actif = true;
    (async () => {
      const reponse = await fetch("/api/inscription/abonnement");
      const d = await reponse.json();
      if (!actif) return;
      if (!reponse.ok) return setErreur(d.erreur ?? "Chargement impossible.");
      setDonnees(d);
      setFormule(d.choix?.formule ?? d.formules[0]?.formule ?? null);
      if (d.choix?.periode === "annuel") setPeriode("annuel");
    })();
    return () => {
      actif = false;
    };
  }, []);

  async function continuer() {
    if (enCours || !formule) return;
    setErreur(null);
    setEnCours(true);
    const reponse = await fetch("/api/inscription/abonnement", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ formule, periode }),
    });
    const d = await reponse.json();
    if (!reponse.ok) {
      setEnCours(false);
      return setErreur(d.erreur ?? "Enregistrement impossible.");
    }
    const avancee = await avancerEtape(role, etabId, "recap");
    setEnCours(false);
    if (avancee.erreur) return setErreur(avancee.erreur);
    router.push("/inscription/professionnel/etapes/recap");
  }

  const medecin = role === "medecin";
  const gratuite = donnees?.gratuite;
  const prix = (f: Formule) => (periode === "annuel" ? f.prixAnnuel : f.prixMensuel);

  return (
    <CadreEtape
      titre="Votre abonnement"
      sousTitre={
        medecin
          ? "Choisissez la formule qui vous convient. Vous pourrez en changer depuis votre espace."
          : "Le palier de votre structure découle de son type. Il évoluera avec le nombre de médecins rattachés."
      }
      retour={`/inscription/professionnel/etapes/${medecin ? "horaires" : "documents"}`}
      onContinuer={donnees ? continuer : undefined}
      boutonTexte={etape === "recap" ? "Enregistrer et revenir au récap" : "Continuer"}
      boutonEnCours={enCours}
      erreur={erreur}
    >
      {!donnees ? (
        <p className="text-[13px] text-muted">Chargement des formules…</p>
      ) : (
        <>
          {/* Ce que la gratuité en vigueur change concrètement pour lui. */}
          <div
            className={`mb-4 rounded-[11px] px-[13px] py-[11px] text-[12.5px] font-semibold leading-relaxed ${
              gratuite!.periodeGratuite || gratuite!.essaiGratuit
                ? "bg-teal-soft text-blue"
                : "bg-red-soft text-red"
            }`}
          >
            {gratuite!.periodeGratuite ? (
              <>
                🎉 Période gratuite de lancement : <b>aucune facturation</b> pour le moment. Votre
                formule sera appliquée à la fin de cette période.
              </>
            ) : gratuite!.essaiGratuit ? (
              <>
                🎁 Essai gratuit de <b>{gratuite!.essaiJours} jours</b>. La facturation commence à
                la fin de l’essai.
              </>
            ) : (
              <>
                Aucune période gratuite n’est en cours : votre abonnement sera créé{" "}
                <b>à régler</b>. Le paiement en ligne n’est pas encore ouvert — notre équipe vous
                contactera pour l’encaissement et activera votre compte.
              </>
            )}
          </div>

          {medecin && (
            <div className="mb-4 flex gap-2" role="group" aria-label="Périodicité">
              {(["mensuel", "annuel"] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPeriode(p)}
                  aria-pressed={periode === p}
                  className={`flex-1 rounded-full border-[1.5px] px-4 py-[9px] text-[13px] font-bold transition-colors ${
                    periode === p ? "border-blue bg-blue text-white" : "border-line bg-white text-muted"
                  }`}
                >
                  {p === "mensuel" ? "Mensuel" : "Annuel"}
                </button>
              ))}
            </div>
          )}

          <div className="flex flex-col gap-3">
            {donnees.formules.map((f) => {
              const choisie = formule === f.formule;
              return (
                <button
                  key={f.formule}
                  type="button"
                  onClick={() => donnees.choixPossible && setFormule(f.formule)}
                  aria-pressed={choisie}
                  disabled={!donnees.choixPossible}
                  className={`rounded-xl border-[1.5px] p-4 text-left transition-colors ${
                    choisie ? "border-teal bg-teal-soft" : "border-line bg-white"
                  } ${donnees.choixPossible ? "hover:border-teal" : "cursor-default"}`}
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <b className="text-[15px] font-extrabold">
                      {LIBELLE_FORMULE[f.formule] ?? f.formule}
                    </b>
                    <span className="text-[15px] font-extrabold text-blue">
                      {prix(f) > 0 ? gnf(prix(f)) : "Sur devis"}
                      {prix(f) > 0 && (
                        <small className="ml-1 text-[11.5px] font-bold text-muted">
                          /{periode === "annuel" ? "an" : "mois"}
                        </small>
                      )}
                    </span>
                  </div>
                  {(ARGUMENTS[f.formule] ?? []).map((a) => (
                    <small key={a} className="mt-1 block text-[12.5px] text-muted">
                      • {a}
                    </small>
                  ))}
                  {f.quotaSms > 0 && (
                    <small className="mt-1 block text-[12.5px] text-muted">
                      • {f.quotaSms} SMS de rappel inclus
                    </small>
                  )}
                </button>
              );
            })}
          </div>

          {!donnees.choixPossible && (
            <p className="mt-3 text-[12.5px] text-muted">
              Ce palier est déterminé par le type de structure déclaré dans votre fiche.
            </p>
          )}
        </>
      )}
    </CadreEtape>
  );
}
