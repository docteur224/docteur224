-- Réglages globaux de la plateforme (édités par l'admin, lisibles par tous
-- pour piloter le comportement du site : maintenance, inscriptions…).
create table parametres_plateforme (
  cle text primary key,
  valeur boolean not null
);

insert into parametres_plateforme (cle, valeur) values
  ('inscriptions_ouvertes', true),
  ('paiement_en_ligne', true),
  ('mode_maintenance', false);

alter table parametres_plateforme enable row level security;
create policy sel_parametres_plateforme on parametres_plateforme for select using (true);
create policy mod_parametres_plateforme on parametres_plateforme for all
  using (est_admin()) with check (est_admin());
