import type { Metadata } from "next";
import { redirect } from "next/navigation";
import TopNav from "@/components/site/TopNav";
import FormulaireReservation from "@/components/site/FormulaireReservation";
import { capitaliser, formatDateLongue } from "@/lib/dates";
import { formatGNF } from "@/lib/format";
import { getEtablissement, getMedecin, nomComplet, patientDemo } from "@/lib/mock-data";

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

      <div className="mx-auto max-w-[680px] px-[30px] py-[34px]">
        {/* Fil d'étapes */}
        <div className="mb-[26px] flex items-center justify-center gap-[10px]">
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
        <div className="mb-[18px] rounded-[18px] border border-line bg-white p-6">
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

        {/* Pour qui ? — soi-même uniquement à ce stade (proches en Phase 5) */}
        <div className="mb-[18px] rounded-[18px] border border-line bg-white p-6">
          <h3 className="mb-[14px] text-base font-extrabold">Pour qui est ce rendez-vous ?</h3>
          <div className="grid gap-[10px] sm:grid-cols-2">
            <div className="flex items-center gap-[11px] rounded-[13px] border-[1.5px] border-teal bg-teal-soft p-3 text-left">
              <span
                aria-hidden
                className="grid h-10 w-10 flex-none place-items-center rounded-[11px] text-[13px] font-extrabold text-white"
                style={{ background: patientDemo.gradient }}
              >
                {patientDemo.initiales}
              </span>
              <span className="flex-1">
                <b className="block text-[13.5px]">Moi-même</b>
                <small className="text-[11.5px] text-muted">
                  {patientDemo.prenom} {patientDemo.nom} · {patientDemo.age} ans
                </small>
              </span>
              <span className="h-[18px] w-[18px] flex-none rounded-full border-2 border-teal bg-teal shadow-[inset_0_0_0_3px_#fff]" />
            </div>
            <div className="flex cursor-not-allowed items-center justify-center gap-1 rounded-[13px] border-[1.5px] border-dashed border-line bg-white p-3 text-[13.5px] font-bold text-muted">
              <span className="mr-1.5 text-lg" aria-hidden>
                +
              </span>
              Ajouter un proche · Phase 5
            </div>
          </div>
        </div>

        <FormulaireReservation
          medecinId={medecin.id}
          medecinNom={nomComplet(medecin)}
          specialite={medecin.specialite}
          etablissementNom={etab?.nom ?? ""}
          ville={etab?.ville ?? medecin.ville}
          date={date}
          heure={heure}
          tarif={medecin.tarifConsultation}
          pourQui={`${patientDemo.prenom} ${patientDemo.nom} (moi-même)`}
        />
      </div>
    </div>
  );
}
