-- ============================================================
-- Docteur 224 — Suivi d'absence (aide à la décision contre le no-show)
--
-- Un outil qui INFORME. Il ne sanctionne pas, il ne bloque personne, et rien
-- ici ne ferme un créneau ni ne refuse une réservation : c'est une lecture
-- des rendez-vous déjà qualifiés, posée sous les yeux du praticien au moment
-- où il décide.
--
-- Rien n'est recalculé. La présence est tranchée depuis la 0075 par
-- `qualifier_rdv`, seul chemin d'écriture d'un statut de présence :
--
--     honoré  → le patient est venu
--     absent  → il ne s'est pas présenté (no-show)
--     annulé  → un fait à part, qui N'EST PAS un no-show
--
-- Cette migration n'ajoute donc aucun statut, ne touche à aucun enum et ne
-- modifie aucune fonction existante. Elle ajoute deux tables de réglage et
-- de suivi, et des fonctions de LECTURE qui agrègent `rendez_vous`.
--
-- Trois décisions qui expliquent la forme du reste :
--
--   1. Le compteur est PAR MÉDECIN. Un patient qui manque ses rendez-vous
--      chez l'un n'a rien à se reprocher chez l'autre, et un praticien n'a
--      pas à lire le passé d'un confrère. Le médecin concerné est résolu
--      comme partout ailleurs (`suivi_absence_medecin`) : lui-même, ou celui
--      auquel l'assistant est rattaché. L'agrégation au niveau d'un cabinet,
--      si elle vient un jour, se fera en élargissant cette seule fonction —
--      sans toucher au calcul. Elle n'ouvrira RIEN à l'espace établissement,
--      qui voit la charge et jamais la patientèle.
--
--   2. Le NIVEAU de signal (correct / à surveiller / à risque) ne se calcule
--      PAS ici. La base rend les comptes bruts — absences, rendez-vous
--      terminés, date de la dernière absence — et lib/suivi-absence.ts en
--      déduit le niveau, comme lib/statuts-rdv.ts déduit « à qualifier ».
--      Une règle de seuils écrite aux deux endroits finirait par dire deux
--      choses différentes le jour où l'une des deux serait ajustée.
--
--   3. La clémence (« réinitialiser le compteur ») n'EFFACE rien. Elle pose
--      une date, et le compteur du patient repart d'après elle. Les
--      rendez-vous, eux, restent tels qu'ils ont eu lieu : un dossier ne se
--      réécrit pas pour arranger un compteur.
--
-- Fuseau : la base tourne en UTC, qui est l'heure locale de Guinée.
-- `current_date` est donc bien la date du jour à Conakry.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Réglages du praticien
-- ------------------------------------------------------------
/*
 * Des seuils par défaut, ajustables. Les valeurs retenues :
 *
 *   à surveiller : 2 absences ;
 *   à risque     : 3 absences, OU 30 % de no-show à partir de 3 rendez-vous
 *                  terminés.
 *
 * Le minimum de rendez-vous n'est pas un détail : sans lui, un patient
 * absent à son tout premier rendez-vous afficherait 100 % de no-show et
 * basculerait « à risque » sur un seul fait. Trois absences sur quarante et
 * trois sur quatre ne se lisent pas de la même façon — c'est précisément ce
 * que le taux apporte, et il n'a de sens qu'au-delà d'une poignée de
 * rendez-vous.
 *
 * Calquée sur `preferences_rappels` (0036) : une ligne par titulaire, créée
 * à la demande, absente tant que rien n'a été changé. Pas de ligne = valeurs
 * par défaut, écrites une seule fois côté TypeScript.
 */
