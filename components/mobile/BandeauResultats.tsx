import Link from "next/link";

/**
 * Barre « N résultats · Afficher la carte », posée au-dessus de la liste des
 * résultats (mobile).
 *
 * Le nombre est déjà dans la barre haute (« 13 médecins disponibles »), mais
 * celle-ci part au premier glissement : le compte doit rester là où on lit
 * les résultats. Il porte le total de la recherche, pas les douze de la page
 * courante — c'est la question à laquelle un patient veut une réponse
 * (« est-ce que j'ai le choix ? »).
 *
 * Composant serveur : deux liens, aucun état. La bascule passe par l'URL
 * (`?vue=carte`) et non par un état local, pour que le bouton Retour du
 * téléphone ramène à la liste et qu'une carte se partage par lien.
 */
export default function BandeauResultats({
  total,
  lienCarte,
}: {
  total: number;
  lienCarte: string;
}) {
  return (
    <div className="res-bandeau md:hidden">
      <b>
        {total} résultat{total > 1 ? "s" : ""}
      </b>
      {total > 0 && (
        <Link href={lienCarte} className="res-carte" scroll={false}>
          <span aria-hidden>🗺️</span> Afficher la carte
        </Link>
      )}
    </div>
  );
}
