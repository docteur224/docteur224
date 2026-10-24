"use client";

import { useCallback, useMemo, useState } from "react";
import { formatDateCourte } from "@/lib/dates";
import {
  beneficiaireDeCle,
  useConstantes,
  useNotes,
  type NoteConsultation,
} from "@/lib/dossier-clinique";
import { rdvPasse } from "@/lib/statuts-rdv";
import type { ContexteFiche } from "../contexte";
import { SqueletteModule } from "../ui";
import DetailNote from "./DetailNote";
import EditeurNote from "./EditeurNote";
import SaisieConstantes from "./SaisieConstantes";
import SectionChronologie from "./SectionChronologie";
import SectionConstantes from "./SectionConstantes";
import SectionConsultations from "./SectionConsultations";
import SectionNotes from "./SectionNotes";

/*
 * Module « Dossier clinique » de la fiche patient (onglet par défaut).
 *
 * Quatre sections, dans l'ordre où on les consulte en début de consultation :
 * les constantes (où en est-il ?), les notes (qu'avait-on conclu ?),
 * l'historique des consultations, puis la chronologie complète.
 *
 * Notes et constantes sont privées au médecin auteur : la base l'impose
 * (RLS, migration 0064), ce module n'a aucun filtre à poser.
 */
export default function ModuleDossierClinique({ ctx }: { ctx: ContexteFiche }) {
  const { cle, dossier, nomComplet, annoncer, signalerEchec } = ctx;
  const beneficiaire = useMemo(() => beneficiaireDeCle(cle), [cle]);

  const [revNotes, setRevNotes] = useState(0);
  const [revConstantes, setRevConstantes] = useState(0);
  const { notes, chargement: chargementNotes } = useNotes(beneficiaire, revNotes);
  const { mesures, chargement: chargementConstantes } = useConstantes(beneficiaire, revConstantes);

  const [editeur, setEditeur] = useState<{ note?: NoteConsultation; rdv?: string | null } | null>(null);
  const [detail, setDetail] = useState<NoteConsultation | null>(null);
  const [saisie, setSaisie] = useState(false);

  /* Consultations : rendez-vous passés qui ont eu (ou ont pu avoir) lieu.
     Un rendez-vous annulé ou manqué n'est pas une consultation. Les
     rendez-vous du dossier arrivent du plus récent au plus ancien. */
  const consultations = useMemo(
    () =>
      (dossier?.rdvs ?? []).filter(
        (r) => rdvPasse(r.date, r.heure) && r.statut !== "annule" && r.statut !== "absent"
      ),
    [dossier?.rdvs]
  );

  const libelleConsultation = useCallback(
    (rdvId: string | null) => {
      const r = rdvId ? (dossier?.rdvs ?? []).find((x) => x.id === rdvId) : null;
      return r ? `Consultation du ${formatDateCourte(r.date)} à ${r.heure}` : null;
    },
    [dossier?.rdvs]
  );

  // Fonctions de fermeture stables : le dialogue réarme son piège de focus à
  // chaque nouvelle fonction, ce qui ramènerait le curseur au premier champ.
  const fermerEditeur = useCallback(() => setEditeur(null), []);
  const fermerDetail = useCallback(() => setDetail(null), []);
  const fermerSaisie = useCallback(() => setSaisie(false), []);

  if (!dossier) return <SqueletteModule />;

  return (
    <div className="grid gap-4">
      {editeur && (
        <EditeurNote
          beneficiaire={beneficiaire}
          nomPatient={nomComplet}
          note={editeur.note}
          rdvInitial={editeur.rdv}
          consultations={consultations}
          onFermer={fermerEditeur}
          onEnregistre={(m) => {
            setEditeur(null);
            setRevNotes((r) => r + 1);
            annoncer(m);
          }}
        />
      )}
      {detail && (
        <DetailNote
          note={detail}
          consultation={libelleConsultation(detail.rendezVousId)}
          onFermer={fermerDetail}
          onModifier={() => {
            setDetail(null);
            setEditeur({ note: detail });
          }}
        />
      )}
      {saisie && (
        <SaisieConstantes
          beneficiaire={beneficiaire}
          nomPatient={nomComplet}
          consultations={consultations}
          onFermer={fermerSaisie}
          onEnregistre={(m) => {
            setSaisie(false);
            setRevConstantes((r) => r + 1);
            annoncer(m);
          }}
        />
      )}

      <SectionConstantes
        mesures={mesures}
        chargement={chargementConstantes}
        onSaisir={() => setSaisie(true)}
        onChange={(m) => {
          setRevConstantes((r) => r + 1);
          annoncer(m);
        }}
        onErreur={signalerEchec}
      />

      <SectionNotes
        notes={notes}
        chargement={chargementNotes}
        consultation={libelleConsultation}
        onNouvelle={() => setEditeur({})}
        onOuvrir={setDetail}
        onModifier={(note) => setEditeur({ note })}
      />

      <SectionConsultations
        consultations={consultations}
        notes={notes}
        chargement={chargementNotes}
        onOuvrir={setDetail}
        onRediger={(rdv) => setEditeur({ rdv })}
      />

      <SectionChronologie
        beneficiaire={beneficiaire}
        revision={revNotes + revConstantes + ctx.revision("documents")}
        onOuvrirNote={(id) => {
          const n = notes.find((x) => x.id === id);
          if (n) setDetail(n);
        }}
      />
    </div>
  );
}