create table if not exists suivi_absence_parametres (
  medecin_id uuid primary key references medecins (id) on delete cascade,
  seuil_bas smallint not null default 2 check (seuil_bas >= 1),
  seuil_haut smallint not null default 3 check (seuil_haut >= 1),
  -- Part de no-show à partir de laquelle on passe « à risque ». 0.30 = 30 %.
  taux_haut numeric(4, 3) not null default 0.300 check (taux_haut > 0 and taux_haut <= 1),
  -- En deçà de ce nombre de rendez-vous terminés, le TAUX ne déclenche rien.
  mini_rdv smallint not null default 3 check (mini_rdv >= 1),
  periode_mois smallint not null default 12 check (periode_mois between 1 and 60),
  canal_defaut text not null default 'whatsapp'
    check (canal_defaut in ('whatsapp', 'sms', 'email')),
  modele_message text not null default
    'Bonjour [Prénom], nous avons remarqué plusieurs rendez-vous non honorés avec [professionnel]. Les créneaux sont précieux et d''autres patients attendent. Merci de penser à annuler à l''avance en cas d''empêchement. Nous restons disponibles pour vous.'
    check (length(modele_message) between 20 and 1000),
  maj_le timestamptz not null default now(),
  -- Le seuil haut au-dessus du bas, sinon « à surveiller » ne serait jamais
  -- atteint : on passerait directement « à risque ».
  constraint suivi_absence_seuils_ordonnes check (seuil_haut >= seuil_bas)
);

alter table suivi_absence_parametres enable row level security;

-- Lecture : le praticien et son secrétariat — ils travaillent sur les mêmes
-- signaux, et un signal qu'on ne sait pas lire ne sert à rien.
drop policy if exists sel_suivi_abs_param on suivi_absence_parametres;
create policy sel_suivi_abs_param on suivi_absence_parametres for select
  using (
    medecin_id = auth.uid()
    or medecin_id = medecin_de_assistant()
    or est_admin()
  );

-- Écriture : le médecin seul. Les seuils disent à partir de quand on
-- s'inquiète d'un patient ; c'est un réglage de pratique, pas un geste
-- d'accueil. Les ACTIONS (avertir, réinitialiser), elles, sont ouvertes au
-- secrétariat.
drop policy if exists ins_suivi_abs_param on suivi_absence_parametres;
create policy ins_suivi_abs_param on suivi_absence_parametres for insert
  with check (medecin_id = auth.uid() and compte_actif());

drop policy if exists upd_suivi_abs_param on suivi_absence_parametres;
create policy upd_suivi_abs_param on suivi_absence_parametres for update
  using (medecin_id = auth.uid() and compte_actif())
  with check (medecin_id = auth.uid());

-- ------------------------------------------------------------
-- 2. État de suivi d'un patient
-- ------------------------------------------------------------
/*
 * Ce que le praticien a FAIT, par patient : averti le…, compteur remis à
 * zéro le…, avec son motif. Les rendez-vous disent ce qui s'est passé ;
 * cette table dit ce qu'on en a fait.
 *
 * La clé est la clé composite déjà en service dans toute l'application
 * (lib/pro.ts, RPC `patients_du_medecin`) : « c-<uuid> » un compte patient,
 * « p-<uuid> » un proche, « s-<uuid> » une fiche cabinet sans compte. Un
 * proche est un patient à part entière : l'absence se compte sur la personne
 * qui avait rendez-vous, pas sur le titulaire du compte.
 *
 * Pas de clé étrangère, donc — elle pointerait vers trois tables. Le format
 * est tenu par un CHECK, et l'appartenance au praticien est vérifiée par les
 * fonctions d'écriture, qui sont le seul chemin.
 *
 * La TRACE ne vit pas ici : chaque geste écrit une ligne dans
 * `journal_audit` (qui, quoi, quand, pour qui), et chaque message parti est
 * journalisé dans `sms_envoyes` par `enregistrer_message`. Cette table ne
 * porte que l'état courant.
 */
