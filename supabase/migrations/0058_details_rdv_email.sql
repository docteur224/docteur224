-- ============================================================
-- Docteur 224 — Ce qu'il faut savoir d'un rendez-vous pour en écrire l'e-mail
--
-- La phase 2 envoyait le titre et le corps de la notification, taillés pour
-- la cloche : « Dr Diallo — le 15 mars à 09:30. » C'est assez sous une icône,
-- c'est très peu dans une boîte de réception. Un courriel de confirmation doit
-- porter le praticien, sa spécialité, le lieu exact et le motif — et un
-- fichier d'agenda a besoin des mêmes éléments.
--
-- Pourquoi une fonction et pas une jointure PostgREST : `rendez_vous` mène à
-- `medecins`, qui mène à la fois à `utilisateurs`, `specialites`, `villes` et
-- `etablissements`. Écrire cela en sélecteur imbriqué expose aux erreurs de
-- relation ambiguë (PGRST201) qui, dans ce projet, se sont déjà traduites par
-- un écran vide SANS message d'erreur. Le SQL nomme ce qu'il joint.
--
-- SECURITY DEFINER sans garde d'appelant, comme `nom_medecin` : la fonction
-- n'est accordée qu'à la service_role, et c'est le serveur d'envoi qui
-- l'appelle, jamais un navigateur.
-- ============================================================

create or replace function details_rdv_email(p_rdv uuid)
returns table (
  id uuid,
  date date,
  heure time,
  motif text,
  lieu text,
  adresse_domicile text,
  statut statut_rdv,
  cree_le timestamptz,
  moment timestamptz,
  medecin text,
  specialite text,
  telephone text,
  -- Adresse affichable, déjà composée : l'établissement quand il y en a un,
  -- sinon le quartier et la ville. Un e-mail n'a pas à refaire cet arbitrage.
  ou_aller text
)
language sql stable security definer set search_path = public as $$
  select
    rv.id,
    rv.date,
    rv.heure,
    rv.motif,
    rv.lieu,
    rv.adresse_domicile,
    rv.statut,
    rv.cree_le,
    moment_rdv(rv.date, rv.heure),
    nom_medecin(rv.medecin_id),
    s.nom,
    coalesce(e.telephone, m.telephone_secretariat),
    case
      when rv.lieu = 'domicile' then coalesce(rv.adresse_domicile, 'À votre domicile')
      when e.id is not null then
        trim(e.nom || coalesce(' — ' || e.adresse, '')
             || coalesce(', ' || ve.nom, ''))
      else
        nullif(trim(coalesce(m.quartier, '') || coalesce(', ' || vm.nom, '')), '')
    end
  from rendez_vous rv
  join medecins m on m.id = rv.medecin_id
  left join specialites s on s.id = m.specialite_id
  left join etablissements e on e.id = m.etablissement_id
  left join villes ve on ve.id = e.ville_id
  left join villes vm on vm.id = m.ville_id
  where rv.id = p_rdv;
$$;

revoke execute on function details_rdv_email(uuid) from public, anon, authenticated;
