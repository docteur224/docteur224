import type { Metadata } from "next";
import FormulaireVerification from "@/components/site/FormulaireVerification";
import PageContenu from "@/components/site/PageContenu";

/*
 * Entrée de la vérification sans QR : on recopie le code imprimé sous le QR.
 * C'est l'adresse imprimée en clair sur chaque document émis.
 */

export const metadata: Metadata = {
  title: "Vérifier un document — Docteur 224",
  robots: { index: false, follow: false },
};

export default function PageVerifier() {
  return (
    <PageContenu titre="Vérifier un document" chapeau="Ordonnances, certificats et arrêts de travail émis via Docteur 224." emoji="🔎">
      <div className="mx-auto grid max-w-[560px] gap-4">
        <div className="rounded-2xl border border-line bg-white p-4">
          <p className="mb-3 text-[13px] leading-relaxed text-muted">
            Scannez le QR du document avec l’appareil photo de votre téléphone, ou saisissez le code imprimé dessous. La
            réponse indique si le document est valide, annulé ou remplacé, avec sa date et le médecin qui l’a émis — rien
            sur le patient.
          </p>
          <FormulaireVerification />
        </div>
      </div>
    </PageContenu>
  );
}
