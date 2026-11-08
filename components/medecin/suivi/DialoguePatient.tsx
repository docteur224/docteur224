"use client";

import Link from "next/link";
import { useState } from "react";
import Dialogue from "@/components/site/Dialogue";
import Icone from "@/components/site/Icone";
import { BTN_CONTOUR, BTN_NEUTRE, BTN_PRIMAIRE } from "@/components/medecin/fiche/ui";
import { formatDateCourte } from "@/lib/dates";
import { formatTelephone } from "@/lib/rdv-utils";
import { APPARENCE_NIVEAU, formatPourcent, remplirModele, tauxNoShow } from "@/lib/suivi-absence";
import {
  avertirPatient,
  reinitialiserCompteur,
  type LigneSuivi,
  type ParametresSuivi,
} from "@/lib/suivi-absence-donnees";
import { libelleSuivi } from "./ListeSuivi";

/*
 * Le détail d'un patient, et les deux gestes qu'on peut poser.
 *
 * Deux gestes, et deux seulement :
 *
 *   • AVERTIR — envoyer un mot au patient, par le canal habituel du cabinet
 *     (WhatsApp, SMS ou e-mail), à partir d'un modèle que le praticien
 *     relit et modifie avant l'envoi. Jamais d'envoi automatique : un
 *     message part parce que quelqu'un a décidé de l'envoyer ;
 *
 *   • REMETTRE LE COMPTEUR À ZÉRO — le patient a expliqué, on passe l'éponge.
 *     Rien n'est effacé : ses rendez-vous restent au dossier, et le journal
 *     garde qui a fait le geste et pourquoi.
 *
 * Il n'y a pas de troisième bouton. Aucune action de blocage n'existe dans
 * cet écran, et le texte le dit au praticien pour qu'il n'aille pas la
 * chercher ailleurs.
 */

type Vue = "detail" | "avertir" | "clemence";

export default function DialoguePatient({
  ligne,
  parametres,
  nomProfessionnel,
  onFermer,
  onFait,
  onErreur,
}: {
  ligne: LigneSuivi;
  parametres: ParametresSuivi;
  /** Nom du praticien, tel qu'il apparaîtra dans le message au patient. */
  nomProfessionnel: string;
  onFermer: () => void;
  /** Succès : le message à annoncer, et la liste à recharger. */
  onFait: (message: string) => void;
  onErreur: (message: string) => void;
}) {
  const [vue, setVue] = useState<Vue>("detail");
  const nomComplet = `${ligne.prenom} ${ligne.nom}`.trim();
  const apparence = APPARENCE_NIVEAU[ligne.niveau];

  return (
    <Dialogue
      titre={nomComplet || "Patient"}
      sousTitre={
        vue === "avertir"
          ? "Rappel de ponctualité"
          : vue === "clemence"
            ? "Remettre le compteur à zéro"
            : `${apparence.court} · ${ligne.absences} absence${ligne.absences > 1 ? "s" : ""} sur ${ligne.termines} rendez-vous`
      }
      icone={<Icone nom={apparence.icone} taille={18} />}
      onFermer={vue === "detail" ? onFermer : () => setVue("detail")}
      largeur="560px"
      pied={
        vue === "detail" ? (
          <PiedDetail ligne={ligne} onAvertir={() => setVue("avertir")} onClemence={() => setVue("clemence")} />
        ) : undefined
      }
    >
      {/* Le corps du Dialogue partagé n'a pas de marge interne (seuls
          l'en-tête et le pied en ont) : chaque écran pose la sienne, comme
          DialoguePaiement. Sans elle, le contenu touche les bords. */}
      <div className="p-4">
        {vue === "detail" && <VueDetail ligne={ligne} />}
        {vue === "avertir" && (
          <VueAvertir
            ligne={ligne}
            parametres={parametres}
            nomProfessionnel={nomProfessionnel}
            onFait={onFait}
            onErreur={onErreur}
            onRetour={() => setVue("detail")}
          />
        )}
        {vue === "clemence" && (
          <VueClemence
            ligne={ligne}
            onFait={onFait}
            onErreur={onErreur}
            onRetour={() => setVue("detail")}
          />
        )}
      </div>
    </Dialogue>
  );
}

/* ===== Détail ===== */

