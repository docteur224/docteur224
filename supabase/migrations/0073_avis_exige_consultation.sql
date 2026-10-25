-- ============================================================
-- 0073 — Un avis exige une consultation honorée
--
-- `peut_noter_rdv` existe depuis la migration 0011 et fait exactement ce
-- qu'il faut : le rendez-vous doit appartenir à l'auteur, concerner le
-- médecin noté, et porter le statut « honoré ». Seulement, PLUS AUCUNE
-- policy ne l'appelait.
--
-- La migration 0051 a rouvert `ins_avis` pour y ajouter `compte_actif()`
-- — un compte suspendu ne doit plus déposer d'avis — et l'a recréée sans
-- reconduire la condition d'origine :
--
--     0011 : patient_id = auth.uid() and peut_noter_rdv(…)
--     0051 : compte_actif() and patient_id = auth.uid()
--
-- Conséquence en production : n'importe quel compte actif pouvait noter
-- n'importe quel praticien, en rattachant son avis à un rendez-vous qui
-- n'a jamais eu lieu — réservé puis annulé, ou simplement à venir. Seule
-- l'unicité par rendez-vous limitait la casse. Pour une plateforme dont
-- les patients choisissent sur la note, c'est la note elle-même qui
-- perdait son sens.
--
-- La même migration 0051 avait recréé `ins_messages` de la même façon ;
-- celle-là a retrouvé sa condition de relation de soins en 0066. Vérifié :
-- `avis` était la dernière à en manquer.
--
-- Leçon, plus générale que ce correctif : un `drop policy` suivi d'un
-- `create policy` repart de zéro. Ajouter une condition à une policy
-- existante demande de recopier TOUTES les précédentes, et rien dans
-- PostgreSQL ne signale l'oubli.
-- ============================================================

drop policy if exists ins_avis on avis;
create policy ins_avis on avis for insert
  with check (
    compte_actif()
    and patient_id = auth.uid()
    and peut_noter_rdv(rendez_vous_id, medecin_id)
  );
