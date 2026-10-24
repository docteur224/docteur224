"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { normaliserCode } from "@/lib/code-verification";

/**
 * Saisie manuelle d'un code de vérification, recopié depuis le papier quand
 * le QR est illisible (photocopie, papier froissé). Tolère les minuscules,
 * les espaces et l'oubli du préfixe « D224 ».
 */
export default function FormulaireVerification({ initial = "" }: { initial?: string }) {
  const router = useRouter();
  const [saisie, setSaisie] = useState(initial);
  const [erreur, setErreur] = useState<string | null>(null);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const code = normaliserCode(saisie);
        if (!code) {
          setErreur("Un code compte 12 caractères après « D224 », par exemple D224-ABCD-EFGH-JKMN.");
          return;
        }
        setErreur(null);
        router.push(`/verifier/${code}`);
      }}
      className="grid gap-2"
    >
      <label htmlFor="code-verification" className="text-[12.5px] font-bold">
        Code imprimé sous le QR
      </label>
      <div className="flex flex-wrap gap-2">
        <input
          id="code-verification"
          value={saisie}
          onChange={(e) => setSaisie(e.target.value)}
          placeholder="D224-XXXX-XXXX-XXXX"
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          className="min-h-11 min-w-0 flex-1 rounded-[11px] border border-line bg-white px-[13px] font-mono text-[14px] uppercase tracking-[0.05em] outline-none focus:border-teal"
        />
        <button
          type="submit"
          className="min-h-11 rounded-[11px] bg-teal px-4 text-[13px] font-bold text-white transition-colors hover:bg-blue"
        >
          Vérifier
        </button>
      </div>
      {erreur && (
        <p role="alert" className="text-[12px] font-semibold text-red">
          {erreur}
        </p>
      )}
    </form>
  );
}
