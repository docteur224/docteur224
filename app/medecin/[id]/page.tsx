import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import TopNav from "@/components/site/TopNav";
import PanneauReservation from "@/components/site/PanneauReservation";
import CarteLocalisation from "@/components/site/CarteLocalisation";
import OngletsFiche from "@/components/site/OngletsFiche";
import AvatarMedecin from "@/components/site/AvatarMedecin";
import AppBarMobile from "@/components/mobile/AppBarMobile";
import { formatNote } from "@/lib/format";
import { chargerEtablissementParId, chargerMedecinParId, nomComplet } from "@/lib/donnees";

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

function LigneInfo({
  icone,
  titre,
  detail,
}: {
  icone: string;
  titre: string;
  detail: string;
}) {
  return (
    <div className="flex items-start gap-[11px] text-[13px]">
      <span className="w-[18px] flex-none text-teal" aria-hidden>
        {icone}
      </span>
      <div>
        <b className="block font-bold">{titre}</b>
        <small className="text-xs text-muted">{detail}</small>
      </div>
    </div>
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const medecin = await chargerMedecinParId(id);
  if (!medecin) return { title: "Médecin introuvable | Docteur 224" };
  return { title: `${nomComplet(medecin)} — ${medecin.specialite} à ${medecin.ville} | Docteur 224` };
}

export default async function FicheMedecin({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const medecin = await chargerMedecinParId(id);
  if (!medecin) notFound();
  const etab = await chargerEtablissementParId(medecin.etablissementId);

  // Blocs partagés par les onglets Présentation et Établissement : le patient
  // qui ne clique jamais sur un onglet doit trouver l'adresse, les photos et
  // la carte sans quitter la Présentation. Définis une fois pour que les deux
  // volets ne divergent pas.
  const galeriePhotos = (
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
  );

  const infosPratiques = (
    <div className="mt-1.5 grid gap-[14px] sm:grid-cols-2">
      <LigneInfo
        icone="🏥"
        titre={etab?.nom ?? "Établissement"}
        detail={etab ? `Quartier ${etab.quartier} · ${etab.ville}` : medecin.ville}
      />
      <LigneInfo icone="🕐" titre={medecin.horaires.jours} detail={medecin.horaires.detail} />
      <LigneInfo icone="📞" titre={medecin.telephoneSecretariat} detail="Secrétariat" />
      <LigneInfo icone="💳" titre="Paiement" detail="Sur place, chez le médecin" />
    </div>
  );

  const carteLocalisation = (
    <CarteLocalisation
      etablissementNom={etab?.nom ?? ""}
      quartier={etab?.quartier ?? ""}
      ville={etab?.ville ?? medecin.ville}
      telephone={medecin.telephoneSecretariat}
    />
  );

  return (
    <div className="min-h-screen bg-bg">
      <TopNav lienActif="trouver" droite="compte" />

      {/* ================= VERSION MOBILE (écran « fiche » de la maquette mobile) ================= */}
      <div className="flex flex-col md:hidden">
        <div style={{ paddingBottom: 6 }}>
          <AppBarMobile retour="/resultats" titre="Profil du médecin" />
        </div>
        <div className="profhead">
          {medecin.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={medecin.photoUrl} alt="" className="av" style={{ objectFit: "cover" }} />
          ) : (
            <span className="av" aria-hidden style={{ background: medecin.gradient }}>
              {medecin.initiales}
            </span>
          )}
          <h3>{nomComplet(medecin)}</h3>
          <div className="spec">{medecin.specialite}</div>
          <div className="statrow">
            <div className="s">
              <b>★ {formatNote(medecin.note)}</b>
              <small>{medecin.nbAvis} avis</small>
            </div>
            <div className="s">
              <b>{medecin.anneesExperience} ans</b>
              <small>d&apos;expérience</small>
            </div>
            <div className="s">
              <b>{Math.round(medecin.tarifConsultation / 1000)}k</b>
              <small>GNF / consult.</small>
            </div>
          </div>
        </div>
        <div className="pad" style={{ paddingTop: 6 }}>
          <div className="infoline">
            <span className="ic" aria-hidden>
              🏥
            </span>
            <div>
              <b>{etab?.nom}</b>
              <small>
                Quartier {etab?.quartier} · {etab?.ville}
              </small>
            </div>
          </div>
          <div className="infoline">
            <span className="ic" aria-hidden>
              🕐
            </span>
            <div>
              <b>{medecin.horaires.jours}</b>
              <small>{medecin.horaires.detail}</small>
            </div>
          </div>
          <div className="infoline">
            <span className="ic" aria-hidden>
              📞
            </span>
            <div>
              <b>{medecin.telephoneSecretariat}</b>
              <small>Secrétariat</small>
            </div>
          </div>

          <div className="section-t">À propos</div>
          <p className="muted" style={{ fontSize: 13, lineHeight: 1.6 }}>
            {medecin.aPropos}
          </p>

          <div className="section-t">Soins et actes</div>
          <div className="chips">
            {medecin.soinsEtActes.map((soin) => (
              <span key={soin} className="chip grey">
                {soin}
              </span>
            ))}
          </div>

          <div className="section-t">Diplôme et formation</div>
          {medecin.diplomes.map((d) => (
            <div key={d.titre} className="infoline">
              <span className="ic" aria-hidden>
                🎓
              </span>
              <div>
                <b>{d.titre}</b>
                <small>{d.lieu}</small>
              </div>
            </div>
          ))}

          <div className="section-t">Parcours professionnel</div>
          {medecin.parcours.map((p) => (
            <div key={p.lieu} className="infoline">
              <span className="ic" aria-hidden>
                🏥
              </span>
              <div>
                <b>{p.lieu}</b>
                <small>{p.duree}</small>
              </div>
            </div>
          ))}

          <div className="section-t">Langues parlées</div>
          <div className="chips">
            {medecin.langues.map((langue) => (
              <span key={langue} className="chip grey">
                {langue}
              </span>
            ))}
          </div>

          <div className="section-t">Assurances acceptées</div>
          <div className="chips">
            {medecin.assurances.map((assurance) => (
              <span key={assurance} className="chip">
                {assurance}
              </span>
            ))}
          </div>

          <div className="section-t">Photos de l&apos;établissement</div>
          <div className="gallery">
            {PHOTOS.map((photo) => (
              <div key={photo.label} className="gphoto">
                <div className="inner" style={{ background: photo.fond }}>
                  <div style={{ fontSize: 23 }} aria-hidden>
                    {photo.emoji}
                  </div>
                  <small style={{ fontSize: 10.5, color: "var(--blue)", fontWeight: 800 }}>
                    {photo.label}
                  </small>
                </div>
              </div>
            ))}
          </div>

          <div className="section-t">Lieu de consultation</div>
          <CarteLocalisation
            etablissementNom={etab?.nom ?? ""}
            quartier={etab?.quartier ?? ""}
            ville={etab?.ville ?? medecin.ville}
            telephone={medecin.telephoneSecretariat}
          />
        </div>
        <div className="ctafoot">
          <Link href={`/medecin/${medecin.id}/creneaux`} className="btn">
            📅 Voir les disponibilités
          </Link>
          {/* Le tarif est affiché plus haut ; on rappelle ici que la
              réservation elle-même ne coûte rien. */}
          <small
            style={{
              display: "block",
              marginTop: 8,
              textAlign: "center",
              fontSize: 11.5,
              color: "var(--muted)",
            }}
          >
            Réservation gratuite · consultation à régler sur place
          </small>
        </div>
      </div>

      {/* ================= VERSION WEB (inchangée) ================= */}
      <div className="hidden md:block">
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
            <AvatarMedecin
              photoUrl={medecin.photoUrl}
              initiales={medecin.initiales}
              gradient={medecin.gradient}
              taille={92}
              arrondi={22}
            />
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

          {/* Onglets — le contenu est réparti en trois volets ; la sélection
              est gérée par OngletsFiche (client), le rendu reste serveur. */}
          <OngletsFiche
            onglets={[
              {
                cle: "presentation",
                label: "Présentation",
                contenu: (
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

            <TitreSection>Langues parlées</TitreSection>
            <div className="flex flex-wrap gap-2">
              {medecin.langues.map((langue) => (
                <span
                  key={langue}
                  className="rounded-full border border-[#DCE4EA] bg-[#EEF2F5] px-[14px] py-2 text-xs font-bold text-[#3A4A55]"
                >
                  {langue}
                </span>
              ))}
            </div>

            {/* Reprise volontaire du contenu de l'onglet Établissement :
                beaucoup de patients ne cliquent jamais sur un onglet, il leur
                faut l'adresse, les photos et la carte sans quitter la
                Présentation. */}
            <TitreSection>Lieu de consultation</TitreSection>
            {infosPratiques}

            <TitreSection>Photos de l’établissement</TitreSection>
            {galeriePhotos}

            <TitreSection>Localisation</TitreSection>
            {carteLocalisation}
          </div>
                ),
              },
              {
                cle: "etablissement",
                label: "Établissement",
                contenu: (
          <div className="px-[26px] py-6">
            <TitreSection>Photos de l’établissement</TitreSection>
            {galeriePhotos}

            {/* Les langues parlées sont une information sur le médecin :
                elles vivent dans l'onglet Présentation, pas ici. */}
            <TitreSection>Informations pratiques</TitreSection>
            {infosPratiques}

            <TitreSection>Localisation</TitreSection>
            {carteLocalisation}
          </div>
                ),
              },
              {
                cle: "avis",
                label: `Avis (${medecin.nbAvis})`,
                contenu: (
          <div className="px-[26px] py-6">
            {medecin.nbAvis === 0 ? (
              <div className="py-8 text-center">
                <div className="text-3xl" aria-hidden>
                  ⭐
                </div>
                <b className="mt-3 block text-[15px] font-extrabold">Aucun avis pour le moment</b>
                <p className="mx-auto mt-2 max-w-[380px] text-[13px] leading-relaxed text-muted">
                  Les avis sont publiés par les patients après une consultation
                  honorée. Soyez le premier à partager votre expérience avec{" "}
                  {nomComplet(medecin)}.
                </p>
              </div>
            ) : (
              <div className="py-8 text-center">
                <b className="block text-[22px] font-extrabold text-blue">
                  ★ {formatNote(medecin.note)}
                </b>
                <p className="mt-2 text-[13px] text-muted">
                  Moyenne sur {medecin.nbAvis} avis. Le détail des avis arrive
                  prochainement.
                </p>
              </div>
            )}
          </div>
                ),
              },
            ]}
          />
        </div>

        {/* ===== Panneau de réservation ===== */}
        <PanneauReservation
          medecinId={medecin.id}
          tarif={medecin.tarifConsultation}
          joursFermes={medecin.joursFermes}
        />
      </div>
      </div>
    </div>
  );
}
