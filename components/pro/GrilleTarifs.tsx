"use client";

import { useState } from "react";
import { formatGNF } from "@/lib/format";
import {
  LIBELLES_LIEU,
  MAX_TARIFS,
  ajouterTarif,
  modifierTarif,
  supprimerTarif,
  useTarifsMedecin,
  type LieuTarif,
} from "@/lib/tarifs";

/*
 * Grille tarifaire éditable, partagée par l'étape « Profil médical » du
 * parcours d'inscription et par /espace-medecin/profil : le médecin doit
 * retrouver exactement le même outil des deux côtés, sinon l'un des deux
 * finit par diverger.
 *
 * Chaque ligne est écrite en base immédiatement (comme la galerie de
 * photos), ce qui rend le parcours d'inscription reprenable sans état à
 * resynchroniser.
 *
 * La PREMIÈRE ligne est le tarif de référence : c'est elle que le trigger
 * `tarifs_medecin_synchro` recopie dans `medecins.tarif_consultation`,
 * donc celle qu'affichent les cartes de résultat et le panneau de
 * réservation. L'écran le dit, sans quoi le médecin croirait que l'ordre
 * est décoratif.
 */

const CHAMP =
  "w-full rounded-xl border border-line bg-white p-[11px] text-[13px] outline-none focus:border-teal";

