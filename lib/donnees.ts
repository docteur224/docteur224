import { createClient } from "@supabase/supabase-js";
import type { Etablissement, Medecin } from "@/types";
import { creneauReservable, depuisISO, versISO } from "@/lib/dates";

/*
 * Couche de données publique (remplace lib/mock-data.ts) : lit les vraies
 * tables Supabase (clé anon — RLS n'expose que les profils validés) et les
 * transpose dans les types UI existants pour que les écrans ne changent pas.
 * Utilisable côté serveur comme côté client (aucune session requise).
 */

function clientPublic() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

/** Dégradés d'avatar des maquettes, attribués de façon stable par empreinte. */
const GRADIENTS = [
  "linear-gradient(135deg,#E08E45,#C0392B)",
  "linear-gradient(135deg,#2E9CCA,#15506B)",
  "linear-gradient(135deg,#16A085,#0E6655)",
  "linear-gradient(135deg,#6C5CE7,#341F97)",
  "linear-gradient(135deg,#1E7B45,#15506B)",
  "linear-gradient(135deg,#7A5BB5,#15506B)",
];

function empreinte(texte: string): number {
  let h = 0;
  for (let i = 0; i < texte.length; i++) h = (Math.imul(h, 31) + texte.charCodeAt(i)) | 0;
  return Math.abs(h);
}

const gradientPour = (id: string) => GRADIENTS[empreinte(id) % GRADIENTS.length];

const JOURS_NOMS = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];

interface LigneMedecin {
  id: string;
  civilite: string;
  genre: string | null;
  tarif_consultation: number | null;
  presentation: string | null;
  soins_et_actes: string[];
  diplomes: { titre: string; lieu: string }[];
  parcours: { lieu: string; duree: string }[];
  langues: string[];
  annees_experience: number | null;
  telephone_secretariat: string | null;
  note_moyenne: number;
  nb_avis: number;
  etablissement_id: string | null;
  quartier: string | null;
  utilisateurs: { nom: string | null; prenom: string | null } | null;
  specialites: { nom: string } | null;
  villes: { nom: string } | null;
  medecin_assurances: { assurances: { libelle: string } | null }[];
  horaires_types: { jour_semaine: number; heure_debut: string; heure_fin: string }[];
}

const SELECTION_MEDECIN = `
  id, civilite, genre, tarif_consultation, presentation, soins_et_actes, diplomes,
  parcours, langues, annees_experience, telephone_secretariat, note_moyenne,
  nb_avis, etablissement_id, quartier,
  utilisateurs ( nom, prenom ),
  specialites ( nom ),
  villes ( nom ),
  medecin_assurances ( assurances ( libelle ) ),
  horaires_types ( jour_semaine, heure_debut, heure_fin )
`;

/** Médecin UI enrichi de ses plages horaires (pour calculer les créneaux). */
export type MedecinAvecPlages = Medecin & {
  plages: { jour_semaine: number; heure_debut: string; heure_fin: string }[];
};

