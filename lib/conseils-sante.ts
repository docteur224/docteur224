/**
 * Les conseils santé — types, petits utilitaires et FILET DE REPLI.
 *
 * Ce module ne touche ni au navigateur ni au serveur : il est importé par les
 * pages publiques (rendu serveur), par l'écran d'administration (client) et
 * par le composant de partage. Il n'a donc AUCUNE directive « use client » ni
 * dépendance à Supabase.
 *
 * `CONSEILS_DEFAUT` reprend les six fiches d'origine. Il ne sert QUE de repli :
 * si la migration 0091 n'est pas encore passée (table absente) ou si la lecture
 * échoue, la page publique montre ces fiches plutôt qu'un écran vide. Dès que
 * la table existe, c'est elle qui fait foi — le repli devient invisible.
 */

export type ConseilSante = {
  id: string;
  slug: string;
  emoji: string | null;
  categorie: string | null;
  titre: string;
  resume: string;
  contenu: string;
  gestes: string[];
  quand_consulter: string | null;
  image_url: string | null;
  image_id: string | null;
  vedette: boolean;
  publie: boolean;
  position: number;
  cree_le?: string;
  maj_le?: string;
};

/** Les colonnes lues du public — le même jeu partout, pour ne pas diverger. */
export const COLONNES_CONSEIL =
  "id, slug, emoji, categorie, titre, resume, contenu, gestes, quand_consulter, image_url, image_id, vedette, publie, position, cree_le, maj_le";

/**
 * Adresse publique d'une fiche, dérivée du titre. Figée à la création : une
 * correction de titre ne doit pas casser un lien déjà partagé.
 * Accents retirés, tout le reste en minuscules et en tirets, borné à 80.
 */
export function creerSlug(titre: string): string {
  const base = titre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
  return base || "conseil";
}

/** Découpe le corps en paragraphes (séparés par une ligne vide). */
export function paragraphes(contenu: string): string[] {
  return contenu
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}

/**
 * Le champ contient-il du HTML (nouveau format, éditeur riche) ou du texte brut
 * (fiches saisies avant l'éditeur, ou le seed) ? Sert à choisir le rendu.
 * Volontairement minuscule et sans dépendance : utilisable côté client comme
 * côté serveur, sans embarquer l'assainisseur dans le navigateur.
 */
export function estHtml(valeur: string): boolean {
  return /<\/?[a-z][\s\S]*>/i.test(valeur);
}

