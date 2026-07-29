-- Genre du médecin (filtre « Sexe » de la recherche avancée, spec : un
-- patient peut vouloir consulter une femme ou un homme, notamment en
-- gynécologie).
--
-- Nullable et sans valeur par défaut : l'information n'est pas connue pour
-- les médecins déjà inscrits, et une valeur inventée serait pire qu'absente.
-- Le filtre ignore simplement les médecins non renseignés.
alter table medecins
  add column genre text check (genre in ('femme', 'homme'));

comment on column medecins.genre is
  'Genre du médecin, renseigné dans l''espace médecin. NULL = non précisé.';
