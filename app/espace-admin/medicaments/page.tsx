"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import AdminShell from "@/components/admin/AdminShell";
import EnTeteMobile from "@/components/mobile/EnTeteMobile";
import Dialogue from "@/components/site/Dialogue";
import Icone from "@/components/site/Icone";
import Pagination, { usePagination } from "@/components/site/Pagination";
import Toast, { useToast } from "@/components/site/Toast";
import { creerClientNavigateur } from "@/lib/supabase/client";

/*
 * Base de médicaments (migration 0065) : le référentiel où les médecins
 * cherchent ce qu'ils prescrivent.
 *
 * Amorcée sur la Liste modèle OMS des médicaments essentiels ; l'équipe la
 * complète ici, une ligne à la fois, ou en masse par un fichier Excel.
 * L'export sert de modèle d'import : on exporte, on complète dans Excel,
 * on réimporte. L'import se relit avant d'être appliqué et ne supprime
 * jamais rien — un médicament se RETIRE (inactif) : une ordonnance passée
 * peut le citer.
 *
 * La CLASSE alimente l'alerte allergie des ordonnances : « pénicillines »,
 * « ains », « sulfamides »… en minuscules, au pluriel.
 */

interface Medicament {
  id: string;
  dci: string;
  nom_commercial: string | null;
  dosage: string | null;
  forme: string | null;
  voie: string | null;
  classe: string | null;
  actif: boolean;
  origine: "oms" | "admin";
}

type Filtre = "actifs" | "retires" | "tous";

const CHAMP =
  "w-full rounded-[11px] border border-line bg-white px-[13px] py-2.5 text-[13.5px] outline-none focus:border-teal pointer-coarse:min-h-11";
const BTN = "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-[10px] px-3.5 text-[12.5px] font-bold transition-colors disabled:opacity-45";
const BTN_PRIMAIRE = `${BTN} bg-teal text-white hover:bg-blue`;
const BTN_CONTOUR = `${BTN} border border-[#BFD3F6] bg-white text-blue hover:bg-teal-soft`;
const BTN_NEUTRE = `${BTN} border border-line bg-white text-ink hover:border-muted`;

const sansAccents = (t: string) => t.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

function useMedicaments(revision: number) {
  const [resultat, setResultat] = useState<{ revision: number; liste: Medicament[] } | null>(null);
  useEffect(() => {
    let actif = true;
    creerClientNavigateur()
      .from("medicaments")
      .select("id, dci, nom_commercial, dosage, forme, voie, classe, actif, origine")
      .order("dci")
      .order("dosage")
      .then(({ data }) => {
        if (actif) setResultat({ revision, liste: (data ?? []) as Medicament[] });
      });
    return () => {
      actif = false;
    };
  }, [revision]);
  return { liste: resultat?.liste ?? [], chargement: resultat === null };
}

