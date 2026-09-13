/*
 * Tests de l'espace établissement (/espace-etablissement, migration 0054).
 *
 * L'audit de cet espace a trouvé trois choses : un cycle d'invitation qui
 * ne pouvait pas aboutir, des écrans en lecture seule alors que la base
 * était branchée, et des chiffres inventés. Ce script vérifie que les
 * trois sont réparés — et surtout qu'elles le sont SANS ouvrir ce qui
 * devait rester fermé :
 *
 *   · le gestionnaire ne lit toujours aucun rendez-vous ni patient ;
 *   · il ne se valide pas lui-même, ne change pas son palier facturé,
 *     ne se réattribue pas un autre établissement ;
 *   · seul le médecin répond à une invitation qui le concerne.
 *
 * Le test est REJOUABLE : tout ce qu'il crée (invitation, rattachement)
 * est défait à la fin, et les champs de fiche modifiés sont remis dans
 * leur état initial.
 *
 * Prérequis : `npx next build && npx next start -p 3001`, base seedée.
 * Usage : node scripts/test-espace-etablissement.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { readFileSync } from "node:fs";

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const lire = (cle) => env.match(new RegExp(`^${cle}=(.*)$`, "m"))?.[1].trim();
const URL_SB = lire("NEXT_PUBLIC_SUPABASE_URL");
const ANON = lire("NEXT_PUBLIC_SUPABASE_ANON_KEY");
const MDP = "test1234";
const APP = process.env.APP ?? "http://localhost:3001";

const service = createClient(URL_SB, lire("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { autoRefreshToken: false, persistSession: false },
});

let echecs = 0;
const test = (nom, ok, detail) => {
  if (!ok) echecs++;
  console.log(`${ok ? "✅" : "❌"} ${nom}${detail ? ` — ${detail}` : ""}`);
};
const titre = (t) => console.log(`\n── ${t} ──`);

/** Session réelle (clé anon + mot de passe), donc RLS appliquée. */
async function session(email) {
  const client = createClient(URL_SB, ANON, { auth: { persistSession: false } });
  const { error } = await client.auth.signInWithPassword({ email, password: MDP });
  if (error) throw new Error(`Connexion ${email} : ${error.message}`);
  return client;
}

const EMAIL_ETAB = "etab.clinique-ambroise@test.docteur224.com";
const EMAIL_AUTRE_ETAB = "etab.hopital-donka@test.docteur224.com";

// ---------- Mise en place ----------
const { data: etabs } = await service
  .from("etablissements")
  .select("id, nom, type, statut, gestionnaire_id, rccm, site_web, description, telephone, email, adresse, quartier")
  .in("email", [EMAIL_ETAB, EMAIL_AUTRE_ETAB]);
const etab = etabs.find((e) => e.email === EMAIL_ETAB);
const autreEtab = etabs.find((e) => e.email === EMAIL_AUTRE_ETAB);
if (!etab || !autreEtab) throw new Error("Établissements de test introuvables : rejouez scripts/seed.mjs.");

const fiche = { ...etab };

/*
 * Un médecin validé, libre de tout rattachement, ET qui n'a AUCUNE
 * invitation en cours.
 *
 * Cette dernière condition n'est pas un détail : le test repart d'une
 * ardoise propre en supprimant les invitations de son cobaye. En prenant
 * le premier venu, il pouvait tomber sur un praticien réellement invité
 * par quelqu'un et effacer cette invitation — c'est arrivé.
 */
const { data: libres } = await service
  .from("medecins")
  .select("id, utilisateurs ( email )")
  .eq("statut", "valide")
  .is("etablissement_id", null);
const { data: dejaInvites } = await service
  .from("invitations_etablissement")
  .select("medecin_id");
const occupes = new Set((dejaInvites ?? []).map((i) => i.medecin_id));
const medecinLibre = (libres ?? []).find((m) => !occupes.has(m.id) && m.utilisateurs?.email);
if (!medecinLibre) {
  throw new Error(
    "Aucun médecin validé, sans établissement et sans invitation en cours. " +
      "Rejouez scripts/seed.mjs, ou traitez les invitations en attente."
  );
}
const emailMedecin = medecinLibre.utilisateurs.email;
console.log(`(cobaye : ${emailMedecin})`);

const gestionnaire = await session(EMAIL_ETAB);
const autreGestionnaire = await session(EMAIL_AUTRE_ETAB);
const medecin = await session(emailMedecin);

// On part d'une ardoise propre, même si un test précédent a échoué.
await service.from("invitations_etablissement").delete().eq("medecin_id", medecinLibre.id);

// ---------- 1. Cycle d'invitation, de bout en bout ----------
titre("Invitation → réponse du médecin → rattachement");

