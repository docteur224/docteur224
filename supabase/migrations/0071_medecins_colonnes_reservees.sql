-- ============================================================
-- 0071 — Ce qu'un médecin ne peut pas s'attribuer lui-même
--
-- `upd_medecins_soi` vérifie QUI écrit (`id = auth.uid()`), jamais QUOI.
-- Un médecin pouvait donc, depuis la console de son navigateur, modifier
-- n'importe quelle colonne de sa propre fiche — y compris trois qui ne lui
-- appartiennent pas :
--
--   • `etablissement_id` : il se rattachait à n'importe quel établissement
--     inscrit. Il entrait dans la liste du gestionnaire, dans ses
--     statistiques, et pesait sur le palier qui lui est FACTURÉ. Constaté
--     le 13/09/2026 avec un vrai compte, puis remis à null.
--   • `note_moyenne` / `nb_avis` : calculées depuis les avis publiés par
--     `recalculer_note_medecin`. Écrites à la main, elles affichaient une
--     note inventée jusqu'au prochain avis déposé.
--   • `en_vedette` : la mise en avant sur l'accueil, décidée par
--     l'administration (permissions « validations » / « pilotage »).
--
-- Même correctif que `medecins_statut_reserve` (0018), et pour la même
-- raison : une politique RLS dit qui écrit une LIGNE, pas quelles COLONNES.
-- PostgreSQL sait restreindre les colonnes par un GRANT, mais pas par
-- titulaire ni en fonction de l'ancienne valeur — d'où le trigger.
--
-- Les écritures légitimes passent par trois fonctions, qui lèvent un
-- indicateur le temps de leur écriture. On ne se contente pas d'exempter
-- `security definer` : ces fonctions s'exécutent avec l'`auth.uid()` de
-- l'appelant, elles sont donc indiscernables d'une écriture directe. Et on
-- ne se contente pas non plus de vérifier qu'une invitation acceptée
-- existe : elle survit au détachement, et laisserait un médecin se
-- rattacher à nouveau sans que l'établissement l'ait redemandé.
-- ============================================================

create or replace function trg_medecins_colonnes_reservees()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  -- Posé par les seules fonctions autorisées, et seulement le temps de
  -- leur écriture. `true` en troisième argument : la valeur ne vit que
  -- dans la transaction courante, et PostgREST en ouvre une par requête.
  systeme boolean := coalesce(current_setting('app.ecriture_reservee', true), '') = 'on';
begin
  -- Contextes serveur (clé de service, auth.uid() nul) et administration :
  -- même exemption que le garde-fou du statut.
  if auth.uid() is null or est_admin() then
    return new;
  end if;

  if new.etablissement_id is distinct from old.etablissement_id and not systeme then
    raise exception
      'Le rattachement à un établissement se décide par invitation, pas depuis la fiche.';
  end if;

  if (new.note_moyenne is distinct from old.note_moyenne
      or new.nb_avis is distinct from old.nb_avis) and not systeme then
    raise exception
      'La note et le nombre d''avis sont calculés à partir des avis publiés.';
  end if;

  if new.en_vedette is distinct from old.en_vedette then
    raise exception 'La mise en vedette est réservée à l''administration.';
  end if;

  return new;
end;
$$;

drop trigger if exists medecins_colonnes_reservees on medecins;
create trigger medecins_colonnes_reservees
before update on medecins
for each row execute function trg_medecins_colonnes_reservees();

-- ---------- Les trois écrivains légitimes ----------
-- Chacun repose l'indicateur après son écriture : la transaction peut
-- continuer, elle ne doit pas rester autorisée pour autant.

/* Acceptation d'une invitation par le médecin (0007). */
create or replace function repondre_invitation(p_invitation_id uuid, p_accepte boolean)
returns void
language plpgsql security definer set search_path = public as $$
declare inv invitations_etablissement%rowtype;
begin
  select * into inv from invitations_etablissement where id = p_invitation_id;
  if inv.id is null or inv.medecin_id <> auth.uid() then
    raise exception 'Invitation introuvable ou non destinée à ce compte';
  end if;
  if inv.statut <> 'envoyee' then
    raise exception 'Invitation déjà traitée';
  end if;
  update invitations_etablissement
    set statut = case when p_accepte then 'acceptee' else 'refusee' end
    where id = p_invitation_id;
  if p_accepte then
    perform set_config('app.ecriture_reservee', 'on', true);
    update medecins set etablissement_id = inv.etablissement_id where id = inv.medecin_id;
    perform set_config('app.ecriture_reservee', 'off', true);
  end if;
end;
$$;

/* Retrait d'un médecin par le gestionnaire de l'établissement (0054). */
create or replace function detacher_medecin(p_medecin_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_etab_id uuid;
  v_etab_nom text;
begin
  select m.etablissement_id into v_etab_id from medecins m where m.id = p_medecin_id;
  if v_etab_id is null then
    raise exception 'Ce médecin n''est rattaché à aucun établissement.';
  end if;

  select e.nom into v_etab_nom
  from etablissements e
  where e.id = v_etab_id and (e.gestionnaire_id = auth.uid() or est_admin());
  if v_etab_nom is null then
    raise exception 'Seul le gestionnaire de l''établissement peut retirer ce médecin.';
  end if;

  perform set_config('app.ecriture_reservee', 'on', true);
  update medecins set etablissement_id = null where id = p_medecin_id;
  perform set_config('app.ecriture_reservee', 'off', true);

  delete from invitations_etablissement
    where etablissement_id = v_etab_id and medecin_id = p_medecin_id;

  perform creer_notification(
    p_medecin_id, 'rattachement_retire', 'Rattachement retiré',
    v_etab_nom || ' a retiré votre rattachement.', '/espace-medecin/compte',
    'etablissement', v_etab_id);
end;
$$;

/* Recalcul de la note depuis les avis (0011). Passe de `sql` à `plpgsql`
   pour pouvoir lever l'indicateur : le calcul est inchangé. Appelée par le
   trigger sur `avis`, donc avec l'auth.uid() du patient qui vient de
   déposer son avis — sans l'indicateur, le garde-fou la bloquerait. */
create or replace function recalculer_note_medecin(p_medecin_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  perform set_config('app.ecriture_reservee', 'on', true);
  update medecins m
  set note_moyenne = coalesce(s.moyenne, 0),
      nb_avis      = coalesce(s.nb, 0)
  from (
    select round(avg(note)::numeric, 2) as moyenne, count(*) as nb
    from avis
    where medecin_id = p_medecin_id and statut = 'publie'
  ) s
  where m.id = p_medecin_id;
  perform set_config('app.ecriture_reservee', 'off', true);
end;
$$;
