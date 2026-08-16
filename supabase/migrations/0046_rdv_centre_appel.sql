-- ============================================================
-- Docteur 224 — Prise de rendez-vous par le centre d'appel (espace admin)
--
-- Le tableau de bord admin proposait « + RDV pour un patient » depuis les
-- maquettes, mais le bouton pointait sur /espace-medecin/nouveau-rdv : la
-- garde de rôle de MedecinShell renvoyait l'administrateur d'où il venait.
-- L'écran n'existait pas — et il ne pouvait pas être le même que celui du
-- praticien, qui réserve TOUJOURS sur son propre agenda alors que l'opérateur
-- du centre d'appel doit d'abord choisir le praticien.
--
-- Trois besoins que la RLS seule ne couvre pas :
--   1. chercher un appelant dans TOUTE la plateforme (comptes, proches,
--      fiches sans compte) — trois tables, un seul classement ;
--   2. savoir qui peut recevoir le patient le plus tôt — sinon l'opérateur
--      ouvre les agendas un par un pendant que l'appelant patiente ;
--   3. écrire le rendez-vous en UNE opération tracée : la création d'une
--      fiche puis celle du rendez-vous sont deux écritures, et si la seconde
--      échoue (créneau pris entre-temps), la première laisse une fiche
--      orpheline. C'est le défaut de `creerRdvDelegue` côté client.
--
-- Choix de périmètre : la prise de rendez-vous reste ouverte à TOUT compte
-- administrateur, sans permission dédiée. Les dix permissions de la 0043
-- cloisonnent des sections de la console (finance, modération…) ; répondre au
-- téléphone est le travail de toute l'équipe, modérateurs et support compris.
-- ============================================================

-- ---------- 1. Grille de créneaux, côté base ----------
--
-- Copie exacte de `HEURES_JOURNEE` (lib/donnees.ts) : 08:00 → 20:00 par pas
-- de 30 minutes. Elle est reproduite ici parce que la base doit pouvoir
-- juger seule si un créneau existe — un contrôle qui ne vivrait que dans le
-- navigateur ne verrouille rien.
create or replace function grille_creneaux()
returns table (heure time)
language sql immutable set search_path = public as $$
  select (time '08:00' + make_interval(mins => n))::time
  from generate_series(0, 720, 30) as n;
$$;

/*
 * Un créneau est-il ouvert chez ce praticien ?
 *
 * Mêmes règles que `statutCreneau` côté client, et dans le même ordre :
 * l'exception du jour prime sur l'horaire-type, un rendez-vous non annulé
 * ferme le créneau. Une exception `ouvert` ouvre un créneau hors plage —
 * c'est ainsi que le médecin ajoute une vacation exceptionnelle.
 */
create or replace function creneau_ouvert_medecin(
  p_medecin_id uuid,
  p_date date,
  p_heure time
) returns boolean
language sql stable security definer set search_path = public as $$
  select
    -- Le créneau doit appartenir à la grille : sinon l'agenda du praticien
    -- se retrouverait avec des rendez-vous à 08:07 que ses écrans n'affichent
    -- pas (ils énumèrent la grille, ils ne lisent pas les heures posées).
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
      )
    end;
$$;

-- ---------- 2. Qui peut recevoir le patient, et quand ? ----------
/*
 * Première disponibilité réelle de plusieurs praticiens, en UN aller-retour.
 *
 * L'écran de résultats calcule déjà cela côté client, mais en appelant
 * `heures_indisponibles` une fois par médecin : dix praticiens à l'écran =
 * dix requêtes pendant que l'appelant attend au téléphone. Ici tout est
 * calculé en SQL et l'opérateur peut trier sa liste par « le plus tôt ».
 *
 * Aucune donnée personnelle ne sort d'ici (comme `heures_indisponibles`) :
 * uniquement des heures libres.
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
  -- Créneaux ouverts par l'horaire-type…
  ouverts_type as (
    select ht.medecin_id, j.jour, g.heure
    from jours j
    cross join grille_creneaux() g
    join horaires_types ht
      on ht.medecin_id = any (p_medecin_ids)
     and ht.jour_semaine = extract(dow from j.jour)::int
     and g.heure >= ht.heure_debut and g.heure < ht.heure_fin
  ),
  -- …plus les vacations exceptionnelles, qui ouvrent hors plage.
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
    -- Le passé ne se réserve pas. La Guinée vit à UTC+0 toute l'année, et le
    -- serveur Supabase est en UTC : les deux horloges coïncident.
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

-- ---------- 3. Retrouver l'appelant dans toute la plateforme ----------
/*
 * Recherche unifiée sur les trois formes de bénéficiaire : titulaire d'un
 * compte, proche déclaré par un titulaire, fiche minimale créée au cabinet.
 * Bâtie sur le modèle de `patients_du_medecin` (0015) — nom, prénom, et
 * téléphone comparé chiffres à chiffres, la mise en forme variant d'une
 * saisie à l'autre.
 *
 * Deux garde-fous :
 *   - `est_admin()` explicite, la fonction traversant la RLS ;
 *   - au moins deux caractères de recherche. Sans cela, un appel sans
 *     argument déverserait l'annuaire complet des patients de la plateforme,
 *     ce qu'aucun écran n'a de raison d'afficher.
 *
 * `prochain_rdv_*` évite le doublon le plus fréquent du centre d'appel :
 * l'appelant a déjà un rendez-vous, il rappelle pour le confirmer.
 */
