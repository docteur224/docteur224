"use client";

import { useState } from "react";
import EtablissementShell from "@/components/etablissement/EtablissementShell";
import {
  ETABLISSEMENT_VIDE,
  enregistrerInformationsEtablissement,
  useEtablissementConnecte,
  type InformationsEtablissement,
} from "@/lib/etablissement";
import EnTeteMobile from "@/components/mobile/EnTeteMobile";
import GaleriePhotos from "@/components/pro/GaleriePhotos";
import PhotoProfil from "@/components/pro/PhotoProfil";
import ChampTelephoneGN from "@/components/site/ChampTelephoneGN";
import { chiffresTelephone, telephoneGuineenValide, versTelephoneInternational } from "@/lib/telephone";

/*
 * Informations — la fiche publique de l'établissement, telle que les
 * patients la voient.
 *
 * AUDIT : cet écran ne servait à rien. Chaque champ était un <div> figé
 * sous un bandeau « Champs de démonstration — la modification de la fiche
 * sera possible quand la base de données sera branchée », alors que la
 * base l'était depuis longtemps : `enregistrerInformationsEtablissement()`
 * existait, inutilisée, et la policy `upd_etablissements` autorise le
 * gestionnaire depuis la migration 0002. Un établissement qui déménageait
 * ou changeait de numéro ne pouvait donc rien corriger.
 *
 * Deux champs restent en lecture, et pour de bonnes raisons :
 *
 *   · le TYPE fixe le palier facturé (lib/abonnement-inscription) —
 *     le laisser modifiable, c'était laisser un CHU se déclarer « Poste
 *     de santé ». La migration 0054 pose d'ailleurs le verrou côté base,
 *     pour que la règle tienne aussi hors de cet écran ;
 *   · la VILLE est une relation (`ville_id`) qui pilote la recherche et
 *     la carte ; elle se change avec l'admin, comme pour un médecin.
 *
 * Le bouton « Changer le logo » a disparu : il était `disabled` avec
 * l'infobulle « Disponible avec le stockage de fichiers », juste
 * au-dessus du bloc « Photo de l'établissement » qui fait exactement ça
 * — et qui marche (route /api/photo-medecin, côté établissement).
 */

const CHAMP =
  "w-full rounded-[11px] border border-line bg-white px-[13px] py-3 text-[13.5px] outline-none focus:border-teal";
const CHAMP_FIGE =
  "rounded-[11px] border border-line bg-bg px-[13px] py-3 text-[13.5px] text-muted";
const LABEL = "mb-1.5 block text-xs font-bold text-muted";

/** Les champs du formulaire, sous la forme où on les édite. */
type Brouillon = InformationsEtablissement;

const brouillonDepuis = (e: typeof ETABLISSEMENT_VIDE): Brouillon => ({
  nom: e.nom,
  type: e.type,
  description: e.description,
  adresse: e.adresseRue,
  quartier: e.quartier,
  // Le champ saisit 9 chiffres ; la base garde la forme internationale.
  telephone: chiffresTelephone(e.telephone),
  email: e.email,
  siteWeb: e.siteWeb,
  rccm: e.rccm,
});

