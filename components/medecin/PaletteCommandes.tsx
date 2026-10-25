"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Icone from "@/components/site/Icone";
import { useRecherchePatients } from "@/lib/pro";
import { lireRecents, type PatientRecent } from "@/lib/acces-rapide";

/*
 * Palette d'accès rapide (type « command palette ») de l'espace médecin.
 *
 * Un seul champ qui fait tout : chercher un patient, lancer une action
 * (nouveau RDV, « pour ce patient » quand on est sur une fiche) ou sauter
 * vers n'importe quel écran du menu. Ouverte au clavier (Ctrl/Cmd + K) comme
 * à la souris par la pastille en haut du contenu.
 *
 * Côté bureau seulement pour l'instant : le mobile a déjà sa recherche (☰ et
 * l'onglet Recherche) et un en-tête dédié. La pastille est donc `hidden md:…`.
 *
 * Les permissions sont déjà appliquées en amont : `liens` arrive filtré par
 * la coquille (un assistant n'y voit pas abonnement / paiements / équipe).
 */

type Lien = { href: string; icone: string; label: string };

/*
 * Champ vide : on ne montre que les écrans les plus ouverts d'une journée,
 * pour une liste courte et lisible. Dès qu'on tape, la recherche porte sur
 * TOUT le menu (voir plus bas), donc rien n'est perdu — juste dépriorisé.
 */
const COURANTS = [
  "/espace-medecin/agenda",
  "/espace-medecin/patients",
  "/espace-medecin/correspondance",
];

export default function PaletteCommandes({ liens }: { liens: Lien[] }) {
  const [ouvert, setOuvert] = useState(false);

  // Raccourci global : Ctrl/Cmd + K ouvre ou ferme, où que soit le focus.
  useEffect(() => {
    const surTouche = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        setOuvert((v) => !v);
      }
    };
    window.addEventListener("keydown", surTouche);
    return () => window.removeEventListener("keydown", surTouche);
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() => setOuvert(true)}
        aria-haspopup="dialog"
        aria-expanded={ouvert}
        className="hidden w-full max-w-[560px] items-center gap-2.5 rounded-xl border border-line bg-white px-3.5 py-2.5 text-left text-[13px] text-muted shadow-sm transition-colors hover:border-muted md:flex"
      >
        <Icone nom="loupe" taille={16} className="flex-none" />
        <span className="flex-1">Rechercher un patient ou une action…</span>
        <kbd className="flex-none rounded-md border border-line bg-bg px-1.5 py-0.5 font-sans text-[11px] font-bold text-muted">
          Ctrl K
        </kbd>
      </button>

      {ouvert && <Panneau liens={liens} onFermer={() => setOuvert(false)} />}
    </>
  );
}

type Element = { id: string; icone: string; label: string; sous?: string; action: () => void };

