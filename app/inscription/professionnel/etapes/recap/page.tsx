"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import CadreEtape from "@/components/inscription/CadreEtape";
import { useInscription } from "@/components/inscription/ContexteInscription";
import { poserEtape, terminerInscription } from "@/lib/inscription-pro";
import { useDocumentsValidation } from "@/lib/pro";
import { formatGNF } from "@/lib/format";
import { creerClientNavigateur } from "@/lib/supabase/client";

/*
 * Avant-dernière étape — récapitulatif du dossier, relu depuis la base
 * (aucun état local à resynchroniser). « Confirmer » active l'essai
 * gratuit puis clôt le parcours (etape_inscription = null).
 */

const JOURS_NOMS = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
const LIBELLES_DOC: Record<string, string> = {
  identite: "Pièce d’identité",
  diplome: "Diplôme",
  carte_ordre: "Carte de l’Ordre",
  autorisation_exercice: "Autorisation d’exercice",
};
const LIBELLE_FORMULE: Record<string, string> = {
  standard: "Standard",
  premium: "Premium",
  cabinet: "Cabinet",
  clinique: "Clinique",
  hopital: "Hôpital / Grand centre",
};

interface RecapAbonnement {
  formule: string;
  periode: string;
  statut: string;
  dateFin: string | null;
}

interface RecapMedecin {
  specialite: string;
  civilite: string;
  numeroOrdre: string;
  rccm: string;
  visiteDomicile: boolean;
  zoneDomicile: string;
  tarifs: { libelle: string; montant: number | null }[];
  experience: number | null;
  presentation: string;
  langues: string[];
  assurances: string[];
  diplomes: { titre: string; lieu: string }[];
  parcours: { lieu: string; duree: string }[];
  commune: string;
  quartier: string;
  ville: string;
  localisation: string;
  telephoneSecretariat: string;
  photoUrl: string | null;
  nbPhotos: number;
  horaires: { jour: number; debut: string; fin: string }[];
}

interface RecapEtab {
  nom: string;
  type: string;
  description: string;
  adresse: string;
  quartier: string;
  ville: string;
  telephone: string;
  email: string;
  services: string[];
}

function Section({
  titre,
  modifier,
  children,
}: {
  titre: string;
  modifier: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-4 rounded-xl border border-line">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <b className="text-[13.5px]">{titre}</b>
        <Link
          href={modifier}
          className="rounded-lg border border-line px-3 py-1 text-[11.5px] font-bold text-blue hover:border-teal"
        >
          ✏️ Modifier
        </Link>
      </div>
      <div className="px-4 py-3">{children}</div>
    </div>
  );
}

function Ligne({ label, valeur }: { label: string; valeur: React.ReactNode }) {
  return (
    <div className="flex gap-3 py-1 text-[12.5px]">
      <span className="w-[130px] flex-none font-bold text-muted">{label}</span>
      <span className="min-w-0 flex-1">{valeur || <span className="text-muted">—</span>}</span>
    </div>
  );
}

