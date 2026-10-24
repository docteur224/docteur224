"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import AdminShell from "@/components/admin/AdminShell";
import EnTeteMobile from "@/components/mobile/EnTeteMobile";
import Dialogue from "@/components/site/Dialogue";
import Icone from "@/components/site/Icone";
import Pagination, { usePagination } from "@/components/site/Pagination";
import Toast, { useToast } from "@/components/site/Toast";
import { ecrireSynonymes, lireSynonymes } from "@/lib/import-actes";
import { creerClientNavigateur } from "@/lib/supabase/client";

/*
 * Référentiel des actes prescriptibles (migration 0068) : ce que les
 * médecins trouvent en rédigeant une ordonnance de biologie ou d'imagerie.
 *
 * Deux domaines dans un seul écran, séparés par un filtre : la biologie et
 * l'imagerie se tiennent et se modifient exactement pareil — en faire deux
 * écrans aurait dédoublé l'import, l'export et le tableau pour rien.
 *
 * Amorcé sur la Liste modèle OMS des diagnostics in vitro essentiels pour la
 * biologie ; l'imagerie n'a pas d'équivalent OMS et son catalogue est curé.
 * L'équipe complète ici, une ligne à la fois, ou en masse par un fichier
 * Excel. L'import se relit avant d'être appliqué et ne supprime jamais rien
 * — un acte se RETIRE (inactif) : une ordonnance passée peut le citer.
 *
 * Les SYNONYMES sont le cœur du sujet : un médecin cherche « hémogramme »,
 * « TGO », « écho ». Sans eux, il ne trouve pas et saisit hors référentiel.
 */

type Domaine = "biologie" | "imagerie";

interface Acte {
  id: string;
  domaine: Domaine;
  libelle: string;
  synonymes: string[] | null;
  code: string | null;
  categorie: string | null;
  actif: boolean;
  origine: "oms" | "admin";
}

type Filtre = "actifs" | "retires" | "tous";

const CHAMP =
  "w-full rounded-[11px] border border-line bg-white px-[13px] py-2.5 text-[13.5px] outline-none focus:border-teal pointer-coarse:min-h-11";
const BTN =
  "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-[10px] px-3.5 text-[12.5px] font-bold transition-colors disabled:opacity-45";
const BTN_PRIMAIRE = `${BTN} bg-teal text-white hover:bg-blue`;
const BTN_CONTOUR = `${BTN} border border-[#BFD3F6] bg-white text-blue hover:bg-teal-soft`;
const BTN_NEUTRE = `${BTN} border border-line bg-white text-ink hover:border-muted`;

const LIBELLE_DOMAINE: Record<Domaine, string> = { biologie: "Biologie", imagerie: "Imagerie" };

const sansAccents = (t: string) => t.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

function useActes(revision: number) {
  const [resultat, setResultat] = useState<{ revision: number; liste: Acte[] } | null>(null);
  useEffect(() => {
    let actif = true;
    creerClientNavigateur()
      .from("actes_prescriptibles")
      .select("id, domaine, libelle, synonymes, code, categorie, actif, origine")
      .order("domaine")
      .order("categorie")
      .order("libelle")
      .then(({ data }) => {
        if (actif) setResultat({ revision, liste: (data ?? []) as Acte[] });
      });
    return () => {
      actif = false;
    };
  }, [revision]);
  return { liste: resultat?.liste ?? [], chargement: resultat === null };
}

