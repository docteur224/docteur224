"use client";

import { useState } from "react";
import MedecinShell from "@/components/medecin/MedecinShell";
import EnTeteMobile from "@/components/mobile/EnTeteMobile";
import Etoiles from "@/components/site/Etoiles";
import { MOIS_LONGS } from "@/lib/dates";
import { formatNote } from "@/lib/format";
import { repartitionNotes } from "@/lib/donnees";
import { repondreAvis, useAvisRecus, type AvisMedecin } from "@/lib/avis";
import { useContextePro } from "@/lib/pro";

/*
 * Avis et notes — l'écran où le médecin voit ce que ses patients ont retenu
 * de leurs consultations et leur répond publiquement.
 *
 * Réservé au médecin : la RLS ne donne les avis qu'à `medecin_id = auth.uid()`,
 * un assistant connecté ne verra donc rien. On le lui dit plutôt que de lui
 * afficher une liste vide sans explication.
 */

function dateLisible(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getDate()} ${MOIS_LONGS[d.getMonth()]} ${d.getFullYear()}`;
}

const FILTRES = [
  { cle: "tous", label: "Tous" },
  { cle: "sans-reponse", label: "Sans réponse" },
  { cle: "negatifs", label: "3★ et moins" },
] as const;

type CleFiltre = (typeof FILTRES)[number]["cle"];

/** Carte d'un avis reçu, avec le formulaire de réponse replié. */
function CarteAvis({ avis, onRepondu }: { avis: AvisMedecin; onRepondu: () => void }) {
  const [edition, setEdition] = useState(false);
  const [texte, setTexte] = useState(avis.reponseMedecin);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState("");

  async function envoyer(e: React.FormEvent) {
    e.preventDefault();
    setEnvoi(true);
    const { erreur: err } = await repondreAvis(avis.id, texte);
    setEnvoi(false);
    if (err) {
      setErreur(err);
      return;
    }
    setEdition(false);
    onRepondu();
  }

  return (
    <li className="rounded-2xl border border-line bg-white p-[18px]">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <b className="text-[13.5px] font-extrabold">{avis.auteur}</b>
            {avis.statut === "rejete" && (
              <span className="rounded-md bg-red-soft px-[7px] py-[2px] text-[10px] font-bold text-red">
                Masqué par la modération
              </span>
            )}
            {avis.statut === "en_attente" && (
              <span className="rounded-md bg-amber-soft px-[7px] py-[2px] text-[10px] font-bold text-amber">
                En vérification
              </span>
            )}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <Etoiles note={avis.note} />
            <small className="text-[11.5px] text-muted">
              {dateLisible(avis.creeLe)}
              {avis.dateConsultation && ` · consultation du ${dateLisible(avis.dateConsultation)}`}
            </small>
          </div>
        </div>
      </div>

      {avis.commentaire ? (
        <p className="mt-2 text-[13px] leading-[1.6] text-[#3f5360]">{avis.commentaire}</p>
      ) : (
        <p className="mt-2 text-[13px] italic text-muted">Note sans commentaire.</p>
      )}

      {/* ----- Réponse existante ----- */}
      {avis.reponseMedecin && !edition && (
        <div className="mt-3 rounded-xl border-l-[3px] border-teal bg-teal-soft/50 px-[14px] py-[11px]">
          <b className="block text-[12px] font-extrabold text-blue">Votre réponse</b>
          <p className="mt-1 text-[12.5px] leading-[1.6] text-[#3f5360]">{avis.reponseMedecin}</p>
          {avis.reponseLe && (
            <small className="mt-1 block text-[11px] text-muted">{dateLisible(avis.reponseLe)}</small>
          )}
        </div>
      )}

      {/* ----- Formulaire de réponse ----- */}
      {edition ? (
        <form onSubmit={envoyer} className="mt-3">
          <label htmlFor={`reponse-${avis.id}`} className="block text-[12.5px] font-bold text-muted">
            Votre réponse publique
          </label>
          <textarea
            id={`reponse-${avis.id}`}
            value={texte}
            onChange={(e) => setTexte(e.target.value)}
            rows={3}
            maxLength={1000}
            placeholder="Remerciez le patient, apportez une précision — cette réponse sera visible sur votre fiche."
            className="mt-1.5 w-full rounded-[11px] border-[1.5px] border-line bg-white px-[13px] py-[10px] text-[13px] outline-none transition-colors focus:border-teal"
          />
          {erreur && (
            <p role="alert" className="mt-2 text-[12.5px] font-bold text-red">
              {erreur}
            </p>
          )}
          <div className="mt-2 flex flex-wrap gap-[9px]">
            <button
              type="submit"
              disabled={envoi}
              className="rounded-[10px] bg-teal px-[16px] py-[9px] text-[12.5px] font-bold text-white transition-colors hover:bg-[#2790bc] disabled:opacity-60"
            >
              {envoi ? "Envoi…" : "Publier la réponse"}
            </button>
            <button
              type="button"
              onClick={() => {
                setTexte(avis.reponseMedecin);
                setEdition(false);
              }}
              className="rounded-[10px] border-[1.5px] border-line bg-white px-[15px] py-[9px] text-[12.5px] font-bold text-blue transition-colors hover:bg-bg"
            >
              Annuler
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setEdition(true)}
          className="mt-3 rounded-[10px] border-[1.5px] border-line bg-white px-[15px] py-[9px] text-[12.5px] font-bold text-blue transition-colors hover:bg-bg"
        >
          {avis.reponseMedecin ? "Modifier ma réponse" : "Répondre"}
        </button>
      )}
    </li>
  );
}

export default function AvisMedecinPage() {
  const { role, chargement: chargementRole } = useContextePro();
  const { avis, chargement, recharger } = useAvisRecus();
  const [filtre, setFiltre] = useState<CleFiltre>("tous");

  // La moyenne affichée ici est celle qui compte publiquement : seuls les avis
  // publiés entrent dans `medecins.note_moyenne` (trigger `avis_recalcule_note`).
  const publies = avis.filter((a) => a.statut === "publie");
  const { moyenne, total, lignes } = repartitionNotes(publies);
  const sansReponse = avis.filter((a) => !a.reponseMedecin).length;

  const listeFiltree = avis.filter((a) => {
    if (filtre === "sans-reponse") return !a.reponseMedecin;
    if (filtre === "negatifs") return a.note <= 3;
    return true;
  });

  const estAssistant = !chargementRole && role === "assistant";

  const synthese = (
    <div className="grid gap-6 rounded-2xl border border-line bg-white p-5 sm:grid-cols-[170px_1fr]">
      <div className="text-center sm:border-r sm:border-line">
        <b className="block text-[38px] font-extrabold leading-none text-blue">
          {formatNote(moyenne)}
        </b>
        <div className="mt-2">
          <Etoiles note={moyenne} taille={17} />
        </div>
        <small className="mt-1.5 block text-xs text-muted">
          {total} avis publié{total > 1 ? "s" : ""}
        </small>
      </div>
      <div className="flex flex-col justify-center gap-[7px]">
        {lignes.map((l) => (
          <div key={l.etoiles} className="flex items-center gap-[10px] text-[12px]">
            <span className="w-[38px] flex-none font-bold text-muted">{l.etoiles} ★</span>
            <span className="h-[7px] flex-1 overflow-hidden rounded-full bg-[#E3EAEF]">
              <span
                className="block h-full rounded-full bg-[#E8A33D]"
                style={{ width: `${l.pourcentage}%` }}
              />
            </span>
            <span className="w-[26px] flex-none text-right font-bold text-muted">{l.nb}</span>
          </div>
        ))}
      </div>
    </div>
  );

  const barreFiltres = (
    <div className="flex flex-wrap gap-2">
      {FILTRES.map((f) => (
        <button
          key={f.cle}
          type="button"
          onClick={() => setFiltre(f.cle)}
          aria-pressed={filtre === f.cle}
          className={`rounded-full border-[1.5px] px-[14px] py-[7px] text-[12.5px] font-bold transition-colors ${
            filtre === f.cle
              ? "border-teal bg-teal-soft text-blue"
              : "border-line bg-white text-muted hover:bg-bg"
          }`}
        >
          {f.label}
          {f.cle === "sans-reponse" && sansReponse > 0 && ` (${sansReponse})`}
        </button>
      ))}
    </div>
  );

  const liste = chargement ? (
    <div className="rounded-2xl border border-line bg-white p-8 text-center text-[13px] text-muted">
      Chargement des avis…
    </div>
  ) : listeFiltree.length === 0 ? (
    <div className="rounded-2xl border border-line bg-white p-8 text-center">
      <div className="text-3xl" aria-hidden>
        ⭐
      </div>
      <b className="mt-3 block text-[15px] font-extrabold">
        {avis.length === 0 ? "Aucun avis pour le moment" : "Aucun avis dans ce filtre"}
      </b>
      <p className="mx-auto mt-2 max-w-[420px] text-[13px] leading-relaxed text-muted">
        {avis.length === 0
          ? "Vos patients pourront vous noter dès qu’une consultation sera marquée « honorée » dans votre agenda."
          : "Changez de filtre pour voir les autres avis."}
      </p>
    </div>
  ) : (
    <ul className="flex flex-col gap-[14px]">
      {listeFiltree.map((a) => (
        <CarteAvis key={a.id} avis={a} onRepondu={recharger} />
      ))}
    </ul>
  );

  if (estAssistant) {
    return (
      <MedecinShell>
        <div className="md:hidden">
          <EnTeteMobile retour="/espace-medecin/compte" titre="Avis et notes" />
        </div>
        <div className="pad md:p-0">
          <div className="rounded-2xl border border-line bg-white p-8 text-center">
            <div className="text-3xl" aria-hidden>
              🔒
            </div>
            <b className="mt-3 block text-[15px] font-extrabold">Réservé au médecin</b>
            <p className="mx-auto mt-2 max-w-[420px] text-[13px] leading-relaxed text-muted">
              Les avis des patients et les réponses publiques ne sont accessibles
              qu’au médecin titulaire du compte.
            </p>
          </div>
        </div>
      </MedecinShell>
    );
  }

  return (
    <MedecinShell>
      {/* ===== Version mobile ===== */}
      <div className="md:hidden">
        <EnTeteMobile retour="/espace-medecin/compte" titre="Avis et notes" />
        <div className="pad">
          <p className="muted" style={{ fontSize: 11.5, margin: "-2px 0 12px", lineHeight: 1.5 }}>
            Ce que vos patients retiennent de leurs consultations. Répondre montre
            votre écoute — la réponse s’affiche sur votre fiche publique.
          </p>
          <div style={{ marginBottom: 14 }}>{synthese}</div>
          <div style={{ marginBottom: 14 }}>{barreFiltres}</div>
          {liste}
        </div>
      </div>

      {/* ===== Version web ===== */}
      <div className="hidden md:block">
        <div className="mb-5">
          <h2 className="text-[21px] font-extrabold tracking-[-0.3px]">Avis et notes</h2>
          <small className="text-[13px] text-muted">
            Ce que vos patients retiennent de leurs consultations. Vos réponses
            s’affichent publiquement sur votre fiche.
          </small>
        </div>

        <div className="mb-[18px]">{synthese}</div>
        <div className="mb-[14px]">{barreFiltres}</div>
        {liste}
      </div>
    </MedecinShell>
  );
}
