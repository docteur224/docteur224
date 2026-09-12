-- ============================================================
-- Docteur 224 — Congés et absences du praticien
--
-- Le bloc « Congés et absences » de /espace-medecin/disponibilites était
-- une MAQUETTE : deux lignes écrites en dur dans le JSX (« Vacances
-- annuelles, 1 – 15 août 2026 », « Jour de congé, chaque dimanche »),
-- identiques pour tous les praticiens, et un bouton « + Ajouter une
-- absence » désactivé. Rien n'existait en base, rien ne fermait un
-- créneau : un médecin parti trois semaines continuait de recevoir des
-- rendez-vous.
--
-- Cette migration pose la table, et surtout la RÈGLE : une absence ferme
-- les créneaux qu'elle couvre, partout et pour tout le monde.
--
-- L'ORDRE DE PRÉCÉDENCE est celui qui existait déjà, avec l'absence
-- glissée au milieu :
--
--     exception du jour  >  absence  >  horaire-type
--
-- L'exception garde le dernier mot, et c'est voulu : c'est par elle que le
-- praticien ouvre une vacation exceptionnelle. Elle reste donc le moyen de
-- recevoir quelqu'un un jour de congé sans démonter le congé.
-- ============================================================

-- ---------- 1. La table ----------
/*
 * Deux formes d'absence, et deux seulement :
 *
 *   - PONCTUELLE  : une période (`date_debut` → `date_fin`). Des vacances,
 *     un congrès, un arrêt maladie.
 *   - RÉCURRENTE  : un jour de la semaine (`jour_semaine`, 0 = dimanche).
 *
 * La récurrence ne fait pas double emploi avec `horaires_types` : elle dit
 * « je ne travaille pas le mercredi APRÈS-MIDI » sans toucher à l'horaire
 * d'ouverture affiché sur la fiche, et elle se lève d'un geste le jour où
 * le praticien reprend ce créneau.
 *
 * `heure_debut` / `heure_fin` nuls = journée entière. C'est le cas courant,
 * et c'est la valeur par défaut de l'écran.
 */
create table if not exists absences (
  id uuid primary key default gen_random_uuid(),
  medecin_id uuid not null references medecins (id) on delete cascade,
  /** Ce que le praticien lit dans sa liste : « Vacances annuelles ». */
  motif text not null,
  date_debut date,
  date_fin date,
  /** 0 = dimanche, comme `horaires_types.jour_semaine` et `extract(dow)`. */
  jour_semaine smallint,
  heure_debut time,
  heure_fin time,
  cree_le timestamptz not null default now(),

  constraint absence_forme check (
    (date_debut is not null and date_fin is not null and jour_semaine is null)
    or (jour_semaine is not null and date_debut is null and date_fin is null)
  ),
  constraint absence_periode check (date_debut is null or date_fin >= date_debut),
  constraint absence_jour check (jour_semaine is null or jour_semaine between 0 and 6),
  -- Les deux heures vont ensemble : une seule renseignée ne veut rien dire.
  constraint absence_heures check (
    (heure_debut is null and heure_fin is null)
    or (heure_debut is not null and heure_fin is not null and heure_fin > heure_debut)
  ),
  constraint absence_motif check (length(btrim(motif)) between 2 and 80)
);

create index if not exists absences_medecin on absences (medecin_id);

alter table absences enable row level security;

/*
 * Qui voit, qui écrit.
 *
 * La LECTURE n'est PAS publique : le motif d'une absence regarde le
 * praticien (« Arrêt maladie » n'a rien à faire sur une fiche publique).
 * Le patient n'a pas besoin de la lire pour autant — les créneaux lui
 * arrivent déjà fermés par `heures_indisponibles`, qui est SECURITY
 * DEFINER et ne rend que des heures, jamais un motif.
 *
 * L'ÉCRITURE suit la règle des créneaux : le praticien, et l'assistant(e)
 * à qui il a confié « Ouvrir / fermer des créneaux ». Poser un congé et
 * fermer une journée à la main sont le même geste, ils demandent le même
 * droit.
 */
drop policy if exists sel_absences on absences;
create policy sel_absences on absences for select
  using (medecin_id = auth.uid()
         or (medecin_id = medecin_de_assistant() and assistant_a_permission('peut_voir_agenda'))
         or est_admin());

drop policy if exists mod_absences on absences;
create policy mod_absences on absences for all
  using (medecin_id = auth.uid()
         or (medecin_id = medecin_de_assistant() and assistant_a_permission('peut_gerer_creneaux')))
  with check (medecin_id = auth.uid()
              or (medecin_id = medecin_de_assistant() and assistant_a_permission('peut_gerer_creneaux')));

