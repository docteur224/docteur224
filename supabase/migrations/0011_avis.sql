-- ============================================================
-- Docteur 224 — Avis et notes
--
-- La table `avis` existait déjà (schéma 0001) mais n'était reliée à rien :
-- aucun avis ne pouvait être déposé, `medecins.note_moyenne` restait à 0 et
-- le médecin n'avait pas de droit de réponse. Cette migration :
--   1. rattache l'avis à une consultation honorée (une seule note par RDV) ;
--   2. ouvre le droit de réponse du médecin (colonnes + policy + garde) ;
--   3. recalcule note_moyenne / nb_avis automatiquement par trigger ;
--   4. publie l'avis directement (modération a posteriori par l'admin).
-- ============================================================

-- ---------- 1. Colonnes ----------
alter table avis add column if not exists reponse_medecin text;
alter table avis add column if not exists reponse_le timestamptz;

-- L'avis porte toujours sur une consultation précise : c'est ce qui garantit
-- qu'il vient d'un patient réellement reçu (spec : « après une consultation
-- honorée »). Les lignes orphelines éventuelles sont supprimées avant de
-- rendre la colonne obligatoire.
delete from avis where rendez_vous_id is null;
alter table avis alter column rendez_vous_id set not null;
alter table avis drop constraint if exists avis_rendez_vous_id_fkey;
alter table avis add constraint avis_rendez_vous_id_fkey
  foreign key (rendez_vous_id) references rendez_vous (id) on delete cascade;

-- Un seul avis par consultation.
create unique index if not exists idx_avis_rdv_unique on avis (rendez_vous_id);
create index if not exists idx_avis_medecin_statut on avis (medecin_id, statut);

-- Modération a posteriori : l'avis est visible dès son dépôt, l'admin peut le
-- masquer ensuite depuis l'écran Modération. Publier seulement après passage
-- de l'admin priverait les médecins de tout retour pendant des jours.
alter table avis alter column statut set default 'publie';

-- ---------- 2. Le rendez-vous autorise-t-il un avis ? ----------
-- Utilisée par la policy d'insertion : SECURITY DEFINER pour lire rendez_vous
-- sans dépendre des policies de cette table (et éviter toute récursion).
create or replace function peut_noter_rdv(p_rdv_id uuid, p_medecin_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from rendez_vous r
    where r.id = p_rdv_id
      and r.medecin_id = p_medecin_id
      and r.statut = 'honore'
      and r.patient_id = auth.uid()   -- jamais un RDV de proche : le proche n'a pas de compte
  );
$$;

-- ---------- 3. Recalcul de la note du médecin ----------
create or replace function recalculer_note_medecin(p_medecin_id uuid)
returns void
language sql security definer set search_path = public as $$
  update medecins m
  set note_moyenne = coalesce(s.moyenne, 0),
      nb_avis      = coalesce(s.nb, 0)
  from (
    select round(avg(note)::numeric, 2) as moyenne, count(*) as nb
    from avis
    where medecin_id = p_medecin_id and statut = 'publie'
  ) s
  where m.id = p_medecin_id;
$$;

create or replace function trg_recalculer_note()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform recalculer_note_medecin(coalesce(new.medecin_id, old.medecin_id));
  -- Un avis déplacé d'un médecin à l'autre n'arrive pas, mais si c'était le
  -- cas il faudrait rafraîchir les deux fiches.
  if tg_op = 'UPDATE' and new.medecin_id is distinct from old.medecin_id then
    perform recalculer_note_medecin(old.medecin_id);
  end if;
  return null;
end;
$$;

drop trigger if exists avis_recalcule_note on avis;
create trigger avis_recalcule_note
after insert or update or delete on avis
for each row execute function trg_recalculer_note();

-- ---------- 4. Garde : le médecin ne touche QUE sa réponse ----------
-- La policy `upd_avis_medecin` ci-dessous autorise l'UPDATE ; ce trigger
-- garantit qu'il ne peut pas en profiter pour réécrire la note ou le
-- commentaire du patient.
create or replace function trg_avis_reponse_seule()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if est_admin() then
    return new;
  end if;
  if auth.uid() = new.medecin_id then
    if new.note is distinct from old.note
       or new.commentaire is distinct from old.commentaire
       or new.statut is distinct from old.statut
       or new.patient_id is distinct from old.patient_id
       or new.rendez_vous_id is distinct from old.rendez_vous_id then
      raise exception 'Un médecin ne peut modifier que sa réponse à un avis.';
    end if;
    new.reponse_le := case when new.reponse_medecin is null then null else now() end;
  end if;
  return new;
end;
$$;

drop trigger if exists avis_reponse_seule on avis;
create trigger avis_reponse_seule
before update on avis
for each row execute function trg_avis_reponse_seule();

-- ---------- 5. RLS ----------
-- Insertion : auteur = patient connecté ET consultation honorée chez ce médecin.
drop policy if exists ins_avis on avis;
create policy ins_avis on avis for insert
  with check (patient_id = auth.uid() and peut_noter_rdv(rendez_vous_id, medecin_id));

-- Le médecin lit les avis qui le concernent (y compris ceux masqués, pour
-- savoir ce qui lui a été reproché) et répond aux siens.
create policy sel_avis_medecin on avis for select using (medecin_id = auth.uid());
create policy upd_avis_medecin on avis for update
  using (medecin_id = auth.uid()) with check (medecin_id = auth.uid());

-- Le patient corrige ou retire son propre avis tant qu'il en est l'auteur.
create policy upd_avis_auteur on avis for update
  using (patient_id = auth.uid()) with check (patient_id = auth.uid());

-- ---------- 6. Détail public des avis d'un médecin ----------
-- Les avis publiés sont lisibles par tous (policy `sel_avis_publies`), mais le
-- prénom de l'auteur vit dans `utilisateurs`, que l'anonyme ne peut pas lire.
-- Cette fonction expose le strict nécessaire pour la fiche publique.
create or replace function avis_publies_medecin(p_medecin_id uuid)
returns table (
  id uuid,
  note smallint,
  commentaire text,
  cree_le timestamptz,
  auteur text,
  reponse_medecin text,
  reponse_le timestamptz
)
language sql stable security definer set search_path = public as $$
  select a.id,
         a.note,
         a.commentaire,
         a.cree_le,
         -- Prénom + initiale du nom : identifiable par l'auteur, discret pour
         -- les autres (« Mariama D. »).
         trim(coalesce(u.prenom, '') || ' ' || coalesce(left(u.nom, 1) || '.', '')) as auteur,
         a.reponse_medecin,
         a.reponse_le
  from avis a
  join utilisateurs u on u.id = a.patient_id
  where a.medecin_id = p_medecin_id and a.statut = 'publie'
  order by a.cree_le desc;
$$;

grant execute on function avis_publies_medecin(uuid) to anon, authenticated;
grant execute on function peut_noter_rdv(uuid, uuid) to authenticated;

-- ---------- 7. Alignement des notes existantes ----------
-- Les fiches seedées portent des notes écrites en dur : on les remet en
-- cohérence avec les avis réellement publiés (0 s'il n'y en a aucun).
update medecins m
set note_moyenne = coalesce(s.moyenne, 0),
    nb_avis      = coalesce(s.nb, 0)
from (
  select med.id,
         (select round(avg(a.note)::numeric, 2) from avis a where a.medecin_id = med.id and a.statut = 'publie') as moyenne,
         (select count(*) from avis a where a.medecin_id = med.id and a.statut = 'publie') as nb
  from medecins med
) s
where m.id = s.id;
