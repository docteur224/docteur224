"use client";

import { useEffect, useState } from "react";
import MedecinShell from "@/components/medecin/MedecinShell";
import EnTeteMobile from "@/components/mobile/EnTeteMobile";
import PhotoProfil from "@/components/pro/PhotoProfil";
import GaleriePhotos from "@/components/pro/GaleriePhotos";
import GrilleTarifs from "@/components/pro/GrilleTarifs";
import HorairesHebdo, {
  JOURS_DEFAUT,
  depuisPlages,
  premiereErreurHoraires,
  versPlages,
  type JourEdition,
} from "@/components/pro/HorairesHebdo";
import ChampCommune from "@/components/site/ChampCommune";
import Interrupteur from "@/components/patient/Interrupteur";
import { CIVILITES } from "@/lib/civilites";
import ChampTelephoneGN from "@/components/site/ChampTelephoneGN";
import { chargerEtablissementParId } from "@/lib/donnees";
import { enregistrerHorairesHebdo } from "@/lib/inscription-pro";
import { creerClientNavigateur } from "@/lib/supabase/client";
import {
  MESSAGE_TELEPHONE_GN,
  chiffresTelephone,
  telephoneGuineenValide,
} from "@/lib/telephone";
import {
  estCoordonnees as sontDesCoordonnees,
  formaterPosition,
  lienCarte,
  recupererPositionActuelle,
} from "@/lib/geolocalisation";
import type { Etablissement } from "@/types";
import {
  enregistrerIdentiteMedecin,
  enregistrerProfilMedecin,
  televerserDocumentValidation,
  useAssurancesMedecin,
  useContextePro,
  useDocumentsValidation,
} from "@/lib/pro";

/*
 * Mon profil (médecin) — spec C.4.5.
 *
 * Tout ce qui est saisi pendant le parcours d'inscription doit être
 * corrigeable ici : c'est le même dossier, vu après coup. L'écran ne
 * montrait jusqu'à présent qu'une fiche d'identité EN LECTURE SEULE
 * (spécialité, expérience, téléphone, tarif, présentation) — un médecin
 * qui changeait de cabinet ou de tarif n'avait aucun moyen de le dire,
 * sinon en écrivant au support.
 *
 * Chaque champ s'enregistre à la sortie du champ (« au blur »), comme les
 * listes de puces le faisaient déjà : c'est ce que promet le bandeau
 * « Modifications enregistrées automatiquement ». Seule la grille horaire
 * a un bouton, parce qu'un jour ouvert sans heures cohérentes ne doit pas
 * partir en base à mi-saisie.
 */

const LIBELLES_STATUT_DOC: Record<string, string> = {
  en_attente: "En vérification",
  valide: "Validé",
  refuse: "Refusé",
};

const MEDECIN_VIDE = {
  id: "",
  gradient: "linear-gradient(135deg,#2E9CCA,#15506B)",
  initiales: "…",
  photoUrl: null as string | null,
  civilite: "Dr" as const,
  genre: null as "femme" | "homme" | null,
  prenom: "",
  nom: "",
  specialite: "",
  etablissementId: "",
  ville: "",
  commune: "",
  quartier: "",
  numeroOrdre: "",
  rccm: "",
  visiteDomicile: false,
  zoneDomicile: "",
  anneesExperience: 0,
  tarifConsultation: 0,
  telephoneSecretariat: "",
  aPropos: "",
  soinsEtActes: [] as string[],
  diplomes: [] as { titre: string; lieu: string }[],
  parcours: [] as { lieu: string; duree: string }[],
  langues: [] as string[],
};

/** Champs texte du dossier, tels qu'ils sont édités à l'écran. */
interface Formulaire {
  prenom: string;
  nom: string;
  civilite: string;
  specialiteId: string;
  numeroOrdre: string;
  rccm: string;
  visiteDomicile: boolean;
  zoneDomicile: string;
  experience: string;
  presentation: string;
  villeId: string;
  commune: string;
  quartier: string;
  telephoneSecretariat: string;
}

