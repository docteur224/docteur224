"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import CadreEtape from "@/components/inscription/CadreEtape";
import { useInscription } from "@/components/inscription/ContexteInscription";
import ChampCommune from "@/components/site/ChampCommune";
import ChampTelephoneGN from "@/components/site/ChampTelephoneGN";
import { avancerEtape, enregistrerEtapeLieu } from "@/lib/inscription-pro";
import { creerClientNavigateur } from "@/lib/supabase/client";
import {
  estCoordonnees as sontDesCoordonnees,
  formaterPosition,
  lienCarte,
  recupererPositionActuelle,
} from "@/lib/geolocalisation";
import { MESSAGE_TELEPHONE_GN, chiffresTelephone, telephoneGuineenValide } from "@/lib/telephone";

/*
 * Étape 3 (praticien) — lieu d'exercice : commune, quartier, téléphone du
 * secrétariat et position GPS (géolocalisation navigateur ou lien
 * Google Maps, même mécanique que /espace-medecin/profil).
 *
 * La commune précède la ville, comme sur l'étape « Compte » : c'est
 * l'échelon que tout le monde donne en premier en Guinée. La ville reste
 * en lecture seule — elle a été choisie à la création du compte et sert de
 * clé à la recherche des patients.
 */

const champ =
  "w-full rounded-xl border border-line bg-white p-[13px] text-sm outline-none focus:border-teal";
const etiquette = "mb-1.5 mt-4 block text-[12.5px] font-bold text-ink";

