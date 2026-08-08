"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import CadreEtape from "@/components/inscription/CadreEtape";
import { useInscription } from "@/components/inscription/ContexteInscription";
import DialoguePaiement from "@/components/pro/DialoguePaiement";
import { avancerEtape } from "@/lib/inscription-pro";
import { usePaiements } from "@/lib/paiements";

/*
 * Étape « Abonnement » — le professionnel choisit ce qu'il souscrit.
 *
 * Le choix est enregistré tout de suite (/api/inscription/abonnement), donc
 * il survit à une reprise du parcours. Ce que le professionnel DOIT est
 * calculé côté serveur : ici on ne fait qu'afficher les tarifs réels de
 * /espace-admin/abonnements et l'état de gratuité en vigueur.
 *
 * Le règlement se fait dans la foulée (migrations 0040-0041), par le même
 * dialogue que depuis l'espace du professionnel : un seul parcours de
 * paiement à connaître et à maintenir.
 *
 * DEUX RÈGLES POSÉES ICI :
 *
 *  1. Payer ne conditionne PAS la fin de l'inscription. Le dossier part de
 *     toute façon en validation ; bloquer un praticien qui n'a pas son
 *     téléphone sous la main lui ferait abandonner le parcours au dernier
 *     virage. D'où « Régler plus tard depuis mon espace », qui enregistre le
 *     choix et continue.
 *  2. L'enregistrement du choix précède l'ouverture du dialogue. Pour une
 *     structure, la fonction serveur relit le palier dans `abonnements` — si
 *     la ligne n'existe pas encore, elle n'a rien à facturer.
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
  const { moyens, recharger: rechargerPaiements } = usePaiements();
  /** Dialogue de règlement ouvert : `null` = fermé. */
  const [aRegler, setARegler] = useState<{ formule: string; libelle: string } | null>(null);
  /*
   * Un versement a-t-il été demandé pendant cette ouverture ? C'est lui qui
   * décide si fermer le dialogue fait avancer au récapitulatif : refermer
   * sans avoir rien demandé doit ramener sur l'étape, pas la sauter.
   */
  const [paiementDemande, setPaiementDemande] = useState(false);

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

  /**
   * Enregistre le choix. Rend `false` si l'écriture a échoué.
   *
   * La périodicité est passée explicitement : quand elle change DANS le
   * dialogue, l'état de cette page n'est pas encore à jour dans la fermeture,
   * et l'abonnement resterait enregistré au mois alors que l'annuel est payé.
   */
  async function enregistrerChoix(p: "mensuel" | "annuel" = periode): Promise<boolean> {
    const reponse = await fetch("/api/inscription/abonnement", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ formule, periode: p }),
    });
    const d = await reponse.json();
    if (!reponse.ok) {
      setErreur(d.erreur ?? "Enregistrement impossible.");
      return false;
    }
    return true;
  }

  async function allerAuRecap() {
    const avancee = await avancerEtape(role, etabId, "recap");
    if (avancee.erreur) {
      setErreur(avancee.erreur);
      return;
    }
    router.push("/inscription/professionnel/etapes/recap");
  }

  /** Enregistre puis passe à la suite, sans demander de règlement. */
  async function continuerSansPayer() {
    if (enCours || !formule) return;
    setErreur(null);
    setEnCours(true);
    const ok = await enregistrerChoix();
    if (ok) await allerAuRecap();
    setEnCours(false);
  }

  /** Enregistre puis ouvre le dialogue de règlement. */
  async function payerPuisContinuer() {
    if (enCours || !formule) return;
    setErreur(null);
    setEnCours(true);
    const ok = await enregistrerChoix();
    setEnCours(false);
    if (!ok) return;
    setPaiementDemande(false);
    setARegler({ formule, libelle: LIBELLE_FORMULE[formule] ?? formule });
  }

  /*
   * Le dialogue se referme : on n'avance que si un versement a été demandé.
   * Sinon le professionnel a renoncé — son choix est enregistré, il reste
   * sur l'étape et peut réessayer ou passer outre.
   */
  async function fermerDialogue() {
    setARegler(null);
    if (!paiementDemande) return;
    setEnCours(true);
    await allerAuRecap();
    setEnCours(false);
  }

  const medecin = role === "medecin";
  const gratuite = donnees?.gratuite;
  const prix = (f: Formule) => (periode === "annuel" ? f.prixAnnuel : f.prixMensuel);
  /* Rien n'est dû tant qu'une gratuité court : l'étape reste un simple choix. */
  const gratuit = !!gratuite && (gratuite.periodeGratuite || gratuite.essaiGratuit);
  const formuleChoisie = donnees?.formules.find((f) => f.formule === formule) ?? null;

  return (
    <CadreEtape
      titre="Votre abonnement"
      sousTitre={
        medecin
          ? "Choisissez la formule qui vous convient. Vous pourrez en changer depuis votre espace."
          : "Le palier de votre structure découle de son type. Il évoluera avec le nombre de médecins rattachés."
      }
      retour={`/inscription/professionnel/etapes/${medecin ? "horaires" : "documents"}`}
      onContinuer={donnees ? (gratuit ? continuerSansPayer : payerPuisContinuer) : undefined}
      boutonTexte={
        gratuit
          ? etape === "recap"
            ? "Enregistrer et revenir au récap"
            : "Continuer"
          : formuleChoisie && prix(formuleChoisie) > 0
            ? `Payer ${gnf(prix(formuleChoisie))} et continuer`
            : "Régler mon abonnement"
      }
      boutonEnCours={enCours}
      erreur={erreur}
      /* Payer ne conditionne pas la fin de l'inscription : le dossier part
         en validation de toute façon, et bloquer ici ferait abandonner le
         parcours au dernier virage. */
      secondaire={
        donnees && !gratuit
          ? { texte: "Régler plus tard depuis mon espace", action: continuerSansPayer }
          : undefined
      }
    >
      {!donnees ? (
        <p className="text-[13px] text-muted">Chargement des formules…</p>
      ) : (
        <>
          {/* Ce que la gratuité en vigueur change concrètement pour lui. */}
          <div
            className={`mb-4 rounded-[11px] px-[13px] py-[11px] text-[12.5px] font-semibold leading-relaxed ${
              gratuit ? "bg-teal-soft text-blue" : "bg-amber-soft text-amber"
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
                💳 Votre abonnement est <b>à régler</b>. Vous pouvez payer maintenant par Orange
                Money, MTN Mobile Money ou carte — ou plus tard depuis votre espace. Votre dossier
                part en validation dans les deux cas.
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

          {aRegler && formuleChoisie && (
            <DialoguePaiement
              achat={{
                type: "abonnement",
                formule: aRegler.formule,
                libelle: aRegler.libelle,
                periode,
                /* La périodicité se change encore dans le récapitulatif du
                   dialogue — c'est là que le prix devient concret — et le
                   choix est ré-enregistré dans la foulée. */
                onPeriode: (p) => {
                  setPeriode(p);
                  void enregistrerChoix(p);
                },
                prix: { mensuel: formuleChoisie.prixMensuel, annuel: formuleChoisie.prixAnnuel },
              }}
              moyens={moyens}
              onFermer={fermerDialogue}
              apres={() => {
                setPaiementDemande(true);
                rechargerPaiements();
              }}
            />
          )}
        </>
      )}
    </CadreEtape>
  );
}