create table if not exists suivi_absence_patients (
  medecin_id uuid not null references medecins (id) on delete cascade,
  cle_patient text not null
    check (cle_patient ~ '^[cps]-[0-9a-fA-F-]{36}$'),
  averti_le timestamptz,
  averti_par uuid references utilisateurs (id),
  nb_avertissements integer not null default 0 check (nb_avertissements >= 0),
  -- Geste de clémence : le compteur du patient repart d'après cette date.
  -- Les rendez-vous antérieurs restent au dossier, intacts.
  remis_a_zero_le timestamptz,
  remis_a_zero_par uuid references utilisateurs (id),
  motif text check (motif is null or length(motif) <= 500),
  maj_le timestamptz not null default now(),
  primary key (medecin_id, cle_patient)
);

alter table suivi_absence_patients enable row level security;

-- Lecture : le praticien et son secrétariat.
drop policy if exists sel_suivi_abs_patients on suivi_absence_patients;
create policy sel_suivi_abs_patients on suivi_absence_patients for select
  using (
    medecin_id = auth.uid()
    or medecin_id = medecin_de_assistant()
    or est_admin()
  );

/*
 * Aucune policy d'écriture : on n'écrit pas dans cette table depuis le
 * navigateur. Les deux gestes passent par `suivi_absence_reinitialiser` et
 * `suivi_absence_marquer_averti`, qui vérifient que le patient est bien
 * celui du praticien et déposent la trace. Une policy d'UPDATE permettrait
 * d'antidater une remise à zéro sans qu'aucun journal ne le voie.
 */

create index if not exists idx_suivi_abs_patients_medecin
  on suivi_absence_patients (medecin_id);

-- ------------------------------------------------------------
-- 3. L'index qui rend le calcul possible
-- ------------------------------------------------------------
/*
 * `idx_rdv_medecin_date` (0001) suffit à l'agenda, qui lit une fenêtre de
 * dates. Ici on lit douze mois en ne retenant que deux statuts sur six :
 * sans le statut dans l'index, chaque affichage relit l'année entière.
 * Purement additif — aucun index existant n'est touché.
 */
create index if not exists idx_rdv_medecin_statut_date
  on rendez_vous (medecin_id, statut, date);

-- ------------------------------------------------------------
-- 4. Quel médecin regarde-t-on ?
-- ------------------------------------------------------------
/*
 * La même résolution que `patients_du_medecin` (0015), sortie dans sa propre
 * fonction : c'est le seul endroit à élargir si l'agrégation par cabinet
 * est retenue un jour.
 */
create or replace function suivi_absence_medecin() returns uuid
language sql stable security definer set search_path = public as $$
  select case
    when exists (select 1 from medecins m where m.id = auth.uid()) then auth.uid()
    else medecin_de_assistant()
  end;
$$;

-- ------------------------------------------------------------
-- 5. Le calcul, écrit une seule fois
-- ------------------------------------------------------------
/*
 * Pour chaque patient du praticien, sur la période demandée :
 *
 *   absences          — rendez-vous passés en 'absent' ;
 *   termines          — 'honore' + 'absent' ;
 *   derniere_absence  — la date du dernier manquement.
 *
 * Ce qui N'ENTRE PAS dans le calcul, et pourquoi :
 *
 *   'annule'     — annuler à l'avance est le geste qu'on veut encourager.
 *                  Le compter comme un no-show reviendrait à reprocher au
 *                  patient d'avoir prévenu ;
 *   'en_attente',
 *   'confirme'   — rien n'est encore arrivé, ou personne n'a tranché. Un
 *                  rendez-vous « à qualifier » (passé, non tranché) n'est
 *                  ni honoré ni manqué : il attend le praticien ;
 *   'present'    — le patient est là, à l'accueil. Son rendez-vous n'est pas
 *                  terminé ; il le sera quand il passera en 'honore'.
 *
 * Le taux n'est pas calculé ici : deux entiers suffisent, et la division se
 * fait là où vit la règle des seuils.
 *
 * Fonction INTERNE : elle prend un médecin en paramètre, donc elle ne doit
 * pas être appelable depuis un client (voir les `revoke` en fin de fichier).
 * Les fonctions publiques ci-dessous passent par `suivi_absence_medecin()`.
 */