export default function GrilleTarifs({
  medecinId,
  mobile = false,
  onChangement,
  visiteDomicile = false,
}: {
  medecinId: string | undefined;
  mobile?: boolean;
  /** Notifie le parent après une écriture (rafraîchit le tarif affiché ailleurs). */
  onChangement?: () => void;
  /**
   * Le praticien accepte-t-il les visites à domicile ? Le sélecteur de lieu
   * n'apparaît que dans ce cas : l'imposer à un médecin qui ne se déplace
   * jamais serait un choix inutile sur chaque ligne.
   */
  visiteDomicile?: boolean;
}) {
  const { tarifs, recharger } = useTarifsMedecin(medecinId);
  const [libelle, setLibelle] = useState("");
  const [montant, setMontant] = useState("");
  const [lieu, setLieu] = useState<LieuTarif>("cabinet");
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  const complete = tarifs.length >= MAX_TARIFS;

  function apresEcriture() {
    recharger();
    onChangement?.();
  }

  async function ajouter() {
    const nom = libelle.trim();
    const prix = Number(montant);
    setErreur(null);
    if (!nom) return setErreur("Donnez un intitulé au tarif (ex. Consultation).");
    if (!montant || Number.isNaN(prix) || prix <= 0)
      return setErreur("Indiquez un montant en GNF.");
    if (complete) return setErreur(`Grille limitée à ${MAX_TARIFS} lignes.`);
    setEnCours(true);
    const res = await ajouterTarif(nom, prix, tarifs.length, visiteDomicile ? lieu : "cabinet");
    setEnCours(false);
    if (res.erreur) return setErreur(res.erreur);
    setLibelle("");
    setMontant("");
    setLieu("cabinet");
    apresEcriture();
  }

  async function changerLieu(id: string, valeur: LieuTarif) {
    const res = await modifierTarif(id, { lieu: valeur });
    if (res.erreur) return setErreur(res.erreur);
    apresEcriture();
  }

  async function renommer(id: string, valeur: string, initial: string) {
    const nom = valeur.trim();
    if (!nom || nom === initial) return;
    const res = await modifierTarif(id, { libelle: nom });
    if (res.erreur) return setErreur(res.erreur);
    apresEcriture();
  }

  async function retarifer(id: string, valeur: string, initial: number) {
    const prix = Number(valeur.replace(/\D/g, ""));
    if (!prix || prix <= 0 || prix === initial) return;
    const res = await modifierTarif(id, { montant: prix });
    if (res.erreur) return setErreur(res.erreur);
    apresEcriture();
  }

  async function retirer(id: string) {
    setErreur(null);
    const res = await supprimerTarif(id);
    if (res.erreur) return setErreur(res.erreur);
    apresEcriture();
  }

  return (
    <div className={mobile ? "" : "mt-1"}>
      {tarifs.length === 0 ? (
        <p className="text-[12.5px] text-muted">
          Aucun tarif pour le moment. Ajoutez au moins votre consultation standard.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {tarifs.map((tarif, index) => (
            <div
              key={tarif.id}
              className="rounded-[11px] border border-line px-[11px] py-[10px]"
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <input
                  className={CHAMP}
                  defaultValue={tarif.libelle}
                  aria-label={`Intitulé du tarif ${index + 1}`}
                  onBlur={(e) => renommer(tarif.id, e.target.value, tarif.libelle)}
                />
                <div className="flex items-center gap-2 sm:w-[210px] sm:flex-none">
                  <input
                    className={CHAMP}
                    inputMode="numeric"
                    defaultValue={String(tarif.montant)}
                    aria-label={`Montant du tarif ${index + 1} en GNF`}
                    onBlur={(e) => retarifer(tarif.id, e.target.value, tarif.montant)}
                  />
                  <span className="flex-none text-[12px] font-bold text-muted">GNF</span>
                  <button
                    type="button"
                    onClick={() => retirer(tarif.id)}
                    aria-label={`Retirer le tarif ${tarif.libelle}`}
                    className="flex-none text-[11.5px] font-bold text-red hover:underline"
                  >
                    Retirer
                  </button>
                </div>
              </div>
              {visiteDomicile && (
                <div className="mt-2 flex items-center gap-2">
                  <label className="text-[11.5px] font-bold text-muted" htmlFor={`lieu-${tarif.id}`}>
                    S’applique
                  </label>
                  <select
                    id={`lieu-${tarif.id}`}
                    value={tarif.lieu}
                    onChange={(e) => changerLieu(tarif.id, e.target.value as LieuTarif)}
                    className="rounded-lg border border-line bg-white px-2 py-1.5 text-[12px] font-semibold outline-none focus:border-teal"
                  >
                    {(["cabinet", "domicile", "tous"] as LieuTarif[]).map((l) => (
                      <option key={l} value={l}>
                        {LIBELLES_LIEU[l]}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <p className="mt-1.5 text-[11px] text-muted">
                {index === 0
                  ? `Tarif de référence — ${formatGNF(tarif.montant)} s’affiche sur votre fiche et dans les résultats de recherche.`
                  : formatGNF(tarif.montant)}
              </p>
            </div>
          ))}
        </div>
      )}

      {!complete && (
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input
            className={CHAMP}
            placeholder="Intitulé — ex. Consultation le dimanche"
            aria-label="Intitulé du nouveau tarif"
            value={libelle}
            onChange={(e) => setLibelle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                ajouter();
              }
            }}
          />
          <input
            className={`${CHAMP} sm:w-[150px] sm:flex-none`}
            inputMode="numeric"
            placeholder="Ex. 50000"
            aria-label="Montant du nouveau tarif en GNF"
            value={montant}
            onChange={(e) => setMontant(e.target.value.replace(/\D/g, ""))}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                ajouter();
              }
            }}
          />
          {visiteDomicile && (
            <select
              value={lieu}
              aria-label="Lieu du nouveau tarif"
              onChange={(e) => setLieu(e.target.value as LieuTarif)}
              className={`${CHAMP} sm:w-[135px] sm:flex-none`}
            >
              {(["cabinet", "domicile", "tous"] as LieuTarif[]).map((l) => (
                <option key={l} value={l}>
                  {LIBELLES_LIEU[l]}
                </option>
              ))}
            </select>
          )}
          <button
            type="button"
            onClick={ajouter}
            disabled={enCours}
            className="flex-none rounded-xl border border-[#CDE6F2] bg-teal-soft px-4 py-3 text-[13px] font-bold text-blue disabled:opacity-60 sm:py-0"
          >
            {enCours ? "Ajout…" : "+ Ajouter"}
          </button>
        </div>
      )}
      {complete && (
        <p className="mt-2 text-[12px] text-muted">
          Grille complète — retirez une ligne pour en ajouter une autre.
        </p>
      )}
      {erreur && (
        <p role="alert" className="mt-2 text-[12px] font-semibold text-red">
          {erreur}
        </p>
      )}
    </div>
  );
}
