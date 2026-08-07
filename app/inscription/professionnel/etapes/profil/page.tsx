"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import CadreEtape from "@/components/inscription/CadreEtape";
import { useInscription } from "@/components/inscription/ContexteInscription";
import GrilleTarifs from "@/components/pro/GrilleTarifs";
import { avancerEtape, enregistrerEtapeProfil } from "@/lib/inscription-pro";
import { useAssurancesMedecin } from "@/lib/pro";
import { trierParDemande } from "@/lib/catalogue-specialites";
import { creerClientNavigateur } from "@/lib/supabase/client";
import { useTarifsMedecin } from "@/lib/tarifs";

/*
 * Étape 2 (praticien) — profil médical : spécialité, numéro d'ordre,
 * expérience, présentation, soins et tarifs, langues, diplômes, parcours,
 * genre. Tout est écrit dans `medecins` (ou `tarifs_medecin`), donc déjà
 * visible sur /espace-medecin/profil à la fin du parcours.
 *
 * Il y avait ici DEUX listes : des « soins et actes » sans prix et une
 * grille tarifaire. Le patient voyait les premiers sur la fiche mais ne
 * pouvait réserver que les seconds. Depuis la 0027 il n'en reste qu'une :
 * la grille, où chaque ligne est un soin, avec ou sans prix ferme.
 *
 * La grille suit la présentation, comme sur la fiche publique où les
 * tarifs viennent juste après « À propos ».
 *
 * Diplômes et parcours sont demandés ICI et pas seulement après coup : ce
 * sont eux qui rassurent un patient hésitant entre deux praticiens, et rien
 * n'invitait le médecin à les renseigner une fois l'inscription close. À ne
 * pas confondre avec l'étape « Documents », qui collecte le FICHIER du
 * diplôme à l'usage de l'administrateur — jamais affiché aux patients.
 */

const LANGUES = ["Français", "Anglais", "Poular", "Malinké", "Soussou", "Kissi", "Guerzé", "Toma"];

const champ =
  "w-full rounded-xl border border-line bg-white p-[13px] text-sm outline-none focus:border-teal";
const etiquette = "mb-1.5 mt-4 block text-[12.5px] font-bold text-ink";
const chip = (actif: boolean) =>
  `rounded-full border px-[13px] py-2 text-xs font-bold transition-colors ${
    actif ? "border-teal bg-teal-soft text-blue" : "border-[#DCE4EA] bg-[#EEF2F5] text-[#3A4A55]"
  }`;

