-- ============================================================
-- 0026 — Carte des médecins (vue mobile de /resultats)
--
-- Le champ `medecins.localisation` (0001) est du texte libre : soit
-- « lat, lon » relevé au GPS pendant l'inscription, soit une URL
-- Google Maps collée à la main. Sur les données réelles, 5 médecins
-- validés sur 13 le renseignent, et 2 de ces 5 ont collé un lien
-- court `maps.app.goo.gl` — dont on ne peut tirer aucun point sans
-- appeler Google. Une carte qui n'afficherait que les positions
-- exactes serait donc quasi vide.
--
-- D'où un repli : commune → ville. Ces deux référentiels existent
-- déjà (villes en 0001, communes en 0023) mais n'ont jamais porté de
-- coordonnées. On les leur ajoute, plutôt que de figer une table de
-- correspondance dans le code : une commune ajoutée depuis
-- /espace-admin/parametres doit pouvoir recevoir son centre sans
-- redéploiement.
--
-- Les colonnes restent nullables : une commune sans coordonnées se
-- rabat simplement sur sa ville, exactement comme une commune
-- inconnue. Ne jamais bloquer une saisie sur un référentiel
-- incomplet est la règle posée en 0023.
-- ============================================================

-- ---------- 1. Coordonnées des référentiels ----------
alter table villes add column if not exists latitude double precision;
alter table villes add column if not exists longitude double precision;
alter table communes add column if not exists latitude double precision;
alter table communes add column if not exists longitude double precision;

comment on column villes.latitude is
  'Centre approximatif de la ville, repli de la carte des médecins.';
comment on column communes.latitude is
  'Centre approximatif de la commune. Prioritaire sur celui de la ville.';

-- Centres des six villes du référentiel.
update villes as v set latitude = c.lat, longitude = c.lon
from (values
  ('Conakry',    9.50920::double precision, -13.71220::double precision),
  ('Kindia',    10.05690,                   -12.86580),
  ('Labé',      11.31670,                   -12.28330),
  ('Kankan',    10.38540,                    -9.30570),
  ('Nzérékoré',  7.75620,                    -8.81790),
  ('Mamou',     10.37560,                   -12.09130)
) as c(nom, lat, lon)
where v.nom = c.nom and v.latitude is null;

-- Centres des communes de Conakry (les seules seedées, cf. 0023).
update communes as m set latitude = c.lat, longitude = c.lon
from (values
  ('Kaloum',   9.50950::double precision, -13.71220::double precision),
  ('Dixinn',   9.53780,                   -13.67710),
  ('Matam',    9.52860,                   -13.66830),
  ('Ratoma',   9.58060,                   -13.63860),
  ('Matoto',   9.57690,                   -13.61060),
  ('Gbessia',  9.57720,                   -13.60890),
  ('Lambanyi', 9.61670,                   -13.60000),
  ('Sonfonia', 9.63330,                   -13.58330),
  ('Kagbelen', 9.70420,                   -13.52320),
  ('Manéah',   9.61690,                   -13.43610)
) as c(nom, lat, lon)
where m.nom = c.nom and m.latitude is null;

-- ---------- 2. Positions aberrantes ----------
-- Trois comptes de démonstration portaient « 48.93031, 2.21384 » et
-- voisins : la position réelle du poste de développement, en région
-- parisienne, relevée en testant le bouton « Récupérer ma position ».
-- Le code refuse déjà toute coordonnée hors de la Guinée (lib/carte.ts),
-- mais laisser la valeur en base la ferait réapparaître dans le champ
-- du profil et dans le lien « Voir l'itinéraire » de la fiche publique.
--
-- On ne touche qu'aux comptes de démonstration (@test.docteur224.com) :
-- effacer la position d'un praticien réel parce qu'elle sort d'un
-- rectangle serait une perte de donnée qu'aucun garde-fou ne justifie.
update medecins as m
set localisation = null
from utilisateurs as u
where u.id = m.id
  and u.email like '%@test.docteur224.com'
  and m.localisation ~ '^\s*-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?\s*$'
  and not (
    split_part(replace(m.localisation, ' ', ''), ',', 1)::double precision between 7.1 and 12.7
    and split_part(replace(m.localisation, ' ', ''), ',', 2)::double precision between -15.1 and -7.6
  );

-- Trois positions réelles de Conakry, pour que le cas « GPS relevé par
-- le praticien » existe dans la démonstration à côté des repères
-- approximatifs. Données de démonstration assumées : la clause ne vise
-- que les comptes @test.docteur224.com dépourvus de position.
update medecins as m
set localisation = c.point
from utilisateurs as u
join (values
  ('medecin1@test.docteur224.com', '9.53780, -13.67710'),  -- Hôpital Donka, Dixinn
  ('medecin2@test.docteur224.com', '9.59360, -13.64940'),  -- Kipé, Ratoma
  ('medecin3@test.docteur224.com', '9.50950, -13.71220')   -- Kaloum, centre-ville
) as c(email, point) on c.email = u.email
where u.id = m.id and coalesce(m.localisation, '') = '';
