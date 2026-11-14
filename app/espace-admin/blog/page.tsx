"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import AdminShell from "@/components/admin/AdminShell";
import EnTeteMobile from "@/components/mobile/EnTeteMobile";
import EditeurTexteRiche from "@/components/site/EditeurTexteRiche";
import {
  EMOJIS_CATEGORIE_SUGGERES,
  RESEAUX_CONNUS,
  RESEAUX_PROPOSES,
  dateLisible,
  type ArticleBlog,
  type CategorieBlog,
} from "@/lib/blog";
import {
  basculerDrapeauArticle,
  creerArticle,
  creerCategorie,
  echangerPositionsCategorie,
  listerArticles,
  listerCategories,
  listerReseaux,
  modifierArticle,
  modifierCategorie,
  remplacerReseaux,
  supprimerArticle,
  supprimerCategorie,
  televerserCouverture,
  type BrouillonArticle,
  type BrouillonCategorie,
} from "@/lib/blog-admin";

/*
 * Le blog — l'écran qui alimente les pages publiques /blog.
 *
 * Réservé à la permission « Paramètres » (comme les conseils santé). Trois
 * onglets : les ARTICLES (brouillon / publié, à la une), les CATÉGORIES (CRUD
 * complet, ordonnables) et les RÉSEAUX sociaux (« Suivez-nous »). Les écritures
 * passent par la session de l'administrateur ; la RLS (0092) fait le reste, et
 * chaque écriture revalide les pages publiques.
 */

const champ =
  "w-full rounded-[11px] border border-line bg-white px-[13px] py-3 text-[13.5px] outline-none focus:border-teal";
const etiquette = "mb-1.5 block text-xs font-bold text-muted";

const BROUILLON_ARTICLE_VIDE: BrouillonArticle = {
  titre: "",
  extrait: "",
  contenu: "",
  categorie_id: null,
  tags: [],
  auteur: "",
  couverture_url: null,
  couverture_id: null,
  vedette: false,
  publie: false,
};

type Onglet = "articles" | "categories" | "reseaux";

export default function BlogAdmin() {
  const [onglet, setOnglet] = useState<Onglet>("articles");

  return (
    <AdminShell permission="parametres">
      <div className="md:hidden">
        <EnTeteMobile retour="/espace-admin/plus" titre="Blog" />
      </div>

      <div className="px-4 py-4 md:px-0 md:py-0">
        <div className="mb-4">
          <h2 className="text-[21px] font-extrabold tracking-[-0.3px]">Blog</h2>
          <small className="text-[13px] text-muted">
            Rédiger, illustrer et publier les articles de{" "}
            <Link href="/blog" className="font-bold text-teal hover:underline" target="_blank">
              /blog ↗
            </Link>
          </small>
        </div>

        {/* Onglets */}
        <div className="mb-5 flex gap-1.5 overflow-x-auto border-b border-line">
          {([
            ["articles", "Articles"],
            ["categories", "Catégories"],
            ["reseaux", "Réseaux sociaux"],
          ] as [Onglet, string][]).map(([cle, libelle]) => (
            <button
              key={cle}
              type="button"
              onClick={() => setOnglet(cle)}
              aria-current={onglet === cle ? "page" : undefined}
              className={`-mb-px flex-none border-b-2 px-3 py-2.5 text-[13px] font-bold transition-colors ${
                onglet === cle
                  ? "border-teal text-blue"
                  : "border-transparent text-muted hover:text-blue"
              }`}
            >
              {libelle}
            </button>
          ))}
        </div>

        {onglet === "articles" && <OngletArticles />}
        {onglet === "categories" && <OngletCategories />}
        {onglet === "reseaux" && <OngletReseaux />}
      </div>
    </AdminShell>
  );
}

/* ============================= ARTICLES ============================= */

