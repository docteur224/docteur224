-- ============================================================
-- Docteur 224 — Favoris : même règle, même message
--
-- Suite de la 0049. Le tour des écritures du parcours patient a montré
-- que `favoris` était la dernière porte encore ouverte sur ce défaut :
--
--   * `proches`, `rendez_vous`      → fermés en 0049 ;
--   * `avis`                        → déjà fermé, mais par la RLS :
--       `ins_avis` exige `peut_noter_rdv`, qu'aucun professionnel ne peut
--       satisfaire (il n'a pas de rendez-vous honoré à son propre nom).
--       L'appelant reçoit un 42501, que lib/avis.ts traduit déjà ;
--   * `documents_patient`, `transmissions_dossier` → écrits par le
--       praticien, avec l'identifiant d'un patient EXISTANT choisi dans une
--       liste : la clé étrangère n'a rien à refuser ;
--   * `signalements`                → indexé sur `utilisateurs`, et c'est
--       voulu : un praticien doit pouvoir signaler un avis abusif ;
--   * les écrans /patient/*         → hors d'atteinte, `PatientShell`
--       renvoie tout compte non patient vers son propre espace.
--
-- `favoris` échappait à tout cela parce que le cœur est monté sur la fiche
-- PUBLIQUE d'un médecin, que n'importe quel professionnel connecté peut
-- ouvrir. La policy `ins_favoris` ne vérifie que `patient_id = auth.uid()`
-- — vrai pour lui aussi — et seule la clé étrangère l'arrêtait. En silence :
-- BoutonFavori ne traite que le cas « non connecté », le cœur se remplissait
-- puis revenait en arrière sans un mot.
-- ============================================================

create or replace function trg_favori_titulaire_patient() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from patients where id = new.patient_id) then
    raise exception 'Les favoris sont réservés aux comptes patients.';
  end if;
  return new;
end;
$$;

drop trigger if exists favori_titulaire_patient on favoris;
create trigger favori_titulaire_patient
  before insert or update of patient_id on favoris
  for each row execute function trg_favori_titulaire_patient();
