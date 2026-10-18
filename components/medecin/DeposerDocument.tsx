"use client";

import { useEffect, useRef, useState } from "react";
import Icone from "@/components/site/Icone";
import {
  corrigerDocument,
  deposerDocument,
  genererPdf,
  libelleType,
  TYPES_DOCUMENT,
  type DocumentPatient,
  type TypeDocument,
} from "@/lib/documents";

/*
 * Remise (ou correction) d'un document, depuis l'espace médecin.
 *
 * Deux façons de produire la pièce jointe :
 *  - « Générer » (défaut) : le serveur compose un PDF à partir du type et du
 *    texte saisis, avec l'en-tête du praticien relu en base. C'est le cas
 *    courant — une ordonnance se tape, elle ne se scanne pas ;
 *  - « Joindre un fichier » : un PDF ou une image déjà produits ailleurs.
 *
 * Un seul rendu pour web et mobile, contrairement au reste de l'application :
 * le formulaire déplié dans la ligne débordait de l'écran sur téléphone. Ici
 * c'est une feuille plein écran en dessous de md, une carte centrée au-dessus.
 *
 * Depuis la migration 0063, CORRIGER ne réécrit plus la ligne : la base crée
 * une version suivante et conserve la précédente. Deux conséquences visibles
 * ici — le type ne se change plus (une ordonnance corrigée reste une
 * ordonnance, sinon la chaîne de versions n'a plus de sens), et le PDF est
 * recomposé à partir du texte corrigé, sans quoi la v2 porterait encore le
 * fichier de la v1.
 */

type Mode = "generer" | "fichier";

const VIDE = { type: "ordonnance" as TypeDocument, titre: "", contenu: "" };

/** Une pièce rédigée en clair se recompose ; un scan se remplace. */
const modeInitial = (doc?: DocumentPatient): Mode =>
  !doc ? "generer" : doc.contenu ? "generer" : "fichier";

