"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import Dialogue from "@/components/site/Dialogue";
import { chargerDetailMedecin, type DetailMedecin } from "@/lib/etablissement";
import { formaterTelephoneGN, INDICATIF_GN } from "@/lib/telephone";
import { formatNote } from "@/lib/format";

/*
 * Fiche d'un médecin rattaché, ouverte depuis « Médecins rattachés ».
 *
 * La liste ne portait que le nom et la spécialité : impossible de vérifier
 * qu'on a bien affaire au praticien qu'on croit — c'est le même problème
 * qu'à l'invitation, une fois le rattachement fait.
 *
 * Ce qui s'affiche est la fiche PUBLIQUE du praticien : identité
 * professionnelle, numéro d'ordre, lieu d'exercice, secrétariat. Pas
 * l'e-mail ni le téléphone personnels, que la RLS laisserait pourtant
 * lire : l'établissement gère un rattachement, il n'hérite pas du carnet
 * d'adresses privé du médecin — même règle que pour ses rendez-vous.
 */

const LIGNE = "flex items-start justify-between gap-4 border-b border-line py-3 last:border-b-0";
const CLE = "flex-none text-[12px] font-bold text-muted";
const VALEUR = "min-w-0 text-right text-[13px] font-semibold";

export default function DetailMedecinRattache({
  medecinId,
  onFermer,
}: {
  medecinId: string;
  onFermer: () => void;
}) {
  const [detail, setDetail] = useState<DetailMedecin | null>(null);
  const [chargement, setChargement] = useState(true);

  useEffect(() => {
    let actif = true;
    chargerDetailMedecin(medecinId).then((d) => {
      if (!actif) return;
      setDetail(d);
      setChargement(false);
    });
    return () => {
      actif = false;
    };
  }, [medecinId]);

  const lignes = detail
    ? [
        { cle: "Spécialité", valeur: detail.specialite || "Non renseignée" },
        {
          cle: "Numéro d’ordre",
          valeur: detail.numeroOrdre || "Non renseigné",
          alerte: !detail.numeroOrdre,
        },
        { cle: "Lieu d’exercice", valeur: detail.lieu || "Non renseigné" },
        {
          cle: "Expérience",
          valeur:
            detail.anneesExperience === null
              ? "Non renseignée"
              : `${detail.anneesExperience} an${detail.anneesExperience > 1 ? "s" : ""}`,
        },
        { cle: "Langues", valeur: detail.langues.length ? detail.langues.join(", ") : "Non renseignées" },
        {
          cle: "Secrétariat",
          valeur: detail.telephoneSecretariat
            ? `${INDICATIF_GN} ${formaterTelephoneGN(detail.telephoneSecretariat)}`
            : "Non renseigné",
        },
        {
          cle: "Avis",
          valeur:
            detail.nbAvis > 0
              ? `${formatNote(detail.note)} · ${detail.nbAvis} avis`
              : "Aucun avis pour l’instant",
        },
      ]
    : [];

  return (
    <Dialogue
      titre={detail?.nom ?? "Médecin rattaché"}
      icone="👨‍⚕️"
      sousTitre={detail?.specialite || undefined}
      onFermer={onFermer}
      pied={
        <div className="flex flex-wrap justify-end gap-2">
          {detail && (
            /* La fiche publique porte le reste : horaires, tarifs, photos,
               avis. Nouvel onglet — on ne quitte pas l'écran en cours. */
            <Link
              href={`/medecin/${detail.id}`}
              target="_blank"
              rel="noopener"
              className="rounded-[9px] border-[1.5px] border-line bg-white px-[14px] py-2 text-[12.5px] font-bold text-blue hover:border-teal"
            >
              Voir la fiche publique ↗
            </Link>
          )}
          <button
            type="button"
            onClick={onFermer}
            className="rounded-[9px] bg-teal px-[14px] py-2 text-[12.5px] font-bold text-white"
          >
            Fermer
          </button>
        </div>
      }
    >
      <div className="p-4">
        {chargement && <p className="text-[13px] text-muted">Chargement…</p>}

        {!chargement && !detail && (
          <p className="text-[13px] text-muted">
            Fiche introuvable. Le compte a peut-être été fermé depuis son rattachement.
          </p>
        )}

        {detail && (
          <>
            <div className="mb-4 flex items-center gap-4">
              {detail.photoUrl ? (
                // URL Cloudinary déjà redimensionnée à l'envoi, comme partout
                // ailleurs dans l'application.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={detail.photoUrl}
                  alt=""
                  width={64}
                  height={64}
                  className="h-16 w-16 flex-none rounded-[18px] object-cover"
                />
              ) : (
                <span
                  aria-hidden
                  className="grid h-16 w-16 flex-none place-items-center rounded-[18px] text-lg font-extrabold text-white"
                  style={{ background: detail.gradient }}
                >
                  {detail.initiales}
                </span>
              )}
              <div className="min-w-0">
                <b className="block text-[15px] font-extrabold">{detail.nom}</b>
                <span className="text-[12.5px] text-muted">
                  {detail.specialite || "Spécialité non renseignée"}
                </span>
              </div>
            </div>

            {lignes.map((l) => (
              <div key={l.cle} className={LIGNE}>
                <span className={CLE}>{l.cle}</span>
                <span className={`${VALEUR} ${l.alerte ? "text-amber" : ""}`}>{l.valeur}</span>
              </div>
            ))}

            {detail.presentation && (
              <div className="mt-4">
                <b className="mb-1 block text-[12px] font-bold text-muted">Présentation</b>
                <p className="whitespace-pre-line text-[13px] leading-relaxed">
                  {detail.presentation}
                </p>
              </div>
            )}

            <p className="mt-4 text-[11.5px] text-muted">
              Agenda, patients et rendez-vous restent propres au praticien : l’établissement gère
              le rattachement, pas son exercice.
            </p>
          </>
        )}
      </div>
    </Dialogue>
  );
}
