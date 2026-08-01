"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import CadreEtape from "@/components/inscription/CadreEtape";
import { useInscription } from "@/components/inscription/ContexteInscription";
import { avancerEtape, enregistrerEtapeFiche } from "@/lib/inscription-pro";
import { creerClientNavigateur } from "@/lib/supabase/client";

/*
 * Étape 2 (établissement) — fiche publique : description, adresse,
 * quartier, contacts, services proposés. Écrit dans `etablissements`
 * (la ligne créée à l'étape Compte), réaffiché ensuite dans
 * /espace-etablissement/informations.
 */

const SERVICES_SUGGERES = [
  "Consultations",
  "Urgences",
  "Laboratoire",
  "Imagerie médicale",
  "Maternité",
  "Chirurgie",
  "Pharmacie",
  "Hospitalisation",
  "Vaccination",
];

const champ =
  "w-full rounded-xl border border-line bg-white p-[13px] text-sm outline-none focus:border-teal";
const etiquette = "mb-1.5 mt-4 block text-[12.5px] font-bold text-ink";

export default function EtapeFiche() {
  const router = useRouter();
  const { etabId, etape } = useInscription();

  const [nom, setNom] = useState("");
  const [type, setType] = useState("");
  const [description, setDescription] = useState("");
  const [adresse, setAdresse] = useState("");
  const [quartier, setQuartier] = useState("");
  const [telephone, setTelephone] = useState("");
  const [email, setEmail] = useState("");
  const [services, setServices] = useState<string[]>([]);
  const [autreService, setAutreService] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  useEffect(() => {
    if (!etabId) return;
    let actif = true;
    (async () => {
      const { data: e } = await creerClientNavigateur()
        .from("etablissements")
        .select("nom, type, description, adresse, quartier, telephone, email, services")
        .eq("id", etabId)
        .maybeSingle();
      if (!actif || !e) return;
      setNom(e.nom);
      setType(e.type);
      if (e.description) setDescription(e.description);
      if (e.adresse) setAdresse(e.adresse);
      if (e.quartier) setQuartier(e.quartier);
      if (e.telephone) setTelephone(e.telephone);
      if (e.email) setEmail(e.email);
      if (e.services?.length) setServices(e.services);
    })();
    return () => {
      actif = false;
    };
  }, [etabId]);

  function basculerService(service: string) {
    setServices((s) => (s.includes(service) ? s.filter((x) => x !== service) : [...s, service]));
  }

  function ajouterAutreService() {
    const valeur = autreService.trim();
    if (!valeur || services.includes(valeur)) return;
    setServices((s) => [...s, valeur]);
    setAutreService("");
  }

  async function continuer() {
    if (enCours || !etabId) return;
    setErreur(null);
    if (!adresse.trim()) return setErreur("Indiquez l’adresse de l’établissement.");
    if (!quartier.trim()) return setErreur("Indiquez le quartier.");
    setEnCours(true);
    const res = await enregistrerEtapeFiche(etabId, {
      description: description.trim(),
      adresse: adresse.trim(),
      quartier: quartier.trim(),
      telephone: telephone.trim(),
      email: email.trim(),
      services,
    });
    let cible = "documents";
    if (!res.erreur) {
      const avancee = await avancerEtape("etablissement", etabId, "documents");
      cible = avancee.cible;
      if (avancee.erreur) res.erreur = avancee.erreur;
    }
    setEnCours(false);
    if (res.erreur) setErreur(res.erreur);
    else router.push(`/inscription/professionnel/etapes/${cible}`);
  }

  return (
    <CadreEtape
      titre="Fiche de votre établissement"
      sousTitre="Ces informations composent votre fiche publique visible par les patients."
      progression={2 / 5}
      onContinuer={continuer}
      boutonTexte={etape === "recap" ? "Enregistrer et revenir au récap" : "Continuer"}
      boutonEnCours={enCours}
      erreur={erreur}
    >
      <label className={`${etiquette} mt-0`}>Établissement</label>
      <div className={`${champ} bg-[#F4F8FA] text-muted`}>
        {nom || "—"} {type && <span>· {type}</span>}
      </div>

      <label className={etiquette}>Description</label>
      <textarea
        className={`${champ} min-h-[90px]`}
        placeholder="Présentez votre établissement, ses équipes et ses équipements…"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />

      <label className={etiquette}>Adresse *</label>
      <input
        className={champ}
        placeholder="Ex. Avenue de la République"
        value={adresse}
        onChange={(e) => setAdresse(e.target.value)}
      />

      <label className={etiquette}>Quartier *</label>
      <input
        className={champ}
        placeholder="Ex. Kaloum"
        value={quartier}
        onChange={(e) => setQuartier(e.target.value)}
      />

      <label className={etiquette}>Téléphone d’accueil</label>
      <input
        className={champ}
        placeholder="+224 6XX XX XX XX"
        value={telephone}
        onChange={(e) => setTelephone(e.target.value)}
      />

      <label className={etiquette}>E-mail de contact</label>
      <input
        className={champ}
        type="email"
        placeholder="contact@etablissement.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />

      <label className={etiquette}>Services proposés</label>
      <div className="flex flex-wrap gap-2">
        {[...new Set([...SERVICES_SUGGERES, ...services])].map((service) => {
          const actif = services.includes(service);
          return (
            <button
              key={service}
              type="button"
              onClick={() => basculerService(service)}
              className={`rounded-full border px-[13px] py-2 text-xs font-bold transition-colors ${
                actif
                  ? "border-teal bg-teal-soft text-blue"
                  : "border-[#DCE4EA] bg-[#EEF2F5] text-[#3A4A55]"
              }`}
            >
              {service}
              {actif ? " ✓" : ""}
            </button>
          );
        })}
      </div>
      <div className="mt-2 flex gap-2">
        <input
          className={champ}
          placeholder="Autre service…"
          value={autreService}
          onChange={(e) => setAutreService(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              ajouterAutreService();
            }
          }}
        />
        <button
          type="button"
          onClick={ajouterAutreService}
          className="flex-none rounded-xl border border-[#CDE6F2] bg-teal-soft px-4 text-[13px] font-bold text-blue"
        >
          + Ajouter
        </button>
      </div>
    </CadreEtape>
  );
}
