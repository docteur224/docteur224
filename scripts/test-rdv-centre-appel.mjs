/*
 * Tests de la prise de rendez-vous par le centre d'appel (migration 0046).
 *
 * Tout se joue en base, avec de VRAIES sessions (clé anon, JWT réel) : ce
 * qu'on vérifie ici, ce sont les refus — la fonction `creer_rdv_centre_appel`
 * est SECURITY DEFINER, donc la RLS ne la protège pas et sa garde
 * `est_admin()` est la seule barrière. Un test qui passerait par la
 * service_role ne prouverait rien.
 *
 * La dernière partie appelle la route serveur qui envoie la confirmation :
 * elle exige `npx next build && npx next start -p 3001` (variable APP pour
 * un autre port). Sans serveur, cette partie est signalée et sautée.
 *
 * Usage : node scripts/test-rdv-centre-appel.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { readFileSync } from "node:fs";

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const lire = (cle) => env.match(new RegExp(`^${cle}=(.*)$`, "m"))?.[1].trim();
const URL_SB = lire("NEXT_PUBLIC_SUPABASE_URL");
const ANON = lire("NEXT_PUBLIC_SUPABASE_ANON_KEY");

const service = createClient(URL_SB, lire("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { autoRefreshToken: false, persistSession: false },
});

let echecs = 0;
const test = (nom, ok, detail) => {
  if (!ok) echecs++;
  console.log(`${ok ? "✅" : "❌"} ${nom}${detail ? ` — ${detail}` : ""}`);
};

async function session(email, motDePasse) {
  const client = createClient(URL_SB, ANON, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await client.auth.signInWithPassword({ email, password: motDePasse });
  if (error) throw new Error(`connexion ${email} : ${error.message}`);
  return client;
}

const anonyme = createClient(URL_SB, ANON, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const admin = await session("admin@docteur224.com", "alpha2308");
const patient = await session("patient1@test.docteur224.com", "test1234");
const medecinSession = await session("medecin1@test.docteur224.com", "test1234");

/* Nettoyage : tout ce que le scénario crée est repris ici, quoi qu'il arrive. */
const rdvCrees = [];
const fichesCrees = [];

/* ================= 1. Recherche de l'appelant ================= */

const refusRecherche = async (client, qui) => {
  const { error } = await client.rpc("rechercher_patients_centre_appel", {
    p_recherche: "a",
    p_limite: 5,
  });
  test(`Recherche refusée à ${qui}`, !!error, error?.message?.slice(0, 60));
};
await refusRecherche(anonyme, "un visiteur anonyme");
await refusRecherche(patient, "un patient");
await refusRecherche(medecinSession, "un médecin");

// Un patient du seed sert de référence : son nom réel est lu en base plutôt
// que codé en dur, le jeu de données évoluant d'une session de test à l'autre.
const { data: refPatient } = await service
  .from("utilisateurs")
  .select("id, nom, prenom, telephone")
  .eq("email", "patient1@test.docteur224.com")
  .single();

const { data: parNom, error: eNom } = await admin.rpc("rechercher_patients_centre_appel", {
  p_recherche: refPatient.nom,
  p_limite: 12,
});
test(
  "L'admin retrouve un patient par son nom",
  !eNom && (parNom ?? []).some((f) => f.cle === `c-${refPatient.id}`),
  eNom?.message
);

// Le numéro est saisi comme au téléphone, avec des espaces : la comparaison
// doit se faire chiffres à chiffres.
const numeroEspace = (refPatient.telephone ?? "").replace("+224", "").replace(/(\d{3})(?=\d)/, "$1 ");
const { data: parTel } = await admin.rpc("rechercher_patients_centre_appel", {
  p_recherche: numeroEspace,
  p_limite: 12,
});
test(
  "…et par son numéro saisi avec des espaces",
  (parTel ?? []).some((f) => f.cle === `c-${refPatient.id}`),
  `« ${numeroEspace} » → ${(parTel ?? []).length} résultat(s)`
);

const { data: tropCourt } = await admin.rpc("rechercher_patients_centre_appel", {
  p_recherche: "a",
  p_limite: 12,
});
test("Une seule lettre ne déverse pas l'annuaire", (tropCourt ?? []).length === 0);

