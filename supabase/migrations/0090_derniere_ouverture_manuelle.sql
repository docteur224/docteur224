-- Docteur 224 — Dernière ouverture manuelle d'un médecin (pour la fenêtre glissante)
--
-- La fenêtre de réservation (migration 0089) borne la vue patient à N mois.
-- Mais le médecin peut ouvrir MANUELLEMENT un créneau au-delà (Règle 1), et ce
-- créneau doit rester atteignable par le patient : le bandeau de dates s'étend
-- alors jusqu'à cette ouverture. Pour savoir jusqu'où étendre SANS tirer toute
-- l'année de rendez-vous, on expose une seule date : la plus lointaine
-- exception « ouvert » encore à venir. null s'il n'y en a aucune.
--
-- Même esprit que `heures_indisponibles` (0003) : fonction security definer,
-- publique, qui ne révèle aucune donnée personnelle — juste une date de
-- disponibilité. Le patient n'accède jamais à `creneaux_exceptions` en direct
-- (RLS), il passe par ces fonctions. Rejouable sans casse.

create or replace function derniere_ouverture_manuelle(p_medecin_id uuid)
returns date
language sql stable security definer set search_path = public as $$
  select max(ce.date)
  from creneaux_exceptions ce
  where ce.medecin_id = p_medecin_id
    and ce.etat = 'ouvert'
    and ce.date >= current_date;
$$;

grant execute on function derniere_ouverture_manuelle(uuid) to anon, authenticated;
