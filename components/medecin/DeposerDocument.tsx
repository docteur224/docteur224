"use client";

import { useEffect, useRef, useState } from "react";
import ChampsCertificat, { champsInitiaux, texteModele, type BaseModele } from "@/components/medecin/ordonnance/ChampsCertificat";
import EditeurPrescription, { compterAlertes } from "@/components/medecin/ordonnance/EditeurPrescription";
import SignatureElectronique from "@/components/medecin/SignatureElectronique";
import Icone from "@/components/site/Icone";
import {
  corrigerDocument,
  deposerDocument,
  genererPdf,
  libelleType,
  titreOrdonnanceDuJour,
  TYPES_DOCUMENT,
  type DocumentPatient,
  type TypeDocument,
} from "@/lib/documents";
import { useSignature } from "@/lib/medicaments";
import { LIGNE_VIDE, ligneRemplie, problemePrescription, texteOrdonnance, type LignePrescription } from "@/lib/prescription";

/*
 * Remise (ou correction) d'un document, depuis l'espace médecin.
 *
 * Deux façons de produire la pièce jointe :
 *  - « Générer » (défaut) : le serveur compose un PDF à l'en-tête du
 *    praticien, avec sa signature électronique et un code + QR de
 *    vérification (migration 0065). Selon le type :
 *      · ordonnance → éditeur structuré (médicaments de la base, posologie,
 *        durée, quantité), modèles réutilisables, alerte allergie ;
 *      · certificat, arrêt de travail → modèle pré-rempli, texte modifiable ;
 *      · autres → texte libre ;
 *  - « Joindre un fichier » : un PDF ou une image déjà produits ailleurs —
 *    sans QR : on ne certifie pas une pièce qu'on n'a pas composée.
 *
 * Feuille plein écran en dessous de md, carte centrée au-dessus.
 *
 * Corriger ne réécrit pas la ligne : la base crée une version suivante, avec
 * son PROPRE code de vérification — le QR de la précédente répondra
 * désormais « corrigé ».
 */

type Mode = "generer" | "fichier";

const VIDE = { type: "ordonnance" as TypeDocument, titre: "", contenu: "" };

/** Une pièce rédigée en clair se recompose ; un scan se remplace. */
const modeInitial = (doc?: DocumentPatient): Mode => (!doc ? "generer" : doc.contenu ? "generer" : "fichier");

/** Les remarques d'une ordonnance structurée vivent en fin de texte. */
const remarquesDe = (contenu: string | null) => contenu?.match(/\n?\n?Remarques : ([\s\S]*)$/)?.[1]?.trim() ?? "";

const estCertificat = (t: TypeDocument): t is "certificat" | "arret_travail" =>
  t === "certificat" || t === "arret_travail";

/** « Ordonnance remise », « Certificat remis »… */
function confirmation(type: TypeDocument, nomPatient: string): string {
  const feminin = type === "ordonnance";
  return `${libelleType(type)} remis${feminin ? "e" : ""} à ${nomPatient}`;
}