create or replace function rechercher_patients_centre_appel(
  p_recherche text default '',
  p_limite int default 12
)
returns table (
  cle text,
  type_fiche text,
  nom text,
  prenom text,
  telephone text,
  date_naissance date,
  titulaire text,
  lien text,
  ville text,
  statut_compte text,
  nb_rdv bigint,
  prochain_rdv_date date,
  prochain_rdv_heure time,
  prochain_rdv_medecin text
)
language plpgsql stable security definer set search_path = public as $$
declare
  v_q text := trim(coalesce(p_recherche, ''));
  v_chiffres text := regexp_replace(v_q, '\D', '', 'g');
begin
  if not est_admin() then
    raise exception 'Réservé aux administrateurs.' using errcode = '42501';
  end if;
  if length(v_q) < 2 then
    return;
  end if;

  return query
  with fiches as (
    select
      'c-' || p.id                              as cle,
      'compte'                                  as type_fiche,
      coalesce(u.nom, '')                       as nom,
      coalesce(u.prenom, '')                    as prenom,
      coalesce(u.telephone, '')                 as telephone,
      p.date_naissance                          as date_naissance,
      ''                                        as titulaire,
      ''                                        as lien,
      coalesce(v.nom, '')                       as ville,
      u.statut::text                            as statut_compte
    from patients p
    join utilisateurs u on u.id = p.id
    left join villes v on v.id = p.ville_id
    where u.statut <> 'supprime'

    union all

    select
      'p-' || pr.id, 'proche', pr.nom, pr.prenom, coalesce(u.telephone, ''),
      pr.date_naissance,
      trim(coalesce(u.prenom, '') || ' ' || coalesce(u.nom, '')),
      pr.lien, coalesce(v.nom, ''), u.statut::text
    from proches pr
    join patients p on p.id = pr.patient_id
    join utilisateurs u on u.id = p.id
    left join villes v on v.id = p.ville_id
    where u.statut <> 'supprime'

    union all

    select
      's-' || sc.id, 'sans_compte', sc.nom, sc.prenom, coalesce(sc.telephone, ''),
      null::date, '', '', '', 'sans_compte'
    from patients_sans_compte sc
  ),
  trouvees as (
    select f.* from fiches f
    where f.nom ilike '%' || v_q || '%'
       or f.prenom ilike '%' || v_q || '%'
       or (f.prenom || ' ' || f.nom) ilike '%' || v_q || '%'
       or (f.nom || ' ' || f.prenom) ilike '%' || v_q || '%'
       or (v_chiffres <> '' and regexp_replace(f.telephone, '\D', '', 'g') like '%' || v_chiffres || '%')
  ),
  -- Rendez-vous à venir du bénéficiaire, toutes colonnes de rattachement
  -- confondues : la clé porte déjà le type, on la reconstruit à l'identique.
  rdvs as (
    select
      case
        when rv.patient_id is not null then 'c-' || rv.patient_id
        when rv.proche_id is not null then 'p-' || rv.proche_id
        else 's-' || rv.patient_sans_compte_id
      end as cle,
      rv.date, rv.heure, rv.medecin_id
    from rendez_vous rv
    where rv.statut <> 'annule'
      and (rv.date > current_date
           or (rv.date = current_date and rv.heure >= (now() at time zone 'UTC')::time))
  ),
  prochains as (
    select distinct on (r.cle) r.cle, r.date, r.heure, r.medecin_id,
           (select count(*) from rdvs r2 where r2.cle = r.cle) as nb
    from rdvs r
    order by r.cle, r.date, r.heure
  )
  select
    t.cle, t.type_fiche, t.nom, t.prenom, t.telephone, t.date_naissance,
    t.titulaire, t.lien, t.ville, t.statut_compte,
    coalesce(pr.nb, 0),
    pr.date, pr.heure,
    case when pr.medecin_id is null then null else nom_medecin(pr.medecin_id) end
  from trouvees t
  left join prochains pr on pr.cle = t.cle
  -- Une correspondance exacte de téléphone remonte en tête : au téléphone,
  -- c'est le critère le plus sûr et le plus souvent donné en premier.
  order by
    (v_chiffres <> '' and regexp_replace(t.telephone, '\D', '', 'g') = v_chiffres) desc,
    t.nom, t.prenom
  limit greatest(coalesce(p_limite, 12), 1);