function versMedecinUI(ligne: LigneMedecin): MedecinAvecPlages {
  const prenom = ligne.utilisateurs?.prenom ?? "";
  const nom = ligne.utilisateurs?.nom ?? "";
  const joursOuverts = new Set(ligne.horaires_types.map((h) => h.jour_semaine));
  const joursFermes = [0, 1, 2, 3, 4, 5, 6].filter((j) => !joursOuverts.has(j));

  // Résumé d'horaires pour la fiche (ex. « Lundi — Vendredi », « 08:00 à 18:00 »)
  const tries = [...joursOuverts].sort();
  const jours =
    tries.length === 0
      ? "Sur rendez-vous"
      : `${JOURS_NOMS[tries[0]]} — ${JOURS_NOMS[tries[tries.length - 1]]}`;
  const debuts = ligne.horaires_types.map((h) => h.heure_debut.slice(0, 5)).sort();
  const fins = ligne.horaires_types.map((h) => h.heure_fin.slice(0, 5)).sort();
  const detail =
    debuts.length > 0 ? `${debuts[0]} à ${fins[fins.length - 1]}` : "Horaires à confirmer";

  const aujourdHui = new Date().getDay();
  const ouvertAujourdHui = joursOuverts.has(aujourdHui);
  let prochainJour = aujourdHui;
  for (let i = 1; i <= 7 && !joursOuverts.has(prochainJour); i++) prochainJour = (aujourdHui + i) % 7;

  return {
    id: ligne.id,
    civilite: (ligne.civilite === "Pr" ? "Pr" : "Dr") as Medecin["civilite"],
    genre: (ligne.genre === "femme" || ligne.genre === "homme" ? ligne.genre : null) as Medecin["genre"],
    prenom,
    nom,
    initiales: `${prenom.charAt(0)}${nom.charAt(0)}`.toUpperCase() || "DR",
    gradient: gradientPour(ligne.id),
    specialite: ligne.specialites?.nom ?? "Médecine générale",
    etablissementId: ligne.etablissement_id ?? "",
    ville: ligne.villes?.nom ?? "",
    anneesExperience: ligne.annees_experience ?? 0,
    tarifConsultation: ligne.tarif_consultation ?? 0,
    note: Number(ligne.note_moyenne) || 0,
    nbAvis: ligne.nb_avis,
    disponibilite: ouvertAujourdHui
      ? { type: "aujourdhui", label: "Dispo aujourd'hui" }
      : { type: "bientot", label: joursOuverts.size ? JOURS_NOMS[prochainJour] : "Sur demande" },
    telephoneSecretariat: ligne.telephone_secretariat ?? "",
    aPropos: ligne.presentation ?? "",
    soinsEtActes: ligne.soins_et_actes ?? [],
    diplomes: ligne.diplomes ?? [],
    parcours: ligne.parcours ?? [],
    langues: ligne.langues ?? [],
    assurances: ligne.medecin_assurances.map((a) => a.assurances?.libelle ?? "").filter(Boolean),
    horaires: { jours, detail },
    joursFermes,
    plages: ligne.horaires_types ?? [],
  };
}

/** Alias des chips d'accueil vers les libellés du référentiel. */
const ALIAS_SPECIALITES: Record<string, string> = {
  généraliste: "médecine générale",
  generaliste: "médecine générale",
  "ophtalmo.": "ophtalmologie",
  ophtalmo: "ophtalmologie",
  cardio: "cardiologie",
  dentiste: "dentaire",
};

const normaliser = (t: string) => t.trim().toLowerCase();

/**
 * Le médecin travaille-t-il ce jour de la semaine, avec encore au moins un
 * créneau réservable à cette date ? Sert au filtre « Disponibilité ».
 */
function ouvertLeJour(
  plages: { jour_semaine: number; heure_debut: string; heure_fin: string }[],
  dateISO: string
): boolean {
  const jour = depuisISO(dateISO).getDay();
  return plages.some(
    (p) =>
      p.jour_semaine === jour &&
      HEURES_JOURNEE.some(
        (h) =>
          h >= p.heure_debut.slice(0, 5) &&
          h < p.heure_fin.slice(0, 5) &&
          creneauReservable(dateISO, h)
      )
  );
}

