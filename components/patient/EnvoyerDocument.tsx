"use client";

import { useEffect, useRef, useState } from "react";
import {
  deposerDocument,
  TYPES_DOCUMENT,
  useMesMedecins,
  type TypeDocument,
} from "@/lib/documents";
import { useProches } from "@/lib/patient";

/*
 * Envoi d'un document par le patient à l'un de ses médecins : résultat
 * d'analyse, ancienne ordonnance, compte rendu d'un confrère.
 *
 * Le choix du destinataire se fait parmi les praticiens déjà consultés (RPC
 * `medecins_du_patient`) et non dans tout l'annuaire : envoyer un dossier
 * médical à un inconnu n'a pas de sens, et la liste tient sur un écran.
 *
 * Un seul rendu pour web et mobile : feuille en bas d'écran sur téléphone,
 * carte centrée à partir de md.
 */

const VIDE = {
  type: "resultat" as TypeDocument,
  titre: "",
  contenu: "",
  medecinId: "",
  pourQui: "",
};

export default function EnvoyerDocument({ apres }: { apres?: () => void }) {
  const { medecins } = useMesMedecins();
  const { proches } = useProches();
  const [ouvert, setOuvert] = useState(false);
  const [champs, setChamps] = useState(VIDE);
  const [enCours, setEnCours] = useState(false);
  const [message, setMessage] = useState<{ texte: string; erreur: boolean } | null>(null);
  const fichierRef = useRef<HTMLInputElement>(null);

  const [aFichier, setAFichier] = useState(false);
  const valide =
    champs.titre.trim() !== "" &&
    champs.medecinId !== "" &&
    (champs.contenu.trim() !== "" || aFichier);

  useEffect(() => {
    if (!ouvert) return;
    const surTouche = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOuvert(false);
    };
    window.addEventListener("keydown", surTouche);
    return () => window.removeEventListener("keydown", surTouche);
  }, [ouvert]);

  function ouvrir() {
    setChamps({ ...VIDE, medecinId: medecins[0]?.id ?? "" });
    setAFichier(false);
    setMessage(null);
    if (fichierRef.current) fichierRef.current.value = "";
    setOuvert(true);
  }

  async function envoyer() {
    if (!valide || enCours) return;
    setEnCours(true);
    const res = await deposerDocument({
      origine: "patient",
      medecinId: champs.medecinId,
      // « Concerne » : sans proche désigné, `deposerDocument` rattache le
      // document au patient connecté lui-même.
      procheId: champs.pourQui || undefined,
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
    const nom = medecins.find((m) => m.id === champs.medecinId)?.nom ?? "votre médecin";
    setChamps({ ...VIDE, medecinId: champs.medecinId });
    setAFichier(false);
    if (fichierRef.current) fichierRef.current.value = "";
    setMessage({ texte: `✓ Document transmis à ${nom}.`, erreur: false });
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
        className="rounded-[9px] bg-teal px-[14px] py-2 text-[12.5px] font-bold text-white transition-colors hover:bg-[#2790bc]"
      >
        ✉️ Envoyer un document
      </button>

      {ouvert && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Envoyer un document à un médecin"
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 md:items-start md:overflow-y-auto md:p-6"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOuvert(false);
          }}
        >
          <div className="flex max-h-[92vh] w-full flex-col rounded-t-2xl border border-line bg-white md:max-h-none md:max-w-[520px] md:rounded-2xl md:shadow-xl">
            <div className="flex items-start justify-between gap-3 border-b border-line p-4 md:border-b-0 md:pb-2">
              <h4 className="text-[15px] font-extrabold">
                Envoyer un document
                <span className="block text-[12px] font-semibold text-muted">
                  À l’un de vos médecins
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
              {medecins.length === 0 ? (
                <p className="text-[12.5px] leading-relaxed text-muted">
                  Vous n’avez encore consulté aucun médecin sur Docteur 224. Vous pourrez leur
                  transmettre un document après votre premier rendez-vous.
                </p>
              ) : (
                <>
                  <div className={etiquette}>Destinataire *</div>
                  <select
                    className={champ}
                    value={champs.medecinId}
                    onChange={(e) => setChamps({ ...champs, medecinId: e.target.value })}
                  >
                    {medecins.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.nom}
                        {m.specialite ? ` — ${m.specialite}` : ""}
                      </option>
                    ))}
                  </select>

                  {proches.length > 0 && (
                    <>
                      <div className={etiquette}>Concerne</div>
                      <select
                        className={champ}
                        value={champs.pourQui}
                        onChange={(e) => setChamps({ ...champs, pourQui: e.target.value })}
                      >
                        <option value="">Moi-même</option>
                        {proches.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.prenom} {p.nom} ({p.lien.toLowerCase()})
                          </option>
                        ))}
                      </select>
                    </>
                  )}

                  <div className={etiquette}>Type</div>
                  <select
                    className={champ}
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
                    placeholder="Analyse de sang du 12 juillet"
                    value={champs.titre}
                    onChange={(e) => setChamps({ ...champs, titre: e.target.value })}
                  />

                  <div className={etiquette}>Message au médecin</div>
                  <textarea
                    rows={4}
                    className={champ}
                    placeholder="Voici les résultats demandés lors de la dernière consultation."
                    value={champs.contenu}
                    onChange={(e) => setChamps({ ...champs, contenu: e.target.value })}
                  />

                  <div className={etiquette}>Fichier (PDF ou image, 8 Mo max)</div>
                  <input
                    ref={fichierRef}
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png,.webp"
                    className="mb-3 w-full text-[12.5px]"
                    onChange={(e) => setAFichier(!!e.target.files?.length)}
                  />

                  <p className="text-[11.5px] leading-relaxed text-muted">
                    🔒 Seul le médecin choisi y aura accès. Vous pourrez retirer ce document à tout
                    moment depuis cette page.
                  </p>
                </>
              )}
            </div>

            {medecins.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 border-t border-line p-4 md:border-t-0 md:pt-0">
                <button
                  type="button"
                  onClick={envoyer}
                  disabled={!valide || enCours}
                  className="rounded-[9px] bg-teal px-[14px] py-2 text-[12.5px] font-bold text-white transition-colors hover:bg-[#2790bc] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {enCours ? "Envoi…" : "Envoyer"}
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
            )}
          </div>
        </div>
      )}
    </>
  );
}