export default function EtapeProfilMedical() {
  const router = useRouter();
  const { etape } = useInscription();

  const [medecinId, setMedecinId] = useState<string | undefined>();
  const [specialites, setSpecialites] = useState<{ id: string; nom: string }[]>([]);
  const [specialiteId, setSpecialiteId] = useState("");
  const [numeroOrdre, setNumeroOrdre] = useState("");
  const [rccm, setRccm] = useState("");
  const [visiteDomicile, setVisiteDomicile] = useState(false);
  const [experience, setExperience] = useState("");
  const [presentation, setPresentation] = useState("");
  const [langues, setLangues] = useState<string[]>(["Français"]);
  const [diplomes, setDiplomes] = useState<{ titre: string; lieu: string }[]>([]);
  const [titreDiplome, setTitreDiplome] = useState("");
  const [lieuDiplome, setLieuDiplome] = useState("");
  const [parcours, setParcours] = useState<{ lieu: string; duree: string }[]>([]);
  const [lieuEtape, setLieuEtape] = useState("");
  const [dureeEtape, setDureeEtape] = useState("");
  const [genre, setGenre] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const { tarifs, recharger: rechargerTarifs } = useTarifsMedecin(medecinId);
  // Comme la grille tarifaire, les assurances vivent dans leur propre table
  // et sont écrites au clic — rien à repasser à `enregistrerEtapeProfil`.
  const { referentiel: assurances, actives: assurancesActives, basculer: basculerAssurance } =
    useAssurancesMedecin(medecinId);

  useEffect(() => {
    let actif = true;
    (async () => {
      const supabase = creerClientNavigateur();
      const [{ data: refs }, { data: auth }] = await Promise.all([
        supabase.from("specialites").select("id,nom"),
        supabase.auth.getUser(),
      ]);
      if (!actif) return;
      // Les plus consultées en tête : sur 76 entrées, l'ordre alphabétique
      // enterrait « Médecine générale » au milieu de la liste.
      setSpecialites(trierParDemande(refs ?? [], (s) => s.nom));
      if (!auth.user) return;
      setMedecinId(auth.user.id);
      const { data: m } = await supabase
        .from("medecins")
        .select("specialite_id, numero_ordre, rccm, visite_domicile, annees_experience, presentation, langues, diplomes, parcours, genre")
        .eq("id", auth.user.id)
        .maybeSingle();
      if (!actif || !m) return;
      if (m.specialite_id) setSpecialiteId(m.specialite_id);
      if (m.numero_ordre) setNumeroOrdre(m.numero_ordre);
      if (m.rccm) setRccm(m.rccm);
      setVisiteDomicile(!!m.visite_domicile);
      if (m.annees_experience) setExperience(String(m.annees_experience));
      if (m.presentation) setPresentation(m.presentation);
      if (m.langues?.length) setLangues(m.langues);
      if (m.diplomes?.length) setDiplomes(m.diplomes);
      if (m.parcours?.length) setParcours(m.parcours);
      if (m.genre) setGenre(m.genre);
    })();
    return () => {
      actif = false;
    };
  }, []);

  async function changerAssurance(assuranceId: string, active: boolean) {
    const res = await basculerAssurance(assuranceId, active);
    setErreur(res.erreur ? `Assurance non enregistrée : ${res.erreur}` : null);
  }

  function basculerLangue(langue: string) {
    setLangues((l) => (l.includes(langue) ? l.filter((x) => x !== langue) : [...l, langue]));
  }

  // L'intitulé suffit à ajouter la ligne : exiger aussi l'établissement
  // ferait abandonner ceux qui ne l'ont pas sous la main.
  function ajouterDiplome() {
    const titre = titreDiplome.trim();
    if (!titre) return;
    setDiplomes((d) => [...d, { titre, lieu: lieuDiplome.trim() }]);
    setTitreDiplome("");
    setLieuDiplome("");
  }

  function ajouterEtape() {
    const lieu = lieuEtape.trim();
    if (!lieu) return;
    setParcours((p) => [...p, { lieu, duree: dureeEtape.trim() }]);
    setLieuEtape("");
    setDureeEtape("");
  }

  async function continuer() {
    if (enCours) return;
    setErreur(null);
    if (!specialiteId) return setErreur("Choisissez votre spécialité.");
    // Les soins vivent dans leur propre table et sont écrits au fil de la
    // saisie : il reste à vérifier qu'au moins une ligne existe, sans quoi
    // la fiche publique n'afficherait ni prix ni acte, et le patient
    // n'aurait aucun motif à choisir en réservant.
    if (tarifs.length === 0)
      return setErreur("Ajoutez au moins un soin (ex. Consultation — 150000 GNF).");
    setEnCours(true);
    const res = await enregistrerEtapeProfil({
      specialiteId,
      numeroOrdre,
      rccm,
      anneesExperience: experience ? Number(experience) : null,
      presentation,
      langues,
      diplomes,
      parcours,
      genre,
    });
    let cible = "lieu";
    if (!res.erreur) {
      const avancee = await avancerEtape("medecin", null, "lieu");
      cible = avancee.cible;
      if (avancee.erreur) res.erreur = avancee.erreur;
    }
    setEnCours(false);
    if (res.erreur) setErreur(res.erreur);
    else router.push(`/inscription/professionnel/etapes/${cible}`);
  }

  return (
    <CadreEtape
      titre="Votre profil médical"
      sousTitre="Ces informations sont affichées sur votre fiche publique et aident les patients à vous choisir."
      onContinuer={continuer}
      boutonTexte={etape === "recap" ? "Enregistrer et revenir au récap" : "Continuer"}
      boutonEnCours={enCours}
      erreur={erreur}
    >
      <label className={`${etiquette} mt-0`}>Spécialité *</label>
      <select className={champ} value={specialiteId} onChange={(e) => setSpecialiteId(e.target.value)}>
        <option value="">— Choisir —</option>
        {specialites.map((s) => (
          <option key={s.id} value={s.id}>{s.nom}</option>
        ))}
      </select>

      <label className={etiquette}>Numéro d’ordre médical</label>
      <input
        className={champ}
        placeholder="Ex. ONMG-2014-0873"
        value={numeroOrdre}
        onChange={(e) => setNumeroOrdre(e.target.value)}
      />
      <p className="mt-1.5 text-[11.5px] text-muted">
        Votre numéro d’inscription à l’Ordre national des médecins. Il est affiché sur votre fiche
        publique : c’est ce qui permet à un patient de vérifier que vous exercez légalement.
      </p>

      <label className={etiquette}>RCCM</label>
      <input
        className={champ}
        placeholder="Ex. GC-KAL/123.456A/2021"
        value={rccm}
        onChange={(e) => setRccm(e.target.value)}
      />
      <p className="mt-1.5 text-[11.5px] text-muted">
        Registre du Commerce et du Crédit Mobilier — mention légale de votre activité, affichée
        avec votre numéro d’ordre.
      </p>

      <label className={etiquette}>Années d’expérience</label>
      <input
        className={champ}
        inputMode="numeric"
        placeholder="Ex. 8"
        value={experience}
        onChange={(e) => setExperience(e.target.value.replace(/\D/g, ""))}
      />

      <label className={etiquette}>Présentation (« À propos »)</label>
      <textarea
        className={`${champ} min-h-[90px]`}
        placeholder="Présentez votre pratique en quelques phrases…"
        value={presentation}
        onChange={(e) => setPresentation(e.target.value)}
      />

      {/* Juste après « À propos », comme sur la fiche publique. */}
      <label className={etiquette}>Soins, actes et tarifs *</label>
      <p className="-mt-0.5 mb-2 text-[11.5px] text-muted">
        Chaque ligne est un soin que vous proposez (consultation, suivi, vaccination, échographie…)
        : c’est cette liste que le patient voit sur votre fiche et dans laquelle il choisit le motif
        de sa consultation. Les tarifs sont payés sur place. Laissez le prix vide si le montant
        dépend du cas. Chaque ligne est enregistrée immédiatement.
      </p>
      <GrilleTarifs medecinId={medecinId} onChangement={rechargerTarifs} visiteDomicile={visiteDomicile} />

      {/* Avec les tarifs : le patient qui regarde un prix se demande dans la
          foulée si son assurance est prise. Rien n'invitait le médecin à le
          renseigner, et la rubrique restait vide sur la fiche publique. */}
      <label className={etiquette}>Assurances acceptées</label>
      <p className="-mt-0.5 mb-2 text-[11.5px] text-muted">
        Parmi les assurances référencées par la plateforme. Elles sont affichées sur votre fiche et
        servent de filtre de recherche aux patients assurés. Modifiable à tout moment depuis votre
        profil.
      </p>
      {assurances.length === 0 ? (
        <p className="text-[12.5px] text-muted">Aucune assurance référencée pour le moment.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {assurances.map((assurance) => {
            const active = assurancesActives.has(assurance.id);
            return (
              <button
                key={assurance.id}
                type="button"
                aria-pressed={active}
                className={chip(active)}
                onClick={() => changerAssurance(assurance.id, !active)}
              >
                {assurance.libelle}
                {active ? " ✓" : ""}
              </button>
            );
          })}
        </div>
      )}

      <label className={etiquette}>Langues parlées</label>
      <div className="flex flex-wrap gap-2">
        {LANGUES.map((langue) => (
          <button key={langue} type="button" className={chip(langues.includes(langue))} onClick={() => basculerLangue(langue)}>
            {langue}
            {langues.includes(langue) ? " ✓" : ""}
          </button>
        ))}
      </div>

      <label className={etiquette}>Diplômes et formation</label>
      <p className="-mt-0.5 mb-2 text-[11.5px] text-muted">
        Affichés sur votre fiche publique. Le fichier du diplôme sera demandé à l’étape
        suivante — il reste privé.
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          className={champ}
          placeholder="Intitulé — ex. Doctorat en médecine"
          value={titreDiplome}
          onChange={(e) => setTitreDiplome(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              ajouterDiplome();
            }
          }}
        />
        <input
          className={champ}
          placeholder="Établissement et année"
          value={lieuDiplome}
          onChange={(e) => setLieuDiplome(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              ajouterDiplome();
            }
          }}
        />
        <button
          type="button"
          onClick={ajouterDiplome}
          className="flex-none rounded-xl border border-[#CDE6F2] bg-teal-soft px-4 py-3 text-[13px] font-bold text-blue sm:py-0"
        >
          + Ajouter
        </button>
      </div>
      {diplomes.length > 0 && (
        <div className="mt-2 flex flex-col gap-2">
          {diplomes.map((d, index) => (
            <div
              key={`${d.titre}-${index}`}
              className="flex items-center gap-[11px] rounded-[11px] border border-line px-[13px] py-[11px] text-[13px]"
            >
              <span aria-hidden>🎓</span>
              <span className="min-w-0 flex-1 font-bold">
                {d.titre}
                {d.lieu && <small className="block text-xs font-semibold text-muted">{d.lieu}</small>}
              </span>
              <button
                type="button"
                onClick={() => setDiplomes((l) => l.filter((_, i) => i !== index))}
                aria-label={`Retirer le diplôme ${d.titre}`}
                className="text-xs font-bold text-red hover:underline"
              >
                Retirer
              </button>
            </div>
          ))}
        </div>
      )}

      <label className={etiquette}>Parcours professionnel</label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          className={champ}
          placeholder="Établissement ou service"
          value={lieuEtape}
          onChange={(e) => setLieuEtape(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              ajouterEtape();
            }
          }}
        />
        <input
          className={champ}
          placeholder="Période — ex. 2018 – 2024"
          value={dureeEtape}
          onChange={(e) => setDureeEtape(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              ajouterEtape();
            }
          }}
        />
        <button
          type="button"
          onClick={ajouterEtape}
          className="flex-none rounded-xl border border-[#CDE6F2] bg-teal-soft px-4 py-3 text-[13px] font-bold text-blue sm:py-0"
        >
          + Ajouter
        </button>
      </div>
      {parcours.length > 0 && (
        <div className="mt-2 flex flex-col gap-2">
          {parcours.map((p, index) => (
            <div
              key={`${p.lieu}-${index}`}
              className="flex items-center gap-[11px] rounded-[11px] border border-line px-[13px] py-[11px] text-[13px]"
            >
              <span aria-hidden>🏥</span>
              <span className="min-w-0 flex-1 font-bold">
                {p.lieu}
                {p.duree && <small className="block text-xs font-semibold text-muted">{p.duree}</small>}
              </span>
              <button
                type="button"
                onClick={() => setParcours((l) => l.filter((_, i) => i !== index))}
                aria-label={`Retirer l’étape ${p.lieu}`}
                className="text-xs font-bold text-red hover:underline"
              >
                Retirer
              </button>
            </div>
          ))}
        </div>
      )}

      <label className={etiquette}>Sexe</label>
      <p className="-mt-0.5 mb-2 text-[11.5px] text-muted">
        Alimente un filtre de recherche côté patient. Vous pouvez ne pas le préciser.
      </p>
      <div className="flex flex-wrap gap-2">
        {[
          { valeur: "femme", label: "Femme" },
          { valeur: "homme", label: "Homme" },
          { valeur: "", label: "Ne pas préciser" },
        ].map((o) => (
          <button key={o.valeur || "np"} type="button" className={chip(genre === o.valeur)} onClick={() => setGenre(o.valeur)}>
            {o.label}
          </button>
        ))}
      </div>
    </CadreEtape>
  );
}
