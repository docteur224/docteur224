-- Tri des résultats par « disponibilité la plus proche » (page publique).
--
-- La fonction `prochaines_dispos_medecins` (0046, reprise en 0052) calcule
-- déjà, en UN seul appel, le premier créneau réservable de chaque médecin —
-- RDV pris, créneaux fermés et congés déduits. La page de résultats publique
-- s'en sert pour ordonner la liste, et elle tourne en ANONYME (visiteur sans
-- compte). Or le droit d'exécution n'avait été accordé qu'à `authenticated`
-- (0052) — alors que 0081 annonçait pourtant cette fonction comme donnée
-- « publiquement », au même titre que `heures_indisponibles`, et que le test
-- de sécurité attend un accès anonyme « (résultats) ».
--
-- On comble le grant manquant. La fonction ne révèle aucune donnée
-- personnelle : seulement une date, une heure et un nombre de créneaux
-- libres — même profil que `heures_indisponibles`, déjà publique. SECURITY
-- DEFINER, inchangée par ailleurs. Rejouable sans casse.

grant execute on function public.prochaines_dispos_medecins(uuid[], int) to anon;
