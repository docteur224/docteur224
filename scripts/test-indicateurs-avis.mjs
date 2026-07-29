/*
 * Tests des indicateurs d'avis de l'espace admin (migration 0012).
 *
 * Vérifie le verrou d'accès, la cohérence des agrégats et — surtout — que la
 * pondération bayésienne du classement fait bien son travail : sans elle, une
 * note de 5,0 obtenue sur un seul avis raflerait la première place.
 *
 * Exécution : node scripts/test-indicateurs-avis.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const lire = (cle) => env.match(new RegExp(`^${cle}=(.*)$`, "m"))?.[1].trim();
const URL_SB = lire("NEXT_PUBLIC_SUPABASE_URL");
const ANON = lire("NEXT_PUBLIC_SUPABASE_ANON_KEY");
const SERVICE = lire("SUPABASE_SERVICE_ROLE_KEY");

const resultats = [];
const test = (nom, ok, detail) => {
  resultats.push({ nom, ok });
  console.log(`${ok ? "✅" : "❌"} ${nom}${detail ? ` — ${detail}` : ""}`);
};

async function clientPour(email, mdp) {
  const c = createClient(URL_SB, ANON, { auth: { persistSession: false } });
  const { error } = await c.auth.signInWithPassword({ email, password: mdp });
  if (error) throw new Error(`connexion ${email}: ${error.message}`);
  return c;
}

const service = createClient(URL_SB, SERVICE, { auth: { persistSession: false } });
const anon = createClient(URL_SB, ANON, { auth: { persistSession: false } });
const admin = await clientPour("admin@docteur224.com", "alpha2308");
const patient = await clientPour("patient1@test.docteur224.com", "test1234");
const medecin = await clientPour("medecin2@test.docteur224.com", "test1234");

// ---------- 1. Verrou d'accès ----------
for (const [nom, client] of [
  ["Anonyme", anon],
  ["Patient", patient],
  ["Médecin", medecin],
]) {
  const s = await client.rpc("avis_stats_globales");
  const c = await client.rpc("avis_classement_medecins", { p_ordre: "meilleurs", p_limite: 5 });
  const r = await client.rpc("avis_repartition");
  test(
    `${nom} → indicateurs refusés`,
    !!s.error && !!c.error && !!r.error,
    s.error?.message?.slice(0, 45)
  );
}

const stats = (await admin.rpc("avis_stats_globales")).data[0];
const repartition = (await admin.rpc("avis_repartition")).data;
const seuil = (await admin.rpc("avis_seuil_fiabilite")).data;

test("Admin → indicateurs accessibles", !!stats && Array.isArray(repartition), `seuil = ${seuil}`);

// ---------- 2. Cohérence des agrégats ----------
{
  const sommeRepartition = repartition.reduce((s, r) => s + Number(r.nb), 0);
  test(
    "La répartition totalise exactement les avis publiés",
    sommeRepartition === Number(stats.avis_publies),
    `${sommeRepartition} vs ${stats.avis_publies}`
  );

  const parTon =
    Number(stats.nb_positifs) + Number(stats.nb_neutres) + Number(stats.nb_negatifs);
  test(
    "Positifs + neutres + négatifs = avis publiés",
    parTon === Number(stats.avis_publies),
    `${parTon} vs ${stats.avis_publies}`
  );

  test("La répartition couvre bien 5★ → 1★", repartition.length === 5 && Number(repartition[0].etoiles) === 5);

  // Moyenne recalculée depuis la répartition : détecte une divergence entre
  // les deux fonctions SQL (elles doivent lire le même périmètre).
  const somme = repartition.reduce((s, r) => s + Number(r.etoiles) * Number(r.nb), 0);
  const moyenne = sommeRepartition > 0 ? somme / sommeRepartition : 0;
  test(
    "La note moyenne correspond à la répartition",
    Math.abs(moyenne - Number(stats.note_moyenne)) < 0.02,
    `${moyenne.toFixed(2)} vs ${stats.note_moyenne}`
  );
}

// ---------- 3. Périmètre : seuls les avis publiés comptent ----------
{
  const { data: unAvis } = await service
    .from("avis")
    .select("id")
    .eq("statut", "publie")
    .limit(1)
    .single();
  await service.from("avis").update({ statut: "rejete" }).eq("id", unAvis.id);

  const apres = (await admin.rpc("avis_stats_globales")).data[0];
  test(
    "Un avis masqué sort des avis publiés",
    Number(apres.avis_publies) === Number(stats.avis_publies) - 1,
    `${apres.avis_publies} vs ${stats.avis_publies}`
  );
  test("Un avis masqué est compté comme masqué", Number(apres.avis_masques) === Number(stats.avis_masques) + 1);

  await service.from("avis").update({ statut: "publie" }).eq("id", unAvis.id);
  const restaure = (await admin.rpc("avis_stats_globales")).data[0];
  test(
    "Republier l'avis rétablit les compteurs",
    Number(restaure.avis_publies) === Number(stats.avis_publies)
  );
}

// ---------- 4. Couverture ----------
{
  const { count: valides } = await service
    .from("medecins")
    .select("id", { count: "exact", head: true })
    .eq("statut", "valide");
  const { count: notes } = await service
    .from("medecins")
    .select("id", { count: "exact", head: true })
    .eq("statut", "valide")
    .gt("nb_avis", 0);
  test(
    "Le taux de couverture reflète la base",
    Number(stats.medecins_valides) === valides && Number(stats.medecins_notes) === notes,
    `${stats.medecins_notes}/${stats.medecins_valides}`
  );
}

// ---------- 5. Pondération bayésienne ----------
const meilleurs = (await admin.rpc("avis_classement_medecins", { p_ordre: "meilleurs", p_limite: 20 }))
  .data;

{
  const moyennePlateforme = Number(stats.note_moyenne);

  // La formule doit être appliquée à la lettre :
  //   score = (v/(v+m)) * R + (m/(v+m)) * C
  const ecarts = meilleurs.map((l) => {
    const v = Number(l.nb_avis);
    const R = Number(l.note_moyenne);
    const attendu = (v / (v + seuil)) * R + (seuil / (v + seuil)) * moyennePlateforme;
    return Math.abs(attendu - Number(l.score_pondere));
  });
  test(
    "Le score suit la formule bayésienne",
    ecarts.every((e) => e < 0.02),
    `écart max ${Math.max(0, ...ecarts).toFixed(3)}`
  );

  // Propriété centrale : un médecin peu noté est ramené vers la moyenne de la
  // plateforme. Au-dessus de la moyenne il est tiré vers le bas, en dessous
  // il est remonté — c'est ce qui empêche un 5,0 sur un avis de rafler la
  // première place, et un 1,0 sur un avis d'être cloué au pilori.
  const petitsVolumes = meilleurs.filter((l) => Number(l.nb_avis) < seuil);
  const tiresVersLaMoyenne = petitsVolumes.every((l) => {
    const R = Number(l.note_moyenne);
    const score = Number(l.score_pondere);
    return R > moyennePlateforme ? score < R : score >= R;
  });
  test(
    "Les médecins peu notés sont ramenés vers la moyenne",
    petitsVolumes.length > 0 && tiresVersLaMoyenne,
    `${petitsVolumes.length} médecin(s) sous le seuil de ${seuil}`
  );

  // Le cas concret que la pondération doit corriger : une note parfaite sur
  // très peu d'avis ne doit pas être première du classement.
  const parfaitPeuNote = meilleurs.find(
    (l) => Number(l.note_moyenne) === 5 && Number(l.nb_avis) < seuil
  );
  if (parfaitPeuNote) {
    const rang = meilleurs.indexOf(parfaitPeuNote);
    test(
      "Un 5,0 sur trop peu d'avis ne prend pas la 1re place",
      rang > 0,
      `${parfaitPeuNote.nom_complet} (5,0 sur ${parfaitPeuNote.nb_avis} avis) est ${rang + 1}e`
    );
  } else {
    test("Un 5,0 sur trop peu d'avis ne prend pas la 1re place", true, "cas absent du jeu de données");
  }

  test(
    "Aucun médecin sous le seuil n'est éligible récompense",
    meilleurs.every((l) => l.eligible_recompense === Number(l.nb_avis) >= seuil)
  );
}

// ---------- 6. Ordres de tri ----------
{
  const decroissant = meilleurs.every(
    (l, i) => i === 0 || Number(meilleurs[i - 1].score_pondere) >= Number(l.score_pondere)
  );
  test("« Mieux notés » est trié par score décroissant", decroissant);

  const moinsBons = (
    await admin.rpc("avis_classement_medecins", { p_ordre: "moins_bons", p_limite: 20 })
  ).data;
  const croissant = moinsBons.every(
    (l, i) => i === 0 || Number(moinsBons[i - 1].score_pondere) <= Number(l.score_pondere)
  );
  test("« À accompagner » est trié par score croissant", croissant);

  const plusAvis = (
    await admin.rpc("avis_classement_medecins", { p_ordre: "plus_avis", p_limite: 20 })
  ).data;
  const parVolume = plusAvis.every(
    (l, i) => i === 0 || Number(plusAvis[i - 1].nb_avis) >= Number(l.nb_avis)
  );
  test("« Plus d'avis » est trié par volume décroissant", parVolume);

  test(
    "Les classements de qualité excluent les médecins jamais notés",
    meilleurs.every((l) => Number(l.nb_avis) > 0) && moinsBons.every((l) => Number(l.nb_avis) > 0)
  );

  const sansAvis = (
    await admin.rpc("avis_classement_medecins", { p_ordre: "sans_avis", p_limite: 20 })
  ).data;
  test(
    "« Aucun avis » ne remonte que des médecins à 0 avis",
    sansAvis.every((l) => Number(l.nb_avis) === 0),
    `${sansAvis.length} médecin(s)`
  );
  test(
    "Les deux listes se complètent (notés + non notés = validés)",
    meilleurs.length + sansAvis.length === Number(stats.medecins_valides),
    `${meilleurs.length} + ${sansAvis.length} vs ${stats.medecins_valides}`
  );
}

// ---------- 7. Limite ----------
{
  const top3 = (await admin.rpc("avis_classement_medecins", { p_ordre: "meilleurs", p_limite: 3 })).data;
  test("La limite du Top est respectée", top3.length === Math.min(3, meilleurs.length), `${top3.length} ligne(s)`);
  test(
    "Le Top 3 est bien la tête du Top 20",
    top3.every((l, i) => l.medecin_id === meilleurs[i].medecin_id)
  );
}

// ---------- 8. Avis sans réponse ----------
{
  const attendus = await Promise.all(
    meilleurs.map(async (l) => {
      const { count } = await service
        .from("avis")
        .select("id", { count: "exact", head: true })
        .eq("medecin_id", l.medecin_id)
        .eq("statut", "publie")
        .is("reponse_medecin", null);
      return count === Number(l.nb_sans_reponse);
    })
  );
  test("Le compteur d'avis sans réponse est exact pour chaque médecin", attendus.every(Boolean));
}

const echecs = resultats.filter((r) => !r.ok).length;
console.log(`\n${resultats.length - echecs}/${resultats.length} tests réussis.`);
process.exit(echecs === 0 ? 0 : 1);
