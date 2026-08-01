"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import CadreEtape from "@/components/inscription/CadreEtape";
import { useInscription } from "@/components/inscription/ContexteInscription";
import { avancerEtape, enregistrerEtapeLieu } from "@/lib/inscription-pro";
import { creerClientNavigateur } from "@/lib/supabase/client";

/*
 * Étape 3 (praticien) — lieu d'exercice : quartier, téléphone du
 * secrétariat et position GPS (géolocalisation navigateur ou lien
 * Google Maps, même mécanique que /espace-medecin/profil).
 */

const champ =
  "w-full rounded-xl border border-line bg-white p-[13px] text-sm outline-none focus:border-teal";
const etiquette = "mb-1.5 mt-4 block text-[12.5px] font-bold text-ink";

export default function EtapeLieu() {
  const router = useRouter();
  const { etape } = useInscription();

  const [ville, setVille] = useState("");
  const [quartier, setQuartier] = useState("");
  const [telephone, setTelephone] = useState("");
  const [localisation, setLocalisation] = useState("");
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
        .select("quartier, localisation, telephone_secretariat, villes ( nom )")
        .eq("id", auth.user.id)
        .maybeSingle();
      if (!actif || !m) return;
      if (m.quartier) setQuartier(m.quartier);
      if (m.localisation) setLocalisation(m.localisation);
      if (m.telephone_secretariat) setTelephone(m.telephone_secretariat);
      setVille((m.villes as unknown as { nom: string } | null)?.nom ?? "");
    })();
    return () => {
      actif = false;
    };
  }, []);

  const estCoordonnees = /^-?\d+\.\d+,\s*-?\d+\.\d+$/.test(localisation.trim());

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
        setLocalisation(`${lat}, ${lon}`);
        setGeolocEnCours(false);
      },
      () => {
        setErreurGeoloc("Autorisation refusée ou indisponible — collez un lien Google Maps ci-dessous.");
        setGeolocEnCours(false);
      }
    );
  }

  async function continuer() {
    if (enCours) return;
    setErreur(null);
    if (!quartier.trim()) return setErreur("Indiquez le quartier de votre cabinet.");
    setEnCours(true);
    const res = await enregistrerEtapeLieu({
      quartier: quartier.trim(),
      localisation: localisation.trim(),
      telephoneSecretariat: telephone.trim(),
    });
    let cible = "documents";
    if (!res.erreur) {
      const avancee = await avancerEtape("medecin", null, "documents");
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
      progression={3 / 7}
      onContinuer={continuer}
      boutonTexte={etape === "recap" ? "Enregistrer et revenir au récap" : "Continuer"}
      boutonEnCours={enCours}
      erreur={erreur}
    >
      <label className={`${etiquette} mt-0`}>Ville</label>
      <div className={`${champ} bg-[#F4F8FA] text-muted`}>{ville || "—"}</div>
      <p className="mt-1.5 text-[11.5px] text-muted">Choisie à la création du compte.</p>

      <label className={etiquette}>Quartier *</label>
      <input
        className={champ}
        placeholder="Ex. Kaloum, Ratoma…"
        value={quartier}
        onChange={(e) => setQuartier(e.target.value)}
      />

      <label className={etiquette}>Téléphone du secrétariat</label>
      <input
        className={champ}
        placeholder="+224 6XX XX XX XX"
        value={telephone}
        onChange={(e) => setTelephone(e.target.value)}
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
          {erreurGeoloc ||
            (estCoordonnees ? (
              <>
                📍 Position enregistrée : <b className="text-ink">{localisation}</b>
              </>
            ) : (
              "Aucune position pour le moment — vous pourrez aussi le faire plus tard depuis votre espace."
            ))}
        </p>
        <label className={etiquette}>Ou collez un lien Google Maps</label>
        <input
          className={champ}
          placeholder="https://maps.app.goo.gl/…"
          value={estCoordonnees ? "" : localisation}
          onChange={(e) => setLocalisation(e.target.value)}
        />
      </div>
    </CadreEtape>
  );
}
