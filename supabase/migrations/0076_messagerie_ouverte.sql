-- 0076 — Messagerie ouverte à tout l'annuaire
--
-- Jusqu'ici, écrire un message exigeait une relation de soins préalable
-- (`medecin_a_rdv_avec_patient`, posée en 0066) : un patient ne pouvait écrire
-- qu'aux médecins déjà consultés. Décision produit : un patient peut désormais
-- écrire à n'importe quel médecin validé de l'annuaire, sans RDV préalable.
--
-- On conserve tous les autres garde-fous :
--   • compte actif, expéditeur = utilisateur connecté ;
--   • la conversation reste strictement entre UN patient et UN médecin VALIDÉ
--     (impossible d'écrire à un autre patient, à un établissement, à un admin) ;
--   • un proche cité doit bien appartenir au patient ;
--   • seules les deux parties (ou l'assistant habilité) peuvent insérer.
--
-- Rien d'autre à changer : la lecture (`sel_messages`), la mise à jour du
-- « lu » et les policies Storage reposent déjà sur l'appartenance à la
-- conversation, jamais sur l'existence d'un rendez-vous.

drop policy if exists ins_messages on messages;
create policy ins_messages on messages for insert
  with check (
    compte_actif()
    and expediteur_id = auth.uid()
    -- La relation de soins n'est plus exigée ; on vérifie seulement que les
    -- deux extrémités sont bien un médecin validé et un patient.
    and exists (select 1 from medecins m where m.id = medecin_id and m.statut = 'valide')
    and exists (select 1 from utilisateurs u where u.id = patient_id and u.role = 'patient')
    and (proche_id is null or exists (
      select 1 from proches p where p.id = proche_id and p.patient_id = messages.patient_id
    ))
    and (
      patient_id = auth.uid()
      or medecin_id = auth.uid()
      or (medecin_id = medecin_de_assistant() and assistant_a_permission('peut_messagerie'))
    )
  );