function VueDetail({ ligne }: { ligne: LigneSuivi }) {
  const lignes: [string, string][] = [
    ["Absences", `${ligne.absences}`],
    ["Rendez-vous terminés", `${ligne.termines}`],
    ["Taux de no-show", formatPourcent(tauxNoShow(ligne))],
    [
      "Dernière absence",
      ligne.derniereAbsence ? formatDateCourte(ligne.derniereAbsence) : "—",
    ],
    ["Suivi", libelleSuivi(ligne)],
    [
      "Téléphone",
      ligne.telephone ? formatTelephone(ligne.telephone) : "Aucun numéro connu",
    ],
    ["E-mail", ligne.email || "Aucune adresse connue"],
  ];

  return (
    <>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2.5 text-[13px]">
        {lignes.map(([libelle, valeur]) => (
          <div key={libelle} className="contents">
            <dt className="text-muted">{libelle}</dt>
            <dd className="m-0 break-words text-right font-semibold">{valeur}</dd>
          </div>
        ))}
      </dl>

      {ligne.remisAZeroLe && (
        <p className="mt-4 rounded-xl bg-teal-soft px-3 py-2.5 text-[12px] leading-relaxed text-blue">
          Compteur remis à zéro le {formatDateCourte(ligne.remisAZeroLe.slice(0, 10))}
          {ligne.motif ? ` — « ${ligne.motif} »` : ""}. Seules les absences postérieures sont
          comptées ; les rendez-vous antérieurs restent au dossier.
        </p>
      )}

      <Link
        href={`/espace-medecin/patients/${encodeURIComponent(ligne.cle)}`}
        className={`${BTN_CONTOUR} mt-4 w-full`}
      >
        <Icone nom="document" taille={15} />
        Voir la fiche et l’historique des rendez-vous
      </Link>

      <p className="mt-4 text-[11.5px] leading-relaxed text-muted">
        Cet écran informe : il n’empêche aucune réservation et ne restreint rien pour ce
        patient. Vous pouvez continuer à confirmer ses rendez-vous comme ceux de tout le
        monde.
      </p>
    </>
  );
}

function PiedDetail({
  ligne,
  onAvertir,
  onClemence,
}: {
  ligne: LigneSuivi;
  onAvertir: () => void;
  onClemence: () => void;
}) {
  const joignable = !!ligne.telephone || !!ligne.email;
  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        onClick={onAvertir}
        disabled={!joignable}
        title={joignable ? undefined : "Aucun numéro ni adresse connus pour ce patient"}
        className={`${BTN_PRIMAIRE} flex-1 whitespace-nowrap`}
      >
        <Icone nom="envoyer" taille={15} />
        Avertir
      </button>
      <button type="button" onClick={onClemence} className={`${BTN_NEUTRE} flex-1 whitespace-nowrap`}>
        <Icone nom="historique" taille={15} />
        Remettre à zéro
      </button>
    </div>
  );
}

/* ===== Avertir ===== */

const CANAUX: { cle: "whatsapp" | "sms" | "email"; libelle: string }[] = [
  { cle: "whatsapp", libelle: "WhatsApp" },
  { cle: "sms", libelle: "SMS" },
  { cle: "email", libelle: "E-mail" },
];

const LONGUEUR_MAX = 1000;

