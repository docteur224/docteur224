"use client";

import EtablissementShell from "@/components/etablissement/EtablissementShell";
import { ETABLISSEMENT_CONNECTE } from "@/lib/mock-etablissement";

/*
 * Informations — reproduit l'écran « etab-infos » de la maquette web :
 * fiche publique de l'établissement (identité, coordonnées, photos) telle
 * qu'affichée aux patients. Champs statiques en démonstration — l'édition
 * complète arrivera avec la base de données.
 */

const PHOTOS = [
  { emoji: "🏥", label: "Façade", fond: "linear-gradient(135deg,#DCE9F0,#C9DDE8)" },
  { emoji: "🛋️", label: "Accueil", fond: "linear-gradient(135deg,#E2EEE6,#CDE4D6)" },
  { emoji: "🔬", label: "Plateau technique", fond: "linear-gradient(135deg,#EAE6F1,#D9D2E8)" },
];

export default function InformationsEtablissement() {
  const etab = ETABLISSEMENT_CONNECTE;
  const champStatique = "rounded-[11px] border border-line bg-white px-[13px] py-3 text-[13.5px]";
  const labelChamp = "mb-1.5 block text-xs font-bold text-muted";

  return (
    <EtablissementShell>
      {/* ===== Version mobile (écran « m-etab-infos » de la maquette mobile) ===== */}
      <div className="md:hidden">
        <div className="appbar">
          <h3 style={{ paddingLeft: 4 }}>Informations</h3>
        </div>
        <div className="pad">
          <div className="card2">
            <h4>Identité</h4>
            <div className="setrow">
              <div>
                <b>Nom</b>
                <small>{etab.nom}</small>
              </div>
            </div>
            <div className="setrow">
              <div>
                <b>Type</b>
                <small>{etab.type}</small>
              </div>
            </div>
            <div className="setrow">
              <div>
                <b>Description</b>
                <small>{etab.description}</small>
              </div>
            </div>
          </div>
          <div className="card2">
            <h4>Coordonnées</h4>
            <div className="setrow">
              <div>
                <b>Adresse</b>
                <small>{etab.adresse}</small>
              </div>
            </div>
            <div className="setrow">
              <div>
                <b>Téléphone</b>
                <small>{etab.telephone}</small>
              </div>
            </div>
            <div className="setrow">
              <div>
                <b>E-mail</b>
                <small>{etab.email}</small>
              </div>
            </div>
            <div className="setrow">
              <div>
                <b>Site web</b>
                <small>{etab.siteWeb}</small>
              </div>
            </div>
            <div style={{ display: "flex", gap: 9, marginTop: 12, flexWrap: "wrap" }}>
              <a
                className="btn small"
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(etab.adresse)}`}
                target="_blank"
                rel="noopener"
              >
                🧭 Itinéraire
              </a>
              <a className="btn ghost small" href={`tel:${etab.telephone.replace(/\s/g, "")}`}>
                📞 Appeler
              </a>
            </div>
          </div>
          <div className="abannerm">
            <span aria-hidden>ℹ️</span>
            <div>
              Champs de démonstration — la modification de la fiche sera possible quand la base de
              données sera branchée.
            </div>
          </div>
          <div className="card2">
            <h4>🖼️ Photos de l&apos;établissement</h4>
            <div className="gallery">
              {PHOTOS.map((photo) => (
                <div key={photo.label} className="gphoto">
                  <div className="inner" style={{ background: photo.fond }}>
                    <div style={{ fontSize: 23 }} aria-hidden>
                      {photo.emoji}
                    </div>
                    <small style={{ fontSize: 10.5, color: "var(--blue)", fontWeight: 800 }}>
                      {photo.label}
                    </small>
                  </div>
                </div>
              ))}
              <div className="gadd" title="Disponible avec le stockage de fichiers" style={{ opacity: 0.6 }}>
                ＋ Ajouter
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ===== Version web (inchangée) ===== */}
      <div className="hidden md:block">
      <div className="mb-5">
        <h2 className="text-[21px] font-extrabold tracking-[-0.3px]">Informations</h2>
        <small className="text-[13px] text-muted">
          La fiche de votre établissement telle que les patients la voient
        </small>
      </div>

      {/* Identité */}
      <div className="mb-4 rounded-2xl border border-line bg-white p-5">
        <div className="mb-5 flex items-center gap-4">
          <span
            aria-hidden
            className="grid h-[72px] w-[72px] place-items-center rounded-[20px] text-2xl text-white"
            style={{ background: etab.gradient }}
          >
            🏥
          </span>
          <div>
            <b className="block text-base font-extrabold">{etab.nom}</b>
            <div className="text-[12.5px] text-muted">{etab.type} · Établissement vérifié ✔</div>
            <button
              type="button"
              disabled
              title="Disponible avec le stockage de fichiers"
              className="mt-2 cursor-not-allowed rounded-[9px] border-[1.5px] border-line bg-white px-3 py-1.5 text-[11.5px] font-bold text-blue opacity-50"
            >
              Changer le logo
            </button>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={labelChamp}>Nom de l’établissement</label>
            <div className={champStatique}>{etab.nom}</div>
          </div>
          <div>
            <label className={labelChamp}>Type</label>
            <div className={champStatique}>{etab.type}</div>
          </div>
          <div className="sm:col-span-2">
            <label className={labelChamp}>Description</label>
            <div className={`${champStatique} min-h-[60px]`}>{etab.description}</div>
          </div>
          <div className="sm:col-span-2">
            <label className={labelChamp}>Adresse</label>
            <div className={champStatique}>{etab.adresse}</div>
          </div>
          <div>
            <label className={labelChamp}>Téléphone</label>
            <div className={champStatique}>{etab.telephone}</div>
          </div>
          <div>
            <label className={labelChamp}>E-mail</label>
            <div className={champStatique}>{etab.email}</div>
          </div>
          <div className="sm:col-span-2">
            <label className={labelChamp}>Site web</label>
            <div className={champStatique}>{etab.siteWeb}</div>
          </div>
        </div>
        <div className="mt-[14px] flex items-start gap-[9px] rounded-[11px] bg-teal-soft px-[13px] py-[11px] text-[12.5px] font-semibold leading-relaxed text-blue">
          <span aria-hidden>ℹ️</span>
          <div>
            Champs de démonstration — la modification de la fiche sera possible quand la base de
            données sera branchée.
          </div>
        </div>
      </div>

      {/* Photos */}
      <div className="rounded-2xl border border-line bg-white p-5">
        <h3 className="mb-3 text-[15px] font-extrabold">🖼️ Photos de l’établissement</h3>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(130px,1fr))] gap-3">
          {PHOTOS.map((photo) => (
            <div
              key={photo.label}
              className="relative grid aspect-[4/3] place-items-center overflow-hidden rounded-xl border border-line text-center"
              style={{ background: photo.fond }}
            >
              <div>
                <div className="text-[26px]" aria-hidden>
                  {photo.emoji}
                </div>
                <small className="text-[11px] font-extrabold text-blue">{photo.label}</small>
              </div>
            </div>
          ))}
          <div
            title="Disponible avec le stockage de fichiers"
            className="grid aspect-[4/3] cursor-not-allowed place-items-center rounded-xl border-[1.5px] border-dashed border-[#BCD3E0] bg-[#F6FAFC] p-2 text-center text-[12.5px] font-extrabold text-teal opacity-60"
          >
            ＋ Ajouter une photo
          </div>
        </div>
      </div>
      </div>
    </EtablissementShell>
  );
}