-- ---------- 2. La règle, écrite une seule fois ----------
/*
 * Ce créneau tombe-t-il dans une absence ?
 *
 * Une seule définition, appelée par les trois fonctions qui jugent d'un
 * créneau. Trois copies de ce `between` auraient divergé au premier
 * correctif — et une divergence ici se paie en rendez-vous pris pendant
 * des vacances.
 */
create or replace function absence_couvre(
  p_medecin_id uuid,
  p_date date,
  p_heure time
) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from absences a
    where a.medecin_id = p_medecin_id
      and (
        (a.date_debut is not null and p_date between a.date_debut and a.date_fin)
        or (a.jour_semaine is not null and a.jour_semaine = extract(dow from p_date)::int)
      )
      and (a.heure_debut is null or (p_heure >= a.heure_debut and p_heure < a.heure_fin))
  );
$$;

grant execute on function absence_couvre(uuid, date, time) to anon, authenticated;

-- ---------- 3. Les créneaux fermés par une absence ----------
/*
 * `heures_indisponibles` est la porte unique par laquelle la fiche
 * publique, la page de résultats et l'écran mobile lisent ce qui n'est pas
 * libre. En passant par elle, une absence ferme les créneaux PARTOUT sans
 * qu'aucun écran ait à y penser — et surtout sans qu'un écran puisse
 * oublier d'y penser.
 *
 * Les créneaux portant déjà une exception sont écartés : l'exception a le
 * dernier mot (voir l'ordre de précédence en tête de fichier), et deux
 * lignes contradictoires pour la même heure laisseraient le client
 * trancher au hasard de l'ordre d'arrivée.
 */
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
    and ce.date between p_debut and p_fin
  union
  -- Fermetures dues aux congés, limitées aux heures d'ouverture du jour :
  -- inutile d'annoncer fermé ce qui l'était déjà.
  select j.jour, g.heure, 'ferme'::etat_creneau
  from generate_series(p_debut, p_fin, interval '1 day') as s(jour)
  cross join lateral (select s.jour::date as jour) j
  cross join grille_creneaux() g
  join horaires_types ht
    on ht.medecin_id = p_medecin_id
   and ht.jour_semaine = extract(dow from j.jour)::int
   and g.heure >= ht.heure_debut and g.heure < ht.heure_fin
  where absence_couvre(p_medecin_id, j.jour, g.heure)
    and not exists (
      select 1 from creneaux_exceptions ce
      where ce.medecin_id = p_medecin_id and ce.date = j.jour and ce.heure = g.heure
    );
$$;

grant execute on function heures_indisponibles(uuid, date, date) to anon, authenticated;

-- ---------- 4. On ne réserve pas pendant un congé ----------
/*
 * `creneau_ouvert_medecin` est le verrou de la prise de rendez-vous au
 * téléphone (migrations 0046 et 0048). Sans cette ligne, l'opérateur ne
 * verrait plus le créneau dans sa liste — mais la fonction de création
 * l'aurait quand même accepté s'il l'avait saisi à la main.
 *
 * Le reste est la copie conforme de la version 0046 : seule la branche
 * « horaire-type » change, l'exception gardant le dernier mot.
 */
create or replace function creneau_ouvert_medecin(
  p_medecin_id uuid,
  p_date date,
  p_heure time
) returns boolean
language sql stable security definer set search_path = public as $$
  select
    exists (select 1 from grille_creneaux() g where g.heure = p_heure)
    and not exists (
      select 1 from rendez_vous rv
      where rv.medecin_id = p_medecin_id
        and rv.date = p_date and rv.heure = p_heure
        and rv.statut <> 'annule'
    )
    and case
      when exists (
        select 1 from creneaux_exceptions ce
        where ce.medecin_id = p_medecin_id and ce.date = p_date and ce.heure = p_heure
      ) then exists (
        select 1 from creneaux_exceptions ce
        where ce.medecin_id = p_medecin_id and ce.date = p_date and ce.heure = p_heure
          and ce.etat = 'ouvert'
      )
      else exists (
        select 1 from horaires_types ht
        where ht.medecin_id = p_medecin_id
          and ht.jour_semaine = extract(dow from p_date)::int
          and p_heure >= ht.heure_debut and p_heure < ht.heure_fin
      ) and not absence_couvre(p_medecin_id, p_date, p_heure)
    end;
$$;

-- ---------- 5. « Le plus tôt disponible » saute les congés ----------
/*
 * Reprise de `prochaines_dispos_medecins` (0046) : les créneaux ouverts
 * par l'horaire-type sont filtrés des absences. Sans cela, l'écran du
 * centre d'appel annoncerait « libre demain 09:00 » chez un praticien en
 * vacances, et l'opérateur se ferait refuser la création au téléphone,
 * devant l'appelant.
 */