// Les proches et les fiches sans compte entrent dans la même recherche.
const { data: unProche } = await service.from("proches").select("id, nom, prenom").limit(1).maybeSingle();
if (unProche) {
  const { data: trouve } = await admin.rpc("rechercher_patients_centre_appel", {
    p_recherche: unProche.nom,
    p_limite: 20,
  });
  test(
    "Les proches figurent dans la recherche",
    (trouve ?? []).some((f) => f.cle === `p-${unProche.id}`),
    `${unProche.prenom} ${unProche.nom}`
  );
} else {
  test("Les proches figurent dans la recherche", true, "aucun proche en base, contrôle sans objet");
}

/* ================= 2. Premières disponibilités ================= */

// medecin1 est en tête de liste à dessein : c'est le seul praticien dont on
// possède le mot de passe, et le scénario doit pouvoir vérifier, sous SA
// session, que le rendez-vous posé par la console apparaît bien chez lui.
const { data: refMedecin } = await service
  .from("utilisateurs")
  .select("id")
  .eq("email", "medecin1@test.docteur224.com")
  .single();
const { data: medecinsValides } = await service
  .from("medecins")
  .select("id, statut, visite_domicile")
  .eq("statut", "valide")
  .limit(6);
const ids = [refMedecin.id, ...medecinsValides.map((m) => m.id).filter((i) => i !== refMedecin.id)];

const { data: dispos, error: eDispos } = await admin.rpc("prochaines_dispos_medecins", {
  p_medecin_ids: ids,
  p_jours: 14,
});
test("Les premières disponibilités se lisent en un appel", !eDispos && (dispos ?? []).length > 0, eDispos?.message);

const cible = (dispos ?? []).find((d) => d.medecin_id === refMedecin.id) ?? (dispos ?? [])[0];
if (cible) {
  // Le créneau annoncé doit appartenir à la grille de 30 minutes et tomber
  // dans une plage horaire du praticien : c'est ce que l'écran affiche.
  const minutes = Number(String(cible.heure).slice(3, 5));
  const heures = Number(String(cible.heure).slice(0, 2));
  test(
    "Le créneau annoncé est sur la grille de 30 min, entre 08:00 et 20:00",
    (minutes === 0 || minutes === 30) && heures >= 8 && heures <= 20,
    `${cible.jour} ${cible.heure}`
  );
  const { data: ouvert } = await admin.rpc("creneau_ouvert_medecin", {
    p_medecin_id: cible.medecin_id,
    p_date: cible.jour,
    p_heure: cible.heure,
  });
  test("…et la base le confirme ouvert", ouvert === true);
  test("Le compte de créneaux libres du jour est positif", Number(cible.libres_ce_jour) > 0);
}

/* ================= 3. Création du rendez-vous ================= */

const refusCreation = async (client, qui) => {
  const { error } = await client.rpc("creer_rdv_centre_appel", {
    p_medecin_id: cible.medecin_id,
    p_date: cible.jour,
    p_heure: cible.heure,
    p_patient_cle: `c-${refPatient.id}`,
  });
  test(`Création refusée à ${qui}`, !!error, error?.message?.slice(0, 60));
};
await refusCreation(anonyme, "un visiteur anonyme");
await refusCreation(patient, "un patient");
await refusCreation(medecinSession, "un médecin");

const auditAvant = (
  await service.from("journal_audit").select("id", { count: "exact", head: true })
).count;

const { data: idRdv, error: eRdv } = await admin.rpc("creer_rdv_centre_appel", {
  p_medecin_id: cible.medecin_id,
  p_date: cible.jour,
  p_heure: cible.heure,
  p_motif: "Consultation (test centre d'appel)",
  p_patient_cle: `c-${refPatient.id}`,
});
test("L'admin pose un rendez-vous pour un patient", !eRdv && !!idRdv, eRdv?.message);
if (idRdv) rdvCrees.push(idRdv);