end;
$$;

revoke all on function rechercher_patients_centre_appel(text, int) from public;
grant execute on function rechercher_patients_centre_appel(text, int) to authenticated;

-- ---------- 4. Poser le rendez-vous, en une seule écriture tracée ----------
/*
 * Crée le rendez-vous pris au téléphone, et la fiche du patient si l'appelant
 * n'est pas encore connu. Le tout dans la transaction de la fonction : un
 * créneau raflé entre l'affichage et la validation annule aussi la fiche,
 * qui ne reste pas en base sans rendez-vous.
 *
 * SECURITY DEFINER — donc la RLS ne s'applique pas ici et la garde
 * `est_admin()` est la seule barrière : elle est explicite et en tête.
 * Les triggers, eux, continuent de s'appliquer : cohérence du lieu (0024),
 * notification du patient et du praticien (0013), unicité du créneau (0003).
 *
 * Ce que la fonction refuse, et pourquoi :
 *   - un praticien non validé : son dossier n'est pas ouvert au public ;
 *   - un créneau hors agenda : l'opérateur poserait un rendez-vous que les
 *     écrans du praticien n'affichent pas ;
 *   - un créneau passé.
 * Le délai de prévenance de 2 h, lui, n'est PAS opposé : un appel à 14 h pour
 * une consultation à 15 h est précisément ce que le centre d'appel traite.
 */
