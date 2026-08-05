"use client";

import EtablissementShell from "@/components/etablissement/EtablissementShell";
import { useEtablissementConnecte } from "@/lib/etablissement";
import EnTeteMobile from "@/components/mobile/EnTeteMobile";
import GaleriePhotos from "@/components/pro/GaleriePhotos";
import PhotoProfil from "@/components/pro/PhotoProfil";
import { useState } from "react";
import { enregistrerInformationsEtablissement } from "@/lib/etablissement";

/*
 * Informations — reproduit l'écran « etab-infos » de la maquette web :
 * fiche publique de l'établissement (identité, coordonnées, photos) telle
 * qu'affichée aux patients. Les photos sont réelles (Cloudinary) ; les
 * autres champs restent en lecture pour l'instant.
 */

export default function InformationsEtablissement() {
  const { etablissement } = useEtablissementConnecte();
  const ETABLISSEMENT_CONNECTE = etablissement ?? { id: "", nom: "…", nomCourt: "…", type: "", description: "", adresse: "", telephone: "", email: "", siteWeb: "", rccm: "", photoUrl: null, gradient: "linear-gradient(135deg,#16A085,#0E6655)", statut: "", parametres: {}, gestionnaire: { nom: "", role: "", email: "", telephone: "" } };
  const etab = ETABLISSEMENT_CONNECTE;

  /*
   * Le RCCM est la seule mention légale de la fiche et doit rester
   * corrigeable : le reste de cet écran est encore en lecture seule.
   * L'état local n'est retenu que tant que la valeur du serveur ne
   * change pas (même motif que PhotoProfil).
   */
  const [saisie, setSaisie] = useState<{ depuis: string; valeur: string } | null>(null);
  const rccm = saisie?.depuis === etab.rccm ? saisie.valeur : etab.rccm;
  const [messageRccm, setMessageRccm] = useState<string | null>(null);
  const blocRccm = (prefixe: string) => (
    <>
      <label className={labelChamp} htmlFor={`${prefixe}-rccm`}>
        RCCM
      </label>
      <input
        id={`${prefixe}-rccm`}
        className="w-full rounded-[11px] border border-line bg-white px-[13px] py-3 text-[13.5px] outline-none focus:border-teal"
        placeholder="Ex. GC-KAL/123.456A/2021"
        value={rccm}
        onChange={(e) => setSaisie({ depuis: etab.rccm, valeur: e.target.value })}
        onBlur={async (e) => {
          if (!etab.id) return;
          const res = await enregistrerInformationsEtablissement(etab.id, {
            rccm: e.target.value.trim(),
          });
          setMessageRccm(res.erreur ?? "Enregistré ✓");
        }}
      />
      <p className="mt-1.5 text-[11.5px] text-muted">
        Registre du Commerce et du Crédit Mobilier.{" "}
        {messageRccm && <b className="text-green">{messageRccm}</b>}
      </p>
    </>
  );
  const champStatique = "rounded-[11px] border border-line bg-white px-[13px] py-3 text-[13.5px]";
  const labelChamp = "mb-1.5 block text-xs font-bold text-muted";

  return (
    <EtablissementShell>
      {/* ===== Version mobile (écran « m-etab-infos » de la maquette mobile) ===== */}
      <div className="md:hidden">
        <EnTeteMobile variante="marque" />
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
            <div style={{ marginTop: 10 }}>{blocRccm("m")}</div>
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
            <h4>📸 Photo de l&apos;établissement</h4>
            <PhotoProfil
              photoUrl={etab.photoUrl ?? null}
              initiales={(etab.nomCourt || etab.nom || "?").slice(0, 2).toUpperCase()}
              gradient={etab.gradient}
              taille={80}
            />
          </div>
          <div className="card2">
            <h4>🖼️ Photos de l&apos;établissement</h4>
            <GaleriePhotos proprietaireId={etab.id || undefined} type="etablissement" mobile />
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
          <div className="sm:col-span-2">{blocRccm("w")}</div>
        </div>
        <div className="mt-[14px] flex items-start gap-[9px] rounded-[11px] bg-teal-soft px-[13px] py-[11px] text-[12.5px] font-semibold leading-relaxed text-blue">
          <span aria-hidden>ℹ️</span>
          <div>
            Champs de démonstration — la modification de la fiche sera possible quand la base de
            données sera branchée.
          </div>
        </div>
      </div>

      {/* Photo principale */}
      <div className="mb-4 rounded-2xl border border-line bg-white p-5">
        <h3 className="mb-1 text-[15px] font-extrabold">📸 Photo de l’établissement</h3>
        <p className="mb-3 text-[12.5px] text-muted">
          Elle illustre votre fiche dans les résultats de recherche.
        </p>
        <PhotoProfil
          photoUrl={etab.photoUrl ?? null}
          initiales={(etab.nomCourt || etab.nom || "?").slice(0, 2).toUpperCase()}
          gradient={etab.gradient}
          taille={96}
        />
      </div>

      {/* Photos */}
      <div className="rounded-2xl border border-line bg-white p-5">
        <h3 className="mb-1 text-[15px] font-extrabold">🖼️ Photos de l’établissement</h3>
        <GaleriePhotos proprietaireId={etab.id || undefined} type="etablissement" />
      </div>
      </div>
    </EtablissementShell>
  );
}
