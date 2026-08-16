"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import AvatarMedecin from "@/components/site/AvatarMedecin";
import { useDisponibilites } from "@/lib/disponibilites";
import { HEURES_JOURNEE, statutCreneau } from "@/lib/donnees";
import type { MedecinAvecPlages } from "@/lib/donnees";
import {
  JOURS_COURTS,
  MOIS_LONGS,
  calculerAge,
  capitaliser,
  depuisISO,
  formatDateCourte,
  formatDateLongue,
  formatDateRelative,
  versISO,
} from "@/lib/dates";
import { formatGNF, formatNote } from "@/lib/format";
import {
  chiffresTelephone,
  formaterTelephoneGN,
  telephoneGuineenValide,
  versTelephoneInternational,
} from "@/lib/telephone";
import {
  JOURS_DISPO,
  LIBELLE_TYPE_FICHE,
  LONGUEUR_RECHERCHE_MINI,
  creerRdvCentreAppel,
  useAnnuaireMedecins,
  useMedecinsFiltres,
  useProchainesDispos,
  useRdvRecents,
  useRecherchePatients,
  type DispoMedecin,
  type FichePatient,
} from "@/lib/rdv-centre-appel";

/*
 * « Prise de rendez-vous · centre d'appel » — l'écran que le bouton
 * « + RDV pour un patient » du tableau de bord admin appelait sans qu'il
 * existe (il pointait sur /espace-medecin/nouveau-rdv, que la garde de rôle
 * de MedecinShell referme aussitôt sur un administrateur).
 *
 * Il ne pouvait pas être le même écran que celui du praticien : celui-ci
 * réserve sur SON agenda, l'opérateur du centre d'appel doit d'abord trouver
 * l'appelant dans toute la plateforme, puis choisir le praticien. D'où quatre
 * temps, dans l'ordre où la conversation téléphonique se déroule :
 *
 *   1 · Qui appelle ?      recherche unifiée (comptes, proches, fiches)
 *   2 · Quel praticien ?   annuaire filtrable, classé par « le plus tôt »
 *   3 · Quel créneau ?     agenda réel du praticien retenu
 *   4 · Pourquoi ?         soin de sa grille tarifaire, cabinet ou domicile
 *
 * La colonne de droite tient la « fiche d'appel » : elle se remplit au fur et
 * à mesure et fournit, une fois le rendez-vous posé, la phrase exacte à lire
 * à l'appelant. C'est ce que l'opérateur regarde, pas le formulaire.
 *
 * Un seul rendu pour le web et le mobile — comme NouveauRdvDelegue, dont cet
 * écran est le pendant côté console. Les blocs se replient en une colonne
 * sous `lg`, aucun tableau n'est utilisé.
 */

const CHAMP =
  "w-full rounded-[11px] border border-line bg-white px-[13px] py-2.5 text-[13.5px] outline-none focus:border-teal";
const CARTE = "rounded-[16px] border border-line bg-white p-[18px]";
const BTN_PRIMAIRE =
  "rounded-[10px] bg-teal px-[14px] py-2 text-[12.5px] font-bold text-white transition-colors hover:bg-[#2790bc] disabled:cursor-not-allowed disabled:opacity-50";
const BTN_LEGER =
  "rounded-[10px] border-[1.5px] border-line bg-white px-[14px] py-2 text-[12.5px] font-bold text-blue transition-colors hover:bg-bg";

const initiales = (prenom: string, nom: string) =>
  `${prenom.charAt(0)}${nom.charAt(0)}`.toUpperCase() || "?";

/** « mardi 18 août à 09:30 » — la forme lue au téléphone. */
const quandLisible = (dateISO: string, heure: string) =>
  `${formatDateLongue(dateISO)} à ${heure}`;

/**
 * Le créneau est-il encore à venir ?
 *
 * `creneauReservable` (lib/dates) refuserait en plus tout ce qui commence dans
 * moins de deux heures : c'est la règle du parcours patient, pas celle du
 * centre d'appel, où « je peux venir tout de suite ? » est une demande
 * courante. Fonction de module et non expression de rendu : React 19 refuse
 * un appel impur (`Date.now()`) dans le corps d'un composant.
 */
function creneauFutur(dateISO: string, heure: string): boolean {
  const debut = depuisISO(dateISO);
  const [h, m] = heure.split(":").map(Number);
  debut.setHours(h, m, 0, 0);
  return debut.getTime() >= Date.now();
}

interface JourAgenda {
  iso: string;
  labelJour: string;
  numero: number;
  mois: string;
  ferme: boolean;
}

/**
 * Bandeau de dates du centre d'appel : tous les jours à partir
 * d'aujourd'hui, dimanche compris. `prochainsJours` de lib/dates saute le
 * dimanche — c'est juste pour le parcours patient (les maquettes n'en
 * montrent pas), mais un praticien de garde peut très bien ouvrir ce jour-là,
 * et l'opérateur doit alors pouvoir l'atteindre.
 */
function joursAgenda(joursFermes: number[], nb: number): JourAgenda[] {
  const jours: JourAgenda[] = [];
  const curseur = new Date();
  const aujourdhui = versISO(curseur);
  for (let i = 0; i < nb; i++) {
    const iso = versISO(curseur);
    jours.push({
      iso,
      labelJour: iso === aujourdhui ? "Auj." : JOURS_COURTS[curseur.getDay()],
      numero: curseur.getDate(),
      mois: MOIS_LONGS[curseur.getMonth()].slice(0, 4),
      ferme: joursFermes.includes(curseur.getDay()),
    });
    curseur.setDate(curseur.getDate() + 1);
  }
  return jours;
}