export default function PageActes() {
  const [revision, setRevision] = useState(0);
  const { liste, chargement } = useActes(revision);
  const { avis, annoncer, signalerEchec } = useToast();
  const [recherche, setRecherche] = useState("");
  const [domaine, setDomaine] = useState<Domaine>("biologie");
  const [filtre, setFiltre] = useState<Filtre>("actifs");
  const [edition, setEdition] = useState<Acte | "nouveau" | null>(null);
  const [importOuvert, setImportOuvert] = useState(false);

  const recharger = () => setRevision((r) => r + 1);
  const fermerEdition = useCallback(() => setEdition(null), []);
  const fermerImport = useCallback(() => setImportOuvert(false), []);

  const duDomaine = useMemo(() => liste.filter((a) => a.domaine === domaine), [liste, domaine]);

  const filtres = useMemo(() => {
    const q = sansAccents(recherche.trim());
    return duDomaine.filter(
      (a) =>
        (filtre === "tous" || (filtre === "actifs" ? a.actif : !a.actif)) &&
        (!q ||
          sansAccents(`${a.libelle} ${(a.synonymes ?? []).join(" ")} ${a.categorie ?? ""} ${a.code ?? ""}`).includes(q))
    );
  }, [duDomaine, recherche, filtre]);
  const pagination = usePagination(filtres, 25);

  const nbActifs = duDomaine.filter((a) => a.actif).length;
  const nbSansSynonyme = duDomaine.filter((a) => a.actif && !(a.synonymes ?? []).length).length;

  async function basculer(a: Acte) {
    const supabase = creerClientNavigateur();
    // `.select` : une mise à jour bloquée par la RLS ne lève pas d'erreur,
    // elle touche zéro ligne — il faut le constater pour ne pas annoncer un
    // succès qui n'a pas eu lieu.
    const { data, error } = await supabase
      .from("actes_prescriptibles")
      .update({ actif: !a.actif })
      .eq("id", a.id)
      .select("id");
    if (error || !data?.length) {
      signalerEchec(error?.message ?? "Modification refusée : la permission « Paramètres » est requise.");
      return;
    }
    await supabase.rpc("ecrire_audit", {
      p_action: a.actif ? "A retiré un acte du référentiel" : "A réactivé un acte du référentiel",
      p_cible_type: "actes_prescriptibles",
      p_cible_id: a.id,
      p_details: { cible: `${LIBELLE_DOMAINE[a.domaine]} · ${a.libelle}` },
    });
    annoncer(a.actif ? `${a.libelle} retiré — il n’est plus proposé aux médecins` : `${a.libelle} réactivé`);
    recharger();
  }

  return (
    <AdminShell permission="parametres">
      <div className="md:hidden">
        <EnTeteMobile retour="/espace-admin/plus" titre="Actes et analyses" />
      </div>
      <Toast avis={avis} />

      {edition && (
        <EditionActe
          acte={edition === "nouveau" ? null : edition}
          domaineParDefaut={domaine}
          onFermer={fermerEdition}
          onFait={(m) => {
            setEdition(null);
            annoncer(m);
            recharger();
          }}
        />
      )}
      {importOuvert && (
        <ImportActes
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
            <h2 className="text-[21px] font-extrabold tracking-[-0.3px]">Actes et analyses</h2>
            <p className="max-w-[640px] text-[13px] leading-relaxed text-muted">
              Ce que les médecins trouvent en rédigeant une ordonnance de biologie ou d’imagerie. Les synonymes décident
              de ce qu’on peut taper pour retrouver un acte. Biologie amorcée sur la liste OMS des diagnostics in vitro
              essentiels.
            </p>
          </div>
          <div className="flex w-full flex-wrap gap-2 md:w-auto">
            <a href="/api/admin/actes/export" className={`${BTN_NEUTRE} flex-1 md:flex-none`}>
              <Icone nom="telecharger" taille={15} />
              Exporter (Excel)
            </a>
            <button type="button" onClick={() => setImportOuvert(true)} className={`${BTN_CONTOUR} flex-1 md:flex-none`}>
              <Icone nom="partager" taille={15} />
              Importer
            </button>
            <button type="button" onClick={() => setEdition("nouveau")} className={`${BTN_PRIMAIRE} w-full md:w-auto`}>
              <Icone nom="plus" taille={15} epaisseur={2.4} />
              Ajouter un acte
            </button>
          </div>
        </div>

        {/* Le domaine d'abord : il décide de tout ce qu'on voit en dessous. */}
        <div role="radiogroup" aria-label="Domaine" className="mb-4 flex gap-2">
          {(["biologie", "imagerie"] as Domaine[]).map((d) => (
            <button
              key={d}
              type="button"
              role="radio"
              aria-checked={domaine === d}
              onClick={() => {
                setDomaine(d);
                pagination.setPage(0);
              }}
              className={`flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-[11px] border-[1.5px] px-3 text-[13px] font-bold transition-colors md:flex-none md:px-6 ${
                domaine === d ? "border-teal bg-teal-soft text-blue" : "border-line bg-white text-muted hover:bg-bg"
              }`}
            >
              {LIBELLE_DOMAINE[d]}
              <span className="font-semibold text-muted">({liste.filter((a) => a.domaine === d && a.actif).length})</span>
            </button>
          ))}
        </div>

        <div className="mb-4 grid grid-cols-3 gap-3">
          {[
            ["Actifs", nbActifs],
            ["Retirés", duDomaine.length - nbActifs],
            ["Sans synonyme", nbSansSynonyme],
          ].map(([l, n]) => (
            <div key={l as string} className="rounded-2xl border border-line bg-white p-3.5">
              <div className="text-[11.5px] font-bold text-muted">{l}</div>
              <div className="text-[22px] font-extrabold">{chargement ? "…" : n}</div>
            </div>
          ))}
        </div>

        <div className="rounded-2xl border border-line bg-white p-4">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <label htmlFor="recherche-acte" className="sr-only">
              Rechercher un acte
            </label>
            <input
              id="recherche-acte"
              value={recherche}
              onChange={(e) => {
                setRecherche(e.target.value);
                pagination.setPage(0);
              }}
              placeholder="Rechercher : libellé, synonyme, catégorie…"
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
                    filtre === v
                      ? "bg-white font-extrabold text-ink shadow-[0_1px_2px_rgba(16,59,80,0.12)]"
                      : "font-semibold text-muted"
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
            <p className="py-8 text-center text-[13px] text-muted">Aucun acte ne correspond.</p>
          ) : (
            <>
              {/* Ordinateur : tableau. Téléphone : une carte par acte. */}
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full border-collapse text-[13px]">
                  <thead>
                    <tr className="border-b border-line text-left text-[11px] uppercase tracking-[0.04em] text-muted">
                      <th className="py-2 pr-3 font-extrabold">Acte</th>
                      <th className="py-2 pr-3 font-extrabold">Synonymes</th>
                      <th className="py-2 pr-3 font-extrabold">Catégorie</th>
                      <th className="py-2 pr-3 font-extrabold">Origine</th>
                      <th className="py-2 text-right font-extrabold">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagination.tranche.map((a) => (
                      <tr key={a.id} className={`border-b border-line last:border-b-0 ${a.actif ? "" : "text-muted"}`}>
                        <td className="py-2 pr-3">
                          <b className={a.actif ? "" : "line-through"}>{a.libelle}</b>
                          {a.code && <span className="text-muted"> · {a.code}</span>}
                        </td>
                        <td className="py-2 pr-3 text-[12px]">
                          {(a.synonymes ?? []).length ? (
                            ecrireSynonymes(a.synonymes!)
                          ) : (
                            <span className="text-amber">aucun</span>
                          )}
                        </td>
                        <td className="py-2 pr-3">{a.categorie ?? <span className="text-muted">—</span>}</td>
                        <td className="py-2 pr-3 text-[12px]">{a.origine === "oms" ? "OMS" : "Admin"}</td>
                        <td className="py-1.5 text-right">
                          <button
                            type="button"
                            onClick={() => setEdition(a)}
                            className="min-h-9 rounded-lg px-2.5 text-[12px] font-bold text-blue hover:bg-bg pointer-coarse:min-h-11"
                          >
                            Modifier
                          </button>
                          <button
                            type="button"
                            onClick={() => basculer(a)}
                            className={`min-h-9 rounded-lg px-2.5 text-[12px] font-bold hover:bg-bg pointer-coarse:min-h-11 ${
                              a.actif ? "text-muted hover:text-red" : "text-green"
                            }`}
                          >
                            {a.actif ? "Retirer" : "Réactiver"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <ul className="grid gap-2 md:hidden">
                {pagination.tranche.map((a) => (
                  <li key={a.id} className={`rounded-xl border border-line p-3 ${a.actif ? "" : "opacity-70"}`}>
                    <b className={`block text-[14px] ${a.actif ? "" : "line-through"}`}>{a.libelle}</b>
                    <div className="text-[12.5px] text-muted">
                      {(a.synonymes ?? []).length ? ecrireSynonymes(a.synonymes!) : "aucun synonyme"}
                    </div>
                    <div className="mt-1 text-[12px]">
                      {a.categorie ?? "sans catégorie"} · {a.origine === "oms" ? "OMS" : "Admin"}
                    </div>
                    <div className="mt-2 flex gap-2">
                      <button type="button" onClick={() => setEdition(a)} className={`${BTN_NEUTRE} flex-1`}>
                        Modifier
                      </button>
                      <button type="button" onClick={() => basculer(a)} className={`${BTN_NEUTRE} flex-1`}>
                        {a.actif ? "Retirer" : "Réactiver"}
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
                libelle="actes"
              />
            </>
          )}
        </div>
      </div>
    </AdminShell>
  );
}

/* ===================== Ajout / modification ===================== */

function EditionActe({
  acte,
  domaineParDefaut,
  onFermer,
  onFait,
}: {
  acte: Acte | null;
  domaineParDefaut: Domaine;
  onFermer: () => void;
  onFait: (message: string) => void;
}) {
  const [v, setV] = useState({
    domaine: acte?.domaine ?? domaineParDefaut,
    libelle: acte?.libelle ?? "",
    synonymes: ecrireSynonymes(acte?.synonymes ?? []),
    code: acte?.code ?? "",
    categorie: acte?.categorie ?? "",
  });
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function enregistrer() {
    if (v.libelle.trim().length < 2 || enCours) return;
    setEnCours(true);
    setErreur(null);
    const supabase = creerClientNavigateur();
    const corps = {
      domaine: v.domaine,
      libelle: v.libelle.trim(),
      synonymes: lireSynonymes(v.synonymes),
      code: v.code.trim() || null,
      categorie: v.categorie.trim() || null,
    };
    const requete = acte
      ? supabase.from("actes_prescriptibles").update(corps).eq("id", acte.id).select("id")
      : supabase.from("actes_prescriptibles").insert({ ...corps, origine: "admin" }).select("id");
    const { data, error } = await requete;
    setEnCours(false);
    if (error || !data?.length) {
      setErreur(
        error?.code === "23505"
          ? "Cet acte existe déjà dans ce domaine."
          : (error?.message ?? "Enregistrement refusé : la permission « Paramètres » est requise.")
      );
      return;
    }
    await supabase.rpc("ecrire_audit", {
      p_action: acte ? "A modifié un acte du référentiel" : "A ajouté un acte au référentiel",
      p_cible_type: "actes_prescriptibles",
      p_cible_id: data[0].id,
      p_details: { cible: `${LIBELLE_DOMAINE[corps.domaine]} · ${corps.libelle}` },
    });
    onFait(acte ? `${corps.libelle} mis à jour` : `${corps.libelle} ajouté au référentiel`);
  }

  const champ = (cle: "libelle" | "synonymes" | "code" | "categorie", libelle: string, aide?: string) => (
    <div>
      <label htmlFor={`acte-${cle}`} className="mb-1.5 block text-[12.5px] font-bold">
        {libelle}
        {aide && <span className="ml-1 font-semibold text-muted">· {aide}</span>}
      </label>
      <input id={`acte-${cle}`} value={v[cle]} onChange={(e) => setV({ ...v, [cle]: e.target.value })} className={CHAMP} />
    </div>
  );

  return (
    <Dialogue
      titre={acte ? "Modifier l’acte" : "Ajouter un acte"}
      icone="🔬"
      largeur="560px"
      onFermer={onFermer}
      pied={
        <>
          <button
            type="button"
            onClick={enregistrer}
            disabled={v.libelle.trim().length < 2 || enCours}
            className={BTN_PRIMAIRE}
          >
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
      <div className="grid gap-3 p-4">
        <div>
          <label htmlFor="acte-domaine" className="mb-1.5 block text-[12.5px] font-bold">
            Domaine *
          </label>
          <select
            id="acte-domaine"
            value={v.domaine}
            onChange={(e) => setV({ ...v, domaine: e.target.value as Domaine })}
            className={CHAMP}
          >
            <option value="biologie">Biologie</option>
            <option value="imagerie">Imagerie</option>
          </select>
        </div>
        {champ("libelle", "Libellé *", "tel qu’il s’imprimera sur l’ordonnance")}
        {champ("synonymes", "Synonymes", "séparés par un point-virgule — nfs ; hemogramme ; numeration")}
        <p className="-mt-1 text-[11.5px] leading-relaxed text-muted">
          Les synonymes décident de ce qu’un médecin peut taper pour retrouver l’acte. Sans eux, il faut écrire le
          libellé exact — et l’acte sera saisi hors référentiel. Les accents n’ont pas d’importance.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {champ("categorie", "Catégorie", "hématologie, échographie…")}
          {champ("code", "Code", "nomenclature locale")}
        </div>
      </div>
    </Dialogue>
  );
}

/* ===================== Import ===================== */

interface Analyse {
  colonnes: string[];
  erreurs: { ligne: number; message: string }[];
  nbErreurs: number;
  creations: { ligne: number; domaine: string; libelle: string; categorie: string | null }[];
  nbCreations: number;
  modifications: { id: string; ligne: number; libelle: string; champs: { champ: string; avant: string; apres: string }[] }[];
  nbModifications: number;
  inchanges: number;
}

function ImportActes({ onFermer, onFait }: { onFermer: () => void; onFait: (message: string) => void }) {
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
    const reponse = await fetch(`/api/admin/actes/import?mode=${mode}`, { method: "POST", body: corps });
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
      titre="Importer des actes"
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
            Partez de l’<b className="text-ink">export Excel</b> : mêmes colonnes (Domaine, Libellé, Synonymes, Code,
            Catégorie, Actif). Le <b className="text-ink">domaine</b> et le <b className="text-ink">libellé</b> sont
            obligatoires.
          </li>
          <li>
            Les <b className="text-ink">synonymes</b> d’une même ligne se séparent par un point-virgule, pas par une
            virgule.
          </li>
          <li>Une ligne qui retrouve le même domaine et le même libellé met à jour ; sinon, elle ajoute.</li>
          <li>Un import ne supprime rien. Pour retirer un acte, mettez « non » dans la colonne Actif.</li>
          <li>Rien n’est écrit avant que vous ayez relu l’analyse.</li>
        </ul>

        <div>
          <label htmlFor="fichier-import-actes" className="mb-1.5 block text-[12.5px] font-bold">
            Fichier
          </label>
          <input
            id="fichier-import-actes"
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
                      {c.libelle}
                      <span className="text-muted">
                        {" "}
                        — {c.domaine}
                        {c.categorie ? ` · ${c.categorie}` : ""}
                      </span>
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
