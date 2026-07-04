"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ajouterRendezVousLocal } from "@/lib/mock-rdv";
import { formatGNF } from "@/lib/format";

/**
 * Partie interactive de l'écran de réservation : motif de consultation,
 * bandeau « réservation gratuite » et boutons Retour / Confirmer.
 * À la confirmation, le rendez-vous est enregistré dans le navigateur
 * (localStorage) — c'est le mock de la future table « rendez_vous ».
 */
export default function FormulaireReservation({
  medecinId,
  medecinNom,
  specialite,
  etablissementNom,
  ville,
  date,
  heure,
  tarif,
  pourQui,
}: {
  medecinId: string;
  medecinNom: string;
  specialite: string;
  etablissementNom: string;
  ville: string;
  date: string;
  heure: string;
  tarif: number;
  pourQui: string;
}) {
  const router = useRouter();
  const [motif, setMotif] = useState("");
  const [enCours, setEnCours] = useState(false);

  function confirmer() {
    setEnCours(true);
    ajouterRendezVousLocal({
      id: `rdv-${Date.now()}`,
      medecinId,
      medecinNom,
      specialite,
      etablissementNom,
      ville,
      date,
      heure,
      tarif,
      motif: motif.trim(),
      pourQui,
      statut: "confirme",
      reservePar: "patient",
      creeLe: new Date().toISOString(),
    });
    router.push(
      `/confirmation?medecin=${medecinId}&date=${date}&heure=${encodeURIComponent(heure)}`
    );
  }

  return (
    <>
      <div className="mb-[18px] rounded-[18px] border border-line bg-white p-6">
        <h3 className="mb-[14px] text-base font-extrabold">Motif de la consultation</h3>
        <textarea
          rows={3}
          value={motif}
          onChange={(e) => setMotif(e.target.value)}
          placeholder="Ex. Vaccination de mon enfant, fièvre depuis 2 jours…"
          className="w-full resize-none rounded-xl border border-line bg-white p-[13px] text-[13.5px] outline-none focus:border-teal"
        />
        <div className="mt-4 flex items-start gap-[9px] rounded-xl border border-[#BFE3CC] bg-green-soft px-[14px] py-3 text-[12.5px] font-semibold leading-normal text-blue">
          <span aria-hidden>✅</span>
          <div>
            <b>Réservation gratuite.</b> La consultation ({formatGNF(tarif)}) se règle{" "}
            <b>sur place, chez le médecin</b>. Aucun paiement en ligne n’est requis.
          </div>
        </div>
      </div>

      <div className="flex gap-3">
        <Link
          href={`/medecin/${medecinId}`}
          className="rounded-[11px] border-[1.5px] border-line bg-white px-[18px] py-[11px] text-[13.5px] font-bold text-blue transition-colors hover:bg-bg"
        >
          ← Retour
        </Link>
        <button
          type="button"
          onClick={confirmer}
          disabled={enCours}
          className="flex-1 rounded-[11px] bg-green px-[18px] py-[11px] text-[13.5px] font-bold text-white transition-colors hover:bg-[#196a3b] disabled:opacity-60"
        >
          {enCours ? "Enregistrement…" : "✅ Confirmer le rendez-vous"}
        </button>
      </div>
    </>
  );
}