create or replace function suivi_absence_comptes(p_medecin uuid, p_mois int)
returns table (
  cle text,
  absences bigint,
  termines bigint,
  derniere_absence date
)
language sql stable security definer set search_path = public as $$
  with qualifies as (
    select
      case
        when rv.proche_id is not null then 'p-' || rv.proche_id
        when rv.patient_sans_compte_id is not null then 's-' || rv.patient_sans_compte_id
        else 'c-' || rv.patient_id
      end as cle,
      rv.date as jour,
      rv.statut as statut
    from rendez_vous rv
    where rv.medecin_id = p_medecin
      and rv.statut in ('honore', 'absent')
      and rv.date >= (current_date - make_interval(months => greatest(coalesce(p_mois, 12), 1)))::date
      and rv.date <= current_date
  )
  select
    q.cle,
    count(*) filter (where q.statut = 'absent')     as absences,
    count(*)                                        as termines,
    max(q.jour) filter (where q.statut = 'absent')  as derniere_absence
  from qualifies q
  left join suivi_absence_patients s
    on s.medecin_id = p_medecin and s.cle_patient = q.cle
  -- La clémence déplace le début de la période pour CE patient. Elle porte
  -- sur les deux compteurs à la fois : repartir de zéro sur les absences
  -- mais garder l'ancien total gonflerait artificiellement le taux.
  where s.remis_a_zero_le is null or q.jour > s.remis_a_zero_le::date
  group by q.cle;
$$;

-- ------------------------------------------------------------
-- 6. Les signaux (tableau de bord, fiche patient)
-- ------------------------------------------------------------
/*
 * La version légère : juste de quoi poser une pastille à côté d'un nom.
 * Appelée une fois par écran, elle rend une poignée de lignes — seuls les
 * patients qui ont au moins une absence. Les écrans n'ont donc jamais à
 * interroger la base patient par patient.
 *
 * La période est celle du praticien, pas celle de l'écran : un signal qui
 * changerait de sens d'une page à l'autre ne serait pas un signal.
 */
create or replace function suivi_absence_signaux()
returns table (
  cle text,
  absences bigint,
  termines bigint,
  derniere_absence date
)
language plpgsql stable security definer set search_path = public as $$
declare
  v_medecin uuid := suivi_absence_medecin();
  v_mois int;
begin
  if v_medecin is null then
    return;
  end if;
  select coalesce(
    (select p.periode_mois from suivi_absence_parametres p where p.medecin_id = v_medecin),
    12
  ) into v_mois;

  return query
    select c.cle, c.absences, c.termines, c.derniere_absence
    from suivi_absence_comptes(v_medecin, v_mois) c
    where c.absences > 0;
end;
$$;

-- ------------------------------------------------------------
-- 7. La liste du menu « Suivi d'absence »
-- ------------------------------------------------------------
/*
 * Les mêmes comptes, avec l'identité et l'état de suivi. Seuls les patients
 * ayant au moins une absence sur la période : au-delà, ce serait la liste de
 * la patientèle, qui a déjà son écran.
 *
 * Le volume rend la pagination inutile — on parle de dizaines de lignes, pas
 * de milliers — et son absence a un avantage : la page dispose de TOUS les
 * patients concernés, et peut donc compter elle-même combien sont « à
 * surveiller » et combien sont « à risque », avec la seule règle de seuils
 * qui existe.
 *
 * Téléphone et e-mail suivent la règle de `lib/rdv-messages` : pour un
 * proche, on écrit au TITULAIRE du compte, jamais à l'enfant ; une fiche
 * sans compte n'a pas d'adresse, c'est le sens même de « sans compte ».
 */
create or replace function suivi_absence_liste(p_mois int default null)
returns table (
  cle text,
  type_fiche text,
  nom text,
  prenom text,
  telephone text,
  email text,
  absences bigint,
  termines bigint,
  derniere_absence date,
  averti_le timestamptz,
  nb_avertissements int,
  remis_a_zero_le timestamptz,
  motif text
)
language plpgsql stable security definer set search_path = public as $$
declare
  v_medecin uuid := suivi_absence_medecin();
  v_mois int;
