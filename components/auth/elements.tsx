"use client";

import { useEffect, useState, type ReactNode } from "react";
import { lireNumeroTest, type NumeroTest } from "@/lib/auth-telephone";
import type { CanalCode } from "@/lib/pin";
import { formaterTelephoneGN } from "@/lib/telephone";

/*
 * Pièces communes des parcours téléphone (inscription, connexion, PIN
 * oublié). Elles reprennent à l'identique les classes des formulaires
 * e-mail voisins : celles de app/mobile.css sous md, les utilitaires
 * Tailwind au-dessus. Rien de neuf à apprendre pour l'œil.
 */

export const CHAMP_WEB =
  "mb-3 w-full rounded-xl border border-line bg-white p-[14px] text-sm outline-none focus:border-teal";

export function Etiquette({ mobile, children }: { mobile: boolean; children: ReactNode }) {
  return mobile ? (
    <div className="flabel">{children}</div>
  ) : (
    <label className="mb-1.5 mt-0.5 block text-[12.5px] font-bold text-ink">{children}</label>
  );
}

export function BoutonPrincipal({
  mobile,
  onClick,
  enCours,
  desactive,
  children,
}: {
  mobile: boolean;
  onClick: () => void;
  enCours?: boolean;
  desactive?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={enCours || desactive}
      className={
        mobile
          ? "btn block w-full disabled:cursor-not-allowed disabled:opacity-50"
          : "ui-btn flex w-full items-center justify-center gap-2 rounded-[11px] bg-teal px-6 py-[14px] text-[15px] font-bold text-white transition-colors hover:bg-[#2790bc] disabled:cursor-not-allowed disabled:opacity-50"
      }
    >
      {children}
    </button>
  );
}

export function BoutonRetour({ onClick, children = "Retour" }: { onClick: () => void; children?: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mb-3 inline-flex items-center gap-1.5 text-[12.5px] font-bold text-muted transition-colors hover:text-ink"
    >
      <span aria-hidden>←</span> {children}
    </button>
  );
}

export function LienTexte({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="text-[12.5px] font-bold text-teal hover:underline">
      {children}
    </button>
  );
}

/** Même encadré rouge que les formulaires e-mail. */
export function Erreur({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-[12.5px] font-semibold text-red-600">
      {children}
    </p>
  );
}

export function Note({ ton = "info", children }: { ton?: "info" | "alerte"; children: ReactNode }) {
  return (
    <p
      className={`mb-4 rounded-[11px] px-[13px] py-[11px] text-[12.5px] font-semibold leading-relaxed ${
        ton === "alerte" ? "bg-amber-soft text-amber-ink" : "bg-teal-soft text-blue"
      }`}
    >
      {children}
    </p>
  );
}

export function TitreEtape({ titre, texte }: { titre: string; texte: ReactNode }) {
  return (
    <>
      <h4 className="text-[16px] font-extrabold tracking-[-0.2px] text-ink">{titre}</h4>
      <p className="mb-4 mt-1 text-[13px] leading-relaxed text-muted">{texte}</p>
    </>
  );
}

/** « Étape 2 sur 4 · Vérification » et ses quatre traits. */
export function Progression({ etape, total, nom }: { etape: number; total: number; nom: string }) {
  return (
    <div className="mb-4" aria-label={`Étape ${etape} sur ${total} : ${nom}`}>
      <div className="mb-1.5 flex gap-1.5" aria-hidden>
        {Array.from({ length: total }, (_, i) => (
          <span
            key={i}
            className={`h-[5px] flex-1 rounded-full transition-colors ${i < etape ? "bg-teal" : "bg-line"}`}
          />
        ))}
      </div>
      <div className="flex justify-between text-[11.5px] font-semibold text-muted" aria-hidden>
        <span>
          Étape {etape} sur {total}
        </span>
        <span>{nom}</span>
      </div>
    </div>
  );
}

const CANAUX: { id: CanalCode; nom: string; texte: string; icone: string; fond: string }[] = [
  { id: "whatsapp", nom: "WhatsApp", texte: "Recevoir le code sur WhatsApp", icone: "💬", fond: "bg-green-soft" },
  { id: "sms", nom: "SMS", texte: "Recevoir le code par SMS", icone: "📱", fond: "bg-teal-soft" },
];

export function ChoixCanal({ canal, onChange }: { canal: CanalCode; onChange: (c: CanalCode) => void }) {
  return (
    <div role="radiogroup" aria-label="Canal de réception du code" className="mb-4 grid gap-2.5">
      {CANAUX.map((c) => {
        const choisi = canal === c.id;
        return (
          <button
            key={c.id}
            type="button"
            role="radio"
            aria-checked={choisi}
            onClick={() => onChange(c.id)}
            className={`flex items-center gap-3 rounded-[14px] border-[1.5px] p-[13px] text-left transition-colors ${
              choisi ? "border-teal bg-teal-soft" : "border-line bg-card hover:border-teal"
            }`}
          >
            <span aria-hidden className={`grid h-11 w-11 flex-none place-items-center rounded-xl text-[20px] ${c.fond}`}>
              {c.icone}
            </span>
            <span className="min-w-0 flex-1">
              <b className="block text-[14px] font-extrabold text-ink">{c.nom}</b>
              <small className="text-[12px] text-muted">{c.texte}</small>
            </span>
            <span
              aria-hidden
              className={`grid h-5 w-5 flex-none place-items-center rounded-full border-2 ${
                choisi ? "border-teal" : "border-line"
              }`}
            >
              {choisi && <span className="h-2.5 w-2.5 rounded-full bg-teal" />}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * Le code affiché à l'écran : numéro de test coché dans l'admin, ou aucun
 * agrégateur branché en local (OTP_CODE_VISIBLE).
 */
export function CodeDemonstration({ code, test = false }: { code: string; test?: boolean }) {
  return (
    <p className="mb-3 rounded-[11px] border border-dashed border-amber-line bg-amber-soft px-[13px] py-[10px] text-[12px] text-amber-ink">
      {test
        ? "🧪 Numéro de test — aucun message n’est envoyé. Code :"
        : "Aucun fournisseur SMS/WhatsApp n’est branché — code de démonstration :"}{" "}
      <strong className="tracking-[0.15em]">{code}</strong>
    </p>
  );
}

/**
 * « Compte de test » annoncé à l'étape du numéro, tant que l'option est cochée
 * dans /espace-admin/messagerie. Rien n'est rendu sinon.
 */
export function EncartNumeroTest({ onUtiliser }: { onUtiliser: (chiffres: string) => void }) {
  const [test, setTest] = useState<NumeroTest | null>(null);
  useEffect(() => {
    let actif = true;
    lireNumeroTest().then((t) => actif && setTest(t));
    return () => {
      actif = false;
    };
  }, []);
  if (!test?.actif || !test.numero) return null;
  const chiffres = test.numero.replace(/^\+224/, "");
  return (
    <div className="mb-4 rounded-[11px] border border-dashed border-amber-line bg-amber-soft px-[13px] py-[11px] text-[12px] leading-relaxed text-amber-ink">
      <strong>🧪 Compte de test</strong> — aucun SMS n’est envoyé.
      <br />
      Numéro : <strong>+224 {formaterTelephoneGN(chiffres)}</strong> · Code reçu :{" "}
      <strong className="tracking-[0.12em]">{test.code}</strong>
      <br />
      <button type="button" onClick={() => onUtiliser(chiffres)} className="mt-1 font-bold underline">
        Utiliser ce numéro
      </button>
    </div>
  );
}