export default function PriseRdvCentreAppel() {
  /* ----- 1 · l'appelant ----- */
  const [saisiePatient, setSaisiePatient] = useState("");
  const [recherchePatient, setRecherchePatient] = useState("");
  const { fiches, chargement: chargementFiches, erreur: erreurRecherche } =
    useRecherchePatients(recherchePatient);
  const [patient, setPatient] = useState<FichePatient | null>(null);
  const [nouveau, setNouveau] = useState({ nom: "", prenom: "", telephone: "" });
  const [creationOuverte, setCreationOuverte] = useState(false);

  // Frappe temporisée : une requête par caractère saturerait la base, et
  // l'opérateur tape un numéro complet avant d'attendre quoi que ce soit.
  useEffect(() => {
    const minuteur = setTimeout(() => setRecherchePatient(saisiePatient.trim()), 300);
    return () => clearTimeout(minuteur);
  }, [saisiePatient]);

  /* ----- 2 · le praticien ----- */
  const { medecins, chargement: chargementAnnuaire } = useAnnuaireMedecins();
  const [rechercheMedecin, setRechercheMedecin] = useState("");
  const [specialite, setSpecialite] = useState("");
  const [ville, setVille] = useState("");
  const [domicileSeulement, setDomicileSeulement] = useState(false);
  const [tri, setTri] = useState<"plus_tot" | "note">("plus_tot");
  const [medecin, setMedecin] = useState<MedecinAvecPlages | null>(null);

  const idsMedecins = useMemo(() => medecins.map((m) => m.id), [medecins]);
  const { dispos, recharger: rechargerDispos } = useProchainesDispos(idsMedecins);
  const resultatsMedecins = useMedecinsFiltres(
    medecins,
    { recherche: rechercheMedecin, specialite, ville, domicile: domicileSeulement },
    dispos,
    tri
  );

  const specialites = useMemo(
    () => [...new Set(medecins.map((m) => m.specialite).filter(Boolean))].sort((a, b) => a.localeCompare(b, "fr")),
    [medecins]
  );
  const villes = useMemo(
    () => [...new Set(medecins.map((m) => m.ville).filter(Boolean))].sort((a, b) => a.localeCompare(b, "fr")),
    [medecins]
  );

  /* ----- 3 et 4 · créneau, motif ----- */
  const [creneau, setCreneau] = useState<{ date: string; heure: string } | null>(null);
  const [lieu, setLieu] = useState<"cabinet" | "domicile">("cabinet");
  const [soin, setSoin] = useState("");
  const [precision, setPrecision] = useState("");
  const [adresse, setAdresse] = useState("");

  /* ----- envoi ----- */
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState("");
  const [confirme, setConfirme] = useState<{
    patient: string;
    medecin: string;
    date: string;
    heure: string;
    lieu: "cabinet" | "domicile";
    adresse: string;
    motif: string;
    montant: number | null;
  } | null>(null);
  const { rdvs: recents, recharger: rechargerRecents } = useRdvRecents();

  const telephoneNouveau = chiffresTelephone(nouveau.telephone);
  const nouveauPret =
    nouveau.nom.trim() !== "" &&
    nouveau.prenom.trim() !== "" &&
    telephoneGuineenValide(telephoneNouveau);
  const patientPret = patient !== null || (creationOuverte && nouveauPret);
  const nomPatient = patient
    ? patient.nomComplet
    : `${nouveau.prenom} ${nouveau.nom}`.trim() || "—";

  // Soins proposés au lieu retenu — « tous » vaut pour les deux. La grille
  // tarifaire du praticien est la seule liste de ses actes (migration 0027) :
  // proposer autre chose reviendrait à inventer une prestation.
  const soins = (medecin?.tarifs ?? []).filter((t) => t.lieu === lieu || t.lieu === "tous");
  const soinRetenu = soins.find((t) => t.libelle === soin) ?? null;
  // Trois cas distincts, qu'un `??` confondrait : aucun soin retenu → tarif de
  // référence ; soin tarifé → son prix ; soin sans prix ferme → rien à annoncer.
  const montant = soinRetenu ? soinRetenu.montant : (medecin?.tarifConsultation ?? null);

  const adresseValide = lieu === "cabinet" || adresse.trim() !== "";
  const complet = patientPret && medecin !== null && creneau !== null && adresseValide;

  function nouvelAppel() {
    setSaisiePatient("");
    setRecherchePatient("");
    setPatient(null);
    setNouveau({ nom: "", prenom: "", telephone: "" });
    setCreationOuverte(false);
    setMedecin(null);
    setCreneau(null);
    setLieu("cabinet");
    setSoin("");
    setPrecision("");
    setAdresse("");
    setErreur("");
    setConfirme(null);
  }

  function choisirMedecin(m: MedecinAvecPlages) {
    setMedecin(m);
    setCreneau(null);
    setSoin("");
    // Un praticien qui ne se déplace pas ne doit pas hériter du choix
    // « domicile » fait sur le précédent : le trigger de la base le refuserait.
    if (!m.visiteDomicile) setLieu("cabinet");
    setErreur("");
  }

  async function enregistrer() {
    if (!complet || !medecin || !creneau || enCours) return;
    setEnCours(true);
    setErreur("");
    const motif = [soinRetenu?.libelle, precision.trim()].filter(Boolean).join(" — ");
    const res = await creerRdvCentreAppel({
      medecinId: medecin.id,
      date: creneau.date,
      heure: creneau.heure,
      motif,
      lieu,
      adresseDomicile: adresse.trim(),
      patientCle: patient?.cle,
      nouvelleFiche: patient
        ? undefined
        : {
            nom: nouveau.nom.trim(),
            prenom: nouveau.prenom.trim(),
            telephone: versTelephoneInternational(telephoneNouveau),
          },
    });
    setEnCours(false);
    if (res.erreur) {
      setErreur(res.erreur);
      return;
    }
    setConfirme({
      patient: nomPatient,
      medecin: `${medecin.civilite} ${medecin.prenom} ${medecin.nom}`,
      date: creneau.date,
      heure: creneau.heure,
      lieu,
      adresse: adresse.trim(),
      motif: motif || "Consultation",
      montant,
    });
    rechargerDispos();
    rechargerRecents();
  }

  /* ===== Confirmation ===== */
  if (confirme) {
    return (
      <div className="mx-auto max-w-[720px] px-[18px] py-8 md:px-0">
        <div className="text-center">
          <div className="mx-auto mb-5 grid h-[86px] w-[86px] place-items-center rounded-full bg-green-soft">
            <span className="grid h-[62px] w-[62px] place-items-center rounded-full bg-green text-[30px] text-white">
              ✓
            </span>
          </div>
          <h2 className="text-[23px] font-extrabold tracking-[-0.4px]">
            Rendez-vous enregistré
          </h2>
          <p className="mt-1.5 text-[13.5px] text-muted">
            Le patient reçoit sa confirmation ; le praticien voit le rendez-vous dans son agenda.
          </p>
        </div>

        {/* Ce que l'opérateur relit à l'appelant avant de raccrocher : c'est la
            seule chose qui compte à cet instant, elle est donc mise en avant. */}
        <div className="mt-6 rounded-[16px] border-[1.5px] border-teal bg-teal-soft p-5">
          <div className="mb-2 text-[11.5px] font-extrabold uppercase tracking-wide text-blue">
            📞 À relire à l’appelant
          </div>
          <p className="text-[15px] font-semibold leading-[1.7] text-blue">
            « C’est noté&nbsp;: <b>{confirme.patient}</b> a rendez-vous avec{" "}
            <b>{confirme.medecin}</b> le <b>{quandLisible(confirme.date, confirme.heure)}</b>
            {confirme.lieu === "domicile" ? (
              <>
                , en <b>visite à domicile</b> au <b>{confirme.adresse}</b>
              </>
            ) : (
              " au cabinet"
            )}
            . Motif&nbsp;: {confirme.motif}.
            {confirme.montant !== null && confirme.montant > 0 && (
              <>
                {" "}
                La consultation coûte <b>{formatGNF(confirme.montant)}</b>, à régler sur place.
              </>
            )}{" "}
            La réservation, elle, est gratuite. »
          </p>
        </div>

        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button type="button" onClick={nouvelAppel} className={BTN_PRIMAIRE}>
            📞 Nouvel appel
          </button>
          <Link href="/espace-admin" className={BTN_LEGER}>
            Retour au tableau de bord
          </Link>
        </div>
      </div>
    );
  }

  /* ===== Formulaire ===== */
  return (
    <div className="px-[18px] pb-6 pt-3 md:px-0 md:pt-0">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-[21px] font-extrabold tracking-[-0.3px]">
            Prise de rendez-vous · centre d’appel
          </h2>
          <small className="text-[13px] text-muted">
            Réserver au nom d’un patient qui appelle la plateforme
          </small>
        </div>
        {/* Masqué sous md : la barre haute mobile porte déjà son propre
            retour, deux flèches côte à côte ne servent à rien. */}
        <Link href="/espace-admin" className={`${BTN_LEGER} hidden md:inline-block`}>
          ← Tableau de bord
        </Link>
      </div>

      <div className="grid items-start gap-[18px] lg:grid-cols-[1fr_330px]">
        <div className="grid gap-[18px]">
          {/* ===== 1 · Qui appelle ? ===== */}
          <section className={CARTE}>
            <EnTeteEtape numero={1} titre="Qui appelle ?" fait={patientPret} />
            <p className="mb-3 text-[12.5px] leading-relaxed text-muted">
              Cherchez par <b>nom</b> ou par <b>numéro de téléphone</b> — comptes patients, proches
              déclarés et fiches créées au cabinet sont interrogés ensemble.
            </p>

            {patient ? (
              <FicheChoisie fiche={patient} onChanger={() => setPatient(null)} />
            ) : (
              <>
                <input
                  className={CHAMP}
                  placeholder="Ex. Mariama Camara, ou 622 00 00 00"
                  value={saisiePatient}
                  aria-label="Rechercher un patient"
                  onChange={(e) => setSaisiePatient(e.target.value)}
                />
                {erreurRecherche && (
                  <p role="alert" className="mt-2 text-[12px] font-semibold text-red">
                    {erreurRecherche}
                  </p>
                )}
                {chargementFiches && (
                  <p className="mt-2 text-[12.5px] text-muted">Recherche…</p>
                )}
                {!chargementFiches &&
                  recherchePatient.length >= LONGUEUR_RECHERCHE_MINI &&
                  fiches.length === 0 && (
                    <p className="mt-2 text-[12.5px] text-muted">
                      Personne de ce nom sur la plateforme — créez une fiche ci-dessous.
                    </p>
                  )}
                <div className="mt-2 grid gap-2">
                  {fiches.map((f) => (
                    <LigneFiche key={f.cle} fiche={f} onChoisir={() => setPatient(f)} />
                  ))}
                </div>

                <div className="my-3 flex items-center gap-3 text-[11.5px] font-semibold text-muted">
                  <span className="h-px flex-1 bg-line" />
                  ou nouveau patient
                  <span className="h-px flex-1 bg-line" />
                </div>

                {creationOuverte ? (
                  <div className="rounded-[13px] border-[1.5px] border-line bg-[#F9FBFC] p-[14px]">
                    <p className="mb-3 flex items-start gap-2 text-[12px] font-semibold leading-relaxed text-blue">
                      <span aria-hidden>ℹ️</span>
                      <span>
                        Le patient <b>n’a pas besoin de compte</b> : une fiche minimale suffit, il
                        pourra la réclamer plus tard.
                      </span>
                    </p>
                    <div className="grid gap-2.5 sm:grid-cols-2">
                      <label className="block">
                        <span className="mb-1 block text-[12px] font-bold">Nom *</span>
                        <input
                          className={CHAMP}
                          value={nouveau.nom}
                          onChange={(e) => setNouveau({ ...nouveau, nom: e.target.value })}
                        />
                      </label>
                      <label className="block">
                        <span className="mb-1 block text-[12px] font-bold">Prénom *</span>
                        <input
                          className={CHAMP}
                          value={nouveau.prenom}
                          onChange={(e) => setNouveau({ ...nouveau, prenom: e.target.value })}
                        />
                      </label>
                    </div>
                    <div className="mt-2.5">
                      <span className="mb-1 block text-[12px] font-bold">Téléphone *</span>
                      <div className="flex gap-2">
                        <span className="flex flex-none items-center rounded-[11px] border border-line bg-[#F4F8FA] px-[13px] text-[13px] font-bold">
                          🇬🇳 +224
                        </span>
                        <input
                          className={CHAMP}
                          placeholder="6XX XX XX XX"
                          inputMode="numeric"
                          aria-label="Téléphone du nouveau patient"
                          value={formaterTelephoneGN(telephoneNouveau)}
                          onChange={(e) =>
                            setNouveau({ ...nouveau, telephone: chiffresTelephone(e.target.value) })
                          }
                        />
                      </div>
                      {telephoneNouveau.length > 0 && !telephoneGuineenValide(telephoneNouveau) && (
                        <p role="alert" className="mt-1.5 text-[11.5px] font-semibold text-red">
                          Le numéro doit comporter 9 chiffres et commencer par 6.
                        </p>
                      )}
                      <p className="mt-1.5 text-[11.5px] text-muted">
                        C’est sur ce numéro que part la confirmation par SMS.
                      </p>
                    </div>
                    <button
                      type="button"
                      className={`${BTN_LEGER} mt-3`}
                      onClick={() => {
                        setCreationOuverte(false);
                        setNouveau({ nom: "", prenom: "", telephone: "" });
                      }}
                    >
                      Annuler la création
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className={BTN_LEGER}
                    onClick={() => setCreationOuverte(true)}
                  >
                    + Créer une fiche patient
                  </button>
                )}
              </>
            )}
          </section>

          {/* ===== 2 · Quel praticien ? ===== */}
          <section className={CARTE}>
            <EnTeteEtape numero={2} titre="Quel praticien ?" fait={medecin !== null} />
            {medecin ? (
              <MedecinChoisi
                medecin={medecin}
                dispo={dispos.get(medecin.id)}
                onChanger={() => {
                  setMedecin(null);
                  setCreneau(null);
                }}
              />
            ) : (
              <>
                <div className="grid gap-2.5 sm:grid-cols-2">
                  <input
                    className={CHAMP}
                    placeholder="Nom du praticien…"
                    aria-label="Rechercher un praticien"
                    value={rechercheMedecin}
                    onChange={(e) => setRechercheMedecin(e.target.value)}
                  />
                  <select
                    className={CHAMP}
                    aria-label="Spécialité"
                    value={specialite}
                    onChange={(e) => setSpecialite(e.target.value)}
                  >
                    <option value="">Toutes les spécialités</option>
                    {specialites.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                  <select
                    className={CHAMP}
                    aria-label="Ville"
                    value={ville}
                    onChange={(e) => setVille(e.target.value)}
                  >
                    <option value="">Toutes les villes</option>
                    {villes.map((v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </select>
                  <select
                    className={CHAMP}
                    aria-label="Classement"
                    value={tri}
                    onChange={(e) => setTri(e.target.value === "note" ? "note" : "plus_tot")}
                  >
                    <option value="plus_tot">Disponible le plus tôt</option>
                    <option value="note">Mieux notés</option>
                  </select>
                </div>
                <label className="mt-2.5 flex items-center gap-2 text-[12.5px] font-semibold">
                  <input
                    type="checkbox"
                    checked={domicileSeulement}
                    onChange={(e) => setDomicileSeulement(e.target.checked)}
                  />
                  🏠 Se déplace à domicile
                </label>

                {chargementAnnuaire ? (
                  <p className="mt-3 text-[12.5px] text-muted">Chargement de l’annuaire…</p>
                ) : (
                  <>
                    <p className="mt-3 text-[11.5px] font-semibold text-muted">
                      {resultatsMedecins.length} praticien
                      {resultatsMedecins.length > 1 ? "s" : ""} · disponibilités calculées sur{" "}
                      {JOURS_DISPO} jours
                    </p>
                    <div className="mt-2 grid max-h-[420px] gap-2 overflow-y-auto pr-1">
                      {resultatsMedecins.map((m) => (
                        <LigneMedecin
                          key={m.id}
                          medecin={m}
                          dispo={dispos.get(m.id)}
                          onChoisir={() => choisirMedecin(m)}
                        />
                      ))}
                      {resultatsMedecins.length === 0 && (
                        <p className="text-[12.5px] text-muted">
                          Aucun praticien ne correspond à ces critères.
                        </p>
                      )}
                    </div>
                  </>
                )}
              </>
            )}
          </section>

          {/* ===== 3 · Quel créneau ? ===== */}
          {medecin && (
            <section className={CARTE}>
              <EnTeteEtape numero={3} titre="Quel créneau ?" fait={creneau !== null} />
              <ChoixCreneau
                medecin={medecin}
                choisi={creneau}
                dispo={dispos.get(medecin.id)}
                onChoisir={(date, heure) => {
                  setCreneau({ date, heure });
                  setErreur("");
                }}
              />
            </section>
          )}

          {/* ===== 4 · Motif et lieu ===== */}
          {medecin && creneau && (
            <section className={CARTE}>
              <EnTeteEtape numero={4} titre="Motif et lieu" fait />
              {medecin.visiteDomicile ? (
                <div className="mb-3 grid gap-2 sm:grid-cols-2">
                  {(["cabinet", "domicile"] as const).map((valeur) => (
                    <button
                      key={valeur}
                      type="button"
                      aria-pressed={lieu === valeur}
                      onClick={() => {
                        setLieu(valeur);
                        setSoin("");
                      }}
                      className={`rounded-[13px] border-[1.5px] px-[14px] py-3 text-left text-[13px] font-bold transition-colors ${
                        lieu === valeur ? "border-teal bg-teal-soft text-blue" : "border-line bg-white"
                      }`}
                    >
                      {valeur === "cabinet" ? "🏥 Au cabinet" : "🏠 À domicile"}
                      <small className="mt-0.5 block text-[11.5px] font-semibold text-muted">
                        {valeur === "cabinet"
                          ? [medecin.quartier, medecin.commune, medecin.ville]
                              .filter(Boolean)
                              .join(" · ") || "Adresse du praticien"
                          : medecin.zoneDomicile || "Zone de déplacement non précisée"}
                      </small>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="mb-3 text-[12.5px] text-muted">
                  🏥 Consultation au cabinet — ce praticien ne se déplace pas à domicile.
                </p>
              )}

              {lieu === "domicile" && (
                <label className="mb-3 block">
                  <span className="mb-1 block text-[12px] font-bold">Adresse de la visite *</span>
                  <input
                    className={CHAMP}
                    placeholder="Quartier, repère, indications d’accès…"
                    value={adresse}
                    onChange={(e) => setAdresse(e.target.value)}
                  />
                  <span className="mt-1.5 block text-[11.5px] text-muted">
                    Demandez un repère à l’appelant : le praticien s’y rend sans autre indication.
                  </span>
                </label>
              )}

              <span className="mb-1.5 block text-[12px] font-bold">Motif de la consultation</span>
              {soins.length === 0 ? (
                <p className="text-[12.5px] text-muted">
                  Ce praticien n’a pas encore publié de grille tarifaire pour ce lieu — précisez le
                  motif en clair ci-dessous.
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {soins.map((t) => (
                    <button
                      key={t.libelle}
                      type="button"
                      aria-pressed={soin === t.libelle}
                      onClick={() => setSoin(soin === t.libelle ? "" : t.libelle)}
                      className={`rounded-[10px] border-[1.5px] px-3 py-2 text-[12.5px] font-bold transition-colors ${
                        soin === t.libelle
                          ? "border-teal bg-teal-soft text-blue"
                          : "border-line bg-white"
                      }`}
                    >
                      {t.libelle}
                      <span className="ml-1.5 font-semibold text-muted">
                        {t.montant === null ? "sur demande" : formatGNF(t.montant)}
                      </span>
                    </button>
                  ))}
                </div>
              )}

              <label className="mt-3 block">
                <span className="mb-1 block text-[12px] font-bold">Précisions (facultatif)</span>
                <textarea
                  rows={2}
                  className="w-full resize-none rounded-xl border border-line bg-white p-[13px] text-[13.5px] outline-none focus:border-teal"
                  placeholder="Ce que dit l’appelant : fièvre depuis 3 jours, suivi de grossesse…"
                  value={precision}
                  onChange={(e) => setPrecision(e.target.value)}
                />
              </label>
            </section>
          )}
        </div>

        {/* ===== Fiche d'appel ===== */}
        <aside className="grid gap-[18px] lg:sticky lg:top-[26px]">
          <div className={CARTE}>
            <h3 className="mb-1 text-[15px] font-extrabold">Fiche d’appel</h3>
            <p className="mb-3 text-[11.5px] text-muted">
              Réservation gratuite · consultation réglée sur place
            </p>
            <Recap libelle="Patient" valeur={patientPret ? nomPatient : null} />
            <Recap
              libelle="Praticien"
              valeur={medecin ? `${medecin.civilite} ${medecin.prenom} ${medecin.nom}` : null}
              detail={medecin ? `${medecin.specialite} · ${medecin.ville}` : ""}
            />
            <Recap
              libelle="Rendez-vous"
              valeur={creneau ? capitaliser(quandLisible(creneau.date, creneau.heure)) : null}
            />
            <Recap
              libelle="Lieu"
              valeur={
                medecin
                  ? lieu === "domicile"
                    ? `À domicile${adresse.trim() ? ` · ${adresse.trim()}` : ""}`
                    : "Au cabinet"
                  : null
              }
            />
            <Recap
              libelle="Motif"
              valeur={
                soinRetenu?.libelle ||
                (precision.trim() ? precision.trim() : null) ||
                (creneau ? "Consultation" : null)
              }
              detail={
                montant !== null && montant > 0 && creneau
                  ? `${formatGNF(montant)} à régler sur place`
                  : ""
              }
            />

            {erreur && (
              <p
                role="alert"
                className="mt-3 rounded-xl border border-[#F3C9C2] bg-red-soft px-3 py-2.5 text-[12.5px] font-bold text-red"
              >
                ⚠️ {erreur}
              </p>
            )}

            <button
              type="button"
              onClick={enregistrer}
              disabled={!complet || enCours}
              className="mt-3 w-full rounded-[11px] bg-green px-[18px] py-3 text-[13.5px] font-bold text-white transition-colors hover:bg-[#196a3b] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {enCours ? "Enregistrement…" : "✅ Enregistrer le rendez-vous"}
            </button>
            {!complet && (
              <p className="mt-2 text-center text-[11.5px] text-muted">
                {!patientPret
                  ? "Identifiez d’abord l’appelant."
                  : !medecin
                    ? "Choisissez un praticien."
                    : !creneau
                      ? "Choisissez un créneau."
                      : "Renseignez l’adresse de la visite."}
              </p>
            )}
            <p className="mt-2 text-center text-[11px] leading-relaxed text-muted">
              Le rendez-vous est tracé <b>« pris par l’administration · téléphone »</b> et inscrit
              au journal d’audit.
            </p>
          </div>

          <div className={CARTE}>
            <h3 className="mb-2 text-[15px] font-extrabold">Derniers appels traités</h3>
            {recents.length === 0 ? (
              <p className="text-[12.5px] text-muted">
                Aucun rendez-vous encore pris depuis la console.
              </p>
            ) : (
              <div className="grid gap-2">
                {recents.map((r) => (
                  <div key={r.id} className="rounded-[11px] bg-[#F7FAFB] px-3 py-2.5">
                    <b className="block text-[12.5px]">{r.patient}</b>
                    <small className="block text-[11.5px] text-muted">
                      {r.medecin} · {formatDateRelative(r.date)} {r.heure}
                    </small>
                    <small className="block text-[11px] text-muted">
                      Par {r.prisPar || "un administrateur"}
                      {r.statut === "annule" ? " · annulé" : ""}
                    </small>
                  </div>
                ))}
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

/* ===== Sous-composants ===== */

function EnTeteEtape({ numero, titre, fait }: { numero: number; titre: string; fait: boolean }) {
  return (
    <div className="mb-3 flex items-center gap-2.5">
      <span
        aria-hidden
        className={`grid h-7 w-7 flex-none place-items-center rounded-full text-[12.5px] font-extrabold ${
          fait ? "bg-green text-white" : "bg-teal-soft text-blue"
        }`}
      >
        {fait ? "✓" : numero}
      </span>
      <h3 className="text-[15px] font-extrabold">{titre}</h3>
    </div>
  );
}

function Recap({
  libelle,
  valeur,
  detail = "",
}: {
  libelle: string;
  valeur: string | null;
  detail?: string;
}) {
  return (
    <div className="border-b border-line py-2 last:border-b-0">
      <small className="block text-[11px] font-bold uppercase tracking-wide text-muted">
        {libelle}
      </small>
      {valeur ? (
        <>
          <b className="block text-[13px]">{valeur}</b>
          {detail && <small className="block text-[11.5px] text-muted">{detail}</small>}
        </>
      ) : (
        <span className="text-[13px] text-muted">—</span>
      )}
    </div>
  );
}

/** Détail affiché sous le nom d'une fiche patient (âge, ville, titulaire…). */
function detailFiche(f: FichePatient): string {
  const morceaux = [LIBELLE_TYPE_FICHE[f.type]];
  if (f.type === "proche" && f.titulaire) morceaux.push(`${f.lien} de ${f.titulaire}`);
  if (f.dateNaissance) morceaux.push(`${calculerAge(f.dateNaissance)} ans`);
  if (f.ville) morceaux.push(f.ville);
  return morceaux.join(" · ");
}

function LigneFiche({ fiche, onChoisir }: { fiche: FichePatient; onChoisir: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-[11px] rounded-[13px] border-[1.5px] border-line bg-white p-3">
      <span
        aria-hidden
        className="grid h-10 w-10 flex-none place-items-center rounded-[11px] text-[13px] font-extrabold text-white"
        style={{ background: fiche.gradient }}
      >
        {initiales(fiche.prenom, fiche.nom)}
      </span>
      <span className="min-w-[150px] flex-1">
        <b className="block text-[13.5px]">{fiche.nomComplet}</b>
        <small className="block text-[11.5px] text-muted">{detailFiche(fiche)}</small>
        <small className="block text-[11.5px] font-semibold text-blue">
          {fiche.telephone || "Aucun numéro"}
        </small>
        {/* Le doublon le plus fréquent au téléphone : l'appelant a déjà un
            rendez-vous et rappelle pour le confirmer. Le dire évite d'en
            créer un second. */}
        {fiche.prochainRdv && (
          <small className="mt-1 block rounded-lg bg-amber-soft px-2 py-1 text-[11px] font-bold text-amber">
            ⚠️ A déjà un RDV le {formatDateCourte(fiche.prochainRdv.date)} à{" "}
            {fiche.prochainRdv.heure} · {fiche.prochainRdv.medecin}
            {fiche.nbRdv > 1 ? ` (+${fiche.nbRdv - 1} autre${fiche.nbRdv > 2 ? "s" : ""})` : ""}
          </small>
        )}
        {fiche.statutCompte === "suspendu" && (
          <small className="mt-1 block text-[11px] font-bold text-red">
            Compte suspendu — le patient ne peut plus réserver lui-même.
          </small>
        )}
      </span>
      <button type="button" onClick={onChoisir} className={BTN_PRIMAIRE}>
        Choisir
      </button>
    </div>
  );
}

function FicheChoisie({ fiche, onChanger }: { fiche: FichePatient; onChanger: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-[11px] rounded-[13px] border-[1.5px] border-teal bg-teal-soft p-3">
      <span
        aria-hidden
        className="grid h-10 w-10 flex-none place-items-center rounded-[11px] text-[13px] font-extrabold text-white"
        style={{ background: fiche.gradient }}
      >
        {initiales(fiche.prenom, fiche.nom)}
      </span>
      <span className="min-w-[150px] flex-1">
        <b className="block text-[13.5px]">{fiche.nomComplet}</b>
        <small className="block text-[11.5px] text-muted">{detailFiche(fiche)}</small>
        <small className="block text-[11.5px] font-semibold text-blue">{fiche.telephone}</small>
      </span>
      <button type="button" onClick={onChanger} className={BTN_LEGER}>
        Changer
      </button>
    </div>
  );
}

/** Pastille de première disponibilité — le repère que l'opérateur lit en premier. */
function BadgeDispo({ dispo }: { dispo: DispoMedecin | undefined }) {
  if (!dispo) {
    return (
      <span className="rounded-lg bg-[#F1F4F6] px-2 py-1 text-[11px] font-bold text-muted">
        Aucun créneau sous {JOURS_DISPO} jours
      </span>
    );
  }
  return (
    <span className="rounded-lg bg-green-soft px-2 py-1 text-[11px] font-bold text-green">
      {formatDateRelative(dispo.date)} {dispo.heure} · {dispo.libresCeJour} libre
      {dispo.libresCeJour > 1 ? "s" : ""}
    </span>
  );
}

function LigneMedecin({
  medecin,
  dispo,
  onChoisir,
}: {
  medecin: MedecinAvecPlages;
  dispo: DispoMedecin | undefined;
  onChoisir: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-[11px] rounded-[13px] border-[1.5px] border-line bg-white p-3">
      <AvatarMedecin
        photoUrl={medecin.photoUrl}
        initiales={medecin.initiales}
        gradient={medecin.gradient}
        taille={42}
        arrondi={12}
      />
      <span className="min-w-[170px] flex-1">
        <b className="block text-[13.5px]">
          {medecin.civilite} {medecin.prenom} {medecin.nom}
        </b>
        <small className="block text-[11.5px] text-muted">
          {medecin.specialite} · {[medecin.commune, medecin.ville].filter(Boolean).join(", ")}
          {medecin.tarifConsultation > 0 && ` · ${formatGNF(medecin.tarifConsultation)}`}
        </small>
        <small className="mt-1 flex flex-wrap items-center gap-1.5">
          <BadgeDispo dispo={dispo} />
          {medecin.nbAvis > 0 && (
            <span className="text-[11px] font-bold text-amber">
              ★ {formatNote(medecin.note)} ({medecin.nbAvis})
            </span>
          )}
          {medecin.visiteDomicile && (
            <span className="rounded-lg bg-teal-soft px-2 py-1 text-[11px] font-bold text-blue">
              🏠 Domicile
            </span>
          )}
        </small>
      </span>
      <button type="button" onClick={onChoisir} className={BTN_PRIMAIRE}>
        Choisir
      </button>
    </div>
  );
}

function MedecinChoisi({
  medecin,
  dispo,
  onChanger,
}: {
  medecin: MedecinAvecPlages;
  dispo: DispoMedecin | undefined;
  onChanger: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-[11px] rounded-[13px] border-[1.5px] border-teal bg-teal-soft p-3">
      <AvatarMedecin
        photoUrl={medecin.photoUrl}
        initiales={medecin.initiales}
        gradient={medecin.gradient}
        taille={42}
        arrondi={12}
      />
      <span className="min-w-[170px] flex-1">
        <b className="block text-[13.5px]">
          {medecin.civilite} {medecin.prenom} {medecin.nom}
        </b>
        <small className="block text-[11.5px] text-muted">
          {medecin.specialite} · {[medecin.quartier, medecin.commune, medecin.ville].filter(Boolean).join(", ")}
        </small>
        <small className="mt-1 block">
          <BadgeDispo dispo={dispo} />
        </small>
      </span>
      <button type="button" onClick={onChanger} className={BTN_LEGER}>
        Changer
      </button>
    </div>
  );
}

/**
 * Agenda réel du praticien retenu.
 *
 * Monté seulement une fois le praticien choisi : `useDisponibilites` part en
 * requête dès son montage, et l'appeler avec un identifiant vide lèverait une
 * erreur côté base.
 *
 * Nuance assumée par rapport au parcours patient : le délai de prévenance de
 * deux heures n'est PAS appliqué ici. Un appel à 14 h pour une consultation à
 * 15 h est exactement ce que traite un centre d'appel ; seuls les créneaux
 * réellement passés disparaissent. La base applique la même règle
 * (`creer_rdv_centre_appel`), l'écran ne fait donc pas de promesse qu'elle
 * refuserait.
 */
function ChoixCreneau({
  medecin,
  choisi,
  dispo,
  onChoisir,
}: {
  medecin: MedecinAvecPlages;
  choisi: { date: string; heure: string } | null;
  dispo: DispoMedecin | undefined;
  onChoisir: (date: string, heure: string) => void;
}) {
  const { plages, etats, chargement } = useDisponibilites(medecin.id, 30);
  const [jourVoulu, setJourVoulu] = useState<string | null>(null);

  const joursOuverts = new Set(plages.map((p) => p.jour_semaine));
  const joursFermes = [0, 1, 2, 3, 4, 5, 6].filter((j) => !joursOuverts.has(j));
  const jours = joursAgenda(joursFermes, 14);
  // Le jour affiché suit la première disponibilité tant que l'opérateur n'a
  // rien choisi : dérivé au rendu, jamais posé par un effet (le linter
  // interdit setState dans un effet, et `dispo` arrive de façon asynchrone).
  const jour = jourVoulu ?? choisi?.date ?? dispo?.date ?? jours[0].iso;

  const creneaux = HEURES_JOURNEE.map((heure) => ({
    heure,
    statut: statutCreneau(plages, etats, jour, heure),
  })).filter((c) => c.statut !== "ferme" && creneauFutur(jour, c.heure));
  const ouverts = creneaux.filter((c) => c.statut === "ouvert");

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {/* Défilement horizontal plutôt que retour à la ligne : quinze jours
            ne tiennent jamais sur une rangée, et une rangée orpheline d'un
            seul jour se lit comme une erreur de mise en page. */}
        <div className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto pb-1 [scrollbar-width:thin]">
          {jours.map((j) => (
            <button
              key={j.iso}
              type="button"
              disabled={j.ferme}
              aria-pressed={j.iso === jour}
              onClick={() => setJourVoulu(j.iso)}
              className={`min-w-[52px] flex-none rounded-[11px] border-[1.5px] px-2 py-1.5 text-center transition-colors ${
                j.iso === jour
                  ? "border-teal bg-teal-soft text-blue"
                  : j.ferme
                    ? "border-line bg-[#F7F9FA] text-muted opacity-60"
                    : "border-line bg-white"
              }`}
            >
              <small className="block text-[10.5px] font-bold uppercase">{j.labelJour}</small>
              <b className="block text-[13px]">{j.numero}</b>
              <small className="block text-[10px] text-muted">{j.mois}</small>
            </button>
          ))}
        </div>
        {dispo && dispo.date !== jour && (
          <button type="button" className={BTN_LEGER} onClick={() => setJourVoulu(dispo.date)}>
            ⏱ Premier créneau libre
          </button>
        )}
      </div>

      <div className="mb-2 text-[12.5px] font-bold">
        {capitaliser(formatDateLongue(jour))}
        <span className="ml-2 font-semibold text-muted">
          {ouverts.length} créneau{ouverts.length > 1 ? "x" : ""} libre
          {ouverts.length > 1 ? "s" : ""}
        </span>
      </div>

      {chargement ? (
        <p className="text-[12.5px] text-muted">Lecture de l’agenda…</p>
      ) : creneaux.length === 0 ? (
        <p className="text-[12.5px] text-muted">
          Rien d’ouvert ce jour-là chez ce praticien — choisissez une autre date.
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {creneaux.map((c) => {
            const pris = c.statut === "reserve";
            const actif = choisi?.date === jour && choisi.heure === c.heure;
            return (
              <button
                key={c.heure}
                type="button"
                disabled={pris}
                aria-pressed={actif}
                title={pris ? "Créneau déjà réservé" : undefined}
                onClick={() => onChoisir(jour, c.heure)}
                className={`rounded-[11px] border-[1.5px] px-[13px] py-2.5 text-[12.5px] font-bold transition-colors ${
                  actif
                    ? "border-teal bg-teal-soft text-blue"
                    : pris
                      ? "cursor-not-allowed border-line bg-[#F7F9FA] text-muted line-through"
                      : "border-line bg-white hover:border-teal"
                }`}
              >
                {c.heure}
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}
