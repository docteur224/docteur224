import { NextResponse } from "next/server";
import { DocumentPdf } from "@/lib/pdf";
import { creerClientServeur } from "@/lib/supabase/server";

/*
 * Génération du PDF d'un document remis à un patient (ordonnance, compte
 * rendu…), à partir du type et du texte saisis par le médecin.
 *
 * Côté serveur et non dans le navigateur, pour une raison de fond :
 * l'en-tête engage l'identité d'un praticien. Tout ce qui l'identifie — nom,
 * civilité, spécialité, établissement, téléphone — est relu en base à partir
 * de la SESSION, jamais reçu du client. Le corps du document est la seule
 * chose que l'appelant fournit.
 *
 * Le document porte une mention « généré électroniquement » et ne contient
 * ni code d'identification professionnel ni image de signature : ce serait
 * fabriquer des marques d'authenticité que l'application ne peut pas vérifier.
 */

const LIBELLES: Record<string, string> = {
  ordonnance: "ORDONNANCE",
  compte_rendu: "COMPTE RENDU DE CONSULTATION",
  resultat: "RÉSULTAT D’EXAMEN",
  certificat: "CERTIFICAT MÉDICAL",
  autre: "DOCUMENT MÉDICAL",
};

const dateLisible = (d: Date) =>
  d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });

/** « 2 ans 5 mois », ou « 34 ans » au-delà de trois ans. */
function age(naissance: string | null): string {
  if (!naissance) return "";
  const n = new Date(naissance);
  const now = new Date();
  let mois = (now.getFullYear() - n.getFullYear()) * 12 + (now.getMonth() - n.getMonth());
  if (now.getDate() < n.getDate()) mois -= 1;
  if (mois < 0) return "";
  const ans = Math.floor(mois / 12);
  if (ans >= 3) return `${ans} ans`;
  const reste = mois % 12;
  return `${ans} an${ans > 1 ? "s" : ""}${reste ? ` ${reste} mois` : ""}`;
}

