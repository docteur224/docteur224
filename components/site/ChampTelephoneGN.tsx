"use client";

import {
  MESSAGE_TELEPHONE_GN,
  chiffresTelephone,
  formaterTelephoneGN,
  telephoneGuineenValide,
} from "@/lib/telephone";

/*
 * Saisie d'un numéro guinéen : indicatif +224 figé à gauche, saisie
 * groupée « 6XX XX XX XX », et refus de tout ce qui n'est pas un mobile
 * guinéen (9 chiffres commençant par 6).
 *
 * La valeur remontée est celle des CHIFFRES (« 622000000 ») et non celle
 * affichée : le formatage est un habillage, la base ne doit pas voir
 * d'espaces.
 */

const CHAMP_WEB =
  "w-full rounded-xl border border-line bg-white p-[14px] text-sm outline-none focus:border-teal";

export default function ChampTelephoneGN({
  valeur,
  onChange,
  ariaLabel = "Numéro de téléphone",
  mobile = false,
  /** Affiche le message d'erreur dès que la saisie est incomplète. */
  montrerErreur = false,
}: {
  valeur: string;
  onChange: (chiffres: string) => void;
  ariaLabel?: string;
  mobile?: boolean;
  montrerErreur?: boolean;
}) {
  const chiffres = chiffresTelephone(valeur);
  const invalide = chiffres.length > 0 && !telephoneGuineenValide(chiffres);
  const afficherErreur = montrerErreur ? chiffres.length > 0 && invalide : invalide;

  const champ = (
    <input
      className={mobile ? "inp" : CHAMP_WEB}
      style={mobile ? { marginBottom: 0 } : undefined}
      placeholder="6XX XX XX XX"
      inputMode="numeric"
      autoComplete="tel-national"
      aria-label={ariaLabel}
      aria-invalid={afficherErreur || undefined}
      value={formaterTelephoneGN(chiffres)}
      onChange={(e) => onChange(chiffresTelephone(e.target.value))}
    />
  );

  return (
    <>
      {mobile ? (
        <div className="phone-inp">
          <span className="cc">🇬🇳 +224</span>
          {champ}
        </div>
      ) : (
        <div className="mb-3 flex gap-2">
          <span className="flex flex-none items-center gap-1.5 whitespace-nowrap rounded-xl border border-line bg-[#F4F8FA] px-[13px] text-sm font-bold">
            🇬🇳 +224
          </span>
          {champ}
        </div>
      )}
      {afficherErreur && (
        <p
          role="alert"
          className={`text-[11.5px] font-semibold text-red ${mobile ? "mb-2" : "-mt-1.5 mb-2"}`}
        >
          {MESSAGE_TELEPHONE_GN}
        </p>
      )}
    </>
  );
}