export default function EtapeLieu() {
  const router = useRouter();
  const { etape } = useInscription();

  const [ville, setVille] = useState("");
  const [villeId, setVilleId] = useState<string | undefined>();
  const [commune, setCommune] = useState("");
  const [quartier, setQuartier] = useState("");
  const [telephone, setTelephone] = useState("");
  const [localisation, setLocalisation] = useState("");
  const [precision, setPrecision] = useState<number | null>(null);
  const [geolocEnCours, setGeolocEnCours] = useState(false);
  const [erreurGeoloc, setErreurGeoloc] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  useEffect(() => {
    let actif = true;
    (async () => {
      const supabase = creerClientNavigateur();
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return;
      const { data: m } = await supabase
        .from("medecins")
        .select("commune, quartier, localisation, telephone_secretariat, ville_id, villes ( nom )")
        .eq("id", auth.user.id)
        .maybeSingle();
      if (!actif || !m) return;
      if (m.commune) setCommune(m.commune);
      if (m.quartier) setQuartier(m.quartier);
      if (m.localisation) setLocalisation(m.localisation);
      if (m.telephone_secretariat) setTelephone(chiffresTelephone(m.telephone_secretariat));
      setVilleId(m.ville_id ?? undefined);
      setVille((m.villes as unknown as { nom: string } | null)?.nom ?? "");
    })();
    return () => {
      actif = false;
    };
  }, []);

  const estCoordonnees = sontDesCoordonnees(localisation);

  async function recupererPosition() {
    setErreurGeoloc("");
    setGeolocEnCours(true);
    const { position, erreur: echec } = await recupererPositionActuelle();
    setGeolocEnCours(false);
    if (echec || !position) {
      setPrecision(null);
      return setErreurGeoloc(echec ?? "Localisation impossible pour le moment.");
    }
    setLocalisation(formaterPosition(position));
    setPrecision(position.precision);
  }

  async function continuer() {
    if (enCours) return;
    setErreur(null);
    if (!commune.trim()) return setErreur("Indiquez la commune de votre cabinet.");
    if (!quartier.trim()) return setErreur("Indiquez le quartier de votre cabinet.");
    if (telephone && !telephoneGuineenValide(telephone)) return setErreur(MESSAGE_TELEPHONE_GN);
    setEnCours(true);
    const res = await enregistrerEtapeLieu({
      commune: commune.trim(),
      quartier: quartier.trim(),
      localisation: localisation.trim(),
      telephoneSecretariat: telephone ? `+224${chiffresTelephone(telephone)}` : "",
    });
    let cible = "photos";
    if (!res.erreur) {
      const avancee = await avancerEtape("medecin", null, "photos");
      cible = avancee.cible;
      if (avancee.erreur) res.erreur = avancee.erreur;
    }
    setEnCours(false);
    if (res.erreur) setErreur(res.erreur);
    else router.push(`/inscription/professionnel/etapes/${cible}`);
  }

  return (
    <CadreEtape
      titre="Votre lieu d’exercice"
      sousTitre="Ces informations permettent aux patients de vous trouver et de vous joindre."
      retour="/inscription/professionnel/etapes/profil"
      onContinuer={continuer}
      boutonTexte={etape === "recap" ? "Enregistrer et revenir au récap" : "Continuer"}
      boutonEnCours={enCours}
      erreur={erreur}
    >
      <label className={`${etiquette} mt-0`}>Commune *</label>
      <ChampCommune villeId={villeId} valeur={commune} onChange={setCommune} />

      <label className={etiquette}>Ville</label>
      <div className={`${champ} bg-[#F4F8FA] text-muted`}>{ville || "—"}</div>
      <p className="mt-1.5 text-[11.5px] text-muted">Choisie à la création du compte.</p>

      <label className={etiquette}>Quartier *</label>
      <input
        className={champ}
        placeholder="Ex. Kipé, Nongo, Hamdallaye…"
        value={quartier}
        onChange={(e) => setQuartier(e.target.value)}
      />

      <label className={etiquette}>Téléphone du secrétariat</label>
      <ChampTelephoneGN
        valeur={telephone}
        onChange={setTelephone}
        ariaLabel="Téléphone du secrétariat"
      />

      <div className="mt-5 rounded-xl border border-[#CDE6F2] bg-teal-soft p-4">
        <b className="block text-[13px] text-blue">📍 Position GPS du cabinet</b>
        <p className="mb-3 mt-1 text-[12px] leading-relaxed text-blue">
          Si vous êtes actuellement dans votre cabinet, récupérez votre position en un clic :
          les patients pourront lancer l’itinéraire directement depuis votre fiche.
        </p>
        <button
          type="button"
          onClick={recupererPosition}
          disabled={geolocEnCours}
          className="w-full rounded-[11px] bg-teal px-4 py-3 text-[13px] font-extrabold text-white disabled:opacity-60"
        >
          🎯 {geolocEnCours ? "Localisation en cours…" : "Récupérer ma position actuelle"}
        </button>
        <p className="mt-2 text-[12px] text-muted">
          {erreurGeoloc ? (
            <span className="font-semibold text-red">{erreurGeoloc}</span>
          ) : estCoordonnees ? (
            <>
              📍 Position enregistrée : <b className="text-ink">{localisation}</b>
              {precision !== null && ` (précision ~${precision} m)`} ·{" "}
              <a
                href={lienCarte(localisation)}
                target="_blank"
                rel="noopener"
                className="font-bold text-teal"
              >
                Vérifier sur la carte
              </a>
            </>
          ) : (
            "Aucune position pour le moment — vous pourrez aussi le faire plus tard depuis votre espace."
          )}
        </p>
        <label className={etiquette}>Ou collez un lien Google Maps</label>
        <input
          className={champ}
          placeholder="https://maps.app.goo.gl/…"
          value={estCoordonnees ? "" : localisation}
          onChange={(e) => {
            setLocalisation(e.target.value);
            setPrecision(null);
          }}
        />
        {estCoordonnees && (
          <button
            type="button"
            onClick={() => {
              setLocalisation("");
              setPrecision(null);
            }}
            className="mt-2 text-[11.5px] font-bold text-blue underline underline-offset-2"
          >
            Effacer la position enregistrée
          </button>
        )}
      </div>
    </CadreEtape>
  );
}