const { data: inv, error: eInv } = await gestionnaire
  .from("invitations_etablissement")
  .insert({ etablissement_id: etab.id, medecin_id: medecinLibre.id })
  .select("id, statut")
  .single();
test("le gestionnaire envoie une invitation", !eInv && inv?.statut === "envoyee", eInv?.message);

const { data: notif } = await service
  .from("notifications")
  .select("type, lien")
  .eq("destinataire_id", medecinLibre.id)
  .eq("source_id", inv.id)
  .maybeSingle();
test("le médecin reçoit la notification", notif?.type === "invitation_recue", `lien : ${notif?.lien}`);

const { data: vueMedecin } = await medecin
  .from("invitations_etablissement")
  .select("id, statut, etablissements ( nom )")
  .eq("id", inv.id)
  .maybeSingle();
test(
  "le médecin voit l'invitation et son établissement",
  vueMedecin?.id === inv.id && Boolean(vueMedecin?.etablissements?.nom),
  vueMedecin?.etablissements?.nom
);

// Le cœur du bug : `repondre_invitation` n'était appelée par aucun écran.
const { error: eRep } = await medecin.rpc("repondre_invitation", {
  p_invitation_id: inv.id,
  p_accepte: true,
});
const { data: apresAccept } = await service
  .from("medecins")
  .select("etablissement_id")
  .eq("id", medecinLibre.id)
  .single();
test(
  "le médecin accepte et se retrouve rattaché",
  !eRep && apresAccept.etablissement_id === etab.id,
  eRep?.message
);

const { data: rattaches } = await gestionnaire
  .from("medecins")
  .select("id")
  .eq("etablissement_id", etab.id);
test(
  "le médecin apparaît dans la liste du gestionnaire",
  rattaches.some((m) => m.id === medecinLibre.id)
);

// ---------- 2. Retrait d'un médecin (detacher_medecin) ----------
titre("Retrait d'un médecin rattaché");

const { error: eVol } = await autreGestionnaire.rpc("detacher_medecin", {
  p_medecin_id: medecinLibre.id,
});
test("un autre établissement ne peut pas le détacher", Boolean(eVol), eVol?.message);

const { error: eSelf } = await medecin.rpc("detacher_medecin", { p_medecin_id: medecinLibre.id });
test("le médecin ne se détache pas lui-même par cette voie", Boolean(eSelf), eSelf?.message);

const { error: eDet } = await gestionnaire.rpc("detacher_medecin", {
  p_medecin_id: medecinLibre.id,
});
const { data: apresRetrait } = await service
  .from("medecins")
  .select("etablissement_id")
  .eq("id", medecinLibre.id)
  .single();
test(
  "le gestionnaire retire le médecin",
  !eDet && apresRetrait.etablissement_id === null,
  eDet?.message
);

const { data: notifRetrait } = await service
  .from("notifications")
  .select("type")
  .eq("destinataire_id", medecinLibre.id)
  .eq("type", "rattachement_retire")
  // La plus récente, et elle seule : `maybeSingle()` sur plusieurs lignes
  // lève une erreur. Une exécution interrompue avant son nettoyage — un
  // `| head` sur la sortie suffit à la tuer — laissait sinon une
  // notification derrière elle et faisait échouer la suivante.
  .order("cree_le", { ascending: false })
  .limit(1)
  .maybeSingle();
test("le médecin est prévenu du retrait", notifRetrait?.type === "rattachement_retire");

// Le retrait doit être rejouable : l'invitation acceptée est supprimée,
// sinon `unique (etablissement_id, medecin_id)` bloquerait la suivante.
const { error: eReInv } = await gestionnaire
  .from("invitations_etablissement")
  .insert({ etablissement_id: etab.id, medecin_id: medecinLibre.id });
test("un médecin retiré peut être réinvité", !eReInv, eReInv?.message);

// ---------- 3. Annulation d'une invitation en attente ----------
titre("Annulation d'une invitation");

const { data: enAttente } = await service
  .from("invitations_etablissement")
  .select("id")
  .eq("medecin_id", medecinLibre.id)
  .maybeSingle();
const { error: eAnnulVol } = await autreGestionnaire
  .from("invitations_etablissement")
  .delete()
  .eq("id", enAttente.id);
const { data: toujoursLa } = await service
  .from("invitations_etablissement")
  .select("id")
  .eq("id", enAttente.id)
  .maybeSingle();
test(
  "un autre établissement ne peut pas annuler l'invitation",
  !eAnnulVol && Boolean(toujoursLa),
  "la RLS filtre sans lever d'erreur : on vérifie la ligne"
);