export default function ProfilMedecin() {
  const { medecin } = useContextePro();
  const medecinConnecte = medecin ?? MEDECIN_VIDE;
  const [etab, setEtab] = useState<Etablissement | undefined>();
  useEffect(() => {
    if (medecin?.etablissementId) {
      chargerEtablissementParId(medecin.etablissementId).then(setEtab);
    }
  }, [medecin?.etablissementId]);

  const { documents: docsBase, recharger: rechargerDocs } = useDocumentsValidation();
  const { referentiel, actives, basculer } = useAssurancesMedecin(medecin?.id);

  /* ---------- Dossier éditable (chargé une fois, puis tenu en local) ---------- */
  const [specialites, setSpecialites] = useState<{ id: string; nom: string }[]>([]);
  const [villes, setVilles] = useState<{ id: string; nom: string }[]>([]);
  const [formulaire, setFormulaire] = useState<Formulaire | null>(null);
  const [jours, setJours] = useState<Record<number, JourEdition> | null>(null);
  const [message, setMessage] = useState<{ texte: string; erreur: boolean } | null>(null);

  useEffect(() => {
    let actif = true;
    (async () => {
      const supabase = creerClientNavigateur();
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return;
      const [{ data: specs }, { data: vls }, { data: m }, { data: u }, { data: h }] =
        await Promise.all([
          supabase.from("specialites").select("id, nom").order("nom"),
          supabase.from("villes").select("id, nom").order("nom"),
          supabase
            .from("medecins")
            .select(
              "civilite, specialite_id, ville_id, commune, quartier, numero_ordre, rccm, visite_domicile, zone_domicile, annees_experience, presentation, telephone_secretariat"
            )
            .eq("id", auth.user.id)
            .maybeSingle(),
          supabase.from("utilisateurs").select("nom, prenom").eq("id", auth.user.id).maybeSingle(),
          supabase
            .from("horaires_types")
            .select("jour_semaine, heure_debut, heure_fin")
            .eq("medecin_id", auth.user.id),
        ]);
      if (!actif) return;
      setSpecialites(specs ?? []);
      setVilles(vls ?? []);
      setJours(h && h.length > 0 ? depuisPlages(h) : JOURS_DEFAUT);
      if (m) {
        setFormulaire({
          prenom: u?.prenom ?? "",
          nom: u?.nom ?? "",
          civilite: m.civilite ?? "Dr",
          specialiteId: m.specialite_id ?? "",
          numeroOrdre: m.numero_ordre ?? "",
          rccm: m.rccm ?? "",
          visiteDomicile: !!m.visite_domicile,
          zoneDomicile: m.zone_domicile ?? "",
          experience: m.annees_experience != null ? String(m.annees_experience) : "",
          presentation: m.presentation ?? "",
          villeId: m.ville_id ?? "",
          commune: m.commune ?? "",
          quartier: m.quartier ?? "",
          telephoneSecretariat: chiffresTelephone(m.telephone_secretariat ?? ""),
        });
      }
    })();
    return () => {
      actif = false;
    };
  }, []);

  // Surcharges locales (affichage immédiat) au-dessus du profil chargé
  const [soinsLocaux, setSoinsLocaux] = useState<string[] | null>(null);
  const [languesLocales, setLanguesLocales] = useState<string[] | null>(null);
  const [diplomesLocaux, setDiplomesLocaux] = useState<{ titre: string; lieu: string }[] | null>(null);
  const [parcoursLocal, setParcoursLocal] = useState<{ lieu: string; duree: string }[] | null>(null);
  const [genreLocal, setGenreLocal] = useState<string | null>(null);
  const [lienMapsLocal, setLienMapsLocal] = useState<string | null>(null);
  const [precision, setPrecision] = useState<number | null>(null);
  const [geolocEnCours, setGeolocEnCours] = useState(false);
  const [erreurGeoloc, setErreurGeoloc] = useState("");
  const [erreurDoc, setErreurDoc] = useState("");
  const [horairesEnCours, setHorairesEnCours] = useState(false);

  const localisation = lienMapsLocal ?? (medecin as { localisation?: string } | null)?.localisation ?? "";
  const estCoordonnees = sontDesCoordonnees(localisation);
  const profil = {
    soins: soinsLocaux ?? medecinConnecte.soinsEtActes,
    langues: languesLocales ?? medecinConnecte.langues,
    diplomes: diplomesLocaux ?? medecinConnecte.diplomes,
    parcours: parcoursLocal ?? medecinConnecte.parcours,
    positionTexte: estCoordonnees ? localisation : "",
    documents: docsBase.map((d) => ({
      nom: d.fichier.split("/").pop() ?? d.type,
      statut: LIBELLES_STATUT_DOC[d.statut] ?? d.statut,
    })),
    assurances: referentiel.filter((a) => actives.has(a.id)).map((a) => a.libelle),
  };
  const ASSURANCES_REFERENCEES = referentiel.map((a) => a.libelle);

  function signaler(res: { erreur?: string }, succes = "Enregistré ✓") {
    setMessage(res.erreur ? { texte: res.erreur, erreur: true } : { texte: succes, erreur: false });
  }

  function majFormulaire(maj: Partial<Formulaire>) {
    setFormulaire((f) => (f ? { ...f, ...maj } : f));
  }

  /* ---------- Enregistrements ---------- */

  async function enregistrerChamp(champ: keyof Formulaire, valeur: string) {
    switch (champ) {
      case "prenom":
      case "nom":
      case "civilite":
        return signaler(await enregistrerIdentiteMedecin({ [champ]: valeur.trim() }));
      case "specialiteId":
        return signaler(await enregistrerProfilMedecin({ specialiteId: valeur }));
      case "villeId":
        return signaler(await enregistrerProfilMedecin({ villeId: valeur }));
      case "commune":
        return signaler(await enregistrerProfilMedecin({ commune: valeur.trim() }));
      case "quartier":
        return signaler(await enregistrerProfilMedecin({ quartier: valeur.trim() }));
      case "numeroOrdre":
        return signaler(await enregistrerProfilMedecin({ numeroOrdre: valeur.trim() }));
      case "rccm":
        return signaler(await enregistrerProfilMedecin({ rccm: valeur.trim() }));
      case "zoneDomicile":
        return signaler(await enregistrerProfilMedecin({ zoneDomicile: valeur.trim() }));
      case "presentation":
        return signaler(await enregistrerProfilMedecin({ presentation: valeur }));
      case "experience":
        return signaler(
          await enregistrerProfilMedecin({ anneesExperience: valeur ? Number(valeur) : null })
        );
      case "telephoneSecretariat": {
        if (valeur && !telephoneGuineenValide(valeur))
          return setMessage({ texte: MESSAGE_TELEPHONE_GN, erreur: true });
        return signaler(
          await enregistrerProfilMedecin({
            telephoneSecretariat: valeur ? `+224${chiffresTelephone(valeur)}` : "",
          })
        );
      }
    }
  }

  async function enregistrerHoraires() {
    if (!jours || horairesEnCours) return;
    const probleme = premiereErreurHoraires(jours);
    if (probleme) return setMessage({ texte: probleme, erreur: true });
    setHorairesEnCours(true);
    const res = await enregistrerHorairesHebdo(versPlages(jours));
    setHorairesEnCours(false);
    signaler(res, "Horaires enregistrés ✓");
  }

  async function recupererPosition() {
    setErreurGeoloc("");
    setGeolocEnCours(true);
    const { position, erreur } = await recupererPositionActuelle();
    if (!position) {
      setGeolocEnCours(false);
      setPrecision(null);
      return setErreurGeoloc(erreur ?? "Localisation impossible pour le moment.");
    }
    const texte = formaterPosition(position);
    setLienMapsLocal(texte);
    setPrecision(position.precision);
    signaler(await enregistrerProfilMedecin({ lienMaps: texte }), "Position enregistrée ✓");
    setGeolocEnCours(false);
  }

  async function ajouterFichier(fichiers: FileList | null) {
    if (!fichiers || fichiers.length === 0) return;
    setErreurDoc("");
    const res = await televerserDocumentValidation(fichiers[0]);
    if (res.erreur) setErreurDoc(res.erreur);
    else rechargerDocs();
  }

  async function ajouterElement(cle: "soins" | "langues", question: string) {
    const valeur = window.prompt(question)?.trim();
    if (!valeur) return;
    const nouvelle = [...profil[cle], valeur];
    if (cle === "soins") {
      setSoinsLocaux(nouvelle);
      signaler(await enregistrerProfilMedecin({ soins: nouvelle }));
    } else {
      setLanguesLocales(nouvelle);
      signaler(await enregistrerProfilMedecin({ langues: nouvelle }));
    }
  }

  async function retirerElement(cle: "soins" | "langues", valeur: string) {
    const nouvelle = profil[cle].filter((x) => x !== valeur);
    if (cle === "soins") {
      setSoinsLocaux(nouvelle);
      signaler(await enregistrerProfilMedecin({ soins: nouvelle }));
    } else {
      setLanguesLocales(nouvelle);
      signaler(await enregistrerProfilMedecin({ langues: nouvelle }));
    }
  }

  /*
   * Diplômes et parcours : les deux cartes n'affichaient que l'existant,
   * sans aucun moyen d'ajouter ni de retirer une ligne — un médecin ne
   * pouvait donc pas renseigner sa formation depuis son espace, alors que
   * la fiche publique la met en avant.
   */
  async function ajouterDiplome() {
    const titre = window.prompt("Intitulé du diplôme :")?.trim();
    if (!titre) return;
    const lieu = window.prompt("Établissement et année (ex. Université de Conakry — 2014) :")?.trim() ?? "";
    const nouvelle = [...profil.diplomes, { titre, lieu }];
    setDiplomesLocaux(nouvelle);
    signaler(await enregistrerProfilMedecin({ diplomes: nouvelle }));
  }

  async function retirerDiplome(index: number) {
    const nouvelle = profil.diplomes.filter((_, i) => i !== index);
    setDiplomesLocaux(nouvelle);
    signaler(await enregistrerProfilMedecin({ diplomes: nouvelle }));
  }

  async function ajouterEtape() {
    const lieu = window.prompt("Établissement ou service :")?.trim();
    if (!lieu) return;
    const duree = window.prompt("Période (ex. 2018 – 2024) :")?.trim() ?? "";
    const nouvelle = [...profil.parcours, { lieu, duree }];
    setParcoursLocal(nouvelle);
    signaler(await enregistrerProfilMedecin({ parcours: nouvelle }));
  }

  async function retirerEtape(index: number) {
    const nouvelle = profil.parcours.filter((_, i) => i !== index);
    setParcoursLocal(nouvelle);
    signaler(await enregistrerProfilMedecin({ parcours: nouvelle }));
  }

  async function basculerAssurance(nom: string) {
    const assurance = referentiel.find((a) => a.libelle === nom);
    if (!assurance) return;
    await basculer(assurance.id, !actives.has(assurance.id));
  }

  async function sauverLienMaps() {
    signaler(await enregistrerProfilMedecin({ lienMaps: localisation }));
  }

  const champ =
    "w-full rounded-[11px] border border-line bg-white px-[13px] py-3 text-[13.5px] outline-none focus:border-teal";
  const champStatique = "rounded-[11px] border border-line bg-white px-[13px] py-3 text-[13.5px]";
  const labelChamp = "mb-1.5 block text-xs font-bold text-muted";

  /* ---------- Blocs partagés mobile / web ---------- */

  const bandeauMessage = message && (
    <p
      role="status"
      className={`mb-3 rounded-lg px-3 py-2 text-[12.5px] font-semibold ${
        message.erreur ? "bg-red-soft text-red" : "bg-green-soft text-green"
      }`}
    >
      {message.texte}
    </p>
  );

  /*
   * L'écran rend deux fois les mêmes champs (bloc mobile + bloc web, l'un
   * masqué par CSS). Les identifiants doivent donc être préfixés : deux
   * `id` identiques dans le document rendraient chaque `label for` ambigu
   * — celui du bloc web désignerait l'input mobile, invisible.
   */
  const champsIdentite = (prefixe: string) => !formulaire ? (
    <p className="text-[13px] text-muted">Chargement…</p>
  ) : (
    <div className="grid gap-4 sm:grid-cols-2">
      <div>
        <label className={labelChamp} htmlFor={`${prefixe}-prenom`}>
          Prénom
        </label>
        <input
          id={`${prefixe}-prenom`}
          className={champ}
          value={formulaire.prenom}
          onChange={(e) => majFormulaire({ prenom: e.target.value })}
          onBlur={(e) => enregistrerChamp("prenom", e.target.value)}
        />
      </div>
      <div>
        <label className={labelChamp} htmlFor={`${prefixe}-nom`}>
          Nom
        </label>
        <input
          id={`${prefixe}-nom`}
          className={champ}
          value={formulaire.nom}
          onChange={(e) => majFormulaire({ nom: e.target.value })}
          onBlur={(e) => enregistrerChamp("nom", e.target.value)}
        />
      </div>
      <div>
        <label className={labelChamp} htmlFor={`${prefixe}-civilite`}>
          Civilité
        </label>
        <select
          id={`${prefixe}-civilite`}
          className={champ}
          value={formulaire.civilite}
          onChange={(e) => {
            majFormulaire({ civilite: e.target.value });
            enregistrerChamp("civilite", e.target.value);
          }}
        >
          {CIVILITES.map((c) => (
            <option key={c.valeur} value={c.valeur}>{c.label}</option>
          ))}
        </select>
      </div>
      <div>
        <label className={labelChamp} htmlFor={`${prefixe}-specialite`}>
          Spécialité
        </label>
        <select
          id={`${prefixe}-specialite`}
          className={champ}
          value={formulaire.specialiteId}
          onChange={(e) => {
            majFormulaire({ specialiteId: e.target.value });
            enregistrerChamp("specialiteId", e.target.value);
          }}
        >
          <option value="">— Choisir —</option>
          {specialites.map((s) => (
            <option key={s.id} value={s.id}>
              {s.nom}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className={labelChamp} htmlFor={`${prefixe}-ordre`}>
          Numéro d’ordre médical
        </label>
        <input
          id={`${prefixe}-ordre`}
          className={champ}
          placeholder="Ex. ONMG-2014-0873"
          value={formulaire.numeroOrdre}
          onChange={(e) => majFormulaire({ numeroOrdre: e.target.value })}
          onBlur={(e) => enregistrerChamp("numeroOrdre", e.target.value)}
        />
      </div>
      <div>
        <label className={labelChamp} htmlFor={`${prefixe}-rccm`}>
          RCCM
        </label>
        <input
          id={`${prefixe}-rccm`}
          className={champ}
          placeholder="Ex. GC-KAL/123.456A/2021"
          value={formulaire.rccm}
          onChange={(e) => majFormulaire({ rccm: e.target.value })}
          onBlur={(e) => enregistrerChamp("rccm", e.target.value)}
        />
      </div>
      <div>
        <label className={labelChamp} htmlFor={`${prefixe}-experience`}>
          Années d’expérience
        </label>
        <input
          id={`${prefixe}-experience`}
          className={champ}
          inputMode="numeric"
          value={formulaire.experience}
          onChange={(e) => majFormulaire({ experience: e.target.value.replace(/\D/g, "") })}
          onBlur={(e) => enregistrerChamp("experience", e.target.value)}
        />
      </div>
      <div className="sm:col-span-2">
        <label className={labelChamp} htmlFor={`${prefixe}-presentation`}>
          Présentation (« À propos »)
        </label>
        <textarea
          id={`${prefixe}-presentation`}
          className={`${champ} min-h-[90px]`}
          placeholder="Présentez votre pratique en quelques phrases…"
          value={formulaire.presentation}
          onChange={(e) => majFormulaire({ presentation: e.target.value })}
          onBlur={(e) => enregistrerChamp("presentation", e.target.value)}
        />
      </div>
    </div>
  );

  const champsLieu = (prefixe: string) => !formulaire ? (
    <p className="text-[13px] text-muted">Chargement…</p>
  ) : (
    <div className="grid gap-4 sm:grid-cols-2">
      <div>
        <label className={labelChamp}>Commune</label>
        <ChampCommune
          villeId={formulaire.villeId || undefined}
          valeur={formulaire.commune}
          onChange={(v) => {
            majFormulaire({ commune: v });
            enregistrerChamp("commune", v);
          }}
        />
      </div>
      <div>
        <label className={labelChamp} htmlFor={`${prefixe}-ville`}>
          Ville
        </label>
        <select
          id={`${prefixe}-ville`}
          className={champ}
          value={formulaire.villeId}
          onChange={(e) => {
            majFormulaire({ villeId: e.target.value });
            enregistrerChamp("villeId", e.target.value);
          }}
        >
          <option value="">— Choisir —</option>
          {villes.map((v) => (
            <option key={v.id} value={v.id}>
              {v.nom}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className={labelChamp} htmlFor={`${prefixe}-quartier`}>
          Quartier
        </label>
        <input
          id={`${prefixe}-quartier`}
          className={champ}
          placeholder="Ex. Kipé, Nongo…"
          value={formulaire.quartier}
          onChange={(e) => majFormulaire({ quartier: e.target.value })}
          onBlur={(e) => enregistrerChamp("quartier", e.target.value)}
        />
      </div>
      <div>
        <label className={labelChamp}>Téléphone du secrétariat</label>
        <ChampTelephoneGN
          valeur={formulaire.telephoneSecretariat}
          ariaLabel="Téléphone du secrétariat"
          onChange={(v) => majFormulaire({ telephoneSecretariat: v })}
        />
        <button
          type="button"
          onClick={() => enregistrerChamp("telephoneSecretariat", formulaire.telephoneSecretariat)}
          className="-mt-1 rounded-[9px] border-[1.5px] border-line bg-white px-3 py-1.5 text-[11.5px] font-bold text-blue hover:border-teal"
        >
          Enregistrer le numéro
        </button>
      </div>
      <div className="sm:col-span-2">
        <label className={labelChamp}>Établissement de rattachement</label>
        <div className={champStatique}>
          {etab?.nom ?? "Aucun — vous exercez en cabinet indépendant"}
        </div>
      </div>
    </div>
  );

  /*
   * Visites à domicile. Le lieu conditionne la grille tarifaire (chaque
   * ligne dit où elle s'applique) et ce que le patient peut choisir à la
   * réservation : la bascule est donc enregistrée immédiatement, sans
   * attendre la sortie d'un champ.
   */
  const carteDomicile = (prefixe: string) => !formulaire ? (
    <p className="text-[13px] text-muted">Chargement…</p>
  ) : (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 text-[12.5px] leading-relaxed text-muted">
          Si vous vous déplacez, le patient choisit son lieu de consultation au moment de
          réserver et l’information apparaît sur votre fiche.
        </p>
        <Interrupteur
          actif={formulaire.visiteDomicile}
          label="J’accepte les visites à domicile"
          onChange={async (v) => {
            majFormulaire({ visiteDomicile: v });
            signaler(await enregistrerProfilMedecin({ visiteDomicile: v }));
          }}
        />
      </div>
      {formulaire.visiteDomicile && (
        <div className="mt-4 border-t border-line pt-4">
          <label className={labelChamp} htmlFor={`${prefixe}-zone`}>
            Zones desservies
          </label>
          <input
            id={`${prefixe}-zone`}
            className={champ}
            placeholder="Ex. Ratoma, Dixinn, Matam"
            value={formulaire.zoneDomicile}
            onChange={(e) => majFormulaire({ zoneDomicile: e.target.value })}
            onBlur={(e) => enregistrerChamp("zoneDomicile", e.target.value)}
          />
          <p className="mt-1.5 text-[11.5px] text-muted">
            Affichées au patient avant qu’il ne réserve. Précisez le lieu d’application de chaque
            ligne dans la grille tarifaire ci-dessus.
          </p>
        </div>
      )}
    </>
  );

  const carteHoraires = (
    <>
      <p className="mb-3 text-[12.5px] text-muted">
        Ils déterminent les créneaux réservables et s’affichent sur votre fiche dans « Lieu de
        consultation ». Les fermetures ponctuelles se gèrent dans « Mes disponibilités ».
      </p>
      {jours ? (
        <>
          <HorairesHebdo
            jours={jours}
            onChange={(jour, maj) =>
              setJours((j) => (j ? { ...j, [jour]: { ...j[jour], ...maj } } : j))
            }
          />
          <button
            type="button"
            onClick={enregistrerHoraires}
            disabled={horairesEnCours}
            className="mt-3 rounded-[11px] bg-teal px-5 py-3 text-[13px] font-extrabold text-white disabled:opacity-60"
          >
            {horairesEnCours ? "Enregistrement…" : "Enregistrer les horaires"}
          </button>
        </>
      ) : (
        <p className="text-[13px] text-muted">Chargement…</p>
      )}
    </>
  );

  const carteLocalisation = (
    <>
      <p className="mb-3 text-[12.5px] text-muted">
        Récupérez votre position pendant que vous êtes dans votre établissement, ou collez un lien
        Google Maps.
      </p>
      <button
        type="button"
        onClick={recupererPosition}
        disabled={geolocEnCours}
        className="inline-flex items-center gap-2 rounded-[11px] border border-[#CDE6F2] bg-teal-soft px-[15px] py-[11px] text-[13px] font-extrabold text-blue disabled:opacity-60"
      >
        🎯 {geolocEnCours ? "Localisation en cours…" : "Récupérer ma position actuelle"}
      </button>
      <p className="mt-[10px] text-[12.5px] text-muted">
        {erreurGeoloc ? (
          <span className="font-semibold text-red">{erreurGeoloc}</span>
        ) : profil.positionTexte ? (
          <>
            📍 Position enregistrée : <b className="text-ink">{profil.positionTexte}</b>
            {precision !== null && ` (précision ~${precision} m)`} ·{" "}
            <a
              href={lienCarte(profil.positionTexte)}
              target="_blank"
              rel="noopener"
              className="font-bold text-teal"
            >
              Vérifier sur la carte
            </a>
          </>
        ) : (
          "Aucune position enregistrée pour le moment."
        )}
      </p>
      <div className="mt-[14px] grid gap-4">
        <div>
          <label className={labelChamp}>Lien Google Maps (optionnel)</label>
          <input
            className={champ}
            value={estCoordonnees ? "" : localisation}
            onChange={(e) => setLienMapsLocal(e.target.value)}
            onBlur={sauverLienMaps}
          />
        </div>
      </div>
      <div className="mt-[14px] flex items-start gap-[9px] rounded-[11px] bg-teal-soft px-[13px] py-[11px] text-[12.5px] font-semibold leading-relaxed text-blue">
        <span aria-hidden>ℹ️</span>
        <div>
          La position alimente le bouton « Voir l’itinéraire » côté patient : il vise vos
          coordonnées exactes dès qu’elles sont relevées.
        </div>
      </div>
    </>
  );

  return (
    <MedecinShell>
      {/* ===== Version mobile (écran « m-med-profil » de la maquette mobile) ===== */}
      <div className="md:hidden">
        <EnTeteMobile retour="/espace-medecin/compte" titre="Mon profil" />
        <div className="pad">
          <div className="acctop">
            <div>
              <b>{`${medecinConnecte.civilite} ${medecinConnecte.prenom} ${medecinConnecte.nom}`}</b>
              <small>{medecinConnecte.specialite}</small>
            </div>
          </div>
          {bandeauMessage}
          <div style={{ marginBottom: 14 }}>
            <PhotoProfil
              photoUrl={medecinConnecte.photoUrl}
              initiales={medecinConnecte.initiales}
              gradient={medecinConnecte.gradient}
              taille={64}
            />
          </div>

          <div className="card2">
            <h4>👤 Identité et exercice</h4>
            {champsIdentite("m")}
          </div>

          <div className="card2">
            <h4>💰 Tarifs</h4>
            <p className="muted" style={{ fontSize: 11.5, margin: "-4px 0 11px", lineHeight: 1.5 }}>
              Affichés sur votre fiche juste après « À propos ». Le premier sert de tarif de
              référence dans les résultats de recherche.
            </p>
            <GrilleTarifs
              medecinId={medecinConnecte.id}
              mobile
              visiteDomicile={formulaire?.visiteDomicile ?? false}
            />
          </div>

          <div className="card2">
            <h4>🏠 Visites à domicile</h4>
            {carteDomicile("m")}
          </div>

          <div className="card2">
            <h4>📍 Adresse du cabinet</h4>
            {champsLieu("m")}
          </div>

          <div className="card2">
            <h4>🕐 Horaires de consultation</h4>
            {carteHoraires}
          </div>

          <div className="card2">
            <h4>🗺️ Localisation GPS</h4>
            {carteLocalisation}
          </div>

          <div className="card2">
            <h4>📄 Documents de validation</h4>
            <label className="uploadzone" style={{ cursor: "pointer" }}>
              <span className="ic" aria-hidden>
                ⬆️
              </span>
              <span>
                <b style={{ fontSize: 12.5 }}>Charger un document</b>
                <span className="muted" style={{ display: "block", fontSize: 11 }}>
                  Autorisation d&apos;exercice, diplôme, carte de l&apos;ordre, pièce d&apos;identité.
                </span>
              </span>
              <input
                type="file"
                accept=".pdf,image/*"
                style={{ display: "none" }}
                onChange={(e) => {
                  ajouterFichier(e.target.files);
                  e.target.value = "";
                }}
              />
            </label>
            {erreurDoc && (
              <p className="text-[12px] font-semibold text-red" style={{ marginTop: 6 }}>
                {erreurDoc}
              </p>
            )}
            {profil.documents.map((document, i) => (
              <div key={`${document.nom}-${i}`} className="docrow">
                <span aria-hidden>📄</span>
                <span className="nm">{document.nom}</span>
                <span
                  className="st"
                  style={
                    document.statut === "Validé"
                      ? { background: "var(--green-soft)", color: "var(--green)" }
                      : undefined
                  }
                >
                  {document.statut}
                </span>
              </div>
            ))}
            <div className="privnote">
              <span aria-hidden>🔒</span>
              <div>
                <b>Privé.</b> Visibles uniquement par l&apos;administrateur lors de la validation.
                Jamais affichés aux patients.
              </div>
            </div>
          </div>

          <div className="card2">
            <h4>🩺 Soins et actes</h4>
            <div className="chips">
              {profil.soins.map((soin) => (
                <button
                  key={soin}
                  type="button"
                  className="chip grey"
                  title="Retirer"
                  onClick={() => retirerElement("soins", soin)}
                >
                  {soin} ✕
                </button>
              ))}
              <button
                type="button"
                className="chip"
                onClick={() => ajouterElement("soins", "Nom du soin ou de l'acte à ajouter :")}
              >
                + Ajouter
              </button>
            </div>
          </div>

          <div className="card2">
            <h4>🎓 Diplôme et formation</h4>
            {profil.diplomes.length === 0 && (
              <p className="muted" style={{ fontSize: 12.5 }}>
                Aucun diplôme renseigné.
              </p>
            )}
            {profil.diplomes.map((diplome, index) => (
              <div key={`${diplome.titre}-${index}`} className="docrow">
                <span aria-hidden>🎓</span>
                <span className="nm">
                  {diplome.titre}
                  {diplome.lieu ? ` · ${diplome.lieu}` : ""}
                </span>
                <button
                  type="button"
                  className="chip"
                  onClick={() => retirerDiplome(index)}
                  aria-label={`Retirer le diplôme ${diplome.titre}`}
                >
                  Retirer
                </button>
              </div>
            ))}
            <button type="button" className="chip" onClick={ajouterDiplome} style={{ marginTop: 8 }}>
              + Ajouter un diplôme
            </button>
          </div>

          <div className="card2">
            <h4>💼 Parcours professionnel</h4>
            {profil.parcours.length === 0 && (
              <p className="muted" style={{ fontSize: 12.5 }}>
                Aucune étape renseignée.
              </p>
            )}
            {profil.parcours.map((etape, index) => (
              <div key={`${etape.lieu}-${index}`} className="docrow">
                <span aria-hidden>🏥</span>
                <span className="nm">
                  {etape.lieu}
                  {etape.duree ? ` · ${etape.duree}` : ""}
                </span>
                <button
                  type="button"
                  className="chip"
                  onClick={() => retirerEtape(index)}
                  aria-label={`Retirer l’étape ${etape.lieu}`}
                >
                  Retirer
                </button>
              </div>
            ))}
            <button type="button" className="chip" onClick={ajouterEtape} style={{ marginTop: 8 }}>
              + Ajouter une étape
            </button>
          </div>

          <div className="card2">
            <h4>🗣️ Langues parlées</h4>
            <div className="chips">
              {profil.langues.map((langue) => (
                <button
                  key={langue}
                  type="button"
                  className="chip grey"
                  title="Retirer"
                  onClick={() => retirerElement("langues", langue)}
                >
                  {langue} ✕
                </button>
              ))}
              <button type="button" className="chip" onClick={() => ajouterElement("langues", "Langue à ajouter :")}>
                + Ajouter
              </button>
            </div>
          </div>

          <div className="card2">
            <h4>👤 Sexe</h4>
            <p className="muted" style={{ fontSize: 11.5, margin: "-4px 0 11px" }}>
              Alimente un filtre de recherche. Vous pouvez ne pas le préciser.
            </p>
            <div className="chips">
              {[
                { valeur: "femme", label: "Femme" },
                { valeur: "homme", label: "Homme" },
                { valeur: "", label: "Ne pas préciser" },
              ].map((o) => {
                const actif = (genreLocal ?? medecinConnecte.genre ?? "") === o.valeur;
                return (
                  <button
                    key={o.valeur || "non-precise"}
                    type="button"
                    className={`chip${actif ? "" : " grey"}`}
                    onClick={async () => {
                      setGenreLocal(o.valeur);
                      signaler(await enregistrerProfilMedecin({ genre: o.valeur }));
                    }}
                  >
                    {o.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="card2">
            <h4>💳 Assurances acceptées</h4>
            <p className="muted" style={{ fontSize: 11.5, margin: "-4px 0 11px" }}>
              Parmi les assurances référencées par la plateforme.
            </p>
            <div className="chips">
              {ASSURANCES_REFERENCEES.map((assurance) => {
                const active = profil.assurances.includes(assurance);
                return (
                  <button
                    key={assurance}
                    type="button"
                    className={`chip${active ? " on" : ""}`}
                    onClick={() => basculerAssurance(assurance)}
                  >
                    {assurance}
                    {active ? " ✓" : ""}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="card2">
            <h4>🖼️ Photos du cabinet</h4>
            <GaleriePhotos proprietaireId={medecinConnecte.id} type="medecin" mobile />
          </div>
          <p className="muted" style={{ fontSize: 11.5, textAlign: "center" }}>
            ✓ Modifications enregistrées automatiquement
          </p>
        </div>
      </div>

      {/* ===== Version web ===== */}
      <div className="hidden md:block">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-[21px] font-extrabold tracking-[-0.3px]">Mon profil</h2>
            <small className="text-[13px] text-muted">
              Informations affichées aux patients — tout ce que vous avez saisi à l’inscription se
              corrige ici.
            </small>
          </div>
          <span className="text-[12.5px] font-bold text-green">
            ✓ Modifications enregistrées automatiquement
          </span>
        </div>

        {bandeauMessage}

        {/* Identité */}
        <div className="mb-4 rounded-2xl border border-line bg-white p-5">
          <div className="mb-5">
            <b className="block text-base font-extrabold">{`${medecinConnecte.civilite} ${medecinConnecte.prenom} ${medecinConnecte.nom}`}</b>
            <div className="mb-3 text-[12.5px] text-muted">{medecinConnecte.specialite}</div>
            <PhotoProfil
              photoUrl={medecinConnecte.photoUrl}
              initiales={medecinConnecte.initiales}
              gradient={medecinConnecte.gradient}
            />
          </div>
          {champsIdentite("w")}
        </div>

        {/* Tarifs */}
        <div className="mb-4 rounded-2xl border border-line bg-white p-5">
          <h3 className="mb-1 text-[15px] font-extrabold">💰 Tarifs</h3>
          <p className="mb-3 text-[12.5px] text-muted">
            Affichés sur votre fiche juste après « À propos ». La première ligne sert de tarif de
            référence : c’est elle qui apparaît sur les cartes de résultat et dans le panneau de
            réservation.
          </p>
          <GrilleTarifs
            medecinId={medecinConnecte.id}
            visiteDomicile={formulaire?.visiteDomicile ?? false}
          />
        </div>

        {/* Visites à domicile */}
        <div className="mb-4 rounded-2xl border border-line bg-white p-5">
          <h3 className="mb-2 text-[15px] font-extrabold">🏠 Visites à domicile</h3>
          {carteDomicile("w")}
        </div>

        {/* Adresse */}
        <div className="mb-4 rounded-2xl border border-line bg-white p-5">
          <h3 className="mb-3 text-[15px] font-extrabold">📍 Adresse du cabinet</h3>
          {champsLieu("w")}
        </div>

        {/* Horaires */}
        <div className="mb-4 rounded-2xl border border-line bg-white p-5">
          <h3 className="mb-1 text-[15px] font-extrabold">🕐 Horaires de consultation</h3>
          {carteHoraires}
        </div>

        {/* Localisation */}
        <div className="mb-4 rounded-2xl border border-line bg-white p-5">
          <h3 className="mb-2 text-[15px] font-extrabold">🗺️ Localisation GPS du cabinet</h3>
          {carteLocalisation}
        </div>

        {/* Documents de validation */}
        <div className="mb-4 rounded-2xl border border-line bg-white p-5">
          <h3 className="mb-3 text-[15px] font-extrabold">📄 Documents de validation</h3>
          <label className="flex cursor-pointer items-center gap-[14px] rounded-[14px] border-[1.5px] border-dashed border-[#BCD3E0] bg-[#F6FAFC] p-4">
            <span className="text-2xl" aria-hidden>
              ⬆️
            </span>
            <span className="flex-1">
              <b className="block text-[13.5px]">Charger un document</b>
              <span className="text-xs text-muted">
                Autorisation d’exercice, diplôme, carte de l’ordre, pièce d’identité — PDF ou image.
              </span>
            </span>
            <span className="rounded-[9px] border-[1.5px] border-line bg-white px-3 py-1.5 text-[11.5px] font-bold text-blue">
              Parcourir
            </span>
            <input
              type="file"
              accept=".pdf,image/*"
              className="hidden"
              onChange={(e) => {
                ajouterFichier(e.target.files);
                e.target.value = "";
              }}
            />
          </label>
          {erreurDoc && <p className="mt-2 text-[12.5px] font-semibold text-red">{erreurDoc}</p>}
          {profil.documents.map((document, i) => (
            <div
              key={`${document.nom}-${i}`}
              className="mt-[10px] flex items-center gap-[11px] rounded-[11px] border border-line px-[13px] py-[11px] text-[13px]"
            >
              <span aria-hidden>📄</span>
              <span className="font-bold">{document.nom}</span>
              <span
                className={`ml-auto flex-none rounded-full px-[10px] py-1 text-[11px] font-extrabold ${
                  document.statut === "Validé"
                    ? "bg-green-soft text-green"
                    : "bg-amber-soft text-amber"
                }`}
              >
                {document.statut}
              </span>
            </div>
          ))}
          <div className="mt-[14px] flex items-start gap-[9px] rounded-[11px] bg-amber-soft px-[13px] py-[11px] text-[12.5px] font-semibold leading-relaxed text-[#7A5320]">
            <span aria-hidden>🔒</span>
            <div>
              <b>Privé.</b> Ces documents sont visibles uniquement par l’administrateur lors de la
              validation. Ils ne sont jamais affichés aux patients.
            </div>
          </div>
        </div>

        {/* Soins et actes */}
        <div className="mb-4 rounded-2xl border border-line bg-white p-5">
          <h3 className="mb-3 text-[15px] font-extrabold">🩺 Soins et actes proposés</h3>
          <div className="flex flex-wrap gap-2">
            {profil.soins.map((soin) => (
              <button
                key={soin}
                type="button"
                title="Retirer"
                onClick={() => retirerElement("soins", soin)}
                className="rounded-full border border-[#DCE4EA] bg-[#EEF2F5] px-[14px] py-2 text-xs font-bold text-[#3A4A55] hover:border-red"
              >
                {soin} ✕
              </button>
            ))}
            <button
              type="button"
              onClick={() => ajouterElement("soins", "Nom du soin ou de l'acte à ajouter :")}
              className="rounded-full border border-[#CDE6F2] bg-teal-soft px-[14px] py-2 text-xs font-bold text-blue"
            >
              + Ajouter
            </button>
          </div>
        </div>

        {/* Diplôme et formation */}
        <div className="mb-4 rounded-2xl border border-line bg-white p-5">
          <h3 className="mb-3 text-[15px] font-extrabold">🎓 Diplôme et formation</h3>
          <div className="mb-3 flex flex-col gap-2">
            {profil.diplomes.length === 0 && (
              <p className="text-[12.5px] text-muted">
                Aucun diplôme renseigné — il apparaîtra sur votre fiche publique.
              </p>
            )}
            {profil.diplomes.map((diplome, index) => (
              <div
                key={`${diplome.titre}-${index}`}
                className="flex items-center gap-[11px] rounded-[11px] border border-line px-[13px] py-[11px] text-[13px]"
              >
                <span aria-hidden>🎓</span>
                <span className="min-w-0 flex-1 font-bold">
                  {diplome.titre}
                  <small className="block text-xs font-semibold text-muted">{diplome.lieu}</small>
                </span>
                <button
                  type="button"
                  onClick={() => retirerDiplome(index)}
                  aria-label={`Retirer le diplôme ${diplome.titre}`}
                  className="text-xs font-bold text-red hover:underline"
                >
                  Retirer
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={ajouterDiplome}
            className="rounded-full border border-[#CDE6F2] bg-teal-soft px-[14px] py-2 text-xs font-bold text-blue"
          >
            + Ajouter un diplôme
          </button>
        </div>

        {/* Parcours professionnel */}
        <div className="mb-4 rounded-2xl border border-line bg-white p-5">
          <h3 className="mb-3 text-[15px] font-extrabold">💼 Parcours professionnel</h3>
          <div className="mb-3 flex flex-col gap-2">
            {profil.parcours.length === 0 && (
              <p className="text-[12.5px] text-muted">
                Aucune étape renseignée — elle apparaîtra sur votre fiche publique.
              </p>
            )}
            {profil.parcours.map((etape, index) => (
              <div
                key={`${etape.lieu}-${index}`}
                className="flex items-center gap-[11px] rounded-[11px] border border-line px-[13px] py-[11px] text-[13px]"
              >
                <span aria-hidden>🏥</span>
                <span className="min-w-0 flex-1 font-bold">
                  {etape.lieu}
                  <small className="block text-xs font-semibold text-muted">{etape.duree}</small>
                </span>
                <button
                  type="button"
                  onClick={() => retirerEtape(index)}
                  aria-label={`Retirer l’étape ${etape.lieu}`}
                  className="text-xs font-bold text-red hover:underline"
                >
                  Retirer
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={ajouterEtape}
            className="rounded-full border border-[#CDE6F2] bg-teal-soft px-[14px] py-2 text-xs font-bold text-blue"
          >
            + Ajouter une étape
          </button>
        </div>

        {/* Langues */}
        <div className="mb-4 rounded-2xl border border-line bg-white p-5">
          <h3 className="mb-3 text-[15px] font-extrabold">🗣️ Langues parlées</h3>
          <div className="flex flex-wrap gap-2">
            {profil.langues.map((langue) => (
              <button
                key={langue}
                type="button"
                title="Retirer"
                onClick={() => retirerElement("langues", langue)}
                className="rounded-full border border-[#DCE4EA] bg-[#EEF2F5] px-[14px] py-2 text-xs font-bold text-[#3A4A55] hover:border-red"
              >
                {langue} ✕
              </button>
            ))}
            <button
              type="button"
              onClick={() => ajouterElement("langues", "Langue à ajouter :")}
              className="rounded-full border border-[#CDE6F2] bg-teal-soft px-[14px] py-2 text-xs font-bold text-blue"
            >
              + Ajouter
            </button>
          </div>
        </div>

        {/* Genre — alimente le filtre « Sexe » de la recherche patient */}
        <div className="mb-4 rounded-2xl border border-line bg-white p-5">
          <h3 className="mb-2 text-[15px] font-extrabold">👤 Sexe</h3>
          <p className="mb-3 text-[12.5px] text-muted">
            Certains patients préfèrent consulter une femme ou un homme. Cette information alimente
            un filtre de recherche ; vous pouvez ne pas la préciser.
          </p>
          <div className="flex flex-wrap gap-2">
            {[
              { valeur: "femme", label: "Femme" },
              { valeur: "homme", label: "Homme" },
              { valeur: "", label: "Ne pas préciser" },
            ].map((o) => {
              const actif = (genreLocal ?? medecinConnecte.genre ?? "") === o.valeur;
              return (
                <button
                  key={o.valeur || "non-precise"}
                  type="button"
                  onClick={async () => {
                    setGenreLocal(o.valeur);
                    signaler(await enregistrerProfilMedecin({ genre: o.valeur }));
                  }}
                  className={`rounded-full border px-[14px] py-2 text-xs font-bold transition-colors ${
                    actif
                      ? "border-teal bg-teal-soft text-blue"
                      : "border-[#DCE4EA] bg-[#EEF2F5] text-[#3A4A55] hover:border-teal"
                  }`}
                >
                  {o.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Assurances */}
        <div className="mb-4 rounded-2xl border border-line bg-white p-5">
          <h3 className="mb-2 text-[15px] font-extrabold">💳 Assurances acceptées</h3>
          <p className="mb-3 text-[12.5px] text-muted">
            Sélectionnez parmi les assurances référencées par la plateforme.
          </p>
          <div className="flex flex-wrap gap-2">
            {ASSURANCES_REFERENCEES.map((assurance) => {
              const active = profil.assurances.includes(assurance);
              return (
                <button
                  key={assurance}
                  type="button"
                  onClick={() => basculerAssurance(assurance)}
                  className={`rounded-full border px-[14px] py-2 text-xs font-bold ${
                    active
                      ? "border-[#BFE3CC] bg-green-soft text-green"
                      : "border-[#CDE6F2] bg-teal-soft text-blue"
                  }`}
                >
                  {assurance}
                  {active ? " ✓" : ""}
                </button>
              );
            })}
          </div>
        </div>

        {/* Photos */}
        <div className="rounded-2xl border border-line bg-white p-5">
          <h3 className="mb-1 text-[15px] font-extrabold">🖼️ Photos du cabinet</h3>
          <GaleriePhotos proprietaireId={medecinConnecte.id} type="medecin" />
        </div>
      </div>
    </MedecinShell>
  );
}