export default function PageMedicaments() {
  const [revision, setRevision] = useState(0);
  const { liste, chargement } = useMedicaments(revision);
  const { avis, annoncer, signalerEchec } = useToast();
  const [recherche, setRecherche] = useState("");
  const [filtre, setFiltre] = useState<Filtre>("actifs");
  const [edition, setEdition] = useState<Medicament | "nouveau" | null>(null);
  const [importOuvert, setImportOuvert] = useState(false);

  const recharger = () => setRevision((r) => r + 1);
  const fermerEdition = useCallback(() => setEdition(null), []);
  const fermerImport = useCallback(() => setImportOuvert(false), []);

  const filtres = useMemo(() => {
    const q = sansAccents(recherche.trim());
    return liste.filter(
      (m) =>
        (filtre === "tous" || (filtre === "actifs" ? m.actif : !m.actif)) &&
        (!q || sansAccents(`${m.dci} ${m.nom_commercial ?? ""} ${m.classe ?? ""}`).includes(q))
    );
  }, [liste, recherche, filtre]);
  const pagination = usePagination(filtres, 25);

  const nbActifs = liste.filter((m) => m.actif).length;
  const nbOms = liste.filter((m) => m.origine === "oms").length;

  async function basculer(m: Medicament) {
    const supabase = creerClientNavigateur();
    // `.select` : une mise à jour bloquée par la RLS ne lève pas d'erreur,
    // elle touche zéro ligne — il faut le constater pour ne pas annoncer un
    // succès qui n'a pas eu lieu.
    const { data, error } = await supabase.from("medicaments").update({ actif: !m.actif }).eq("id", m.id).select("id");
    if (error || !data?.length) {
      signalerEchec(error?.message ?? "Modification refusée : la permission « Paramètres » est requise.");
      return;
    }
    await supabase.rpc("ecrire_audit", {
      p_action: m.actif ? "A retiré un médicament de la base" : "A réactivé un médicament de la base",
      p_cible_type: "medicaments",
      p_cible_id: m.id,
      p_details: { cible: [m.dci, m.dosage, m.forme].filter(Boolean).join(" · ") },
    });
    annoncer(m.actif ? `${m.dci} retiré — il n’est plus proposé aux médecins` : `${m.dci} réactivé`);
    recharger();
  }

  const description = (m: Medicament) => [m.dosage, m.forme, m.voie].filter(Boolean).join(" · ");

  return (
    <AdminShell permission="parametres">
      <div className="md:hidden">
        <EnTeteMobile retour="/espace-admin/plus" titre="Médicaments" />
      </div>
      <Toast avis={avis} />

      {edition && (
        <EditionMedicament
          medicament={edition === "nouveau" ? null : edition}
          onFermer={fermerEdition}
          onFait={(m) => {
            setEdition(null);
            annoncer(m);
            recharger();
          }}
        />
      )}
      {importOuvert && (
        <ImportMedicaments
          onFermer={fermerImport}
          onFait={(m) => {
            setImportOuvert(false);
            annoncer(m);
            recharger();
          }}
        />
      )}

      <div className="px-4 pb-8 md:px-0">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3 pt-3 md:pt-0">
          <div>
            <h2 className="text-[21px] font-extrabold tracking-[-0.3px]">Base de médicaments</h2>
            <p className="max-w-[640px] text-[13px] leading-relaxed text-muted">
              Ce que les médecins trouvent en rédigeant une ordonnance. La classe alimente l’alerte allergie. Amorcée sur la
              Liste modèle OMS des médicaments essentiels.
            </p>
          </div>
          <div className="flex w-full flex-wrap gap-2 md:w-auto">
            <a href="/api/admin/medicaments/export" className={`${BTN_NEUTRE} flex-1 md:flex-none`}>
              <Icone nom="telecharger" taille={15} />
              Exporter (Excel)
            </a>
            <button type="button" onClick={() => setImportOuvert(true)} className={`${BTN_CONTOUR} flex-1 md:flex-none`}>
              <Icone nom="partager" taille={15} />
              Importer
            </button>
            <button type="button" onClick={() => setEdition("nouveau")} className={`${BTN_PRIMAIRE} w-full md:w-auto`}>
              <Icone nom="plus" taille={15} epaisseur={2.4} />
              Ajouter un médicament
            </button>
          </div>
        </div>

        <div className="mb-4 grid grid-cols-3 gap-3">
          {[
            ["Médicaments actifs", nbActifs],
            ["Retirés", liste.length - nbActifs],
            ["Issus de la liste OMS", nbOms],
          ].map(([l, n]) => (
            <div key={l as string} className="rounded-2xl border border-line bg-white p-3.5">
              <div className="text-[11.5px] font-bold text-muted">{l}</div>
              <div className="text-[22px] font-extrabold">{chargement ? "…" : n}</div>
            </div>
          ))}
        </div>

        <div className="rounded-2xl border border-line bg-white p-4">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <label htmlFor="recherche-medicament" className="sr-only">
              Rechercher un médicament
            </label>
            <input
              id="recherche-medicament"
              value={recherche}
              onChange={(e) => {
                setRecherche(e.target.value);
                pagination.setPage(0);
              }}
              placeholder="Rechercher : DCI, nom commercial, classe…"
              className={`${CHAMP} min-w-[220px] flex-1`}
            />
            <div role="radiogroup" aria-label="Statut" className="flex gap-0.5 rounded-[10px] bg-bg p-[3px]">
              {(
                [
                  ["actifs", "Actifs"],
                  ["retires", "Retirés"],
                  ["tous", "Tous"],
                ] as [Filtre, string][]
              ).map(([v, l]) => (
                <button
                  key={v}
                  type="button"
                  role="radio"
                  aria-checked={filtre === v}
                  onClick={() => {
                    setFiltre(v);
                    pagination.setPage(0);
                  }}
                  className={`min-h-9 rounded-lg px-3 text-[12.5px] pointer-coarse:min-h-11 ${
                    filtre === v ? "bg-white font-extrabold text-ink shadow-[0_1px_2px_rgba(16,59,80,0.12)]" : "font-semibold text-muted"
                  }`}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>

          {chargement ? (
            <div className="grid gap-2" aria-hidden>
              {Array.from({ length: 6 }, (_, i) => (
                <div key={i} className="h-11 animate-pulse rounded-lg bg-bg" />
              ))}
            </div>
          ) : filtres.length === 0 ? (
            <p className="py-8 text-center text-[13px] text-muted">Aucun médicament ne correspond.</p>
          ) : (
            <>
              {/* Ordinateur : tableau. Téléphone : une carte par médicament. */}
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full border-collapse text-[13px]">
                  <thead>
                    <tr className="border-b border-line text-left text-[11px] uppercase tracking-[0.04em] text-muted">
                      <th className="py-2 pr-3 font-extrabold">DCI</th>
                      <th className="py-2 pr-3 font-extrabold">Dosage · forme · voie</th>
                      <th className="py-2 pr-3 font-extrabold">Classe</th>
                      <th className="py-2 pr-3 font-extrabold">Origine</th>
                      <th className="py-2 text-right font-extrabold">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagination.tranche.map((m) => (
                      <tr key={m.id} className={`border-b border-line last:border-b-0 ${m.actif ? "" : "text-muted"}`}>
                        <td className="py-2 pr-3">
                          <b className={m.actif ? "" : "line-through"}>{m.dci}</b>
                          {m.nom_commercial && <span className="text-muted"> ({m.nom_commercial})</span>}
                        </td>
                        <td className="py-2 pr-3">{description(m) || "—"}</td>
                        <td className="py-2 pr-3">{m.classe ?? <span className="text-muted">—</span>}</td>
                        <td className="py-2 pr-3 text-[12px]">{m.origine === "oms" ? "OMS" : "Admin"}</td>
                        <td className="py-1.5 text-right">
                          <button type="button" onClick={() => setEdition(m)} className="min-h-9 rounded-lg px-2.5 text-[12px] font-bold text-blue hover:bg-bg pointer-coarse:min-h-11">
                            Modifier
                          </button>
                          <button
                            type="button"
                            onClick={() => basculer(m)}
                            className={`min-h-9 rounded-lg px-2.5 text-[12px] font-bold hover:bg-bg pointer-coarse:min-h-11 ${m.actif ? "text-muted hover:text-red" : "text-green"}`}
                          >
                            {m.actif ? "Retirer" : "Réactiver"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <ul className="grid gap-2 md:hidden">
                {pagination.tranche.map((m) => (
                  <li key={m.id} className={`rounded-xl border border-line p-3 ${m.actif ? "" : "opacity-70"}`}>
                    <b className={`block text-[14px] ${m.actif ? "" : "line-through"}`}>
                      {m.dci}
                      {m.nom_commercial && <span className="font-semibold text-muted"> ({m.nom_commercial})</span>}
                    </b>
                    <div className="text-[12.5px] text-muted">{description(m) || "—"}</div>
                    <div className="mt-1 text-[12px]">
                      {m.classe ?? "sans classe"} · {m.origine === "oms" ? "OMS" : "Admin"}
                    </div>
                    <div className="mt-2 flex gap-2">
                      <button type="button" onClick={() => setEdition(m)} className={`${BTN_NEUTRE} flex-1`}>
                        Modifier
                      </button>
                      <button type="button" onClick={() => basculer(m)} className={`${BTN_NEUTRE} flex-1`}>
                        {m.actif ? "Retirer" : "Réactiver"}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
              <Pagination
                page={pagination.page}
                pages={pagination.pages}
                total={pagination.total}
                premier={pagination.premier}
                dernier={pagination.dernier}
                onPage={pagination.setPage}
                libelle="médicaments"
              />
            </>
          )}
        </div>
      </div>
    </AdminShell>
  );
}

/* ===================== Ajout / modification ===================== */

function EditionMedicament({
  medicament,
  onFermer,
  onFait,
}: {
  medicament: Medicament | null;
  onFermer: () => void;
  onFait: (message: string) => void;
}) {
  const [v, setV] = useState({
    dci: medicament?.dci ?? "",
    nom_commercial: medicament?.nom_commercial ?? "",
    dosage: medicament?.dosage ?? "",
    forme: medicament?.forme ?? "",
    voie: medicament?.voie ?? "",
    classe: medicament?.classe ?? "",
  });
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function enregistrer() {
    if (v.dci.trim().length < 2 || enCours) return;
    setEnCours(true);
    setErreur(null);
    const supabase = creerClientNavigateur();
    const corps = {
      dci: v.dci.trim(),
      nom_commercial: v.nom_commercial.trim() || null,
      dosage: v.dosage.trim() || null,
      forme: v.forme.trim() || null,
      voie: v.voie.trim() || null,
      classe: v.classe.trim() || null,
    };
    const requete = medicament
      ? supabase.from("medicaments").update(corps).eq("id", medicament.id).select("id")
      : supabase.from("medicaments").insert({ ...corps, origine: "admin" }).select("id");
    const { data, error } = await requete;
    setEnCours(false);
    if (error || !data?.length) {
      setErreur(
        error?.code === "23505"
          ? "Ce médicament existe déjà (même DCI, dosage et forme)."
          : (error?.message ?? "Enregistrement refusé : la permission « Paramètres » est requise.")
      );
      return;
    }
    await supabase.rpc("ecrire_audit", {
      p_action: medicament ? "A modifié un médicament de la base" : "A ajouté un médicament à la base",
      p_cible_type: "medicaments",
      p_cible_id: data[0].id,
      p_details: { cible: [corps.dci, corps.dosage, corps.forme].filter(Boolean).join(" · ") },
    });
    onFait(medicament ? `${corps.dci} mis à jour` : `${corps.dci} ajouté à la base`);
  }

  const champ = (cle: keyof typeof v, libelle: string, aide?: string) => (
    <div>
      <label htmlFor={`med-${cle}`} className="mb-1.5 block text-[12.5px] font-bold">
        {libelle}
        {aide && <span className="ml-1 font-semibold text-muted">· {aide}</span>}
      </label>
      <input id={`med-${cle}`} value={v[cle]} onChange={(e) => setV({ ...v, [cle]: e.target.value })} className={CHAMP} />
    </div>
  );

  return (
    <Dialogue
      titre={medicament ? "Modifier le médicament" : "Ajouter un médicament"}
      icone="💊"
      largeur="560px"
      onFermer={onFermer}
      pied={
        <>
          <button type="button" onClick={enregistrer} disabled={v.dci.trim().length < 2 || enCours} className={BTN_PRIMAIRE}>
            {enCours ? "Enregistrement…" : "Enregistrer"}
          </button>
          <button type="button" onClick={onFermer} className={BTN_NEUTRE}>
            Annuler
          </button>
          {erreur && (
            <p role="alert" className="w-full text-[12.5px] font-bold text-red">
              {erreur}
            </p>
          )}
        </>
      }
    >
      <div className="grid gap-3 p-4 sm:grid-cols-2">
        <div className="sm:col-span-2">{champ("dci", "DCI *", "dénomination commune internationale")}</div>
        {champ("nom_commercial", "Nom commercial")}
        {champ("dosage", "Dosage", "500 mg, 5 %…")}
        {champ("forme", "Forme", "comprimé, sirop…")}
        {champ("voie", "Voie", "orale, injectable…")}
        <div className="sm:col-span-2">{champ("classe", "Classe", "pénicillines, ains, sulfamides… — sert à l’alerte allergie")}</div>
      </div>
    </Dialogue>
  );
}

/* ===================== Import ===================== */

interface Analyse {
  colonnes: string[];
  erreurs: { ligne: number; message: string }[];
  nbErreurs: number;
  creations: { ligne: number; dci: string; dosage: string | null; forme: string | null; classe: string | null }[];
  nbCreations: number;
  modifications: { id: string; ligne: number; libelle: string; champs: { champ: string; avant: string; apres: string }[] }[];
  nbModifications: number;
  inchanges: number;
}

function ImportMedicaments({ onFermer, onFait }: { onFermer: () => void; onFait: (message: string) => void }) {
  const [fichier, setFichier] = useState<File | null>(null);
  const [analyse, setAnalyse] = useState<Analyse | null>(null);
  const [enCours, setEnCours] = useState<"analyse" | "application" | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  async function envoyer(mode: "analyse" | "appliquer") {
    if (!fichier || enCours) return;
    setEnCours(mode === "analyse" ? "analyse" : "application");
    setErreur(null);
    const corps = new FormData();
    corps.append("fichier", fichier);
    const reponse = await fetch(`/api/admin/medicaments/import?mode=${mode}`, { method: "POST", body: corps });
    const json = await reponse.json().catch(() => ({ erreur: "Réponse illisible du serveur." }));
    setEnCours(null);
    if (!reponse.ok) {
      setErreur(json.erreur ?? "Import impossible.");
      return;
    }
    if (mode === "analyse") setAnalyse(json as Analyse);
    else
      onFait(
        `Import appliqué : ${json.nbCreations} ajout(s), ${json.nbModifications} modification(s)` +
          (json.nbErreurs ? `, ${json.nbErreurs} ligne(s) écartée(s)` : "")
      );
  }

  const rien = analyse && analyse.nbCreations + analyse.nbModifications === 0;

  return (
    <Dialogue
      titre="Importer des médicaments"
      sousTitre="Fichier Excel (.xlsx) ou CSV"
      icone="📥"
      largeur="680px"
      onFermer={onFermer}
      pied={
        <>
          {analyse && !rien ? (
            <button type="button" onClick={() => envoyer("appliquer")} disabled={!!enCours} className={BTN_PRIMAIRE}>
              {enCours === "application"
                ? "Application…"
                : `Appliquer : ${analyse.nbCreations} ajout(s), ${analyse.nbModifications} modification(s)`}
            </button>
          ) : (
            <button type="button" onClick={() => envoyer("analyse")} disabled={!fichier || !!enCours} className={BTN_PRIMAIRE}>
              {enCours === "analyse" ? "Analyse…" : "Analyser le fichier"}
            </button>
          )}
          <button type="button" onClick={onFermer} className={BTN_NEUTRE}>
            Annuler
          </button>
          {erreur && (
            <p role="alert" className="w-full text-[12.5px] font-bold text-red">
              {erreur}
            </p>
          )}
        </>
      }
    >
      <div className="grid gap-4 p-4">
        <ul className="grid list-disc gap-1 pl-5 text-[12.5px] leading-relaxed text-muted">
          <li>
            Partez de l’<b className="text-ink">export Excel</b> : mêmes colonnes (DCI, Nom commercial, Dosage, Forme, Voie,
            Classe, Actif). Seule la DCI est obligatoire.
          </li>
          <li>Une ligne qui retrouve la même DCI, le même dosage et la même forme met à jour ; sinon, elle ajoute.</li>
          <li>
            Un import ne supprime rien. Pour retirer un médicament, mettez « non » dans la colonne Actif.
          </li>
          <li>Rien n’est écrit avant que vous ayez relu l’analyse.</li>
        </ul>

        <div>
          <label htmlFor="fichier-import" className="mb-1.5 block text-[12.5px] font-bold">
            Fichier
          </label>
          <input
            id="fichier-import"
            type="file"
            accept=".xlsx,.csv"
            onChange={(e) => {
              setFichier(e.target.files?.[0] ?? null);
              setAnalyse(null);
              setErreur(null);
            }}
            className="w-full text-[12.5px]"
          />
        </div>

        {analyse && (
          <div className="grid gap-3">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                ["Ajouts", analyse.nbCreations, "text-green"],
                ["Modifications", analyse.nbModifications, "text-blue"],
                ["Inchangés", analyse.inchanges, "text-muted"],
                ["Lignes en erreur", analyse.nbErreurs, analyse.nbErreurs ? "text-red" : "text-muted"],
              ].map(([l, n, c]) => (
                <div key={l as string} className="rounded-xl border border-line p-2.5">
                  <div className="text-[11px] font-bold text-muted">{l}</div>
                  <div className={`text-[20px] font-extrabold ${c}`}>{n}</div>
                </div>
              ))}
            </div>
            <p className="text-[12px] text-muted">Colonnes reconnues : {analyse.colonnes.join(", ")}.</p>
            {rien && <p className="text-[12.5px] font-bold">Rien à appliquer : la base contient déjà ce fichier.</p>}

            {analyse.nbErreurs > 0 && (
              <details open className="rounded-xl border border-[#F4C9C9] bg-red-soft p-3 text-[12.5px]">
                <summary className="cursor-pointer font-bold text-red">
                  {analyse.nbErreurs} ligne(s) écartée(s) — elles ne seront pas importées
                </summary>
                <ul className="mt-2 grid gap-1">
                  {analyse.erreurs.map((e) => (
                    <li key={`${e.ligne}-${e.message}`}>
                      <b>Ligne {e.ligne}</b> : {e.message}
                    </li>
                  ))}
                </ul>
              </details>
            )}
            {analyse.nbModifications > 0 && (
              <details className="rounded-xl border border-line p-3 text-[12.5px]">
                <summary className="cursor-pointer font-bold">
                  {analyse.nbModifications} modification(s){analyse.nbModifications > 50 ? " — les 50 premières" : ""}
                </summary>
                <ul className="mt-2 grid gap-1.5">
                  {analyse.modifications.map((m) => (
                    <li key={m.id}>
                      <b>{m.libelle}</b> (ligne {m.ligne}) :{" "}
                      {m.champs.map((c) => `${c.champ} « ${c.avant} » → « ${c.apres} »`).join(", ")}
                    </li>
                  ))}
                </ul>
              </details>
            )}
            {analyse.nbCreations > 0 && (
              <details className="rounded-xl border border-line p-3 text-[12.5px]">
                <summary className="cursor-pointer font-bold">
                  {analyse.nbCreations} ajout(s){analyse.nbCreations > 50 ? " — les 50 premiers" : ""}
                </summary>
                <ul className="mt-2 grid gap-1">
                  {analyse.creations.map((c) => (
                    <li key={c.ligne}>
                      {[c.dci, c.dosage, c.forme].filter(Boolean).join(" · ")}
                      {c.classe ? <span className="text-muted"> — {c.classe}</span> : null}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}
      </div>
    </Dialogue>
  );
}
