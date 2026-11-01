-- ============================================================
-- Docteur 224 — La charte du SITE PUBLIC, le temps d'une campagne
--
-- Distincte de `preferences_affichage` (0070), qui est la charte que CHAQUE
-- compte choisit pour SON espace connecté. Ici, l'administration habille les
-- pages PUBLIQUES (accueil, recherche, À propos, FAQ…) aux couleurs d'une
-- cause — Octobre Rose, par exemple — pendant une période donnée. Passé le
-- terme, le site revient de lui-même à la charte Docteur 224.
--
-- Pourquoi une table à part et non une ligne de `parametres_plateforme` :
-- comme la charte d'espace, deux couleurs avec un format vérifié et une
-- fenêtre de dates méritent leurs colonnes typées et leurs contraintes,
-- plutôt qu'un détournement des colonnes `message`/`jusqua` prévues pour la
-- maintenance. On range les DEUX couleurs, jamais la palette calculée ni la
-- feuille de style produite : figer un résultat de calcul interdirait de
-- corriger le calcul (même règle qu'en 0070).
--
-- UNE SEULE LIGNE : le site n'a qu'une tenue à la fois. Le `check (id = 'site')`
-- et la valeur par défaut l'imposent sans qu'on ait à y penser à l'écriture.
-- ============================================================

create table if not exists charte_publique (
  id text primary key default 'site' check (id = 'site'),
  principale text not null,
  accent text not null,

  -- La fenêtre d'application. Hors de ces bornes, la charte ne s'applique pas
  -- et le site garde ses couleurs d'origine. `debut` nul = « tout de suite » ;
  -- `fin` nul = « sans terme » (l'écran d'administration, lui, exige les deux
  -- pour une campagne, mais la base reste souple).
  debut timestamptz,
  fin timestamptz,
  maj_le timestamptz not null default now(),

  -- Ces valeurs finissent dans une feuille de style servie à des visiteurs
  -- non connectés : une chaîne libre y ouvrirait `red;}html{display:none`.
  -- L'applicatif filtre déjà, mais une base qui fait confiance à son client
  -- ne protège rien (même garde qu'en 0070).
  constraint charte_pub_principale_hex check (principale ~ '^#[0-9a-f]{6}$'),
  constraint charte_pub_accent_hex check (accent ~ '^#[0-9a-f]{6}$'),

  -- Une fenêtre à l'endroit : si les deux bornes sont posées, la fin ne
  -- précède pas le début.
  constraint charte_pub_fenetre check (debut is null or fin is null or debut <= fin)
);

alter table charte_publique enable row level security;

-- Lecture OUVERTE À TOUS : le site public est servi à des visiteurs anonymes,
-- qui doivent pouvoir lire la charte du moment pour la poser. Elle ne révèle
-- rien de sensible — ce sont deux couleurs et deux dates.
drop policy if exists sel_charte_publique on charte_publique;
create policy sel_charte_publique on charte_publique for select using (true);

-- Écriture réservée à l'administration habilitée aux « Paramètres » (le compte
-- principal passe toujours, par construction de a_une_permission_admin).
-- Habiller le site public relève des réglages de la plateforme, pas d'une
-- préférence de compte : d'où `parametres` et non `est_admin()` seul.
drop policy if exists mod_charte_publique on charte_publique;
create policy mod_charte_publique on charte_publique for all
  using (a_permission_admin('parametres'))
  with check (a_permission_admin('parametres'));