export default function EtapeRecap() {
  const router = useRouter();
  const { role, etabId, etape, recharger } = useInscription();
  const { documents } = useDocumentsValidation();
  const [compte, setCompte] = useState<{ nom: string; prenom: string; email: string; telephone: string } | null>(null);
  const [medecin, setMedecin] = useState<RecapMedecin | null>(null);
  const [etab, setEtab] = useState<RecapEtab | null>(null);
  const [abonnement, setAbonnement] = useState<RecapAbonnement | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  // La formule choisie à l'étape « Abonnement », relue en base comme le
  // reste du récap.
  useEffect(() => {
    let actif = true;
    (async () => {
      const supabase = creerClientNavigateur();
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return;
      const { data } = await supabase
        .from("abonnements")
        .select("formule, periode, statut, date_fin")
        .eq("titulaire_id", auth.user.id)
        .maybeSingle();
      if (actif && data) {
        setAbonnement({
          formule: data.formule,
          periode: data.periode,
          statut: data.statut,
          dateFin: data.date_fin,
        });
      }
    })();
    return () => {
      actif = false;
    };
  }, []);

  useEffect(() => {
    let actif = true;
    (async () => {
      const supabase = creerClientNavigateur();
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return;
      // Le parcours a pu être quitté avant d'atteindre le récap : on aligne
      // l'étape mémorisée pour que la reprise ramène bien ici, et on
      // rafraîchit le contexte du layout (les étapes rouvertes via
      // « Modifier » affichent alors « revenir au récap »).
      if (etape !== "recap") {
        await poserEtape(role, etabId, "recap");
        recharger();
      }
      const { data: u } = await supabase
        .from("utilisateurs")
        .select("nom, prenom, email, telephone")
        .eq("id", auth.user.id)
        .single();
      if (actif && u) setCompte({ nom: u.nom ?? "", prenom: u.prenom ?? "", email: u.email, telephone: u.telephone ?? "" });

      if (role === "medecin") {
        const [{ data: m }, { count: nbPhotos }] = await Promise.all([
          supabase
            .from("medecins")
            .select(
              "civilite, numero_ordre, rccm, visite_domicile, zone_domicile, annees_experience, presentation, langues, diplomes, parcours, commune, quartier, localisation, telephone_secretariat, photo_url, specialites ( nom ), villes ( nom ), horaires_types ( jour_semaine, heure_debut, heure_fin ), tarifs_medecin ( libelle, montant, position ), medecin_assurances ( assurances ( libelle ) )"
            )
            .eq("id", auth.user.id)
            .maybeSingle(),
          supabase
            .from("photos_pro")
            .select("id", { count: "exact", head: true })
            .eq("medecin_id", auth.user.id),
        ]);
        if (actif && m) {
          const ligne = m as unknown as {
            civilite: string | null;
            numero_ordre: string | null;
            rccm: string | null;
            visite_domicile: boolean | null;
            zone_domicile: string | null;
            annees_experience: number | null;
            presentation: string | null;
            langues: string[];
            diplomes: { titre: string; lieu: string }[] | null;
            parcours: { lieu: string; duree: string }[] | null;
            commune: string | null;
            quartier: string | null;
            localisation: string | null;
            telephone_secretariat: string | null;
            photo_url: string | null;
            specialites: { nom: string } | null;
            villes: { nom: string } | null;
            horaires_types: { jour_semaine: number; heure_debut: string; heure_fin: string }[];
            tarifs_medecin: { libelle: string; montant: number | null; position: number }[];
            medecin_assurances: { assurances: { libelle: string } | null }[] | null;
          };
          setMedecin({
            specialite: ligne.specialites?.nom ?? "",
            civilite: ligne.civilite ?? "Dr",
            numeroOrdre: ligne.numero_ordre ?? "",
            rccm: ligne.rccm ?? "",
            visiteDomicile: !!ligne.visite_domicile,
            zoneDomicile: ligne.zone_domicile ?? "",
            tarifs: [...(ligne.tarifs_medecin ?? [])]
              .sort((a, b) => a.position - b.position)
              .map((t) => ({ libelle: t.libelle, montant: t.montant })),
            experience: ligne.annees_experience,
            presentation: ligne.presentation ?? "",
            langues: ligne.langues ?? [],
            assurances: (ligne.medecin_assurances ?? [])
              .map((a) => a.assurances?.libelle ?? "")
              .filter(Boolean),
            diplomes: ligne.diplomes ?? [],
            parcours: ligne.parcours ?? [],
            commune: ligne.commune ?? "",
            quartier: ligne.quartier ?? "",
            ville: ligne.villes?.nom ?? "",
            localisation: ligne.localisation ?? "",
            telephoneSecretariat: ligne.telephone_secretariat ?? "",
            photoUrl: ligne.photo_url,
            nbPhotos: nbPhotos ?? 0,
            horaires: (ligne.horaires_types ?? [])
              .map((h) => ({ jour: h.jour_semaine, debut: h.heure_debut.slice(0, 5), fin: h.heure_fin.slice(0, 5) }))
              .sort((a, b) => ((a.jour + 6) % 7) - ((b.jour + 6) % 7)),
          });
        }
      } else if (etabId) {
        const { data: e } = await supabase
          .from("etablissements")
          .select("nom, type, description, adresse, quartier, telephone, email, services, villes ( nom )")
          .eq("id", etabId)
          .maybeSingle();
        if (actif && e) {
          setEtab({
            nom: e.nom,
            type: e.type,
            description: e.description ?? "",
            adresse: e.adresse ?? "",
            quartier: e.quartier ?? "",
            ville: (e as unknown as { villes: { nom: string } | null }).villes?.nom ?? "",
            telephone: e.telephone ?? "",
            email: e.email ?? "",
            services: e.services ?? [],
          });
        }
      }
    })();
    return () => {
      actif = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, etabId]);

  async function confirmer() {
    if (enCours) return;
    setErreur(null);
    setEnCours(true);
    const res = await terminerInscription();
    setEnCours(false);
    if (res.erreur) setErreur(res.erreur);
    else router.push("/inscription/professionnel/etapes/confirmation");
  }

  const base = "/inscription/professionnel/etapes";
  const medecinRole = role === "medecin";

  return (
    <CadreEtape
      titre="Récapitulatif de votre dossier"
      sousTitre="Vérifiez vos informations : votre dossier part ensuite en validation auprès de notre équipe."
      retour={`${base}/abonnement`}
      onContinuer={confirmer}
      boutonTexte="Confirmer mon inscription →"
      boutonEnCours={enCours}
      erreur={erreur}
    >
      <Section titre="👤 Compte" modifier={medecinRole ? `${base}/profil` : `${base}/fiche`}>
        <Ligne
          label="Nom"
          valeur={`${medecinRole && medecin ? `${medecin.civilite} ` : ""}${compte?.prenom ?? ""} ${compte?.nom ?? ""}`.trim()}
        />
        <Ligne label="E-mail" valeur={compte?.email} />
        <Ligne label="Téléphone" valeur={compte?.telephone} />
      </Section>

      {medecinRole && medecin && (
        <>
          <Section titre="🩺 Profil médical" modifier={`${base}/profil`}>
            <Ligne label="Spécialité" valeur={medecin.specialite} />
            <Ligne label="N° d’ordre" valeur={medecin.numeroOrdre} />
            <Ligne label="RCCM" valeur={medecin.rccm} />
            {/* Les soins ET leurs prix en une seule ligne : ils ne font
                qu'un depuis la 0027, et le pro doit relire exactement ce
                que le patient pourra choisir en réservant. */}
            <Ligne
              label="Soins, actes et tarifs"
              valeur={medecin.tarifs
                .map((t) => `${t.libelle} — ${t.montant === null ? "sur demande" : formatGNF(t.montant)}`)
                .join(" · ")}
            />
            <Ligne label="Assurances acceptées" valeur={medecin.assurances.join(", ")} />
            <Ligne label="Expérience" valeur={medecin.experience ? `${medecin.experience} ans` : ""} />
            <Ligne label="Langues" valeur={medecin.langues.join(", ")} />
            <Ligne
              label="Diplômes"
              valeur={medecin.diplomes
                .map((d) => [d.titre, d.lieu].filter(Boolean).join(" — "))
                .join(" · ")}
            />
            <Ligne
              label="Parcours"
              valeur={medecin.parcours
                .map((p) => [p.lieu, p.duree].filter(Boolean).join(" — "))
                .join(" · ")}
            />
            <Ligne label="Présentation" valeur={medecin.presentation} />
          </Section>
          <Section titre="📍 Lieu d’exercice" modifier={`${base}/lieu`}>
            <Ligne label="Commune" valeur={medecin.commune} />
            <Ligne label="Ville" valeur={medecin.ville} />
            <Ligne label="Quartier" valeur={medecin.quartier} />
            <Ligne label="Secrétariat" valeur={medecin.telephoneSecretariat} />
            <Ligne
              label="Visites à domicile"
              valeur={
                medecin.visiteDomicile
                  ? `Oui${medecin.zoneDomicile ? ` — ${medecin.zoneDomicile}` : ""}`
                  : "Non"
              }
            />
            <Ligne
              label="Position GPS"
              valeur={medecin.localisation ? "Enregistrée ✓" : "Non renseignée"}
            />
          </Section>
          <Section titre="🖼️ Photo & Galerie" modifier={`${base}/photos`}>
            <Ligne
              label="Photo de profil"
              valeur={
                medecin.photoUrl ? (
                  <span className="font-bold text-green">Ajoutée ✓</span>
                ) : (
                  <span className="text-amber">Aucune — vos initiales seront affichées</span>
                )
              }
            />
            <Ligne
              label="Photos du cabinet"
              valeur={
                medecin.nbPhotos > 0
                  ? `${medecin.nbPhotos} photo${medecin.nbPhotos > 1 ? "s" : ""}`
                  : "Aucune"
              }
            />
          </Section>
        </>
      )}

      {!medecinRole && etab && (
        <Section titre="🏥 Fiche établissement" modifier={`${base}/fiche`}>
          <Ligne label="Nom" valeur={`${etab.nom} · ${etab.type}`} />
          <Ligne label="Adresse" valeur={[etab.adresse, etab.quartier, etab.ville].filter(Boolean).join(", ")} />
          <Ligne label="Téléphone" valeur={etab.telephone} />
          <Ligne label="E-mail" valeur={etab.email} />
          <Ligne label="Services" valeur={etab.services.join(", ")} />
          <Ligne label="Description" valeur={etab.description} />
        </Section>
      )}

      <Section titre="📄 Documents" modifier={`${base}/documents`}>
        {documents.length === 0 ? (
          <p className="text-[12.5px] text-amber">
            ⚠️ Aucun document fourni — la validation de votre compte ne pourra pas démarrer.
          </p>
        ) : (
          documents.map((doc) => (
            <Ligne
              key={doc.id}
              label={LIBELLES_DOC[doc.type] ?? doc.type}
              valeur={
                <span className="font-bold text-green">
                  Fourni ✓ <span className="font-semibold text-muted">(vérification sous 24–48 h)</span>
                </span>
              }
            />
          ))
        )}
      </Section>

      {medecinRole && medecin && (
        <Section titre="🕐 Horaires de consultation" modifier={`${base}/horaires`}>
          {medecin.horaires.length === 0 ? (
            <p className="text-[12.5px] text-muted">Aucun horaire défini.</p>
          ) : (
            medecin.horaires.map((h) => (
              <Ligne key={h.jour} label={JOURS_NOMS[h.jour]} valeur={`${h.debut} – ${h.fin}`} />
            ))
          )}
        </Section>
      )}

      <Section titre="💳 Abonnement" modifier={`${base}/abonnement`}>
        {abonnement ? (
          <>
            <Ligne label="Formule" valeur={LIBELLE_FORMULE[abonnement.formule] ?? abonnement.formule} />
            <Ligne label="Périodicité" valeur={abonnement.periode === "annuel" ? "Annuel" : "Mensuel"} />
            <Ligne
              label="À régler"
              valeur={
                abonnement.statut === "essai" ? (
                  <span className="font-bold text-green">
                    Rien pour l’instant{abonnement.dateFin ? ` (jusqu’au ${abonnement.dateFin})` : ""}
                  </span>
                ) : (
                  <span className="font-bold text-red">
                    À régler — notre équipe vous contactera
                  </span>
                )
              }
            />
          </>
        ) : (
          <p className="text-[12.5px] text-muted">Aucune formule choisie.</p>
        )}
      </Section>

      <div className="mt-4 rounded-xl bg-teal-soft px-4 py-3 text-[12.5px] font-semibold leading-relaxed text-blue">
        ℹ️ En confirmant, votre dossier est transmis à notre équipe. Votre fiche sera visible des
        patients après validation (24–48 h).
      </div>
    </CadreEtape>
  );
}