export default function InformationsEtablissement() {
  const { etablissement, chargement, recharger } = useEtablissementConnecte();
  const etab = etablissement ?? ETABLISSEMENT_VIDE;

  /*
   * La saisie en cours ne vit que tant que la fiche du serveur n'a pas
   * bougé — même idiome que PhotoProfil et que l'ancien champ RCCM. Le
   * formulaire se remplit donc tout seul quand la fiche arrive, et se
   * recale après chaque enregistrement, sans effet de synchronisation
   * (qui écraserait une frappe et provoquerait un rendu en cascade).
   */
  const [saisie, setSaisie] = useState<{ depuis: string; valeurs: Brouillon } | null>(null);
  const [enregistrement, setEnregistrement] = useState(false);
  const [message, setMessage] = useState<{ texte: string; erreur: boolean } | null>(null);

  const serveur = brouillonDepuis(etab);
  const referenceServeur = JSON.stringify(serveur);
  const v = saisie?.depuis === referenceServeur ? saisie.valeurs : serveur;

  const modifier = <C extends keyof Brouillon>(cle: C, valeur: Brouillon[C]) => {
    setMessage(null);
    setSaisie({ depuis: referenceServeur, valeurs: { ...v, [cle]: valeur } });
  };

  const telephoneInvalide = v.telephone !== "" && !telephoneGuineenValide(v.telephone);
  const emailInvalide = v.email !== "" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email);
  const nomVide = v.nom.trim() === "";
  const modifie = etablissement !== null && JSON.stringify(v) !== referenceServeur;
  const bloque = nomVide || telephoneInvalide || emailInvalide;

  async function enregistrer(e: React.FormEvent) {
    e.preventDefault();
    if (!etablissement || bloque) return;
    setEnregistrement(true);
    const res = await enregistrerInformationsEtablissement(etablissement.id, {
      nom: v.nom.trim(),
      description: v.description.trim(),
      adresse: v.adresse.trim(),
      quartier: v.quartier.trim(),
      // Chaîne vide plutôt que numéro tronqué : un « 622 00 » à moitié
      // saisi ne doit pas se retrouver sur la fiche publique.
      telephone: versTelephoneInternational(v.telephone),
      email: v.email.trim(),
      siteWeb: v.siteWeb.trim(),
      rccm: v.rccm.trim(),
    });
    setEnregistrement(false);
    setMessage({ texte: res.erreur ?? "Fiche enregistrée.", erreur: Boolean(res.erreur) });
    if (!res.erreur) recharger();
  }

  if (!chargement && !etablissement) {
    return (
      <EtablissementShell>
        <div className="md:hidden">
          <EnTeteMobile variante="marque" />
        </div>
        <div className="pad md:p-0">
          <div className="rounded-2xl border border-line bg-white p-6 text-center text-[13px] text-muted">
            Ce compte n’est gestionnaire d’aucun établissement : il n’y a pas de fiche à modifier.
          </div>
        </div>
      </EtablissementShell>
    );
  }

  /* Le formulaire, partagé par les deux mises en page. */
  const champs = (prefixe: string) => (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <label className={LABEL} htmlFor={`${prefixe}-nom`}>
          Nom de l’établissement
        </label>
        <input
          id={`${prefixe}-nom`}
          className={CHAMP}
          value={v.nom}
          onChange={(e) => modifier("nom", e.target.value)}
          aria-invalid={nomVide || undefined}
        />
        {nomVide && (
          <p className="mt-1.5 text-[11.5px] font-bold text-[#C0392B]">
            Le nom ne peut pas être vide.
          </p>
        )}
      </div>

      <div>
        <label className={LABEL}>Type</label>
        <div className={CHAMP_FIGE}>{v.type || "—"}</div>
        <p className="mt-1.5 text-[11.5px] text-muted">
          Le type détermine le palier d’abonnement : sa modification passe par l’administration
          de la plateforme.
        </p>
      </div>

      <div>
        <label className={LABEL} htmlFor={`${prefixe}-rccm`}>
          RCCM
        </label>
        <input
          id={`${prefixe}-rccm`}
          className={CHAMP}
          placeholder="Ex. GC-KAL/123.456A/2021"
          value={v.rccm}
          onChange={(e) => modifier("rccm", e.target.value)}
        />
        <p className="mt-1.5 text-[11.5px] text-muted">
          Registre du Commerce et du Crédit Mobilier.
        </p>
      </div>

      <div className="sm:col-span-2">
        <label className={LABEL} htmlFor={`${prefixe}-description`}>
          Description
        </label>
        <textarea
          id={`${prefixe}-description`}
          className={`${CHAMP} min-h-[90px] resize-y`}
          placeholder="Ce que les patients doivent savoir de votre établissement."
          value={v.description}
          onChange={(e) => modifier("description", e.target.value)}
        />
      </div>

      <div>
        <label className={LABEL} htmlFor={`${prefixe}-adresse`}>
          Adresse
        </label>
        <input
          id={`${prefixe}-adresse`}
          className={CHAMP}
          placeholder="Rue, immeuble, repère"
          value={v.adresse}
          onChange={(e) => modifier("adresse", e.target.value)}
        />
      </div>

      <div>
        <label className={LABEL} htmlFor={`${prefixe}-quartier`}>
          Quartier
        </label>
        <input
          id={`${prefixe}-quartier`}
          className={CHAMP}
          value={v.quartier}
          onChange={(e) => modifier("quartier", e.target.value)}
        />
      </div>

      <div className="sm:col-span-2">
        <label className={LABEL}>Ville</label>
        <div className={CHAMP_FIGE}>{etab.ville || "—"}</div>
        <p className="mt-1.5 text-[11.5px] text-muted">
          La ville sert à la recherche et à la carte : elle se change avec l’administration.
        </p>
      </div>

      <div>
        <label className={LABEL}>Téléphone</label>
        <ChampTelephoneGN
          valeur={v.telephone}
          onChange={(chiffres) => modifier("telephone", chiffres)}
          ariaLabel="Téléphone de l'établissement"
        />
      </div>

      <div>
        <label className={LABEL} htmlFor={`${prefixe}-email`}>
          E-mail
        </label>
        <input
          id={`${prefixe}-email`}
          type="email"
          className={CHAMP}
          value={v.email}
          onChange={(e) => modifier("email", e.target.value)}
          aria-invalid={emailInvalide || undefined}
        />
        {emailInvalide && (
          <p className="mt-1.5 text-[11.5px] font-bold text-[#C0392B]">
            Adresse e-mail incomplète.
          </p>
        )}
      </div>

      <div className="sm:col-span-2">
        <label className={LABEL} htmlFor={`${prefixe}-site`}>
          Site web
        </label>
        <input
          id={`${prefixe}-site`}
          className={CHAMP}
          placeholder="https://…"
          value={v.siteWeb}
          onChange={(e) => modifier("siteWeb", e.target.value)}
        />
      </div>
    </div>
  );

  const pied = (
    <div className="mt-4 flex flex-wrap items-center gap-3">
      <button
        type="submit"
        disabled={enregistrement || bloque || !modifie}
        className="rounded-[9px] bg-teal px-[18px] py-2.5 text-[12.5px] font-bold text-white transition-colors hover:bg-[#2790bc] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {enregistrement ? "Enregistrement…" : "Enregistrer les modifications"}
      </button>
      {modifie && !enregistrement && (
        <button
          type="button"
          onClick={() => {
            setMessage(null);
            setSaisie(null);
          }}
          className="rounded-[9px] border-[1.5px] border-line bg-white px-[14px] py-2.5 text-[12.5px] font-bold text-muted"
        >
          Annuler
        </button>
      )}
      {message && (
        <span
          role="status"
          className={`text-[12.5px] font-bold ${message.erreur ? "text-[#C0392B]" : "text-green"}`}
        >
          {message.erreur ? "⚠️ " : "✓ "}
          {message.texte}
        </span>
      )}
    </div>
  );

  return (
    <EtablissementShell>
      {/* ===== Version mobile (écran « m-etab-infos » de la maquette mobile) ===== */}
      <div className="md:hidden">
        <EnTeteMobile variante="marque" />
        <div className="appbar">
          <h3 style={{ paddingLeft: 4 }}>Informations</h3>
        </div>
        <div className="pad">
          <form onSubmit={enregistrer} className="card2">
            <h4>Fiche publique</h4>
            {champs("m")}
            {pied}
          </form>
          <div className="card2">
            <h4>Coordonnées enregistrées</h4>
            <div style={{ display: "flex", gap: 9, flexWrap: "wrap" }}>
              <a
                className="btn small"
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(etab.adresse)}`}
                target="_blank"
                rel="noopener"
              >
                🧭 Itinéraire
              </a>
              {/* Ces deux liens partaient vers « tel: » et une carte même
                  quand la fiche n'avait ni numéro ni adresse : le premier
                  ouvrait le composeur à vide, le second cherchait "". */}
              {etab.telephone && (
                <a className="btn ghost small" href={`tel:${etab.telephone.replace(/\s/g, "")}`}>
                  📞 Appeler
                </a>
              )}
              {etab.siteWeb && (
                <a className="btn ghost small" href={etab.siteWeb} target="_blank" rel="noopener">
                  🌐 Site web
                </a>
              )}
            </div>
          </div>
          <div className="card2">
            <h4>📸 Photo de l&apos;établissement</h4>
            <PhotoProfil
              photoUrl={etab.photoUrl}
              initiales={(etab.nomCourt || etab.nom || "?").slice(0, 2).toUpperCase()}
              gradient={etab.gradient}
              taille={80}
              onChangement={recharger}
            />
          </div>
          <div className="card2">
            <h4>🖼️ Photos de l&apos;établissement</h4>
            <GaleriePhotos proprietaireId={etab.id || undefined} type="etablissement" mobile />
          </div>
        </div>
      </div>

      {/* ===== Version web ===== */}
      <div className="hidden md:block">
        <div className="mb-5">
          <h2 className="text-[21px] font-extrabold tracking-[-0.3px]">Informations</h2>
          <small className="text-[13px] text-muted">
            La fiche de votre établissement telle que les patients la voient
          </small>
        </div>

        <form onSubmit={enregistrer} className="mb-4 rounded-2xl border border-line bg-white p-5">
          <div className="mb-5 flex items-center gap-4">
            <span
              aria-hidden
              className="grid h-[72px] w-[72px] flex-none place-items-center overflow-hidden rounded-[20px] text-2xl text-white"
              style={{ background: etab.gradient }}
            >
              {etab.photoUrl ? (
                // URL Cloudinary déjà redimensionnée à l'envoi (400×400),
                // comme dans PhotoProfil : next/image n'apporterait rien.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={etab.photoUrl}
                  alt=""
                  className="h-full w-full object-cover"
                  width={72}
                  height={72}
                />
              ) : (
                "🏥"
              )}
            </span>
            <div>
              <b className="block text-base font-extrabold">{etab.nom}</b>
              <div className="text-[12.5px] text-muted">
                {etab.type}
                {etab.statut === "valide" ? " · Établissement vérifié ✔" : " · En cours de validation"}
              </div>
              <p className="mt-1 text-[11.5px] text-muted">
                La photo se change dans « Photo de l’établissement », plus bas.
              </p>
            </div>
          </div>
          {champs("w")}
          {pied}
        </form>

        <div className="mb-4 rounded-2xl border border-line bg-white p-5">
          <h3 className="mb-1 text-[15px] font-extrabold">📸 Photo de l’établissement</h3>
          <p className="mb-3 text-[12.5px] text-muted">
            Elle illustre votre fiche dans les résultats de recherche.
          </p>
          <PhotoProfil
            photoUrl={etab.photoUrl}
            initiales={(etab.nomCourt || etab.nom || "?").slice(0, 2).toUpperCase()}
            gradient={etab.gradient}
            taille={96}
            onChangement={recharger}
          />
        </div>

        <div className="rounded-2xl border border-line bg-white p-5">
          <h3 className="mb-1 text-[15px] font-extrabold">🖼️ Photos de l’établissement</h3>
          <GaleriePhotos proprietaireId={etab.id || undefined} type="etablissement" />
        </div>
      </div>
    </EtablissementShell>
  );
}
