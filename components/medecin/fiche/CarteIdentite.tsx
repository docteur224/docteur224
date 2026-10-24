"use client";

import InfosMedicales from "@/components/medecin/InfosMedicales";
import { calculerAge, formatDateCourte } from "@/lib/dates";
import type { DossierPatient } from "@/lib/pro";
import { formatTelephone } from "@/lib/rdv-utils";
import { Squelettes } from "./ui";

/**
 * Identité du patient et bloc médical qu'on relit avant de prescrire
 * (groupe sanguin, allergies, antécédents, traitements en cours).
 */
export default function CarteIdentite({
  dossier,
  chargement,
  cle,
  modifiable,
  onEnregistre,
  onErreur,
}: {
  dossier: DossierPatient | null;
  chargement: boolean;
  cle: string;
  modifiable: boolean;
  onEnregistre: (message: string) => void;
  onErreur: (message: string) => void;
}) {
  if (chargement || !dossier) return <Squelettes n={3} />;

  const nomComplet = `${dossier.prenom} ${dossier.nom}`;
  const lignes: [string, string][] = [
    ["Téléphone", dossier.telephone ? formatTelephone(dossier.telephone) : "—"],
    [
      "Naissance",
      dossier.dateNaissance
        ? `${formatDateCourte(dossier.dateNaissance)} · ${calculerAge(dossier.dateNaissance)} ans`
        : "—",
    ],
    ["Sexe", dossier.genre === "M" ? "Masculin" : dossier.genre === "F" ? "Féminin" : "—"],
    ["Ville", dossier.ville || "—"],
    ["E-mail", dossier.email || "—"],
  ];

  return (
    <>
      <div className="mb-4 flex items-center gap-3.5">
        <span
          aria-hidden
          className="grid h-[52px] w-[52px] flex-none place-items-center rounded-2xl text-[17px] font-extrabold text-white"
          style={{ background: dossier.gradient }}
        >
          {`${dossier.prenom.charAt(0)}${dossier.nom.charAt(0)}`.toUpperCase()}
        </span>
        <div className="min-w-0">
          <b className="block text-[17px] font-extrabold">{nomComplet}</b>
          <div className="text-[12.5px] text-muted">
            {dossier.type === "proche"
              ? `${dossier.lien} de ${dossier.titulaire}`
              : dossier.type === "sans_compte"
                ? "Fiche cabinet (sans compte)"
                : "Compte patient"}
          </div>
        </div>
      </div>

      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2.5 text-[13px]">
        {lignes.map(([libelle, valeur]) => (
          <div key={libelle} className="contents">
            <dt className="text-muted">{libelle}</dt>
            <dd className="m-0 break-all text-right font-semibold">{valeur}</dd>
          </div>
        ))}
      </dl>

      <InfosMedicales
        infos={dossier.infos}
        cle={cle}
        modifiable={modifiable}
        onEnregistre={onEnregistre}
        onErreur={onErreur}
      />
    </>
  );
}