function Panneau({ liens, onFermer }: { liens: Lien[]; onFermer: () => void }) {
  const router = useRouter();
  const pathname = usePathname();
  const [q, setQ] = useState("");
  const [qd, setQd] = useState("");
  const [index, setIndex] = useState(0);
  const [recents] = useState<PatientRecent[]>(() => lireRecents());
  const champRef = useRef<HTMLInputElement>(null);
  const listeRef = useRef<HTMLDivElement>(null);

  // La recherche patient est différée : pas une requête par frappe.
  useEffect(() => {
    const t = setTimeout(() => setQd(q.trim()), 180);
    return () => clearTimeout(t);
  }, [q]);

  const { patients } = useRecherchePatients(qd, 0);

  useEffect(() => {
    champRef.current?.focus();
  }, []);

  const aller = (href: string) => {
    onFermer();
    router.push(href);
  };

  // Fiche patient ouverte ? → on propose une action « pour ce patient ».
  const segment = pathname.match(/^\/espace-medecin\/patients\/([^/]+)$/)?.[1];
  const cleCourant = segment ? decodeURIComponent(segment) : null;

  const qlc = q.trim().toLowerCase();
  const correspond = (texte: string) => !qlc || texte.toLowerCase().includes(qlc);

  const groupes: { titre: string; items: Element[] }[] = [];

  // --- Actions ---
  const actions: Element[] = [];
  if (cleCourant) {
    actions.push({
      id: "rdv-ce-patient",
      icone: "📅",
      label: "Nouveau RDV pour ce patient",
      action: () => aller(`/espace-medecin/nouveau-rdv?patient=${encodeURIComponent(cleCourant)}`),
    });
  }
  actions.push({
    id: "rdv",
    icone: "📅",
    label: "Nouveau rendez-vous",
    action: () => aller("/espace-medecin/nouveau-rdv"),
  });
  const actionsF = actions.filter((a) => correspond(a.label));
  if (actionsF.length) groupes.push({ titre: "Actions", items: actionsF });

  // --- Aller à (navigation) ---
  // Champ vide : seulement les écrans courants. En recherche : tout le menu.
  const sourceNav = qlc ? liens : liens.filter((l) => COURANTS.includes(l.href));
  const nav: Element[] = sourceNav
    .filter((l) => correspond(l.label))
    .map((l) => ({ id: `nav-${l.href}`, icone: l.icone, label: l.label, action: () => aller(l.href) }));
  if (nav.length) groupes.push({ titre: "Aller à", items: nav });

  // --- Patients ---
  if (qlc) {
    const pts: Element[] = patients.map((p) => ({
      id: `patient-${p.cle}`,
      icone: "👤",
      label: `${p.prenom} ${p.nom}`.trim(),
      sous: p.telephone || undefined,
      action: () => aller(`/espace-medecin/patients/${p.cle}`),
    }));
    if (pts.length) groupes.push({ titre: "Patients", items: pts });
  } else if (recents.length) {
    groupes.push({
      titre: "Patients récents",
      items: recents.map((p) => ({
        id: `recent-${p.cle}`,
        icone: "👤",
        label: p.nom,
        action: () => aller(`/espace-medecin/patients/${p.cle}`),
      })),
    });
  }

  // Liste plate, dans l'ordre d'affichage, pour la navigation au clavier.
  const plats = groupes.flatMap((g) => g.items);
  const actif = Math.min(index, Math.max(0, plats.length - 1));

  const surTouche = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onFermer();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setIndex((i) => Math.min(i + 1, plats.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      plats[actif]?.action();
    }
  };

  // Garde l'élément actif visible pendant la navigation au clavier.
  useEffect(() => {
    listeRef.current
      ?.querySelector<HTMLElement>(`[data-actif="true"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [actif]);

  let compteur = -1;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Accès rapide"
      className="fixed inset-0 z-[1000] flex items-start justify-center bg-ink/40 p-4 pt-[12vh]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onFermer();
      }}
    >
      <div
        className="flex max-h-[70vh] w-full max-w-[560px] flex-col overflow-hidden rounded-2xl border border-line bg-bg shadow-xl"
        onKeyDown={surTouche}
      >
        <div className="flex items-center gap-2.5 border-b border-line bg-white px-3.5 py-3">
          <Icone nom="loupe" taille={17} className="flex-none text-muted" />
          <input
            ref={champRef}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setIndex(0);
            }}
            placeholder="Rechercher un patient ou une action…"
            aria-label="Rechercher"
            className="min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-muted"
          />
          <kbd className="flex-none rounded-md border border-line bg-bg px-1.5 py-0.5 text-[11px] font-bold text-muted">
            Échap
          </kbd>
        </div>

        <div ref={listeRef} className="min-h-0 flex-1 overflow-y-auto p-2">
          {plats.length === 0 ? (
            <p className="px-3 py-8 text-center text-[13px] text-muted">
              Aucun résultat pour « {q.trim()} ».
            </p>
          ) : (
            groupes.map((g) => (
              <div key={g.titre} className="mb-1.5 last:mb-0">
                <div className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.04em] text-muted">
                  {g.titre}
                </div>
                {g.items.map((it) => {
                  compteur += 1;
                  const position = compteur;
                  const estActif = position === actif;
                  return (
                    <button
                      key={it.id}
                      type="button"
                      data-actif={estActif}
                      onMouseMove={() => setIndex(position)}
                      onClick={it.action}
                      className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors ${
                        estActif ? "bg-teal-soft" : "hover:bg-white"
                      }`}
                    >
                      <span aria-hidden className="flex-none text-[16px] leading-none">
                        {it.icone}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13.5px] font-semibold text-ink">{it.label}</span>
                        {it.sous && <span className="block truncate text-[11.5px] text-muted">{it.sous}</span>}
                      </span>
                      {estActif && (
                        <kbd className="flex-none rounded-md border border-line bg-white px-1.5 py-0.5 text-[10.5px] font-bold text-muted">
                          ↵
                        </kbd>
                      )}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