function OngletArticles() {
  const [liste, setListe] = useState<ArticleBlog[]>([]);
  const [categories, setCategories] = useState<CategorieBlog[]>([]);
  const [chargement, setChargement] = useState(true);
  const [edition, setEdition] = useState<null | { id: string | null }>(null);

  const recharger = () =>
    Promise.all([listerArticles(), listerCategories()])
      .then(([a, c]) => {
        setListe(a);
        setCategories(c);
      })
      .catch(() => {});

  useEffect(() => {
    let actif = true;
    Promise.all([listerArticles(), listerCategories()])
      .then(([a, c]) => {
        if (!actif) return;
        setListe(a);
        setCategories(c);
      })
      .catch(() => {})
      .finally(() => actif && setChargement(false));
    return () => {
      actif = false;
    };
  }, []);

  const enCours = liste.find((a) => a.id === edition?.id) ?? null;
  const nomCategorie = (id: string | null) =>
    id ? categories.find((c) => c.id === id)?.nom ?? null : null;

  return (
    <>
      {!edition && (
        <div className="mb-4 flex justify-end">
          <button
            type="button"
            onClick={() => setEdition({ id: null })}
            className="rounded-[10px] bg-teal px-[16px] py-2.5 text-[13px] font-bold text-white transition-colors hover:bg-teal-hover"
          >
            ＋ Nouvel article
          </button>
        </div>
      )}

      {edition ? (
        <EditeurArticle
          article={enCours}
          categories={categories}
          onFerme={() => setEdition(null)}
          onEnregistre={async () => {
            setEdition(null);
            await recharger();
          }}
        />
      ) : chargement ? (
        <p className="rounded-2xl border border-line bg-white p-6 text-center text-[13px] text-muted">
          Chargement…
        </p>
      ) : liste.length === 0 ? (
        <div className="rounded-2xl border border-line bg-white p-8 text-center">
          <span className="text-[34px]" aria-hidden>
            📰
          </span>
          <p className="mx-auto mt-2 max-w-[360px] text-[13px] text-muted">
            Aucun article pour l’instant. Rédigez le premier — une fois publié, il paraîtra sur la
            page Blog.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {liste.map((a) => (
            <LigneArticle
              key={a.id}
              article={a}
              categorie={nomCategorie(a.categorie_id)}
              onModifier={() => setEdition({ id: a.id })}
              onMaj={recharger}
            />
          ))}
        </div>
      )}
    </>
  );
}