if (idRdv) {
  const { data: ligne } = await service
    .from("rendez_vous")
    .select("reserve_par_role, source, statut, patient_id, medecin_id, lieu, motif")
    .eq("id", idRdv)
    .single();
  test("…tracé « pris par l'administration »", ligne.reserve_par_role === "admin");
  test("…et « source téléphone »", ligne.source === "telephone");
  test("…confirmé d'emblée (le cabinet a pris l'appel)", ligne.statut === "confirme");
  test("…au bon bénéficiaire", ligne.patient_id === refPatient.id);
  test("…au cabinet par défaut", ligne.lieu === "cabinet");

  const auditApres = (
    await service.from("journal_audit").select("id", { count: "exact", head: true })
  ).count;
  test("Une entrée d'audit a été écrite", auditApres === auditAvant + 1, `${auditAvant} → ${auditApres}`);

  const { data: trace } = await service
    .from("journal_audit")
    .select("action, cible_id, details, acteur_id")
    .eq("cible_id", idRdv)
    .maybeSingle();
  test(
    "…nominative, et rattachée au rendez-vous",
    !!trace && trace.action.includes("centre d'appel") && !!trace.details?.cible,
    trace?.details?.cible
  );

  // Le trigger de notification (0013) ne connaît pas le rôle « admin » :
  // le contrôle vérifie qu'il a bien traité ce rendez-vous comme les autres.
  const { count: notifs } = await service
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("source_id", idRdv);
  test("Patient et praticien sont notifiés", (notifs ?? 0) >= 2, `${notifs} notification(s)`);

  // Bout en bout : un rendez-vous pris par la console doit apparaître chez
  // les intéressés, sous LEUR session — c'est la RLS qui décide, pas nous.
  if (ligne.medecin_id === refMedecin.id) {
    const { data: chezLeMedecin } = await medecinSession
      .from("rendez_vous")
      .select("id")
      .eq("id", idRdv)
      .maybeSingle();
    test("Le praticien voit le rendez-vous dans son agenda", !!chezLeMedecin);
  }
  const { data: chezLePatient } = await patient
    .from("rendez_vous")
    .select("id, statut")
    .eq("id", idRdv)
    .maybeSingle();
  test("Le patient le retrouve dans « Mes rendez-vous »", !!chezLePatient);

  // Et il reste invisible pour un tiers : la console ne perce pas le
  // cloisonnement entre praticiens.
  const autreMedecin = await session("medecin2@test.docteur224.com", "test1234");
  const { data: chezUnConfrere } = await autreMedecin
    .from("rendez_vous")
    .select("id")
    .eq("id", idRdv)
    .maybeSingle();
  test("…et reste invisible pour un confrère", !chezUnConfrere);
}

/* ================= 4. Ce que la base refuse ================= */

const refuse = async (nom, params, attendu) => {
  const { error } = await admin.rpc("creer_rdv_centre_appel", params);
  test(nom, !!error && error.message.includes(attendu), error?.message?.slice(0, 80) ?? "aucune erreur");
};

// Le créneau désormais occupé n'est plus « ouvert » : c'est ce contrôle-là
// qui parle en premier, le garde-fou `unique_violation` ne servant que pour
// deux opérateurs qui valideraient dans la même seconde.
{
  const { error } = await admin.rpc("creer_rdv_centre_appel", {
    p_medecin_id: cible.medecin_id,
    p_date: cible.jour,
    p_heure: cible.heure,
    p_patient_cle: `c-${refPatient.id}`,
  });
  const { count } = await service
    .from("rendez_vous")
    .select("id", { count: "exact", head: true })
    .eq("medecin_id", cible.medecin_id)
    .eq("date", cible.jour)
    .eq("heure", cible.heure)
    .neq("statut", "annule");
  test(
    "Le même créneau ne se réserve pas deux fois",
    !!error && count === 1,
    `${error?.message?.slice(0, 60)} · ${count} rendez-vous sur le créneau`
  );
}

await refuse(
  "Un créneau hors de la grille est refusé",
  {
    p_medecin_id: cible.medecin_id,
    p_date: cible.jour,
    p_heure: "03:15",
    p_patient_cle: `c-${refPatient.id}`,
  },
  "n'est pas ouvert"
);

await refuse(
  "Un créneau passé est refusé",
  {
    p_medecin_id: cible.medecin_id,
    p_date: "2020-01-06",
    p_heure: "09:00",
    p_patient_cle: `c-${refPatient.id}`,
  },
  "déjà passé"
);

const { data: enAttente } = await service
  .from("medecins")
  .select("id")
  .neq("statut", "valide")
  .limit(1)
  .maybeSingle();
if (enAttente) {
  await refuse(
    "Un praticien non validé est refusé",
    {
      p_medecin_id: enAttente.id,
      p_date: cible.jour,
      p_heure: cible.heure,
      p_patient_cle: `c-${refPatient.id}`,
    },
    "n'est pas validé"
  );
} else {
  test("Un praticien non validé est refusé", true, "aucun dossier en attente, contrôle sans objet");
}

await refuse(
  "Une fiche sans nom est refusée",
  {
    p_medecin_id: cible.medecin_id,
    p_date: cible.jour,
    p_heure: cible.heure,
    p_nouveau_prenom: "Sans",
  },
  "nom et son prénom"
);

