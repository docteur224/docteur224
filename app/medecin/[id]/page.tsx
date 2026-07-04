import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import TopNav from "@/components/site/TopNav";
import PanneauReservation from "@/components/site/PanneauReservation";
import CarteLocalisation from "@/components/site/CarteLocalisation";
import { formatNote } from "@/lib/format";
import { getEtablissement, getMedecin, nomComplet } from "@/lib/mock-data";

/*
 * Fiche médecin — reproduit l'écran « fiche » de la maquette web :
 * en-tête d'identité avec badges, onglets, corps enrichi (à propos, soins,
 * diplômes, parcours, assurances, photos, infos pratiques, localisation)
 * et panneau de réservation collant à droite.
 */

/** Photos factices de l'établissement (identiques à la maquette). */
const PHOTOS = [
  { emoji: "🛋️", label: "Salle d’attente", fond: "linear-gradient(135deg,#DCE9F0,#C9DDE8)" },
  { emoji: "🛏️", label: "Salle de soins", fond: "linear-gradient(135deg,#E2EEE6,#CDE4D6)" },
  { emoji: "🩺", label: "Consultation", fond: "linear-gradient(135deg,#EAE6F1,#D9D2E8)" },
];

function TitreSection({ children }: { children: React.ReactNode }) {
  return <h3 className="mb-[10px] mt-[22px] text-[15px] font-extrabold first:mt-1">{children}</h3>;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const medecin = getMedecin(id);
  if (!medecin) return { title: "Médecin introuvable | Docteur 224" };
  return { title: `${nomComplet(medecin)} — ${medecin.specialite} à ${medecin.ville} | Docteur 224` };
}