create or replace function prochaines_dispos_medecins(
  p_medecin_ids uuid[],
  p_jours int default 14
)
returns table (medecin_id uuid, jour date, heure time, libres_ce_jour bigint, libres_total bigint)
language sql stable security definer set search_path = public as $$
  with bornes as (
    select current_date as debut,
           current_date + greatest(coalesce(p_jours, 14), 1) as fin
  ),
  jours as (
    select d::date as jour from bornes b, generate_series(b.debut, b.fin, interval '1 day') d
  ),
  ouverts_type as (
    select ht.medecin_id, j.jour, g.heure
    from jours j
    cross join grille_creneaux() g
    join horaires_types ht
      on ht.medecin_id = any (p_medecin_ids)
     and ht.jour_semaine = extract(dow from j.jour)::int
     and g.heure >= ht.heure_debut and g.heure < ht.heure_fin
    where not absence_couvre(ht.medecin_id, j.jour, g.heure)
  ),
  ouverts_exception as (
    select ce.medecin_id, ce.date as jour, ce.heure
    from creneaux_exceptions ce, bornes b
    where ce.medecin_id = any (p_medecin_ids)
      and ce.date between b.debut and b.fin
      and ce.etat = 'ouvert'
      and exists (select 1 from grille_creneaux() g where g.heure = ce.heure)
  ),
  candidats as (
    select * from ouverts_type union select * from ouverts_exception
  ),
  libres as (
    select c.medecin_id, c.jour, c.heure
    from candidats c
    where (c.jour + c.heure) >= (now() at time zone 'UTC')
      and not exists (
        select 1 from rendez_vous rv
        where rv.medecin_id = c.medecin_id and rv.date = c.jour
          and rv.heure = c.heure and rv.statut <> 'annule'
      )
      and not exists (
        select 1 from creneaux_exceptions ce
        where ce.medecin_id = c.medecin_id and ce.date = c.jour
          and ce.heure = c.heure and ce.etat = 'ferme'
      )
  ),
  premier as (
    select distinct on (l.medecin_id) l.medecin_id, l.jour, l.heure
    from libres l
    order by l.medecin_id, l.jour, l.heure
  )
  select
    p.medecin_id, p.jour, p.heure,
    (select count(*) from libres l where l.medecin_id = p.medecin_id and l.jour = p.jour),
    (select count(*) from libres l where l.medecin_id = p.medecin_id)
  from premier p;
$$;

revoke all on function prochaines_dispos_medecins(uuid[], int) from public;
grant execute on function prochaines_dispos_medecins(uuid[], int) to authenticated;

-- ---------- 6. Ce que le praticien doit savoir avant de poser son congé ----------
/*
 * Combien de rendez-vous sont DÉJÀ pris sur la période ?
 *
 * Poser une absence n'annule rien : ce serait décider à la place du
 * praticien, et prévenir les patients demande un geste qui lui appartient.
 * Mais partir sans savoir qu'on laisse six personnes devant une porte
 * fermée n'est pas acceptable non plus. L'écran pose donc la question
 * avant d'enregistrer, et affiche la réponse.
 *
 * SECURITY DEFINER pour ne rendre qu'un NOMBRE : l'assistant(e) qui pose
 * un congé n'a pas à recevoir la liste des patients avec.
 */
create or replace function rdv_pendant_absence(
  p_medecin_id uuid,
  p_date_debut date default null,
  p_date_fin date default null,
  p_jour_semaine smallint default null,
  p_heure_debut time default null,
  p_heure_fin time default null
) returns integer
language plpgsql stable security definer set search_path = public as $$
declare n integer;
begin
  /*
   * Seuls le praticien, son assistant(e) et l'administration interrogent.
   *
   * Chaque comparaison est ramenée à un booléen franc : `medecin_de_assistant()`
   * rend NULL pour qui n'est pas assistant(e), et `not (false or null)` vaut
   * NULL — donc pas `true`, donc la garde ne se déclenchait pas. Un patient
   * obtenait le compte des rendez-vous de n'importe quel praticien.
   */
  if not (coalesce(p_medecin_id = auth.uid(), false)
          or coalesce(p_medecin_id = medecin_de_assistant(), false)
          or est_admin()) then
    raise exception 'Réservé au praticien et à son équipe.';
  end if;

  select count(*) into n
  from rendez_vous rv
  where rv.medecin_id = p_medecin_id
    and rv.statut <> 'annule'
    and rv.date >= current_date
    and (
      (p_date_debut is not null and rv.date between p_date_debut and p_date_fin)
      or (p_jour_semaine is not null and extract(dow from rv.date)::int = p_jour_semaine)
    )
    and (p_heure_debut is null or (rv.heure >= p_heure_debut and rv.heure < p_heure_fin));
  return n;
end;
$$;

revoke all on function rdv_pendant_absence(uuid, date, date, smallint, time, time) from public;
grant execute on function rdv_pendant_absence(uuid, date, date, smallint, time, time) to authenticated;
