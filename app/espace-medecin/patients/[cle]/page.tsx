"use client";

import { use, useState } from "react";
import Link from "next/link";
import MedecinShell from "@/components/medecin/MedecinShell";
import AdresserConfrere from "@/components/medecin/AdresserConfrere";
import DeposerDocument from "@/components/medecin/DeposerDocument";
import EnTeteMobile from "@/components/mobile/EnTeteMobile";
import Pagination, { usePagination } from "@/components/site/Pagination";
import { calculerAge, formatDateCourte } from "@/lib/dates";
import { lirePatientCle, useContextePro, useDossierPatient } from "@/lib/pro";
import {
  iconeType,
  libelleType,
  supprimerDocument,
  urlSignee,
  useMesDocuments,
  type DocumentPatient,
} from "@/lib/documents";

/*
 * Dossier d'un patient, côté médecin.
 *
 * Rassemble ce qui était éparpillé ou inexistant : l'identité, l'historique
 * des rendez-vous avec ce praticien, les documents remis (avec leur suivi et
 * la possibilité de corriger une erreur) et ceux que le patient a envoyés ou
 * partagés. Le médecin voit donc enfin ce qu'il a déjà transmis — avant, une
 * fois la fenêtre refermée, le dépôt disparaissait de sa vue.
 */

const STATUTS: Record<string, { libelle: string; classe: string }> = {
  en_attente: { libelle: "En attente", classe: "bg-[#FDF3E3] text-[#8A5A16]" },
  confirme: { libelle: "Confirmé", classe: "bg-teal-soft text-blue" },
  honore: { libelle: "Honoré", classe: "bg-green-soft text-green" },
  annule: { libelle: "Annulé", classe: "bg-red-soft text-red" },
};