begin
  if v_medecin is null then
    return;
  end if;
  v_mois := coalesce(
    p_mois,
    (select p.periode_mois from suivi_absence_parametres p where p.medecin_id = v_medecin),
    12
  );

  return query
  with comptes as (
    select * from suivi_absence_comptes(v_medecin, v_mois) c where c.absences > 0
  )
  select
    c.cle,
    case substr(c.cle, 1, 1)
      when 'c' then 'compte'
      when 'p' then 'proche'
      else 'sans_compte'
    end,
    coalesce(u.nom, pr.nom, sc.nom, ''),
    coalesce(u.prenom, pr.prenom, sc.prenom, ''),
    coalesce(u.telephone, ut.telephone, sc.telephone, ''),
    coalesce(u.email, ut.email, ''),
    c.absences,
    c.termines,
    c.derniere_absence,
    s.averti_le,
    coalesce(s.nb_avertissements, 0),
    s.remis_a_zero_le,
    s.motif
  from comptes c
  left join patients p2
    on substr(c.cle, 1, 1) = 'c' and p2.id = substr(c.cle, 3)::uuid
  left join utilisateurs u on u.id = p2.id
  left join proches pr
    on substr(c.cle, 1, 1) = 'p' and pr.id = substr(c.cle, 3)::uuid
  left join utilisateurs ut on ut.id = pr.patient_id
  left join patients_sans_compte sc
    on substr(c.cle, 1, 1) = 's' and sc.id = substr(c.cle, 3)::uuid
  left join suivi_absence_patients s
    on s.medecin_id = v_medecin and s.cle_patient = c.cle
  order by c.absences desc, c.derniere_absence desc nulls last;
end;
$$;

-- ------------------------------------------------------------
-- 8. Les rendez-vous mois par mois
-- ------------------------------------------------------------
/*
 * Une série mensuelle, et la fin des chiffres de démonstration.
 *
 * Le tableau de bord affichait « 96 % de taux de présence » et la page
 * Statistiques « 142 RDV ce mois · 4 % d'annulation », écrits en dur dans le
 * JSX depuis la maquette. Les deux écrans et le nouveau menu lisent
 * désormais la même série : un seul calcul, donc aucune chance que la
 * présence affichée ici contredise le no-show affiché là.
 *
 * `annule` est rendu à part : un rendez-vous annulé n'est ni honoré, ni
 * manqué, et il ne doit alourdir aucun des deux taux. La présence se lit
 * sur les rendez-vous TERMINÉS (honorés + manqués), l'annulation sur le
 * total réservé.
 */
create or replace function rdv_mensuel_medecin(p_mois int default 6)
returns table (
  mois date,
  total bigint,
  honores bigint,
  absents bigint,
  annules bigint
)
language plpgsql stable security definer set search_path = public as $$
declare
  v_medecin uuid := suivi_absence_medecin();
  v_nb int := least(greatest(coalesce(p_mois, 6), 1), 36);
begin
  if v_medecin is null then
    return;
  end if;

  return query
  with mois_serie as (
    select generate_series(
      date_trunc('month', current_date) - make_interval(months => v_nb - 1),
      date_trunc('month', current_date),
      interval '1 month'
    )::date as debut
  )
  select
    m.debut,
    count(rv.id),
    count(rv.id) filter (where rv.statut = 'honore'),
    count(rv.id) filter (where rv.statut = 'absent'),
    count(rv.id) filter (where rv.statut = 'annule')
  from mois_serie m
  left join rendez_vous rv
    on rv.medecin_id = v_medecin
   and rv.date >= m.debut
   and rv.date < (m.debut + interval '1 month')::date
  group by m.debut
  order by m.debut;
end;
$$;

