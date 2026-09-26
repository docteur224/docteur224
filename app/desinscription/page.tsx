"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import PageContenu from "@/components/site/PageContenu";
import { creerClientNavigateur } from "@/lib/supabase/client";

/*
 * Désabonnement depuis un courriel.
 *
 * PAS DE CONNEXION REQUISE, et c'est le point : le jeton du lien tient lieu
 * de preuve. Exiger de se connecter pour ne plus recevoir de messages est le
 * meilleur moyen de se faire classer en indésirable à la place — le lecteur
 * n'ira pas retrouver son mot de passe, il signalera.
 *
 * Le jeton ne donne accès à rien d'autre : la fonction `desinscrire_email`
 * (migration 0059) ne fait que basculer deux interrupteurs, et ne renvoie ni
 * nom ni adresse. La page ne dit donc jamais DE QUI il s'agit — un lien
 * transféré ou retrouvé dans un journal ne révèle personne.
 *
 * Deux usages d'une même page :
 *   • avec `?c=rappel` ou `?c=resume`, la coupure est appliquée à l'arrivée,
 *     en un clic depuis la boîte mail, comme l'annonce le lien ;
 *   • sans `c`, rien n'est changé : on propose seulement les réglages.
 */

type Etat = "chargement" | "fait" | "pret" | "invalide";

function Contenu() {
  const parametres = useSearchParams();
  const jeton = parametres.get("j") ?? "";
  const categorie = parametres.get("c") ?? "";

  const [etat, setEtat] = useState<Etat>(jeton ? "chargement" : "invalide");
  const [rappels, setRappels] = useState(true);
  const [resumes, setResumes] = useState(true);

  useEffect(() => {
    if (!jeton) return;
    let actif = true;
    (async () => {
      const supabase = creerClientNavigateur();
      // Sans catégorie, on n'applique rien : la page sert alors de réglage.
      if (!categorie) {
        if (actif) setEtat("pret");
        return;
      }
      const { data, error } = await supabase.rpc("desinscrire_email", {
        p_jeton: jeton,
        p_categorie: categorie,
        p_actif: false,
      });
      if (!actif) return;
      // `false` = jeton inconnu. On ne distingue pas « expiré » de « jamais
      // existé » : ce serait renseigner qui sonde la base.
      if (error || data !== true) return setEtat("invalide");
      if (categorie === "rappel") setRappels(false);
      if (categorie === "resume") setResumes(false);
      setEtat("fait");
    })();
    return () => {
      actif = false;
    };
  }, [jeton, categorie]);

  async function basculer(cle: "rappel" | "resume", valeur: boolean) {
    if (cle === "rappel") setRappels(valeur);
    else setResumes(valeur);
    const { data, error } = await creerClientNavigateur().rpc("desinscrire_email", {
      p_jeton: jeton,
      p_categorie: cle,
      p_actif: valeur,
    });
    if (error || data !== true) setEtat("invalide");
  }

  if (etat === "chargement") {
    return <p className="text-[14px] text-muted">Un instant…</p>;
  }

  if (etat === "invalide") {
    return (
      <div className="rounded-2xl border border-line bg-white p-6">
        <h2 className="mb-2 text-[17px] font-extrabold text-ink">Ce lien n’est plus valable</h2>
        <p className="mb-4 text-[14px] leading-relaxed text-muted">
          Il a peut-être été renouvelé depuis l’envoi du message. Vous pouvez régler vos
          notifications depuis votre espace, après connexion.
        </p>
        <Link
          href="/connexion"
          className="inline-block rounded-[10px] bg-teal px-5 py-3 text-[14px] font-bold text-white transition-colors hover:bg-[#2790bc]"
        >
          Se connecter
        </Link>
      </div>
    );
  }

  const interrupteur = (
    cle: "rappel" | "resume",
    titre: string,
    detail: string,
    valeur: boolean
  ) => (
    <div className="flex items-start justify-between gap-4 border-t border-line py-4 first:border-t-0 first:pt-0">
      <div>
        <p className="text-[14.5px] font-bold text-ink">{titre}</p>
        <p className="mt-0.5 text-[12.5px] leading-relaxed text-muted">{detail}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={valeur}
        aria-label={titre}
        onClick={() => basculer(cle, !valeur)}
        className={`mt-1 h-[26px] w-[46px] shrink-0 rounded-full transition-colors ${valeur ? "bg-teal" : "bg-line"}`}
      >
        <span
          className={`block h-[20px] w-[20px] rounded-full bg-white transition-transform ${valeur ? "translate-x-[23px]" : "translate-x-[3px]"}`}
        />
      </button>
    </div>
  );

  return (
    <div className="rounded-2xl border border-line bg-white p-6">
      {etat === "fait" && (
        <div className="mb-5 rounded-[11px] bg-green-soft px-[13px] py-[11px] text-[13px] font-semibold text-green">
          C’est fait : vous ne recevrez plus{" "}
          {categorie === "resume" ? "ce résumé" : "de rappels par e-mail"}.
        </div>
      )}
      <h2 className="mb-1 text-[17px] font-extrabold text-ink">Vos notifications par e-mail</h2>
      <p className="mb-5 text-[13px] leading-relaxed text-muted">
        Les messages liés à vos rendez-vous — confirmation, déplacement, annulation — continuent
        d’être envoyés : ils font partie du service.
      </p>
      {interrupteur(
        "rappel",
        "Rappels avant un rendez-vous",
        "La veille, puis quelques heures avant.",
        rappels
      )}
      {interrupteur(
        "resume",
        "Résumés et informations",
        "Le point quotidien, pour les comptes professionnels et administrateurs.",
        resumes
      )}
    </div>
  );
}

export default function Desinscription() {
  return (
    <PageContenu
      titre="Notifications par e-mail"
      chapeau="Choisissez ce que Docteur 224 vous envoie."
      emoji="✉️"
    >
      {/* `useSearchParams` impose une frontière de Suspense côté serveur. */}
      <Suspense fallback={<p className="text-[14px] text-muted">Un instant…</p>}>
        <Contenu />
      </Suspense>
    </PageContenu>
  );
}
