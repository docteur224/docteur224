"use client";

import { useMemo, useRef, useState } from "react";
import { CATALOGUE_SPECIALITES } from "@/lib/catalogue-specialites";
import {
  PALETTE_EMOJIS,
  devinerEmojiSpecialite,
  estEmoji,
  normaliser,
} from "@/lib/icones-specialites";
import {
  ajouterAListeContenu,
  changerEmojiSpecialite,
  suggererEmojiSpecialite,
  useSpecialitesAdmin,
} from "@/lib/admin";

/*
 * Spécialités proposées — carte dédiée de /espace-admin/parametres.
 *
 * Les autres référentiels de l'écran (villes, assurances) se contentent de la
 * carte générique et d'une invite de saisie. Une spécialité, elle, porte une
 * icône affichée sur l'accueil : il faut donc la montrer, la deviner à la
 * saisie, et laisser l'admin la corriger. D'où cette carte à part.
 *
 * La saisie reste libre — le catalogue n'est qu'une aide, aucune plateforme
 * ne peut prévoir tous les services qu'un établissement voudra référencer.
 * Les spécialités déjà ouvertes disparaissent des suggestions : les reproposer
 * ne mènerait qu'à un doublon refusé par la contrainte d'unicité.
 */

const SUGGESTIONS_AFFICHEES = 8;

