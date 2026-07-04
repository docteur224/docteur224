import EcranAVenir from "@/components/site/EcranAVenir";
import { getMedecin, nomComplet } from "@/lib/mock-data";

export default async function FicheMedecin({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const medecin = getMedecin(id);
  return (
    <EcranAVenir
      titre={medecin ? `Fiche de ${nomComplet(medecin)}` : "Fiche médecin"}
      phase="Phase 4 (tranche verticale de réservation)"
    />
  );
}
