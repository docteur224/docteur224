-- ============================================================
-- Docteur 224 — On n'écrit pas aux comptes de démonstration
--
-- Constaté à la mise en service : le passage en mode « réel » a expédié cinq
-- courriels vers des adresses `@test.docteur224.com`, qui n'existent chez
-- personne. Quatre rappels étaient programmés pour le lendemain.
--
-- Ce n'est pas un incident isolé : le jeu de démonstration vit dans la même
-- base que la production, et la moindre activité sur ces comptes — un test,
-- une démonstration commerciale, un clic de curiosité — produit des rebonds.
-- Or le rebond est précisément ce qui abîme la réputation d'un domaine
-- expéditeur, c'est-à-dire ce que SPF, DKIM et DMARC servent à construire.
--
-- `email_destinataire` écarte déjà les comptes supprimés, et pour cette
-- raison exacte : « lui écrire ne ferait qu'accumuler des rebonds et abîmer la
-- réputation d'expéditeur du domaine » (migration 0057). Le domaine réservé
-- aux comptes de démonstration relève de la même règle ; il a donc sa place
-- au même endroit, et non dans un filtre posé ailleurs qu'on oublierait.
--
-- Le jour où ces comptes disparaîtront, cette exclusion deviendra sans objet
-- sans rien casser.
-- ============================================================

create or replace function email_destinataire(p_utilisateur uuid)
returns text
language sql stable security definer set search_path = public as $$
  select u.email
  from utilisateurs u
  where u.id = p_utilisateur
    and u.statut = 'actif'
    and not u.suspendu_par_admin
    and u.email is not null
    and u.email <> ''
    -- Compte anonymisé : l'adresse de remplacement n'existe chez personne.
    and u.email not like 'supprime-%'
    -- Compte de démonstration : idem, et il en reste en base tant que la
    -- plateforme n'a pas sa propre vitrine.
    and u.email not like '%@test.docteur224.com'
$$;

/*
 * Les lignes déjà en file portent l'adresse figée au dépôt : la fonction ne
 * les rattrape pas. On les retire ici, une fois, pour que la migration laisse
 * la file dans l'état que la règle décrit.
 */
delete from emails_en_attente
where adresse like '%@test.docteur224.com'
  and etat in ('a_envoyer', 'en_cours');