export async function chargerMedecins(filtres?: {
  specialite?: string;
  ville?: string;
  q?: string;
  /** « aujourdhui » | « 3jours » | « 7jours » | « 14jours » */
  dispo?: string;
  /** Types d'établissement retenus (« Hôpital public »…). */
  types?: string[];
  /** Libellés d'assurance retenus (« NSIA »…). */
  assurances?: string[];
  /** Langues parlées retenues (« Peul »…). */
  langues?: string[];
  /** « femme » | « homme » — les médecins non renseignés sont exclus. */
  genre?: string;
  /** Note minimale (4 ou 4.5). */
  noteMin?: number;
}): Promise<MedecinAvecPlages[]> {
  const { data, error } = await clientPublic()
    .from("medecins")
    .select(SELECTION_MEDECIN)
    .eq("statut", "valide");
  if (error) throw new Error(`chargerMedecins: ${error.message}`);
  let liste = ((data ?? []) as unknown as LigneMedecin[]).map(versMedecinUI);

  if (filtres?.specialite) {
    const cible = ALIAS_SPECIALITES[normaliser(filtres.specialite)] ?? normaliser(filtres.specialite);
    liste = liste.filter((m) => normaliser(m.specialite).includes(cible));
  }
  if (filtres?.ville) {
    liste = liste.filter((m) => normaliser(m.ville).includes(normaliser(filtres.ville!)));
  }
  if (filtres?.q) {
    const q = normaliser(filtres.q);
    liste = liste.filter((m) =>
      normaliser(`${m.civilite} ${m.prenom} ${m.nom} ${m.specialite}`).includes(q)
    );
  }

  // Disponibilité : on regarde les vraies plages horaires, pas la pastille
  // affichée, pour que le filtre reste juste en fin de journée.
  if (filtres?.dispo) {
    const cibles = joursCibles(filtres.dispo);
    if (cibles.length) {
      liste = liste.filter((m) => cibles.some((iso) => ouvertLeJour(m.plages, iso)));
    }
  }
  if (filtres?.assurances?.length) {
    const voulues = filtres.assurances.map(normaliser);
    liste = liste.filter((m) => m.assurances.some((a) => voulues.includes(normaliser(a))));
  }
  if (filtres?.langues?.length) {
    const voulues = filtres.langues.map(normaliser);
    liste = liste.filter((m) => m.langues.some((l) => voulues.includes(normaliser(l))));
  }
  if (filtres?.genre) {
    liste = liste.filter((m) => m.genre === filtres.genre);
  }
  if (filtres?.noteMin) {
    liste = liste.filter((m) => m.note >= filtres.noteMin!);
  }
  return liste.sort((a, b) => b.note - a.note);
}

/** Horizons du filtre « Disponibilités », en jours à partir d'aujourd'hui. */
const HORIZONS_DISPO: Record<string, number> = {
  aujourdhui: 1,
  "3jours": 3,
  "7jours": 7,
  "14jours": 14,
};

/** Dates couvertes par un horizon de disponibilité (dimanches inclus : le
 *  filtrage réel se fait sur les plages horaires du médecin). */
function joursCibles(dispo: string): string[] {
  const nbJours = HORIZONS_DISPO[dispo];
  if (!nbJours) return [];
  const dates: string[] = [];
  const curseur = new Date();
  for (let i = 0; i < nbJours; i++) {
    dates.push(versISO(curseur));
    curseur.setDate(curseur.getDate() + 1);
  }
  return dates;
}

export async function chargerMedecinParId(id: string): Promise<MedecinAvecPlages | undefined> {
  const { data, error } = await clientPublic()
    .from("medecins")
    .select(SELECTION_MEDECIN)
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return undefined;
  return versMedecinUI(data as unknown as LigneMedecin);
}

interface LigneEtablissement {
  id: string;
  nom: string;
  type: string;
  quartier: string | null;
  villes: { nom: string } | null;
  medecins: { id: string }[];
}

function versEtablissementUI(ligne: LigneEtablissement): Etablissement {
  return {
    id: ligne.id,
    nom: ligne.nom,
    type: ligne.type,
    quartier: ligne.quartier ?? "",
    ville: ligne.villes?.nom ?? "",
    note: 4.5, // pas encore d'avis d'établissement dans le modèle
    nbMedecins: ligne.medecins?.length ?? 0,
    gradient: gradientPour(ligne.id),
  };
}

export async function chargerEtablissements(): Promise<Etablissement[]> {
  const { data, error } = await clientPublic()
    .from("etablissements")
    .select("id, nom, type, quartier, villes ( nom ), medecins ( id )")
    .eq("statut", "valide");
  if (error) throw new Error(`chargerEtablissements: ${error.message}`);
  return ((data ?? []) as unknown as LigneEtablissement[]).map(versEtablissementUI);
}

