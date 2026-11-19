/*
 * Section « Comment ça marche » de l'accueil, web et mobile.
 *
 * Contenu statique (trois étapes fixes) : un composant serveur sans état, à
 * deux rendus pilotés par `variante` — un parcours horizontal relié sur web,
 * une frise verticale sur mobile. Icônes en SVG inline (stroke currentColor,
 * donc elles suivent le thème) plutôt qu'en emoji : le rendu est plus net et
 * identique d'un appareil à l'autre.
 *
 * Classes préfixées `ccm-`, tout en tokens (le mode sombre suit).
 */

function IconeRecherche() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" />
    </svg>
  );
}

function IconeAgenda() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="4.5" width="18" height="16" rx="3" />
      <path d="M3 9h18M8 2.5v4M16 2.5v4" />
      <path d="M12 13.5v3M10.5 15h3" />
    </svg>
  );
}

function IconeConfirme() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 2.5l2.4 1.8 3 .2 .9 2.9 2.3 1.9-1 2.8 1 2.8-2.3 1.9-.9 2.9-3 .2L12 21.5l-2.4-1.8-3-.2-.9-2.9L3.4 14.7l1-2.8-1-2.8 2.3-1.9.9-2.9 3-.2z" />
      <path d="M8.6 12.2l2.2 2.2 4.6-4.8" />
    </svg>
  );
}

const ETAPES = [
  {
    n: 1,
    titre: "Cherchez",
    texte: "Par spécialité, ville, établissement ou nom du médecin.",
    icone: <IconeRecherche />,
  },
  {
    n: 2,
    titre: "Choisissez un créneau",
    texte: "Consultez les disponibilités réelles et réservez l’horaire qui vous convient.",
    icone: <IconeAgenda />,
  },
  {
    n: 3,
    titre: "Confirmez",
    texte: "Recevez une confirmation par SMS et e-mail, avec un rappel avant le rendez-vous.",
    icone: <IconeConfirme />,
  },
];

export default function CommentCaMarche({ variante }: { variante: "web" | "mobile" }) {
  return (
    <div className={`ccm ccm-${variante}`}>
      <div className="ccm-head">
        <h2>Comment ça marche</h2>
        <p>Trois étapes simples, même avec une connexion lente.</p>
      </div>

      <ol className="ccm-rail">
        {ETAPES.map((e) => (
          <li className="ccm-etape" key={e.n}>
            <div className="ccm-puce">
              <span className="ccm-icone">{e.icone}</span>
              <span className="ccm-num" aria-hidden>
                {e.n}
              </span>
            </div>
            <div className="ccm-txt">
              <h3 className="ccm-titre">
                <span className="ccm-etiquette">Étape {e.n}</span>
                {e.titre}
              </h3>
              <p className="ccm-desc">{e.texte}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
