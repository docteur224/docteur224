-- Docteur 224 — Fenêtre de réservation glissante (horizon patient)
--
-- Jusqu'ici, dès qu'un jour tombait dans un horaire-type ouvert, le créneau
-- était proposé au patient AUSSI LOIN qu'il naviguait. On borne désormais la
-- vue PATIENT à un horizon glissant : « réservable jusqu'à N mois à l'avance ».
-- Chaque jour qui passe décale la borne d'un jour, sans rien stocker ni
-- planifier — l'horizon n'est qu'un filtre calculé à la volée (voir la Phase 2
-- côté client, lib/disponibilites.ts). Cette borne ne concerne QUE le patient :
--   - le médecin garde une vue illimitée (il prépare/ferme au-delà) ;
--   - une OUVERTURE MANUELLE (ligne `creneaux_exceptions` etat='ouvert') reste
--     proposée même hors fenêtre — c'est un choix délibéré du praticien ;
--   - un créneau réservé, un congé ou une absence ne sont jamais « rouverts »
--     quand la fenêtre les atteint : la hiérarchie habituelle garde la priorité.
--
-- Ici, on ne pose QUE le réglage : un entier par médecin, défaut 2 mois,
-- lisible publiquement comme le reste de la fiche (aucune policy à ajouter, la
-- colonne suit la table `medecins`). Rejouable sans casse.

alter table medecins
  add column if not exists horizon_reservation_mois smallint not null default 2;

-- Garde-fou : un horizon a du sens entre 1 et 12 mois. On refuse 0 (plus aucun
-- créneau proposé, agenda mort) et les valeurs farfelues, sans brider le choix
-- raisonnable du praticien (1, 2, 3 … jusqu'à un an).
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'medecins_horizon_reservation_mois_borne'
  ) then
    alter table medecins
      add constraint medecins_horizon_reservation_mois_borne
      check (horizon_reservation_mois between 1 and 12);
  end if;
end $$;

comment on column medecins.horizon_reservation_mois is
  'Fenêtre de réservation glissante côté patient, en mois (défaut 2). '
  'Le patient peut prendre RDV jusqu''à N mois à l''avance ; le médecin, lui, '
  'n''est pas borné et peut ouvrir manuellement au-delà.';