/** Palette d'icônes, en survol d'un bouton. Sert à l'ajout comme à la retouche. */
function ChoixEmoji({
  valeur,
  onChoisir,
  onFermer,
}: {
  valeur: string;
  onChoisir: (emoji: string) => void;
  onFermer: () => void;
}) {
  const [libre, setLibre] = useState("");

  return (
    <div className="absolute left-0 top-full z-30 mt-1 w-[300px] rounded-xl border border-line bg-white p-3 shadow-[0_10px_26px_rgba(16,59,80,.14)]">
      <div className="mb-2 grid grid-cols-8 gap-1">
        {PALETTE_EMOJIS.map((emoji) => (
          <button
            key={emoji}
            type="button"
            onClick={() => onChoisir(emoji)}
            aria-label={`Choisir ${emoji}`}
            className={`rounded-lg py-1 text-lg transition-colors hover:bg-teal-soft ${
              emoji === valeur ? "bg-teal-soft" : ""
            }`}
          >
            {emoji}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          value={libre}
          onChange={(e) => setLibre(e.target.value)}
          placeholder="Autre emoji…"
          aria-label="Autre emoji"
          className="w-full rounded-[9px] border border-line px-2.5 py-1.5 text-[13px] outline-none focus:border-teal"
        />
        <button
          type="button"
          disabled={!estEmoji(libre)}
          onClick={() => onChoisir(libre.trim())}
          className="rounded-[9px] border border-line px-2.5 py-1.5 text-xs font-bold text-blue disabled:opacity-40"
        >
          OK
        </button>
        <button
          type="button"
          onClick={onFermer}
          className="rounded-[9px] px-2 py-1.5 text-xs font-bold text-muted"
        >
          Fermer
        </button>
      </div>
    </div>
  );
}

export default function SpecialitesProposees() {
  const { specialites, recharger } = useSpecialitesAdmin();
  const [ouvert, setOuvert] = useState(false);
  const [nom, setNom] = useState("");
  const [emoji, setEmoji] = useState("");
  // `auto` distingue l'icône déduite du nom de celle que l'admin a imposée :
  // une fois qu'il a choisi, plus rien ne doit la remplacer sous ses doigts.
  const [auto, setAuto] = useState(true);
  const [paletteOuverte, setPaletteOuverte] = useState(false);
  const [retouche, setRetouche] = useState<string | null>(null);
  const [chargement, setChargement] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const champ = useRef<HTMLInputElement>(null);

  const dejaOuvertes = useMemo(
    () => new Set(specialites.map((s) => normaliser(s.nom))),
    [specialites]
  );

  const suggestions = useMemo(() => {
    const saisie = normaliser(nom.trim());
    return CATALOGUE_SPECIALITES.filter(
      (s) => !dejaOuvertes.has(normaliser(s)) && (!saisie || normaliser(s).includes(saisie))
    ).slice(0, SUGGESTIONS_AFFICHEES);
  }, [nom, dejaOuvertes]);

  const doublon = nom.trim() !== "" && dejaOuvertes.has(normaliser(nom.trim()));

  function saisir(valeur: string) {
    setNom(valeur);
    setErreur(null);
    // Tant que l'admin n'a rien imposé, l'icône suit le nom au fil de la frappe.
    if (auto) setEmoji(devinerEmojiSpecialite(valeur) ?? "");
  }

  function imposerEmoji(choisi: string) {
    setEmoji(choisi);
    setAuto(false);
    setPaletteOuverte(false);
  }

  /** Complète l'icône via la route serveur si le dictionnaire a séché. */
  async function completerIcone(valeur: string) {
    if (!auto || !valeur.trim() || devinerEmojiSpecialite(valeur)) return;
    setChargement(true);
    const propose = await suggererEmojiSpecialite(valeur.trim());
    setChargement(false);
    // L'admin a pu choisir son icône pendant l'appel : sa décision prime.
    setEmoji((actuel) => (actuel ? actuel : propose));
  }

  function reinitialiser() {
    setNom("");
    setEmoji("");
    setAuto(true);
    setPaletteOuverte(false);
    setErreur(null);
  }

  async function ajouter() {
    const valeur = nom.trim();
    if (!valeur) return setErreur("Saisissez ou choisissez une spécialité.");
    if (doublon) return setErreur("Cette spécialité est déjà proposée.");

    setChargement(true);
    // Une icône vide signifie « pas encore résolue » : on la demande avant
    // d'écrire, plutôt que de laisser la colonne à NULL comme avant.
    const icone = emoji || (await suggererEmojiSpecialite(valeur));
    const { erreur: refus } = await ajouterAListeContenu("specialites", valeur, icone);
    setChargement(false);
    if (refus) return setErreur(refus);
    reinitialiser();
    setOuvert(false);
    recharger();
    champ.current?.blur();
  }

  async function corriger(id: string, nomSpecialite: string, choisi: string) {
    setRetouche(null);
    setErreur(null);
    const { erreur: refus } = await changerEmojiSpecialite(id, nomSpecialite, choisi);
    if (refus) return setErreur(refus);
    recharger();
  }

  const contenu = (
    <>
      <div className="flex flex-wrap gap-2">
        {specialites.map((specialite) => (
          <span key={specialite.id} className="relative">
            <button
              type="button"
              title="Changer l’icône"
              onClick={() => setRetouche(retouche === specialite.id ? null : specialite.id)}
              className="rounded-full border border-[#CDE6F2] bg-teal-soft px-[14px] py-2 text-xs font-bold text-blue transition-colors hover:border-teal"
            >
              <span aria-hidden className="mr-1">
                {specialite.emoji}
              </span>
              {specialite.nom}
            </button>
            {retouche === specialite.id && (
              <ChoixEmoji
                valeur={specialite.emoji}
                onChoisir={(choisi) => corriger(specialite.id, specialite.nom, choisi)}
                onFermer={() => setRetouche(null)}
              />
            )}
          </span>
        ))}
        {!ouvert && (
          <button
            type="button"
            onClick={() => setOuvert(true)}
            className="rounded-full border border-[#DCE4EA] bg-[#EEF2F5] px-[14px] py-2 text-xs font-bold text-[#3A4A55] transition-colors hover:bg-bg"
          >
            + Ajouter
          </button>
        )}
      </div>

      {ouvert && (
        <div className="mt-3 rounded-xl border border-line bg-bg p-3">
          <div className="flex flex-wrap items-start gap-2">
            {/* Aperçu de l'icône : exactement ce que verra le patient. */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setPaletteOuverte(!paletteOuverte)}
                title="Choisir l’icône"
                aria-label="Choisir l’icône"
                className="h-[42px] w-[52px] rounded-[11px] border border-line bg-white text-xl transition-colors hover:border-teal"
              >
                {emoji || (chargement ? "…" : "❓")}
              </button>
              {paletteOuverte && (
                <ChoixEmoji
                  valeur={emoji}
                  onChoisir={imposerEmoji}
                  onFermer={() => setPaletteOuverte(false)}
                />
              )}
            </div>

            <div className="relative min-w-[240px] flex-1">
              <input
                ref={champ}
                value={nom}
                onChange={(e) => saisir(e.target.value)}
                onBlur={() => completerIcone(nom)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    ajouter();
                  } else if (e.key === "Escape") {
                    reinitialiser();
                    setOuvert(false);
                  }
                }}
                autoComplete="off"
                placeholder="Choisissez dans la liste ou saisissez une spécialité"
                aria-label="Spécialité à ajouter"
                className="w-full rounded-[11px] border border-line bg-white px-[13px] py-2.5 text-[13px] outline-none focus:border-teal"
              />
              {suggestions.length > 0 && (
                <ul className="absolute left-0 right-0 top-full z-20 mt-1 max-h-[280px] overflow-auto rounded-xl border border-line bg-white py-1 shadow-[0_10px_26px_rgba(16,59,80,.14)]">
                  {suggestions.map((suggestion) => (
                    <li key={suggestion}>
                      <button
                        type="button"
                        // mousedown : le clic doit être pris en compte avant
                        // que le champ ne perde le focus et ne referme la liste.
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          saisir(suggestion);
                          completerIcone(suggestion);
                          champ.current?.focus();
                        }}
                        className="flex w-full items-center gap-2 px-[14px] py-2 text-left text-[13px] text-ink transition-colors hover:bg-teal-soft"
                      >
                        <span aria-hidden>{devinerEmojiSpecialite(suggestion) ?? "⚕️"}</span>
                        {suggestion}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <button
              type="button"
              onClick={ajouter}
              disabled={chargement || !nom.trim() || doublon}
              className="rounded-[11px] bg-blue px-[16px] py-2.5 text-[13px] font-bold text-white transition-opacity disabled:opacity-40"
            >
              {chargement ? "…" : "Ajouter"}
            </button>
            <button
              type="button"
              onClick={() => {
                reinitialiser();
                setOuvert(false);
              }}
              className="rounded-[11px] border border-line bg-white px-[14px] py-2.5 text-[13px] font-bold text-muted"
            >
              Annuler
            </button>
          </div>

          {doublon && (
            <p className="mt-2 text-[12.5px] font-semibold text-red">
              « {nom.trim()} » est déjà proposée.
            </p>
          )}
        </div>
      )}

      {erreur && (
        <p role="alert" className="mt-2 text-[12.5px] font-semibold text-red">
          {erreur}
        </p>
      )}
    </>
  );

  return (
    <>
      {/* Variante mobile : carte .card2 de la maquette */}
      <div className="card2 md:hidden">
        <h4>Spécialités proposées</h4>
        {contenu}
      </div>

      <div className="mb-4 hidden rounded-2xl border border-line bg-white p-5 md:block">
        <h3 className="mb-1 text-[15px] font-extrabold">Spécialités proposées</h3>
        <p className="mb-3 text-[12.5px] text-muted">
          L’icône est déduite du nom, et reste modifiable : touchez une spécialité pour la
          changer.
        </p>
        {contenu}
      </div>
    </>
  );
}
