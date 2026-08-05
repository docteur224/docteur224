import type { Metadata } from "next";
import { redirect } from "next/navigation";
import TopNav from "@/components/site/TopNav";
import EnTeteMobile from "@/components/mobile/EnTeteMobile";
import FormulaireReservation from "@/components/site/FormulaireReservation";
import { capitaliser, creneauReservable, formatDateLongue } from "@/lib/dates";
import { chargerEtablissementParId, chargerMedecinParId, nomComplet } from "@/lib/donnees";

export const metadata: Metadata = {
  title: "Confirmer le rendez-vous | Docteur 224",
};

/*
 * Écran de réservation — fil d'étapes puis récapitulatif du créneau. Le
 * récapitulatif ne porte aucun tarif : le prix dépend du soin choisi et du
 * lieu, et n'est annoncé qu'une fois ces deux choix faits, dans le
 * formulaire. Celui-ci enchaîne lieu, motif, bénéficiaire, précisions et
 * bandeau « réservation gratuite / paiement sur place ».
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

  const medecin = await chargerMedecinParId(medecinId);
  if (!medecin || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(heure)) {
    redirect("/");
  }
  // Masquer le créneau dans la grille ne suffit pas : l'URL peut être forgée
  // ou simplement rouverte plus tard. On revalide le délai de prévenance ici
  // et on renvoie vers la fiche, dont la grille ne montrera plus ce créneau.
  if (!creneauReservable(date, heure)) {
    redirect(`/medecin/${medecinId}`);
  }
  const etab = await chargerEtablissementParId(medecin.etablissementId);
  // Comme sur la fiche : l'adresse part de ce que le médecin a saisi, pas
  // de l'établissement — un praticien indépendant n'en a pas.
  const adresseCabinet =
    [
      medecin.quartier && `Quartier ${medecin.quartier}`,
      medecin.commune,
      medecin.ville || etab?.ville,
    ]
      .filter(Boolean)
      .join(" · ") || medecin.ville;

  return (
    <div className="min-h-screen bg-bg">
      <TopNav minimale />

      <div className="mx-auto w-full max-w-[680px] md:px-[30px] md:py-[34px]">
        {/* ===== Mobile : appbar + récapitulatif (écran « reservation » de la maquette mobile) ===== */}
        <div className="md:hidden">
          <EnTeteMobile retour={`/medecin/${medecin.id}/creneaux`} titre="Confirmer le rendez-vous" />
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
              {!medecin.visiteDomicile && (
                <div className="r">
                  <span className="k">Lieu</span>
                  <span className="v">{etab?.nom ?? "Cabinet du praticien"}</span>
                </div>
              )}
              <div className="r">
                <span className="k">Date</span>
                <span className="v">{capitaliser(formatDateLongue(date))}</span>
              </div>
              <div className="r">
                <span className="k">Heure</span>
                <span className="v">{heure}</span>
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
          {/* Le lieu n'est rappelé ici que s'il n'y a rien à choisir : quand le
              praticien se déplace, c'est le bloc « Où souhaitez-vous
              consulter ? » qui fait foi, et deux lieux affichés se
              contrediraient. */}
          {!medecin.visiteDomicile && (
            <div className="flex justify-between border-b border-line py-[11px] text-[13.5px]">
              <span className="text-muted">Lieu</span>
              <span className="font-bold">
                {etab?.nom ?? "Cabinet du praticien"} · {adresseCabinet}
              </span>
            </div>
          )}
          <div className="flex justify-between border-b border-line py-[11px] text-[13.5px]">
            <span className="text-muted">Date</span>
            <span className="font-bold">{capitaliser(formatDateLongue(date))}</span>
          </div>
          <div className="flex justify-between py-[11px] text-[13.5px]">
            <span className="text-muted">Heure</span>
            <span className="font-bold">{heure}</span>
          </div>
        </div>

        {/* Lieu, « Pour qui ? » (moi-même ou un proche), motif et confirmation */}
        <FormulaireReservation
          medecinId={medecin.id}
          date={date}
          heure={heure}
          tarif={medecin.tarifConsultation}
          adresseCabinet={adresseCabinet}
          visiteDomicile={medecin.visiteDomicile}
          zoneDomicile={medecin.zoneDomicile}
          tarifs={medecin.tarifs}
        />
      </div>
    </div>
  );
}