/* ================= 5. Fiche créée à la volée ================= */

// Deuxième créneau libre du même praticien, pour ne pas rejouer le premier.
const { data: libres } = await admin.rpc("prochaines_dispos_medecins", {
  p_medecin_ids: [cible.medecin_id],
  p_jours: 14,
});
const suivant = (libres ?? [])[0];

if (suivant) {
  const fichesAvant = (
    await service.from("patients_sans_compte").select("id", { count: "exact", head: true })
  ).count;

  const { data: idRdv2, error: eRdv2 } = await admin.rpc("creer_rdv_centre_appel", {
    p_medecin_id: suivant.medecin_id,
    p_date: suivant.jour,
    p_heure: suivant.heure,
    p_motif: "Premier appel (test)",
    p_nouveau_nom: "Testcentreappel",
    p_nouveau_prenom: "Fatoumata",
    p_nouveau_telephone: "+224622000111",
  });
  test("Un appelant inconnu est enregistré en une fois", !eRdv2 && !!idRdv2, eRdv2?.message);
  if (idRdv2) rdvCrees.push(idRdv2);

  const { data: fiche } = await service
    .from("patients_sans_compte")
    .select("id, nom, prenom, telephone, medecin_id")
    .eq("nom", "Testcentreappel")
    .maybeSingle();
  if (fiche) fichesCrees.push(fiche.id);
  test(
    "…avec une fiche rattachée au praticien retenu",
    !!fiche && fiche.medecin_id === suivant.medecin_id && fiche.telephone === "+224622000111"
  );

  // Le point qui justifiait de passer par une fonction plutôt que par deux
  // écritures côté client : un échec ne doit pas laisser de fiche orpheline.
  const { error: eDouble } = await admin.rpc("creer_rdv_centre_appel", {
    p_medecin_id: suivant.medecin_id,
    p_date: suivant.jour,
    p_heure: suivant.heure,
    p_nouveau_nom: "Orpheline",
    p_nouveau_prenom: "Fiche",
    p_nouveau_telephone: "+224622000222",
  });
  const { count: fichesApres } = await service
    .from("patients_sans_compte")
    .select("id", { count: "exact", head: true });
  test(
    "Un créneau raflé n'abandonne aucune fiche orpheline",
    !!eDouble && fichesApres === fichesAvant + 1,
    `${fichesAvant} → ${fichesApres}`
  );
}

/* ================= 6. Visite à domicile ================= */

// Cherché sur toute la base et non dans l'échantillon de six : les praticiens
// qui se déplacent sont minoritaires, l'échantillon n'en contient pas
// toujours et le contrôle passait alors silencieusement à la trappe.
const { data: medecinDomicile } = await service
  .from("medecins")
  .select("id")
  .eq("statut", "valide")
  .eq("visite_domicile", true)
  .limit(1)
  .maybeSingle();
if (medecinDomicile) {
  const { data: d } = await admin.rpc("prochaines_dispos_medecins", {
    p_medecin_ids: [medecinDomicile.id],
    p_jours: 14,
  });
  const creneau = (d ?? [])[0];
  if (creneau) {
    const { error: eSansAdresse } = await admin.rpc("creer_rdv_centre_appel", {
      p_medecin_id: creneau.medecin_id,
      p_date: creneau.jour,
      p_heure: creneau.heure,
      p_lieu: "domicile",
      p_patient_cle: `c-${refPatient.id}`,
    });
    test(
      "Une visite à domicile sans adresse est refusée",
      !!eSansAdresse && eSansAdresse.message.includes("adresse"),
      eSansAdresse?.message?.slice(0, 60)
    );

    const { data: idRdv3, error: eDom } = await admin.rpc("creer_rdv_centre_appel", {
      p_medecin_id: creneau.medecin_id,
      p_date: creneau.jour,
      p_heure: creneau.heure,
      p_lieu: "domicile",
      p_adresse_domicile: "Kipé, derrière la pharmacie (test)",
      p_patient_cle: `c-${refPatient.id}`,
    });
    test("…et acceptée avec une adresse", !eDom && !!idRdv3, eDom?.message);
    if (idRdv3) rdvCrees.push(idRdv3);
  }
}

const { data: medecinSansDomicile } = await service
  .from("medecins")
  .select("id")
  .eq("statut", "valide")
  .or("visite_domicile.is.null,visite_domicile.eq.false")
  .limit(1)
  .maybeSingle();