/** Échappe le texte pour un affichage HTML sûr (entités de base). */
function echapper(texte: string): string {
  return texte
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Convertit un corps en texte brut (paragraphes séparés par une ligne vide) en
 * HTML, pour alimenter l'éditeur riche quand on ouvre une ancienne fiche.
 */
export function texteVersHtml(texte: string): string {
  const blocs = paragraphes(texte);
  if (!blocs.length) return "";
  return blocs.map((p) => `<p>${echapper(p).replace(/\n/g, "<br>")}</p>`).join("");
}

/** Signes qui imposent une consultation immédiate, quel que soit l'âge. */
export const URGENCES = [
  "Difficulté à respirer ou essoufflement au repos",
  "Douleur dans la poitrine",
  "Fièvre élevée qui ne baisse pas, surtout chez un nourrisson",
  "Perte de connaissance, convulsions, confusion",
  "Saignement abondant ou qui ne s’arrête pas",
  "Faiblesse soudaine d’un côté du corps, difficulté à parler",
];

/** Catégories proposées à l'écran d'administration (liste ouverte : on peut en saisir une autre). */
export const CATEGORIES_SUGGEREES = [
  "Prévention",
  "Maternité",
  "Enfance",
  "Maladies chroniques",
  "Au quotidien",
  "Nutrition",
  "Santé mentale",
];

/**
 * Repli affiché quand la base n'a encore rien (migration non passée) ou en cas
 * d'erreur de lecture. Mêmes slugs et mêmes contenus que le seed de la 0091,
 * pour que rien ne change à l'œil le jour où la table prend le relais.
 */
export const CONSEILS_DEFAUT: ConseilSante[] = [
  {
    id: "defaut-paludisme",
    slug: "se-proteger-du-paludisme",
    emoji: "🦟",
    categorie: "Prévention",
    titre: "Se protéger du paludisme",
    resume:
      "La moustiquaire imprégnée, l’élimination des eaux stagnantes et des vêtements couvrants le soir : les gestes simples qui protègent toute la famille.",
    contenu:
      "Le paludisme se transmet par la piqûre de moustiques qui piquent surtout la nuit. La meilleure protection reste d’éviter la piqûre, toute l’année — y compris en saison sèche, où le risque baisse mais ne disparaît pas.\n\nAutour de la maison, la moindre eau qui stagne devient un gîte à moustiques en quelques jours : vieux pneus, récipients oubliés, flaques. Les vider ou les couvrir réduit le nombre de moustiques là où vit la famille.\n\nUne fièvre n’est jamais à traiter « au cas où » : un test rapide, disponible dans la plupart des centres, tranche en quelques minutes.",
    gestes: [
      "Dormir chaque nuit sous une moustiquaire imprégnée, y compris en saison sèche.",
      "Éliminer les eaux stagnantes autour de la maison : elles servent de gîtes aux moustiques.",
      "Couvrir bras et jambes le soir, moment où les moustiques piquent le plus.",
    ],
    quand_consulter:
      "Toute fièvre doit être testée avant d’être traitée. Ne prenez pas d’antipaludique « au cas où » : un test rapide se fait en quelques minutes.",
    image_url: null,
    image_id: null,
    vedette: true,
    publie: true,
    position: 1,
  },
  {
    id: "defaut-eau",
    slug: "eau-hygiene-et-diarrhees",
    emoji: "💧",
    categorie: "Prévention",
    titre: "Eau, hygiène et diarrhées",
    resume:
      "Une eau traitée, des mains lavées au savon et une bonne hydratation : l’essentiel pour éviter les diarrhées et leurs complications.",
    contenu:
      "La plupart des diarrhées viennent d’une eau ou d’aliments contaminés. Traiter ou bouillir l’eau de boisson, puis la garder dans un récipient fermé, coupe la chaîne de contamination la plus courante.\n\nSe laver les mains au savon avant de manger et après être allé aux toilettes est le geste le plus efficace, et le moins cher, contre ces maladies.\n\nEn cas de diarrhée, le vrai danger n’est pas la diarrhée elle-même mais la déshydratation, surtout chez l’enfant et la personne âgée : il faut continuer à boire abondamment.",
    gestes: [
      "Boire de l’eau traitée ou bouillie, et la conserver dans un récipient fermé.",
      "Se laver les mains au savon avant de manger et après être allé aux toilettes.",
      "En cas de diarrhée, continuer à boire abondamment : la déshydratation est le vrai danger.",
    ],
    quand_consulter:
      "Consultez sans attendre si la diarrhée dure plus de trois jours, contient du sang, ou touche un nourrisson ou une personne âgée.",
    image_url: null,
    image_id: null,
    vedette: false,
    publie: true,
    position: 2,
  },
  {
    id: "defaut-grossesse",
    slug: "suivre-une-grossesse",
    emoji: "🤰",
    categorie: "Maternité",
    titre: "Suivre une grossesse",
    resume:
      "Commencer les consultations tôt, poursuivre le suivi jusqu’au bout et préparer l’accouchement : un suivi régulier protège la mère et l’enfant.",
    contenu:
      "Un suivi de grossesse commencé tôt permet de repérer à temps ce qui, sinon, se découvre dans l’urgence. Les consultations prénatales se commencent dès les premiers mois, sans attendre qu’un problème se manifeste.\n\nLe suivi se poursuit jusqu’à l’accouchement, même quand tout va bien : c’est justement quand tout va bien qu’on vérifie que cela continue.\n\nPréparer le lieu d’accouchement à l’avance, avec la sage-femme ou le médecin, évite d’avoir à décider dans la précipitation le jour venu.",
    gestes: [
      "Commencer les consultations prénatales dès les premiers mois, sans attendre un problème.",
      "Poursuivre le suivi jusqu’à l’accouchement, même quand tout va bien.",
      "Préparer le lieu d’accouchement à l’avance avec la sage-femme ou le médecin.",
    ],
    quand_consulter:
      "En urgence : saignements, maux de tête intenses, gonflement brutal du visage ou des mains, fièvre, ou diminution des mouvements du bébé.",
    image_url: null,
    image_id: null,
    vedette: false,
    publie: true,
    position: 3,
  },
  {
    id: "defaut-tension",
    slug: "tension-et-diabete",
    emoji: "❤️",
    categorie: "Maladies chroniques",
    titre: "Tension et diabète",
    resume:
      "Deux maladies qui avancent sans bruit : un contrôle régulier, une hygiène de vie simple et un traitement suivi en changent le cours.",
    contenu:
      "L’hypertension et le diabète évoluent longtemps sans aucun symptôme : on peut en être atteint des années sans le savoir. C’est pourquoi le contrôle régulier compte autant — une mesure de tension une fois par an à partir de 40 ans ne coûte presque rien.\n\nL’hygiène de vie pèse lourd : réduire le sel, l’alcool et le tabac, marcher trente minutes par jour. Ces gestes agissent sur les deux maladies à la fois.\n\nUn traitement prescrit se poursuit même quand on se sent bien. Se sentir bien ne veut pas dire guéri : c’est, le plus souvent, le signe que le traitement fait son travail.",
    gestes: [
      "Faire contrôler sa tension au moins une fois par an à partir de 40 ans.",
      "Réduire le sel, l’alcool et le tabac ; marcher trente minutes par jour.",
      "Un traitement prescrit se poursuit même quand on se sent bien : c’est le principe.",
    ],
    quand_consulter:
      "Soif intense, fatigue inhabituelle, vision troublée ou essoufflement justifient une consultation sans tarder.",
    image_url: null,
    image_id: null,
    vedette: false,
    publie: true,
    position: 4,
  },
  {
    id: "defaut-vaccination",
    slug: "vaccination-des-enfants",
    emoji: "👶",
    categorie: "Enfance",
    titre: "Vaccination des enfants",
    resume:
      "Respecter le calendrier, garder le carnet et ne pas renoncer en cas de retard : la vaccination protège l’enfant et ceux qui l’entourent.",
    contenu:
      "Le calendrier vaccinal protège l’enfant contre des maladies graves, au moment où il y est le plus vulnérable. Respecter les dates, rappels compris, c’est ce qui donne au vaccin toute son efficacité.\n\nLe carnet de vaccination est le seul document qui dit où en est l’enfant : le conserver et l’apporter à chaque consultation évite les doses oubliées comme les doses répétées inutilement.\n\nUne fièvre légère dans les jours qui suivent un vaccin est fréquente et passagère — ce n’est pas une raison d’interrompre le calendrier.",
    gestes: [
      "Respecter le calendrier vaccinal, y compris les rappels.",
      "Conserver le carnet de vaccination et l’apporter à chaque consultation.",
      "Une fièvre légère après un vaccin est fréquente et passagère.",
    ],
    quand_consulter:
      "Un retard se rattrape : présentez-vous au centre de santé plutôt que de renoncer aux doses suivantes.",
    image_url: null,
    image_id: null,
    vedette: false,
    publie: true,
    position: 5,
  },
  {
    id: "defaut-dents",
    slug: "bouche-et-dents",
    emoji: "🦷",
    categorie: "Au quotidien",
    titre: "Bouche et dents",
    resume:
      "Un brossage deux fois par jour, moins de sucre et une visite annuelle suffisent à éviter la plupart des problèmes dentaires.",
    contenu:
      "La santé de la bouche se joue surtout sur des gestes quotidiens : un brossage matin et soir retire la plaque avant qu’elle n’abîme les dents et les gencives.\n\nLes boissons sucrées sont les premières responsables des caries, chez l’enfant comme chez l’adulte : les limiter protège plus sûrement que n’importe quel soin après coup.\n\nUn examen une fois par an, même sans douleur, permet de prendre une carie à ses débuts, quand le soin est simple et rapide.",
    gestes: [
      "Se brosser les dents deux fois par jour, matin et soir.",
      "Limiter les boissons sucrées, premières responsables des caries.",
      "Faire examiner ses dents une fois par an, même sans douleur.",
    ],
    quand_consulter:
      "Une douleur qui réveille la nuit, une gencive gonflée ou une dent mobile ne se traitent pas seules.",
    image_url: null,
    image_id: null,
    vedette: false,
    publie: true,
    position: 6,
  },
];