-- ------------------------------------------------------------
-- 9. Le résumé du menu
-- ------------------------------------------------------------
/*
 * Ce que la série mensuelle ne dit pas : le cumul sur la période de suivi,
 * et le prix d'une consultation.
 *
 * Les absences cumulées sont ici comptées SANS la clémence : une remise à
 * zéro est un geste envers un patient, pas une réécriture de la charge du
 * cabinet. Le créneau perdu l'a été.
 *
 * `tarif_reference` reprend mot pour mot la règle de `ligneDeReference()`
 * (lib/tarifs.ts) et du trigger `tarifs_medecin_synchro` (0027) : la
 * première ligne TARIFÉE valable au cabinet, à défaut la première tarifée.
 * Nul si le praticien n'affiche aucun prix ferme — le manque à gagner ne
 * s'affiche alors pas du tout, plutôt que de valoir zéro franc.
 */
create or replace function suivi_absence_resume(p_mois int default null)
returns table (
  periode_mois int,
  absences bigint,
  termines bigint,
  tarif_reference bigint
)
language plpgsql stable security definer set search_path = public as $$
declare
  v_medecin uuid := suivi_absence_medecin();
  v_mois int;
begin
  if v_medecin is null then
    return;
  end if;
  v_mois := coalesce(
    p_mois,
    (select p.periode_mois from suivi_absence_parametres p where p.medecin_id = v_medecin),
    12
  );

  return query
  select
    v_mois,
    count(*) filter (where rv.statut = 'absent'),
    count(*),
    (
      select t.montant::bigint
      from tarifs_medecin t
      where t.medecin_id = v_medecin and t.montant is not null
      order by (t.lieu in ('cabinet', 'tous')) desc, t.position, t.cree_le
      limit 1
    )
  from rendez_vous rv
  where rv.medecin_id = v_medecin
    and rv.statut in ('honore', 'absent')
    and rv.date >= (current_date - make_interval(months => v_mois))::date
    and rv.date <= current_date;
end;
$$;

-- ------------------------------------------------------------
-- 10. Les deux gestes, tracés
-- ------------------------------------------------------------
/*
 * Un patient appartient au praticien s'il a au moins un rendez-vous chez
 * lui, ou s'il est une fiche ouverte par son cabinet. Sans cette
 * vérification, on pourrait déposer un état de suivi — donc une ligne de
 * journal — sur n'importe quel identifiant.
 */
create or replace function suivi_absence_patient_du_medecin(p_medecin uuid, p_cle text)
returns boolean
language sql stable security definer set search_path = public as $$
  select case substr(p_cle, 1, 1)
    when 'c' then exists (
      select 1 from rendez_vous rv
      where rv.medecin_id = p_medecin and rv.patient_id = substr(p_cle, 3)::uuid)
    when 'p' then exists (
      select 1 from rendez_vous rv
      where rv.medecin_id = p_medecin and rv.proche_id = substr(p_cle, 3)::uuid)
    when 's' then exists (
      select 1 from patients_sans_compte sc
      where sc.medecin_id = p_medecin and sc.id = substr(p_cle, 3)::uuid)
    else false
  end;
$$;

/*
 * Réinitialiser : un geste de clémence, et non un effacement. On pose la
 * date, on garde le motif, on journalise. Les rendez-vous ne bougent pas.
 *
 * Ouvert au secrétariat comme au médecin : c'est un geste d'accueil, pris
 * souvent au téléphone, devant un patient qui explique. Le journal dit qui
 * l'a fait.
 */
