/*
 * Avatar d'un médecin : sa photo si elle existe, sinon les initiales sur le
 * dégradé de la maquette. Toutes les surfaces publiques (résultats, accueil,
 * fiche) passent par ici pour que l'ajout d'une photo se voie partout.
 *
 * Composant serveur : pas d'état, juste un choix d'affichage.
 */
export default function AvatarMedecin({
  photoUrl,
  initiales,
  gradient,
  taille,
  arrondi = 16,
  className = "",
}: {
  photoUrl: string | null;
  initiales: string;
  gradient: string;
  taille: number;
  /** Rayon des coins en pixels. */
  arrondi?: number;
  className?: string;
}) {
  if (photoUrl) {
    return (
      // Image Cloudinary déjà redimensionnée à l'envoi (400×400) : next/image
      // n'apporterait rien et imposerait de déclarer le domaine distant.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={photoUrl}
        alt=""
        width={taille}
        height={taille}
        className={`flex-none object-cover ${className}`}
        style={{ width: taille, height: taille, borderRadius: arrondi }}
      />
    );
  }
  return (
    <span
      aria-hidden
      className={`grid flex-none place-items-center font-extrabold text-white ${className}`}
      style={{
        width: taille,
        height: taille,
        borderRadius: arrondi,
        background: gradient,
        fontSize: Math.round(taille / 3),
      }}
    >
      {initiales}
    </span>
  );
}
