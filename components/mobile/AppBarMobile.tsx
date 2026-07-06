import Link from "next/link";

/**
 * Barre d'application mobile — reproduit la .appbar de la maquette mobile
 * (bouton retour carré + titre, sous-titre optionnel, action à droite).
 * À utiliser uniquement dans les blocs mobiles (`md:hidden`).
 */
export default function AppBarMobile({
  titre,
  sousTitre,
  retour,
  droite,
}: {
  titre: string;
  sousTitre?: string;
  retour?: string;
  droite?: React.ReactNode;
}) {
  return (
    <div className="appbar">
      {retour && (
        <Link href={retour} className="back" aria-label="Retour">
          ←
        </Link>
      )}
      <div style={retour ? undefined : { paddingLeft: 4 }}>
        <h3>{titre}</h3>
        {sousTitre && <div className="sub">{sousTitre}</div>}
      </div>
      {droite && <div style={{ marginLeft: "auto" }}>{droite}</div>}
    </div>
  );
}
