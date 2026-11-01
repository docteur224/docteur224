/**
 * Contenu de la pastille d'avatar (barre haute et tiroir mobiles) : la photo
 * du professionnel s'il en a chargé une, sinon ses initiales.
 */
export default function PastilleProfil({ photo, initiales }: { photo?: string | null; initiales: string }) {
  if (!photo) return <>{initiales}</>;
  return (
    // Image Cloudinary déjà redimensionnée à l'envoi (même choix qu'AvatarMedecin).
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={photo}
      alt=""
      style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "inherit" }}
    />
  );
}