await gestionnaire.from("invitations_etablissement").delete().eq("id", enAttente.id);
const { data: partie } = await service
  .from("invitations_etablissement")
  .select("id")
  .eq("id", enAttente.id)
  .maybeSingle();
test("le gestionnaire annule son invitation", partie === null);

// ---------- 4. Fiche modifiable (écran Informations) ----------
titre("Fiche de l'établissement");

const nouveau = {
  nom: `${fiche.nom} (test)`,
  description: "Description écrite par le test.",
  adresse: "Rue KA-020",
  quartier: "Kaloum",
  telephone: "+224622999999",
  email: fiche.email,
  site_web: "https://exemple-test.gn",
  rccm: "GC-TEST/000.000A/2026",
};
const { error: eMaj } = await gestionnaire.from("etablissements").update(nouveau).eq("id", etab.id);
const { data: relue } = await gestionnaire
  .from("etablissements")
  .select("nom, description, adresse, quartier, telephone, site_web, rccm")
  .eq("id", etab.id)
  .single();
test(
  "le gestionnaire enregistre sa fiche",
  !eMaj && relue.nom === nouveau.nom && relue.site_web === nouveau.site_web && relue.rccm === nouveau.rccm,
  eMaj?.message
);

const { error: eAutreFiche } = await autreGestionnaire
  .from("etablissements")
  .update({ nom: "Détourné" })
  .eq("id", etab.id);
const { data: intacte } = await service
  .from("etablissements")
  .select("nom")
  .eq("id", etab.id)
  .single();
test(
  "un autre gestionnaire ne modifie pas cette fiche",
  !eAutreFiche && intacte.nom === nouveau.nom
);

// ---------- 5. Ce que le gestionnaire n'écrit pas ----------
titre("Colonnes réservées à la plateforme");

// L'auto-validation se teste depuis un dossier RÉELLEMENT en attente :
// partir d'une fiche déjà « valide » n'écrit rien, donc ne déclenche
// aucune garde, et le test passerait pour de mauvaises raisons.
await service.from("etablissements").update({ statut: "en_attente" }).eq("id", etab.id);
const interdits = [
  ["se valider soi-même", { statut: "valide" }],
  ["changer son palier facturé (type)", { type: "Poste de santé" }],
  ["se réattribuer l'établissement", { gestionnaire_id: autreEtab.gestionnaire_id }],
];
for (const [quoi, patch] of interdits) {
  const { error } = await gestionnaire.from("etablissements").update(patch).eq("id", etab.id);
  test(`refusé : ${quoi}`, Boolean(error), error?.message?.slice(0, 90));
}
await service.from("etablissements").update({ statut: "valide" }).eq("id", etab.id);

// La mise en pause volontaire, elle, doit rester possible (migration 0045).
const { error: ePause } = await gestionnaire
  .from("etablissements")
  .update({ statut: "suspendu" })
  .eq("id", etab.id);
await service.from("etablissements").update({ statut: fiche.statut }).eq("id", etab.id);
test("autorisé : mettre sa propre fiche en pause", !ePause, ePause?.message);

// ---------- 6. Statistiques : justes, et sans données patient ----------
titre("Statistiques consolidées");

const { data: stats, error: eStats } = await gestionnaire.rpc("statistiques_etablissement", {
  p_etablissement_id: etab.id,
});
test("le gestionnaire obtient ses statistiques", !eStats && stats !== null, eStats?.message);

const { error: eStatsVol } = await autreGestionnaire.rpc("statistiques_etablissement", {
  p_etablissement_id: etab.id,
});
test("celles d'un autre établissement lui sont refusées", Boolean(eStatsVol), eStatsVol?.message);

if (stats) {
  const { data: medecinsEtab } = await service
    .from("medecins")
    .select("id")
    .eq("etablissement_id", etab.id);
  const ids = medecinsEtab.map((m) => m.id);
  const { count: attenduMois } = await service
    .from("rendez_vous")
    .select("id", { count: "exact", head: true })
    .in("medecin_id", ids)
    .gte("date", new Date().toISOString().slice(0, 8) + "01");

  test(
    "« RDV ce mois » correspond au vrai décompte",
    stats.rdvMois === attenduMois,
    `RPC ${stats.rdvMois} · base ${attenduMois}`
  );
  test("« médecins » correspond aux rattachés", stats.medecins === ids.length);
  test("le graphique couvre six mois", stats.parMois?.length === 6, `${stats.parMois?.length}`);
  test(
    "les mois sortent en AAAA-MM (formatés en français côté client)",
    stats.parMois?.every((m) => /^\d{4}-\d{2}$/.test(m.mois))
  );
  test(
    "les taux sont un pourcentage ou null, jamais un chiffre inventé",
    [stats.tauxAnnulation, stats.tauxHonores].every(
      (t) => t === null || (typeof t === "number" && t >= 0 && t <= 100)
    ),
    `annulation ${stats.tauxAnnulation} · honorés ${stats.tauxHonores}`
  );

}

