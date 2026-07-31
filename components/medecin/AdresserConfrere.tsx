"use client";

import { useEffect, useState } from "react";
import { formatDateCourte } from "@/lib/dates";
import { iconeType, libelleType, type DocumentPatient } from "@/lib/documents";
import {
  envoyerTransmission,
  useConfreres,
  type NiveauUrgence,
} from "@/lib/transmissions";

/*
 * Adressage d'un dossier à un confrère, depuis la fiche du patient.
 *
 * Le formulaire est en trois temps volontairement courts — destinataire,
 * motif, pièces — pour qu'une orientation vers un spécialiste reste l'affaire
 * d'une minute. Le seul point bloquant est l'attestation de consentement :
 * la base refuse l'insertion sans elle (colonne `consentement_atteste`), ce
 * n'est donc pas une case décorative que le front pourrait contourner.
 *
 * Un seul rendu pour web et mobile : feuille plein écran sous md, carte
 * centrée au-dessus.
 */

const URGENCES: { valeur: NiveauUrgence; libelle: string; aide: string }[] = [
  { valeur: "normale", libelle: "Normale", aide: "Orientation habituelle" },
  { valeur: "prioritaire", libelle: "Prioritaire", aide: "Le confrère est alerté comme tel" },
];

export default function AdresserConfrere({
  cle,
  nomPatient,
  documents,
  apres,
}: {
  /** « c-<uuid> » ou « p-<uuid> », tel que fourni par la liste des patients. */
  cle: string;
  nomPatient: string;
  /** Documents du dossier, proposés en pièces jointes. */
  documents: DocumentPatient[];
  apres?: () => void;
}) {
  const [ouvert, setOuvert] = useState(false);
  const [saisieConfrere, setSaisieConfrere] = useState("");
  const [rechercheConfrere, setRechercheConfrere] = useState("");
  const [destinataire, setDestinataire] = useState<{ id: string; nom: string } | null>(null);
  const [motif, setMotif] = useState("");
  const [note, setNote] = useState("");
  const [urgence, setUrgence] = useState<NiveauUrgence>("normale");
  const [jointes, setJointes] = useState<string[]>([]);
  const [consentement, setConsentement] = useState(false);
  const [enCours, setEnCours] = useState(false);
  const [message, setMessage] = useState<{ texte: string; erreur: boolean } | null>(null);

  const { confreres, chargement: chargementConfreres } = useConfreres(rechercheConfrere);

  const [prefixe, id] = [cle.slice(0, 1), cle.slice(2)];
  const beneficiaire = prefixe === "c" ? { patientId: id } : { procheId: id };
  const valide = !!destinataire && motif.trim() !== "" && consentement;

  // Frappe temporisée : une requête par lettre saturerait la base.
  useEffect(() => {
    const minuteur = setTimeout(() => setRechercheConfrere(saisieConfrere.trim()), 300);
    return () => clearTimeout(minuteur);
  }, [saisieConfrere]);

  useEffect(() => {
    if (!ouvert) return;
    const surTouche = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOuvert(false);
    };
    window.addEventListener("keydown", surTouche);
    return () => window.removeEventListener("keydown", surTouche);
  }, [ouvert]);

  function ouvrir() {
    setSaisieConfrere("");
    setRechercheConfrere("");
    setDestinataire(null);
    setMotif("");
    setNote("");
    setUrgence("normale");
    setJointes([]);
    setConsentement(false);
    setMessage(null);
    setOuvert(true);
  }

  function basculerPiece(idDoc: string) {
    setJointes((j) => (j.includes(idDoc) ? j.filter((x) => x !== idDoc) : [...j, idDoc]));
  }

  async function envoyer() {
    if (!valide || enCours) return;
    setEnCours(true);
    const res = await envoyerTransmission({
      destinataireId: destinataire!.id,
      ...beneficiaire,
      motif,
      note,
      urgence,
      documents: jointes,
    });
    setEnCours(false);
    if (res.erreur) {
      setMessage({ texte: `⚠️ ${res.erreur}`, erreur: true });
      return;
    }
    setMessage({
      texte: `✓ Dossier de ${nomPatient} transmis à ${destinataire!.nom}. Le patient en est informé.`,
      erreur: false,
    });
    apres?.();
  }

  const etiquette = "mb-1.5 text-[12.5px] font-bold";
  const champ =
    "mb-3 w-full rounded-[11px] border border-line bg-white px-[13px] py-2.5 text-[13.5px] outline-none focus:border-teal";

  return (
    <>
      <button
        type="button"
        onClick={ouvrir}
        className="rounded-[9px] border-[1.5px] border-teal bg-white px-3 py-1.5 text-[11.5px] font-bold text-blue transition-colors hover:bg-teal-soft"
      >
        📨 Adresser à un confrère
      </button>

      {ouvert && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Adresser le dossier de ${nomPatient} à un confrère`}
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 md:items-start md:overflow-y-auto md:p-6"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOuvert(false);
          }}
        >
          <div className="flex max-h-[92vh] w-full flex-col rounded-t-2xl border border-line bg-white md:max-h-none md:max-w-[600px] md:rounded-2xl md:shadow-xl">
            <div className="flex items-start justify-between gap-3 border-b border-line p-4 md:border-b-0 md:pb-2">
              <h4 className="text-[15px] font-extrabold">
                Adresser à un confrère
                <span className="block text-[12px] font-semibold text-muted">
                  Dossier de {nomPatient}
                </span>
              </h4>
              <button
                type="button"
                onClick={() => setOuvert(false)}
                aria-label="Fermer"
                className="flex-none rounded-lg px-2 py-1 text-lg text-muted hover:bg-bg"
              >
                ✕
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-4 md:overflow-visible">
              {/* ---- 1. Destinataire ---- */}
              <div className={etiquette}>Confrère destinataire *</div>
              {destinataire ? (
                <div className="mb-3 flex items-center gap-2 rounded-[11px] border-[1.5px] border-teal bg-teal-soft px-3 py-2.5">
                  <b className="min-w-0 flex-1 truncate text-[13px] font-extrabold text-blue">
                    {destinataire.nom}
                  </b>
                  <button
                    type="button"
                    onClick={() => setDestinataire(null)}
                    className="flex-none text-[11.5px] font-bold text-teal hover:underline"
                  >
                    Changer
                  </button>
                </div>
              ) : (
                <>
                  <input
                    className={champ}
                    placeholder="Nom, spécialité ou établissement…"
                    value={saisieConfrere}
                    onChange={(e) => setSaisieConfrere(e.target.value)}
                    aria-label="Rechercher un confrère"
                  />
                  <div className="mb-3 max-h-[190px] overflow-y-auto rounded-[11px] border border-line">
                    {chargementConfreres && (
                      <p className="px-3 py-2.5 text-[12px] text-muted">Recherche…</p>
                    )}
                    {!chargementConfreres && confreres.length === 0 && (
                      <p className="px-3 py-2.5 text-[12px] text-muted">
                        Aucun confrère ne correspond.
                      </p>
                    )}
                    {confreres.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setDestinataire({ id: c.id, nom: c.nom })}
                        className="flex w-full items-center gap-2 border-b border-line px-3 py-2.5 text-left last:border-b-0 hover:bg-bg"
                      >
                        <span className="min-w-0 flex-1">
                          <b className="block truncate text-[13px] font-bold">{c.nom}</b>
                          <small className="block truncate text-[11px] text-muted">
                            {[c.specialite, c.etablissement, c.ville].filter(Boolean).join(" · ")}
                          </small>
                        </span>
                        <span className="flex-none text-[11.5px] font-bold text-teal">Choisir</span>
                      </button>
                    ))}
                  </div>
                </>
              )}

              {/* ---- 2. Motif et courrier ---- */}
              <div className={etiquette}>Motif de l’adressage *</div>
              <input
                className={champ}
                placeholder="Avis ophtalmologique — suspicion de rétinopathie"
                value={motif}
                onChange={(e) => setMotif(e.target.value)}
              />

              <div className={etiquette}>Courrier confraternel</div>
              <textarea
                rows={5}
                className={champ}
                placeholder={
                  "Chère consœur, cher confrère,\n\nJe vous adresse ce patient pour…\n\nAntécédents notables :\nTraitement en cours :"
                }
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />

              <div className={etiquette}>Urgence</div>
              <div className="mb-3 flex gap-2">
                {URGENCES.map((u) => (
                  <button
                    key={u.valeur}
                    type="button"
                    role="radio"
                    aria-checked={urgence === u.valeur}
                    onClick={() => setUrgence(u.valeur)}
                    className={`flex-1 rounded-[11px] border-[1.5px] px-3 py-2 text-left transition-colors ${
                      urgence === u.valeur
                        ? "border-teal bg-teal-soft"
                        : "border-line bg-white hover:bg-bg"
                    }`}
                  >
                    <b
                      className={`block text-[12.5px] font-bold ${
                        urgence === u.valeur ? "text-blue" : "text-muted"
                      }`}
                    >
                      {u.libelle}
                    </b>
                    <small className="text-[10.5px] text-muted">{u.aide}</small>
                  </button>
                ))}
              </div>

              {/* ---- 3. Pièces jointes ---- */}
              <div className={etiquette}>
                Pièces du dossier à joindre{" "}
                <span className="font-semibold text-muted">
                  ({jointes.length} sur {documents.length})
                </span>
              </div>
              {documents.length === 0 ? (
                <p className="mb-3 text-[11.5px] text-muted">
                  Aucun document dans ce dossier. Le confrère recevra le motif et votre courrier.
                </p>
              ) : (
                <div className="mb-3 max-h-[190px] overflow-y-auto rounded-[11px] border border-line">
                  {documents.map((d) => (
                    <label
                      key={d.id}
                      className="flex cursor-pointer items-center gap-2.5 border-b border-line px-3 py-2.5 last:border-b-0 hover:bg-bg"
                    >
                      <input
                        type="checkbox"
                        checked={jointes.includes(d.id)}
                        onChange={() => basculerPiece(d.id)}
                        className="h-4 w-4 flex-none accent-[#2E9CCA]"
                      />
                      <span aria-hidden className="flex-none text-base">
                        {iconeType(d.type)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <b className="block truncate text-[12.5px] font-bold">{d.titre}</b>
                        <small className="block text-[10.5px] text-muted">
                          {libelleType(d.type)} · {formatDateCourte(d.creeLe.slice(0, 10))}
                          {d.origine === "patient" ? " · envoyé par le patient" : ""}
                        </small>
                      </span>
                    </label>
                  ))}
                </div>
              )}

              {/* ---- 4. Consentement ---- */}
              <label className="mb-3 flex cursor-pointer items-start gap-2.5 rounded-xl border border-[#F2D9B6] bg-[#FFF5E9] px-3 py-2.5">
                <input
                  type="checkbox"
                  checked={consentement}
                  onChange={(e) => setConsentement(e.target.checked)}
                  className="mt-0.5 h-4 w-4 flex-none accent-[#8A5A1B]"
                />
                <span className="text-[11.5px] font-semibold leading-relaxed text-[#8A5A1B]">
                  J’atteste avoir informé {nomPatient} de cette transmission et recueilli son
                  accord. Cette attestation est enregistrée avec la transmission.
                </span>
              </label>

              <p className="text-[11.5px] leading-relaxed text-muted">
                🔒 Le patient est prévenu immédiatement et peut retirer cet accès à tout moment.
                Vous le pouvez également. Le contenu de la transmission n’est plus modifiable une
                fois envoyée.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 border-t border-line p-4 md:border-t-0 md:pt-0">
              <button
                type="button"
                onClick={envoyer}
                disabled={!valide || enCours}
                className="rounded-[9px] bg-teal px-[14px] py-2 text-[12.5px] font-bold text-white transition-colors hover:bg-[#2790bc] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {enCours ? "Transmission…" : "Transmettre le dossier"}
              </button>
              <button
                type="button"
                onClick={() => setOuvert(false)}
                className="rounded-[9px] border-[1.5px] border-line bg-white px-[14px] py-2 text-[12.5px] font-bold text-blue transition-colors hover:bg-bg"
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
