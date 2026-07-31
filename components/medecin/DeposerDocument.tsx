"use client";

import { useRef, useState } from "react";
import {
  deposerDocument,
  genererPdf,
  TYPES_DOCUMENT,
  type TypeDocument,
} from "@/lib/documents";

/*
 * Remise d'un document à un patient, depuis l'espace médecin.
 *
 * Deux façons de produire la pièce jointe :
 *  - « Générer » (défaut) : le serveur compose un PDF à partir du type et du
 *    texte saisis, avec l'en-tête du praticien relu en base. C'est le cas
 *    courant — une ordonnance se tape, elle ne se scanne pas ;
 *  - « Joindre un fichier » : un PDF ou une image déjà produits ailleurs
 *    (résultat de laboratoire, imagerie, ordonnance manuscrite scannée).
 *
 * Le destinataire est identifié par la clé préfixée de `usePatientsCabinet`
 * (« c-<uuid> » = compte patient, « p-<uuid> » = proche) : un patient créé au
 * cabinet sans compte n'a nulle part où lire, le bouton lui est refusé en
 * amont par la page appelante.
 */

type Mode = "generer" | "fichier";

const VIDE = { type: "ordonnance" as TypeDocument, titre: "", contenu: "" };

export default function DeposerDocument({
  cle,
  nomPatient,
  mobile = false,
  apres,
}: {
  /** « c-<uuid> » ou « p-<uuid> », tel que fourni par usePatientsCabinet. */
  cle: string;
  nomPatient: string;
  mobile?: boolean;
  apres?: () => void;
}) {
  const [ouvert, setOuvert] = useState(false);
  const [mode, setMode] = useState<Mode>("generer");
  const [champs, setChamps] = useState(VIDE);
  const [enCours, setEnCours] = useState(false);
  const [apercuEnCours, setApercuEnCours] = useState(false);
  const [message, setMessage] = useState<{ texte: string; erreur: boolean } | null>(null);
  const fichierRef = useRef<HTMLInputElement>(null);

  const [prefixe, id] = [cle.slice(0, 1), cle.slice(2)];
  const destinataire =
    prefixe === "c" ? { patientId: id } : { procheId: id };

  const valide =
    champs.titre.trim() !== "" &&
    (mode === "generer" ? champs.contenu.trim() !== "" : true);

  function basculer() {
    setOuvert((o) => !o);
    setChamps(VIDE);
    setMode("generer");
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
      setMessage({ texte: `⚠️ ${res.erreur ?? "Aperçu impossible."}`, erreur: true });
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
        setMessage({ texte: `⚠️ ${res.erreur ?? "Génération impossible."}`, erreur: true });
        return;
      }
      fichier = res.fichier;
    }

    const res = await deposerDocument({
      ...destinataire,
      type: champs.type,
      titre: champs.titre,
      contenu: champs.contenu,
      fichier,
    });
    setEnCours(false);
    if (res.erreur) {
      setMessage({ texte: `⚠️ ${res.erreur}`, erreur: true });
      return;
    }
    setChamps(VIDE);
    if (fichierRef.current) fichierRef.current.value = "";
    // Le panneau reste ouvert sur la confirmation : refermer aussitôt laisserait
    // le médecin sans preuve que le document est bien parti.
    setMessage({ texte: `✓ Document remis à ${nomPatient}.`, erreur: false });
    apres?.();
  }

  const etiquette = mobile ? "flabel" : "mb-1.5 text-[12.5px] font-bold";
  const champ = mobile
    ? "inp"
    : "mb-3 w-full rounded-[11px] border border-line bg-white px-[13px] py-2.5 text-[13.5px] outline-none focus:border-teal";

  /* Sélecteur de mode, commun aux deux rendus. */
  const selecteurMode = (
    <div
      role="radiogroup"
      aria-label="Comment produire le document"
      className={mobile ? undefined : "mb-3 flex gap-2"}
      style={mobile ? { display: "flex", gap: 6, marginBottom: 11 } : undefined}
    >
      {(
        [
          ["generer", "🖨️ Générer le document"],
          ["fichier", "📎 Joindre un fichier"],
        ] as [Mode, string][]
      ).map(([valeur, libelle]) => (
        <button
          key={valeur}
          type="button"
          role="radio"
          aria-checked={mode === valeur}
          onClick={() => changerMode(valeur)}
          className={
            mobile
              ? `btnm${mode === valeur ? "" : " gh"}`
              : `flex-1 rounded-[11px] border-[1.5px] px-3 py-2 text-[12px] font-bold transition-colors ${
                  mode === valeur
                    ? "border-teal bg-teal-soft text-blue"
                    : "border-line bg-white text-muted hover:bg-bg"
                }`
          }
        >
          {libelle}
        </button>
      ))}
    </div>
  );

  const formulaire = (
    <>
      {selecteurMode}

      <div className={etiquette}>Type</div>
      <select
        className={mobile ? "selm" : champ}
        value={champs.type}
        onChange={(e) => setChamps({ ...champs, type: e.target.value as TypeDocument })}
      >
        {TYPES_DOCUMENT.map((t) => (
          <option key={t.valeur} value={t.valeur}>
            {t.icone} {t.libelle}
          </option>
        ))}
      </select>

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
        rows={mobile ? 5 : 7}
        className={champ}
        placeholder={
          "LIDOCAINE 2,5 % + PRILOCAINE 2,5 % patch\n2 boîtes — à poser 1 h avant le vaccin\n\nPARACETAMOL 24 mg/ml suspension buvable\n1 dose-poids toutes les 6 h si douleur ou fièvre"
        }
        value={champs.contenu}
        onChange={(e) => setChamps({ ...champs, contenu: e.target.value })}
      />

      {mode === "generer" ? (
        <p
          className={mobile ? undefined : "mb-3 text-[11.5px] leading-relaxed text-muted"}
          style={mobile ? { fontSize: 11.5, color: "var(--muted)", marginBottom: 10 } : undefined}
        >
          🖨️ Un PDF sera composé à votre en-tête (nom, spécialité, établissement) et joint au
          document. Il porte la mention « généré électroniquement » et n’est pas signé de votre
          main.
        </p>
      ) : (
        <>
          <div className={etiquette}>Fichier joint (PDF ou image, 8 Mo max)</div>
          <input
            ref={fichierRef}
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,.webp"
            className={mobile ? "inp" : "mb-3 w-full text-[12.5px]"}
          />
        </>
      )}

      <p
        className={mobile ? undefined : "mb-3 text-[11.5px] text-muted"}
        style={mobile ? { fontSize: 11.5, color: "var(--muted)", marginBottom: 10 } : undefined}
      >
        🔒 Le fichier est déposé dans un espace privé : seuls {nomPatient} et vous pourrez
        l’ouvrir, par un lien temporaire.
      </p>
    </>
  );

  const boutonApercu = mode === "generer" && (
    <button
      type="button"
      onClick={apercu}
      disabled={!valide || apercuEnCours}
      className={
        mobile
          ? "btn ghost block"
          : "rounded-[9px] border-[1.5px] border-line bg-white px-[14px] py-2 text-[12.5px] font-bold text-blue transition-colors hover:bg-bg disabled:cursor-not-allowed disabled:opacity-50"
      }
      style={mobile ? { opacity: valide && !apercuEnCours ? 1 : 0.5 } : undefined}
      title={valide ? "Ouvrir le PDF sans l’enregistrer" : "Renseignez un titre et un contenu"}
    >
      {apercuEnCours ? "Composition…" : "Aperçu du PDF"}
    </button>
  );

  /* ---------- Mobile ---------- */
  if (mobile) {
    return (
      <>
        <button type="button" className="btnm gh" onClick={basculer}>
          {ouvert ? "Annuler" : "Document"}
        </button>
        {ouvert && (
          <div className="card2" style={{ marginTop: 10 }}>
            <h4>Remettre un document à {nomPatient}</h4>
            {formulaire}
            <button
              type="button"
              className="btn block"
              disabled={!valide || enCours}
              style={{ opacity: valide && !enCours ? 1 : 0.5 }}
              onClick={envoyer}
            >
              {enCours ? "Envoi…" : "Remettre le document"}
            </button>
            {boutonApercu}
          </div>
        )}
        {message && (
          <div
            style={{
              color: message.erreur ? "var(--red)" : "var(--green)",
              fontSize: 12,
              fontWeight: 700,
              paddingTop: 8,
            }}
          >
            {message.texte}
          </div>
        )}
      </>
    );
  }

  /* ---------- Web ----------
     En boîte de dialogue et non déplié dans la ligne : la cellule « Documents »
     du tableau fait 130 px, le formulaire y était illisible. */
  return (
    <>
      <button
        type="button"
        onClick={basculer}
        className="rounded-[9px] border-[1.5px] border-line bg-white px-3 py-1.5 text-[11.5px] font-bold text-blue transition-colors hover:bg-bg"
      >
        + Document
      </button>

      {ouvert && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Remettre un document à ${nomPatient}`}
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-6"
          onClick={(e) => {
            if (e.target === e.currentTarget) basculer();
          }}
        >
          <div className="w-full max-w-[560px] rounded-2xl border border-line bg-white p-5 shadow-xl">
            <div className="mb-4 flex items-start justify-between gap-3">
              <h4 className="text-[15px] font-extrabold">
                Remettre un document à {nomPatient}
              </h4>
              <button
                type="button"
                onClick={basculer}
                aria-label="Fermer"
                className="flex-none rounded-lg px-2 py-1 text-lg text-muted hover:bg-bg"
              >
                ✕
              </button>
            </div>
            {formulaire}
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={envoyer}
                disabled={!valide || enCours}
                className="rounded-[9px] bg-teal px-[14px] py-2 text-[12.5px] font-bold text-white transition-colors hover:bg-[#2790bc] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {enCours ? "Envoi…" : "Remettre le document"}
              </button>
              {boutonApercu}
              <button
                type="button"
                onClick={basculer}
                className="rounded-[9px] border-[1.5px] border-line bg-white px-[14px] py-2 text-[12.5px] font-bold text-blue transition-colors hover:bg-bg"
              >
                Fermer
              </button>
              {message && (
                <span
                  className={`text-[12.5px] font-bold ${
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
