"use client";

import { useState } from "react";
import MedecinShell from "@/components/medecin/MedecinShell";
import { formatGNF } from "@/lib/format";
import { getEtablissement, medecinConnecte, nomComplet } from "@/lib/mock-data";
import {
  ASSURANCES_REFERENCEES,
  enregistrerProfilMedecin,
  useProfilMedecin,
} from "@/lib/mock-medecin";

/*
 * Mon profil (médecin) — reproduit l'écran « med-profil » de la maquette web
 * (spec C.4.5) : identité, localisation (géolocalisation navigateur + repli
 * lien Google Maps), documents de validation privés, soins et actes,
 * diplômes, parcours, langues, assurances, photos.
 */

const PHOTOS = [
  { emoji: "🛋️", label: "Salle d’attente", fond: "linear-gradient(135deg,#DCE9F0,#C9DDE8)" },
  { emoji: "🛏️", label: "Salle de soins", fond: "linear-gradient(135deg,#E2EEE6,#CDE4D6)" },
  { emoji: "🩺", label: "Consultation", fond: "linear-gradient(135deg,#EAE6F1,#D9D2E8)" },
];

export default function ProfilMedecin() {
  const profil = useProfilMedecin();
  const etab = getEtablissement(medecinConnecte.etablissementId);
  const [geolocEnCours, setGeolocEnCours] = useState(false);
  const [erreurGeoloc, setErreurGeoloc] = useState("");

  function recupererPosition() {
    setErreurGeoloc("");
    if (!navigator.geolocation) {
      setErreurGeoloc("Géolocalisation non disponible — collez un lien Google Maps ci-dessous.");
      return;
    }
    setGeolocEnCours(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude.toFixed(5);
        const lon = position.coords.longitude.toFixed(5);
        enregistrerProfilMedecin({ ...profil, positionTexte: `${lat}, ${lon}` });
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

  function ajouterFichier(fichiers: FileList | null) {
    if (!fichiers || fichiers.length === 0) return;
    enregistrerProfilMedecin({
      ...profil,
      documents: [...profil.documents, { nom: fichiers[0].name, statut: "En vérification" }],
    });
  }

  function ajouterElement(cle: "soins" | "langues", question: string) {
    const valeur = window.prompt(question)?.trim();
    if (!valeur) return;
    enregistrerProfilMedecin({ ...profil, [cle]: [...profil[cle], valeur] });
  }

  function basculerAssurance(nom: string) {
    const actives = profil.assurances.includes(nom)
      ? profil.assurances.filter((a) => a !== nom)
      : [...profil.assurances, nom];
    enregistrerProfilMedecin({ ...profil, assurances: actives });
  }

  const champStatique = "rounded-[11px] border border-line bg-white px-[13px] py-3 text-[13.5px]";
  const labelChamp = "mb-1.5 block text-xs font-bold text-muted";

  return (
    <MedecinShell>
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
        <div className="mb-5 flex items-center gap-4">
          <span
            aria-hidden
            className="grid h-[72px] w-[72px] place-items-center rounded-[20px] text-2xl font-extrabold text-white"
            style={{ background: medecinConnecte.gradient }}
          >
            {medecinConnecte.initiales}
          </span>
          <div>
            <b className="block text-base font-extrabold">{nomComplet(medecinConnecte)}</b>
            <div className="text-[12.5px] text-muted">
              {medecinConnecte.specialite} · Profil vérifié ✔
            </div>
            <button
              type="button"
              disabled
              title="Disponible dans une phase ultérieure"
              className="mt-2 cursor-not-allowed rounded-[9px] border-[1.5px] border-line bg-white px-3 py-1.5 text-[11.5px] font-bold text-blue opacity-50"
            >
              Changer la photo
            </button>
          </div>
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
              value={profil.lienMaps}
              onChange={(e) => enregistrerProfilMedecin({ ...profil, lienMaps: e.target.value })}
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
            validation. Ils ne sont jamais affichés aux patients. (Mode démonstration : seul le
            nom du fichier est conservé — le téléversement réel arrivera avec le stockage.)
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
        {medecinConnecte.diplomes.map((diplome) => (
          <div
            key={diplome.titre}
            className="flex items-center gap-[11px] rounded-[11px] border border-line px-[13px] py-[11px] text-[13px]"
          >
            <span aria-hidden>🎓</span>
            <span className="font-bold">
              {diplome.titre}
              <small className="block text-xs font-semibold text-muted">{diplome.lieu}</small>
            </span>
          </div>
        ))}
      </div>

      {/* Parcours professionnel */}
      <div className="mb-4 rounded-2xl border border-line bg-white p-5">
        <h3 className="mb-3 text-[15px] font-extrabold">💼 Parcours professionnel</h3>
        {medecinConnecte.parcours.map((etape) => (
          <div
            key={etape.lieu}
            className="flex items-center gap-[11px] rounded-[11px] border border-line px-[13px] py-[11px] text-[13px]"
          >
            <span aria-hidden>🏥</span>
            <span className="font-bold">
              {etape.lieu}
              <small className="block text-xs font-semibold text-muted">{etape.duree}</small>
            </span>
          </div>
        ))}
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
        <h3 className="mb-3 text-[15px] font-extrabold">🖼️ Photos de l’établissement</h3>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(130px,1fr))] gap-3">
          {PHOTOS.map((photo) => (
            <div
              key={photo.label}
              className="relative grid aspect-[4/3] place-items-center overflow-hidden rounded-xl border border-line text-center"
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
          <div
            title="Disponible avec le stockage de fichiers"
            className="grid aspect-[4/3] cursor-not-allowed place-items-center rounded-xl border-[1.5px] border-dashed border-[#BCD3E0] bg-[#F6FAFC] p-2 text-center text-[12.5px] font-extrabold text-teal opacity-60"
          >
            ＋ Ajouter une photo
          </div>
        </div>
      </div>
    </MedecinShell>
  );
}
