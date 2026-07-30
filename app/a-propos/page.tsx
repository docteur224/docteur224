import type { Metadata } from "next";
import Link from "next/link";
import PageContenu, { AppelAction, Rubrique, Section } from "@/components/site/PageContenu";

export const metadata: Metadata = {
  title: "À propos | Docteur 224",
  description:
    "Docteur 224 met en relation les patients guinéens et les professionnels de santé : recherche par spécialité et par ville, réservation en ligne, confirmation par SMS.",
};

/*
 * Page « À propos » — décrit ce que fait réellement la plateforme, sans
 * chiffres inventés : chaque affirmation correspond à une fonctionnalité
 * présente dans l'application.
 */

/** Les trois temps du parcours, repris de l'accueil. */
const ETAPES = [
  {
    n: "1",
    titre: "Cherchez",
    texte: "Par spécialité, par ville, par établissement ou par nom du praticien.",
  },
  {
    n: "2",
    titre: "Choisissez un créneau",
    texte: "Les disponibilités affichées sont celles que le praticien tient à jour.",
  },
  {
    n: "3",
    titre: "Confirmez",
    texte: "La réservation est gratuite, confirmée par SMS et par e-mail.",
  },
];

export default function APropos() {
  return (
    <PageContenu
      titre="À propos"
      emoji="🤝"
      chapeau="Docteur 224 rapproche les patients guinéens des professionnels de santé : trouver le bon praticien, voir ses disponibilités réelles et réserver en ligne, sans appel ni file d’attente."
    >
      <Rubrique>Notre raison d’être</Rubrique>
      <Section titre="Prendre rendez-vous ne devrait pas être une épreuve" icone="🎯">
        Obtenir une consultation demande souvent de se déplacer ou d’appeler plusieurs fois un
        secrétariat, sans savoir si le praticien est disponible. Docteur 224 rassemble au même
        endroit les médecins, les établissements et leurs créneaux réels, pour que la prise de
        rendez-vous tienne en quelques minutes depuis un téléphone.
      </Section>

      <Rubrique>Comment ça marche</Rubrique>
      <div className="mb-3 grid gap-2.5 md:mb-4 md:grid-cols-3 md:gap-4">
        {ETAPES.map((e) => (
          <div key={e.n} className="rounded-2xl border border-line bg-white p-[18px] md:p-5">
            <span
              aria-hidden
              className="grid h-8 w-8 place-items-center rounded-[10px] bg-teal-soft text-[14px] font-extrabold text-blue"
            >
              {e.n}
            </span>
            <b className="mt-3 block text-[14px] font-extrabold">{e.titre}</b>
            <p className="mt-1 text-[12.5px] leading-relaxed text-muted md:text-[13px]">
              {e.texte}
            </p>
          </div>
        ))}
      </div>

      <Rubrique>Ce que vous y trouvez</Rubrique>
      <Section titre="Pour les patients" icone="🧑">
        La réservation est gratuite. Vous retrouvez vos rendez-vous à venir et passés, vous pouvez
        les modifier ou les annuler en ligne, et gérer ceux de vos proches — enfant, conjoint,
        parent — sans qu’ils aient besoin d’un compte.
      </Section>
      <Section titre="Pour les professionnels" icone="🩺">
        Médecins, cliniques, hôpitaux et cabinets disposent d’un agenda en ligne, d’horaires types
        et d’exceptions, d’une fiche publique et de statistiques de fréquentation. Un médecin peut
        déléguer une partie de la gestion à ses assistant(e)s, avec des permissions précises.
      </Section>
      <Section titre="Des avis qui engagent" icone="⭐">
        Un avis ne peut être déposé qu’après une consultation honorée, et une seule fois par
        consultation : c’est ce qui garantit qu’il émane d’un patient réellement reçu. Le praticien
        dispose d’un droit de réponse, et tout avis peut être signalé puis examiné par notre équipe.
      </Section>

      <Rubrique>Confiance et données</Rubrique>
      <Section titre="Comptes vérifiés" icone="✅">
        Les comptes professionnels sont contrôlés par notre équipe avant la mise en ligne de la
        fiche : un praticien n’apparaît dans les résultats qu’une fois son dossier validé.
      </Section>
      <Section titre="Vos données restent les vôtres" icone="🔒">
        Docteur 224 ne conserve pas de dossier médical. Seuls vos rendez-vous et les informations
        nécessaires à leur prise sont enregistrés, et chaque compte n’accède qu’à ses propres
        données.
      </Section>

      <AppelAction
        titre="Prêt à prendre rendez-vous ?"
        texte="La recherche est ouverte à tous, la réservation ne prend que quelques minutes."
      >
        <Link
          href="/resultats"
          className="rounded-[11px] bg-teal px-[18px] py-[11px] text-[13.5px] font-bold text-white transition-colors hover:bg-[#2790bc]"
        >
          Trouver un médecin
        </Link>
        <Link
          href="/inscription/professionnel"
          className="rounded-[11px] border-[1.5px] border-line bg-white px-[18px] py-[11px] text-[13.5px] font-bold text-blue transition-colors hover:bg-bg"
        >
          Je suis professionnel de santé
        </Link>
      </AppelAction>
    </PageContenu>
  );
}