if (medecinSansDomicile) {
  const { data: d } = await admin.rpc("prochaines_dispos_medecins", {
    p_medecin_ids: [medecinSansDomicile.id],
    p_jours: 14,
  });
  const creneau = (d ?? [])[0];
  if (creneau) {
    const { error } = await admin.rpc("creer_rdv_centre_appel", {
      p_medecin_id: creneau.medecin_id,
      p_date: creneau.jour,
      p_heure: creneau.heure,
      p_lieu: "domicile",
      p_adresse_domicile: "Ratoma (test)",
      p_patient_cle: `c-${refPatient.id}`,
    });
    test(
      "Un praticien qui ne se déplace pas refuse la visite à domicile",
      !!error && error.message.includes("visite à domicile"),
      error?.message?.slice(0, 60)
    );
  }
}

/* ================= 7. Main courante ================= */

const { data: recents, error: eRecents } = await admin.rpc("rdv_centre_appel_recents", {
  p_limite: 8,
});
test("La main courante liste les rendez-vous posés par la console", !eRecents && (recents ?? []).length > 0, eRecents?.message);
if (rdvCrees[0]) {
  test(
    "…dont celui qui vient d'être créé, avec son bénéficiaire nommé",
    (recents ?? []).some((r) => r.id === rdvCrees[0] && r.patient && r.medecin)
  );
}
const { error: eRecentsPatient } = await patient.rpc("rdv_centre_appel_recents", { p_limite: 8 });
test("…et refusée à un patient", !!eRecentsPatient, eRecentsPatient?.message?.slice(0, 60));

/* ================= 8. Reprendre un rendez-vous posé ================= */

const refusListe = async (client, qui) => {
  const { error } = await client.rpc("appels_centre_appel", { p_limite: 5 });
  test(`Liste des appels refusée à ${qui}`, !!error, error?.message?.slice(0, 60));
};
await refusListe(anonyme, "un visiteur anonyme");
await refusListe(patient, "un patient");
await refusListe(medecinSession, "un médecin");

const { data: liste, error: eListe } = await admin.rpc("appels_centre_appel", {
  p_recherche: "",
  p_statut: "",
  p_portee: "console",
  p_limite: 20,
  p_decalage: 0,
});
test("La liste des appels traités se lit", !eListe && (liste ?? []).length > 0, eListe?.message);

const ligneRdv = (liste ?? []).find((l) => l.id === rdvCrees[0]);
test(
  "…et porte le contact de l'appelant",
  !!ligneRdv && !!ligneRdv.telephone && !!ligneRdv.email,
  ligneRdv ? `${ligneRdv.telephone} · ${ligneRdv.email}` : "ligne absente"
);
test(
  "…ainsi que le praticien et l'auteur de la saisie",
  !!ligneRdv && !!ligneRdv.medecin && !!ligneRdv.pris_par,
  ligneRdv ? `${ligneRdv.medecin} · ${ligneRdv.pris_par}` : ""
);

// La recherche par numéro doit fonctionner comme au téléphone.
const { data: parNumero } = await admin.rpc("appels_centre_appel", {
  p_recherche: numeroEspace,
  p_portee: "console",
  p_limite: 20,
});
test(
  "La liste se cherche par numéro de téléphone",
  (parNumero ?? []).some((l) => l.id === rdvCrees[0]),
  `${(parNumero ?? []).length} résultat(s)`
);

// Portée « tous » : les rendez-vous pris en ligne par les patients entrent
// aussi dans la liste, sans qu'aucun droit nouveau soit accordé.
const { data: tous } = await admin.rpc("appels_centre_appel", {
  p_portee: "tous",
  p_limite: 50,
});
test(
  "La portée « tous » élargit au-delà des appels de la console",
  (tous ?? []).length >= (liste ?? []).length,
  `${(liste ?? []).length} → ${(tous ?? []).length}`
);

/* --- Déplacer --- */

const refusDeplacer = async (client, qui) => {
  const { error } = await client.rpc("reprogrammer_rdv_centre_appel", {
    p_rdv: rdvCrees[0],
    p_date: cible.jour,
    p_heure: cible.heure,
  });
  test(`Déplacement refusé à ${qui}`, !!error, error?.message?.slice(0, 60));
};
await refusDeplacer(patient, "un patient");
await refusDeplacer(medecinSession, "un médecin");

// Un créneau libre chez le même praticien, différent de celui déjà pris.
const { data: apresPrise } = await admin.rpc("prochaines_dispos_medecins", {
  p_medecin_ids: [cible.medecin_id],
  p_jours: 14,
});
const nouveauCreneau = (apresPrise ?? [])[0];

