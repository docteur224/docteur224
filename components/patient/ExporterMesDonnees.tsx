"use client";

/*
 * Téléchargement de l'export JSON du compte. Un simple lien suffit : la route
 * répond avec un Content-Disposition « attachment », c'est le navigateur qui
 * enregistre le fichier — pas de blob à construire ni de mémoire à libérer.
 */
export default function ExporterMesDonnees({ mobile = false }: { mobile?: boolean }) {
  if (mobile) {
    return (
      <div className="setrow">
        <div>
          <b>Exporter mes données</b>
          <small>Profil, rendez-vous, proches, avis…</small>
        </div>
        <a className="btnm gh" href="/api/compte/export" download>
          Télécharger
        </a>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-[14px] py-[15px]">
      <div>
        <b className="block text-[13.5px] font-bold">Exporter mes données</b>
        <small className="text-xs text-muted">
          Un fichier JSON contenant votre profil, vos rendez-vous, vos proches, vos avis, vos
          favoris et vos documents
        </small>
      </div>
      <a
        href="/api/compte/export"
        download
        className="flex-none rounded-[9px] border-[1.5px] border-line bg-white px-[14px] py-2 text-[12.5px] font-bold text-blue transition-colors hover:bg-bg"
      >
        Télécharger
      </a>
    </div>
  );
}
