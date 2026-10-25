import { NextResponse } from "next/server";
import qrcode from "qrcode-generator";
import { genererCode, urlVerification } from "@/lib/code-verification";
import { A4, DocumentPdf, MARGE } from "@/lib/pdf";
import { creerClientServeur } from "@/lib/supabase/server";
import { libellePdf } from "@/lib/types-document";

/*
 * Génération du PDF d'un document remis à un patient (ordonnance, certificat,
 * arrêt de travail, compte rendu…), à partir du type et du texte saisis par
 * le médecin.
 *
 * Côté serveur et non dans le navigateur, pour une raison de fond : tout ce
 * qui ENGAGE le praticien est relu en base à partir de la SESSION, jamais
 * reçu du client — son identité, sa structure, sa signature, et le code de
 * vérification. Le corps du document est la seule chose que l'appelant
 * fournit.
 *
 * Deux modes :
 *  - « apercu » : le médecin se relit. Aucun code n'est attribué, la place
 *    du QR est un cadre vide et le document dit qu'il n'est pas émis ;
 *  - « final » : un code unique est tiré ici, imprimé en clair et en QR, et
 *    renvoyé dans l'en-tête `X-Code-Verification` pour être enregistré avec
 *    la pièce. La page publique /verifier/<code> dira ensuite, à qui scanne :
 *    valide, annulé ou corrigé, la date et le médecin — rien du patient.
 *
 * La signature apposée est une signature électronique SIMPLE (le tracé du
 * médecin). C'est la vérification en ligne qui la rend opposable : l'image
 * seule ne prouverait rien, d'où la mention imprimée à côté.
 */

const dateLisible = (d: Date) =>
  d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "Africa/Conakry" });
const heureLisible = (d: Date) =>
  d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Conakry" });

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

