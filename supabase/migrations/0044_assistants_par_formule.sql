-- ============================================================
-- Docteur 224 — Le nombre d'assistant(e)s dépend de la formule
--
-- /espace-medecin/equipe savait régler les permissions d'un(e) assistant(e)
-- mais pas en créer : « + Ajouter un(e) assistant(e) » était un bouton
-- désactivé, et les deux seuls comptes existants venaient du seed. Aucun
-- médecin n'a jamais pu monter son équipe.
--
-- Ce qui manquait vraiment, ce n'est pas le formulaire : c'est la RÈGLE
-- COMMERCIALE. Une place d'assistant(e) se vend avec la formule. On pose
-- donc le plafond là où vivent déjà les prix et les quotas SMS —
-- `tarifs_plateforme` — pour qu'il se règle depuis /espace-admin/abonnements
-- sans toucher au code le jour où Standard passera à deux places.
--
-- Le plafond s'entend PAR MÉDECIN, y compris sur les paliers établissement :
-- un(e) assistant(e) est rattaché(e) à un praticien (`assistants.medecin_id`),
-- jamais à une structure. Une clinique de dix médecins ouvre donc dix fois
-- le plafond de son palier.
--
-- Règle inchangée et rappelée ici : aucune permission d'assistant(e) n'ouvre
-- les dossiers médicaux ni les données financières (spec C.4.4).
-- ============================================================

-- ---------- 1. Le plafond, à côté des prix et des quotas SMS ----------
alter table tarifs_plateforme
  add column if not exists assistants_inclus integer not null default 1;

alter table tarifs_plateforme drop constraint if exists tarifs_assistants_positifs;
alter table tarifs_plateforme add constraint tarifs_assistants_positifs
  check (assistants_inclus >= 0);

comment on column tarifs_plateforme.assistants_inclus is
  'Assistant(e)s qu''un médecin de cette formule peut rattacher. Par médecin, y compris sur un palier établissement.';

-- Valeurs d'amorçage : commerciales, donc modifiables depuis l'écran admin.
-- On ne les écrase que si la colonne vient d'être créée (tout à 1).
update tarifs_plateforme set assistants_inclus = case formule
    when 'standard'  then 1
    when 'premium'   then 3
    when 'structure' then 2
    when 'cabinet'   then 3
    when 'clinique'  then 4
    when 'hopital'   then 5
    else 1
  end
  where not exists (select 1 from tarifs_plateforme where assistants_inclus <> 1);

-- ---------- 2. La formule qui s'applique à un médecin ----------
/*
 * Un praticien libéral porte son propre abonnement ; un médecin rattaché à
 * une structure est couvert par celui de son GESTIONNAIRE — c'est déjà la
 * règle des écrans admin (« l'abonnement est porté par le gestionnaire, pas
 * par la structure »).
 *
 * Seuls comptent les abonnements vivants : un abonnement expiré ou résilié
 * n'ouvre aucune place. C'est le sens même d'un plafond vendu avec la
 * formule — et les assistant(e)s déjà en place ne sont pas touché(e)s, le
 * plafond ne s'applique qu'aux nouvelles arrivées.
 */
create or replace function formule_du_medecin(p_medecin uuid)
returns formule_abonnement
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select a.formule from abonnements a
      where a.titulaire_id = p_medecin and a.statut in ('essai', 'actif')
      order by a.date_debut desc limit 1),
    (select a.formule
       from medecins m
       join etablissements e on e.id = m.etablissement_id
       join abonnements a on a.titulaire_id = e.gestionnaire_id
      where m.id = p_medecin and a.statut in ('essai', 'actif')
      order by a.date_debut desc limit 1)
  );
$$;

/** Places ouvertes à ce médecin ; 0 s'il n'a aucun abonnement vivant. */
create or replace function assistants_inclus_du_medecin(p_medecin uuid)
returns integer
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select t.assistants_inclus from tarifs_plateforme t
      where t.formule = formule_du_medecin(p_medecin)),
    0
  );
$$;

/*
 * Places occupées.
 *
 * Un compte DÉSACTIVÉ occupe toujours sa place : la place est attribuée à
 * une personne, pas à une session. Seul un compte fermé la libère — c'est
 * ce que l'écran annonce au médecin avant qu'il ne désactive.
 */
create or replace function assistants_utilises_du_medecin(p_medecin uuid)
returns integer
language sql stable security definer set search_path = public as $$
  select count(*)::integer
    from assistants a
    join utilisateurs u on u.id = a.id
   where a.medecin_id = p_medecin and u.statut <> 'supprime';
$$;

-- ---------- 3. Le plafond appliqué en base ----------
/*
 * Le contrôle vit ICI et pas seulement dans la route serveur : celle-ci
 * emploie la clé service_role, qui traverse la RLS. Sans ce trigger, le
 * plafond ne tiendrait qu'à une condition écrite en TypeScript.
 *
 * `after` serait trop tard pour un message utile, et `before` laisse la
 * transaction intacte : rien n'est écrit si le compte est en trop.
 */
create or replace function verifier_quota_assistants() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  places integer;
  occupees integer;
begin
  -- Rien à vérifier si l'assistant(e) ne change pas de médecin.
  if tg_op = 'UPDATE' and new.medecin_id is not distinct from old.medecin_id then
    return new;
  end if;

  places := assistants_inclus_du_medecin(new.medecin_id);
  occupees := assistants_utilises_du_medecin(new.medecin_id);

  if occupees >= places then
    raise exception
      'Formule % : % place(s) d''assistant(e). Fermez un compte ou changez de formule.',
      coalesce(formule_du_medecin(new.medecin_id)::text, 'sans abonnement actif'), places
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_quota_assistants on assistants;
create trigger trg_quota_assistants
  before insert or update of medecin_id on assistants
  for each row execute function verifier_quota_assistants();

-- ---------- 4. Ce que l'écran du médecin a besoin de savoir ----------
/*
 * Une seule fonction plutôt que trois allers-retours : l'écran affiche
 * « 1 / 1 place utilisée · formule Standard » en une lecture, et le bouton
 * « Ajouter » se ferme sur la même vérité que le trigger.
 */
create or replace function quota_assistants()
returns table (formule text, places integer, occupees integer)
language sql stable security definer set search_path = public as $$
  select formule_du_medecin(auth.uid())::text,
         assistants_inclus_du_medecin(auth.uid()),
         assistants_utilises_du_medecin(auth.uid())
  where exists (
    select 1 from utilisateurs where id = auth.uid() and role = 'medecin' and statut = 'actif'
  );
$$;

revoke execute on function quota_assistants() from public;
grant execute on function quota_assistants() to authenticated;

-- ---------- 5. RLS ----------
/*
 * Le médecin gère SON équipe, et lui seul : `mod_assistants_medecin` le
 * disait déjà. Ce qui change, c'est le versant admin — depuis la 0043, une
 * écriture d'administrateur relève d'une permission nommée, ici « Utilisateurs ».
 *
 * L'assistant(e), lui, ne s'accorde rien : sa ligne est lisible (il faut
 * bien que `useContextePro` lise ses permissions) mais jamais modifiable.
 */
drop policy if exists mod_assistants_medecin on assistants;
create policy mod_assistants_medecin on assistants for all
  using (medecin_id = auth.uid() or a_permission_admin('utilisateurs'))
  with check (medecin_id = auth.uid() or a_permission_admin('utilisateurs'));
