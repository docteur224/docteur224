"use client";

import Link from "next/link";
import AdminShell from "@/components/admin/AdminShell";
import Interrupteur from "@/components/patient/Interrupteur";
import {
  ajouterAListeContenu,
  basculerReglage,
  useListeContenu,
  useReglagesPlateforme,
  type CleListeContenu,
} from "@/lib/mock-admin";

/*
 * Paramètres de la plateforme — reproduit l'écran « admin-params » de la
 * maquette web : listes de contenu (spécialités, villes, assurances) avec
 * ajout en direct, et réglages généraux persistés. Chaque bascule de réglage
 * est tracée dans le journal d'audit.
 */

const LISTES: { cle: CleListeContenu; titre: string; question: string }[] = [
  { cle: "specialites", titre: "Spécialités proposées", question: "Spécialité à ajouter :" },
  { cle: "villes", titre: "Villes couvertes", question: "Ville à ajouter :" },
  { cle: "assurances", titre: "Assurances référencées", question: "Assurance à ajouter :" },
];

function CarteListe({ cle, titre, question }: (typeof LISTES)[number]) {
  const elements = useListeContenu(cle);

  function ajouter() {
    const valeur = window.prompt(question)?.trim();
    if (valeur) ajouterAListeContenu(cle, valeur);
  }

  return (
    <div className="mb-4 rounded-2xl border border-line bg-white p-5">
      <h3 className="mb-3 text-[15px] font-extrabold">{titre}</h3>
      <div className="flex flex-wrap gap-2">
        {elements.map((element) => (
          <span
            key={element}
            className="rounded-full border border-[#CDE6F2] bg-teal-soft px-[14px] py-2 text-xs font-bold text-blue"
          >
            {element}
          </span>
        ))}
        <button
          type="button"
          onClick={ajouter}
          className="rounded-full border border-[#DCE4EA] bg-[#EEF2F5] px-[14px] py-2 text-xs font-bold text-[#3A4A55] transition-colors hover:bg-bg"
        >
          + Ajouter
        </button>
      </div>
    </div>
  );
}

export default function ParametresAdmin() {
  const reglages = useReglagesPlateforme();

  return (
    <AdminShell>
      <div className="mb-5">
        <h2 className="text-[21px] font-extrabold tracking-[-0.3px]">
          Paramètres de la plateforme
        </h2>
        <small className="text-[13px] text-muted">Contenu et réglages généraux</small>
      </div>

      {LISTES.map((liste) => (
        <CarteListe key={liste.cle} {...liste} />
      ))}

      <div className="mb-4 rounded-2xl border border-line bg-white p-5">
        <h3 className="mb-1 text-[15px] font-extrabold">Réglages</h3>
        <div className="flex items-center justify-between gap-[14px] border-b border-line py-[15px]">
          <div>
            <b className="block text-[13.5px] font-bold">Inscriptions médecins ouvertes</b>
            <small className="text-xs text-muted">Autoriser de nouvelles demandes</small>
          </div>
          <Interrupteur
            actif={reglages.inscriptionsOuvertes}
            onChange={(v) => basculerReglage("inscriptionsOuvertes", v)}
            label="Inscriptions médecins ouvertes"
          />
        </div>
        <div className="flex items-center justify-between gap-[14px] border-b border-line py-[15px]">
          <div>
            <b className="block text-[13.5px] font-bold">Paiement en ligne activé</b>
            <small className="text-xs text-muted">Orange Money, MTN MoMo</small>
          </div>
          <Interrupteur
            actif={reglages.paiementEnLigne}
            onChange={(v) => basculerReglage("paiementEnLigne", v)}
            label="Paiement en ligne activé"
          />
        </div>
        <div className="flex items-center justify-between gap-[14px] border-b border-line py-[15px]">
          <div>
            <b className="block text-[13.5px] font-bold">Mode maintenance</b>
            <small className="text-xs text-muted">
              Rend la plateforme inaccessible aux patients
            </small>
          </div>
          <Interrupteur
            actif={reglages.modeMaintenance}
            onChange={(v) => basculerReglage("modeMaintenance", v)}
            label="Mode maintenance"
          />
        </div>
        <div className="flex items-center justify-between gap-[14px] py-[15px]">
          <div>
            <b className="block text-[13.5px] font-bold">Langue par défaut</b>
            <small className="text-xs text-muted">Français</small>
          </div>
          <button
            type="button"
            disabled
            title="Multilingue : disponible dans une phase ultérieure"
            className="cursor-not-allowed rounded-[9px] border-[1.5px] border-line bg-white px-[14px] py-2 text-[12.5px] font-bold text-blue opacity-50"
          >
            Changer
          </button>
        </div>
        <p className="mt-1 text-[11.5px] text-muted">
          Chaque bascule de réglage est tracée dans le journal d’audit.
        </p>
      </div>

      <Link
        href="/"
        className="block w-full rounded-[11px] border-[1.5px] border-line bg-white px-[18px] py-[11px] text-center text-[13.5px] font-bold text-blue transition-colors hover:bg-bg"
      >
        ↩️ Déconnexion
      </Link>
    </AdminShell>
  );
}