export default function DeposerDocument({
  cle,
  nomPatient,
  document: aModifier,
  declencheur,
  classeDeclencheur,
  apres,
}: {
  /** « c-<uuid> » ou « p-<uuid> », tel que fourni par la liste des patients. */
  cle: string;
  nomPatient: string;
  /** Fourni = correction d'un document existant plutôt que nouveau dépôt. */
  document?: DocumentPatient;
  /** Libellé du bouton d'ouverture. */
  declencheur?: string;
  /** Classes du bouton d'ouverture, pour l'aligner sur la rangée d'actions. */
  classeDeclencheur?: string;
  apres?: (message: string) => void;
}) {
  const enCorrection = !!aModifier;
  const [ouvert, setOuvert] = useState(false);
  const [mode, setMode] = useState<Mode>(modeInitial(aModifier));
  const [champs, setChamps] = useState(VIDE);
  const [remplacerFichier, setRemplacerFichier] = useState(false);
  const [enCours, setEnCours] = useState(false);
  const [apercuEnCours, setApercuEnCours] = useState(false);
  const [message, setMessage] = useState<{ texte: string; erreur: boolean } | null>(null);
  const fichierRef = useRef<HTMLInputElement>(null);

  const [prefixe, id] = [cle.slice(0, 1), cle.slice(2)];
  const destinataire = prefixe === "c" ? { patientId: id } : { procheId: id };

  const valide =
    champs.titre.trim() !== "" &&
    (mode === "generer" ? champs.contenu.trim() !== "" : true);

  // Échap referme, comme tout dialogue.
  useEffect(() => {
    if (!ouvert) return;
    const surTouche = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOuvert(false);
    };
    window.addEventListener("keydown", surTouche);
    return () => window.removeEventListener("keydown", surTouche);
  }, [ouvert]);

  function ouvrir() {
    setChamps(
      aModifier
        ? {
            type: aModifier.type as TypeDocument,
            titre: aModifier.titre,
            contenu: aModifier.contenu ?? "",
          }
        : VIDE
    );
    setMode(modeInitial(aModifier));
    setRemplacerFichier(false);
    setMessage(null);
    if (fichierRef.current) fichierRef.current.value = "";
    setOuvert(true);
  }

  function fermer() {
    setOuvert(false);
    setMessage(null);
    if (fichierRef.current) fichierRef.current.value = "";
  }

  function changerMode(nouveau: Mode) {
    setMode(nouveau);
    setMessage(null);
    if (nouveau === "generer" && fichierRef.current) fichierRef.current.value = "";
  }

  /** Ouvre le PDF composé sans rien enregistrer : le médecin se relit. */
  async function apercu() {
    if (!valide || apercuEnCours) return;
    // L'onglet est ouvert AVANT l'attente réseau : ouvert après, le navigateur
    // le prendrait pour une fenêtre surgissante et le bloquerait.
    const onglet = window.open("", "_blank", "noopener");
    setApercuEnCours(true);
    const res = await genererPdf({ ...destinataire, ...champs });
    setApercuEnCours(false);
    if (res.erreur || !res.fichier) {
      onglet?.close();
      setMessage({ texte: res.erreur ?? "Aperçu impossible.", erreur: true });
      return;
    }
    const url = URL.createObjectURL(res.fichier);
    if (onglet) onglet.location.href = url;
    else window.open(url, "_blank", "noopener");
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  async function envoyer() {
    if (!valide || enCours) return;
    setEnCours(true);

    let fichier: File | null = fichierRef.current?.files?.[0] ?? null;
    if (mode === "generer") {
      const res = await genererPdf({ ...destinataire, ...champs });
      if (res.erreur || !res.fichier) {
        setEnCours(false);
          setMessage({ texte: res.erreur ?? "Génération impossible.", erreur: true });
        return;
      }
      fichier = res.fichier;
    }

    const res = aModifier
      ? await corrigerDocument(aModifier.id, {
          titre: champs.titre,
          contenu: champs.contenu,
          fichier,
          // Sans nouveau fichier, la version reprend celui de la précédente :
          // l'ancien n'est PAS retiré du bucket, il appartient maintenant à
          // la v(n-1), qu'on doit pouvoir rouvrir.
          fichierActuel: aModifier.fichierPath,
          fichierNomActuel: aModifier.fichierNom,
        })
      : await deposerDocument({ ...destinataire, ...champs, fichier, origine: "medecin" });

    setEnCours(false);
    if (res.erreur) {
      setMessage({ texte: res.erreur, erreur: true });
      return;
    }
    if (fichierRef.current) fichierRef.current.value = "";
    if (enCorrection) {
      const version = (aModifier?.version ?? 1) + 1;
      const texte = `Version ${version} créée — la précédente reste au dossier`;
      setMessage({ texte, erreur: false });
      apres?.(texte);
      return;
    }
    setChamps(VIDE);
    // Le panneau reste ouvert sur la confirmation : refermer aussitôt
    // laisserait le médecin sans preuve que le document est bien parti.
    const texte = `Document remis à ${nomPatient}`;
    setMessage({ texte, erreur: false });
    apres?.(texte);
  }

  const etiquette = "mb-1.5 text-[12.5px] font-bold";
  const champ =
    "mb-3 w-full rounded-[11px] border border-line bg-white px-[13px] py-2.5 text-[13.5px] outline-none focus:border-teal";

  return (
    <>
      <button
        type="button"
        onClick={ouvrir}
        className={
          classeDeclencheur ??
          (enCorrection
            ? "rounded-[9px] border-[1.5px] border-line bg-white px-3 py-1.5 text-[11.5px] font-bold text-blue transition-colors hover:bg-bg"
            : "rounded-[9px] bg-teal px-3 py-1.5 text-[11.5px] font-bold text-white transition-colors hover:bg-[#2790bc]")
        }
      >
        {declencheur ?? (enCorrection ? "Corriger" : "+ Document")}
      </button>

      {ouvert && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`${enCorrection ? "Corriger" : "Remettre"} un document — ${nomPatient}`}
          className="ui-overlay-in fixed inset-0 z-50 flex items-end justify-center bg-black/40 md:items-start md:overflow-y-auto md:p-6"
          onClick={(e) => {
            if (e.target === e.currentTarget) fermer();
          }}
        >
          {/* Feuille plein écran sur téléphone, carte centrée à partir de md. */}
          <div className="ui-modal-in flex max-h-[92vh] w-full flex-col rounded-t-2xl border border-line bg-white md:max-h-none md:max-w-[560px] md:rounded-2xl md:shadow-xl">
            <div className="flex items-start justify-between gap-3 border-b border-line p-4 md:border-b-0 md:pb-2">
              <h4 className="text-[15px] font-extrabold">
                {enCorrection ? "Corriger le document" : "Remettre un document"}
                <span className="block text-[12px] font-semibold text-muted">{nomPatient}</span>
              </h4>
              <button
                type="button"
                onClick={fermer}
                aria-label="Fermer"
                className="grid h-11 w-11 flex-none place-items-center rounded-lg text-muted hover:bg-bg"
              >
                <Icone nom="croix" taille={18} epaisseur={2.2} />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-4 md:overflow-visible">
              <div role="radiogroup" aria-label="Comment produire le document" className="mb-3 flex gap-2">
                {(
                  [
                    ["generer", "imprimante", "Générer"],
                    ["fichier", "partager", "Joindre un fichier"],
                  ] as [Mode, "imprimante" | "partager", string][]
                ).map(([valeur, icone, libelle]) => (
                  <button
                    key={valeur}
                    type="button"
                    role="radio"
                    aria-checked={mode === valeur}
                    onClick={() => changerMode(valeur)}
                    className={`flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-[11px] border-[1.5px] px-2 text-[12px] font-bold transition-colors ${
                      mode === valeur
                        ? "border-teal bg-teal-soft text-blue"
                        : "border-line bg-white text-muted hover:bg-bg"
                    }`}
                  >
                    <Icone nom={icone} taille={14} />
                    {libelle}
                  </button>
                ))}
              </div>

              {/* Le type ne se change pas en correction : la v2 d'une
                  ordonnance reste une ordonnance, et la base reprend de
                  toute façon celui de la version précédente. */}
              {enCorrection ? (
                <p className="mb-3 rounded-xl bg-bg px-3 py-2 text-[12px] font-semibold">
                  {libelleType(champs.type)} · version {(aModifier?.version ?? 1) + 1} à créer
                </p>
              ) : (
                <>
                  <div className={etiquette}>Type</div>
                  <select
                    className={`${champ} min-h-11`}
                    value={champs.type}
                    onChange={(e) => setChamps({ ...champs, type: e.target.value as TypeDocument })}
                  >
                    {TYPES_DOCUMENT.map((t) => (
                      <option key={t.valeur} value={t.valeur}>
                        {t.libelle}
                      </option>
                    ))}
                  </select>
                </>
              )}

              <div className={etiquette}>Titre *</div>
              <input
                className={champ}
                placeholder="Ordonnance du 31 juillet"
                value={champs.titre}
                onChange={(e) => setChamps({ ...champs, titre: e.target.value })}
              />

              <div className={etiquette}>
                Contenu {mode === "generer" ? "*" : "(visible par le patient)"}
              </div>
              <textarea
                rows={6}
                className={champ}
                placeholder={
                  "LIDOCAINE 2,5 % + PRILOCAINE 2,5 % patch\n2 boîtes — à poser 1 h avant le vaccin\n\nPARACETAMOL 24 mg/ml suspension buvable\n1 dose-poids toutes les 6 h si douleur ou fièvre"
                }
                value={champs.contenu}
                onChange={(e) => setChamps({ ...champs, contenu: e.target.value })}
              />

              {mode === "generer" && (
                <p className="mb-3 text-[11.5px] leading-relaxed text-muted">
                  Un PDF sera composé à votre en-tête (nom, spécialité, établissement) et joint au
                  document. Il porte la mention « généré électroniquement » et n’est pas signé de
                  votre main.
                </p>
              )}

              {mode === "fichier" && (
                <>
                  {enCorrection && aModifier?.fichierNom && !remplacerFichier ? (
                    <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl bg-bg px-3 py-2 text-[12px]">
                      <span className="flex min-w-0 items-center gap-1.5 truncate font-semibold">
                        <Icone nom="document" taille={13} className="flex-none" />
                        {aModifier.fichierNom}
                      </span>
                      <button
                        type="button"
                        onClick={() => setRemplacerFichier(true)}
                        className="ml-auto min-h-11 font-bold text-teal hover:underline"
                      >
                        Remplacer
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className={etiquette}>
                        {enCorrection ? "Nouveau fichier" : "Fichier joint"} (PDF ou image, 8 Mo max)
                      </div>
                      <input
                        ref={fichierRef}
                        type="file"
                        accept=".pdf,.jpg,.jpeg,.png,.webp"
                        className="mb-3 w-full text-[12.5px]"
                      />
                    </>
                  )}
                </>
              )}

              <p className="text-[11.5px] leading-relaxed text-muted">
                Le fichier est déposé dans un espace privé : seuls {nomPatient} et vous pourrez
                l’ouvrir, par un lien temporaire.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 border-t border-line p-4 md:border-t-0 md:pt-0">
              <button
                type="button"
                onClick={envoyer}
                disabled={!valide || enCours}
                className="min-h-11 rounded-[9px] bg-teal px-[14px] text-[12.5px] font-bold text-white transition-colors hover:bg-[#2790bc] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {enCours
                  ? "Envoi…"
                  : enCorrection
                    ? "Enregistrer la correction"
                    : "Remettre le document"}
              </button>
              {mode === "generer" && (
                <button
                  type="button"
                  onClick={apercu}
                  disabled={!valide || apercuEnCours}
                  title={valide ? "Ouvrir le PDF sans l’enregistrer" : "Renseignez un titre et un contenu"}
                  className="min-h-11 rounded-[9px] border-[1.5px] border-line bg-white px-[14px] text-[12.5px] font-bold text-blue transition-colors hover:bg-bg disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {apercuEnCours ? "Composition…" : "Aperçu du PDF"}
                </button>
              )}
              <button
                type="button"
                onClick={fermer}
                className="min-h-11 rounded-[9px] border-[1.5px] border-line bg-white px-[14px] text-[12.5px] font-bold text-blue transition-colors hover:bg-bg"
              >
                Fermer
              </button>
              {message && (
                <span
                  className={`w-full text-[12.5px] font-bold ${
                    message.erreur ? "text-red" : "text-green"
                  }`}
                >
                  {message.texte}
                </span>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
