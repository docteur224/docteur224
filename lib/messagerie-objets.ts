/**
 * Catalogue des objets de conversation (migration 0074).
 *
 * Le patient choisit un objet en ouvrant une conversation : il titre
 * l'échange et aide le médecin à prioriser sa lecture. La liste ici doit
 * rester en phase avec le CHECK de `messages.objet` en base.
 */

export type ObjetConversation =
  | "question_rdv"
  | "deplacer_rdv"
  | "demander_document"
  | "partager_document"
  | "demander_avis"
  | "info_sante"
  | "autre";

export const OBJETS: { slug: ObjetConversation; label: string }[] = [
  { slug: "question_rdv", label: "Question sur un rendez-vous" },
  { slug: "deplacer_rdv", label: "Déplacer un rendez-vous" },
  { slug: "demander_document", label: "Demander un document" },
  { slug: "partager_document", label: "Partager un document" },
  { slug: "demander_avis", label: "Demander un avis médical" },
  { slug: "info_sante", label: "Information de santé" },
  { slug: "autre", label: "Autre" },
];

export const labelObjet = (slug: string | null | undefined): string | null =>
  slug ? OBJETS.find((o) => o.slug === slug)?.label ?? slug : null;
