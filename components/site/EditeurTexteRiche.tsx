"use client";

import { useEffect, useRef, type ClipboardEvent } from "react";
import { estHtml, texteVersHtml } from "@/lib/conseils-sante";

/*
 * Éditeur de texte riche, sans dépendance — pour le corps d'un conseil santé.
 *
 * Il écrit directement dans un bloc `contentEditable` et rend le HTML au parent
 * à chaque frappe. La mise en forme possible est volontairement courte (gras,
 * italique, souligné, barré, deux niveaux de titre, listes, taille) : c'est
 * tout ce dont une fiche de prévention a besoin, et c'est exactement ce que
 * l'assainisseur (`nettoyerHtmlConseil`) laisse passer au rendu public.
 *
 * Le collage est ramené en TEXTE BRUT : on ne veut ni la feuille de style d'un
 * traitement de texte, ni une image collée en base64. L'assainisseur reprend
 * de toute façon la main au rendu — mais autant garder le stockage propre.
 */

const TAILLES = [
  { libelle: "Taille…", valeur: "" },
  { libelle: "Petit", valeur: "0.88em" },
  { libelle: "Normal", valeur: "1em" },
  { libelle: "Grand", valeur: "1.3em" },
];

export default function EditeurTexteRiche({
  valeur,
  onChange,
}: {
  valeur: string;
  onChange: (html: string) => void;
}) {
  const zone = useRef<HTMLDivElement>(null);

  // Montage : on pose le contenu de départ (converti si c'est une ancienne
  // fiche en texte brut) et on règle les séparateurs produits par l'éditeur.
  useEffect(() => {
    const el = zone.current;
    if (!el) return;
    el.innerHTML = estHtml(valeur) ? valeur : texteVersHtml(valeur);
    try {
      document.execCommand("defaultParagraphSeparator", false, "p");
      document.execCommand("styleWithCSS", false, "true");
    } catch {
      /* exécution non supportée : l'éditeur fonctionne sans ce réglage */
    }
    // Contenu de départ posé une seule fois : ensuite, c'est l'utilisateur qui
    // écrit, on ne réinjecte pas (cela remettrait le curseur au début).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function emettre() {
    onChange(zone.current?.innerHTML ?? "");
  }

  function commande(cmd: string, argument?: string) {
    zone.current?.focus();
    document.execCommand(cmd, false, argument);
    emettre();
  }

  function titre(balise: "h2" | "h3") {
    zone.current?.focus();
    const actuel = document.queryCommandValue("formatBlock")?.toLowerCase();
    // Reclic sur le même niveau = retour au paragraphe.
    document.execCommand("formatBlock", false, actuel === balise ? "p" : balise);
    emettre();
  }

  function appliquerTaille(em: string) {
    const el = zone.current;
    if (!el || !em) return;
    el.focus();
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    const plage = selection.getRangeAt(0);
    if (plage.collapsed) return; // rien de sélectionné : on ne fait rien
    const span = document.createElement("span");
    span.style.fontSize = em;
    try {
      plage.surroundContents(span);
    } catch {
      // La sélection traverse plusieurs éléments : on extrait puis on enveloppe.
      span.appendChild(plage.extractContents());
      plage.insertNode(span);
    }
    selection.removeAllRanges();
    emettre();
  }

  function collerEnTexte(e: ClipboardEvent) {
    e.preventDefault();
    const texte = e.clipboardData.getData("text/plain");
    document.execCommand("insertText", false, texte);
    emettre();
  }

  const btn =
    "grid h-8 min-w-8 place-items-center rounded-md px-2 text-[13px] font-bold text-ink transition-colors hover:bg-white";

  return (
    <div className="rounded-[11px] border border-line bg-white focus-within:border-teal">
      {/* Barre d'outils */}
      <div className="flex flex-wrap items-center gap-0.5 border-b border-line bg-bg px-2 py-1.5">
        <button type="button" className={`${btn} font-black`} title="Gras" onMouseDown={(e) => e.preventDefault()} onClick={() => commande("bold")}>
          B
        </button>
        <button type="button" className={`${btn} italic`} title="Italique" onMouseDown={(e) => e.preventDefault()} onClick={() => commande("italic")}>
          I
        </button>
        <button type="button" className={`${btn} underline`} title="Souligné" onMouseDown={(e) => e.preventDefault()} onClick={() => commande("underline")}>
          U
        </button>
        <button type="button" className={`${btn} line-through`} title="Barré" onMouseDown={(e) => e.preventDefault()} onClick={() => commande("strikeThrough")}>
          S
        </button>

        <span className="mx-1 h-5 w-px bg-line" aria-hidden />

        <button type="button" className={btn} title="Titre" onMouseDown={(e) => e.preventDefault()} onClick={() => titre("h2")}>
          H₂
        </button>
        <button type="button" className={btn} title="Sous-titre" onMouseDown={(e) => e.preventDefault()} onClick={() => titre("h3")}>
          H₃
        </button>

        <span className="mx-1 h-5 w-px bg-line" aria-hidden />

        <button type="button" className={btn} title="Liste à puces" onMouseDown={(e) => e.preventDefault()} onClick={() => commande("insertUnorderedList")}>
          ☰
        </button>
        <button type="button" className={btn} title="Liste numérotée" onMouseDown={(e) => e.preventDefault()} onClick={() => commande("insertOrderedList")}>
          ①
        </button>

        <span className="mx-1 h-5 w-px bg-line" aria-hidden />

        <select
          className="h-8 rounded-md border border-line bg-white px-1.5 text-[12px] font-bold text-ink outline-none"
          title="Taille du texte"
          value=""
          onMouseDown={(e) => e.stopPropagation()}
          onChange={(e) => {
            appliquerTaille(e.target.value);
            e.target.selectedIndex = 0;
          }}
        >
          {TAILLES.map((t) => (
            <option key={t.libelle} value={t.valeur}>
              {t.libelle}
            </option>
          ))}
        </select>
      </div>

      {/* Zone d'édition */}
      <div
        ref={zone}
        className="prose-sante editeur-riche-zone min-h-[200px] px-[13px] py-3 text-[13.5px] leading-relaxed outline-none"
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        data-vide="Rédigez le contenu détaillé de la fiche…"
        onInput={emettre}
        onBlur={emettre}
        onPaste={collerEnTexte}
      />
    </div>
  );
}
