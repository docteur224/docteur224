import type { SupabaseClient } from "@supabase/supabase-js";
import type { ExtrasEmail } from "../messagerie/types";
import { construireHtml, construireTexte, type Fait, type Message } from "./gabarit";
import { fichierCalendrier } from "./ics";

/*
 * Ce que chaque événement raconte.
 *
 * La file (migration 0057) porte le titre et le corps de la notification, qui
 * sont taillés pour la cloche : « Dr Diallo — le 15 mars à 09:30. » Assez sous
 * une icône, très peu dans une boîte de réception. Ce fichier reprend donc le
 * TYPE de l'événement et rédige un message entier ; le titre et le corps de la
 * notification ne servent plus que de repli, pour les types qui n'ont pas
 * encore leur rédaction propre.
 *
 * Conséquence voulue : ajouter un e-mail soigné pour un nouvel événement, c'est
 * ajouter une entrée ici, et rien d'autre.
 */

export interface LigneFile {
  id: string;
  destinataire_id: string;
  adresse: string;
  type: string;
  titre: string;
  corps: string | null;
  lien: string | null;
  source_type: string | null;
  source_id: string | null;
  /** « service » | « rappel » | « resume » — posée en base (migration 0059). */
  categorie?: string | null;
  /** Jeton de désabonnement du destinataire, figé au dépôt en file. */
  jeton?: string | null;
}

interface DetailsRdv {
  id: string;
  date: string;
  heure: string;
  motif: string | null;
  lieu: string | null;
  adresse_domicile: string | null;
  statut: string;
  cree_le: string;
  moment: string;
  medecin: string | null;
  specialite: string | null;
  telephone: string | null;
  ou_aller: string | null;
}

const MOIS = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
];
const JOURS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];

/** « lundi 15 mars 2027 » — sans dépendre de la locale du serveur. */
function jourLisible(dateISO: string): string {
  const [a, m, j] = dateISO.split("-").map(Number);
  // Midi UTC : à minuit, un décalage d'une heure changerait le jour de la
  // semaine affiché.
  const d = new Date(Date.UTC(a, m - 1, j, 12));
  return `${JOURS[d.getUTCDay()]} ${j} ${MOIS[m - 1]} ${a}`;
}

const heureLisible = (h: string) => h.slice(0, 5);

function site(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "https://docteur224-gn.vercel.app").replace(/\/$/, "");
}

/** Les faits saillants d'un rendez-vous, dans l'ordre où on se les demande. */
function faitsRdv(d: DetailsRdv): Fait[] {
  const faits: Fait[] = [
    { intitule: "Praticien", valeur: d.medecin ?? "Votre praticien" },
  ];
  if (d.specialite) faits.push({ intitule: "Spécialité", valeur: d.specialite });
  faits.push({ intitule: "Date", valeur: jourLisible(d.date) });
  faits.push({ intitule: "Heure", valeur: heureLisible(d.heure) });
  faits.push({
    intitule: "Lieu",
    valeur:
      d.lieu === "domicile"
        ? `Visite à domicile${d.adresse_domicile ? ` — ${d.adresse_domicile}` : ""}`
        : (d.ou_aller ?? "Au cabinet"),
  });
  if (d.motif) faits.push({ intitule: "Motif", valeur: d.motif });
  if (d.telephone) faits.push({ intitule: "Téléphone", valeur: d.telephone });
  return faits;
}

const NOTE_REGLAGE =
  "Vous recevez ce message parce qu’un rendez-vous vous concerne sur Docteur 224. " +
  "Vous pouvez régler vos notifications dans votre espace, rubrique Paramètres.";

/**
 * Le lien du pied de page — toujours présent, toujours porté par le jeton.
 *
 * Une seule page pour les deux cas, et c'est ce qui la rend juste :
 *
 *   • un RAPPEL ou un RÉSUMÉ se coupe en un clic, `c` disant quoi couper.
 *     Exiger une connexion pour ne plus être écrit est le meilleur moyen de
 *     se faire classer en indésirable à la place ;
 *   • un e-mail de SERVICE n'a rien à désactiver — il EST le service. Le lien
 *     ouvre alors la même page sans rien changer, pour régler le reste.
 *
 * Passer par le jeton plutôt que par l'écran des paramètres évite au passage
 * d'avoir à deviner le rôle du destinataire : `/patient/parametres` n'existe
 * pas pour un médecin, et la file ne porte pas le rôle.
 */
function lienPied(ligne: LigneFile): { libelle: string; url: string } | undefined {
  if (!ligne.jeton) return undefined;
  const base = `${site()}/desinscription?j=${encodeURIComponent(ligne.jeton)}`;
  if (ligne.categorie === "rappel") {
    return { libelle: "Ne plus recevoir les rappels par e-mail", url: `${base}&c=rappel` };
  }
  if (ligne.categorie === "resume") {
    return { libelle: "Ne plus recevoir ce résumé", url: `${base}&c=resume` };
  }
  return { libelle: "Gérer mes notifications", url: base };
}

