import type { Metadata } from "next";
import Link from "next/link";
import PageContenu, { Section } from "@/components/site/PageContenu";

export const metadata: Metadata = {
  title: "À propos | Docteur 224",
  description:
    "Docteur 224 met en relation les patients guinéens et les professionnels de santé : recherche par spécialité et par ville, réservation en ligne, confirmation par SMS.",
};

/*
 * Page « À propos » — décrit ce que fait réellement la plateforme, sans
 * chiffres inventés : tout ce qui est affirmé ici correspond à une
 * fonctionnalité présente dans l'application.
 */
export default function APropos() {
  return (
    <PageContenu
      titre="À propos"
      chapeau="Docteur 224 rapproche les patients guinéens des professionnels de santé : trouver le bon praticien, voir ses disponibilités réelles et réserver en ligne, sans appel ni file d'attente."
    >
      <Section titre="Notre raison d'être">
        Prendre rendez-vous chez un médecin demande souvent de se déplacer ou d’appeler plusieurs
        fois un secrétariat. Docteur 224 rassemble au même endroit les praticiens, les
        établissements et leurs créneaux disponibles, pour que la prise de rendez-vous tienne en
        quelques minutes depuis un téléphone.
      </Section>

      <Section titre="Pour les patients">
        La recherche se fait par spécialité, par ville, par établissement ou par nom. Les
        disponibilités affichées sont celles que le praticien tient à jour ; la réservation est
        gratuite et confirmée par SMS et par e-mail. Chaque patient retrouve ses rendez-vous à
        venir et passés, peut les modifier ou les annuler, et gérer ceux de ses proches sans
        compte séparé.
      </Section>

      <Section titre="Pour les professionnels">
        Médecins, cliniques, hôpitaux et cabinets disposent d’un agenda en ligne, d’horaires types
        et d’exceptions, d’une fiche publique et de statistiques de fréquentation. Un médecin peut
        déléguer une partie de la gestion à un ou plusieurs assistant(e)s, avec des permissions
        précises. Les comptes professionnels sont validés par notre équipe avant publication.
      </Section>

      <Section titre="Avis et confiance">
        Un avis ne peut être déposé qu’après une consultation honorée, ce qui garantit qu’il émane
        d’un patient réellement reçu. Le praticien dispose d’un droit de réponse, et tout avis peut
        être signalé puis examiné par notre équipe de modération.
      </Section>

      <div className="mt-4 flex flex-wrap gap-3">
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
      </div>
    </PageContenu>
  );
}
