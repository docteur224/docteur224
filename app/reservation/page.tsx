import type { Metadata } from "next";
import { redirect } from "next/navigation";
import TopNav from "@/components/site/TopNav";
import AppBarMobile from "@/components/mobile/AppBarMobile";
import FormulaireReservation from "@/components/site/FormulaireReservation";
import { capitaliser, formatDateLongue } from "@/lib/dates";
import { formatGNF } from "@/lib/format";
import { getEtablissement, getMedecin, nomComplet } from "@/lib/mock-data";

export const metadata: Metadata = {
  title: "Confirmer le rendez-vous | Docteur 224",
};

/*
 * Écran de réservation — reproduit l'écran « reservation » de la maquette web :
 * fil d'étapes, récapitulatif, « Pour qui est ce rendez-vous ? » (soi-même
 * uniquement à ce stade — les proches arrivent en Phase 5), motif et bandeau
 * « réservation gratuite / paiement sur place ».
 */
export default async function Reservation({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const medecinId = typeof sp.medecin === "string" ? sp.medecin : "";
  const date = typeof sp.date === "string" ? sp.date : "";
  const heure = typeof sp.heure === "string" ? sp.heure : "";

  const medecin = getMedecin(medecinId);
  if (!medecin || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(heure)) {
    redirect("/");
  }
  const etab = getEtablissement(medecin.etablissementId);

  return (
    <div className="min-h-screen bg-bg">
      <TopNav minimale />

      <div className="mx-auto w-full max-w-[680px] md:px-[30px] md:py-[34px]">
        {/* ===== Mobile : appbar + récapitulatif (écran « reservation » de la maquette mobile) ===== */}
        <div className="md:hidden">
          <AppBarMobile retour={`/medecin/${medecin.id}/creneaux`} titre="Confirmer le rendez-vous" />
          <div className="pad" style={{ paddingTop: 8, paddingBottom: 0 }}>
            <div className="recap">
              <div className="r">
                <span className="k">Médecin</span>
                <span className="v">{nomComplet(medecin)}</span>
              </div>
              <div className="r">
                <span className="k">Spécialité</span>
                <span className="v">{medecin.specialite}</span>
              </div>
              <div className="r">
                <span className="k">Établissement</span>
                <span className="v">{etab?.nom}</span>
              </div>
              <div className="r">
                <span className="k">Date</span>
                <span className="v">{capitaliser(formatDateLongue(date))}</span>
              </div>
              <div className="r">
                <span className="k">Heure</span>
                <span className="v">{heure}</span>
              </div>
              <div className="r">
                <span className="k">Tarif</span>
                <span className="v">{formatGNF(medecin.tarifConsultation)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Fil d'étapes */}
        <div className="mb-[26px] hidden items-center justify-center gap-[10px] md:flex">
          <div className="flex items-center gap-2 text-[12.5px] font-bold text-muted">
            <span className="grid h-6 w-6 place-items-center rounded-full bg-green text-xs text-white">
              ✓
            </span>
            Créneau
          </div>
          <span className="h-0.5 w-[34px] bg-line" />
          <div className="flex items-center gap-2 text-[12.5px] font-bold text-blue">
            <span className="grid h-6 w-6 place-items-center rounded-full bg-teal text-xs text-white">
              2
            </span>
            Confirmation
          </div>
          <span className="h-0.5 w-[34px] bg-line" />
          <div className="flex items-center gap-2 text-[12.5px] font-bold text-muted">
            <span className="grid h-6 w-6 place-items-center rounded-full border-[1.5px] border-line bg-white text-xs">
              3
            </span>
            Terminé
          </div>
        </div>

        {/* Récapitulatif */}
        <div className="mb-[18px] hidden rounded-[18px] border border-line bg-white p-6 md:block">
          <h3 className="mb-[14px] text-base font-extrabold">Récapitulatif du rendez-vous</h3>
          <div className="flex justify-between border-b border-line py-[11px] text-[13.5px]">
            <span className="text-muted">Médecin</span>
            <span className="font-bold">
              {nomComplet(medecin)} · {medecin.specialite}
            </span>
          </div>
          <div className="flex justify-between border-b border-line py-[11px] text-[13.5px]">
            <span className="text-muted">Établissement</span>
            <span className="font-bold">
              {etab?.nom} · {etab?.ville}
            </span>
          </div>
          <div className="flex justify-between border-b border-line py-[11px] text-[13.5px]">
            <span className="text-muted">Date</span>
            <span className="font-bold">{capitaliser(formatDateLongue(date))}</span>
          </div>
          <div className="flex justify-between border-b border-line py-[11px] text-[13.5px]">
            <span className="text-muted">Heure</span>
            <span className="font-bold">{heure}</span>
          </div>
          <div className="flex justify-between py-[11px] text-[13.5px]">
            <span className="text-muted">Tarif</span>
            <span className="font-bold">{formatGNF(medecin.tarifConsultation)}</span>
          </div>
        </div>

        {/* « Pour qui ? » (moi-même ou un proche), motif et confirmation */}
        <FormulaireReservation
          medecinId={medecin.id}
          medecinNom={nomComplet(medecin)}
          specialite={medecin.specialite}
          etablissementNom={etab?.nom ?? ""}
          ville={etab?.ville ?? medecin.ville}
          date={date}
          heure={heure}
          tarif={medecin.tarifConsultation}
        />
      </div>
    </div>
  );
}
