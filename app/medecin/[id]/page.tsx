import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import TopNav from "@/components/site/TopNav";
import PanneauReservation from "@/components/site/PanneauReservation";
import CarteLocalisation from "@/components/site/CarteLocalisation";
import OngletsFiche from "@/components/site/OngletsFiche";
import AvatarMedecin from "@/components/site/AvatarMedecin";
import BadgeNote from "@/components/site/BadgeNote";
import BoutonFavori from "@/components/site/BoutonFavori";
import PanneauAvis from "@/components/site/PanneauAvis";
import EnTeteMobile from "@/components/mobile/EnTeteMobile";
import { formatGNF, formatNote } from "@/lib/format";
import {
  chargerAvisMedecin,
  chargerEtablissementParId,
  chargerMedecinParId,
  chargerPhotosPro,
  nomComplet,
} from "@/lib/donnees";

/*
 * Fiche médecin — reproduit l'écran « fiche » de la maquette web :
 * en-tête d'identité avec badges, onglets, corps enrichi (à propos, soins,
 * diplômes, parcours, assurances, photos, infos pratiques, localisation)
 * et panneau de réservation collant à droite.
 *
 * « Tarifs » et « Soins et actes » étaient deux sections distinctes,
 * nourries par deux sources qui ne se parlaient pas : le patient pouvait
 * lire quatre soins et n'en réserver que deux. Depuis la 0027 il n'y en a
 * plus qu'une, la grille tarifaire, dont les libellés SONT les actes
 * proposés — un acte sans prix ferme s'y affiche « selon le cas ».
 */

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
  const [etab, avis, photos] = await Promise.all([
    chargerEtablissementParId(medecin.etablissementId),
    chargerAvisMedecin(medecin.id),
    chargerPhotosPro(medecin.id, "medecin"),
  ]);

  // Blocs partagés par les onglets Présentation et Établissement : le patient
  // qui ne clique jamais sur un onglet doit trouver l'adresse, les photos et
  // la carte sans quitter la Présentation. Définis une fois pour que les deux
  // volets ne divergent pas.
  //
  // La galerie disparaît quand le médecin n'a rien déposé : les trois
  // vignettes décoratives affichées jusqu'ici étaient identiques pour tout le
  // monde et n'apprenaient rien au patient.
  const galeriePhotos =
    photos.length > 0 ? (
      <div className="grid grid-cols-[repeat(auto-fill,minmax(130px,1fr))] gap-3">
        {photos.map((photo) => (
          <figure
            key={photo.id}
            className="relative aspect-[4/3] overflow-hidden rounded-xl border border-line"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photo.url}
              alt={photo.legende || "Photo du cabinet"}
              className="h-full w-full object-cover"
            />
            {photo.legende && (
              <figcaption className="absolute inset-x-0 bottom-0 truncate bg-black/45 px-2 py-1 text-[11px] font-semibold text-white">
                {photo.legende}
              </figcaption>
            )}
          </figure>
        ))}
      </div>
    ) : null;

  /*
   * Adresse : elle était construite à partir de l'ÉTABLISSEMENT seul, si
   * bien qu'un praticien indépendant — cas de tous ceux qui s'inscrivent
   * par le parcours en ligne — affichait « Quartier · ». On part donc de
   * ce que le médecin a lui-même saisi (quartier, commune, ville) et
   * l'établissement ne sert plus qu'à nommer le lieu.
   */
  const lieuNom = etab?.nom ?? "Cabinet du praticien";
  const adresse =
    [
      medecin.quartier && `Quartier ${medecin.quartier}`,
      medecin.commune,
      etab?.quartier && !medecin.quartier ? `Quartier ${etab.quartier}` : "",
      medecin.ville || etab?.ville,
    ]
      .filter(Boolean)
      .join(" · ") || medecin.ville;

  // Horaires jour par jour : le résumé « Lundi — Vendredi » ne dit rien
  // d'un médecin ouvert le samedi matin seulement.
  const horairesDetail = (
    <div className="mt-1.5 overflow-hidden rounded-xl border border-line">
      {medecin.horairesSemaine.map((jour, i) => (
        <div
          key={jour.jour}
          className={`flex items-center justify-between gap-3 px-[13px] py-2 text-[12.5px] ${
            i > 0 ? "border-t border-line" : ""
          }`}
        >
          <b className="font-bold">{jour.nom}</b>
          <span className={jour.plages.length === 0 ? "text-muted" : "font-semibold text-blue"}>
            {jour.plages.length === 0
              ? "Fermé"
              : jour.plages.map((p) => `${p.debut} – ${p.fin}`).join(" · ")}
          </span>
        </div>
      ))}
    </div>
  );

  /*
   * Un tarif « à domicile » n'a de sens que si le praticien se déplace : il
   * peut rester une ligne d'un réglage abandonné. Le lieu n'est annoté que
   * lorsqu'il y a effectivement deux lieux possibles.
   */
  const tarifsVisibles = medecin.tarifs.filter(
    (t) => medecin.visiteDomicile || t.lieu !== "domicile"
  );
  /*
   * Les tarifs sont regroupés par lieu, sous un intertitre. Une simple
   * annotation sous chaque libellé ne suffisait pas : un praticien qui
   * facture « Consultation » au cabinet et à domicile affichait deux lignes
   * de même nom, à des prix différents, sans séparation visible.
   */
  const groupesTarifs: {
    cle: string;
    icone: string;
    titre: string;
    note?: string;
    lignes: typeof tarifsVisibles;
  }[] = [
    {
      cle: "cabinet",
      icone: "🏥",
      titre: "Au cabinet",
      lignes: tarifsVisibles.filter((t) => t.lieu === "cabinet"),
    },
    {
      cle: "domicile",
      icone: "🏠",
      titre: "À domicile",
      note: "Ces tarifs comprennent la consultation et le déplacement du médecin.",
      lignes: tarifsVisibles.filter((t) => t.lieu === "domicile"),
    },
    {
      cle: "tous",
      icone: "📋",
      titre: "Au cabinet ou à domicile",
      note: "Même tarif quel que soit le lieu choisi.",
      lignes: tarifsVisibles.filter((t) => t.lieu === "tous"),
    },
  ].filter((g) => g.lignes.length > 0);

  const lignesTarifs = (lignes: typeof tarifsVisibles, premiereBordure: boolean) =>
    lignes.map((tarif, i) => (
      <div
        key={`${tarif.libelle}-${i}`}
        className={`flex items-center justify-between gap-3 px-[13px] py-[10px] text-[13px] ${
          i > 0 || premiereBordure ? "border-t border-line" : ""
        }`}
      >
        <b className="min-w-0 font-bold">{tarif.libelle}</b>
        {/* Un acte peut être proposé sans prix ferme (vaccination,
            dépistage) : on l'annonce « selon le cas » plutôt que de le
            taire — le patient peut le réserver, il doit donc le voir. La
            formule dit POURQUOI il n'y a pas de chiffre, au lieu de
            renvoyer le patient vers une démarche. */}
        {tarif.montant === null ? (
          <span className="flex-none text-[12px] font-bold italic text-muted">Selon le cas</span>
        ) : (
          <span className="flex-none font-extrabold text-blue">{formatGNF(tarif.montant)}</span>
        )}
      </div>
    ));

  const grilleTarifs =
    tarifsVisibles.length > 0 ? (
      <div className="mt-1.5 overflow-hidden rounded-xl border border-line">
        {/* Un seul lieu possible : les intertitres n'apprendraient rien. */}
        {groupesTarifs.length < 2
          ? lignesTarifs(tarifsVisibles, false)
          : groupesTarifs.map((groupe, g) => (
              <div key={groupe.cle}>
                <div
                  className={`flex items-center gap-2 bg-[#F6FAFC] px-[13px] py-[7px] ${
                    g > 0 ? "border-t border-line" : ""
                  }`}
                >
                  <span aria-hidden className="text-[13px]">
                    {groupe.icone}
                  </span>
                  <b className="text-[11.5px] font-extrabold uppercase tracking-[0.06em] text-blue">
                    {groupe.titre}
                  </b>
                </div>
                {lignesTarifs(groupe.lignes, true)}
                {groupe.note && (
                  <p className="border-t border-line px-[13px] py-[7px] text-[11px] italic text-muted">
                    {groupe.note}
                  </p>
                )}
              </div>
            ))}
        <p className="border-t border-line bg-[#F6FAFC] px-[13px] py-2 text-[11.5px] text-muted">
          Payés sur place, chez le médecin. La réservation en ligne est gratuite.
        </p>
      </div>
    ) : null;

  const blocDomicile = medecin.visiteDomicile && (
    <div className="mt-1.5 flex items-start gap-[11px] rounded-xl border border-[#BFE3CC] bg-green-soft px-[14px] py-3 text-[12.5px] leading-relaxed text-blue">
      <span aria-hidden className="text-base">
        🏠
      </span>
      <div>
        <b className="block font-extrabold">Ce praticien se déplace à domicile.</b>
        {medecin.zoneDomicile
          ? `Zones desservies : ${medecin.zoneDomicile}.`
          : "Vous pourrez indiquer votre adresse au moment de réserver."}{" "}
        Le choix du lieu se fait à la réservation.
      </div>
    </div>
  );

  const infosPratiques = (
    <div className="mt-1.5 grid gap-[14px] sm:grid-cols-2">
      <LigneInfo icone="🏥" titre={lieuNom} detail={adresse} />
      <LigneInfo icone="🕐" titre={medecin.horaires.jours} detail={medecin.horaires.detail} />
      <LigneInfo
        icone="📞"
        titre={medecin.telephoneSecretariat || "Non renseigné"}
        detail="Secrétariat"
      />
      <LigneInfo icone="💳" titre="Paiement" detail="Sur place, chez le médecin" />
      {medecin.numeroOrdre && (
        <LigneInfo icone="🪪" titre={medecin.numeroOrdre} detail="Numéro d’ordre médical" />
      )}
      {medecin.rccm && <LigneInfo icone="📑" titre={medecin.rccm} detail="RCCM" />}
      {medecin.visiteDomicile && (
        <LigneInfo
          icone="🏠"
          titre="Visites à domicile"
          detail={medecin.zoneDomicile || "Sur demande, à la réservation"}
        />
      )}
    </div>
  );

  const carteLocalisation = (
    <CarteLocalisation
      etablissementNom={lieuNom}
      quartier={medecin.quartier || etab?.quartier || medecin.commune}
      ville={medecin.ville || etab?.ville || ""}
      telephone={medecin.telephoneSecretariat}
      localisation={medecin.localisation}
    />
  );

  return (
    <div className="min-h-screen bg-bg">
      <TopNav lienActif="trouver" />

      {/* ================= VERSION MOBILE (écran « fiche » de la maquette mobile) ================= */}
      <div className="flex flex-col md:hidden">
        <EnTeteMobile retour="/resultats" titre="Profil du médecin" recherche bandeauRdv />
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
          <div style={{ marginBottom: 10 }}>
            <BoutonFavori mobile medecinId={medecin.id} nom={nomComplet(medecin)} />
          </div>
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
              <b>{lieuNom}</b>
              <small>{adresse}</small>
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
              <b>{medecin.telephoneSecretariat || "Non renseigné"}</b>
              <small>Secrétariat</small>
            </div>
          </div>
          {medecin.numeroOrdre && (
            <div className="infoline">
              <span className="ic" aria-hidden>
                🪪
              </span>
              <div>
                <b>{medecin.numeroOrdre}</b>
                <small>Numéro d’ordre médical</small>
              </div>
            </div>
          )}

          <div className="section-t">À propos</div>
          <p className="muted" style={{ fontSize: 13, lineHeight: 1.6 }}>
            {medecin.aPropos}
          </p>

          {grilleTarifs && (
            <>
              <div className="section-t">Soins, actes et tarifs</div>
              {grilleTarifs}
            </>
          )}
          {blocDomicile}

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

          {medecin.assurances.length > 0 && (
            <>
              <div className="section-t">Assurances acceptées</div>
              <div className="chips">
                {medecin.assurances.map((assurance) => (
                  <span key={assurance} className="chip">
                    {assurance}
                  </span>
                ))}
              </div>
            </>
          )}

          {photos.length > 0 && (
            <>
              <div className="section-t">Photos du cabinet</div>
              <div className="gallery">
                {photos.map((photo) => (
                  <div key={photo.id} className="gphoto">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={photo.url}
                      alt={photo.legende || "Photo du cabinet"}
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    />
                  </div>
                ))}
              </div>
            </>
          )}

          <div className="section-t">Lieu de consultation</div>
          {horairesDetail}
          <div style={{ height: 12 }} />
          {carteLocalisation}

          {/* Les avis sont une section à part entière sur mobile : la maquette
              n'a pas d'onglets ici, tout est empilé. */}
          <div className="section-t">Avis des patients ({avis.length})</div>
          {/* PanneauAvis porte son propre px-[26px] pour la fiche web ; sur
              mobile le conteneur .pad l'assure déjà, on le neutralise. */}
          <div className="[&>div]:px-0 [&>div]:py-0">
            <PanneauAvis avis={avis} nomMedecin={nomComplet(medecin)} />
          </div>
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
                <BadgeNote note={medecin.note} nbAvis={medecin.nbAvis} />
                <span className="rounded-lg bg-teal-soft px-[9px] py-1 text-[11px] font-bold text-blue">
                  ✔ Profil vérifié
                </span>
                <span className="rounded-lg bg-teal-soft px-[9px] py-1 text-[11px] font-bold text-blue">
                  {medecin.anneesExperience} ans d’expérience
                </span>
                {medecin.visiteDomicile && (
                  <span className="rounded-lg bg-green-soft px-[9px] py-1 text-[11px] font-bold text-green">
                    🏠 Visites à domicile
                  </span>
                )}
              </div>
              <div className="mt-[10px]">
                <BoutonFavori medecinId={medecin.id} nom={nomComplet(medecin)} />
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

            {grilleTarifs && (
              <>
                <TitreSection>Soins, actes et tarifs</TitreSection>
                {grilleTarifs}
              </>
            )}
            {blocDomicile}

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

            {/* Un intertitre sans rien dessous laissait croire à un bug ;
                tant que le praticien n'a rien coché, la rubrique disparaît. */}
            {medecin.assurances.length > 0 && (
              <>
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
              </>
            )}

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

            <h4 className="mb-1.5 mt-4 text-[13px] font-extrabold">Horaires de consultation</h4>
            {horairesDetail}

            {galeriePhotos && (
              <>
                <TitreSection>Photos du cabinet</TitreSection>
                {galeriePhotos}
              </>
            )}

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
            {galeriePhotos && (
              <>
                <TitreSection>Photos du cabinet</TitreSection>
                {galeriePhotos}
              </>
            )}

            {/* Les langues parlées sont une information sur le médecin :
                elles vivent dans l'onglet Présentation, pas ici. */}
            <TitreSection>Informations pratiques</TitreSection>
            {infosPratiques}

            <h4 className="mb-1.5 mt-4 text-[13px] font-extrabold">Horaires de consultation</h4>
            {horairesDetail}

            <TitreSection>Localisation</TitreSection>
            {carteLocalisation}
          </div>
                ),
              },
              {
                cle: "avis",
                label: `Avis (${avis.length})`,
                contenu: <PanneauAvis avis={avis} nomMedecin={nomComplet(medecin)} />,
              },
            ]}
          />
        </div>

        {/* ===== Panneau de réservation ===== */}
        <PanneauReservation medecinId={medecin.id} joursFermes={medecin.joursFermes} />
      </div>
      </div>
    </div>
  );
}
