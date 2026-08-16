import { NextResponse } from "next/server";
import { DocumentPdf } from "@/lib/pdf";
import { construireClasseur } from "@/lib/xlsx";
import { creerClientServeur } from "@/lib/supabase/server";
import { JOURS_LONGS, capitaliser, depuisISO, formatDateLongue } from "@/lib/dates";

/*
 * Export de l'agenda d'un praticien, en classeur Excel ou en PDF.
 *
 * Côté serveur, pour trois raisons :
 *   1. le PDF porte l'en-tête du praticien — nom, spécialité, établissement —
 *      qui est relu en base à partir de la SESSION, jamais reçu du client ;
 *   2. la période demandée peut couvrir plusieurs mois, bien au-delà de la
 *      fenêtre que l'écran garde en mémoire ;
 *   3. une réponse `Content-Disposition: attachment` suffit à déclencher le
 *      téléchargement — pas de blob à construire ni à libérer dans l'onglet.
 *
 * Le cloisonnement ne repose PAS sur le filtre `medecin_id` écrit ici : c'est
 * la RLS (`sel_rdv_medecin`, `sel_rdv_assistant`) qui décide de ce que la
 * session a le droit de lire. Le filtre n'est là que pour l'assistant, dont la
 * session voit l'agenda de son médecin et non le sien.
 */

export const runtime = "nodejs";

/** Un an : au-delà, l'export cesse d'être un document et devient une base. */
const MAX_JOURS = 366;

const ISO = /^\d{4}-\d{2}-\d{2}$/;

const LIBELLE_STATUT: Record<string, string> = {
  en_attente: "En attente",
  confirme: "Confirmé",
  annule: "Annulé",
  honore: "Honoré",
};

const LIBELLE_SOURCE: Record<string, string> = {
  en_ligne: "En ligne",
  cabinet: "Au cabinet",
  telephone: "Par téléphone",
};

const LIBELLE_FICHE: Record<string, string> = {
  compte: "Compte patient",
  proche: "Proche",
  sans_compte: "Fiche cabinet",
};

interface ContactUtilisateur {
  nom: string | null;
  prenom: string | null;
  telephone: string | null;
  email: string | null;
}

interface LigneRdv {
  id: string;
  date: string;
  heure: string;
  motif: string | null;
  statut: string;
  source: string | null;
  cree_le: string;
  lieu: string | null;
  adresse_domicile: string | null;
  motif_annulation: string | null;
  patient_id: string | null;
  proche_id: string | null;
  patient_sans_compte_id: string | null;
  patients: { utilisateurs: ContactUtilisateur | null } | null;
  proches: {
    nom: string;
    prenom: string;
    lien: string;
    patients: { utilisateurs: ContactUtilisateur | null } | null;
  } | null;
  patients_sans_compte: { nom: string; prenom: string; telephone: string | null } | null;
}

/** Une ligne d'agenda, mise à plat une seule fois pour les deux formats. */
interface LigneExport {
  date: string;
  heure: string;
  patient: string;
  typeFiche: string;
  telephone: string;
  motif: string;
  lieu: string;
  statut: string;
  source: string;
  creeLe: string;
}

function mettreAPlat(l: LigneRdv): LigneExport {
  const typeFiche = l.proche_id ? "proche" : l.patient_sans_compte_id ? "sans_compte" : "compte";
  const contact =
    typeFiche === "proche"
      ? (l.proches?.patients?.utilisateurs ?? null)
      : (l.patients?.utilisateurs ?? null);
  const compte = l.patients?.utilisateurs;

  const patient = l.proches
    ? `${l.proches.prenom} ${l.proches.nom}`
    : l.patients_sans_compte
      ? `${l.patients_sans_compte.prenom} ${l.patients_sans_compte.nom}`
      : compte
        ? `${compte.prenom ?? ""} ${compte.nom ?? ""}`.trim()
        : "Patient";

  const titulaire =
    typeFiche === "proche"
      ? `${l.proches?.patients?.utilisateurs?.prenom ?? ""} ${l.proches?.patients?.utilisateurs?.nom ?? ""}`.trim()
      : "";

  return {
    date: l.date,
    heure: l.heure.slice(0, 5),
    patient,
    typeFiche:
      typeFiche === "proche" && titulaire
        ? `${LIBELLE_FICHE.proche} de ${titulaire}`
        : (LIBELLE_FICHE[typeFiche] ?? typeFiche),
    // Un proche n'a pas de numéro à lui : on donne celui du titulaire du compte.
    telephone: contact?.telephone ?? l.patients_sans_compte?.telephone ?? "",
    motif: l.motif?.trim() || "Consultation",
    lieu:
      l.lieu === "domicile"
        ? `À domicile${l.adresse_domicile ? ` — ${l.adresse_domicile}` : ""}`
        : "Au cabinet",
    statut:
      l.statut === "annule" && l.motif_annulation
        ? `Annulé — ${l.motif_annulation}`
        : (LIBELLE_STATUT[l.statut] ?? l.statut),
    source: LIBELLE_SOURCE[l.source ?? "en_ligne"] ?? "En ligne",
    creeLe: l.cree_le.slice(0, 10),
  };
}