export default function DeposerDocument({
  cle,
  nomPatient,
  patient,
  medecin,
  document: aModifier,
  declencheur,
  classeDeclencheur,
  apres,
}: {
  /** « c-<uuid> » ou « p-<uuid> », tel que fourni par la liste des patients. */
  cle: string;
  nomPatient: string;
  /** Ce que l'ordonnance et les certificats ont besoin de savoir du patient. */
  patient?: { allergies: string[]; naissance: string | null; genre: string | null };
  /** Le praticien, pour pré-remplir les certificats. */
  medecin?: { nom: string; specialite: string } | null;
  /** Fourni = correction d'un document existant plutôt que nouveau dépôt. */
  document?: DocumentPatient;
  declencheur?: string;
  classeDeclencheur?: string;
  apres?: (message: string) => void;
}) {
  const enCorrection = !!aModifier;
  const [ouvert, setOuvert] = useState(false);
  const [mode, setMode] = useState<Mode>(modeInitial(aModifier));
  const [champs, setChamps] = useState(VIDE);
  const [lignes, setLignes] = useState<LignePrescription[]>([{ ...LIGNE_VIDE }]);
  const [remarques, setRemarques] = useState("");
  const [confirmationAllergie, setConfirmationAllergie] = useState(false);
  const [remplacerFichier, setRemplacerFichier] = useState(false);
  const [enCours, setEnCours] = useState(false);
  const [apercuEnCours, setApercuEnCours] = useState(false);
  const [message, setMessage] = useState<{ texte: string; erreur: boolean } | null>(null);
  const [revisionSignature, setRevisionSignature] = useState(0);
  const [signatureOuverte, setSignatureOuverte] = useState(false);
  const { signature } = useSignature(revisionSignature);
  const fichierRef = useRef<HTMLInputElement>(null);

  const [prefixe, id] = [cle.slice(0, 1), cle.slice(2)];
  const destinataire = prefixe === "c" ? { patientId: id } : { procheId: id };
  const allergies = patient?.allergies ?? [];

  /* Ordonnance structurée — sauf pour corriger une ordonnance d'avant, tapée
     en texte libre : elle se corrige comme elle a été écrite. */
  const ancienneLibre = enCorrection && !aModifier?.prescription?.length && !!aModifier?.contenu;
  const structuree = mode === "generer" && champs.type === "ordonnance" && !ancienneLibre;

  /* Une ordonnance ne se titre plus à la main : « Ordonnance du JJ/MM/AAAA ». */
  const titreAuto = champs.type === "ordonnance";
  const titre = titreAuto ? titreOrdonnanceDuJour() : champs.titre;
  const contenu = structuree ? texteOrdonnance(lignes, remarques) : champs.contenu;

  const probleme = structuree ? problemePrescription(lignes) : null;
  const nbAlertes = structuree ? compterAlertes(lignes, allergies) : 0;
  const valide =
    titre.trim() !== "" &&
    (mode === "generer" ? (structuree ? probleme === null : contenu.trim() !== "") : true) &&
    (nbAlertes === 0 || confirmationAllergie);

  const baseModele: BaseModele = {
    medecin: medecin?.nom ?? "Le médecin",
    specialite: medecin?.specialite ?? "",
    patient: nomPatient,
    naissance: patient?.naissance ?? null,
    genre: patient?.genre ?? null,
  };

  // Échap referme, comme tout dialogue.
  useEffect(() => {
    if (!ouvert) return;
    const surTouche = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOuvert(false);
    };
    window.addEventListener("keydown", surTouche);
    return () => window.removeEventListener("keydown", surTouche);
  }, [ouvert]);

  function ouvrir() {
    setChamps(
      aModifier
        ? { type: aModifier.type as TypeDocument, titre: aModifier.titre, contenu: aModifier.contenu ?? "" }
        : VIDE
    );
    setLignes(
      aModifier?.prescription?.length ? aModifier.prescription.map((l) => ({ ...LIGNE_VIDE, ...l })) : [{ ...LIGNE_VIDE }]
    );
    setRemarques(aModifier?.prescription?.length ? remarquesDe(aModifier.contenu) : "");
    setConfirmationAllergie(false);
    setMode(modeInitial(aModifier));
    setRemplacerFichier(false);
    setSignatureOuverte(false);
    setMessage(null);
    if (fichierRef.current) fichierRef.current.value = "";
    setOuvert(true);
  }

  function fermer() {
    setOuvert(false);
    setMessage(null);
    if (fichierRef.current) fichierRef.current.value = "";
  }

  function changerMode(nouveau: Mode) {
    setMode(nouveau);
    setMessage(null);
    if (nouveau === "generer" && fichierRef.current) fichierRef.current.value = "";
  }

  function changerType(type: TypeDocument) {
    // Un certificat ou un arrêt de travail part de son modèle, pré-rempli.
    if (estCertificat(type)) {
      const { titre: t, texte } = texteModele(baseModele, champsInitiaux(type));
      setChamps({ type, titre: t, contenu: texte });
    } else {
      setChamps({ ...champs, type, titre: champs.type === type ? champs.titre : "" });
    }
    setMessage(null);
  }

  /** Ouvre le PDF composé sans rien enregistrer : le médecin se relit. */
  async function apercu() {
    if (!valide || apercuEnCours) return;
    // L'onglet est ouvert AVANT l'attente réseau : ouvert après, le navigateur
    // le prendrait pour une fenêtre surgissante et le bloquerait.
    const onglet = window.open("", "_blank", "noopener");
    setApercuEnCours(true);
    const res = await genererPdf({ ...destinataire, type: champs.type, titre, contenu }, "apercu");
    setApercuEnCours(false);
    if (res.erreur || !res.fichier) {
      onglet?.close();
      setMessage({ texte: res.erreur ?? "Aperçu impossible.", erreur: true });
      return;
    }
    const url = URL.createObjectURL(res.fichier);
    if (onglet) onglet.location.href = url;
    else window.open(url, "_blank", "noopener");
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  async function envoyer() {
    if (!valide || enCours) return;
    setEnCours(true);

    let fichier: File | null = fichierRef.current?.files?.[0] ?? null;
    let code: string | null = null;
    if (mode === "generer") {
      // Mode « final » : le serveur tire le code de vérification et l'imprime.
      const res = await genererPdf({ ...destinataire, type: champs.type, titre, contenu }, "final");
      if (res.erreur || !res.fichier) {
        setEnCours(false);
        setMessage({ texte: res.erreur ?? "Génération impossible.", erreur: true });
        return;
      }
      fichier = res.fichier;
      code = res.code ?? null;
    }
    const prescription = structuree ? lignes.filter(ligneRemplie) : null;

    const res = aModifier
      ? await corrigerDocument(aModifier.id, {
          titre,
          contenu,
          fichier,
          // Sans nouveau fichier, la version reprend celui de la précédente :
          // l'ancien n'est PAS retiré du bucket, il appartient maintenant à
          // la v(n-1), qu'on doit pouvoir rouvrir.
          fichierActuel: aModifier.fichierPath,
          fichierNomActuel: aModifier.fichierNom,
          prescription,
          codeVerification: code,
        })
      : await deposerDocument({
          ...destinataire,
          type: champs.type,
          titre,
          contenu,
          fichier,
          origine: "medecin",
          prescription,
          codeVerification: code,
        });

    setEnCours(false);
    if (res.erreur) {
      setMessage({ texte: res.erreur, erreur: true });
      return;
    }
    if (fichierRef.current) fichierRef.current.value = "";
    if (enCorrection) {
      const version = (aModifier?.version ?? 1) + 1;
      const texte = `Version ${version} créée — la précédente reste au dossier`;
      setMessage({ texte, erreur: false });
      apres?.(texte);
      return;
    }
    const texte = confirmation(champs.type, nomPatient);
    setChamps(VIDE);
    setLignes([{ ...LIGNE_VIDE }]);
    setRemarques("");
    setConfirmationAllergie(false);
    // Le panneau reste ouvert sur la confirmation : refermer aussitôt
    // laisserait le médecin sans preuve que le document est bien parti.
    setMessage({ texte: code ? `${texte} — code de vérification ${code}` : texte, erreur: false });
    apres?.(texte);
  }

  const etiquette = "mb-1.5 block text-[12.5px] font-bold";
  const champ =
    "mb-3 w-full rounded-[11px] border border-line bg-white px-[13px] py-2.5 text-[13.5px] outline-none focus:border-teal pointer-coarse:min-h-11";
  const large = structuree || estCertificat(champs.type);
  const avertissement =
    nbAlertes > 0 && !confirmationAllergie
      ? "Allergie déclarée : confirmez la prescription pour l’émettre."
      : structuree && probleme && lignes.some(ligneRemplie)
        ? probleme
        : null;

  return (
    <>
      <button
        type="button"
        onClick={ouvrir}
        className={
          classeDeclencheur ??
          (enCorrection
            ? "rounded-[9px] border-[1.5px] border-line bg-white px-3 py-1.5 text-[11.5px] font-bold text-blue transition-colors hover:bg-bg"
            : "rounded-[9px] bg-teal px-3 py-1.5 text-[11.5px] font-bold text-white transition-colors hover:bg-[#2790bc]")
        }
      >
        {declencheur ?? (enCorrection ? "Corriger" : "+ Document")}
      </button>

      {ouvert && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`${enCorrection ? "Corriger" : "Remettre"} un document — ${nomPatient}`}
          className="ui-overlay-in fixed inset-0 z-50 flex items-end justify-center bg-black/40 md:items-start md:overflow-y-auto md:p-6"
          onClick={(e) => {
            if (e.target === e.currentTarget) fermer();
          }}
        >
          {/* Feuille plein écran sur téléphone, carte centrée à partir de md. */}
          <div
            className={`ui-modal-in flex max-h-[92vh] w-full flex-col rounded-t-2xl border border-line bg-white md:max-h-none md:rounded-2xl md:shadow-xl ${
              large ? "md:max-w-[720px]" : "md:max-w-[560px]"
            }`}
          >
            <div className="flex items-start justify-between gap-3 border-b border-line p-4 md:border-b-0 md:pb-2">
              <h4 className="text-[15px] font-extrabold">
                {enCorrection ? "Corriger le document" : "Remettre un document"}
                <span className="block text-[12px] font-semibold text-muted">{nomPatient}</span>
              </h4>
              <button
                type="button"
                onClick={fermer}
                aria-label="Fermer"
                className="grid h-11 w-11 flex-none place-items-center rounded-lg text-muted hover:bg-bg"
              >
                <Icone nom="croix" taille={18} epaisseur={2.2} />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-4 md:overflow-visible">
              <div role="radiogroup" aria-label="Comment produire le document" className="mb-3 flex gap-2">
                {(
                  [
                    ["generer", "imprimante", "Générer"],
                    ["fichier", "partager", "Joindre un fichier"],
                  ] as [Mode, "imprimante" | "partager", string][]
                ).map(([valeur, icone, libelle]) => (
                  <button
                    key={valeur}
                    type="button"
                    role="radio"
                    aria-checked={mode === valeur}
                    onClick={() => changerMode(valeur)}
                    className={`flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-[11px] border-[1.5px] px-2 text-[12px] font-bold transition-colors ${
                      mode === valeur ? "border-teal bg-teal-soft text-blue" : "border-line bg-white text-muted hover:bg-bg"
                    }`}
                  >
                    <Icone nom={icone} taille={14} />
                    {libelle}
                  </button>
                ))}
              </div>

              {/* Le type ne se change pas en correction : la v2 d'une
                  ordonnance reste une ordonnance. */}
              {enCorrection ? (
                <p className="mb-3 rounded-xl bg-bg px-3 py-2 text-[12px] font-semibold">
                  {libelleType(champs.type)} · version {(aModifier?.version ?? 1) + 1} à créer
                </p>
              ) : (
                <>
                  <label htmlFor="doc-type" className={etiquette}>
                    Type
                  </label>
                  <select
                    id="doc-type"
                    className={champ}
                    value={champs.type}
                    onChange={(e) => changerType(e.target.value as TypeDocument)}
                  >
                    {TYPES_DOCUMENT.map((t) => (
                      <option key={t.valeur} value={t.valeur}>
                        {t.libelle}
                      </option>
                    ))}
                  </select>
                </>
              )}

              {titreAuto ? (
                <p className="mb-3 flex flex-wrap items-center gap-x-1.5 rounded-xl bg-bg px-3 py-2 text-[12px]">
                  <span className="text-muted">Titre :</span>
                  <b>{titre}</b>
                  <span className="text-muted">· automatique</span>
                </p>
              ) : (
                <>
                  <label htmlFor="doc-titre" className={etiquette}>
                    Titre *
                  </label>
                  <input
                    id="doc-titre"
                    className={champ}
                    placeholder="Bilan lipidique"
                    value={champs.titre}
                    onChange={(e) => setChamps({ ...champs, titre: e.target.value })}
                  />
                </>
              )}

              {mode === "generer" && estCertificat(champs.type) && !enCorrection && (
                <ChampsCertificat
                  key={champs.type}
                  type={champs.type}
                  base={baseModele}
                  onRemplir={({ titre: t, texte }) => setChamps((c) => ({ ...c, titre: t, contenu: texte }))}
                />
              )}

              {structuree ? (
                <div className="mb-3">
                  <EditeurPrescription
                    lignes={lignes}
                    onLignes={setLignes}
                    remarques={remarques}
                    onRemarques={setRemarques}
                    allergies={allergies}
                    confirmationAllergie={confirmationAllergie}
                    onConfirmationAllergie={setConfirmationAllergie}
                  />
                </div>
              ) : (
                <>
                  <label htmlFor="doc-contenu" className={etiquette}>
                    Contenu {mode === "generer" ? "*" : "(visible par le patient)"}
                  </label>
                  <textarea
                    id="doc-contenu"
                    rows={estCertificat(champs.type) ? 9 : 6}
                    className={`${champ} leading-relaxed`}
                    placeholder="Compte rendu, résultat, conclusions…"
                    value={champs.contenu}
                    onChange={(e) => setChamps({ ...champs, contenu: e.target.value })}
                  />
                </>
              )}

              {mode === "generer" && (
                <div className="mb-3 rounded-xl border border-line p-3">
                  <p className="flex flex-wrap items-center gap-1.5 text-[12px] leading-relaxed">
                    <Icone nom={signature ? "coche" : "alerte"} taille={14} className={signature ? "text-green" : "text-amber"} />
                    {signature ? (
                      <span>
                        Votre <b>signature électronique</b> et un <b>QR de vérification</b> seront apposés sur le PDF.
                      </span>
                    ) : (
                      <span>
                        Aucune signature enregistrée : le PDF portera un QR de vérification et la mention « signature non
                        enregistrée ».
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => setSignatureOuverte((o) => !o)}
                      className="min-h-9 rounded-lg px-2 font-bold text-teal hover:underline pointer-coarse:min-h-11"
                    >
                      {signatureOuverte ? "Masquer" : signature ? "Voir ma signature" : "Créer ma signature"}
                    </button>
                  </p>
                  {signatureOuverte && (
                    <div className="mt-3">
                      <SignatureElectronique
                        onChange={(m) => {
                          setRevisionSignature((r) => r + 1);
                          setMessage({ texte: m, erreur: false });
                        }}
                      />
                    </div>
                  )}
                </div>
              )}

              {mode === "fichier" && (
                <>
                  {enCorrection && aModifier?.fichierNom && !remplacerFichier ? (
                    <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl bg-bg px-3 py-2 text-[12px]">
                      <span className="flex min-w-0 items-center gap-1.5 truncate font-semibold">
                        <Icone nom="document" taille={13} className="flex-none" />
                        {aModifier.fichierNom}
                      </span>
                      <button
                        type="button"
                        onClick={() => setRemplacerFichier(true)}
                        className="ml-auto min-h-11 font-bold text-teal hover:underline"
                      >
                        Remplacer
                      </button>
                    </div>
                  ) : (
                    <>
                      <label htmlFor="doc-fichier" className={etiquette}>
                        {enCorrection ? "Nouveau fichier" : "Fichier joint"} (PDF ou image, 8 Mo max)
                      </label>
                      <input
                        id="doc-fichier"
                        ref={fichierRef}
                        type="file"
                        accept=".pdf,.jpg,.jpeg,.png,.webp"
                        className="mb-3 w-full text-[12.5px]"
                      />
                    </>
                  )}
                  <p className="mb-2 text-[11.5px] leading-relaxed text-muted">
                    Un fichier joint ne porte pas de QR de vérification : seuls les documents générés ici sont certifiés.
                  </p>
                </>
              )}

              <p className="text-[11.5px] leading-relaxed text-muted">
                Le document est déposé dans un espace privé : seuls {nomPatient} et vous pourrez l’ouvrir, par un lien
                temporaire.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 border-t border-line p-4 md:border-t-0 md:pt-0">
              <button
                type="button"
                onClick={envoyer}
                disabled={!valide || enCours}
                className="min-h-11 rounded-[9px] bg-teal px-[14px] text-[12.5px] font-bold text-white transition-colors hover:bg-[#2790bc] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {enCours ? "Émission…" : enCorrection ? "Enregistrer la correction" : "Émettre et remettre"}
              </button>
              {mode === "generer" && (
                <button
                  type="button"
                  onClick={apercu}
                  disabled={!valide || apercuEnCours}
                  title={valide ? "Ouvrir le PDF sans l’émettre" : "Complétez le document"}
                  className="min-h-11 rounded-[9px] border-[1.5px] border-line bg-white px-[14px] text-[12.5px] font-bold text-blue transition-colors hover:bg-bg disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {apercuEnCours ? "Composition…" : "Aperçu du PDF"}
                </button>
              )}
              <button
                type="button"
                onClick={fermer}
                className="min-h-11 rounded-[9px] border-[1.5px] border-line bg-white px-[14px] text-[12.5px] font-bold text-blue transition-colors hover:bg-bg"
              >
                Fermer
              </button>
              {(message || avertissement) && (
                <span
                  role={message?.erreur || (!message && avertissement) ? "alert" : "status"}
                  className={`w-full text-[12.5px] font-bold ${message && !message.erreur ? "text-green" : "text-red"}`}
                >
                  {message?.texte ?? avertissement}
                </span>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