if (nouveauCreneau) {
  const { error: eDeplace } = await admin.rpc("reprogrammer_rdv_centre_appel", {
    p_rdv: rdvCrees[0],
    p_date: nouveauCreneau.jour,
    p_heure: nouveauCreneau.heure,
  });
  test("Un rendez-vous se déplace vers un créneau ouvert", !eDeplace, eDeplace?.message);

  const { data: deplace } = await service
    .from("rendez_vous")
    .select("date, heure")
    .eq("id", rdvCrees[0])
    .single();
  test(
    "…et la base porte le nouvel horaire",
    deplace.date === nouveauCreneau.jour && deplace.heure === nouveauCreneau.heure,
    `${deplace.date} ${deplace.heure}`
  );

  const { count: notifsDeplacement } = await service
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("source_id", rdvCrees[0])
    .eq("type", "rdv_reprogramme");
  test("…le patient est prévenu du déplacement", (notifsDeplacement ?? 0) >= 1);
}

const { error: eHorsAgenda } = await admin.rpc("reprogrammer_rdv_centre_appel", {
  p_rdv: rdvCrees[0],
  p_date: cible.jour,
  p_heure: "03:15",
});
test(
  "Un déplacement hors agenda est refusé",
  !!eHorsAgenda && eHorsAgenda.message.includes("n'est pas ouvert"),
  eHorsAgenda?.message?.slice(0, 60)
);

/* --- Supprimer avant d'annuler --- */

const { error: eSuppAvant } = await admin.rpc("supprimer_rdv_centre_appel", { p_rdv: rdvCrees[0] });
test(
  "Un rendez-vous confirmé ne se supprime pas : il s'annule d'abord",
  !!eSuppAvant && eSuppAvant.message.includes("Annulez d"),
  eSuppAvant?.message?.slice(0, 70)
);

/* --- Annuler --- */

const { error: eSansMotif } = await admin.rpc("annuler_rdv_centre_appel", {
  p_rdv: rdvCrees[0],
  p_motif: "   ",
});
test(
  "Une annulation sans motif est refusée",
  !!eSansMotif && eSansMotif.message.includes("motif"),
  eSansMotif?.message?.slice(0, 60)
);

const refusAnnuler = await patient.rpc("annuler_rdv_centre_appel", {
  p_rdv: rdvCrees[0],
  p_motif: "Test",
});
test("Annulation refusée à un patient", !!refusAnnuler.error, refusAnnuler.error?.message?.slice(0, 60));

const { error: eAnnule } = await admin.rpc("annuler_rdv_centre_appel", {
  p_rdv: rdvCrees[0],
  p_motif: "Le patient s'est décommandé (test)",
});
test("L'admin annule le rendez-vous avec un motif", !eAnnule, eAnnule?.message);

const { data: annule } = await service
  .from("rendez_vous")
  .select("statut, motif_annulation")
  .eq("id", rdvCrees[0])
  .single();
test(
  "…le motif est conservé en base",
  annule.statut === "annule" && annule.motif_annulation.includes("décommandé"),
  `${annule.statut} · ${annule.motif_annulation}`
);

const { count: notifsAnnulation } = await service
  .from("notifications")
  .select("id", { count: "exact", head: true })
  .eq("source_id", rdvCrees[0])
  .eq("type", "rdv_annule");
test("…patient et praticien sont prévenus", (notifsAnnulation ?? 0) >= 2, `${notifsAnnulation}`);

// Le créneau libéré redevient réservable : c'est ce qui distingue une
// annulation d'une simple étiquette posée sur la ligne.
const { data: ouvertApres } = await admin.rpc("creneau_ouvert_medecin", {
  p_medecin_id: annuleMedecinId(),
  p_date: nouveauCreneau?.jour ?? cible.jour,
  p_heure: nouveauCreneau?.heure ?? cible.heure,
});
test("…et le créneau est de nouveau libre", ouvertApres === true);

function annuleMedecinId() {
  return cible.medecin_id;
}

/* --- Supprimer --- */

const refusSupprimer = await medecinSession.rpc("supprimer_rdv_centre_appel", { p_rdv: rdvCrees[0] });
test(
  "Suppression refusée à un médecin",
  !!refusSupprimer.error,
  refusSupprimer.error?.message?.slice(0, 60)
);

const { error: eSupp } = await admin.rpc("supprimer_rdv_centre_appel", { p_rdv: rdvCrees[0] });
test("Un rendez-vous annulé se supprime", !eSupp, eSupp?.message);

