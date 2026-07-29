"use client";

import { useState } from "react";
import Etoiles from "@/components/site/Etoiles";
import EtoilesSaisie from "@/components/site/EtoilesSaisie";
import { MOIS_LONGS } from "@/lib/dates";
import {
  deposerAvis,
  modifierMonAvis,
  supprimerMonAvis,
  useMonAvis,
} from "@/lib/avis";

/*
 * « Donner mon avis » sur l'écran de détail d'un rendez-vous.
 *
 * Ne s'affiche que sur une consultation honorée : c'est aussi ce que la base
 * impose (policy `ins_avis` → `peut_noter_rdv`), la condition d'affichage
 * n'est qu'un confort. Une fois l'avis déposé il reste modifiable et
 * supprimable par son auteur, avec la réponse du médecin quand elle existe.
 */

function dateLisible(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getDate()} ${MOIS_LONGS[d.getMonth()]} ${d.getFullYear()}`;
}

export default function BlocAvis({
  rendezVousId,
  medecinId,
  medecinNom,
  honore,
}: {
  rendezVousId: string;
  medecinId: string;
  medecinNom: string;
  /** Le rendez-vous a-t-il été marqué « honoré » par le médecin ? */
  honore: boolean;
}) {
  const { avis, chargement, recharger } = useMonAvis(rendezVousId);
  const [edition, setEdition] = useState(false);
  const [note, setNote] = useState(0);
  const [commentaire, setCommentaire] = useState("");
  const [erreur, setErreur] = useState("");
  const [envoi, setEnvoi] = useState(false);

  if (chargement) return null;

  // Rien à proposer tant que la consultation n'a pas eu lieu — sauf si un avis
  // existe déjà (cas d'un statut repassé en arrière côté médecin).
  if (!honore && !avis) return null;

  function ouvrirEdition() {
    setNote(avis?.note ?? 0);
    setCommentaire(avis?.commentaire ?? "");
    setErreur("");
    setEdition(true);
  }

  async function envoyer(e: React.FormEvent) {
    e.preventDefault();
    if (note < 1) {
      setErreur("Choisissez une note entre 1 et 5 étoiles.");
      return;
    }
    setEnvoi(true);
    const resultat = avis
      ? await modifierMonAvis(avis.id, { note, commentaire })
      : await deposerAvis({ rendezVousId, medecinId, note, commentaire });
    setEnvoi(false);
    if (resultat.erreur) {
      setErreur(resultat.erreur);
      return;
    }
    setEdition(false);
    recharger();
  }

  async function retirer() {
    if (!avis) return;
    if (!window.confirm("Voulez-vous vraiment retirer votre avis ?")) return;
    await supprimerMonAvis(avis.id);
    setEdition(false);
    recharger();
  }

  /* ----- Formulaire (dépôt ou correction) ----- */
  if (edition || !avis) {
    return (
      <section className="rounded-2xl border border-line bg-white p-[18px]">
        <b className="mb-1 block text-[14px] font-extrabold">
          {avis ? "Modifier mon avis" : "Donner mon avis"}
        </b>
        <p className="mb-3 text-[12.5px] leading-relaxed text-muted">
          Votre retour aide {medecinNom} à améliorer son service et guide les autres
          patients. Il sera publié avec votre prénom et l’initiale de votre nom.
        </p>

        <form onSubmit={envoyer}>
          <EtoilesSaisie note={note} onChange={setNote} />

          <label
            htmlFor={`commentaire-${rendezVousId}`}
            className="mt-4 block text-[12.5px] font-bold text-muted"
          >
            Votre commentaire (facultatif)
          </label>
          <textarea
            id={`commentaire-${rendezVousId}`}
            value={commentaire}
            onChange={(e) => setCommentaire(e.target.value)}
            rows={4}
            maxLength={1000}
            placeholder="Accueil, ponctualité, écoute, explications…"
            className="mt-1.5 w-full rounded-[11px] border-[1.5px] border-line bg-white px-[13px] py-[10px] text-[13px] outline-none transition-colors focus:border-teal"
          />

          {erreur && (
            <p role="alert" className="mt-2 text-[12.5px] font-bold text-red">
              {erreur}
            </p>
          )}

          <div className="mt-3 flex flex-wrap gap-[9px]">
            <button
              type="submit"
              disabled={envoi}
              className="rounded-[10px] bg-teal px-[18px] py-[10px] text-[12.5px] font-bold text-white transition-colors hover:bg-[#2790bc] disabled:opacity-60"
            >
              {envoi ? "Envoi…" : avis ? "Enregistrer" : "Publier mon avis"}
            </button>
            {avis && (
              <button
                type="button"
                onClick={() => setEdition(false)}
                className="rounded-[10px] border-[1.5px] border-line bg-white px-[15px] py-[10px] text-[12.5px] font-bold text-blue transition-colors hover:bg-bg"
              >
                Annuler
              </button>
            )}
          </div>
        </form>
      </section>
    );
  }

  /* ----- Avis déjà déposé ----- */
  return (
    <section className="rounded-2xl border border-line bg-white p-[18px]">
      <b className="mb-3 block text-[14px] font-extrabold">Mon avis</b>

      <div className="flex items-center gap-2">
        <Etoiles note={avis.note} taille={16} />
        <small className="text-[11.5px] text-muted">Publié le {dateLisible(avis.creeLe)}</small>
      </div>
      {avis.commentaire && (
        <p className="mt-2 text-[13px] leading-[1.6] text-[#3f5360]">{avis.commentaire}</p>
      )}

      {avis.statut !== "publie" && (
        <p className="mt-2 rounded-[10px] bg-amber-soft px-[11px] py-2 text-[12px] font-bold text-amber">
          {avis.statut === "rejete"
            ? "Cet avis a été masqué par la modération."
            : "Cet avis est en cours de vérification."}
        </p>
      )}

      {avis.reponseMedecin && (
        <div className="mt-3 rounded-xl border-l-[3px] border-teal bg-teal-soft/50 px-[14px] py-[11px]">
          <b className="block text-[12px] font-extrabold text-blue">Réponse de {medecinNom}</b>
          <p className="mt-1 text-[12.5px] leading-[1.6] text-[#3f5360]">{avis.reponseMedecin}</p>
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-[9px]">
        <button
          type="button"
          onClick={ouvrirEdition}
          className="rounded-[10px] border-[1.5px] border-line bg-white px-[15px] py-[9px] text-[12.5px] font-bold text-blue transition-colors hover:bg-bg"
        >
          Modifier
        </button>
        <button
          type="button"
          onClick={retirer}
          className="rounded-[10px] border-[1.5px] border-red-soft bg-white px-[15px] py-[9px] text-[12.5px] font-bold text-red transition-colors hover:bg-red-soft"
        >
          Retirer
        </button>
      </div>
    </section>
  );
}
