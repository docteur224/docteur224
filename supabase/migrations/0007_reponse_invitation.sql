-- Réponse d'un médecin à une invitation de rattachement : seule cette
-- fonction peut écrire medecins.etablissement_id pour le compte du médecin
-- invité (le gestionnaire ne peut jamais modifier la fiche d'un médecin).
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
    update medecins set etablissement_id = inv.etablissement_id where id = inv.medecin_id;
  end if;
end;
$$;

grant execute on function repondre_invitation(uuid, boolean) to authenticated;

-- Préférences de l'espace établissement (affichage public, notifications…)
alter table etablissements add column parametres jsonb not null default '{}';
