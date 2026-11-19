"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { creerClientNavigateur } from "@/lib/supabase/client";
import { versISO, capitaliser } from "@/lib/dates";

/*
 * Carte « Votre prochain rendez-vous » de l'accueil mobile.
 *
 * L'accueil est une page publique mise en cache (revalidate) : on ne peut pas
 * y rendre une donnée propre à l'utilisateur côté serveur sans casser ce cache
 * pour tout le monde. D'où une ÎLE CLIENTE — le squelette statique reste
 * cacheable, et cette carte se peuple après coup, seulement pour un patient
 * connecté qui a un rendez-vous à venir. Sinon elle ne rend rien (pas de trou).
 *
 * La requête est filtrée sur `patient_id = l'utilisateur` : ce sont bien SES
 * rendez-vous, pas ceux qu'un médecin verrait de ses patients. La RLS fait le
 * reste ; sans session, la requête revient vide et la carte n'apparaît pas.
 */

interface ProchainRdv {
  id: string;
  dateISO: string;
  heure: string;
  medecin: string;
  specialite: string;
}

interface LigneProchainRdv {
  id: string;
  date: string;
  heure: string;
  medecins: {
    civilite: string | null;
    utilisateurs: { nom: string | null; prenom: string | null } | null;
    specialites: { nom: string | null } | null;
  } | null;
}

/** « lundi 12 janvier · 14:00 » — calculé au navigateur (île cliente). */
function libelle(iso: string, heure: string): string {
  let jour: string;
  try {
    jour = capitaliser(
      new Intl.DateTimeFormat("fr-FR", {
        weekday: "long",
        day: "numeric",
        month: "long",
      }).format(new Date(`${iso}T00:00:00`))
    );
  } catch {
    jour = iso;
  }
  return `${jour} · ${heure.slice(0, 5)}`;
}

export default function ProchainRendezVous() {
  const [rdv, setRdv] = useState<ProchainRdv | null>(null);

  useEffect(() => {
    let actif = true;
    const supabase = creerClientNavigateur();

    // Chaque chemin se termine par un setRdv : sans cela, une déconnexion
    // laisserait la carte précédente à l'écran faute d'être effacée.
    async function rafraichir() {
      try {
        const { data: auth } = await supabase.auth.getUser();
        if (!actif) return;
        if (!auth.user) {
          setRdv(null); // Visiteur anonyme, ou qui vient de se déconnecter.
          return;
        }

        const { data } = await supabase
          .from("rendez_vous")
          .select(
            "id, date, heure, medecins ( civilite, utilisateurs ( nom, prenom ), specialites ( nom ) )"
          )
          .eq("patient_id", auth.user.id)
          .neq("statut", "annule")
          .gte("date", versISO(new Date()))
          .order("date", { ascending: true })
          .order("heure", { ascending: true })
          .limit(1)
          .maybeSingle();

        if (!actif) return;
        if (!data) {
          setRdv(null);
          return;
        }
        const l = data as unknown as LigneProchainRdv;
        const med = l.medecins;
        const nom = [med?.civilite, med?.utilisateurs?.prenom, med?.utilisateurs?.nom]
          .filter(Boolean)
          .join(" ");
        setRdv({
          id: l.id,
          dateISO: l.date,
          heure: l.heure,
          medecin: nom,
          specialite: med?.specialites?.nom ?? "",
        });
      } catch {
        // Session illisible ou requête refusée : on n'affiche rien.
        if (actif) setRdv(null);
      }
    }

    rafraichir();
    // La connexion comme la déconnexion se font sans recharger la page : sans
    // cet abonnement, la carte resterait figée sur l'état du montage — c'est
    // ce que fait déjà useProfilConnecte pour l'en-tête.
    const { data: abo } = supabase.auth.onAuthStateChange(() => {
      rafraichir();
    });

    return () => {
      actif = false;
      abo.subscription.unsubscribe();
    };
  }, []);

  if (!rdv) return null;

  const sousTitre = [rdv.medecin, rdv.specialite].filter(Boolean).join(" · ");

  return (
    <Link href={`/mes-rendez-vous/${rdv.id}`} className="prdv" aria-label="Voir votre prochain rendez-vous">
      <span className="prdv-halo" aria-hidden />
      <span className="prdv-main">
        <span className="prdv-label">Votre prochain rendez-vous</span>
        <strong className="prdv-date">{libelle(rdv.dateISO, rdv.heure)}</strong>
        {sousTitre && <span className="prdv-sub">{sousTitre}</span>}
      </span>
      <span className="prdv-go" aria-hidden>
        ›
      </span>
    </Link>
  );
}
