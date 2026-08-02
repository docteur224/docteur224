-- ============================================================
-- Docteur 224 — Écran /espace-admin/validations
--
-- Deux boutons de cet écran ne pouvaient rien produire :
--
--   1. « Demander un complément » n'écrivait qu'une ligne d'audit. Le
--      professionnel n'était prévenu de rien : son dossier restait en
--      attente sans qu'il sache qu'on attendait une pièce de lui.
--   2. Approuver / rejeter un ÉTABLISSEMENT ne notifiait personne — le
--      trigger de notification n'existait que pour les médecins.
--
-- `notifications` n'a aucune policy INSERT (seuls les triggers et fonctions
-- SECURITY DEFINER y écrivent) : la demande de complément passe donc par une
-- fonction dédiée, gardée par est_admin().
-- ============================================================

-- ---------- 1. Demande de complément de dossier ----------
create or replace function demander_complement_dossier(
  p_professionnel_id uuid,
  p_motif text default null
)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_role role_utilisateur;
  v_lien text;
begin
  if not est_admin() then
    raise exception 'Réservé à l''administrateur.';
  end if;

  select role into v_role from utilisateurs where id = p_professionnel_id;
  if v_role is null then
    raise exception 'Destinataire introuvable.';
  end if;

  -- L'établissement corrige sa fiche, le médecin son profil.
  v_lien := case
    when v_role = 'etablissement' then '/espace-etablissement/informations'
    else '/espace-medecin/profil'
  end;

  perform creer_notification(
    p_professionnel_id,
    'complement_dossier',
    'Complément de dossier demandé',
    coalesce(
      nullif(trim(p_motif), ''),
      'Un complément est nécessaire pour valider votre inscription.'
    ),
    v_lien,
    'validation',
    p_professionnel_id
  );
end;
$$;

revoke all on function demander_complement_dossier(uuid, text) from public;
grant execute on function demander_complement_dossier(uuid, text) to authenticated;

-- ---------- 2. Décision sur un établissement : prévenir le gestionnaire ----------
-- Pendant du trigger `medecin_notifie_validation` (migration 0013). Le
-- destinataire est le gestionnaire ; `creer_notification` ignore un
-- destinataire nul, donc un établissement sans gestionnaire ne casse rien.
create or replace function trg_notifier_validation_etablissement()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.statut is distinct from old.statut then
    if new.statut = 'valide' then
      perform creer_notification(
        new.gestionnaire_id, 'compte_valide', 'Établissement validé',
        'Votre établissement est en ligne : les patients peuvent le trouver.',
        '/espace-etablissement', 'etablissement', new.id);
    elsif new.statut = 'refuse' then
      perform creer_notification(
        new.gestionnaire_id, 'compte_refuse', 'Dossier à compléter',
        'La validation de votre établissement n''a pas abouti. Vérifiez vos documents.',
        '/espace-etablissement/informations', 'etablissement', new.id);
    end if;
  end if;
  return null;
end;
$$;

drop trigger if exists etablissement_notifie_validation on etablissements;
create trigger etablissement_notifie_validation
after update on etablissements
for each row execute function trg_notifier_validation_etablissement();
