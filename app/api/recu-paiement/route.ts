import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { DocumentPdf } from "@/lib/pdf";
import { creerClientServeur } from "@/lib/supabase/server";

/*
 * Reçu d'un versement encaissé par Docteur 224.
 *
 * Un professionnel qui règle son abonnement a besoin d'un justificatif à
 * classer : jusqu'ici, la seule trace était une ligne à l'écran.
 *
 * Deux règles de fond :
 *
 *  1. Le reçu n'est délivré que pour un versement RÉELLEMENT ENCAISSÉ
 *     (confirmé, ou remboursé — dans ce cas il porte la mention). Émettre un
 *     justificatif pour une demande en attente reviendrait à attester une
 *     recette qui n'est pas entrée en caisse.
 *  2. Rien n'est reçu du client sauf l'identifiant du versement. Montant,
 *     date, objet et identité sont relus en base à partir de la SESSION —
 *     sinon on signerait un reçu au nom et au montant de n'importe qui.
 */

const dateLisible = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })
    : "—";

const montantGNF = (montant: number) => `${montant.toLocaleString("fr-FR")} GNF`;

const LIBELLE_MOYEN: Record<string, string> = {
  orange_money: "Orange Money",
  mtn_momo: "MTN Mobile Money",
  carte: "Carte bancaire",
};

export async function POST(requete: Request) {
  const session = await creerClientServeur();
  const { data: auth } = await session.auth.getUser();
  if (!auth.user) {
    return NextResponse.json({ erreur: "Session expirée — reconnectez-vous." }, { status: 401 });
  }

  const corps = await requete.json().catch(() => null);
  const id = corps?.id ? String(corps.id) : "";
  const famille = corps?.famille === "recharge" ? "recharge" : "abonnement";
  if (!id) {
    return NextResponse.json({ erreur: "Versement non précisé." }, { status: 400 });
  }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  /*
   * La service_role ignore la RLS : le filtre sur `titulaire_id` n'est donc
   * pas une commodité, c'est LUI qui empêche de tirer le reçu d'un confrère
   * en changeant l'identifiant dans la requête.
   */
  const { data: versement } =
    famille === "abonnement"
      ? await admin
          .from("paiements_abonnement")
          .select("id, formule, periode, montant_gnf, moyen, reference, reference_operateur, statut, decide_le, cree_le")
          .eq("id", id)
          .eq("titulaire_id", auth.user.id)
          .maybeSingle()
      : await admin
          .from("achats_sms")
          .select("id, segments, prix_gnf, moyen_paiement, reference, reference_paiement, statut, valide_le, cree_le")
          .eq("id", id)
          .eq("titulaire_id", auth.user.id)
          .maybeSingle();

  if (!versement) {
    return NextResponse.json({ erreur: "Versement introuvable." }, { status: 404 });
  }

  const statut = (versement as Record<string, unknown>).statut as string;
  const encaisse = statut === "confirme" || statut === "paye" || statut === "rembourse";
  if (!encaisse) {
    return NextResponse.json(
      { erreur: "Aucun reçu tant que le versement n'a pas été confirmé par notre équipe." },
      { status: 409 }
    );
  }

  const { data: utilisateur } = await admin
    .from("utilisateurs")
    .select("nom, prenom, email, telephone, role")
    .eq("id", auth.user.id)
    .maybeSingle();

  /* Ce qui a été rendu sur ce versement : un reçu muet là-dessus serait faux. */
  const { data: rembours } = await admin
    .from("remboursements")
    .select("montant_gnf, motif, cree_le")
    .eq(famille === "abonnement" ? "paiement_id" : "achat_sms_id", id)
    .order("cree_le");

  /*
   * Les deux requêtes ne rendent pas les mêmes colonnes : TypeScript en
   * déduit une union dont aucun champ n'est commun. On repasse par un sac de
   * valeurs, le discriminant étant `famille`, connu et validé plus haut.
   */
  const brut = versement as Record<string, unknown>;
  const donnees =
    famille === "abonnement"
      ? {
          objet: `Abonnement ${brut.formule} — facturation ${
            brut.periode === "annuel" ? "annuelle" : "mensuelle"
          }`,
          montant: brut.montant_gnf as number,
          moyen: brut.moyen as string,
          transaction: (brut.reference_operateur as string) ?? "",
          date: (brut.decide_le as string) ?? (brut.cree_le as string),
        }
      : {
          objet: `Recharge de ${(brut.segments as number).toLocaleString("fr-FR")} SMS`,
          montant: brut.prix_gnf as number,
          moyen: (brut.moyen_paiement as string) ?? "",
          transaction: (brut.reference_paiement as string) ?? "",
          date: (brut.valide_le as string) ?? (brut.cree_le as string),
        };

  const rendu = (rembours ?? []).reduce((t, r) => t + (r.montant_gnf as number), 0);

  const pdf = new DocumentPdf();
  pdf
    .texte("DOCTEUR 224", { gras: true, taille: 15 })
    .texte("Plateforme de prise de rendez-vous médicaux — Guinée", { taille: 9, gris: 0.45 })
    .saut(6)
    .filet()
    .saut(10)
    .texte("REÇU DE PAIEMENT", { gras: true, taille: 13, align: "centre" })
    .texte(`N° ${brut.reference ?? "—"}`, { taille: 10, align: "centre", gris: 0.35 })
    .saut(14);

  const ligne = (etiquette: string, valeur: string) =>
    pdf.texte(`${etiquette.padEnd(22, " ")}${valeur}`, { taille: 10.5 });

  ligne("Reçu de", `${utilisateur?.prenom ?? ""} ${utilisateur?.nom ?? ""}`.trim() || "—");
  if (utilisateur?.email) ligne("Adresse e-mail", utilisateur.email);
  if (utilisateur?.telephone) ligne("Téléphone", utilisateur.telephone);
  pdf.saut(8);
  ligne("Objet", donnees.objet);
  ligne("Date d'encaissement", dateLisible(donnees.date));
  ligne("Moyen de paiement", LIBELLE_MOYEN[donnees.moyen] ?? donnees.moyen ?? "—");
  if (donnees.transaction) ligne("Transaction opérateur", donnees.transaction);
  pdf.saut(10).filet().saut(8);
  pdf.texte(`MONTANT VERSÉ${" ".repeat(8)}${montantGNF(donnees.montant)}`, {
    gras: true,
    taille: 12.5,
  });

  if (rendu > 0) {
    pdf.saut(8);
    pdf.texte(`Remboursé : ${montantGNF(rendu)}`, { gras: true, taille: 11 });
    for (const r of rembours ?? []) {
      pdf.texte(`  ${dateLisible(r.cree_le as string)} — ${montantGNF(r.montant_gnf as number)} · ${r.motif}`, {
        taille: 9.5,
        gris: 0.4,
      });
    }
    pdf.saut(4);
    pdf.texte(`Net conservé : ${montantGNF(donnees.montant - rendu)}`, { gras: true, taille: 11 });
  }

  pdf
    .saut(14)
    .texte(
      "Ce reçu atteste d'un versement encaissé par Docteur 224 au titre de l'abonnement " +
        "professionnel. La prise de rendez-vous reste gratuite pour les patients.",
      { taille: 9, gris: 0.45 }
    )
    .piedDePage(
      `Reçu ${brut.reference ?? ""} — édité le ${dateLisible(new Date().toISOString())} · document généré électroniquement`
    );

  const octets = pdf.versOctets();
  return new NextResponse(new Uint8Array(octets), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="recu-${brut.reference ?? id}.pdf"`,
    },
  });
}