export default async function FicheMedecin({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const medecin = getMedecin(id);
  if (!medecin) notFound();
  const etab = getEtablissement(medecin.etablissementId);

  return (
    <div className="min-h-screen bg-bg">
      <TopNav lienActif="trouver" droite="compte" />

      <div className="border-b border-line bg-white px-[30px] py-[22px]">
        <div className="text-xs font-semibold text-muted">
          <Link href="/">Accueil</Link> › <Link href="/resultats">Recherche</Link> ›{" "}
          {nomComplet(medecin)}
        </div>
      </div>

      <div className="mx-auto grid max-w-[1020px] items-start gap-6 px-[30px] py-[26px] lg:grid-cols-[1fr_372px]">
        {/* ===== Colonne principale ===== */}
        <div className="overflow-hidden rounded-[18px] border border-line bg-white">
          {/* En-tête d'identité */}
          <div className="flex flex-wrap items-center gap-5 border-b border-line p-[26px]">
            <span
              aria-hidden
              className="grid h-[92px] w-[92px] place-items-center rounded-[22px] text-[30px] font-extrabold text-white"
              style={{ background: medecin.gradient }}
            >
              {medecin.initiales}
            </span>
            <div>
              <h2 className="text-2xl font-extrabold tracking-[-0.4px]">{nomComplet(medecin)}</h2>
              <div className="mb-[9px] mt-[3px] text-[15px] font-bold text-teal">
                {medecin.specialite}
              </div>
              <div className="flex flex-wrap gap-2">
                <span className="rounded-lg bg-green-soft px-[9px] py-1 text-[11px] font-bold text-green">
                  ★ {formatNote(medecin.note)} ({medecin.nbAvis} avis)
                </span>
                <span className="rounded-lg bg-teal-soft px-[9px] py-1 text-[11px] font-bold text-blue">
                  ✔ Profil vérifié
                </span>
                <span className="rounded-lg bg-teal-soft px-[9px] py-1 text-[11px] font-bold text-blue">
                  {medecin.anneesExperience} ans d’expérience
                </span>
              </div>
            </div>
          </div>

          {/* Onglets */}
          <div className="flex gap-1 border-b border-line px-[26px]">
            <span className="mr-[18px] border-b-[2.5px] border-teal px-1.5 py-[15px] text-[13.5px] font-bold text-blue">
              Présentation
            </span>
            <span className="mr-[18px] border-b-[2.5px] border-transparent px-1.5 py-[15px] text-[13.5px] font-bold text-muted">
              Établissement
            </span>
            <span className="mr-[18px] border-b-[2.5px] border-transparent px-1.5 py-[15px] text-[13.5px] font-bold text-muted">
              Avis ({medecin.nbAvis})
            </span>
          </div>

          {/* Corps de la fiche */}
          <div className="px-[26px] py-6">
            <TitreSection>À propos</TitreSection>
            <p className="mb-[18px] text-[13.5px] leading-[1.65] text-[#3f5360]">
              {medecin.aPropos}
            </p>

            <TitreSection>Soins et actes</TitreSection>
            <div className="flex flex-wrap gap-2">
              {medecin.soinsEtActes.map((soin) => (
                <span
                  key={soin}
                  className="rounded-full border border-[#DCE4EA] bg-[#EEF2F5] px-[14px] py-2 text-xs font-bold text-[#3A4A55]"
                >
                  {soin}
                </span>
              ))}
            </div>

            <TitreSection>Diplôme et formation</TitreSection>
            {medecin.diplomes.map((d) => (
              <div key={d.titre} className="flex items-start gap-[11px] text-[13px]">
                <span className="w-[18px] flex-none text-teal" aria-hidden>
                  🎓
                </span>
                <div>
                  <b className="block font-bold">{d.titre}</b>
                  <small className="text-xs text-muted">{d.lieu}</small>
                </div>
              </div>
            ))}

            <TitreSection>Parcours professionnel</TitreSection>
            {medecin.parcours.map((p) => (
              <div key={p.lieu} className="flex items-start gap-[11px] text-[13px]">
                <span className="w-[18px] flex-none text-teal" aria-hidden>
                  🏥
                </span>
                <div>
                  <b className="block font-bold">{p.lieu}</b>
                  <small className="text-xs text-muted">{p.duree}</small>
                </div>
              </div>
            ))}

            <TitreSection>Assurances acceptées</TitreSection>
            <div className="flex flex-wrap gap-2">
              {medecin.assurances.map((assurance) => (
                <span
                  key={assurance}
                  className="rounded-full border border-[#CDE6F2] bg-teal-soft px-[14px] py-2 text-xs font-bold text-blue"
                >
                  {assurance}
                </span>
              ))}
            </div>

            <TitreSection>Photos de l’établissement</TitreSection>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(130px,1fr))] gap-3">
              {PHOTOS.map((photo) => (
                <div
                  key={photo.label}
                  className="grid aspect-[4/3] place-items-center overflow-hidden rounded-xl border border-line text-center"
                  style={{ background: photo.fond }}
                >
                  <div>
                    <div className="text-[26px]" aria-hidden>
                      {photo.emoji}
                    </div>
                    <small className="text-[11px] font-extrabold text-blue">{photo.label}</small>
                  </div>
                </div>
              ))}
            </div>

            <TitreSection>Informations pratiques</TitreSection>
            <div className="mt-1.5 grid gap-[14px] sm:grid-cols-2">
              <div className="flex items-start gap-[11px] text-[13px]">
                <span className="w-[18px] flex-none text-teal" aria-hidden>
                  🏥
                </span>
                <div>
                  <b className="block font-bold">{etab?.nom}</b>
                  <small className="text-xs text-muted">
                    Quartier {etab?.quartier} · {etab?.ville}
                  </small>
                </div>
              </div>
              <div className="flex items-start gap-[11px] text-[13px]">
                <span className="w-[18px] flex-none text-teal" aria-hidden>
                  🕐
                </span>
                <div>
                  <b className="block font-bold">{medecin.horaires.jours}</b>
                  <small className="text-xs text-muted">{medecin.horaires.detail}</small>
                </div>
              </div>
              <div className="flex items-start gap-[11px] text-[13px]">
                <span className="w-[18px] flex-none text-teal" aria-hidden>
                  🗣️
                </span>
                <div>
                  <b className="block font-bold">Langues</b>
                  <small className="text-xs text-muted">{medecin.langues.join(", ")}</small>
                </div>
              </div>
              <div className="flex items-start gap-[11px] text-[13px]">
                <span className="w-[18px] flex-none text-teal" aria-hidden>
                  💳
                </span>
                <div>
                  <b className="block font-bold">Paiement</b>
                  <small className="text-xs text-muted">Sur place, chez le médecin</small>
                </div>
              </div>
            </div>

            <TitreSection>Localisation</TitreSection>
            <CarteLocalisation
              etablissementNom={etab?.nom ?? ""}
              quartier={etab?.quartier ?? ""}
              ville={etab?.ville ?? medecin.ville}
              telephone={medecin.telephoneSecretariat}
            />
          </div>
        </div>

        {/* ===== Panneau de réservation ===== */}
        <PanneauReservation
          medecinId={medecin.id}
          tarif={medecin.tarifConsultation}
          joursFermes={medecin.joursFermes}
        />
      </div>
    </div>
  );
}