/**
 * Rédaction par type d'événement.
 *
 * `details` est nul quand l'événement ne porte pas sur un rendez-vous, ou que
 * celui-ci a été supprimé entre la mise en file et l'envoi — auquel cas on
 * retombe sur le texte de la notification plutôt que de ne rien envoyer.
 */
function rediger(ligne: LigneFile, details: DetailsRdv | null): Message {
  const lien = ligne.lien ? `${site()}${ligne.lien}` : null;
  const quand = details ? `${jourLisible(details.date)} à ${heureLisible(details.heure)}` : "";
  const praticien = details?.medecin ?? "votre praticien";

  if (details) {
    switch (ligne.type) {
      case "rdv_reserve":
        return {
          titre: "Votre rendez-vous est enregistré",
          apercu: `${praticien} — ${quand}`,
          paragraphes: [
            `Votre demande de rendez-vous avec ${praticien} est bien enregistrée pour le ${quand}.`,
            "Le praticien confirmera sous peu. Vous recevrez un rappel la veille, puis quelques heures avant.",
          ],
          faits: faitsRdv(details),
          bouton: lien ? { libelle: "Voir mon rendez-vous", url: lien } : undefined,
          note: NOTE_REGLAGE,
        };

      case "rdv_confirme":
        return {
          titre: "Votre rendez-vous est confirmé",
          apercu: `${praticien} — ${quand}`,
          paragraphes: [
            `${praticien} a confirmé votre rendez-vous du ${quand}.`,
            "Présentez-vous quelques minutes en avance avec vos documents médicaux utiles.",
          ],
          faits: faitsRdv(details),
          bouton: lien ? { libelle: "Voir mon rendez-vous", url: lien } : undefined,
          note: NOTE_REGLAGE,
        };

      case "rdv_reprogramme":
        return {
          titre: "Votre rendez-vous a été déplacé",
          apercu: `Désormais le ${quand}`,
          paragraphes: [
            `Votre rendez-vous avec ${praticien} a été déplacé. Il a désormais lieu le ${quand}.`,
            "Le fichier joint met à jour l’événement dans votre agenda.",
          ],
          faits: faitsRdv(details),
          bouton: lien ? { libelle: "Voir mon rendez-vous", url: lien } : undefined,
          note: NOTE_REGLAGE,
        };

      case "rdv_annule":
        return {
          titre: "Votre rendez-vous est annulé",
          apercu: `${praticien} — ${quand}`,
          paragraphes: [
            `Le rendez-vous avec ${praticien} prévu le ${quand} est annulé.`,
            "Vous pouvez en reprendre un à tout moment depuis la plateforme.",
          ],
          faits: faitsRdv(details),
          bouton: { libelle: "Prendre un nouveau rendez-vous", url: `${site()}/resultats` },
          note: NOTE_REGLAGE,
        };

      case "rdv_nouveau":
        return {
          titre: "Nouveau rendez-vous dans votre agenda",
          apercu: `${quand}`,
          paragraphes: [
            `Un patient a réservé un créneau le ${quand}.`,
            "Retrouvez le détail et confirmez-le depuis votre agenda.",
          ],
          // Le praticien connaît son propre nom : on lui montre ce qui le
          // concerne, l'heure et le motif.
          faits: faitsRdv(details).filter((f) => !["Praticien", "Spécialité", "Téléphone"].includes(f.intitule)),
          bouton: { libelle: "Ouvrir mon agenda", url: `${site()}/espace-medecin/agenda` },
          note: "Vous recevez ce message en tant que praticien inscrit sur Docteur 224.",
        };

      case "rappel_j1":
        return {
          titre: "Rappel : votre rendez-vous a lieu demain",
          apercu: `${praticien} — demain à ${heureLisible(details.heure)}`,
          paragraphes: [
            `Petit rappel : vous avez rendez-vous avec ${praticien} demain, le ${quand}.`,
            "Si vous ne pouvez pas vous y rendre, annulez dès maintenant pour libérer le créneau.",
          ],
          faits: faitsRdv(details),
          bouton: lien ? { libelle: "Voir ou annuler", url: lien } : undefined,
          note: NOTE_REGLAGE,
        };

      case "rappel_h5":
        return {
          titre: "Votre rendez-vous a lieu dans quelques heures",
          apercu: `${praticien} — aujourd’hui à ${heureLisible(details.heure)}`,
          paragraphes: [
            `Votre rendez-vous avec ${praticien} a lieu aujourd’hui à ${heureLisible(details.heure)}.`,
            "Pensez à vos documents médicaux et à votre pièce d’identité.",
          ],
          faits: faitsRdv(details),
          bouton: lien ? { libelle: "Voir mon rendez-vous", url: lien } : undefined,
          note: NOTE_REGLAGE,
        };
    }
  }

  /*
   * Le résumé quotidien de l'administrateur. Son corps arrive de la base sous
   * forme de lignes « Intitulé : nombre » (migration 0059) : on les remonte en
   * encadré plutôt qu'en paragraphe, parce que ce sont des chiffres qu'on
   * balaie du regard, pas une phrase qu'on lit.
   */
  if (ligne.type === "resume_admin") {
    const faits = (ligne.corps ?? "")
      .split("\n")
      .map((l) => l.split(/\s:\s(.+)/))
      .filter((p) => p.length > 1)
      .map(([intitule, valeur]) => ({ intitule: intitule.trim(), valeur: valeur.trim() }));
    return {
      titre: "Votre résumé du jour",
      apercu: faits.map((f) => `${f.valeur} ${f.intitule.toLowerCase()}`).join(" · ") || "Rien en attente",
      paragraphes: ["Voici ce qui attend une décision dans la console d’administration."],
      faits,
      bouton: { libelle: "Ouvrir la console", url: `${site()}/espace-admin` },
      note: "Vous ne voyez ici que les files que vos permissions vous autorisent à traiter.",
    };
  }

  /*
   * Repli — et non pis-aller : tout ce que la plateforme notifie (avis,
   * invitations, documents, validations de compte) passe par ici et reçoit un
   * message correctement mis en page, à partir du titre et du corps de la
   * notification. Sans lui, ajouter un type d'événement en base enverrait un
   * courriel vide. Les rédactions dédiées viendront se placer au-dessus.
   */
  return {
    titre: ligne.titre,
    apercu: ligne.corps ?? ligne.titre,
    paragraphes: ligne.corps ? [ligne.corps] : [],
    bouton: lien ? { libelle: "Ouvrir sur Docteur 224", url: lien } : undefined,
    note: NOTE_REGLAGE,
  };
}

