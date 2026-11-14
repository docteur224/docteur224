import { RESEAUX_CONNUS, type ReseauBlog } from "@/lib/blog";

/*
 * « Suivez-nous sur les réseaux sociaux » — bloc de la barre latérale du blog.
 *
 * Les liens sont réglés depuis l'administration (table `blog_reseaux`). Un
 * réseau inconnu de l'affichage reçoit une icône générique plutôt que de
 * casser la page. Rien ne s'affiche si aucun lien n'est configuré — pas de
 * section vide.
 *
 * Chaque lien ouvre dans un nouvel onglet, en `rel=noopener`, avec un libellé
 * accessible explicite.
 */
export default function SuivezNous({ reseaux }: { reseaux: ReseauBlog[] }) {
  if (!reseaux.length) return null;

  return (
    <section
      aria-labelledby="suivez-nous-titre"
      className="rounded-2xl border border-line bg-white p-[18px]"
    >
      <h2
        id="suivez-nous-titre"
        className="text-[12px] font-extrabold uppercase tracking-[0.1em] text-muted"
      >
        Suivez-nous
      </h2>
      <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">
        Retrouvez Docteur 224 sur les réseaux sociaux.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {reseaux.map((r) => {
          const connu = RESEAUX_CONNUS[r.reseau];
          return (
            <a
              key={r.id}
              href={r.url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={connu ? `Suivez-nous sur ${connu.libelle}` : "Suivez-nous"}
              title={connu?.libelle ?? r.reseau}
              className="group inline-grid h-[42px] w-[42px] place-items-center rounded-full border border-line bg-white text-muted transition-all hover:-translate-y-0.5 hover:border-transparent hover:text-white"
              style={{ ["--marque" as string]: connu?.couleur ?? "var(--teal)" }}
            >
              <span
                aria-hidden
                className="grid h-full w-full place-items-center rounded-full transition-colors group-hover:bg-[var(--marque)]"
              >
                {connu ? (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                    <path d={connu.chemin} />
                  </svg>
                ) : (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <path
                      d="M4 11a1 1 0 0 1 1-1h7V5l7 7-7 7v-5H5a1 1 0 0 1-1-1Z"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
              </span>
            </a>
          );
        })}
      </div>
    </section>
  );
}