/*
 * Le point de cloisonnement : « prochains rendez-vous » ne doit porter
 * aucune identité de patient. Le contrôle se fait sur l'établissement qui
 * a RÉELLEMENT des rendez-vous à venir — sur une liste vide, il ne
 * prouverait rien.
 */
const { data: statsAutre } = await autreGestionnaire.rpc("statistiques_etablissement", {
  p_etablissement_id: autreEtab.id,
});
const prochains = statsAutre?.prochains ?? [];
test("l'établissement témoin a bien des rendez-vous à venir", prochains.length > 0, `${prochains.length}`);

const champs = [...new Set(prochains.flatMap((p) => Object.keys(p)))];
const fuite = champs.filter((c) => /patient|proche|reserve_par|motif/.test(c));
test(
  "aucune donnée de patient dans « prochains rendez-vous »",
  prochains.length > 0 && fuite.length === 0,
  `champs : ${champs.join(", ")}`
);
/*
 * Les clés comptent autant que les valeurs : le tableau de bord lit
 * `medecinId` pour retrouver le nom du praticien. Tant que la RPC rendait
 * `medecin_id`, chaque ligne retombait silencieusement sur le libellé de
 * repli « Médecin de l'établissement ».
 */
test(
  "chaque ligne porte l'heure, la date, le statut et `medecinId`",
  prochains.every((p) => p.heure && p.date && p.statut && p.medecinId),
  JSON.stringify(prochains[0] ?? null)
);

// ---------- 7. Le cloisonnement tient toujours ----------
titre("Ce que le gestionnaire ne voit pas");

const { data: rdvDirect } = await gestionnaire.from("rendez_vous").select("id").limit(5);
test("aucun rendez-vous lisible en direct", (rdvDirect ?? []).length === 0);

const { data: patientsDirect } = await gestionnaire.from("patients").select("id").limit(5);
test("aucun dossier patient lisible", (patientsDirect ?? []).length === 0);

// ---------- 8. Les sept écrans répondent à un gestionnaire connecté ----------
titre("Écrans de l'espace");

/* Même session, mais côté HTTP : cookies portés jusqu'au serveur Next. */
const bocal = new Map();
const surServeur = createServerClient(URL_SB, ANON, {
  cookies: {
    getAll: () => [...bocal].map(([name, value]) => ({ name, value })),
    setAll: (liste) => liste.forEach(({ name, value }) => bocal.set(name, value)),
  },
});
await surServeur.auth.signInWithPassword({ email: EMAIL_ETAB, password: MDP });
const cookie = [...bocal].map(([n, v]) => `${n}=${encodeURIComponent(v)}`).join("; ");

for (const chemin of [
  "/espace-etablissement",
  "/espace-etablissement/medecins",
  "/espace-etablissement/informations",
  "/espace-etablissement/statistiques",
  "/espace-etablissement/abonnement",
  "/espace-etablissement/compte",
  "/espace-etablissement/mon-compte",
]) {
  try {
    const r = await fetch(`${APP}${chemin}`, { headers: { cookie }, redirect: "manual" });
    const html = r.status === 200 ? await r.text() : "";
    test(
      `${chemin} répond`,
      r.status === 200 && !/Application error|Internal Server Error/i.test(html),
      `HTTP ${r.status}`
    );
  } catch (e) {
    test(`${chemin} répond`, false, `serveur injoignable (${APP}) — ${e.message}`);
  }
}

// ---------- Remise en état ----------
await service.from("invitations_etablissement").delete().eq("medecin_id", medecinLibre.id);
await service.from("medecins").update({ etablissement_id: null }).eq("id", medecinLibre.id);
await service
  .from("notifications")
  .delete()
  .eq("destinataire_id", medecinLibre.id)
  .in("type", ["invitation_recue", "rattachement_retire"]);
await service
  .from("etablissements")
  .update({
    nom: fiche.nom,
    description: fiche.description,
    adresse: fiche.adresse,
    quartier: fiche.quartier,
    telephone: fiche.telephone,
    site_web: fiche.site_web,
    rccm: fiche.rccm,
    statut: fiche.statut,
  })
  .eq("id", etab.id);

console.log(`\n${echecs === 0 ? "✅ Tout passe." : `❌ ${echecs} test(s) en échec.`}`);
process.exit(echecs === 0 ? 0 : 1);
