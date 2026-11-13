"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import AdminShell from "@/components/admin/AdminShell";
import EnTeteMobile from "@/components/mobile/EnTeteMobile";
import { CATEGORIES_SUGGEREES, type ConseilSante } from "@/lib/conseils-sante";
import {
  basculerDrapeau,
  creerConseil,
  echangerPositions,
  listerConseils,
  modifierConseil,
  supprimerConseil,
  televerserImage,
  type BrouillonConseil,
} from "@/lib/conseils-sante-admin";

/*
 * Conseils santé — l'écran qui alimente la page publique /conseils-sante.
 *
 * Réservé à la permission « Paramètres » (comme la charte publique) : habiller
 * et garnir le site public relève des réglages de la plateforme. Les écritures
 * passent par la session de l'administrateur, la RLS (0091) fait le reste.
 *
 * Deux états : la LISTE (ordonnable, publiable, supprimable) et l'ÉDITEUR
 * (création ou modification). L'image part sur Cloudinary via une route
 * serveur ; tout le reste s'écrit en direct.
 */

const BROUILLON_VIDE: BrouillonConseil = {
  emoji: "",
  categorie: "",
  titre: "",
  resume: "",
  contenu: "",
  gestes: [""],
  quand_consulter: "",
  image_url: null,
  image_id: null,
  vedette: false,
  publie: true,
};

const champ =
  "w-full rounded-[11px] border border-line bg-white px-[13px] py-3 text-[13.5px] outline-none focus:border-teal";
const etiquette = "mb-1.5 block text-xs font-bold text-muted";

export default function ConseilsSanteAdmin() {
  const [liste, setListe] = useState<ConseilSante[]>([]);
  const [chargement, setChargement] = useState(true);
  const [edition, setEdition] = useState<null | { id: string | null }>(null);

  // Rechargement (initial et après chaque action). Rend une promesse pour que
  // les actions puissent attendre la fin avant de rendre la main.
  const recharger = () =>
    listerConseils()
      .then(setListe)
      .catch(() => setListe([])); // table absente (migration non passée) ou réseau

  useEffect(() => {
    // setState posé dans le callback de la promesse (jamais dans le corps de
    // l'effet), comme le helper useRequete du projet.
    let actif = true;
    listerConseils()
      .then((l) => actif && setListe(l))
      .catch(() => {})
      .finally(() => actif && setChargement(false));
    return () => {
      actif = false;
    };
  }, []);

  const enCours = liste.find((c) => c.id === edition?.id) ?? null;

  return (
    <AdminShell permission="parametres">
      <div className="md:hidden">
        <EnTeteMobile retour="/espace-admin/plus" titre="Conseils santé" />
      </div>

      <div className="px-4 py-4 md:px-0 md:py-0">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-[21px] font-extrabold tracking-[-0.3px]">Conseils santé</h2>
            <small className="text-[13px] text-muted">
              Rédiger, illustrer et publier les fiches de la page{" "}
              <Link href="/conseils-sante" className="font-bold text-teal hover:underline" target="_blank">
                /conseils-sante ↗
              </Link>
            </small>
          </div>
          {!edition && (
            <button
              type="button"
              onClick={() => setEdition({ id: null })}
              className="rounded-[10px] bg-teal px-[16px] py-2.5 text-[13px] font-bold text-white transition-colors hover:bg-teal-hover"
            >
              ＋ Nouvelle fiche
            </button>
          )}
        </div>

        {edition ? (
          <Editeur
            conseil={enCours}
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
              🌿
            </span>
            <p className="mx-auto mt-2 max-w-[360px] text-[13px] text-muted">
              Aucune fiche pour l’instant. Créez la première — elle apparaîtra aussitôt sur la page
              publique Conseils santé.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {liste.map((c, i) => (
              <LigneConseil
                key={c.id}
                conseil={c}
                premier={i === 0}
                dernier={i === liste.length - 1}
                onModifier={() => setEdition({ id: c.id })}
                onMaj={recharger}
                voisinHaut={liste[i - 1]}
                voisinBas={liste[i + 1]}
              />
            ))}
          </div>
        )}
      </div>
    </AdminShell>
  );
}

