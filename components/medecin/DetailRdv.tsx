"use client";

import Link from "next/link";
import { useState } from "react";
import Dialogue from "@/components/site/Dialogue";
import { calculerAge, capitaliser, formatDateCourte, formatDateLongue, versISO } from "@/lib/dates";
import {
  DUREE_CONSULTATION_MINUTES,
  construireICS,
  formatTelephone,
  lienCarte,
  numeroComposable,
  telechargerICS,
} from "@/lib/rdv-utils";
import { annulerRdvMedecin, majStatutRdv, useContextePro, type RdvAgenda } from "@/lib/pro";

/*
 * Détail d'un rendez-vous de l'agenda.
 *
 * Ce que le praticien vient y chercher, dans cet ordre :
 *   1. QUI vient, et comment le joindre — un patient qui ne s'est pas présenté
 *      s'appelle, et le numéro doit être à un clic, pas à trois écrans ;
 *   2. son DOSSIER — le bouton « Ouvrir la fiche » est la raison d'être de cet
 *      écran : depuis l'agenda, l'historique et les documents sont à un clic ;
 *   3. AGIR sur l'état du rendez-vous : confirmer, marquer honoré, annuler.
 *
 * L'annulation demande un motif, comme au centre d'appel : sans lui, personne
 * ne sait plus, une semaine après, si le patient s'était décommandé ou si
 * c'était une erreur de saisie. Rien n'est effacé — la ligne reste au dossier,
 * marquée annulée, et le trigger de la base prévient le patient.
 */

const TEINTE_STATUT: Record<string, string> = {
  confirme: "bg-green-soft text-green",
  en_attente: "bg-amber-soft text-amber",
  honore: "bg-teal-soft text-blue",
  annule: "bg-red-soft text-red",
};

const LIBELLE_STATUT: Record<string, string> = {
  confirme: "Confirmé",
  en_attente: "En attente de confirmation",
  honore: "Honoré",
  annule: "Annulé",
};

const LIBELLE_SOURCE: Record<string, string> = {
  en_ligne: "Pris en ligne par le patient",
  cabinet: "Saisi au cabinet",
  telephone: "Pris par téléphone",
};

const MOTIFS_ANNULATION = [
  "Le patient s’est décommandé",
  "Le patient ne s’est pas présenté",
  "Le patient ne peut plus se déplacer",
  "Je suis indisponible ce jour-là",
  "Rendez-vous en double",
  "Erreur de saisie",
];

const BTN_LEGER =
  "rounded-[10px] border-[1.5px] border-line bg-white px-3 py-2 text-[12.5px] font-bold text-blue transition-colors hover:bg-bg disabled:cursor-not-allowed disabled:opacity-40";
const BTN_ROUGE =
  "rounded-[10px] border-[1.5px] border-[#F3C9C2] bg-white px-3 py-2 text-[12.5px] font-bold text-red transition-colors hover:bg-red-soft disabled:cursor-not-allowed disabled:opacity-40";
const BTN_PLEIN =
  "rounded-[10px] bg-teal px-4 py-2 text-[12.5px] font-bold text-white transition-colors hover:bg-[#2790bc] disabled:cursor-not-allowed disabled:opacity-50";

const initiales = (nom: string) =>
  nom
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((mot) => mot.charAt(0))
    .join("")
    .toUpperCase() || "?";