create or replace function suivi_absence_reinitialiser(p_cle text, p_motif text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_medecin uuid := suivi_absence_medecin();
  v_motif text := nullif(trim(coalesce(p_motif, '')), '');
begin
  if v_medecin is null then
    raise exception 'Réservé au praticien et à son secrétariat.';
  end if;
  if p_cle !~ '^[cps]-[0-9a-fA-F-]{36}$' then
    raise exception 'Référence de patient invalide.';
  end if;
  if not suivi_absence_patient_du_medecin(v_medecin, p_cle) then
    raise exception 'Ce patient n''est pas le vôtre.';
  end if;

  insert into suivi_absence_patients (
    medecin_id, cle_patient, remis_a_zero_le, remis_a_zero_par, motif, maj_le
  )
  values (v_medecin, p_cle, now(), auth.uid(), v_motif, now())
  on conflict (medecin_id, cle_patient) do update
    set remis_a_zero_le = now(),
        remis_a_zero_par = auth.uid(),
        motif = v_motif,
        maj_le = now();

  perform ecrire_audit(
    'A réinitialisé le compteur d''absences d''un patient',
    'patient', nullif(substr(p_cle, 3), '')::uuid,
    jsonb_build_object('cle', p_cle, 'medecin', v_medecin, 'motif', v_motif)
  );
end;
$$;

/*
 * Marquer averti : appelée par la route serveur APRÈS l'envoi, parce que
 * c'est elle qui sait si le message est parti. Le compteur
 * `nb_avertissements` monte, il ne se remet jamais à zéro — c'est un
 * historique, pas un solde.
 */
create or replace function suivi_absence_marquer_averti(p_cle text, p_canal text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_medecin uuid := suivi_absence_medecin();
begin
  if v_medecin is null then
    raise exception 'Réservé au praticien et à son secrétariat.';
  end if;
  if p_cle !~ '^[cps]-[0-9a-fA-F-]{36}$' then
    raise exception 'Référence de patient invalide.';
  end if;
  if not suivi_absence_patient_du_medecin(v_medecin, p_cle) then
    raise exception 'Ce patient n''est pas le vôtre.';
  end if;

  insert into suivi_absence_patients (
    medecin_id, cle_patient, averti_le, averti_par, nb_avertissements, maj_le
  )
  values (v_medecin, p_cle, now(), auth.uid(), 1, now())
  on conflict (medecin_id, cle_patient) do update
    set averti_le = now(),
        averti_par = auth.uid(),
        nb_avertissements = suivi_absence_patients.nb_avertissements + 1,
        maj_le = now();

  perform ecrire_audit(
    'A envoyé un rappel de ponctualité à un patient',
    'patient', nullif(substr(p_cle, 3), '')::uuid,
    jsonb_build_object('cle', p_cle, 'medecin', v_medecin, 'canal', p_canal)
  );
end;
$$;

-- ------------------------------------------------------------
-- 11. Qui peut appeler quoi
-- ------------------------------------------------------------
-- Les deux fonctions qui prennent un médecin en paramètre ne sont pas des
-- portes d'entrée : sans ces révocations, PostgreSQL les ouvre à tout le
-- monde (EXECUTE est accordé à PUBLIC par défaut) et n'importe quel compte
-- connecté lirait les comptes d'absences d'un confrère.
revoke execute on function suivi_absence_comptes(uuid, int) from public;
revoke execute on function suivi_absence_comptes(uuid, int) from anon;
revoke execute on function suivi_absence_comptes(uuid, int) from authenticated;
revoke execute on function suivi_absence_patient_du_medecin(uuid, text) from public;
revoke execute on function suivi_absence_patient_du_medecin(uuid, text) from anon;
revoke execute on function suivi_absence_patient_du_medecin(uuid, text) from authenticated;

grant execute on function suivi_absence_medecin() to authenticated;
grant execute on function suivi_absence_signaux() to authenticated;
grant execute on function suivi_absence_liste(int) to authenticated;
grant execute on function suivi_absence_resume(int) to authenticated;
grant execute on function rdv_mensuel_medecin(int) to authenticated;
grant execute on function suivi_absence_reinitialiser(text, text) to authenticated;
grant execute on function suivi_absence_marquer_averti(text, text) to authenticated;

-- Les nouvelles fonctions et tables doivent être vues tout de suite par
-- l'API : PostgREST garde son propre cache du schéma.
notify pgrst, 'reload schema';
