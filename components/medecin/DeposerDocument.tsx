"use client";

import { useRef, useState } from "react";
import {
  deposerDocument,
  TYPES_DOCUMENT,
  type TypeDocument,
} from "@/lib/documents";

/*
 * Remise d'un document à un patient, depuis l'espace médecin.
 *
 * Le destinataire est identifié par la clé préfixée de `usePatientsCabinet`
 * (« c-<uuid> » = compte patient, « p-<uuid> » = proche) : un patient créé au
 * cabinet sans compte n'a nulle part où lire, le bouton lui est refusé en
 * amont par la page appelante.
 */

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
  const [champs, setChamps] = useState(VIDE);
  const [enCours, setEnCours] = useState(false);
  const [message, setMessage] = useState<{ texte: string; erreur: boolean } | null>(null);
  const fichierRef = useRef<HTMLInputElement>(null);

  const [prefixe, id] = [cle.slice(0, 1), cle.slice(2)];
  const valide = champs.titre.trim() !== "";

  function basculer() {
    setOuvert((o) => !o);
    setChamps(VIDE);
    setMessage(null);
    if (fichierRef.current) fichierRef.current.value = "";
  }

  async function envoyer() {
    if (!valide || enCours) return;
    setEnCours(true);
    const res = await deposerDocument({
      patientId: prefixe === "c" ? id : undefined,
      procheId: prefixe === "p" ? id : undefined,
      type: champs.type,
      titre: champs.titre,
      contenu: champs.contenu,
      fichier: fichierRef.current?.files?.[0] ?? null,
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

  const formulaire = (
    <>
      <div className={mobile ? "flabel" : "mb-1.5 text-[12.5px] font-bold"}>Type</div>
      <select
        className={
          mobile
            ? "selm"
            : "mb-3 w-full rounded-[11px] border border-line bg-white px-[13px] py-2.5 text-[13.5px] outline-none focus:border-teal"
        }
        value={champs.type}
        onChange={(e) => setChamps({ ...champs, type: e.target.value as TypeDocument })}
      >
        {TYPES_DOCUMENT.map((t) => (
          <option key={t.valeur} value={t.valeur}>
            {t.icone} {t.libelle}
          </option>
        ))}
      </select>

      <div className={mobile ? "flabel" : "mb-1.5 text-[12.5px] font-bold"}>Titre *</div>
      <input
        className={
          mobile
            ? "inp"
            : "mb-3 w-full rounded-[11px] border border-line bg-white px-[13px] py-2.5 text-[13.5px] outline-none focus:border-teal"
        }
        placeholder="Ordonnance du 31 juillet"
        value={champs.titre}
        onChange={(e) => setChamps({ ...champs, titre: e.target.value })}
      />

      <div className={mobile ? "flabel" : "mb-1.5 text-[12.5px] font-bold"}>
        Contenu (visible par le patient)
      </div>
      <textarea
        rows={mobile ? 5 : 6}
        className={
          mobile
            ? "inp"
            : "mb-3 w-full rounded-[11px] border border-line bg-white px-[13px] py-2.5 text-[13.5px] leading-relaxed outline-none focus:border-teal"
        }
        placeholder={"Paracétamol 500 mg — 1 comprimé matin, midi et soir pendant 5 jours\n…"}
        value={champs.contenu}
        onChange={(e) => setChamps({ ...champs, contenu: e.target.value })}
      />

      <div className={mobile ? "flabel" : "mb-1.5 text-[12.5px] font-bold"}>
        Fichier joint (PDF ou image, 8 Mo max)
      </div>
      <input
        ref={fichierRef}
        type="file"
        accept=".pdf,.jpg,.jpeg,.png,.webp"
        className={mobile ? "inp" : "mb-3 w-full text-[12.5px]"}
      />

      <p className={mobile ? "muted" : "mb-3 text-[11.5px] text-muted"} style={mobile ? { fontSize: 11.5, marginBottom: 10 } : undefined}>
        🔒 Le fichier est déposé dans un espace privé : seuls {nomPatient} et vous pourrez
        l’ouvrir, par un lien temporaire.
      </p>
    </>
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