/** Les traits enregistrés, validés : [[x, y], …] par trait, valeurs dans [0, 1]. */
function lireTraits(brut: unknown): [number, number][][] {
  if (!Array.isArray(brut)) return [];
  return brut
    .filter(Array.isArray)
    .map((t) =>
      (t as unknown[])
        .filter((p): p is [number, number] => Array.isArray(p) && p.length === 2 && p.every((v) => typeof v === "number"))
        .map(([x, y]) => [Math.min(1, Math.max(0, x)), Math.min(1, Math.max(0, y))] as [number, number])
    )
    .filter((t) => t.length > 0);
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
  const final = corps?.mode === "final";

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
      `civilite, telephone_secretariat, quartier, numero_ordre, rccm,
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

  // ----- Signature, relue en base (la sienne seulement : RLS) -----
  const { data: signature } = await supabase
    .from("signatures_medecin")
    .select("traits, ratio")
    .eq("medecin_id", auth.user.id)
    .maybeSingle();
  const traits = lireTraits(signature?.traits);
  const ratio = Number(signature?.ratio ?? 3);

  // ----- Code de vérification (document émis seulement) -----
  const code = final ? genererCode() : null;
  const base = process.env.NEXT_PUBLIC_SITE_URL || new URL(requete.url).origin;
  const adresse = code ? urlVerification(base, code) : null;

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
  const maintenant = new Date();

  const pdf = new DocumentPdf();

  pdf.texte(etab?.nom ?? "Cabinet médical", { gras: true, taille: 17, align: "centre" });
  pdf.saut(4);
  pdf.texte(nomMedecin, { gras: true, taille: 12, align: "centre" });
  if (specialite) {
    pdf.texte(specialite.toUpperCase(), { taille: 9, gris: 0.35, align: "centre" });
  }
  const adressePostale = [etab?.adresse, etab?.quartier ?? medecin.quartier, etab?.villes?.nom ?? ville]
    .filter(Boolean)
    .join(", ");
  if (adressePostale) pdf.texte(adressePostale, { taille: 9, gris: 0.35, align: "centre" });
  if (telephone) pdf.texte(`Tél : ${telephone}`, { taille: 9, gris: 0.35, align: "centre" });

  // Mentions légales du praticien : numéro au Conseil de l'ordre et RCCM.
  // Chacune ne s'affiche que si elle est renseignée au profil.
  const numeroOrdre = (medecin.numero_ordre as string | null)?.trim() || "";
  const rccm = (medecin.rccm as string | null)?.trim() || "";
  const mentionsLegales = [
    numeroOrdre && `N° Ordre : ${numeroOrdre}`,
    rccm && `RCCM : ${rccm}`,
  ]
    .filter(Boolean)
    .join("  ·  ");
  if (mentionsLegales) pdf.texte(mentionsLegales, { taille: 9, gris: 0.35, align: "centre" });

  pdf.saut(6).filet().saut(6);

  pdf.texte(`${ville || "Conakry"}, le ${dateLisible(maintenant)}`, {
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
  pdf.texte(libellePdf(type), { gras: true, taille: 12 });
  if (titre.toUpperCase() !== libellePdf(type)) {
    pdf.texte(titre, { taille: 10, gris: 0.35 });
  }
  if (!final) {
    pdf.texte("APERÇU — document non émis, sans valeur", { gras: true, taille: 9, gris: 0.45 });
  }
  pdf.saut(6).filet().saut(10);

  pdf.texte(contenu, { taille: 10.5, interligne: 1.5 });

  // ----- Bloc de validation : QR à gauche, signature à droite -----
  const COTE_QR = 74;
  const SIG_L = 168;
  const SIG_H = 56;
  pdf.saut(22).garantir(COTE_QR + 40);
  const haut = pdf.curseur;

  if (code && adresse) {
    // Correction d'erreur « M » : le QR reste lisible avec 15 % de modules
    // abîmés — un papier plié dans une poche, une photocopie.
    const qr = qrcode(0, "M");
    qr.addData(adresse);
    qr.make();
    const n = qr.getModuleCount();
    pdf.matrice((r, c) => qr.isDark(r, c), n, MARGE, haut, COTE_QR);
    pdf.texteA(code, MARGE, haut - COTE_QR - 11, { taille: 8.5, gras: true });
    pdf.texteA(`Vérifiez ce document : ${base.replace(/^https?:\/\//, "")}/verifier`, MARGE, haut - COTE_QR - 21, {
      taille: 7,
      gris: 0.4,
    });
  } else {
    pdf.cadre(MARGE, haut, COTE_QR, COTE_QR);
    pdf.texteA("Aperçu", MARGE + COTE_QR / 2, haut - COTE_QR / 2 + 2, { taille: 8, gris: 0.55, align: "centre" });
    pdf.texteA("Le code de vérification est attribué à l’émission.", MARGE, haut - COTE_QR - 11, {
      taille: 7,
      gris: 0.45,
    });
  }

  const droite = A4.largeur - MARGE;
  if (traits.length) {
    // La signature garde ses proportions : on l'inscrit dans le cadre, calée
    // à droite, sans la déformer.
    const l = Math.min(SIG_L, SIG_H * ratio);
    const h = l / ratio;
    pdf.traits(traits, droite - l, haut - (SIG_H - h) / 2, l, h);
  } else {
    pdf.texteA("Signature électronique non enregistrée", droite, haut - SIG_H / 2, {
      taille: 7.5,
      gris: 0.55,
      align: "droite",
    });
  }
  pdf.texteA(nomMedecin, droite, haut - SIG_H - 8, { taille: 10, gras: true, align: "droite" });
  pdf.texteA(
    final
      ? traits.length
        ? `Signé électroniquement le ${maintenant.toLocaleDateString("fr-FR", { timeZone: "Africa/Conakry" })} à ${heureLisible(maintenant)}`
        : `Émis électroniquement le ${maintenant.toLocaleDateString("fr-FR", { timeZone: "Africa/Conakry" })}`
      : "Aperçu — non signé",
    droite,
    haut - SIG_H - 19,
    { taille: 7.5, gris: 0.4, align: "droite" }
  );
  pdf.saut(COTE_QR + 30);

  pdf.piedDePage(
    `Document émis via Docteur 224 le ${dateLisible(maintenant)} par ${nomMedecin}` +
      `${etab?.nom ? ` — ${etab.nom}` : ""}. ` +
      (code
        ? `Authenticité vérifiable en ligne avec le code ${code} : statut (valide, annulé ou corrigé), date et médecin émetteur. ` +
          "Signature électronique simple."
        : "Aperçu : ce document n’a pas été émis.")
  );

  const octets = pdf.versOctets();
  const nom = `${type}-${maintenant.toISOString().slice(0, 10)}.pdf`;

  return new NextResponse(octets as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${nom}"`,
      "Cache-Control": "no-store",
      ...(code ? { "X-Code-Verification": code } : {}),
    },
  });
}