create or replace function creer_rdv_centre_appel(
  p_medecin_id uuid,
  p_date date,
  p_heure time,
  p_motif text default null,
  p_lieu text default 'cabinet',
  p_adresse_domicile text default null,
  -- Patient déjà connu : clé « c-… » (compte), « p-… » (proche), « s-… » (fiche).
  p_patient_cle text default null,
  -- Sinon, fiche minimale à créer.
  p_nouveau_nom text default null,
  p_nouveau_prenom text default null,
  p_nouveau_telephone text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_rdv uuid;
  v_fiche uuid;
  v_patient uuid;
  v_proche uuid;
  v_sans_compte uuid;
  v_type text;
  v_id text;
  v_nom text;
begin
  if not est_admin() then
    raise exception 'Réservé aux administrateurs.' using errcode = '42501';
  end if;

  if not exists (select 1 from medecins m where m.id = p_medecin_id and m.statut = 'valide') then
    raise exception 'Ce praticien n''est pas validé sur la plateforme.';
  end if;

  -- Cohérence des arguments AVANT l'agenda : un appel sans bénéficiaire est
  -- une erreur d'appel, pas un problème de créneau, et le dire dans cet ordre
  -- évite un message qui désigne la mauvaise cause.
  if coalesce(p_patient_cle, '') = ''
     and (coalesce(btrim(p_nouveau_nom), '') = '' or coalesce(btrim(p_nouveau_prenom), '') = '') then
    raise exception 'Choisissez un patient ou renseignez son nom et son prénom.';
  end if;

  if (p_date + p_heure) < (now() at time zone 'UTC') then
    raise exception 'Ce créneau est déjà passé.';
  end if;

  if not creneau_ouvert_medecin(p_medecin_id, p_date, p_heure) then
    raise exception 'Ce créneau n''est pas ouvert dans l''agenda du praticien.';
  end if;

  if coalesce(p_patient_cle, '') = '' then
    insert into patients_sans_compte (medecin_id, nom, prenom, telephone)
    values (p_medecin_id, btrim(p_nouveau_nom), btrim(p_nouveau_prenom),
            nullif(btrim(coalesce(p_nouveau_telephone, '')), ''))
    returning id into v_fiche;
    v_sans_compte := v_fiche;
    v_nom := btrim(p_nouveau_prenom) || ' ' || btrim(p_nouveau_nom);
  else
    -- La clé s'écrit « <type>-<uuid> » ; l'uuid contient lui-même des tirets,
    -- d'où le découpage par position et non par `split_part`.
    v_type := left(p_patient_cle, 1);
    v_id := substr(p_patient_cle, 3);
    if v_type = 'c' then
      v_patient := v_id::uuid;
      select trim(coalesce(u.prenom, '') || ' ' || coalesce(u.nom, ''))
        into v_nom from utilisateurs u where u.id = v_patient;
    elsif v_type = 'p' then
      v_proche := v_id::uuid;
      select trim(pr.prenom || ' ' || pr.nom) into v_nom from proches pr where pr.id = v_proche;
    elsif v_type = 's' then
      v_sans_compte := v_id::uuid;
      select trim(sc.prenom || ' ' || sc.nom) into v_nom
        from patients_sans_compte sc where sc.id = v_sans_compte;
    else
      raise exception 'Bénéficiaire inconnu.';
    end if;
    if v_nom is null then
      raise exception 'Ce patient n''existe plus.';
    end if;
  end if;

  begin
    insert into rendez_vous (
      medecin_id, date, heure, reserve_par, reserve_par_role,
      patient_id, proche_id, patient_sans_compte_id,
      motif, statut, source, lieu, adresse_domicile
    ) values (
      p_medecin_id, p_date, p_heure, auth.uid(), 'admin',
      v_patient, v_proche, v_sans_compte,
      nullif(btrim(coalesce(p_motif, '')), ''), 'confirme', 'telephone',
      case when p_lieu = 'domicile' then 'domicile' else 'cabinet' end,
      nullif(btrim(coalesce(p_adresse_domicile, '')), '')
    ) returning id into v_rdv;
  exception when unique_violation then
    raise exception 'Ce créneau vient d''être réservé par quelqu''un d''autre.';
  end;

  -- Un rendez-vous posé par un administrateur au nom d'un tiers doit laisser
  -- une trace nominative : c'est le principe du journal d'audit de la console.
  perform ecrire_audit(
    'A pris un rendez-vous pour un patient (centre d''appel)',
    'rendez_vous', v_rdv,
    jsonb_build_object(
      'cible', v_nom || ' · ' || nom_medecin(p_medecin_id) || ' · '
               || date_lisible(p_date, p_heure),
      'medecin_id', p_medecin_id,
      'nouvelle_fiche', v_fiche is not null
    )
  );

  return v_rdv;
end;
$$;

revoke all on function creer_rdv_centre_appel(uuid, date, time, text, text, text, text, text, text, text) from public;
grant execute on function creer_rdv_centre_appel(uuid, date, time, text, text, text, text, text, text, text) to authenticated;

-- ---------- 5. Ce que le centre d'appel vient de poser ----------
/*
 * Derniers rendez-vous pris par l'équipe d'administration. Sert de main
 * courante à l'écran : l'opérateur qui raccroche vérifie d'un coup d'œil ce
 * qu'il a enregistré, et son collègue voit ce qui vient d'être fait.
 *
 * La RLS donne déjà tout cela à un administrateur (`sel_rdv_admin`), mais
 * reconstituer le nom du bénéficiaire demande trois jointures conditionnelles
 * que PostgREST ne sait pas exprimer en une requête.
 */
create or replace function rdv_centre_appel_recents(p_limite int default 8)
returns table (
  id uuid,
  jour date,
  heure time,
  patient text,
  medecin text,
  motif text,
  lieu text,
  statut text,
  pris_par text,
  pris_le timestamptz
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not est_admin() then
    raise exception 'Réservé aux administrateurs.' using errcode = '42501';
  end if;

  return query
  select
    rv.id, rv.date, rv.heure,
    coalesce(
      trim(coalesce(up.prenom, '') || ' ' || coalesce(up.nom, '')),
      trim(pr.prenom || ' ' || pr.nom),
      trim(sc.prenom || ' ' || sc.nom),
      'Patient'
    ),
    nom_medecin(rv.medecin_id),
    coalesce(rv.motif, ''),
    coalesce(rv.lieu, 'cabinet'),
    rv.statut::text,
    trim(coalesce(ua.prenom, '') || ' ' || coalesce(ua.nom, '')),
    rv.cree_le
  from rendez_vous rv
  left join utilisateurs up on up.id = rv.patient_id
  left join proches pr on pr.id = rv.proche_id
  left join patients_sans_compte sc on sc.id = rv.patient_sans_compte_id
  left join utilisateurs ua on ua.id = rv.reserve_par
  where rv.reserve_par_role = 'admin'
  order by rv.cree_le desc
  limit greatest(coalesce(p_limite, 8), 1);
end;
$$;

revoke all on function rdv_centre_appel_recents(int) from public;
grant execute on function rdv_centre_appel_recents(int) to authenticated;