export default function DossierPatientMedecin({
  params,
}: {
  params: Promise<{ cle: string }>;
}) {
  const { cle } = use(params);
  const { medecin } = useContextePro();
  const { dossier, chargement } = useDossierPatient(cle, medecin?.id);

  const { type, id } = lirePatientCle(cle);
  // Une fiche sans compte n'a pas d'espace patient : aucun document possible.
  const pour =
    type === "compte" ? { patientId: id } : type === "proche" ? { procheId: id } : undefined;
  const { documents, recharger } = useMesDocuments(pour ?? { patientId: "aucun" });

  const [deplie, setDeplie] = useState<string | null>(null);
  const [aSupprimer, setASupprimer] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  const nomComplet = dossier ? `${dossier.prenom} ${dossier.nom}` : "";
  // `useMesDocuments` filtre par patient/proche, pas par auteur : la RLS peut
  // aussi renvoyer un document rédigé par un CONFRÈRE et simplement partagé
  // avec ce médecin (table partages_document). Sans cette distinction, un tel
  // document apparaissait comme « le vôtre », avec Corriger/Retirer qui
  // échouaient silencieusement (RLS bloque, depose_par ≠ vous).
  const estMoi = (d: DocumentPatient) => d.medecinId === medecin?.id;
  const remis = documents.filter((d) => d.origine === "medecin" && estMoi(d));
  const recus = documents.filter((d) => d.origine === "patient" && estMoi(d));
  const partagesParConfrere = documents.filter((d) => !estMoi(d));

  /* Une pagination par section : chacune se remplit à son propre rythme, et
     un dossier suivi de longue date accumule surtout des rendez-vous. */
  const pagiRemis = usePagination(remis, 8);
  const pagiRecus = usePagination(recus, 8);
  const pagiPartages = usePagination(partagesParConfrere, 8);
  const pagiRdvs = usePagination(dossier?.rdvs ?? [], 10);

  async function ouvrir(doc: DocumentPatient) {
    if (!doc.fichierPath) return;
    setMessage("");
    const res = await urlSignee(doc.fichierPath);
    if (res.erreur || !res.url) {
      setMessage(`⚠️ ${res.erreur ?? "Fichier introuvable."}`);
      return;
    }
    window.open(res.url, "_blank", "noopener,noreferrer");
  }

  /* Suppression en deux temps, comme partout ailleurs dans l'application. */
  async function supprimer(doc: DocumentPatient) {
    if (aSupprimer !== doc.id) {
      setASupprimer(doc.id);
      setMessage("");
      return;
    }
    const res = await supprimerDocument(doc.id, doc.fichierPath);
    setMessage(res.erreur ? `⚠️ ${res.erreur}` : "✓ Document retiré du dossier.");
    setASupprimer(null);
    recharger();
  }

  /** Une carte de document, identique dans les trois colonnes. */
  const carteDocument = (d: DocumentPatient, sien: boolean) => (
    <div key={d.id} className="rounded-xl border border-line bg-white p-3">
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className="grid h-9 w-9 flex-none place-items-center rounded-[10px] bg-teal-soft text-base"
        >
          {iconeType(d.type)}
        </span>
        <div className="min-w-0 flex-1">
          <b className="block text-[13.5px] font-extrabold">{d.titre}</b>
          <div className="text-[11px] text-muted">
            {libelleType(d.type)} · {formatDateCourte(d.creeLe.slice(0, 10))}
            {d.origine === "patient" && " · envoyé par le patient"}
            {d.origine === "medecin" && !sien && ` · rédigé par ${d.medecinNom}`}
          </div>
        </div>
        {d.fichierPath && (
          <button
            type="button"
            onClick={() => ouvrir(d)}
            className="flex-none rounded-[9px] bg-teal px-3 py-1.5 text-[11.5px] font-bold text-white transition-colors hover:bg-[#2790bc]"
          >
            Ouvrir
          </button>
        )}
      </div>

      {d.contenu && (
        <>
          <button
            type="button"
            onClick={() => setDeplie(deplie === d.id ? null : d.id)}
            className="mt-2 text-[11.5px] font-bold text-teal hover:underline"
          >
            {deplie === d.id ? "Replier le contenu" : "Lire le contenu"}
          </button>
          {deplie === d.id && (
            <pre className="mt-2 whitespace-pre-wrap border-t border-line pt-2 font-sans text-[12.5px] leading-[1.6] text-[#3f5360]">
              {d.contenu}
            </pre>
          )}
        </>
      )}

      {sien && (
        <div className="mt-3 flex flex-wrap gap-2 border-t border-line pt-3">
          <DeposerDocument
            cle={cle}
            nomPatient={nomComplet}
            document={d}
            apres={() => {
              recharger();
              setMessage("✓ Document corrigé.");
            }}
          />
          <button
            type="button"
            onClick={() => supprimer(d)}
            className="rounded-[9px] border-[1.5px] border-[#F3C9C2] bg-white px-3 py-1.5 text-[11.5px] font-bold text-red transition-colors hover:bg-red-soft"
          >
            {aSupprimer === d.id ? "Confirmer le retrait" : "Retirer"}
          </button>
        </div>
      )}
    </div>
  );

  const colonneDocuments = (
    <>
      <div className="mb-4 rounded-2xl border border-line bg-white p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-[15px] font-extrabold">
            Documents remis{" "}
            <span className="text-[12px] font-semibold text-muted">({remis.length})</span>
          </h3>
          {pour && (
            <div className="flex flex-wrap gap-2">
              <DeposerDocument cle={cle} nomPatient={nomComplet} apres={recharger} />
              {/* Les pièces proposées sont celles que ce médecin a le droit de
                  joindre : ses dépôts et ce que le patient lui a adressé. */}
              <AdresserConfrere
                cle={cle}
                nomPatient={nomComplet}
                documents={[...remis, ...recus]}
                apres={recharger}
              />
            </div>
          )}
        </div>
        {!pour && (
          <p className="text-[12.5px] text-muted">
            Fiche créée au cabinet : ce patient n’a pas d’espace où consulter un document.
          </p>
        )}
        {pour && remis.length === 0 && (
          <p className="text-[12.5px] text-muted">
            Aucun document remis pour l’instant. Utilisez « + Document » pour générer une
            ordonnance ou joindre une pièce.
          </p>
        )}
        <div className="grid gap-2">{pagiRemis.tranche.map((d) => carteDocument(d, true))}</div>
        <Pagination
          page={pagiRemis.page}
          pages={pagiRemis.pages}
          total={pagiRemis.total}
          premier={pagiRemis.premier}
          dernier={pagiRemis.dernier}
          onPage={pagiRemis.setPage}
          libelle="documents"
        />
      </div>

      <div className="mb-4 rounded-2xl border border-line bg-white p-4">
        <h3 className="mb-3 text-[15px] font-extrabold">
          Reçus du patient{" "}
          <span className="text-[12px] font-semibold text-muted">({recus.length})</span>
        </h3>
        {recus.length === 0 ? (
          <p className="text-[12.5px] text-muted">
            Rien pour l’instant. Le patient peut vous transmettre un résultat d’analyse ou
            partager un document depuis son espace.
          </p>
        ) : (
          <>
            <div className="grid gap-2">{pagiRecus.tranche.map((d) => carteDocument(d, false))}</div>
            <Pagination
              page={pagiRecus.page}
              pages={pagiRecus.pages}
              total={pagiRecus.total}
              premier={pagiRecus.premier}
              dernier={pagiRecus.dernier}
              onPage={pagiRecus.setPage}
              libelle="documents"
            />
          </>
        )}
      </div>

      {partagesParConfrere.length > 0 && (
        <div className="rounded-2xl border border-line bg-white p-4">
          <h3 className="mb-3 text-[15px] font-extrabold">
            Partagés par un confrère{" "}
            <span className="text-[12px] font-semibold text-muted">
              ({partagesParConfrere.length})
            </span>
          </h3>
          <p className="mb-3 text-[11.5px] text-muted">
            Le patient a donné accès à des documents rédigés ou reçus par un autre médecin.
          </p>
          <div className="grid gap-2">
            {pagiPartages.tranche.map((d) => carteDocument(d, false))}
          </div>
          <Pagination
            page={pagiPartages.page}
            pages={pagiPartages.pages}
            total={pagiPartages.total}
            premier={pagiPartages.premier}
            dernier={pagiPartages.dernier}
            onPage={pagiPartages.setPage}
            libelle="documents"
          />
        </div>
      )}
    </>
  );

  const colonneIdentite = (
    <>
      <div className="mb-4 rounded-2xl border border-line bg-white p-4">
        <div className="mb-3 flex items-center gap-3">
          <span
            aria-hidden
            className="grid h-[52px] w-[52px] flex-none place-items-center rounded-2xl text-base font-extrabold text-white"
            style={{ background: dossier?.gradient }}
          >
            {`${dossier?.prenom.charAt(0) ?? ""}${dossier?.nom.charAt(0) ?? ""}`.toUpperCase()}
          </span>
          <div className="min-w-0">
            <b className="block text-base font-extrabold">{nomComplet}</b>
            <div className="text-[12px] text-muted">
              {dossier?.type === "proche"
                ? `${dossier.lien} de ${dossier.titulaire}`
                : dossier?.type === "sans_compte"
                  ? "Fiche cabinet (sans compte)"
                  : "Compte patient"}
            </div>
          </div>
        </div>
        <dl className="grid gap-2 text-[12.5px]">
          {[
            ["Téléphone", dossier?.telephone || "—"],
            [
              "Naissance",
              dossier?.dateNaissance
                ? `${formatDateCourte(dossier.dateNaissance)} · ${calculerAge(dossier.dateNaissance)} ans`
                : "—",
            ],
            ["Sexe", dossier?.genre === "M" ? "Masculin" : dossier?.genre === "F" ? "Féminin" : "—"],
            ["Ville", dossier?.ville || "—"],
            ["E-mail", dossier?.email || "—"],
          ].map(([libelle, valeur]) => (
            <div key={libelle} className="flex justify-between gap-3 border-b border-line pb-2 last:border-b-0">
              <dt className="text-muted">{libelle}</dt>
              <dd className="truncate text-right font-semibold">{valeur}</dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="rounded-2xl border border-line bg-white p-4">
        <h3 className="mb-3 text-[15px] font-extrabold">
          Rendez-vous{" "}
          <span className="text-[12px] font-semibold text-muted">({dossier?.rdvs.length ?? 0})</span>
        </h3>
        {dossier?.rdvs.length === 0 && (
          <p className="text-[12.5px] text-muted">Aucun rendez-vous avec vous pour l’instant.</p>
        )}
        <div className="grid gap-2">
          {pagiRdvs.tranche.map((r) => (
            <div
              key={r.id}
              className="flex flex-wrap items-center gap-2 border-b border-line pb-2 text-[12.5px] last:border-b-0 last:pb-0"
            >
              <b className="font-extrabold">{formatDateCourte(r.date)}</b>
              <span className="text-muted">{r.heure}</span>
              <span
                className={`rounded px-1.5 py-0.5 text-[10.5px] font-bold ${
                  STATUTS[r.statut]?.classe ?? "bg-bg text-muted"
                }`}
              >
                {STATUTS[r.statut]?.libelle ?? r.statut}
              </span>
              {r.motif && <span className="w-full truncate text-[11.5px] text-muted">{r.motif}</span>}
            </div>
          ))}
        </div>
        <Pagination
          page={pagiRdvs.page}
          pages={pagiRdvs.pages}
          total={pagiRdvs.total}
          premier={pagiRdvs.premier}
          dernier={pagiRdvs.dernier}
          onPage={pagiRdvs.setPage}
          libelle="rendez-vous"
        />
      </div>
    </>
  );

  const introuvable = !chargement && !dossier;

  return (
    <MedecinShell>
      {/* ===== Version mobile ===== */}
      <div className="md:hidden">
        <EnTeteMobile retour="/espace-medecin/patients" titre={nomComplet || "Dossier"} />
        <div className="pad">
          {chargement && (
            <p className="muted" style={{ fontSize: 13 }}>
              Chargement…
            </p>
          )}
          {introuvable && (
            <p className="muted" style={{ fontSize: 13 }}>
              Dossier introuvable, ou hors de votre patientèle.
            </p>
          )}
          {dossier && (
            <div className="grid gap-4">
              {colonneIdentite}
              {colonneDocuments}
            </div>
          )}
          {message && (
            <p
              style={{
                color: message.startsWith("⚠️") ? "var(--red)" : "var(--green)",
                fontSize: 12.5,
                fontWeight: 700,
                paddingTop: 10,
              }}
            >
              {message}
            </p>
          )}
        </div>
      </div>

      {/* ===== Version web ===== */}
      <div className="hidden md:block">
        <div className="mb-4">
          <Link
            href="/espace-medecin/patients"
            className="text-[12px] font-bold text-muted hover:text-teal"
          >
            ‹ Mes patients
          </Link>
          <h2 className="mt-1 text-[21px] font-extrabold tracking-[-0.3px]">
            {nomComplet || (chargement ? "Chargement…" : "Dossier")}
          </h2>
          <small className="text-[13px] text-muted">
            Historique, documents remis et pièces reçues
          </small>
        </div>

        {introuvable ? (
          <div className="rounded-2xl border border-line bg-white p-8 text-center text-[13px] text-muted">
            Dossier introuvable, ou hors de votre patientèle.
          </div>
        ) : (
          <div className="grid items-start gap-4 lg:grid-cols-[340px_1fr]">
            <div>{colonneIdentite}</div>
            <div>{colonneDocuments}</div>
          </div>
        )}

        {message && (
          <p
            className={`mt-3 text-[12.5px] font-bold ${
              message.startsWith("⚠️") ? "text-red" : "text-green"
            }`}
          >
            {message}
          </p>
        )}
      </div>
    </MedecinShell>
  );
}
