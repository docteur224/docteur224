"use client";

import { useEffect, useState } from "react";
import MedecinShell from "@/components/medecin/MedecinShell";
import EnTeteMobile from "@/components/mobile/EnTeteMobile";
import PhotoProfil from "@/components/pro/PhotoProfil";
import GaleriePhotos from "@/components/pro/GaleriePhotos";
import { formatGNF } from "@/lib/format";
import { chargerEtablissementParId } from "@/lib/donnees";
import type { Etablissement } from "@/types";
import {
  enregistrerProfilMedecin,
  televerserDocumentValidation,
  useAssurancesMedecin,
  useContextePro,
  useDocumentsValidation,
} from "@/lib/pro";

/*
 * Mon profil (médecin) — reproduit l'écran « med-profil » de la maquette web
 * (spec C.4.5) : identité, localisation (géolocalisation navigateur + repli
 * lien Google Maps), documents de validation privés (Storage + table
 * documents_validation), soins et actes, langues, assurances — tout est
 * écrit dans la table `medecins`.
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
  anneesExperience: 0,
  tarifConsultation: 0,
  telephoneSecretariat: "",
  aPropos: "",
  soinsEtActes: [] as string[],
  diplomes: [] as { titre: string; lieu: string }[],
  parcours: [] as { lieu: string; duree: string }[],
  langues: [] as string[],
};

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

  // Surcharges locales (affichage immédiat) au-dessus du profil chargé
  const [soinsLocaux, setSoinsLocaux] = useState<string[] | null>(null);
  const [languesLocales, setLanguesLocales] = useState<string[] | null>(null);
  const [diplomesLocaux, setDiplomesLocaux] = useState<{ titre: string; lieu: string }[] | null>(null);
  const [parcoursLocal, setParcoursLocal] = useState<{ lieu: string; duree: string }[] | null>(null);
  const [genreLocal, setGenreLocal] = useState<string | null>(null);
  const [lienMapsLocal, setLienMapsLocal] = useState<string | null>(null);
  const [geolocEnCours, setGeolocEnCours] = useState(false);
  const [erreurGeoloc, setErreurGeoloc] = useState("");
  const [erreurDoc, setErreurDoc] = useState("");

  const localisation = lienMapsLocal ?? (medecin as { localisation?: string } | null)?.localisation ?? "";
  const estCoordonnees = /^-?\d+\.\d+,\s*-?\d+\.\d+$/.test(localisation.trim());
  const profil = {
    soins: soinsLocaux ?? medecinConnecte.soinsEtActes,
    langues: languesLocales ?? medecinConnecte.langues,
    diplomes: diplomesLocaux ?? medecinConnecte.diplomes,
    parcours: parcoursLocal ?? medecinConnecte.parcours,
    lienMaps: estCoordonnees ? "" : localisation,
    positionTexte: estCoordonnees ? localisation : "",
    documents: docsBase.map((d) => ({
      nom: d.fichier.split("/").pop() ?? d.type,
      statut: LIBELLES_STATUT_DOC[d.statut] ?? d.statut,
    })),
    assurances: referentiel.filter((a) => actives.has(a.id)).map((a) => a.libelle),
  };
  const ASSURANCES_REFERENCEES = referentiel.map((a) => a.libelle);

  function recupererPosition() {
    setErreurGeoloc("");
    if (!navigator.geolocation) {
      setErreurGeoloc("Géolocalisation non disponible — collez un lien Google Maps ci-dessous.");
      return;
    }
    setGeolocEnCours(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const lat = position.coords.latitude.toFixed(5);
        const lon = position.coords.longitude.toFixed(5);
        setLienMapsLocal(`${lat}, ${lon}`);
        await enregistrerProfilMedecin({ lienMaps: `${lat}, ${lon}` });
        setGeolocEnCours(false);
      },
      () => {
        setErreurGeoloc(
          "Autorisation refusée ou indisponible — collez un lien Google Maps ci-dessous."
        );
        setGeolocEnCours(false);
      }
    );
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
      await enregistrerProfilMedecin({ soins: nouvelle });
    } else {
      setLanguesLocales(nouvelle);
      await enregistrerProfilMedecin({ langues: nouvelle });
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
    await enregistrerProfilMedecin({ diplomes: nouvelle });
  }

  async function retirerDiplome(index: number) {
    const nouvelle = profil.diplomes.filter((_, i) => i !== index);
    setDiplomesLocaux(nouvelle);
    await enregistrerProfilMedecin({ diplomes: nouvelle });
  }

  async function ajouterEtape() {
    const lieu = window.prompt("Établissement ou service :")?.trim();
    if (!lieu) return;
    const duree = window.prompt("Période (ex. 2018 – 2024) :")?.trim() ?? "";
    const nouvelle = [...profil.parcours, { lieu, duree }];
    setParcoursLocal(nouvelle);
    await enregistrerProfilMedecin({ parcours: nouvelle });
  }

  async function retirerEtape(index: number) {
    const nouvelle = profil.parcours.filter((_, i) => i !== index);
    setParcoursLocal(nouvelle);
    await enregistrerProfilMedecin({ parcours: nouvelle });
  }

  async function basculerAssurance(nom: string) {
    const assurance = referentiel.find((a) => a.libelle === nom);
    if (!assurance) return;
    await basculer(assurance.id, !actives.has(assurance.id));
  }

  async function changerLienMaps(valeur: string) {
    setLienMapsLocal(valeur);
  }

  async function sauverLienMaps() {
    await enregistrerProfilMedecin({ lienMaps: localisation });
  }

  const champStatique = "rounded-[11px] border border-line bg-white px-[13px] py-3 text-[13.5px]";
  const labelChamp = "mb-1.5 block text-xs font-bold text-muted";

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
          <div style={{ marginBottom: 14 }}>
            <PhotoProfil
              photoUrl={medecinConnecte.photoUrl}
              initiales={medecinConnecte.initiales}
              gradient={medecinConnecte.gradient}
              taille={64}
            />
          </div>
          <div className="fldm">
            <label>Spécialité</label>
            <div className="v">{medecinConnecte.specialite}</div>
          </div>
          <div className="fldm">
            <label>Établissement</label>
            <div className="v">{etab?.nom}</div>
          </div>
          <div className="fldm">
            <label>Adresse du cabinet</label>
            <div className="v">
              Quartier {etab?.quartier} · {etab?.ville}
            </div>
          </div>
          <div className="fldm">
            <label>Téléphone</label>
            <div className="v">{medecinConnecte.telephoneSecretariat}</div>
          </div>
          <div className="fldm">
            <label>Tarif de consultation</label>
            <div className="v">{formatGNF(medecinConnecte.tarifConsultation)}</div>
          </div>
          <div className="fldm">
            <label>Présentation</label>
            <div className="v">{medecinConnecte.aPropos}</div>
          </div>

          <div className="card2">
            <h4>📍 Localisation du cabinet</h4>
            <p className="muted" style={{ fontSize: 11.5, margin: "-4px 0 11px", lineHeight: 1.5 }}>
              Récupérez votre position depuis votre établissement, ou collez un lien Google Maps.
            </p>
            <button type="button" className="posbtn" onClick={recupererPosition} disabled={geolocEnCours}>
              🎯 {geolocEnCours ? "Localisation en cours…" : "Récupérer ma position actuelle"}
            </button>
            <div className="poscoord">
              {erreurGeoloc ||
                (profil.positionTexte ? (
                  <>
                    📍 Position enregistrée : <b style={{ color: "var(--ink)" }}>{profil.positionTexte}</b> ·{" "}
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(profil.positionTexte)}`}
                      target="_blank"
                      rel="noopener"
                      style={{ color: "var(--teal)", fontWeight: 700 }}
                    >
                      Vérifier sur la carte
                    </a>
                  </>
                ) : (
                  "Aucune position enregistrée pour le moment."
                ))}
            </div>
            <div className="fldm" style={{ marginTop: 12 }}>
              <label>Lien Google Maps (optionnel)</label>
              <input
                className="v"
                value={estCoordonnees ? "" : localisation}
                onChange={(e) => changerLienMaps(e.target.value)}
                onBlur={sauverLienMaps}
              />
            </div>
            <div className="fldm">
              <label>Adresse affichée aux patients</label>
              <div className="v">
                Quartier {etab?.quartier} · {etab?.ville}
              </div>
            </div>
            <div className="privnote info">
              <span aria-hidden>ℹ️</span>
              <div>
                La position alimente le bouton « Voir l&apos;itinéraire » côté patient.
              </div>
            </div>
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
                <span key={soin} className="chip grey">
                  {soin}
                </span>
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
                <span key={langue} className="chip grey">
                  {langue}
                </span>
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
                      await enregistrerProfilMedecin({ genre: o.valeur });
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

      {/* ===== Version web (inchangée) ===== */}
      <div className="hidden md:block">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-[21px] font-extrabold tracking-[-0.3px]">Mon profil</h2>
          <small className="text-[13px] text-muted">Informations affichées aux patients</small>
        </div>
        <span className="text-[12.5px] font-bold text-green">
          ✓ Modifications enregistrées automatiquement
        </span>
      </div>

      {/* Identité */}
      <div className="mb-4 rounded-2xl border border-line bg-white p-5">
        <div className="mb-5">
          <b className="block text-base font-extrabold">{`${medecinConnecte.civilite} ${medecinConnecte.prenom} ${medecinConnecte.nom}`}</b>
          <div className="mb-3 text-[12.5px] text-muted">
            {medecinConnecte.specialite} · Profil vérifié ✔
          </div>
          <PhotoProfil
            photoUrl={medecinConnecte.photoUrl}
            initiales={medecinConnecte.initiales}
            gradient={medecinConnecte.gradient}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={labelChamp}>Prénom</label>
            <div className={champStatique}>{medecinConnecte.prenom}</div>
          </div>
          <div>
            <label className={labelChamp}>Nom</label>
            <div className={champStatique}>{medecinConnecte.nom}</div>
          </div>
          <div>
            <label className={labelChamp}>Spécialité</label>
            <div className={champStatique}>{medecinConnecte.specialite}</div>
          </div>
          <div>
            <label className={labelChamp}>Années d’expérience</label>
            <div className={champStatique}>{medecinConnecte.anneesExperience} ans</div>
          </div>
          <div>
            <label className={labelChamp}>Établissement</label>
            <div className={champStatique}>{etab?.nom}</div>
          </div>
          <div>
            <label className={labelChamp}>Ville</label>
            <div className={champStatique}>{medecinConnecte.ville}</div>
          </div>
          <div className="sm:col-span-2">
            <label className={labelChamp}>Adresse du cabinet</label>
            <div className={champStatique}>
              Quartier {etab?.quartier} · {etab?.ville}
            </div>
          </div>
          <div>
            <label className={labelChamp}>Téléphone</label>
            <div className={champStatique}>{medecinConnecte.telephoneSecretariat}</div>
          </div>
          <div>
            <label className={labelChamp}>Tarif de consultation</label>
            <div className={champStatique}>{formatGNF(medecinConnecte.tarifConsultation)}</div>
          </div>
          <div className="sm:col-span-2">
            <label className={labelChamp}>Présentation</label>
            <div className={`${champStatique} min-h-[60px]`}>{medecinConnecte.aPropos}</div>
          </div>
        </div>
      </div>

      {/* Localisation */}
      <div className="mb-4 rounded-2xl border border-line bg-white p-5">
        <h3 className="mb-2 text-[15px] font-extrabold">📍 Localisation du cabinet</h3>
        <p className="mb-3 text-[12.5px] text-muted">
          Récupérez votre position pendant que vous êtes dans votre établissement, ou collez un
          lien Google Maps.
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
          {erreurGeoloc ||
            (profil.positionTexte ? (
              <>
                📍 Position enregistrée : <b className="text-ink">{profil.positionTexte}</b> ·{" "}
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(profil.positionTexte)}`}
                  target="_blank"
                  rel="noopener"
                  className="font-bold text-teal"
                >
                  Vérifier sur la carte
                </a>
              </>
            ) : (
              "Aucune position enregistrée pour le moment."
            ))}
        </p>
        <div className="mt-[14px] grid gap-4">
          <div>
            <label className={labelChamp}>Lien Google Maps (optionnel)</label>
            <input
              value={estCoordonnees ? "" : localisation}
              onChange={(e) => changerLienMaps(e.target.value)}
                onBlur={sauverLienMaps}
              className="w-full rounded-[11px] border border-line bg-white px-[13px] py-3 text-[13.5px] outline-none focus:border-teal"
            />
          </div>
          <div>
            <label className={labelChamp}>Adresse affichée aux patients</label>
            <div className={champStatique}>
              Quartier {etab?.quartier} · {etab?.ville}
            </div>
          </div>
        </div>
        <div className="mt-[14px] flex items-start gap-[9px] rounded-[11px] bg-teal-soft px-[13px] py-[11px] text-[12.5px] font-semibold leading-relaxed text-blue">
          <span aria-hidden>ℹ️</span>
          <div>
            La position alimente le bouton « Voir l’itinéraire » côté patient. Vous pourrez
            ajuster le repère sur une vraie carte quand la cartographie sera branchée.
          </div>
        </div>
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
            <span
              key={soin}
              className="rounded-full border border-[#DCE4EA] bg-[#EEF2F5] px-[14px] py-2 text-xs font-bold text-[#3A4A55]"
            >
              {soin}
            </span>
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
            <span
              key={langue}
              className="rounded-full border border-[#DCE4EA] bg-[#EEF2F5] px-[14px] py-2 text-xs font-bold text-[#3A4A55]"
            >
              {langue}
            </span>
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
          Certains patients préfèrent consulter une femme ou un homme. Cette
          information alimente un filtre de recherche ; vous pouvez ne pas la préciser.
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
                  await enregistrerProfilMedecin({ genre: o.valeur });
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
