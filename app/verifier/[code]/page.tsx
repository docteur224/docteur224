import type { Metadata } from "next";
import FormulaireVerification from "@/components/site/FormulaireVerification";
import Icone, { type NomIcone } from "@/components/site/Icone";
import PageContenu from "@/components/site/PageContenu";
import { normaliserCode } from "@/lib/code-verification";
import { creerClientServeur } from "@/lib/supabase/server";

/*
 * Vérification publique d'un document médical — la page qu'ouvre le QR.
 *
 * Le lecteur est un pharmacien, un employeur, une école : sans compte, sur
 * un téléphone. Il veut une réponse en un coup d'œil (valide, annulé,
 * corrigé) et de quoi la rapprocher du papier qu'il tient : la date et le
 * médecin. RIEN sur le patient — ni nom, ni contenu, ni motif d'annulation,
 * qui peut être médical. La fonction `verifier_document` (migration 0065)
 * ne renvoie de toute façon rien d'autre.
 *
 * Non indexée : un code n'a rien à faire dans un moteur de recherche.
 */

export const metadata: Metadata = {
  title: "Vérifier un document — Docteur 224",
  robots: { index: false, follow: false },
};

interface Resultat {
  statut: "valide" | "annule" | "corrige";
  type: string;
  emis_le: string;
  version: number;
  medecin: string;
  specialite: string | null;
  etablissement: string | null;
  change_le: string | null;
}

const TYPES: Record<string, string> = {
  ordonnance: "Ordonnance",
  certificat: "Certificat médical",
  arret_travail: "Arrêt de travail",
  compte_rendu: "Compte rendu",
  resultat: "Résultat d’examen",
  autre: "Document médical",
};

const quand = (iso: string) =>
  new Date(iso).toLocaleString("fr-FR", {
    timeZone: "Africa/Conakry",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

const ETATS: Record<Resultat["statut"], { titre: string; texte: string; icone: NomIcone; teinte: string }> = {
  valide: {
    titre: "Document valide",
    texte: "Ce document a bien été émis par le médecin ci-dessous, et n’a été ni annulé ni remplacé.",
    icone: "coche",
    teinte: "border-[#BFE3CC] bg-green-soft text-green",
  },
  annule: {
    titre: "Document annulé",
    texte: "Le médecin a annulé ce document : il n’est plus valable. Ne le délivrez pas.",
    icone: "interdit",
    teinte: "border-[#F4C9C9] bg-red-soft text-red",
  },
  corrige: {
    titre: "Document remplacé",
    texte:
      "Le médecin a émis une version corrigée de ce document. Celui-ci n’est plus valable : demandez la version la plus récente au patient.",
    icone: "alerte",
    teinte: "border-[#F3D9B8] bg-amber-soft text-amber",
  },
};

export default async function PageVerification({ params }: { params: Promise<{ code: string }> }) {
  const { code: brut } = await params;
  const code = normaliserCode(decodeURIComponent(brut));

  let resultat: Resultat | null = null;
  if (code) {
    const supabase = await creerClientServeur();
    const { data } = await supabase.rpc("verifier_document", { p_code: code });
    resultat = ((data ?? []) as Resultat[])[0] ?? null;
  }

  return (
    <PageContenu titre="Vérifier un document" chapeau="Ordonnances, certificats et arrêts de travail émis via Docteur 224." emoji="🔎">
      <div className="mx-auto grid max-w-[560px] gap-4">
        {resultat ? (
          <>
            <div className={`flex items-start gap-3 rounded-2xl border p-4 ${ETATS[resultat.statut].teinte}`} role="status">
              <span className="grid h-10 w-10 flex-none place-items-center rounded-full bg-white/70">
                <Icone nom={ETATS[resultat.statut].icone} taille={20} epaisseur={2.4} />
              </span>
              <div>
                <h2 className="text-[17px] font-extrabold">{ETATS[resultat.statut].titre}</h2>
                <p className="mt-0.5 text-[13px] font-semibold leading-relaxed text-ink">{ETATS[resultat.statut].texte}</p>
              </div>
            </div>

            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2.5 rounded-2xl border border-line bg-white p-4 text-[13.5px]">
              <dt className="text-muted">Code</dt>
              <dd className="m-0 text-right font-mono font-bold tracking-[0.04em]">{code}</dd>
              <dt className="text-muted">Document</dt>
              <dd className="m-0 text-right font-semibold">
                {TYPES[resultat.type] ?? "Document médical"}
                {resultat.version > 1 ? ` · version ${resultat.version}` : ""}
              </dd>
              <dt className="text-muted">Émis le</dt>
              <dd className="m-0 text-right font-semibold">{quand(resultat.emis_le)}</dd>
              <dt className="text-muted">Médecin</dt>
              <dd className="m-0 text-right font-semibold">{resultat.medecin}</dd>
              {resultat.specialite && (
                <>
                  <dt className="text-muted">Spécialité</dt>
                  <dd className="m-0 text-right font-semibold">{resultat.specialite}</dd>
                </>
              )}
              {resultat.etablissement && (
                <>
                  <dt className="text-muted">Structure</dt>
                  <dd className="m-0 text-right font-semibold">{resultat.etablissement}</dd>
                </>
              )}
              {resultat.change_le && resultat.statut !== "valide" && (
                <>
                  <dt className="text-muted">{resultat.statut === "annule" ? "Annulé le" : "Remplacé le"}</dt>
                  <dd className="m-0 text-right font-semibold">{quand(resultat.change_le)}</dd>
                </>
              )}
            </dl>

            <p className="rounded-xl bg-white px-4 py-3 text-[12.5px] leading-relaxed text-muted">
              Comparez la <b className="text-ink">date</b> et le <b className="text-ink">médecin</b> avec le document qu’on vous
              présente : ils doivent être identiques. Pour protéger le secret médical, cette page ne montre ni le nom du
              patient ni le contenu du document. La signature apposée est une signature électronique simple ; c’est cette
              vérification qui atteste l’origine du document.
            </p>
          </>
        ) : (
          <div className="flex items-start gap-3 rounded-2xl border border-line bg-white p-4" role="status">
            <span className="grid h-10 w-10 flex-none place-items-center rounded-full bg-bg text-muted">
              <Icone nom="alerte" taille={20} />
            </span>
            <div>
              <h2 className="text-[17px] font-extrabold">Code inconnu</h2>
              <p className="mt-0.5 text-[13px] leading-relaxed text-muted">
                {code
                  ? "Aucun document émis via Docteur 224 ne porte ce code. Vérifiez la saisie ; si le code est correct, le document n’est pas authentique."
                  : "Ce code n’a pas le bon format. Il compte 12 caractères après « D224 », sans les lettres I et O ni les chiffres 0 et 1."}
              </p>
            </div>
          </div>
        )}

        <div className="rounded-2xl border border-line bg-white p-4">
          <h2 className="mb-2 text-[14px] font-extrabold">Vérifier un autre document</h2>
          <FormulaireVerification />
        </div>
      </div>
    </PageContenu>
  );
}
