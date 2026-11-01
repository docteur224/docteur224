import type { Metadata } from "next";
import Link from "next/link";
import PageContenu, { AppelAction, Rubrique, Section } from "@/components/site/PageContenu";

export const metadata: Metadata = {
  title: "Protection des données | Docteur 224",
  description:
    "Quelles données Docteur 224 collecte, pourquoi, qui y a accès, combien de temps elles sont conservées et comment exercer vos droits.",
};

/*
 * Page « Protection des données » — pendant des conditions d'utilisation.
 *
 * Même règle que pour celles-ci : aucune affirmation qui ne corresponde au
 * fonctionnement réel de l'application. Les destinataires listés sont les
 * prestataires effectivement utilisés (Supabase, Vercel, Cloudinary, l'envoi
 * d'e-mails, l'agrégateur SMS) ; aucune mesure d'audience n'est mentionnée
 * puisque le site n'en embarque aucune.
 */

/** Date de la dernière révision, affichée en tête. */
const DERNIERE_MISE_A_JOUR = "1er novembre 2026";

/** Adresse de contact pour les demandes relatives aux données. */
const CONTACT = "contact@docteur224.com";

export default function ProtectionDonnees() {
  return (
    <PageContenu
      titre="Protection des données"
      emoji="🔒"
      chapeau="Docteur 224 ne conserve que ce qui sert à prendre et à suivre vos rendez-vous. Cette page dit lesquelles de vos données sont enregistrées, pourquoi, qui y accède et comment les faire supprimer."
    >
      <p className="mb-4 text-[12.5px] text-muted md:text-[13px]">
        Dernière mise à jour : {DERNIERE_MISE_A_JOUR}. Cette page fait partie intégrante des{" "}
        <Link href="/conditions-utilisation" className="font-semibold text-teal underline">
          conditions d’utilisation
        </Link>
        .
      </p>

      <Rubrique>Qui traite vos données</Rubrique>
      <Section titre="Responsable du traitement" icone="🏢">
        Les données collectées sur la plateforme sont traitées par Docteur 224, dont le service est
        exploité depuis Conakry, en Guinée. Pour toute question ou demande relative à vos données,
        écrivez à{" "}
        <a href={`mailto:${CONTACT}`} className="font-semibold text-teal underline">
          {CONTACT}
        </a>{" "}
        en précisant l’objet « Données personnelles ».
      </Section>

      <Rubrique>Ce qui est collecté</Rubrique>
      <Section titre="1. Données collectées" icone="📋">
        <ul className="list-disc space-y-1.5 pl-4">
          <li>
            <b className="text-ink">À la prise de rendez-vous</b> : nom et prénom, numéro de
            téléphone, adresse e-mail, motif de consultation, ainsi que les mêmes informations pour
            le proche concerné lorsque vous réservez pour quelqu’un d’autre.
          </li>
          <li>
            <b className="text-ink">Pour votre compte</b> : identifiants de connexion — mot de passe
            ou code PIN, toujours conservés sous forme chiffrée et jamais lisibles par nos équipes —
            civilité, date de naissance, commune, et vos préférences d’affichage.
          </li>
          <li>
            <b className="text-ink">Pour un compte professionnel</b> : coordonnées
            professionnelles, spécialité, lieu d’exercice, tarifs, horaires et pièces justificatives
            transmises lors de l’inscription.
          </li>
          <li>
            <b className="text-ink">Au fil de l’utilisation</b> : vos rendez-vous, vos messages
            échangés via la messagerie, vos favoris, les avis que vous déposez et les notifications
            qui vous sont adressées.
          </li>
          <li>
            <b className="text-ink">Techniquement</b> : un cookie de session pour vous maintenir
            connecté, et des journaux techniques (date, type d’opération) nécessaires à la sécurité
            du service.
          </li>
        </ul>
      </Section>
      <Section titre="2. Votre historique de rendez-vous" icone="📅">
        Le motif, la date, le praticien, le lieu et le statut de chaque rendez-vous — à venir,
        honoré, annulé, non honoré — sont conservés et consultables depuis votre espace. Cet
        historique vous permet de retrouver une consultation passée et de reprendre rendez-vous avec
        le même praticien ; il sert également au praticien à assurer votre suivi.
      </Section>
      <Section titre="3. Vos documents de santé" icone="📄">
        Les ordonnances, certificats, demandes d’examen et comptes rendus remis par un praticien
        sont rangés dans votre espace et accessibles à vous seul et au praticien émetteur.
        <b className="text-ink">
          {" "}
          Une pièce remise n’est jamais effacée :
        </b>{" "}
        une erreur se corrige par une nouvelle version et une pièce retirée l’est avec un motif,
        l’une et l’autre restant tracées. C’est ce qui donne sa valeur au document que vous
        présentez en pharmacie ou au laboratoire. Docteur 224 ne constitue pas pour autant de
        dossier médical : nous n’ajoutons aucune information de santé de notre propre initiative.
      </Section>

      <Rubrique>Usage et accès</Rubrique>
      <Section titre="4. Pourquoi ces données" icone="🎯">
        Elles servent uniquement à faire fonctionner le service : transmettre votre demande au
        praticien et lui permettre de vous recevoir, vous envoyer les confirmations, modifications,
        rappels et annulations par SMS et par e-mail, vous donner accès à votre historique et à vos
        documents, répondre à vos messages, vérifier les comptes professionnels avant leur mise en
        ligne, et assurer la sécurité de la plateforme contre la fraude et les abus.
      </Section>
      <Section titre="5. Qui y a accès" icone="👥">
        <ul className="list-disc space-y-1.5 pl-4">
          <li>
            <b className="text-ink">Le praticien que vous consultez</b>, ainsi que les
            assistant(e)s auxquels il a donné l’accès correspondant — et eux seuls : un praticien ne
            voit pas les rendez-vous pris chez un confrère.
          </li>
          <li>
            <b className="text-ink">L’établissement de rattachement</b> ne voit que des volumes
            d’activité agrégés, jamais l’identité de vos rendez-vous ni leur motif.
          </li>
          <li>
            <b className="text-ink">Notre équipe de support</b>, strictement pour traiter une
            demande, valider un compte professionnel ou examiner un signalement.
          </li>
          <li>
            <b className="text-ink">Nos prestataires techniques</b>, agissant pour notre compte :
            l’hébergeur de la base de données et de l’authentification, l’hébergeur du site, le
            service de stockage des images et documents, le service d’envoi des e-mails et
            l’agrégateur chargé de l’acheminement des SMS.
          </li>
        </ul>
        <p className="mt-2.5">
          <b className="text-ink">
            Vos données ne sont ni vendues, ni louées, ni cédées à des fins publicitaires.
          </b>{" "}
          Le site n’embarque aucun outil de publicité ni de profilage.
        </p>
      </Section>

      <Rubrique>Conservation et sécurité</Rubrique>
      <Section titre="6. Durée de conservation" icone="⏳">
        Les données de votre compte sont conservées tant qu’il est actif, puis supprimées à sa
        fermeture. L’historique des rendez-vous et les documents remis relèvent des obligations de
        conservation qui s’imposent au praticien : ils restent accessibles de son côté même après la
        fermeture de votre compte, et n’apparaissent plus du vôtre. Les messages adressés au support
        sont conservés le temps de leur traitement, les journaux techniques quelques mois pour les
        besoins de sécurité. Vous pouvez demander la fermeture de votre compte à tout moment.
      </Section>
      <Section titre="7. Sécurité" icone="🛡️">
        Les échanges avec la plateforme sont chiffrés, les mots de passe et codes PIN ne sont jamais
        stockés en clair, et l’accès à chaque donnée est cloisonné au niveau de la base : un compte
        n’atteint techniquement que ce qui le concerne. Les accès de notre équipe sont limités au
        nécessaire et tracés. Aucun système n’étant infaillible, signalez-nous sans délai tout
        comportement suspect sur votre compte.
      </Section>

      <Rubrique>Vos droits</Rubrique>
      <Section titre="8. Accès, rectification, suppression" icone="✅">
        Vous pouvez consulter et corriger la plupart de vos informations directement depuis votre
        espace. Vous disposez par ailleurs d’un droit d’accès, de rectification, de suppression et
        d’opposition sur vos données : adressez votre demande à{" "}
        <a href={`mailto:${CONTACT}`} className="font-semibold text-teal underline">
          {CONTACT}
        </a>{" "}
        avec l’objet « Données personnelles ». Nous y répondons sous 30 jours. Une preuve d’identité
        peut être demandée avant toute suppression, afin que personne ne puisse faire effacer le
        compte d’un autre.
      </Section>
      <Section titre="9. Cookies" icone="🍪">
        Docteur 224 n’utilise pas de cookies publicitaires et ne mesure pas votre audience chez des
        tiers. Seuls sont déposés les cookies nécessaires au fonctionnement : le cookie de session
        qui vous maintient connecté. Vos préférences d’affichage — thème clair ou sombre, couleurs,
        menu plié — sont enregistrées dans votre navigateur et ne nous sont pas transmises. Vous
        pouvez les effacer à tout moment en vidant les données du site ; vous serez alors
        déconnecté.
      </Section>
      <Section titre="10. Évolution de cette page" icone="🔄">
        Cette politique peut être modifiée pour suivre l’évolution du service. La version applicable
        est celle publiée ici, sa date de dernière mise à jour figurant en tête ; les changements
        importants sont signalés sur le site.
      </Section>

      <AppelAction
        titre="Une demande sur vos données ?"
        texte="Écrivez-nous avec l’objet « Données personnelles » : accès, correction ou suppression de votre compte."
      >
        <a
          href={`mailto:${CONTACT}?subject=${encodeURIComponent("Données personnelles")}`}
          className="pointer-coarse:py-3 rounded-[11px] bg-teal px-[18px] py-[11px] text-[13.5px] font-bold text-white transition-colors hover:bg-[#2790bc]"
        >
          Nous écrire
        </a>
        <Link
          href="/conditions-utilisation"
          className="rounded-[11px] border-[1.5px] border-line bg-white px-[18px] py-[11px] text-[13.5px] font-bold text-blue transition-colors hover:bg-bg"
        >
          Conditions d’utilisation
        </Link>
      </AppelAction>
    </PageContenu>
  );
}