const { count: reste } = await service
  .from("rendez_vous")
  .select("id", { count: "exact", head: true })
  .eq("id", rdvCrees[0]);
test("…la ligne a bien disparu", reste === 0);

const { count: notifsOrphelines } = await service
  .from("notifications")
  .select("id", { count: "exact", head: true })
  .eq("source_id", rdvCrees[0]);
test("…sans laisser de notification pointant dans le vide", notifsOrphelines === 0);

const { data: traceSuppression } = await service
  .from("journal_audit")
  .select("action")
  .eq("cible_id", rdvCrees[0])
  .ilike("action", "%supprim%")
  .maybeSingle();
test("…mais la trace d'audit, elle, subsiste", !!traceSuppression, traceSuppression?.action);

// Déjà supprimé côté base : on le retire de la liste de nettoyage.
rdvCrees.shift();

/* ================= 9. La confirmation part chez le patient ================= */

/*
 * Cette partie passe par la ROUTE et non par la RPC : l'envoi lit les secrets
 * de l'agrégateur et appelle `enregistrer_message`, deux choses interdites au
 * navigateur. Ce qu'on vérifie, c'est que le circuit complet est emprunté —
 * pas qu'un SMS arrive vraiment, ce qui dépend d'un contrat d'agrégateur.
 */
const APP = process.env.APP ?? "http://localhost:3001";

async function sessionCookies(email, motDePasse) {
  const bocal = new Map();
  const client = createServerClient(URL_SB, ANON, {
    cookies: {
      getAll: () => [...bocal].map(([name, value]) => ({ name, value })),
      setAll: (liste) => liste.forEach(({ name, value }) => bocal.set(name, value)),
    },
  });
  const { error } = await client.auth.signInWithPassword({ email, password: motDePasse });
  if (error) throw new Error(`connexion ${email} : ${error.message}`);
  const cookie = [...bocal].map(([n, v]) => `${n}=${encodeURIComponent(v)}`).join("; ");
  return (chemin, init = {}) =>
    fetch(`${APP}${chemin}`, {
      ...init,
      headers: { "Content-Type": "application/json", cookie, ...(init.headers ?? {}) },
    });
}

let serveurDebout = true;
try {
  await fetch(`${APP}/espace-admin/connexion`, { method: "HEAD" });
} catch {
  serveurDebout = false;
}

