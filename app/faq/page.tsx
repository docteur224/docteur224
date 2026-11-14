import type { Metadata } from "next";
import Link from "next/link";
import PageContenu, { AppelAction } from "@/components/site/PageContenu";
import FaqInteractive, { type GroupeFaq } from "@/components/site/FaqInteractive";

export const metadata: Metadata = {
  title: "Questions fréquentes | Docteur 224",
  description:
    "Réserver, modifier ou annuler un rendez-vous, prendre rendez-vous pour un proche, déposer un avis, inscrire son cabinet : les réponses aux questions les plus courantes.",
};

/*
 * FAQ — chaque réponse décrit le comportement réel de l'application
 * (réservation, annulation, proches, avis, comptes professionnels).
 *
 * Le contenu vit ici, côté serveur : il alimente à la fois le balisage FAQPage
 * (schema.org) pour que les moteurs de recherche affichent ces réponses, et le
 * composant client <FaqInteractive> qui ajoute la recherche, les filtres et le
 * surlignage — tout ce par quoi un visiteur trouve la bonne réponse vite.
 */
const GROUPES: GroupeFaq[] = [
  {
    rubrique: "Prendre rendez-vous",
    questions: [
      {
        q: "La réservation est-elle payante ?",
        r: "Non. Prendre rendez-vous sur Docteur 224 est gratuit pour les patients. La consultation, elle, se règle sur place, directement auprès du praticien.",
      },
      {
        q: "Comment savoir si mon rendez-vous est bien pris ?",
        r: "Il apparaît immédiatement dans « Mes rendez-vous », et vous recevez une confirmation par SMS et par e-mail. Le praticien ou son secrétariat le confirme ensuite : vous êtes prévenu à ce moment-là.",
      },
      {
        q: "Les créneaux affichés sont-ils à jour ?",
        r: "Oui : ce sont les disponibilités que le praticien tient lui-même à jour, moins les créneaux déjà réservés. Un créneau pris disparaît aussitôt de la liste.",
      },
      {
        q: "Puis-je prendre rendez-vous pour quelqu’un d’autre ?",
        r: "Oui. Ajoutez la personne dans « Mes proches » (enfant, conjoint, parent…), puis choisissez-la au moment de réserver. Vos proches n’ont pas besoin de compte.",
      },
    ],
  },
  {
    rubrique: "Modifier ou annuler",
    questions: [
      {
        q: "Puis-je déplacer ou annuler un rendez-vous ?",
        r: "Oui, depuis « Mes rendez-vous », tant que le créneau n’est pas passé. « Modifier » le déplace sur une autre disponibilité du même praticien, « Annuler » le libère. Prévenez le plus tôt possible : le créneau est aussitôt rendu à un autre patient.",
      },
      {
        q: "Que se passe-t-il si je ne me présente pas ?",
        r: "Le praticien note le rendez-vous comme non honoré. Annuler en ligne, même au dernier moment, reste toujours préférable : c’est ce qui permet à quelqu’un d’autre de prendre la place.",
      },
      {
        q: "Le praticien peut-il annuler de son côté ?",
        r: "Oui, en cas d’urgence ou d’imprévu. Vous en êtes averti par notification, par SMS et par e-mail, et vous pouvez immédiatement choisir un autre créneau.",
      },
    ],
  },
  {
    rubrique: "Avis et confiance",
    questions: [
      {
        q: "Qui peut laisser un avis ?",
        r: "Uniquement un patient dont la consultation a réellement eu lieu, et une seule fois par consultation. C’est ce qui distingue ces avis de commentaires anonymes.",
      },
      {
        q: "Un praticien peut-il faire retirer un avis qui lui déplaît ?",
        r: "Non. Il dispose d’un droit de réponse publique. Un avis ne peut être retiré que par son auteur, ou par notre équipe s’il est signalé et contraire aux règles (propos injurieux, contenu hors sujet, données personnelles).",
      },
      {
        q: "Les profils des médecins sont-ils vérifiés ?",
        r: "Oui. Les comptes professionnels sont contrôlés par notre équipe avant la mise en ligne de la fiche : un praticien n’apparaît dans les résultats qu’une fois son dossier validé.",
      },
    ],
  },
  {
    rubrique: "Messages et contact",
    questions: [
      {
        q: "Puis-je écrire à un médecin sans avoir de rendez-vous ?",
        r: "Oui. Depuis la messagerie, vous pouvez contacter n’importe quel médecin validé de l’annuaire pour une question, sans qu’un rendez-vous soit nécessaire. Pour une urgence vitale, appelez les secours.",
      },
      {
        q: "Qui répond à mes questions médicales ou pratiques ?",
        r: "Le praticien et son secrétariat. Leur numéro figure sur la fiche du médecin ; notre équipe, elle, gère le fonctionnement du site et la vérification des comptes.",
      },
    ],
  },
  {
    rubrique: "Professionnels de santé",
    questions: [
      {
        q: "Je suis médecin : comment m’inscrire ?",
        r: "Créez un compte professionnel, renseignez votre spécialité et vos justificatifs. Notre équipe vérifie le dossier avant la mise en ligne de votre fiche ; vous êtes prévenu dès la validation.",
      },
      {
        q: "Puis-je confier mon agenda à mon secrétariat ?",
        r: "Oui. Depuis « Mes assistant(e)s », vous invitez une personne et choisissez précisément ce qu’elle peut faire : voir l’agenda, confirmer, reprogrammer, créer un rendez-vous, gérer les créneaux. Aucune permission ne donne accès aux données financières.",
      },
      {
        q: "Puis-je rattacher mon cabinet à un établissement ?",
        r: "Un établissement peut vous inviter à le rejoindre ; vous recevez l’invitation dans votre espace et restez libre de l’accepter ou de la refuser.",
      },
    ],
  },
  {
    rubrique: "Compte et données",
    questions: [
      {
        q: "J’ai oublié mon mot de passe : comment le réinitialiser ?",
        r: "Depuis l’écran de connexion, utilisez « Mot de passe oublié ». Un e-mail contenant un lien de réinitialisation vous est envoyé ; ce lien est valable un temps limité et à usage unique.",
      },
      {
        q: "Mes données de santé sont-elles protégées ?",
        r: "Docteur 224 ne stocke pas de dossier médical : seuls les rendez-vous et les informations de contact nécessaires à leur prise sont conservés. Chaque compte n’accède qu’à ses propres données.",
      },
      {
        q: "Puis-je désactiver les rappels par SMS ou par e-mail ?",
        r: "Oui, dans « Paramètres » de votre espace patient. Les notifications dans l’application, elles, restent affichées dans la cloche.",
      },
    ],
  },
];