/**
 * Faut-il joindre un fichier d'agenda ?
 *
 * Seulement quand le patient a quelque chose à POSER ou à METTRE À JOUR dans
 * son agenda. Pas pour une annulation : un fichier d'annulation qui ne
 * retrouverait pas l'événement d'origine — le patient ne l'a peut-être jamais
 * ajouté — laisserait la place à un doute que le texte du message, lui, ne
 * laisse pas. Pas pour un rappel non plus : l'événement est déjà posé, et une
 * pièce jointe à chaque rappel finit par ressembler à du courrier suspect.
 */
const AVEC_CALENDRIER = new Set(["rdv_reserve", "rdv_confirme", "rdv_reprogramme"]);

export interface EmailCompose {
  sujet: string;
  texte: string;
  extras: ExtrasEmail;
}

export async function composer(
  ligne: LigneFile,
  admin: SupabaseClient
): Promise<EmailCompose> {
  let details: DetailsRdv | null = null;
  if (ligne.source_type === "rendez_vous" && ligne.source_id) {
    const { data } = await admin.rpc("details_rdv_email", { p_rdv: ligne.source_id });
    details = (data as DetailsRdv[] | null)?.[0] ?? null;
  }

  // Le pied de page est posé ici, une fois, et non dans chacune des rédactions :
  // un message sans moyen de se désabonner ne doit pas pouvoir exister par
  // oubli.
  const message = { ...rediger(ligne, details), lienPied: lienPied(ligne) };
  const pieces =
    details && AVEC_CALENDRIER.has(ligne.type)
      ? [
          fichierCalendrier({
            rdvId: details.id,
            debut: new Date(details.moment),
            creeLe: new Date(details.cree_le),
            titre: `Rendez-vous — ${details.medecin ?? "Docteur 224"}`,
            description: [
              details.medecin,
              details.specialite,
              details.motif ? `Motif : ${details.motif}` : null,
              details.telephone ? `Téléphone : ${details.telephone}` : null,
            ]
              .filter(Boolean)
              .join("\n"),
            lieu:
              details.lieu === "domicile"
                ? (details.adresse_domicile ?? "À votre domicile")
                : (details.ou_aller ?? "Au cabinet"),
          }),
        ]
      : undefined;

  return {
    // L'objet ne répète pas « Docteur 224 » : le nom de l'expéditeur le porte
    // déjà, et une boîte de réception qui affiche deux fois la même marque
    // ampute d'autant le seul endroit où l'on peut être utile.
    sujet: message.titre,
    texte: construireTexte(message),
    extras: { html: construireHtml(message), ...(pieces ? { pieces } : {}) },
  };
}