if (!serveurDebout) {
  console.log(`⏭️  Route de confirmation non testée : aucun serveur sur ${APP}.`);
} else {
  const appelAdmin = await sessionCookies("admin@docteur224.com", "alpha2308");
  const appelPatient = await sessionCookies("patient1@test.docteur224.com", "test1234");

  const { data: dispoRoute } = await admin.rpc("prochaines_dispos_medecins", {
    p_medecin_ids: [cible.medecin_id],
    p_jours: 14,
  });
  const creneauRoute = (dispoRoute ?? [])[0];

  // Un patient connecté ne doit pas pouvoir poser un rendez-vous par la route.
  const refusRoute = await appelPatient("/api/admin/rdv-centre-appel", {
    method: "POST",
    body: JSON.stringify({
      medecinId: cible.medecin_id,
      date: creneauRoute.jour,
      heure: creneauRoute.heure,
      patientCle: `c-${refPatient.id}`,
    }),
  });
  test("La route de prise refuse un patient connecté", refusRoute.status === 403, `HTTP ${refusRoute.status}`);

  const messagesAvant = (
    await service.from("messages_envoyes").select("id", { count: "exact", head: true })
  ).count;

  const reponse = await appelAdmin("/api/admin/rdv-centre-appel", {
    method: "POST",
    body: JSON.stringify({
      medecinId: cible.medecin_id,
      date: creneauRoute.jour,
      heure: creneauRoute.heure,
      motif: "Consultation (test confirmation)",
      patientCle: `c-${refPatient.id}`,
    }),
  });
  const corps = await reponse.json();
  test("La route pose le rendez-vous", reponse.ok && !!corps.id, corps.erreur ?? "");
  if (corps.id) rdvCrees.push(corps.id);

  test(
    "…et rend le détail de ce qui est parti chez le patient",
    !!corps.envoi && "canalTelephone" in corps.envoi && "emailEnvoye" in corps.envoi,
    corps.envoi ? `tél. ${corps.envoi.canalTelephone} · e-mail ${corps.envoi.emailEnvoye}` : "absent"
  );
  test(
    "…le canal téléphonique est emprunté",
    corps.envoi?.canalTelephone === "sms" || corps.envoi?.canalTelephone === "whatsapp",
    String(corps.envoi?.canalTelephone)
  );
  test(
    "…l'e-mail part aussi quand une adresse est connue",
    corps.envoi?.emailEnvoye === true,
    corps.envoi?.email ?? "aucune adresse"
  );
  test(
    "…et l'écran est prévenu que le mode est simulé",
    typeof corps.envoi?.simule === "boolean",
    corps.envoi?.simule ? "mode simulé — rien ne part réellement" : "mode réel"
  );

  const { data: messages } = await service
    .from("messages_envoyes")
    .select("canal, motif, titulaire_id, statut, destinataire")
    .eq("motif", "rdv_confirmation")
    .order("envoye_le", { ascending: false })
    .limit(4);
  const messagesApres = (
    await service.from("messages_envoyes").select("id", { count: "exact", head: true })
  ).count;
  test(
    "Les envois sont journalisés",
    messagesApres > messagesAvant,
    `${messagesAvant} → ${messagesApres}`
  );
  test(
    "…sur les deux canaux, au débit du praticien",
    (messages ?? []).some((m) => m.canal === "email") &&
      (messages ?? []).some((m) => m.canal === "sms" || m.canal === "whatsapp") &&
      (messages ?? [])[0]?.titulaire_id === cible.medecin_id,
    (messages ?? []).map((m) => m.canal).join(", ")
  );

  /* --- Déplacement et annulation par la route --- */
  if (corps.id) {
    const { data: dispoSuite } = await admin.rpc("prochaines_dispos_medecins", {
      p_medecin_ids: [cible.medecin_id],
      p_jours: 14,
    });
    const suite = (dispoSuite ?? [])[0];
    if (suite) {
      const rDeplace = await appelAdmin(`/api/admin/rdv-centre-appel/${corps.id}`, {
        method: "PUT",
        body: JSON.stringify({ date: suite.jour, heure: suite.heure }),
      });
      const cDeplace = await rDeplace.json();
      test("La route déplace et prévient", rDeplace.ok && !!cDeplace.envoi, cDeplace.erreur ?? "");
    }

    const rAnnule = await appelAdmin(`/api/admin/rdv-centre-appel/${corps.id}`, {
      method: "PATCH",
      body: JSON.stringify({ motif: "Test de la route d'annulation" }),
    });
    const cAnnule = await rAnnule.json();
    test("La route annule et prévient", rAnnule.ok && !!cAnnule.envoi, cAnnule.erreur ?? "");

    const rSansMotif = await appelAdmin(`/api/admin/rdv-centre-appel/${corps.id}`, {
      method: "PATCH",
      body: JSON.stringify({ motif: "" }),
    });
    test("…et refuse une annulation sans motif", rSansMotif.status === 400, `HTTP ${rSansMotif.status}`);

    const { data: messagesAnnul } = await service
      .from("messages_envoyes")
      .select("canal, motif")
      .eq("motif", "rdv_annulation")
      .limit(3);
    test(
      "Les messages d'annulation sont journalisés à part",
      (messagesAnnul ?? []).length > 0,
      `${(messagesAnnul ?? []).length} message(s)`
    );
  }
}

/* ================= Nettoyage ================= */

await service.from("notifications").delete().in("source_id", rdvCrees);
await service.from("journal_audit").delete().in("cible_id", rdvCrees);
await service.from("rendez_vous").delete().in("id", rdvCrees);
await service.from("patients_sans_compte").delete().in("id", fichesCrees);
await service.from("patients_sans_compte").delete().eq("nom", "Orpheline");
// Les messages du scénario ne doivent pas gonfler la consommation du
// praticien de démo : ils sont comptés dans son quota mensuel.
await service
  .from("messages_envoyes")
  .delete()
  .in("motif", ["rdv_confirmation", "rdv_deplacement", "rdv_annulation"]);

const { count: resteRdv } = await service
  .from("rendez_vous")
  .select("id", { count: "exact", head: true })
  .in("id", rdvCrees.length ? rdvCrees : ["00000000-0000-0000-0000-000000000000"]);
test("Le jeu de test est nettoyé", (resteRdv ?? 0) === 0, `${rdvCrees.length} rendez-vous supprimés`);

console.log(echecs === 0 ? "\n🎉 Tout est vert." : `\n${echecs} échec(s).`);
process.exit(echecs === 0 ? 0 : 1);
