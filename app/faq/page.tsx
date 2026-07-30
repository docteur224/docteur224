import type { Metadata } from "next";
import Link from "next/link";
import PageContenu, { Section } from "@/components/site/PageContenu";

export const metadata: Metadata = {
  title: "Questions fréquentes | Docteur 224",
  description:
    "Réserver, modifier ou annuler un rendez-vous, prendre rendez-vous pour un proche, déposer un avis, inscrire son cabinet : les réponses aux questions les plus courantes.",
};

/*
 * FAQ — chaque réponse décrit le comportement réel de l'application
 * (réservation, annulation, proches, avis, comptes professionnels).
 */
const QUESTIONS = [
  {
    q: "La réservation est-elle payante ?",
    r: "Non. Prendre rendez-vous sur Docteur 224 est gratuit pour les patients. La consultation, elle, se règle sur place, directement auprès du praticien.",
  },
  {
    q: "Comment savoir si mon rendez-vous est bien pris ?",
    r: "Il apparaît immédiatement dans « Mes rendez-vous », et vous recevez une confirmation par SMS et par e-mail. Le praticien ou son secrétariat le confirme ensuite ; vous êtes prévenu à ce moment-là.",
  },
  {
    q: "Puis-je modifier ou annuler un rendez-vous ?",
    r: "Oui, depuis « Mes rendez-vous », tant que le créneau n'est pas passé. Choisissez « Modifier » pour le déplacer sur une autre disponibilité du même praticien, ou « Annuler ». Prévenez le plus tôt possible : le créneau est aussitôt rendu à un autre patient.",
  },
  {
    q: "Puis-je prendre rendez-vous pour quelqu'un d'autre ?",
    r: "Oui. Ajoutez la personne dans « Mes proches » (enfant, conjoint, parent…), puis choisissez-la au moment de réserver. Vos proches n'ont pas besoin de compte.",
  },
  {
    q: "Que se passe-t-il si je ne me présente pas ?",
    r: "Le praticien note le rendez-vous comme non honoré. Prévenez-le en annulant en ligne : c'est ce qui permet à un autre patient de prendre la place.",
  },
  {
    q: "Qui peut laisser un avis ?",
    r: "Uniquement un patient dont la consultation a réellement eu lieu, et une seule fois par consultation. Le praticien peut répondre publiquement, et tout avis peut être signalé pour examen par notre équipe.",
  },
  {
    q: "Je suis médecin : comment m'inscrire ?",
    r: "Créez un compte professionnel, renseignez votre spécialité et vos justificatifs. Notre équipe vérifie le dossier avant la mise en ligne de votre fiche ; vous êtes prévenu dès la validation.",
  },
  {
    q: "Puis-je confier mon agenda à mon secrétariat ?",
    r: "Oui. Depuis « Mes assistant(e)s », vous invitez une personne et choisissez précisément ce qu'elle peut faire : voir l'agenda, confirmer, reprogrammer, créer un rendez-vous, gérer les créneaux. Aucune permission ne donne accès aux données financières.",
  },
  {
    q: "Mes données de santé sont-elles protégées ?",
    r: "Docteur 224 ne stocke pas de dossier médical : seuls les rendez-vous et les informations de contact nécessaires à la prise de rendez-vous sont conservés. Chaque compte n'accède qu'à ses propres données.",
  },
];

export default function Faq() {
  return (
    <PageContenu
      titre="Questions fréquentes"
      chapeau="Réserver, modifier, annuler, prendre rendez-vous pour un proche, inscrire son cabinet : voici l'essentiel."
    >
      {QUESTIONS.map((item) => (
        <Section key={item.q} titre={item.q}>
          {item.r}
        </Section>
      ))}

      <p className="mt-4 text-[13px] leading-relaxed text-muted">
        Votre question n’est pas là ?{" "}
        <Link href="/resultats" className="font-bold text-blue">
          Lancez une recherche
        </Link>{" "}
        ou contactez le secrétariat du praticien, dont le numéro figure sur sa fiche.
      </p>
    </PageContenu>
  );
}