function VueAvertir({
  ligne,
  parametres,
  nomProfessionnel,
  onFait,
  onErreur,
  onRetour,
}: {
  ligne: LigneSuivi;
  parametres: ParametresSuivi;
  nomProfessionnel: string;
  onFait: (message: string) => void;
  onErreur: (message: string) => void;
  onRetour: () => void;
}) {
  /*
   * Le canal proposé est celui du cabinet, sauf s'il est inutilisable pour ce
   * patient : proposer « e-mail » à une fiche sans adresse ferait cliquer sur
   * un bouton qui ne peut qu'échouer.
   */
  const disponible = (c: "whatsapp" | "sms" | "email") =>
    c === "email" ? !!ligne.email : !!ligne.telephone;
  const canalInitial = disponible(parametres.canalDefaut)
    ? parametres.canalDefaut
    : (CANAUX.find((c) => disponible(c.cle))?.cle ?? "whatsapp");

  const [canal, setCanal] = useState(canalInitial);
  const [texte, setTexte] = useState(() =>
    remplirModele(parametres.modele, {
      prenom: ligne.prenom,
      professionnel: nomProfessionnel,
    })
  );
  const [envoi, setEnvoi] = useState(false);

  async function envoyer() {
    const corps = texte.trim();
    if (corps.length < 20) {
      onErreur("Le message est trop court pour être envoyé.");
      return;
    }
    setEnvoi(true);
    const { erreur, resultat } = await avertirPatient({ cle: ligne.cle, texte: corps, canal });
    setEnvoi(false);
    if (erreur) {
      onErreur(erreur);
      return;
    }
    if (!resultat?.previenu) {
      onErreur(resultat?.erreurs?.[0] ?? "Le message n’a pas pu partir.");
      return;
    }
    onFait(
      resultat.simule
        ? "Message préparé (envoi simulé : aucun agrégateur configuré)."
        : `Message envoyé par ${resultat.canal === "email" ? "e-mail" : resultat.canal === "sms" ? "SMS" : "WhatsApp"}.`
    );
  }

  return (
    <>
      <fieldset className="mb-4">
        <legend className="mb-2 text-[12px] font-bold text-muted">Canal</legend>
        <div className="flex flex-wrap gap-2">
          {CANAUX.map((c) => {
            const ok = disponible(c.cle);
            const actif = canal === c.cle;
            return (
              <button
                key={c.cle}
                type="button"
                disabled={!ok}
                aria-pressed={actif}
                onClick={() => setCanal(c.cle)}
                title={ok ? undefined : "Coordonnée inconnue pour ce patient"}
                className={`min-h-11 rounded-[10px] border px-3.5 text-[12.5px] font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${
                  actif ? "border-teal bg-teal-soft text-blue" : "border-line bg-white text-ink"
                }`}
              >
                {c.libelle}
              </button>
            );
          })}
        </div>
      </fieldset>

      <label htmlFor="texte-avertissement" className="mb-2 block text-[12px] font-bold text-muted">
        Message
      </label>
      <textarea
        id="texte-avertissement"
        value={texte}
        maxLength={LONGUEUR_MAX}
        onChange={(e) => setTexte(e.target.value)}
        rows={7}
        className="w-full rounded-xl border border-line bg-white p-3 text-[13px] leading-relaxed"
      />
      <div className="mt-1 flex items-center justify-between text-[11px] text-muted">
        <span>
          {canal === "sms"
            ? "Un SMS de plus de 160 caractères est facturé en plusieurs segments."
            : "Relisez : le message part tel quel au patient."}
        </span>
        <span>
          {texte.length} / {LONGUEUR_MAX}
        </span>
      </div>

      <p className="mt-3 text-[11.5px] leading-relaxed text-muted">
        Ce message informe et sensibilise. Il n’annonce aucune sanction, et aucune n’est
        appliquée : le patient garde exactement les mêmes droits de réservation.
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" onClick={onRetour} className={`${BTN_NEUTRE} flex-1`}>
          Retour
        </button>
        <button
          type="button"
          onClick={envoyer}
          disabled={envoi}
          className={`${BTN_PRIMAIRE} flex-1`}
        >
          <Icone nom="envoyer" taille={15} />
          {envoi ? "Envoi…" : "Envoyer"}
        </button>
      </div>
    </>
  );
}

/* ===== Clémence ===== */

function VueClemence({
  ligne,
  onFait,
  onErreur,
  onRetour,
}: {
  ligne: LigneSuivi;
  onFait: (message: string) => void;
  onErreur: (message: string) => void;
  onRetour: () => void;
}) {
  const [motif, setMotif] = useState("");
  const [envoi, setEnvoi] = useState(false);

  async function confirmer() {
    setEnvoi(true);
    const { erreur } = await reinitialiserCompteur(ligne.cle, motif);
    setEnvoi(false);
    if (erreur) {
      onErreur(erreur);
      return;
    }
    onFait("Compteur remis à zéro. Les rendez-vous restent au dossier.");
  }

  return (
    <>
      <p className="text-[13px] leading-relaxed">
        Le compteur de <b>{`${ligne.prenom} ${ligne.nom}`.trim()}</b> repartira de zéro à partir
        d’aujourd’hui. Ses {ligne.absences} absence{ligne.absences > 1 ? "s" : ""} restent au
        dossier et dans l’historique de ses rendez-vous : c’est le compteur qui repart, pas le
        passé qui s’efface.
      </p>

      <label htmlFor="motif-clemence" className="mt-4 mb-2 block text-[12px] font-bold text-muted">
        Motif (facultatif)
      </label>
      <textarea
        id="motif-clemence"
        value={motif}
        maxLength={500}
        onChange={(e) => setMotif(e.target.value)}
        rows={3}
        placeholder="Ex. : hospitalisation, erreur de saisie, patient contacté…"
        className="w-full rounded-xl border border-line bg-white p-3 text-[13px] leading-relaxed"
      />
      <p className="mt-1 text-[11px] text-muted">
        Le geste est tracé dans le journal d’audit avec son auteur et sa date.
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" onClick={onRetour} className={`${BTN_NEUTRE} flex-1`}>
          Retour
        </button>
        <button
          type="button"
          onClick={confirmer}
          disabled={envoi}
          className={`${BTN_PRIMAIRE} flex-1`}
        >
          {envoi ? "Enregistrement…" : "Remettre à zéro"}
        </button>
      </div>
    </>
  );
}
