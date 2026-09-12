-- ============================================================
-- Docteur 224 — Un rendez-vous ne se pose que sur un créneau ouvert
--
-- `rendez_vous` acceptait n'importe quel couple (date, heure). Vérifié :
-- avec une simple session patient, on posait un rendez-vous pendant les
-- congés du praticien, un jour de fermeture, et à 03:00 du matin — une
-- heure qui n'existe dans aucun écran, donc un rendez-vous que personne
-- n'aurait jamais vu arriver.
--
-- Rien ne verrouillait parce que chaque écran filtrait déjà : la grille du
-- praticien, le panneau de réservation et le centre d'appel ne proposent
-- que des créneaux ouverts. Mais un filtre d'affichage n'est pas un verrou,
-- et l'URL de réservation se forge.
--
-- Sans ce garde-fou, les congés posés par la migration 0052 ne seraient
-- qu'une convention d'affichage. Ce trigger est ce qui les rend réels.
--
-- Les RPC du centre d'appel (0046, 0048) appellent déjà
-- `creneau_ouvert_medecin` avant d'écrire : elles passent ici sans
-- changement, le trigger ne fait que refermer la porte qu'elles gardaient
-- déjà de leur côté.
-- ============================================================

create or replace function bloquer_rdv_creneau_ferme() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  /*
   * Seul un rendez-vous qui ARRIVE sur un créneau, ou qui CHANGE de
   * créneau, est examiné.
   *
   * C'est ce qui permet d'annuler, de confirmer ou de marquer honoré un
   * rendez-vous déjà pris alors que le praticien a fermé la journée
   * depuis — le contraire enfermerait les deux parties : le créneau est
   * fermé, donc on ne peut plus rien y toucher, pas même annuler.
   */
  if tg_op = 'UPDATE'
     and new.medecin_id is not distinct from old.medecin_id
     and new.date is not distinct from old.date
     and new.heure is not distinct from old.heure then
    return new;
  end if;

  -- Un rendez-vous annulé ne réserve rien : il n'a pas à être contrôlé.
  if new.statut = 'annule' then
    return new;
  end if;

  if not creneau_ouvert_medecin(new.medecin_id, new.date, new.heure) then
    raise exception 'Ce créneau n''est pas disponible à la réservation.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists rdv_creneau_ouvert on rendez_vous;
create trigger rdv_creneau_ouvert
  before insert or update on rendez_vous
  for each row execute function bloquer_rdv_creneau_ferme();