/* ----------------------------- Ligne de liste ----------------------------- */

function LigneConseil({
  conseil,
  premier,
  dernier,
  voisinHaut,
  voisinBas,
  onModifier,
  onMaj,
}: {
  conseil: ConseilSante;
  premier: boolean;
  dernier: boolean;
  voisinHaut?: ConseilSante;
  voisinBas?: ConseilSante;
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
      {/* Vignette */}
      {conseil.image_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={conseil.image_url}
          alt=""
          className="h-12 w-12 flex-none rounded-xl object-cover md:h-14 md:w-14"
        />
      ) : (
        <span
          aria-hidden
          className="grid h-12 w-12 flex-none place-items-center rounded-xl bg-teal-soft text-[22px] md:h-14 md:w-14"
        >
          {conseil.emoji || "🌿"}
        </span>
      )}

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <b className="text-[13.5px] font-extrabold md:text-[14.5px]">{conseil.titre}</b>
          {conseil.vedette && (
            <span className="rounded-full bg-teal px-2 py-0.5 text-[10px] font-bold text-white">
              ★ À la une
            </span>
          )}
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
              conseil.publie ? "bg-green-soft text-green" : "bg-amber-soft text-[#8a5a12]"
            }`}
          >
            {conseil.publie ? "Publié" : "Brouillon"}
          </span>
        </div>
        <p className="mt-0.5 line-clamp-1 text-[12px] text-muted">
          {conseil.categorie ? `${conseil.categorie} · ` : ""}
          {conseil.resume}
        </p>
      </div>

      {/* Actions */}
      <div className="flex flex-none items-center gap-1">
        <div className="hidden flex-col sm:flex">
          <button
            type="button"
            disabled={premier || occupe || !voisinHaut}
            onClick={() => voisinHaut && agir(() => echangerPositions(conseil, voisinHaut))}
            className="grid h-5 w-6 place-items-center rounded text-muted hover:bg-bg disabled:opacity-30"
            aria-label="Monter"
            title="Monter"
          >
            ▲
          </button>
          <button
            type="button"
            disabled={dernier || occupe || !voisinBas}
            onClick={() => voisinBas && agir(() => echangerPositions(conseil, voisinBas))}
            className="grid h-5 w-6 place-items-center rounded text-muted hover:bg-bg disabled:opacity-30"
            aria-label="Descendre"
            title="Descendre"
          >
            ▼
          </button>
        </div>

        <button
          type="button"
          disabled={occupe}
          onClick={() => agir(() => basculerDrapeau(conseil.id, "vedette", !conseil.vedette))}
          className={`grid h-9 w-9 place-items-center rounded-lg border text-[15px] transition-colors ${
            conseil.vedette
              ? "border-teal-line bg-teal-soft text-teal"
              : "border-line bg-white text-muted hover:border-teal-line"
          }`}
          aria-label={conseil.vedette ? "Retirer de la une" : "Mettre à la une"}
          title={conseil.vedette ? "Retirer de la une" : "Mettre à la une"}
        >
          ★
        </button>
        <button
          type="button"
          disabled={occupe}
          onClick={() => agir(() => basculerDrapeau(conseil.id, "publie", !conseil.publie))}
          className="hidden rounded-lg border border-line bg-white px-2.5 py-2 text-[11.5px] font-bold text-blue hover:border-teal-line sm:block"
        >
          {conseil.publie ? "Dépublier" : "Publier"}
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
            onClick={() => agir(() => supprimerConseil(conseil))}
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

/* -------------------------------- Éditeur -------------------------------- */

function Editeur({
  conseil,
  onFerme,
  onEnregistre,
}: {
  conseil: ConseilSante | null;
  onFerme: () => void;
  onEnregistre: () => void | Promise<void>;
}) {
  const [b, setB] = useState<BrouillonConseil>(
    conseil
      ? {
          emoji: conseil.emoji ?? "",
          categorie: conseil.categorie ?? "",
          titre: conseil.titre,
          resume: conseil.resume,
          contenu: conseil.contenu,
          gestes: conseil.gestes.length ? conseil.gestes : [""],
          quand_consulter: conseil.quand_consulter ?? "",
          image_url: conseil.image_url,
          image_id: conseil.image_id,
          vedette: conseil.vedette,
          publie: conseil.publie,
        }
      : { ...BROUILLON_VIDE }
  );
  // L'image enregistrée au moment d'ouvrir : elle n'est détruite qu'APRÈS un
  // enregistrement réussi. Toute image envoyée pendant la session qui n'est pas
  // celle-ci est « provisoire » et se détruit si on annule.
  const imageInitiale = useRef<string | null>(conseil?.image_id ?? null);
  const [envoiImage, setEnvoiImage] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enreg, setEnreg] = useState(false);
  const fichierRef = useRef<HTMLInputElement>(null);

  const maj = (p: Partial<BrouillonConseil>) => setB((v) => ({ ...v, ...p }));

  function detruireImage(publicId: string) {
    fetch(`/api/admin/conseils-sante/image?public_id=${encodeURIComponent(publicId)}`, {
      method: "DELETE",
    }).catch(() => {});
  }

  async function choisirImage(fichier: File) {
    setErreur(null);
    setEnvoiImage(true);
    // Une image provisoire déjà posée pendant cette session est retirée avant
    // d'en poser une autre, pour ne pas empiler les orphelins sur Cloudinary.
    if (b.image_id && b.image_id !== imageInitiale.current) detruireImage(b.image_id);
    const res = await televerserImage(fichier);
    setEnvoiImage(false);
    if ("erreur" in res) {
      setErreur(res.erreur);
      return;
    }
    maj({ image_url: res.url, image_id: res.public_id });
  }

  function retirerImage() {
    if (b.image_id && b.image_id !== imageInitiale.current) detruireImage(b.image_id);
    maj({ image_url: null, image_id: null });
  }

  async function enregistrer() {
    setErreur(null);
    setEnreg(true);
    const res = conseil ? await modifierConseil(conseil.id, b) : await creerConseil(b);
    setEnreg(false);
    if (!res.ok) {
      setErreur(res.erreur ?? "Enregistrement refusé.");
      return;
    }
    // Enregistré : l'ancienne image, remplacée, n'a plus de raison d'exister.
    if (imageInitiale.current && imageInitiale.current !== b.image_id) {
      detruireImage(imageInitiale.current);
    }
    await onEnregistre();
  }

  function annuler() {
    if (b.image_id && b.image_id !== imageInitiale.current) detruireImage(b.image_id);
    onFerme();
  }

  return (
    <div className="rounded-2xl border border-line bg-white p-4 md:p-6">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-[16px] font-extrabold">{conseil ? "Modifier la fiche" : "Nouvelle fiche"}</h3>
        <button
          type="button"
          onClick={annuler}
          className="text-[12.5px] font-bold text-muted hover:text-red"
        >
          Annuler
        </button>
      </div>

      <div className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-[1fr_120px]">
          <div>
            <label className={etiquette}>Titre *</label>
            <input
              className={champ}
              value={b.titre}
              onChange={(e) => maj({ titre: e.target.value })}
              placeholder="Se protéger du paludisme"
            />
          </div>
          <div>
            <label className={etiquette}>Emoji</label>
            <input
              className={`${champ} text-center text-[20px]`}
              value={b.emoji}
              onChange={(e) => maj({ emoji: e.target.value })}
              placeholder="🦟"
              maxLength={4}
            />
          </div>
        </div>

        <div>
          <label className={etiquette}>Catégorie</label>
          <input
            className={champ}
            value={b.categorie}
            onChange={(e) => maj({ categorie: e.target.value })}
            placeholder="Prévention"
            list="categories-conseils"
          />
          <datalist id="categories-conseils">
            {CATEGORIES_SUGGEREES.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </div>

        <div>
          <label className={etiquette}>Résumé * — affiché sur la carte et en aperçu de partage</label>
          <textarea
            className={`${champ} min-h-[64px] resize-y`}
            rows={2}
            value={b.resume}
            onChange={(e) => maj({ resume: e.target.value })}
            placeholder="En une ou deux phrases, ce que le lecteur retiendra."
          />
        </div>

        {/* Image */}
        <div>
          <label className={etiquette}>Image</label>
          <div className="flex items-center gap-4">
            {b.image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={b.image_url}
                alt="Aperçu"
                className="h-[72px] w-[108px] flex-none rounded-xl border border-line object-cover"
              />
            ) : (
              <span
                aria-hidden
                className="grid h-[72px] w-[108px] flex-none place-items-center rounded-xl border border-dashed border-line bg-bg text-[26px]"
              >
                {b.emoji || "🖼"}
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
                  {envoiImage ? "Envoi…" : b.image_url ? "Changer l’image" : "Ajouter une image"}
                </button>
                {b.image_url && !envoiImage && (
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
          <label className={etiquette}>Contenu détaillé — séparez les paragraphes par une ligne vide</label>
          <textarea
            className={`${champ} min-h-[180px] resize-y leading-relaxed`}
            rows={8}
            value={b.contenu}
            onChange={(e) => maj({ contenu: e.target.value })}
            placeholder={"Premier paragraphe.\n\nDeuxième paragraphe."}
          />
        </div>

        {/* Gestes clés */}
        <div>
          <label className={etiquette}>Gestes clés — la liste à puces de la fiche</label>
          <div className="flex flex-col gap-2">
            {b.gestes.map((g, i) => (
              <div key={i} className="flex items-center gap-2">
                <span aria-hidden className="text-teal">
                  ✓
                </span>
                <input
                  className={champ}
                  value={g}
                  onChange={(e) => {
                    const gestes = [...b.gestes];
                    gestes[i] = e.target.value;
                    maj({ gestes });
                  }}
                  placeholder="Un geste concret, à l’impératif."
                />
                <button
                  type="button"
                  onClick={() => maj({ gestes: b.gestes.filter((_, j) => j !== i) })}
                  className="grid h-8 w-8 flex-none place-items-center rounded-lg border border-line text-muted hover:text-red"
                  aria-label="Retirer ce geste"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => maj({ gestes: [...b.gestes, ""] })}
            className="mt-2 text-[12px] font-bold text-teal hover:underline"
          >
            ＋ Ajouter un geste
          </button>
        </div>

        <div>
          <label className={etiquette}>Quand consulter — le garde-fou de la fiche</label>
          <textarea
            className={`${champ} min-h-[64px] resize-y`}
            rows={2}
            value={b.quand_consulter}
            onChange={(e) => maj({ quand_consulter: e.target.value })}
            placeholder="Les signes qui doivent amener à consulter sans attendre."
          />
        </div>

        <div className="flex flex-wrap gap-5 border-t border-line pt-4">
          <label className="flex cursor-pointer items-center gap-2 text-[13px] font-bold">
            <input
              type="checkbox"
              checked={b.publie}
              onChange={(e) => maj({ publie: e.target.checked })}
              className="h-4 w-4 accent-teal"
            />
            Publiée (visible du public)
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
            {enreg ? "Enregistrement…" : conseil ? "Enregistrer les modifications" : "Créer la fiche"}
          </button>
          <button
            type="button"
            onClick={annuler}
            className="rounded-[10px] border border-line bg-white px-[18px] py-2.5 text-[13px] font-bold text-muted hover:border-line"
          >
            Annuler
          </button>
        </div>
      </div>
    </div>
  );
}
