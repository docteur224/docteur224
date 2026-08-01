-- ============================================================
-- 0018 — Parcours d'inscription professionnel multi-étapes
-- ------------------------------------------------------------
-- `etape_inscription` : étape courante du wizard d'inscription.
--   null = parcours terminé (tous les comptes existants le sont).
--   Praticien   : profil → lieu → documents → horaires → recap
--   Établissement : fiche → documents → recap
-- La colonne est posée par l'API d'inscription à la création du
-- compte, avancée par chaque étape, remise à null à la confirmation.
--
-- Au passage, correction d'un trou RLS : `upd_medecins_soi` et
-- `upd_etablissements` permettaient au titulaire de passer lui-même
-- son `statut` à 'valide'. Un trigger de garde réserve ce champ à
-- l'admin (et aux contextes serveur : auth.uid() null).
-- ============================================================

alter table medecins add column if not exists etape_inscription text;
alter table etablissements add column if not exists etape_inscription text;

create or replace function trg_statut_reserve_admin()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or est_admin() then
    return new;
  end if;
  if new.statut is distinct from old.statut then
    raise exception 'Le statut de validation est réservé à l''administrateur.';
  end if;
  return new;
end;
$$;

drop trigger if exists medecins_statut_reserve on medecins;
create trigger medecins_statut_reserve
before update on medecins
for each row execute function trg_statut_reserve_admin();

drop trigger if exists etablissements_statut_reserve on etablissements;
create trigger etablissements_statut_reserve
before update on etablissements
for each row execute function trg_statut_reserve_admin();