/** « 14:00 » + 30 min → « 14:30 ». */
function heureDeFin(heure: string): string {
  const [h, min] = heure.split(":").map(Number);
  const total = h * 60 + min + DUREE_CONSULTATION_MINUTES;
  return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

export default function DetailRdv({
  rdv,
  onFermer,
  apres,
}: {
  rdv: RdvAgenda;
  onFermer: () => void;
  /** Rechargement de l'agenda après un changement d'état. */
  apres: () => void;
}) {
  const { medecin, permissions, role } = useContextePro();
  const [vue, setVue] = useState<"detail" | "annuler">("detail");
  const [motif, setMotif] = useState("");
  const [autre, setAutre] = useState("");
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState("");

  const peutAgir = role !== "assistant" || permissions.confirmerAnnuler;
  const aujourdhui = versISO(new Date());
  const passe = rdv.date < aujourdhui || (rdv.date === aujourdhui && heureDeFin(rdv.heure) <= new Date().toTimeString().slice(0, 5));

  const carte =
    rdv.lieu === "domicile"
      ? lienCarte({ adresse: rdv.adresseDomicile, ville: medecin?.ville })
      : lienCarte({
          localisation: medecin?.localisation,
          quartier: medecin?.quartier,
          ville: medecin?.ville,
        });

  async function changerStatut(statut: "confirme" | "honore") {
    if (enCours) return;
    setEnCours(true);
    setErreur("");
    const res = await majStatutRdv(rdv.id, statut);
    setEnCours(false);
    if (res.erreur) return setErreur(res.erreur);
    apres();
    onFermer();
  }

  async function annuler() {
    const retenu = motif === "autre" ? autre.trim() : motif;
    if (!retenu || enCours) return;
    setEnCours(true);
    setErreur("");
    const res = await annulerRdvMedecin(rdv.id, retenu);
    setEnCours(false);
    if (res.erreur) return setErreur(res.erreur);
    apres();
    onFermer();
  }

  function ajouterAuCalendrier() {
    telechargerICS(
      `rdv-${rdv.date}-${rdv.heure.replace(":", "h")}.ics`,
      construireICS({
        id: rdv.id,
        date: rdv.date,
        heure: rdv.heure,
        titre: `${rdv.beneficiaire} — ${rdv.motif || "Consultation"}`,
        lieu:
          rdv.lieu === "domicile"
            ? rdv.adresseDomicile || "Visite à domicile"
            : [medecin?.quartier, medecin?.ville].filter(Boolean).join(", "),
        description: `${rdv.motif || "Consultation"}${rdv.telephone ? ` · ${rdv.telephone}` : ""}`,
      })
    );
  }

  /* ---------- Vue « annuler » ---------- */

  if (vue === "annuler") {
    const retenu = motif === "autre" ? autre.trim() : motif;
    return (
      <Dialogue
        titre="Annuler le rendez-vous"
        icone="✖️"
        sousTitre={`${rdv.beneficiaire} · ${formatDateCourte(rdv.date)} à ${rdv.heure}`}
        onFermer={onFermer}
        pied={
          <>
            <button type="button" className={BTN_LEGER} onClick={() => setVue("detail")}>
              Revenir
            </button>
            <button
              type="button"
              onClick={annuler}
              disabled={!retenu || enCours}
              className="flex-1 rounded-[10px] bg-red px-4 py-2 text-[12.5px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {enCours ? "Annulation…" : "Annuler et prévenir le patient"}
            </button>
          </>
        }
      >
        <div className="p-4">
          <p className="mb-3 text-[12.5px] leading-relaxed text-muted">
            Le motif est obligatoire : dans une semaine, c’est la seule chose qui dira si le patient
            s’était décommandé ou s’il s’agissait d’une erreur. Le patient est prévenu, le créneau
            est libéré, et le rendez-vous reste au dossier marqué annulé.
          </p>
          {MOTIFS_ANNULATION.map((m) => (
            <label key={m} className="mb-1.5 flex items-center gap-2 text-[12.5px] font-semibold">
              <input
                type="radio"
                name="motif-annulation-agenda"
                checked={motif === m}
                onChange={() => setMotif(m)}
              />
              {m}
            </label>
          ))}
          <label className="mb-1.5 flex items-center gap-2 text-[12.5px] font-semibold">
            <input
              type="radio"
              name="motif-annulation-agenda"
              checked={motif === "autre"}
              onChange={() => setMotif("autre")}
            />
            Autre motif
          </label>
          {motif === "autre" && (
            <input
              className="w-full rounded-[11px] border border-line bg-white px-[13px] py-2.5 text-[13.5px] outline-none focus:border-teal"
              placeholder="Précisez"
              aria-label="Autre motif d’annulation"
              value={autre}
              onChange={(e) => setAutre(e.target.value)}
            />
          )}
          {erreur && (
            <p role="alert" className="mt-3 text-[12.5px] font-bold text-red">
              ⚠️ {erreur}
            </p>
          )}
        </div>
      </Dialogue>
    );
  }

  /* ---------- Vue « détail » ---------- */

  return (
    <Dialogue
      titre={rdv.beneficiaire}
      icone={
        <span
          aria-hidden
          className="grid h-9 w-9 place-items-center rounded-[11px] bg-teal text-[12px] font-extrabold text-white"
        >
          {initiales(rdv.beneficiaire)}
        </span>
      }
      sousTitre={`${capitaliser(formatDateLongue(rdv.date))} · ${rdv.heure} – ${heureDeFin(rdv.heure)}`}
      onFermer={onFermer}
      pied={
        <>
          {/* Le raccourci qui justifie cet écran : le dossier à un clic. */}
          <Link href={`/espace-medecin/patients/${rdv.cle}`} className={`flex-1 text-center ${BTN_PLEIN}`}>
            📁 Ouvrir la fiche patient
          </Link>
          <button type="button" className={BTN_LEGER} onClick={ajouterAuCalendrier}>
            📆 .ics
          </button>
        </>
      }
    >
      <div className="grid gap-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`rounded-lg px-2.5 py-1 text-[11.5px] font-bold ${
              TEINTE_STATUT[rdv.statut] ?? "bg-bg text-muted"
            }`}
          >
            {LIBELLE_STATUT[rdv.statut] ?? rdv.statut}
          </span>
          <span
            className={`rounded-lg px-2.5 py-1 text-[11.5px] font-bold ${
              rdv.lieu === "domicile" ? "bg-green-soft text-green" : "bg-[#F1F4F6] text-muted"
            }`}
          >
            {rdv.lieu === "domicile" ? "🏠 Visite à domicile" : "🏥 Au cabinet"}
          </span>
          {passe && rdv.statut !== "honore" && rdv.statut !== "annule" && (
            <span className="rounded-lg bg-amber-soft px-2.5 py-1 text-[11.5px] font-bold text-amber">
              Créneau passé
            </span>
          )}
        </div>

        {/* ---- Joindre ---- */}
        <div className="rounded-[14px] bg-bg p-[13px]">
          <small className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-muted">
            Joindre le patient
          </small>
          {rdv.telephone ? (
            <a
              href={`tel:${numeroComposable(rdv.telephone)}`}
              className="text-[15px] font-extrabold text-blue underline decoration-dotted"
            >
              {formatTelephone(rdv.telephone)}
            </a>
          ) : (
            <span className="text-[12.5px] text-muted">Aucun numéro enregistré</span>
          )}
          {rdv.email && (
            <a
              href={`mailto:${rdv.email}`}
              className="mt-0.5 block truncate text-[12px] font-semibold text-teal underline"
            >
              {rdv.email}
            </a>
          )}
          {rdv.typeFiche === "proche" && rdv.titulaire && (
            <p className="mt-1.5 text-[11.5px] leading-relaxed text-muted">
              {capitaliser(rdv.lien || "proche")} de <b>{rdv.titulaire}</b> — c’est le titulaire du
              compte que vous joignez.
            </p>
          )}
        </div>

        {/* ---- Le rendez-vous ---- */}
        <dl className="grid gap-2 text-[12.5px]">
          <Champ libelle="Motif">{rdv.motif || "Consultation"}</Champ>
          <Champ libelle="Lieu">
            {rdv.lieu === "domicile" ? (
              <>
                À domicile{rdv.adresseDomicile ? ` — ${rdv.adresseDomicile}` : " (adresse non précisée)"}
                {carte && (
                  <>
                    {" · "}
                    <a
                      href={carte}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-bold text-teal underline"
                    >
                      Ouvrir la carte
                    </a>
                  </>
                )}
              </>
            ) : (
              [medecin?.quartier, medecin?.ville].filter(Boolean).join(", ") || "Au cabinet"
            )}
          </Champ>
          <Champ libelle="Fiche">
            {rdv.typeFiche === "compte"
              ? "Compte patient"
              : rdv.typeFiche === "proche"
                ? "Proche d’un titulaire de compte"
                : "Fiche créée au cabinet (sans compte)"}
            {rdv.dateNaissance &&
              ` · né(e) le ${formatDateCourte(rdv.dateNaissance)} (${calculerAge(rdv.dateNaissance)} ans)`}
          </Champ>
          <Champ libelle="Origine">
            {LIBELLE_SOURCE[rdv.source] ?? "Pris en ligne"} · le{" "}
            {formatDateCourte(rdv.creeLe.slice(0, 10))}
          </Champ>
          {rdv.motifAnnulation && (
            <Champ libelle="Motif d’annulation">{rdv.motifAnnulation}</Champ>
          )}
        </dl>

        {/* ---- Agir ---- */}
        {rdv.statut !== "annule" && (
          <div className="border-t border-line pt-3">
            {peutAgir ? (
              <div className="flex flex-wrap gap-2">
                {rdv.statut === "en_attente" && (
                  <button
                    type="button"
                    className={BTN_LEGER}
                    disabled={enCours}
                    onClick={() => changerStatut("confirme")}
                  >
                    ✓ Confirmer
                  </button>
                )}
                {rdv.statut !== "honore" && (
                  <button
                    type="button"
                    className={BTN_LEGER}
                    disabled={enCours}
                    onClick={() => changerStatut("honore")}
                  >
                    🩺 Marquer honoré
                  </button>
                )}
                <button
                  type="button"
                  className={BTN_ROUGE}
                  disabled={enCours}
                  onClick={() => {
                    setErreur("");
                    setVue("annuler");
                  }}
                >
                  ✖️ Annuler
                </button>
              </div>
            ) : (
              <p className="text-[11.5px] leading-relaxed text-muted">
                ⛔ La permission « Confirmer / annuler les rendez-vous » ne vous a pas été accordée
                par le médecin : cet écran reste consultable, mais l’état du rendez-vous ne s’y
                modifie pas.
              </p>
            )}
          </div>
        )}

        {erreur && (
          <p role="alert" className="text-[12.5px] font-bold text-red">
            ⚠️ {erreur}
          </p>
        )}
      </div>
    </Dialogue>
  );
}

function Champ({ libelle, children }: { libelle: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-line pb-2 last:border-b-0 last:pb-0">
      <dt className="text-[11px] font-bold uppercase tracking-wide text-muted">{libelle}</dt>
      <dd className="mt-0.5 leading-relaxed">{children}</dd>
    </div>
  );
}
