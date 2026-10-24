import type { NomIcone } from "@/components/site/Icone";
import { CARTE, EtatVide } from "./ui";

/**
 * Onglet déclaré mais dont le contenu n'est pas encore livré. Il occupe sa
 * place dans la navigation — on voit où il arrivera — sans offrir de bouton
 * qui ne mènerait nulle part.
 */
export default function ModuleEnPreparation({
  icone,
  titre,
  texte,
}: {
  icone: NomIcone;
  titre: string;
  texte: string;
}) {
  return (
    <section className={CARTE}>
      <EtatVide
        icone={icone}
        titre={titre}
        texte={texte}
        action={
          <span className="rounded-full bg-amber-soft px-3 py-1 text-[11.5px] font-bold text-amber">
            Bientôt disponible
          </span>
        }
      />
    </section>
  );
}
