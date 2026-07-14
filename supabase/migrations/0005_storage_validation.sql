-- Bucket privé pour les documents de validation des professionnels.
-- Chaque professionnel dépose dans le dossier <son_uid>/… ; lecture
-- réservée au propriétaire et à l'administrateur (jamais les patients).
insert into storage.buckets (id, name, public)
values ('validation', 'validation', false)
on conflict (id) do nothing;

create policy "depot_validation_proprietaire"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'validation' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "lecture_validation_proprietaire"
  on storage.objects for select to authenticated
  using (bucket_id = 'validation'
         and ((storage.foldername(name))[1] = auth.uid()::text or est_admin()));
