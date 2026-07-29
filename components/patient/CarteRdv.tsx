"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { depuisISO, MOIS_ABREGES } from "@/lib/dates";
import type { RendezVousPatient } from "@/lib/patient";

/**
 * Carte de rendez-vous — reproduit la .appt de la maquette web
 * (pastille de date, médecin, lignes de détail, badge de statut, actions).
 *
 * La carte entière ouvre le détail (/mes-rendez-vous/[id]). Les boutons
 * Modifier / Annuler restent prioritaires : `stopPropagation` sur leur
 * conteneur empêche le clic de remonter jusqu'à la carte.
 */

const LIBELLES_STATUT: Record<RendezVousPatient["statut"], string> = {
  en_attente: "En attente",
  confirme: "Confirmé",
  annule: "Annulé",
  honore: "Honoré",
};

export default function CarteRdv({
  rdv,
  onAnnuler,
}: {
  rdv: RendezVousPatient;
  onAnnuler?: (id: string) => void;
}) {
  const router = useRouter();
  const d = depuisISO(rdv.date);
  const annule = rdv.statut === "annule";
  const libelle = LIBELLES_STATUT[rdv.statut];
  const pourUnProche = rdv.procheId !== undefined;
  const lienDetail = `/mes-rendez-vous/${rdv.id}`;

  // La carte se comporte comme un lien : clic, Entrée et Espace l'ouvrent.
  const ouvrir = {
    role: "link" as const,
    tabIndex: 0,
    onClick: () => router.push(lienDetail),
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        router.push(lienDetail);
      }
    },
  };

  // Les actions ne doivent pas déclencher l'ouverture du détail.
  const stopper = {
    onClick: (e: React.MouseEvent) => e.stopPropagation(),
    onKeyDown: (e: React.KeyboardEvent) => e.stopPropagation(),
  };

  return (
    <>
    {/* ===== Version mobile : carte .appt de la maquette mobile ===== */}
    <div className="appt cliquable md:hidden" {...ouvrir} aria-label={`Voir le rendez-vous du ${d.getDate()} avec ${rdv.medecinNom}`}>
      <div className="top">
        <div className="when">
          <b>{d.getDate()}</b>
          <small>{MOIS_ABREGES[d.getMonth()]}</small>
        </div>
        <div className="who" style={{ flex: 1 }}>
          <b>{rdv.medecinNom}</b>
          <small>
            {rdv.specialite} · {rdv.heure}
          </small>
        </div>
        <span className={`badge ${annule ? "no" : "ok"}`}>{libelle}</span>
      </div>
      <div className="hr" />
      <div className="det">
        📍 {rdv.etablissementNom} · {rdv.ville}
      </div>
      {pourUnProche && <div className="det">👤 Pour : {rdv.pourQui}</div>}
      <div className="det chevron">
        <span>Voir le détail</span>
        <span aria-hidden>›</span>
      </div>
      {onAnnuler && !annule && (
        <div className="acts" {...stopper}>
          <Link href={`/medecin/${rdv.medecinId}`}>Modifier</Link>
          <button type="button" className="danger" onClick={() => onAnnuler(rdv.id)}>
            Annuler
          </button>
        </div>
      )}
    </div>

    {/* ===== Version web (inchangée) ===== */}
    <div
      {...ouvrir}
      aria-label={`Voir le rendez-vous du ${d.getDate()} avec ${rdv.medecinNom}`}
      className="mb-[14px] hidden cursor-pointer items-center gap-[18px] rounded-2xl border border-line bg-white p-[18px] transition-shadow hover:border-teal hover:shadow-[0_2px_10px_rgba(21,80,107,.08)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal sm:grid-cols-[64px_1fr] md:grid lg:grid-cols-[64px_1fr_auto]"
    >
      <div className="rounded-[13px] bg-teal-soft py-3 text-center">
        <b className="block text-[22px] font-extrabold leading-none text-blue">{d.getDate()}</b>
        <small className="text-[10px] font-bold uppercase text-blue">
          {MOIS_ABREGES[d.getMonth()]}
        </small>
      </div>
      <div>
        <b className="block text-[15px] font-extrabold">{rdv.medecinNom}</b>
        <div className="mt-1 flex items-center gap-[7px] text-[12.5px] text-muted">
          🩺 {rdv.specialite} · {rdv.heure}
        </div>
        <div className="mt-1 flex items-center gap-[7px] text-[12.5px] text-muted">
          📍 {rdv.etablissementNom} · {rdv.ville}
        </div>
        {pourUnProche && (
          <div className="mt-1 flex items-center gap-[7px] text-[12.5px] text-muted">
            👤 Pour : {rdv.pourQui}
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-[9px]">
        <span
          className={`rounded-lg px-[10px] py-[5px] text-[10.5px] font-extrabold uppercase tracking-[.03em] ${
            annule
              ? "bg-red-soft text-red"
              : rdv.statut === "en_attente"
                ? "bg-amber-soft text-amber"
                : "bg-green-soft text-green"
          }`}
        >
          {libelle}
        </span>
        {onAnnuler && !annule && (
          <span className="flex flex-wrap items-center gap-[9px]" {...stopper}>
            <Link
              href={`/medecin/${rdv.medecinId}`}
              className="rounded-[10px] border-[1.5px] border-line bg-white px-[15px] py-[9px] text-[12.5px] font-bold text-blue transition-colors hover:bg-bg"
            >
              Modifier
            </Link>
            <button
              type="button"
              onClick={() => onAnnuler(rdv.id)}
              className="rounded-[10px] border-[1.5px] border-red-soft bg-white px-[15px] py-[9px] text-[12.5px] font-bold text-red transition-colors hover:bg-red-soft"
            >
              Annuler
            </button>
          </span>
        )}
      </div>
    </div>
    </>
  );
}
