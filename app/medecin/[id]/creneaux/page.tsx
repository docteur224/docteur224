import type { Metadata } from "next";
import { notFound } from "next/navigation";
import TopNav from "@/components/site/TopNav";
import EnTeteMobile from "@/components/mobile/EnTeteMobile";
import CreneauxMobile from "@/components/mobile/CreneauxMobile";
import PanneauReservation from "@/components/site/PanneauReservation";
import { chargerMedecinParId, nomComplet } from "@/lib/donnees";

/*
 * Choix du créneau (mobile) — reproduit l'écran « creneaux » de la maquette
 * mobile. Sur la version web, ce choix se fait directement dans le panneau
 * de la fiche médecin ; cette route sert le parcours mobile et affiche le
 * même panneau web en repli au-delà de md.
 */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const medecin = await chargerMedecinParId(id);
  if (!medecin) return { title: "Médecin introuvable | Docteur 224" };
  return { title: `Choisir un créneau — ${nomComplet(medecin)} | Docteur 224` };
}

export default async function ChoixCreneau({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const medecin = await chargerMedecinParId(id);
  if (!medecin) notFound();

  return (
    <div className="flex min-h-screen flex-col bg-bg">
      <TopNav lienActif="trouver" />

      {/* ===== VERSION MOBILE ===== */}
      <div className="flex flex-1 flex-col md:hidden">
        <EnTeteMobile
          retour={`/medecin/${medecin.id}`}
          titre="Choisir un créneau"
          sousTitre={`${nomComplet(medecin)} · ${medecin.specialite}`}
          bandeauRdv
        />
        <CreneauxMobile medecinId={medecin.id} joursFermes={medecin.joursFermes} />
      </div>

      {/* ===== VERSION WEB (repli : même panneau que la fiche) ===== */}
      <div className="mx-auto hidden w-full max-w-[420px] px-[30px] py-[26px] md:block">
        <PanneauReservation
          medecinId={medecin.id}
          tarif={medecin.tarifConsultation}
          joursFermes={medecin.joursFermes}
        />
      </div>
    </div>
  );
}
