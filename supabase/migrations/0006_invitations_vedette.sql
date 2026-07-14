-- Invitations d'un établissement vers un médecin (rattachement réel :
-- l'acceptation écrit medecins.etablissement_id).
create table invitations_etablissement (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references etablissements (id) on delete cascade,
  medecin_id uuid not null references medecins (id) on delete cascade,
  statut text not null default 'envoyee' check (statut in ('envoyee', 'acceptee', 'refusee')),
  cree_le timestamptz not null default now(),
  unique (etablissement_id, medecin_id)
);

alter table invitations_etablissement enable row level security;

create policy sel_invitations on invitations_etablissement for select
  using (
    medecin_id = auth.uid()
    or exists (select 1 from etablissements e where e.id = etablissement_id and e.gestionnaire_id = auth.uid())
    or est_admin()
  );
create policy ins_invitations on invitations_etablissement for insert
  with check (exists (select 1 from etablissements e where e.id = etablissement_id and e.gestionnaire_id = auth.uid()) or est_admin());
-- Le médecin répond (accepte/refuse) ; le gestionnaire peut annuler.
create policy upd_invitations on invitations_etablissement for update
  using (medecin_id = auth.uid()
         or exists (select 1 from etablissements e where e.id = etablissement_id and e.gestionnaire_id = auth.uid())
         or est_admin());
create policy del_invitations on invitations_etablissement for delete
  using (exists (select 1 from etablissements e where e.id = etablissement_id and e.gestionnaire_id = auth.uid()) or est_admin());

-- Mise en avant (pilotage admin) : médecins « en vedette » sur l'accueil.
alter table medecins add column en_vedette boolean not null default false;
