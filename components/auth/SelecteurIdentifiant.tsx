"use client";

import { useState, useSyncExternalStore } from "react";

/*
 * Segmented control « Téléphone | E-mail » des pages Connexion et
 * Inscription patient.
 *
 * L'e-mail reste le mode par défaut : c'est le parcours en service, et celui
 * des professionnels. `?mode=telephone` ouvre directement l'onglet
 * Téléphone (lien « Se connecter » depuis une inscription par téléphone).
 * L'URL est lue par useSyncExternalStore : le serveur rend l'e-mail, le
 * navigateur corrige après l'hydratation — sans écart d'hydratation ni
 * setState dans un effet.
 */

export type ModeIdentifiant = "telephone" | "email";

const sAbonner = () => () => {};
const modeDeLUrl = (): ModeIdentifiant | null =>
  new URLSearchParams(window.location.search).get("mode") === "telephone" ? "telephone" : null;

export function useModeIdentifiant(): [ModeIdentifiant, (m: ModeIdentifiant) => void] {
  const [choisi, setChoisi] = useState<ModeIdentifiant | null>(null);
  const depuisUrl = useSyncExternalStore(sAbonner, modeDeLUrl, () => null);
  return [choisi ?? depuisUrl ?? "email", setChoisi];
}

const OPTIONS: { id: ModeIdentifiant; libelle: string; icone: string }[] = [
  { id: "telephone", libelle: "Téléphone", icone: "📱" },
  { id: "email", libelle: "E-mail", icone: "✉️" },
];

export default function SelecteurIdentifiant({
  mode,
  onChange,
  mobile = false,
}: {
  mode: ModeIdentifiant;
  onChange: (m: ModeIdentifiant) => void;
  mobile?: boolean;
}) {
  return (
    <div
      role="group"
      aria-label="Identifiant de connexion"
      className={
        mobile
          ? "tabsm"
          : "mb-5 flex gap-1.5 rounded-[13px] border border-line bg-card p-[5px]"
      }
      style={mobile ? { margin: "0 0 18px" } : undefined}
    >
      {OPTIONS.map((o) => (
        <button
          key={o.id}
          type="button"
          aria-pressed={mode === o.id}
          onClick={() => onChange(o.id)}
          className={
            mobile
              ? `tabm${mode === o.id ? " on" : ""}`
              : `flex-1 rounded-[9px] px-3 py-[10px] text-[13.5px] font-bold transition-colors ${
                  mode === o.id ? "bg-blue text-white" : "text-muted hover:text-ink"
                }`
          }
        >
          <span aria-hidden>{o.icone}</span> {o.libelle}
        </button>
      ))}
    </div>
  );
}
