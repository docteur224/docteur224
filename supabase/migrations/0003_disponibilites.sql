-- ============================================================
-- Docteur 224 — Étape 4 : support des disponibilités publiques
-- ============================================================

-- Un même créneau ne peut pas être réservé deux fois (hors RDV annulés).
create unique index uniq_rdv_creneau_actif
  on rendez_vous (medecin_id, date, heure)
  where statut <> 'annule';

-- Créneaux indisponibles d'un médecin sur une période, sans exposer les
-- rendez-vous eux-mêmes (aucune donnée personnelle ne sort d'ici).
create or replace function heures_indisponibles(
  p_medecin_id uuid,
  p_debut date,
  p_fin date
) returns table (jour date, heure time, etat etat_creneau)
language sql stable security definer set search_path = public as $$
  select rv.date as jour, rv.heure, 'reserve'::etat_creneau as etat
  from rendez_vous rv
  where rv.medecin_id = p_medecin_id
    and rv.date between p_debut and p_fin
    and rv.statut <> 'annule'
  union
  select ce.date as jour, ce.heure, ce.etat
  from creneaux_exceptions ce
  where ce.medecin_id = p_medecin_id
    and ce.date between p_debut and p_fin;
$$;

grant execute on function heures_indisponibles(uuid, date, date) to anon, authenticated;
