-- ============================================================
-- Docteur 224 — Documents partagés avec le médecin : rendus atteignables
--
-- Constat : un patient peut partager un document qui concerne un PROCHE
-- (ex. son enfant) avec un médecin qui n'a jamais eu de rendez-vous avec ce
-- proche. La RLS autorisait déjà la lecture (policy sel_docs via
-- partages_document), mais aucun écran ne menait à ce document : la liste
-- des patients d'un médecin (RPC patients_du_medecin) ne montre que les
-- personnes avec qui il a un historique de rendez-vous. Le document devenait
-- lisible en théorie, invisible en pratique.
-- ============================================================

create or replace function documents_partages_medecin()
returns table (
  document_id uuid,
  titre text,
  type text,
  contenu text,
  fichier_path text,
  fichier_nom text,
  cree_le timestamptz,
  origine origine_document,
  redige_par text,
  patient_nom text,
  pour_qui text,
  partage_le timestamptz
)
language sql stable security definer set search_path = public as $$
  select
    d.id, d.titre, d.type::text, d.contenu, d.fichier_path, d.fichier_nom, d.cree_le,
    d.origine,
    case when d.origine = 'medecin' then nom_medecin(d.medecin_id) else null end,
    coalesce(
      (select trim(coalesce(u.prenom, '') || ' ' || coalesce(u.nom, ''))
       from patients p join utilisateurs u on u.id = p.id
       where p.id = d.patient_id),
      (select trim(coalesce(u.prenom, '') || ' ' || coalesce(u.nom, ''))
       from proches pr join patients p on p.id = pr.patient_id join utilisateurs u on u.id = p.id
       where pr.id = d.proche_id)
    ),
    case
      when d.proche_id is not null then
        (select trim(coalesce(pr.prenom, '') || ' ' || coalesce(pr.nom, '')) from proches pr where pr.id = d.proche_id)
      else 'Lui-même'
    end,
    pd.cree_le
  from partages_document pd
  join documents_patient d on d.id = pd.document_id
  where pd.medecin_id = auth.uid()
  order by pd.cree_le desc;
$$;

-- Le lien de la notification pointait sur la liste des patients, qui ne
-- contient justement pas forcément la personne concernée.
create or replace function notifier_partage() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  titre_doc text;
begin
  select titre into titre_doc from documents_patient where id = new.document_id;
  perform creer_notification(
    new.medecin_id, 'document', 'Document partagé avec vous',
    'Un patient a partagé : ' || coalesce(titre_doc, 'un document'),
    '/espace-medecin/documents-partages'
  );
  return new;
end;
$$;