/** « agenda-2026-08-17-au-2026-08-23.xlsx » */
const nomFichier = (debut: string, fin: string, extension: string) =>
  debut === fin ? `agenda-${debut}.${extension}` : `agenda-${debut}-au-${fin}.${extension}`;

export async function GET(requete: Request) {
  const parametres = new URL(requete.url).searchParams;
  const format = parametres.get("format") === "pdf" ? "pdf" : "xlsx";
  const debut = parametres.get("debut") ?? "";
  const fin = parametres.get("fin") ?? "";
  const avecAnnules = parametres.get("annules") === "1";

  if (!ISO.test(debut) || !ISO.test(fin) || debut > fin) {
    return NextResponse.json({ erreur: "Période demandée invalide." }, { status: 400 });
  }
  const nbJours = Math.round((depuisISO(fin).getTime() - depuisISO(debut).getTime()) / 86400000) + 1;
  if (nbJours > MAX_JOURS) {
    return NextResponse.json(
      { erreur: `Période trop large : ${MAX_JOURS} jours au maximum par export.` },
      { status: 400 }
    );
  }

  const supabase = await creerClientServeur();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return NextResponse.json({ erreur: "Session expirée — reconnectez-vous." }, { status: 401 });
  }

  const { data: utilisateur } = await supabase
    .from("utilisateurs")
    .select("role")
    .eq("id", auth.user.id)
    .maybeSingle();
  if (!utilisateur || (utilisateur.role !== "medecin" && utilisateur.role !== "assistant")) {
    return NextResponse.json(
      { erreur: "Seul un compte médecin ou assistant peut exporter un agenda." },
      { status: 403 }
    );
  }

  // L'assistant exporte l'agenda de SON médecin, et seulement s'il a le droit
  // de le consulter. Sans ce contrôle, la RLS renverrait zéro ligne et le
  // fichier sortirait vide, sans dire pourquoi.
  let medecinId = auth.user.id;
  if (utilisateur.role === "assistant") {
    const { data: assistant } = await supabase
      .from("assistants")
      .select("medecin_id, peut_voir_agenda")
      .eq("id", auth.user.id)
      .maybeSingle();
    if (!assistant) {
      return NextResponse.json({ erreur: "Compte assistant introuvable." }, { status: 403 });
    }
    if (!assistant.peut_voir_agenda) {
      return NextResponse.json(
        { erreur: "La permission « Voir l’agenda » ne vous a pas été accordée." },
        { status: 403 }
      );
    }
    medecinId = assistant.medecin_id;
  }

  const { data: lignes, error } = await supabase
    .from("rendez_vous")
    .select(
      `id, date, heure, motif, statut, source, cree_le, lieu, adresse_domicile, motif_annulation,
       patient_id, proche_id, patient_sans_compte_id,
       patients ( utilisateurs ( nom, prenom, telephone, email ) ),
       proches ( nom, prenom, lien, patients ( utilisateurs ( nom, prenom, telephone, email ) ) ),
       patients_sans_compte ( nom, prenom, telephone )`
    )
    .eq("medecin_id", medecinId)
    .gte("date", debut)
    .lte("date", fin)
    .order("date")
    .order("heure");

  if (error) {
    return NextResponse.json({ erreur: "Lecture de l’agenda impossible." }, { status: 500 });
  }

  const rdvs = ((lignes ?? []) as unknown as LigneRdv[])
    .filter((l) => avecAnnules || l.statut !== "annule")
    .map(mettreAPlat);

  return format === "pdf"
    ? await enPdf(supabase, medecinId, debut, fin, rdvs)
    : enClasseur(debut, fin, rdvs);
}

/* ===== Classeur Excel ===== */

function enClasseur(debut: string, fin: string, rdvs: LigneExport[]): NextResponse {
  const octets = construireClasseur({
    // Excel refuse « / » dans un nom d'onglet : la date y passe en tirets.
    nomFeuille:
      debut === fin
        ? `Agenda ${debut.split("-").reverse().join("-")}`
        : `Agenda ${debut.slice(8)}-${debut.slice(5, 7)} au ${fin.slice(8)}-${fin.slice(5, 7)}`,
    colonnes: [
      { titre: "Date", largeur: 12, type: "date" },
      { titre: "Jour", largeur: 11 },
      { titre: "Heure", largeur: 8 },
      { titre: "Patient", largeur: 26 },
      { titre: "Fiche", largeur: 22 },
      { titre: "Téléphone", largeur: 17 },
      { titre: "Motif", largeur: 30 },
      { titre: "Lieu", largeur: 30 },
      { titre: "Statut", largeur: 22 },
      { titre: "Origine", largeur: 14 },
      { titre: "Pris le", largeur: 12, type: "date" },
    ],
    lignes: rdvs.map((r) => [
      r.date,
      capitaliser(JOURS_LONGS[depuisISO(r.date).getDay()]),
      r.heure,
      r.patient,
      r.typeFiche,
      r.telephone,
      r.motif,
      r.lieu,
      r.statut,
      r.source,
      r.creeLe,
    ]),
  });

  return new NextResponse(octets as unknown as BodyInit, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nomFichier(debut, fin, "xlsx")}"`,
      "Cache-Control": "no-store",
    },
  });
}