/**
 * Libellés d'assurance du référentiel, pour alimenter le filtre de la page de
 * résultats. Lus en base plutôt que codés en dur : les libellés réels
 * (« NSIA Assurances »…) doivent correspondre exactement, sinon le filtre ne
 * retournerait jamais rien.
 */
export async function chargerAssurances(): Promise<string[]> {
  const { data } = await clientPublic().from("assurances").select("libelle").order("libelle");
  return ((data ?? []) as { libelle: string }[]).map((a) => a.libelle).filter(Boolean);
}

/** Langues réellement parlées par les médecins validés (filtre « Langues »). */
export async function chargerLangues(): Promise<string[]> {
  const { data } = await clientPublic().from("medecins").select("langues").eq("statut", "valide");
  const langues = new Set(((data ?? []) as { langues: string[] | null }[]).flatMap((m) => m.langues ?? []));
  return [...langues].filter(Boolean).sort((a, b) => a.localeCompare(b, "fr"));
}

/** Le genre est-il renseigné pour au moins un médecin ? (filtre « Sexe ») */
export async function existeGenreRenseigne(): Promise<boolean> {
  const { data } = await clientPublic()
    .from("medecins")
    .select("genre")
    .eq("statut", "valide")
    .not("genre", "is", null)
    .limit(1);
  return (data ?? []).length > 0;
}

/**
 * Noms de médecins et d'établissements, pour l'autocomplétion du champ
 * « Médecin ou établissement » de la recherche.
 */
export async function chargerNomsRecherche(): Promise<string[]> {
  const [med, etab] = await Promise.all([
    clientPublic()
      .from("medecins")
      .select("civilite, utilisateurs ( nom, prenom )")
      .eq("statut", "valide"),
    clientPublic().from("etablissements").select("nom").eq("statut", "valide"),
  ]);
  const noms = ((med.data ?? []) as unknown as {
    civilite: string;
    utilisateurs: { nom: string; prenom: string } | null;
  }[])
    .map((m) =>
      m.utilisateurs ? `${m.civilite} ${m.utilisateurs.prenom} ${m.utilisateurs.nom}` : ""
    )
    .filter(Boolean);
  const etabs = ((etab.data ?? []) as { nom: string }[]).map((e) => e.nom).filter(Boolean);
  return [...noms, ...etabs].sort((a, b) => a.localeCompare(b, "fr"));
}

/** Au moins un médecin validé est-il noté ? (filtre « Note » affiché ou non) */
export async function existeMedecinNote(): Promise<boolean> {
  const { data } = await clientPublic()
    .from("medecins")
    .select("note_moyenne")
    .eq("statut", "valide")
    .gt("note_moyenne", 0)
    .limit(1);
  return (data ?? []).length > 0;
}

/** Types d'établissement présents en base (filtre « Établissement »). */
export async function chargerTypesEtablissement(): Promise<string[]> {
  const { data } = await clientPublic().from("etablissements").select("type").eq("statut", "valide");
  const types = new Set(((data ?? []) as { type: string }[]).map((e) => e.type).filter(Boolean));
  return [...types].sort();
}

export async function chargerEtablissementParId(id: string): Promise<Etablissement | undefined> {
  if (!id) return undefined;
  const { data } = await clientPublic()
    .from("etablissements")
    .select("id, nom, type, quartier, villes ( nom ), medecins ( id )")
    .eq("id", id)
    .maybeSingle();
  return data ? versEtablissementUI(data as unknown as LigneEtablissement) : undefined;
}

export async function chargerSpecialites(): Promise<{ id: string; nom: string; emoji: string }[]> {
  const { data } = await clientPublic().from("specialites").select("id, nom, emoji").order("nom");
  return (data ?? []).map((s) => ({ ...s, emoji: s.emoji ?? "🩺" }));
}