function LigneArticle({
  article,
  categorie,
  onModifier,
  onMaj,
}: {
  article: ArticleBlog;
  categorie: string | null;
  onModifier: () => void;
  onMaj: () => Promise<void>;
}) {
  const [occupe, setOccupe] = useState(false);
  const [confirmer, setConfirmer] = useState(false);

  async function agir(action: () => Promise<unknown>) {
    setOccupe(true);
    await action();
    await onMaj();
    setOccupe(false);
  }

  return (
    <div className="flex items-center gap-3 rounded-2xl border border-line bg-white p-3 md:p-3.5">
      {article.couverture_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={article.couverture_url}
          alt=""
          className="h-12 w-12 flex-none rounded-xl object-cover md:h-14 md:w-14"
        />
      ) : (
        <span
          aria-hidden
          className="grid h-12 w-12 flex-none place-items-center rounded-xl bg-teal-soft text-[22px] md:h-14 md:w-14"
        >
          📰
        </span>
      )}

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <b className="text-[13.5px] font-extrabold md:text-[14.5px]">{article.titre}</b>
          {article.vedette && (
            <span className="rounded-full bg-teal px-2 py-0.5 text-[10px] font-bold text-white">
              ★ À la une
            </span>
          )}
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
              article.publie ? "bg-green-soft text-green" : "bg-amber-soft text-[#8a5a12]"
            }`}
          >
            {article.publie ? "Publié" : "Brouillon"}
          </span>
        </div>
        <p className="mt-0.5 line-clamp-1 text-[12px] text-muted">
          {categorie ? `${categorie} · ` : ""}
          {dateLisible(article.publie_le)}
          {article.publie ? ` · ${article.vues} vue${article.vues > 1 ? "s" : ""}` : ""}
        </p>
      </div>

      <div className="flex flex-none items-center gap-1">
        <button
          type="button"
          disabled={occupe}
          onClick={() => agir(() => basculerDrapeauArticle(article.id, "vedette", !article.vedette))}
          className={`grid h-9 w-9 place-items-center rounded-lg border text-[15px] transition-colors ${
            article.vedette
              ? "border-teal-line bg-teal-soft text-teal"
              : "border-line bg-white text-muted hover:border-teal-line"
          }`}
          aria-label={article.vedette ? "Retirer de la une" : "Mettre à la une"}
          title={article.vedette ? "Retirer de la une" : "Mettre à la une"}
        >
          ★
        </button>
        <button
          type="button"
          disabled={occupe}
          onClick={() => agir(() => basculerDrapeauArticle(article.id, "publie", !article.publie))}
          className="hidden rounded-lg border border-line bg-white px-2.5 py-2 text-[11.5px] font-bold text-blue hover:border-teal-line sm:block"
        >
          {article.publie ? "Dépublier" : "Publier"}
        </button>
        <button
          type="button"
          onClick={onModifier}
          className="rounded-lg border border-line bg-white px-2.5 py-2 text-[11.5px] font-bold text-blue hover:border-teal-line"
        >
          Modifier
        </button>
        {confirmer ? (
          <button
            type="button"
            disabled={occupe}
            onClick={() => agir(() => supprimerArticle(article))}
            className="rounded-lg bg-red px-2.5 py-2 text-[11.5px] font-bold text-white"
          >
            Confirmer ?
          </button>
        ) : (
          <button
            type="button"
            onClick={() => {
              setConfirmer(true);
              setTimeout(() => setConfirmer(false), 3000);
            }}
            className="grid h-9 w-9 place-items-center rounded-lg border border-line bg-white text-muted transition-colors hover:border-[#f0cdc7] hover:text-red"
            aria-label="Supprimer"
            title="Supprimer"
          >
            🗑
          </button>
        )}
      </div>
    </div>
  );
}

function EditeurArticle({
  article,
  categories,
  onFerme,
  onEnregistre,
}: {
  article: ArticleBlog | null;
  categories: CategorieBlog[];
  onFerme: () => void;
  onEnregistre: () => void | Promise<void>;
}) {
  const [b, setB] = useState<BrouillonArticle>(
    article
      ? {
          titre: article.titre,
          extrait: article.extrait,
          contenu: article.contenu,
          categorie_id: article.categorie_id,
          tags: article.tags,
          auteur: article.auteur ?? "",
          couverture_url: article.couverture_url,
          couverture_id: article.couverture_id,
          vedette: article.vedette,
          publie: article.publie,
        }
      : { ...BROUILLON_ARTICLE_VIDE }
  );
  const [tagsTexte, setTagsTexte] = useState((article?.tags ?? []).join(", "));
  const imageInitiale = useRef<string | null>(article?.couverture_id ?? null);
  const [envoiImage, setEnvoiImage] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enreg, setEnreg] = useState(false);
  const fichierRef = useRef<HTMLInputElement>(null);

  const maj = (p: Partial<BrouillonArticle>) => setB((v) => ({ ...v, ...p }));

  function detruireImage(publicId: string) {
    fetch(`/api/admin/blog/image?public_id=${encodeURIComponent(publicId)}`, {
      method: "DELETE",
    }).catch(() => {});
  }

  async function choisirImage(fichier: File) {
    setErreur(null);
    setEnvoiImage(true);
    if (b.couverture_id && b.couverture_id !== imageInitiale.current) detruireImage(b.couverture_id);
    const res = await televerserCouverture(fichier);
    setEnvoiImage(false);
    if ("erreur" in res) {
      setErreur(res.erreur);
      return;
    }
    maj({ couverture_url: res.url, couverture_id: res.public_id });
  }

  function retirerImage() {
    if (b.couverture_id && b.couverture_id !== imageInitiale.current) detruireImage(b.couverture_id);
    maj({ couverture_url: null, couverture_id: null });
  }

  function lireTags(texte: string) {
    setTagsTexte(texte);
    maj({
      tags: texte
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
    });
  }

  async function enregistrer() {
    setErreur(null);
    setEnreg(true);
    const res = article ? await modifierArticle(article.id, b) : await creerArticle(b);
    setEnreg(false);
    if (!res.ok) {
      setErreur(res.erreur ?? "Enregistrement refusé.");
      return;
    }
    if (imageInitiale.current && imageInitiale.current !== b.couverture_id) {
      detruireImage(imageInitiale.current);
    }
    await onEnregistre();
  }

  function annuler() {
    if (b.couverture_id && b.couverture_id !== imageInitiale.current) detruireImage(b.couverture_id);
    onFerme();
  }

  return (
    <div className="rounded-2xl border border-line bg-white p-4 md:p-6">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-[16px] font-extrabold">
          {article ? "Modifier l’article" : "Nouvel article"}
        </h3>
        <button type="button" onClick={annuler} className="text-[12.5px] font-bold text-muted hover:text-red">
          Annuler
        </button>
      </div>

      <div className="grid gap-4">
        <div>
          <label className={etiquette}>Titre *</label>
          <input
            className={champ}
            value={b.titre}
            onChange={(e) => maj({ titre: e.target.value })}
            placeholder="Docteur 224 lance son blog"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={etiquette}>Catégorie</label>
            <select
              className={champ}
              value={b.categorie_id ?? ""}
              onChange={(e) => maj({ categorie_id: e.target.value || null })}
            >
              <option value="">— Aucune —</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.emoji ? `${c.emoji} ` : ""}
                  {c.nom}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={etiquette}>Auteur</label>
            <input
              className={champ}
              value={b.auteur}
              onChange={(e) => maj({ auteur: e.target.value })}
              placeholder="L’équipe Docteur 224"
            />
          </div>
        </div>

        <div>
          <label className={etiquette}>Extrait * — affiché sur la carte et en aperçu de partage</label>
          <textarea
            className={`${champ} min-h-[64px] resize-y`}
            rows={2}
            value={b.extrait}
            onChange={(e) => maj({ extrait: e.target.value })}
            placeholder="En une ou deux phrases, ce que le lecteur retiendra."
          />
        </div>

        {/* Couverture */}
        <div>
          <label className={etiquette}>Image de couverture</label>
          <div className="flex items-center gap-4">
            {b.couverture_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={b.couverture_url}
                alt="Aperçu"
                className="h-[72px] w-[128px] flex-none rounded-xl border border-line object-cover"
              />
            ) : (
              <span
                aria-hidden
                className="grid h-[72px] w-[128px] flex-none place-items-center rounded-xl border border-dashed border-line bg-bg text-[26px]"
              >
                🖼
              </span>
            )}
            <div>
              <input
                ref={fichierRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) choisirImage(f);
                  if (fichierRef.current) fichierRef.current.value = "";
                }}
              />
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={envoiImage}
                  onClick={() => fichierRef.current?.click()}
                  className="rounded-[9px] border-[1.5px] border-line bg-white px-3 py-1.5 text-[11.5px] font-bold text-blue transition-colors hover:border-teal disabled:opacity-50"
                >
                  {envoiImage ? "Envoi…" : b.couverture_url ? "Changer l’image" : "Ajouter une image"}
                </button>
                {b.couverture_url && !envoiImage && (
                  <button
                    type="button"
                    onClick={retirerImage}
                    className="rounded-[9px] border-[1.5px] border-line bg-white px-3 py-1.5 text-[11.5px] font-bold text-muted transition-colors hover:text-red"
                  >
                    Retirer
                  </button>
                )}
              </div>
              <p className="mt-1.5 text-[11.5px] text-muted">JPEG, PNG ou WebP · 5 Mo maximum</p>
            </div>
          </div>
        </div>

        <div>
          <label className={etiquette}>Contenu — mise en forme, titres et listes</label>
          <EditeurTexteRiche valeur={b.contenu} onChange={(html) => maj({ contenu: html })} />
        </div>

        <div>
          <label className={etiquette}>Mots-clés — séparés par des virgules</label>
          <input
            className={champ}
            value={tagsTexte}
            onChange={(e) => lireTags(e.target.value)}
            placeholder="prévention, rendez-vous, nouveauté"
          />
          {b.tags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {b.tags.map((t) => (
                <span key={t} className="rounded-full bg-teal-soft px-2.5 py-1 text-[11px] font-bold text-blue">
                  #{t}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-5 border-t border-line pt-4">
          <label className="flex cursor-pointer items-center gap-2 text-[13px] font-bold">
            <input
              type="checkbox"
              checked={b.publie}
              onChange={(e) => maj({ publie: e.target.checked })}
              className="h-4 w-4 accent-teal"
            />
            Publié (visible du public)
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-[13px] font-bold">
            <input
              type="checkbox"
              checked={b.vedette}
              onChange={(e) => maj({ vedette: e.target.checked })}
              className="h-4 w-4 accent-teal"
            />
            À la une
          </label>
        </div>

        {erreur && (
          <p className="rounded-xl bg-red-soft px-3 py-2.5 text-[12.5px] font-bold text-red">{erreur}</p>
        )}

        <div className="flex gap-2.5">
          <button
            type="button"
            disabled={enreg || envoiImage}
            onClick={enregistrer}
            className="rounded-[10px] bg-teal px-[18px] py-2.5 text-[13px] font-bold text-white transition-colors hover:bg-teal-hover disabled:opacity-50"
          >
            {enreg ? "Enregistrement…" : article ? "Enregistrer les modifications" : "Créer l’article"}
          </button>
          <button
            type="button"
            onClick={annuler}
            className="rounded-[10px] border border-line bg-white px-[18px] py-2.5 text-[13px] font-bold text-muted"
          >
            Annuler
          </button>
        </div>
      </div>
    </div>
  );
}

/* ============================ CATÉGORIES ============================ */

const BROUILLON_CATEGORIE_VIDE: BrouillonCategorie = { nom: "", description: "", emoji: "" };

function OngletCategories() {
  const [liste, setListe] = useState<CategorieBlog[]>([]);
  const [chargement, setChargement] = useState(true);
  const [edition, setEdition] = useState<null | { id: string | null }>(null);

  const recharger = () => listerCategories().then(setListe).catch(() => {});

  useEffect(() => {
    let actif = true;
    listerCategories()
      .then((l) => actif && setListe(l))
      .catch(() => {})
      .finally(() => actif && setChargement(false));
    return () => {
      actif = false;
    };
  }, []);

  const enCours = liste.find((c) => c.id === edition?.id) ?? null;

  return (
    <>
      {!edition && (
        <div className="mb-4 flex justify-end">
          <button
            type="button"
            onClick={() => setEdition({ id: null })}
            className="rounded-[10px] bg-teal px-[16px] py-2.5 text-[13px] font-bold text-white transition-colors hover:bg-teal-hover"
          >
            ＋ Nouvelle catégorie
          </button>
        </div>
      )}

      {edition ? (
        <EditeurCategorie
          categorie={enCours}
          onFerme={() => setEdition(null)}
          onEnregistre={async () => {
            setEdition(null);
            await recharger();
          }}
        />
      ) : chargement ? (
        <p className="rounded-2xl border border-line bg-white p-6 text-center text-[13px] text-muted">
          Chargement…
        </p>
      ) : liste.length === 0 ? (
        <div className="rounded-2xl border border-line bg-white p-8 text-center">
          <span className="text-[34px]" aria-hidden>
            🗂
          </span>
          <p className="mx-auto mt-2 max-w-[360px] text-[13px] text-muted">
            Aucune catégorie. Créez-en une pour ranger vos articles.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {liste.map((c, i) => (
            <LigneCategorie
              key={c.id}
              categorie={c}
              premier={i === 0}
              dernier={i === liste.length - 1}
              voisinHaut={liste[i - 1]}
              voisinBas={liste[i + 1]}
              onModifier={() => setEdition({ id: c.id })}
              onMaj={recharger}
            />
          ))}
        </div>
      )}
    </>
  );
}

function LigneCategorie({
  categorie,
  premier,
  dernier,
  voisinHaut,
  voisinBas,
  onModifier,
  onMaj,
}: {
  categorie: CategorieBlog;
  premier: boolean;
  dernier: boolean;
  voisinHaut?: CategorieBlog;
  voisinBas?: CategorieBlog;
  onModifier: () => void;
  onMaj: () => Promise<void>;
}) {
  const [occupe, setOccupe] = useState(false);
  const [confirmer, setConfirmer] = useState(false);

  async function agir(action: () => Promise<unknown>) {
    setOccupe(true);
    await action();
    await onMaj();
    setOccupe(false);
  }

  return (
    <div className="flex items-center gap-3 rounded-2xl border border-line bg-white p-3 md:p-3.5">
      <span
        aria-hidden
        className="grid h-11 w-11 flex-none place-items-center rounded-xl bg-teal-soft text-[20px]"
      >
        {categorie.emoji || "🗂"}
      </span>
      <div className="min-w-0 flex-1">
        <b className="text-[13.5px] font-extrabold md:text-[14.5px]">{categorie.nom}</b>
        {categorie.description && (
          <p className="mt-0.5 line-clamp-1 text-[12px] text-muted">{categorie.description}</p>
        )}
      </div>
      <div className="flex flex-none items-center gap-1">
        <div className="hidden flex-col sm:flex">
          <button
            type="button"
            disabled={premier || occupe || !voisinHaut}
            onClick={() => voisinHaut && agir(() => echangerPositionsCategorie(categorie, voisinHaut))}
            className="grid h-5 w-6 place-items-center rounded text-muted hover:bg-bg disabled:opacity-30"
            aria-label="Monter"
          >
            ▲
          </button>
          <button
            type="button"
            disabled={dernier || occupe || !voisinBas}
            onClick={() => voisinBas && agir(() => echangerPositionsCategorie(categorie, voisinBas))}
            className="grid h-5 w-6 place-items-center rounded text-muted hover:bg-bg disabled:opacity-30"
            aria-label="Descendre"
          >
            ▼
          </button>
        </div>
        <button
          type="button"
          onClick={onModifier}
          className="rounded-lg border border-line bg-white px-2.5 py-2 text-[11.5px] font-bold text-blue hover:border-teal-line"
        >
          Modifier
        </button>
        {confirmer ? (
          <button
            type="button"
            disabled={occupe}
            onClick={() => agir(() => supprimerCategorie(categorie.id))}
            className="rounded-lg bg-red px-2.5 py-2 text-[11.5px] font-bold text-white"
          >
            Confirmer ?
          </button>
        ) : (
          <button
            type="button"
            onClick={() => {
              setConfirmer(true);
              setTimeout(() => setConfirmer(false), 3000);
            }}
            className="grid h-9 w-9 place-items-center rounded-lg border border-line bg-white text-muted transition-colors hover:border-[#f0cdc7] hover:text-red"
            aria-label="Supprimer"
            title="Supprimer"
          >
            🗑
          </button>
        )}
      </div>
    </div>
  );
}

function EditeurCategorie({
  categorie,
  onFerme,
  onEnregistre,
}: {
  categorie: CategorieBlog | null;
  onFerme: () => void;
  onEnregistre: () => void | Promise<void>;
}) {
  const [b, setB] = useState<BrouillonCategorie>(
    categorie
      ? { nom: categorie.nom, description: categorie.description ?? "", emoji: categorie.emoji ?? "" }
      : { ...BROUILLON_CATEGORIE_VIDE }
  );
  const [erreur, setErreur] = useState<string | null>(null);
  const [enreg, setEnreg] = useState(false);
  const maj = (p: Partial<BrouillonCategorie>) => setB((v) => ({ ...v, ...p }));

  async function enregistrer() {
    setErreur(null);
    setEnreg(true);
    const res = categorie ? await modifierCategorie(categorie.id, b) : await creerCategorie(b);
    setEnreg(false);
    if (!res.ok) {
      setErreur(res.erreur ?? "Enregistrement refusé.");
      return;
    }
    await onEnregistre();
  }

  return (
    <div className="rounded-2xl border border-line bg-white p-4 md:p-6">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-[16px] font-extrabold">
          {categorie ? "Modifier la catégorie" : "Nouvelle catégorie"}
        </h3>
        <button type="button" onClick={onFerme} className="text-[12.5px] font-bold text-muted hover:text-red">
          Annuler
        </button>
      </div>

      <div className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-[1fr_120px]">
          <div>
            <label className={etiquette}>Nom *</label>
            <input
              className={champ}
              value={b.nom}
              onChange={(e) => maj({ nom: e.target.value })}
              placeholder="Actualités"
            />
          </div>
          <div>
            <label className={etiquette}>Emoji</label>
            <input
              className={`${champ} text-center text-[20px]`}
              value={b.emoji}
              onChange={(e) => maj({ emoji: e.target.value })}
              placeholder="📣"
              maxLength={4}
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {EMOJIS_CATEGORIE_SUGGERES.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => maj({ emoji: e })}
              className="grid h-9 w-9 place-items-center rounded-lg border border-line bg-white text-[18px] hover:border-teal"
            >
              {e}
            </button>
          ))}
        </div>
        <div>
          <label className={etiquette}>Description — courte, affichée en tête d’archive</label>
          <textarea
            className={`${champ} min-h-[60px] resize-y`}
            rows={2}
            value={b.description}
            onChange={(e) => maj({ description: e.target.value })}
            placeholder="Les nouveautés de la plateforme Docteur 224."
          />
        </div>

        {erreur && (
          <p className="rounded-xl bg-red-soft px-3 py-2.5 text-[12.5px] font-bold text-red">{erreur}</p>
        )}

        <div className="flex gap-2.5">
          <button
            type="button"
            disabled={enreg}
            onClick={enregistrer}
            className="rounded-[10px] bg-teal px-[18px] py-2.5 text-[13px] font-bold text-white transition-colors hover:bg-teal-hover disabled:opacity-50"
          >
            {enreg ? "Enregistrement…" : categorie ? "Enregistrer" : "Créer la catégorie"}
          </button>
          <button
            type="button"
            onClick={onFerme}
            className="rounded-[10px] border border-line bg-white px-[18px] py-2.5 text-[13px] font-bold text-muted"
          >
            Annuler
          </button>
        </div>
      </div>
    </div>
  );
}

/* ============================= RÉSEAUX ============================= */

function OngletReseaux() {
  const [valeurs, setValeurs] = useState<Record<string, string>>({});
  const [chargement, setChargement] = useState(true);
  const [enreg, setEnreg] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    let actif = true;
    listerReseaux()
      .then((liste) => {
        if (!actif) return;
        const m: Record<string, string> = {};
        for (const r of liste) m[r.reseau] = r.url;
        setValeurs(m);
      })
      .catch(() => {})
      .finally(() => actif && setChargement(false));
    return () => {
      actif = false;
    };
  }, []);

  async function enregistrer() {
    setErreur(null);
    setMessage(null);
    setEnreg(true);
    const entrees = RESEAUX_PROPOSES.map((r) => ({ reseau: r, url: valeurs[r] ?? "" }));
    const res = await remplacerReseaux(entrees);
    setEnreg(false);
    if (!res.ok) {
      setErreur(res.erreur ?? "Enregistrement refusé.");
      return;
    }
    setMessage("Liens enregistrés.");
    setTimeout(() => setMessage(null), 2500);
  }

  if (chargement) {
    return (
      <p className="rounded-2xl border border-line bg-white p-6 text-center text-[13px] text-muted">
        Chargement…
      </p>
    );
  }

  return (
    <div className="rounded-2xl border border-line bg-white p-4 md:p-6">
      <h3 className="text-[16px] font-extrabold">Suivez-nous</h3>
      <p className="mt-1 text-[13px] text-muted">
        Les liens affichés dans la barre latérale du blog. Laissez vide pour masquer un réseau.
      </p>

      <div className="mt-4 grid gap-3">
        {RESEAUX_PROPOSES.map((r) => {
          const connu = RESEAUX_CONNUS[r];
          return (
            <div key={r} className="flex items-center gap-3">
              <span
                aria-hidden
                className="grid h-10 w-10 flex-none place-items-center rounded-xl border border-line text-white"
                style={{ background: connu?.couleur ?? "var(--teal)" }}
              >
                {connu ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                    <path d={connu.chemin} />
                  </svg>
                ) : (
                  "🔗"
                )}
              </span>
              <div className="min-w-0 flex-1">
                <label className="mb-1 block text-[12px] font-bold text-muted" htmlFor={`reseau-${r}`}>
                  {connu?.libelle ?? r}
                </label>
                <input
                  id={`reseau-${r}`}
                  type="url"
                  className={champ}
                  value={valeurs[r] ?? ""}
                  onChange={(e) => setValeurs((v) => ({ ...v, [r]: e.target.value }))}
                  placeholder={`https://…`}
                />
              </div>
            </div>
          );
        })}
      </div>

      {erreur && (
        <p className="mt-4 rounded-xl bg-red-soft px-3 py-2.5 text-[12.5px] font-bold text-red">{erreur}</p>
      )}
      {message && (
        <p className="mt-4 rounded-xl bg-green-soft px-3 py-2.5 text-[12.5px] font-bold text-green">
          {message}
        </p>
      )}

      <div className="mt-5">
        <button
          type="button"
          disabled={enreg}
          onClick={enregistrer}
          className="rounded-[10px] bg-teal px-[18px] py-2.5 text-[13px] font-bold text-white transition-colors hover:bg-teal-hover disabled:opacity-50"
        >
          {enreg ? "Enregistrement…" : "Enregistrer les liens"}
        </button>
      </div>
    </div>
  );
}
