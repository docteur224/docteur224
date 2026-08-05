/*
 * Position GPS du cabinet.
 *
 * Module sans directive « use client » : `estCoordonnees` et `lienCarte`
 * sont purs et servent aussi à la fiche publique, qui est un composant
 * serveur. `recupererPositionActuelle` ne touche au navigateur qu'à
 * l'appel, jamais au chargement du module.
 *
 * Le même bouton « Récupérer ma position actuelle » existe dans le
 * parcours d'inscription et dans /espace-medecin/profil : les deux passent
 * par ici, sinon l'un des deux garde des messages d'erreur inutilisables.
 *
 * Trois causes d'échec ont été observées et sont traitées séparément —
 * « autorisation refusée » n'aide personne quand le vrai problème est une
 * page servie en HTTP, où l'API n'existe tout simplement pas.
 */

export interface PositionCabinet {
  latitude: number;
  longitude: number;
  /** Rayon d'incertitude en mètres, tel que rendu par le navigateur. */
  precision: number;
}

/** « 9.53795, -13.67729 » — forme stockée dans `medecins.localisation`. */
export function formaterPosition(p: PositionCabinet): string {
  return `${p.latitude.toFixed(5)}, ${p.longitude.toFixed(5)}`;
}

/** La valeur enregistrée est-elle un couple de coordonnées (vs un lien Maps) ? */
export function estCoordonnees(valeur: string): boolean {
  return /^-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?$/.test((valeur ?? "").trim());
}

export function lienCarte(coordonnees: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(coordonnees.trim())}`;
}

export function recupererPositionActuelle(): Promise<{
  position?: PositionCabinet;
  erreur?: string;
}> {
  return new Promise((resoudre) => {
    if (typeof window === "undefined" || !("geolocation" in navigator)) {
      return resoudre({
        erreur: "Géolocalisation non disponible sur cet appareil — collez un lien Google Maps.",
      });
    }
    // Chrome et Safari coupent l'API hors HTTPS (localhost excepté) : sans
    // ce test le navigateur renvoie un simple « position indisponible » et
    // on cherche le bug du mauvais côté.
    if (!window.isSecureContext) {
      return resoudre({
        erreur:
          "La géolocalisation exige une connexion sécurisée (https). Collez un lien Google Maps.",
      });
    }
    navigator.geolocation.getCurrentPosition(
      (p) =>
        resoudre({
          position: {
            latitude: p.coords.latitude,
            longitude: p.coords.longitude,
            precision: Math.round(p.coords.accuracy ?? 0),
          },
        }),
      (echec) => {
        const messages: Record<number, string> = {
          1: "Autorisation refusée — autorisez la localisation dans votre navigateur, ou collez un lien Google Maps.",
          2: "Position indisponible — activez le GPS de l’appareil, ou collez un lien Google Maps.",
          3: "La localisation a pris trop de temps. Réessayez en extérieur, ou collez un lien Google Maps.",
        };
        resoudre({ erreur: messages[echec.code] ?? "Localisation impossible pour le moment." });
      },
      // Le repère doit tomber sur le cabinet, pas sur le quartier : haute
      // précision exigée, et aucune position mise en cache (le médecin
      // clique justement parce qu'il vient d'arriver sur place).
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
    );
  });
}