export async function chargerVilles(): Promise<string[]> {
  const { data } = await clientPublic().from("villes").select("nom").order("nom");
  return (data ?? []).map((v) => v.nom);
}

/**
 * Créneaux indisponibles (réservés ou fermés) d'un médecin sur une période,
 * via la fonction SQL `heures_indisponibles` (aucune donnée personnelle).
 * Renvoie une Map « AAAA-MM-JJ|HH:MM » → 'reserve' | 'ferme'.
 */
export type EtatCreneau = "ouvert" | "ferme" | "reserve";

export async function chargerIndisponibilites(
  medecinId: string,
  debutISO?: string,
  finISO?: string
): Promise<Map<string, EtatCreneau>> {
  const debut = debutISO ?? versISO(new Date());
  const fin = finISO ?? versISO(new Date(Date.now() + 30 * 86400000));
  const { data, error } = await clientPublic().rpc("heures_indisponibles", {
    p_medecin_id: medecinId,
    p_debut: debut,
    p_fin: fin,
  });
  if (error) throw new Error(`chargerIndisponibilites: ${error.message}`);
  const map = new Map<string, EtatCreneau>();
  for (const ligne of data ?? []) {
    const cle = `${ligne.jour}|${ligne.heure.slice(0, 5)}`;
    // Un RDV réservé prime toujours sur une exception d'ouverture/fermeture.
    if (map.get(cle) === "reserve") continue;
    map.set(cle, ligne.etat as EtatCreneau);
  }
  return map;
}

/** Créneaux de 30 minutes, de 08:00 à 20:00 (spec C.4.2). */
export const HEURES_JOURNEE: string[] = (() => {
  const heures: string[] = [];
  for (let h = 8; h <= 20; h++) {
    heures.push(`${String(h).padStart(2, "0")}:00`);
    if (h < 20) heures.push(`${String(h).padStart(2, "0")}:30`);
  }
  return heures;
})();

/**
 * Statut réel d'un créneau : l'exception (ou la réservation) prime,
 * sinon l'horaire-type du jour décide (spec : exceptions > horaire-type).
 */
export function statutCreneau(
  horairesTypes: { jour_semaine: number; heure_debut: string; heure_fin: string }[],
  etats: Map<string, EtatCreneau>,
  dateISO: string,
  heure: string
): EtatCreneau {
  const exception = etats.get(`${dateISO}|${heure}`);
  if (exception) return exception;
  const jour = new Date(`${dateISO}T00:00:00`).getDay();
  const dansPlage = horairesTypes.some(
    (h) =>
      h.jour_semaine === jour &&
      heure >= h.heure_debut.slice(0, 5) &&
      heure < h.heure_fin.slice(0, 5)
  );
  return dansPlage ? "ouvert" : "ferme";
}

/**
 * Premiers créneaux libres d'un jour (mini-créneaux des cartes de résultats).
 * Exclut les créneaux passés ou trop proches : ils mènent vers la réservation,
 * qui les refuserait de toute façon.
 */
export function premiersCreneauxOuverts(
  horairesTypes: { jour_semaine: number; heure_debut: string; heure_fin: string }[],
  etats: Map<string, EtatCreneau>,
  dateISO: string,
  nb = 4
): string[] {
  return HEURES_JOURNEE.filter(
    (h) =>
      statutCreneau(horairesTypes, etats, dateISO, h) === "ouvert" &&
      creneauReservable(dateISO, h)
  ).slice(0, nb);
}

/** Plages horaires-types d'un médecin (pour construire la grille de créneaux). */
export async function chargerHorairesTypes(
  medecinId: string
): Promise<{ jour_semaine: number; heure_debut: string; heure_fin: string }[]> {
  const { data } = await clientPublic()
    .from("horaires_types")
    .select("jour_semaine, heure_debut, heure_fin")
    .eq("medecin_id", medecinId);
  return data ?? [];
}

export function nomComplet(medecin: Medecin): string {
  return `${medecin.civilite} ${medecin.prenom} ${medecin.nom}`;
}
