/**
 * Patients récemment ouverts, pour la palette d'accès rapide.
 *
 * Stocké dans le localStorage du navigateur : c'est une commodité par poste,
 * jamais une source de vérité (ni partagée, ni relue par le serveur). Tout
 * passe par try/catch — en navigation privée ou stockage bloqué, la palette
 * fonctionne simplement sans « récents ».
 */
export type PatientRecent = { cle: string; nom: string };

const CLE = "dr224.patients-recents";
const MAX = 6;

export function lireRecents(): PatientRecent[] {
  try {
    const brut = localStorage.getItem(CLE);
    if (!brut) return [];
    const liste = JSON.parse(brut) as unknown;
    if (!Array.isArray(liste)) return [];
    return liste
      .filter((p): p is PatientRecent => !!p && typeof p.cle === "string" && typeof p.nom === "string")
      .slice(0, MAX);
  } catch {
    return [];
  }
}

export function noterRecent(p: PatientRecent): void {
  if (!p.cle || !p.nom) return;
  try {
    const sans = lireRecents().filter((x) => x.cle !== p.cle);
    localStorage.setItem(CLE, JSON.stringify([p, ...sans].slice(0, MAX)));
  } catch {
    /* stockage indisponible : on se passe de récents */
  }
}