/* ===== PDF ===== */

async function enPdf(
  supabase: Awaited<ReturnType<typeof creerClientServeur>>,
  medecinId: string,
  debut: string,
  fin: string,
  rdvs: LigneExport[]
): Promise<NextResponse> {
  const { data: medecin } = await supabase
    .from("medecins")
    .select(
      `civilite, telephone_secretariat, quartier,
       utilisateurs ( nom, prenom, telephone ),
       specialites ( nom ),
       villes ( nom ),
       etablissements ( nom, adresse, quartier, telephone, villes ( nom ) )`
    )
    .eq("id", medecinId)
    .maybeSingle();

  const u = medecin?.utilisateurs as unknown as {
    nom: string | null;
    prenom: string | null;
    telephone: string | null;
  } | null;
  const etab = medecin?.etablissements as unknown as {
    nom: string;
    adresse: string | null;
    quartier: string | null;
    telephone: string | null;
    villes: { nom: string } | null;
  } | null;
  const specialite = (medecin?.specialites as unknown as { nom: string } | null)?.nom ?? "";
  const ville = (medecin?.villes as unknown as { nom: string } | null)?.nom ?? "";
  const nomMedecin = `${medecin?.civilite || "Dr"} ${u?.prenom ?? ""} ${u?.nom ?? ""}`.trim();
  const telephone = medecin?.telephone_secretariat || etab?.telephone || u?.telephone || "";

  const pdf = new DocumentPdf();

  pdf.texte(etab?.nom ?? "Cabinet médical", { gras: true, taille: 16, align: "centre" });
  pdf.saut(3);
  pdf.texte(nomMedecin, { gras: true, taille: 11.5, align: "centre" });
  if (specialite) pdf.texte(specialite.toUpperCase(), { taille: 8.5, gris: 0.35, align: "centre" });
  const adresse = [etab?.adresse, etab?.quartier ?? medecin?.quartier, etab?.villes?.nom ?? ville]
    .filter(Boolean)
    .join(", ");
  if (adresse) pdf.texte(adresse, { taille: 8.5, gris: 0.35, align: "centre" });
  if (telephone) pdf.texte(`Tél : ${telephone}`, { taille: 8.5, gris: 0.35, align: "centre" });

  pdf.saut(8).filet().saut(6);

  pdf.texte("AGENDA", { gras: true, taille: 13 });
  pdf.texte(
    debut === fin
      ? capitaliser(formatDateLongue(debut))
      : `Du ${formatDateLongue(debut)} au ${formatDateLongue(fin)}`,
    { taille: 10, gris: 0.3 }
  );

  const parJour = new Map<string, LigneExport[]>();
  for (const rdv of rdvs) {
    const jour = parJour.get(rdv.date) ?? [];
    jour.push(rdv);
    parJour.set(rdv.date, jour);
  }

  pdf.texte(
    `${rdvs.length} rendez-vous sur ${parJour.size} jour${parJour.size > 1 ? "s" : ""}` +
      ` · édité le ${new Date().toLocaleDateString("fr-FR")}`,
    { taille: 8.5, gris: 0.45 }
  );
  pdf.saut(10);

  if (rdvs.length === 0) {
    pdf.texte("Aucun rendez-vous sur cette période.", { taille: 10, gris: 0.4 });
  }

  // Une table par journée : sur une semaine, la coupure par jour est ce qui
  // rend la feuille utilisable au comptoir. Les largeurs somment à 473 pt,
  // soit la largeur utile d'une A4 portrait (483) moins une marge de sûreté.
  for (const [jour, lignes] of parJour) {
    pdf.saut(4);
    pdf.texte(
      `${capitaliser(formatDateLongue(jour))} — ${lignes.length} rendez-vous`,
      { gras: true, taille: 10.5 }
    );
    pdf.saut(2);
    pdf.tableau(
      [
        { titre: "Heure", largeur: 40 },
        { titre: "Patient", largeur: 112 },
        { titre: "Téléphone", largeur: 78 },
        { titre: "Motif", largeur: 128 },
        { titre: "Lieu", largeur: 60 },
        { titre: "Statut", largeur: 55 },
      ],
      lignes.map((r) => [
        r.heure,
        r.patient,
        r.telephone || "—",
        r.motif,
        r.lieu,
        r.statut,
      ])
    );
    pdf.saut(6);
  }

  pdf.piedDePage(
    `Agenda de ${nomMedecin}${etab?.nom ? ` — ${etab.nom}` : ""}, édité via Docteur 224 le ` +
      `${new Date().toLocaleDateString("fr-FR")}. Ce document contient des données de santé : ` +
      "il ne se transmet ni ne se laisse traîner hors du cabinet."
  );

  return new NextResponse(pdf.versOctets() as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${nomFichier(debut, fin, "pdf")}"`,
      "Cache-Control": "no-store",
    },
  });
}
