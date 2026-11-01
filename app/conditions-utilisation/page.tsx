import type { Metadata } from "next";
import Link from "next/link";
import PageContenu, { AppelAction, Rubrique, Section } from "@/components/site/PageContenu";

export const metadata: Metadata = {
  title: "Conditions d’utilisation | Docteur 224",
  description:
    "Les règles d’utilisation de Docteur 224 : nature du service, compte utilisateur, prise de rendez-vous, tarifs, responsabilité, urgences et données personnelles.",
};

/*
 * Page « Conditions d'utilisation » — reprend la structure des termes et
 * conditions d'une plateforme de prise de rendez-vous (objet, nature du
 * service, compte, réservation, tarifs, professionnels, responsabilité,
 * urgences, données, évolution), mais chaque clause décrit ce que
 * Docteur 224 fait réellement : rien n'y est promis qui ne soit dans
 * l'application.
 */

/** Date de la dernière révision, affichée en tête et en pied. */
const DERNIERE_MISE_A_JOUR = "1er novembre 2026";

export default function ConditionsUtilisation() {
  return (
    <PageContenu
      titre="Conditions d’utilisation"
      emoji="📄"
      chapeau="Ces conditions encadrent l’utilisation de Docteur 224 par les patients comme par les professionnels de santé. En utilisant la plateforme, vous les acceptez."
    >
      <p className="mb-4 text-[12.5px] text-muted md:text-[13px]">
        Dernière mise à jour : {DERNIERE_MISE_A_JOUR}.
      </p>

      <Rubrique>Le service</Rubrique>
      <Section titre="1. Objet" icone="🎯">
        Les présentes conditions définissent les règles d’accès et d’utilisation de la plateforme
        Docteur 224, de son site et de ses pages mobiles. Elles s’appliquent à toute personne qui
        consulte la plateforme, réserve un rendez-vous ou y dispose d’un compte. L’utilisation du
        service vaut acceptation pleine et entière de ces conditions ; si vous ne les acceptez pas,
        n’utilisez pas la plateforme.
      </Section>
      <Section titre="2. Nature du service" icone="🔗">
        Docteur 224 est un service de mise en relation entre des patients et des professionnels de
        santé exerçant en Guinée, pour la recherche d’un praticien et la prise de rendez-vous.
        <b className="text-ink">
          {" "}
          Docteur 224 n’exerce aucune activité médicale, ne donne aucun avis médical et n’intervient
          pas dans la relation de soins.
        </b>{" "}
        Le professionnel de santé est seul responsable de ses actes, de ses diagnostics, de ses
        tarifs, de ses horaires, de ses disponibilités et des informations publiées sur sa fiche.
        Les comptes professionnels sont contrôlés par notre équipe avant la mise en ligne de la
        fiche, mais ce contrôle ne constitue ni une recommandation ni une garantie sur la qualité
        des soins.
      </Section>

      <Rubrique>Votre compte</Rubrique>
      <Section titre="3. Compte utilisateur" icone="👤">
        La recherche d’un praticien est libre et ne demande aucun compte. La création d’un compte
        donne accès à l’historique de vos rendez-vous, à leur modification ou à leur annulation en
        ligne, à la messagerie et à la gestion des rendez-vous de vos proches. Vous vous engagez à
        fournir des informations exactes et à les tenir à jour, notamment votre numéro de téléphone
        et votre adresse e-mail, qui servent à vous transmettre les confirmations et les rappels.
        Vous êtes responsable de la confidentialité de vos identifiants — mot de passe ou code PIN —
        et de toute activité effectuée depuis votre compte. Prévenez-nous sans délai si vous
        soupçonnez un accès non autorisé.
      </Section>
      <Section titre="4. Rendez-vous pour un proche" icone="👨‍👩‍👧">
        Vous pouvez réserver pour un enfant, un conjoint ou un parent sans qu’il dispose d’un
        compte. En le faisant, vous déclarez être habilité à communiquer ses informations et à
        prendre ce rendez-vous en son nom, et vous vous engagez à l’informer du traitement de ses
        données par la plateforme.
      </Section>

      <Rubrique>Rendez-vous et tarifs</Rubrique>
      <Section titre="5. Prise de rendez-vous" icone="📅">
        Les créneaux affichés sont ceux que le praticien tient à jour dans son agenda. Selon le
        praticien, le rendez-vous est confirmé immédiatement ou soumis à son approbation ; dans les
        deux cas, vous en êtes informé par SMS et par e-mail. Un praticien peut être amené à
        déplacer ou à annuler un rendez-vous, notamment en cas d’urgence ou d’absence.
        <b className="text-ink">
          {" "}
          Si vous ne pouvez pas vous présenter, annulez le plus tôt possible depuis votre espace :
        </b>{" "}
        le créneau est aussitôt rendu à un autre patient. Les rendez-vous non honorés de façon
        répétée peuvent conduire à la restriction de la réservation en ligne.
      </Section>
      <Section titre="6. Tarifs" icone="💳">
        La recherche et la prise de rendez-vous sont gratuites pour les patients : aucun paiement
        n’est effectué sur la plateforme. La consultation se règle directement auprès du praticien
        ou de l’établissement, selon leurs modalités. Les tarifs affichés sur les fiches sont
        communiqués par les praticiens et donnés à titre indicatif : confirmez-les auprès du cabinet
        avant de vous déplacer.
      </Section>

      <Rubrique>Professionnels de santé</Rubrique>
      <Section titre="7. Engagements du professionnel" icone="🩺">
        En créant un compte professionnel, vous garantissez être légalement autorisé à exercer votre
        profession, détenir les titres et autorisations que vous déclarez, et fournir des documents
        authentiques à l’appui de votre inscription. Vous vous engagez à tenir à jour votre fiche,
        vos horaires, vos tarifs et vos disponibilités, à respecter les règles déontologiques de
        votre profession et le secret professionnel, et à honorer les rendez-vous acceptés. Vous
        restez responsable des accès que vous déléguez à vos assistant(e)s. Certaines
        fonctionnalités relèvent d’une formule d’abonnement, dont les conditions et les quotas sont
        présentés au moment de la souscription.
      </Section>
      <Section titre="8. Avis des patients" icone="⭐">
        Un avis ne peut être déposé qu’à la suite d’une consultation honorée, et une seule fois par
        consultation. Les avis doivent rester factuels et courtois : les propos injurieux,
        diffamatoires, hors sujet ou contenant des données de santé de tiers peuvent être retirés.
        Le praticien dispose d’un droit de réponse publique et tout avis peut être signalé, puis
        examiné par notre équipe.
      </Section>
      <Section titre="9. Usage de la plateforme" icone="🚫">
        Vous vous engagez à ne pas utiliser la plateforme à des fins frauduleuses ou illicites, à ne
        pas créer de faux comptes ni de fausses réservations, à ne pas usurper l’identité d’un
        praticien ou d’un patient, à ne pas extraire de façon automatisée les données du site, et à
        ne pas tenter d’en perturber le fonctionnement ou d’accéder à des espaces qui ne vous sont
        pas destinés. En cas de manquement, l’accès au compte peut être suspendu, le temps d’un
        examen ou de façon définitive.
      </Section>

      <Rubrique>Responsabilité</Rubrique>
      <Section titre="10. Limites de responsabilité" icone="⚖️">
        Docteur 224 met en œuvre des moyens raisonnables pour assurer la disponibilité et
        l’exactitude du service, sans garantir qu’il sera exempt d’interruption, d’erreur ou de
        retard — y compris dans l’acheminement des SMS et des e-mails, qui dépend d’opérateurs
        tiers. La plateforme n’est pas responsable des informations publiées par les praticiens, du
        déroulement, du contenu ou de l’issue de la consultation, ni d’un rendez-vous déplacé ou
        annulé par un praticien. Les maintenances nécessaires peuvent rendre le service
        momentanément indisponible.
      </Section>
      <Section titre="11. Urgences médicales" icone="🚨">
        <b className="text-ink">
          Docteur 224 ne doit jamais être utilisé en cas d’urgence vitale.
        </b>{" "}
        La plateforme n’assure aucune permanence et les demandes n’y sont pas surveillées en temps
        réel. En cas d’urgence, appelez les secours ou rendez-vous immédiatement au service
        d’urgences de l’établissement le plus proche.
      </Section>

      <Rubrique>Données et évolution</Rubrique>
      <Section titre="12. Données personnelles" icone="🔒">
        Docteur 224 ne constitue pas de dossier médical : seules les informations nécessaires à la
        prise de rendez-vous et au suivi de votre compte sont conservées. Chaque compte n’accède
        qu’à ses propres données ; les documents remis par un praticien restent consultables par le
        patient concerné. Les données collectées, leurs destinataires, leur durée de conservation et
        les moyens d’exercer vos droits sont détaillés dans notre page{" "}
        <Link href="/protection-donnees" className="font-semibold text-teal underline">
          Protection des données
        </Link>
        , qui fait partie intégrante des présentes conditions.
      </Section>
      <Section titre="13. Propriété intellectuelle" icone="©️">
        La plateforme, sa marque, son logo, ses textes et ses interfaces sont protégés. Les
        informations publiées par un praticien sur sa fiche restent les siennes, et il autorise
        Docteur 224 à les afficher dans le cadre du service. Aucune reprise ou reproduction du site
        n’est autorisée sans accord écrit.
      </Section>
      <Section titre="14. Évolution des conditions" icone="🔄">
        Ces conditions peuvent être modifiées pour suivre l’évolution du service ou de la
        réglementation. La version applicable est celle publiée sur cette page ; sa date de
        dernière mise à jour figure en tête. Les changements importants sont signalés sur le site,
        et la poursuite de l’utilisation de la plateforme après leur publication vaut acceptation.
      </Section>
      <Section titre="15. Droit applicable" icone="🇬🇳">
        Ces conditions sont régies par le droit guinéen. En cas de différend, une solution amiable
        sera recherchée en priorité ; à défaut, les tribunaux compétents de Conakry pourront être
        saisis.
      </Section>

      <AppelAction
        titre="Une question sur ces conditions ?"
        texte="Les questions les plus courantes sur la réservation, l’annulation et les comptes sont déjà traitées dans notre aide."
      >
        <Link
          href="/faq"
          className="pointer-coarse:py-3 rounded-[11px] bg-teal px-[18px] py-[11px] text-[13.5px] font-bold text-white transition-colors hover:bg-[#2790bc]"
        >
          Questions fréquentes
        </Link>
        <Link
          href="/a-propos"
          className="rounded-[11px] border-[1.5px] border-line bg-white px-[18px] py-[11px] text-[13.5px] font-bold text-blue transition-colors hover:bg-bg"
        >
          À propos de Docteur 224
        </Link>
      </AppelAction>
    </PageContenu>
  );
}