export async function POST(requete: Request) {
  const supabase = await creerClientServeur();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return NextResponse.json({ erreur: "Session expirée — reconnectez-vous." }, { status: 401 });
  }

  const corps = await requete.json().catch(() => null);
  const type = String(corps?.type ?? "autre");
  const titre = String(corps?.titre ?? "").trim();
  const contenu = String(corps?.contenu ?? "").trim();
  const patientId = corps?.patientId ? String(corps.patientId) : null;
  const procheId = corps?.procheId ? String(corps.procheId) : null;

  if (!titre || !contenu) {
    return NextResponse.json(
      { erreur: "Un titre et un contenu sont nécessaires pour générer le document." },
      { status: 400 }
    );
  }
  if (!patientId && !procheId) {
    return NextResponse.json({ erreur: "Destinataire manquant." }, { status: 400 });
  }

  // ----- Identité du praticien, relue en base -----
  const { data: medecin } = await supabase
    .from("medecins")
    .select(
      `civilite, telephone_secretariat, quartier,
       utilisateurs ( nom, prenom, telephone, role ),
       specialites ( nom ),
       villes ( nom ),
       etablissements ( nom, type, adresse, quartier, telephone, villes ( nom ) )`
    )
    .eq("id", auth.user.id)
    .maybeSingle();

  const u = medecin?.utilisateurs as unknown as { nom: string | null; prenom: string | null; telephone: string | null; role: string } | null;
  if (!medecin || u?.role !== "medecin") {
    return NextResponse.json(
      { erreur: "Seul un compte médecin peut générer un document." },
      { status: 403 }
    );
  }

  // ----- Identité du destinataire -----
  // Les mêmes lectures que le reste de l'app : la RLS refuse un patient avec
  // qui le médecin n'a aucun rendez-vous, on n'a pas de contrôle à réécrire.
  let nomPatient = "";
  let naissance: string | null = null;
  if (patientId) {
    const { data } = await supabase
      .from("patients")
      .select("date_naissance, utilisateurs ( nom, prenom )")
      .eq("id", patientId)
      .maybeSingle();
    const p = data?.utilisateurs as unknown as { nom: string | null; prenom: string | null } | null;
    if (!data) {
      return NextResponse.json({ erreur: "Patient introuvable." }, { status: 404 });
    }
    nomPatient = `${(p?.nom ?? "").toUpperCase()} ${p?.prenom ?? ""}`.trim();
    naissance = data.date_naissance;
  } else {
    const { data } = await supabase
      .from("proches")
      .select("nom, prenom, date_naissance")
      .eq("id", procheId!)
      .maybeSingle();
    if (!data) {
      return NextResponse.json({ erreur: "Proche introuvable." }, { status: 404 });
    }
    nomPatient = `${data.nom.toUpperCase()} ${data.prenom}`.trim();
    naissance = data.date_naissance;
  }

  // ----- Mise en page -----
  const etab = medecin.etablissements as unknown as {
    nom: string;
    type: string | null;
    adresse: string | null;
    quartier: string | null;
    telephone: string | null;
    villes: { nom: string } | null;
  } | null;
  const specialite = (medecin.specialites as unknown as { nom: string } | null)?.nom ?? "";
  const ville = (medecin.villes as unknown as { nom: string } | null)?.nom ?? "";
  const nomMedecin = `${medecin.civilite || "Dr"} ${u?.prenom ?? ""} ${u?.nom ?? ""}`.trim();
  const telephone = medecin.telephone_secretariat || etab?.telephone || u?.telephone || "";

  const pdf = new DocumentPdf();

  pdf.texte(etab?.nom ?? "Cabinet médical", { gras: true, taille: 17, align: "centre" });
  pdf.saut(4);
  pdf.texte(nomMedecin, { gras: true, taille: 12, align: "centre" });
  if (specialite) {
    pdf.texte(specialite.toUpperCase(), { taille: 9, gris: 0.35, align: "centre" });
  }
  const adresse = [etab?.adresse, etab?.quartier ?? medecin.quartier, etab?.villes?.nom ?? ville]
    .filter(Boolean)
    .join(", ");
  if (adresse) pdf.texte(adresse, { taille: 9, gris: 0.35, align: "centre" });
  if (telephone) pdf.texte(`Tél : ${telephone}`, { taille: 9, gris: 0.35, align: "centre" });

  pdf.saut(6).filet().saut(6);

  pdf.texte(`${ville || "Conakry"}, le ${dateLisible(new Date())}`, {
    taille: 9.5,
    align: "droite",
    gris: 0.25,
  });
  pdf.saut(10);

  pdf.texte(nomPatient, { gras: true, taille: 11, align: "droite" });
  if (naissance) {
    const ageTexte = age(naissance);
    pdf.texte(
      `Né(e) le ${new Date(naissance).toLocaleDateString("fr-FR")}${ageTexte ? ` (${ageTexte})` : ""}`,
      { taille: 9, gris: 0.35, align: "droite" }
    );
  }

  pdf.saut(20);
  pdf.texte(LIBELLES[type] ?? LIBELLES.autre, { gras: true, taille: 12 });
  if (titre.toUpperCase() !== (LIBELLES[type] ?? "")) {
    pdf.texte(titre, { taille: 10, gris: 0.35 });
  }
  pdf.saut(6).filet().saut(10);

  pdf.texte(contenu, { taille: 10.5, interligne: 1.5 });

  pdf.saut(28);
  pdf.texte(nomMedecin, { gras: true, taille: 10, align: "droite" });
  pdf.texte("Document généré électroniquement — non signé de la main du praticien.", {
    taille: 8,
    gris: 0.45,
    align: "droite",
  });

  pdf.piedDePage(
    `Document remis via Docteur 224 le ${new Date().toLocaleDateString("fr-FR")} par ${nomMedecin}` +
      `${etab?.nom ? ` — ${etab.nom}` : ""}. ` +
      "Sa validité relève du praticien émetteur ; conservez-le pour votre suivi."
  );

  const octets = pdf.versOctets();
  const nom = `${type}-${new Date().toISOString().slice(0, 10)}.pdf`;

  return new NextResponse(octets as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${nom}"`,
      "Cache-Control": "no-store",
    },
  });
}