/** Balisage schema.org FAQPage — permet aux moteurs d'afficher ces réponses. */
const jsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: GROUPES.flatMap((groupe) =>
    groupe.questions.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: { "@type": "Answer", text: item.r },
    })),
  ),
};

export default function Faq() {
  return (
    <PageContenu
      titre="Questions fréquentes"
      emoji="💬"
      large
      chapeau="Cherchez par mot-clé ou parcourez les rubriques : réserver, modifier, annuler, prendre rendez-vous pour un proche, inscrire son cabinet — l’essentiel est là."
    >
      {/* Données structurées pour le référencement (rich results Google). */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <FaqInteractive groupes={GROUPES} />

      <AppelAction
        titre="Votre question n’est pas là ?"
        texte="Le secrétariat du praticien répond aux questions médicales et pratiques ; son numéro figure sur sa fiche."
      >
        <Link
          href="/resultats"
          className="pointer-coarse:py-3 rounded-[11px] bg-teal px-[18px] py-[11px] text-[13.5px] font-bold text-white transition-colors hover:bg-[#2790bc]"
        >
          Trouver un médecin
        </Link>
        <Link
          href="/a-propos"
          className="rounded-[11px] border-[1.5px] border-line bg-white px-[18px] py-[11px] text-[13.5px] font-bold text-blue transition-colors hover:bg-bg"
        >
          En savoir plus sur Docteur 224
        </Link>
      </AppelAction>
    </PageContenu>
  );
}
