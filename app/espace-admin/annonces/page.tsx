"use client";

import { useState } from "react";
import AdminShell from "@/components/admin/AdminShell";
import EnTeteMobile from "@/components/mobile/EnTeteMobile";
import Pagination, { usePagination } from "@/components/site/Pagination";
import { envoyerAnnonce, useAnnonces, useListeContenu } from "@/lib/admin";

/*
 * Annonces — reproduit l'écran « admin-annonces » de la maquette web :
 * diffusion d'un message à un segment d'utilisateurs (canaux SMS, e-mail,
 * in-app) et historique. L'envoi ajoute l'annonce à l'historique et consigne
 * les envois simulés dans le centre de notifications (Phase 10).
 */

const SEGMENTS = [
  "Tous les médecins",
  "Tous les patients",
  "Médecins non vérifiés",
  "Tous les établissements",
  "Tous les utilisateurs",
];

/*
 * Le ciblage par ville lit le référentiel plutôt qu'une liste figée : celle
 * qui était codée ici proposait « Boké », absente de la base, et écrivait
 * « N'Zérékoré » là où le référentiel dit « Nzérékoré » — deux ciblages qui
 * ne désignaient personne. Une ville ajoutée dans Paramètres apparaît
 * désormais ici sans intervention.
 */
const TOUTES_VILLES = "Toutes les villes";

const CANAUX = ["SMS", "E-mail", "Notification in-app"];

const MESSAGE_DEFAUT =
  "Maintenance prévue dimanche de 02:00 à 04:00. La plateforme sera momentanément indisponible. Merci de votre compréhension.";

export default function AnnoncesAdmin() {
  const { annonces, recharger } = useAnnonces();
  const pagi = usePagination(annonces, 10);
  const { liste: villesReferencees } = useListeContenu("villes");
  const villes = [TOUTES_VILLES, ...villesReferencees];
  const [segment, setSegment] = useState(SEGMENTS[0]);
  const [ville, setVille] = useState(TOUTES_VILLES);
  const [canaux, setCanaux] = useState<string[]>(["SMS", "E-mail"]);
  const [message, setMessage] = useState(MESSAGE_DEFAUT);

  function basculerCanal(canal: string) {
    setCanaux((actifs) =>
      actifs.includes(canal) ? actifs.filter((c) => c !== canal) : [...actifs, canal]
    );
  }

  function envoyer() {
    if (!message.trim() || canaux.length === 0) return;
    const cible = ville === TOUTES_VILLES ? segment : `${segment} · ${ville}`;
    envoyerAnnonce(message.trim(), cible, canaux).then(() => recharger());
    setMessage("");
  }

  const champ =
    "w-full rounded-[11px] border border-line bg-white px-[13px] py-3 text-[13.5px] outline-none focus:border-teal";
  const etiquette = "mb-1.5 block text-xs font-bold text-muted";

  return (
    <AdminShell>
      {/* ===== Version mobile (écran « m-admin-annonces » de la maquette mobile) ===== */}
      <div className="md:hidden">
        <EnTeteMobile retour="/espace-admin/plus" titre="Annonces" />
        <div className="pad">
          <div className="card2">
            <h4>Nouvelle annonce</h4>
            <div className="fldm">
              <label>Destinataires</label>
              <select className="v" value={segment} onChange={(e) => setSegment(e.target.value)}>
                {SEGMENTS.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </div>
            <div className="fldm">
              <label>Ville (optionnel)</label>
              <select className="v" value={ville} onChange={(e) => setVille(e.target.value)}>
                {villes.map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </div>
            <div className="fldm">
              <label>Canaux</label>
              <div className="chips">
                {CANAUX.map((canal) => {
                  const actif = canaux.includes(canal);
                  return (
                    <button
                      key={canal}
                      type="button"
                      className={`chip${actif ? " on" : ""}`}
                      onClick={() => basculerCanal(canal)}
                    >
                      {canal}
                      {actif ? " ✓" : ""}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="fldm">
              <label>Message</label>
              <textarea
                className="textarea"
                rows={3}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
              />
            </div>
            <button
              type="button"
              className="btn block"
              style={{ opacity: !message.trim() || canaux.length === 0 ? 0.5 : 1 }}
              disabled={!message.trim() || canaux.length === 0}
              onClick={envoyer}
            >
              📢 Envoyer l&apos;annonce
            </button>
          </div>
          <div className="card2">
            <h4>Historique</h4>
            {pagi.tranche.map((annonce) => (
              <div key={annonce.id} className="asstrowm">
                <span
                  className="av"
                  aria-hidden
                  style={{ background: "linear-gradient(135deg,#2E9CCA,#15506B)" }}
                >
                  📢
                </span>
                <span className="meta">
                  <b>{annonce.message}</b>
                  <small>{annonce.detail}</small>
                </span>
                <span className="pill ok">Envoyée</span>
              </div>
            ))}
            <Pagination
              page={pagi.page}
              pages={pagi.pages}
              total={pagi.total}
              premier={pagi.premier}
              dernier={pagi.dernier}
              onPage={pagi.setPage}
              libelle="annonces"
            />
          </div>
        </div>
      </div>

      {/* ===== Version web (inchangée) ===== */}
      <div className="hidden md:block">
      <div className="mb-5">
        <h2 className="text-[21px] font-extrabold tracking-[-0.3px]">Annonces</h2>
        <small className="text-[13px] text-muted">
          Diffuser un message à un segment d’utilisateurs
        </small>
      </div>

      <div className="mb-4 rounded-2xl border border-line bg-white p-5">
        <h3 className="mb-[14px] text-[15px] font-extrabold">Nouvelle annonce</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={etiquette}>Destinataires</label>
            <select value={segment} onChange={(e) => setSegment(e.target.value)} className={champ}>
              {SEGMENTS.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={etiquette}>Filtrer par ville (optionnel)</label>
            <select value={ville} onChange={(e) => setVille(e.target.value)} className={champ}>
              {villes.map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="mt-[14px]">
          <label className={etiquette}>Canaux d’envoi</label>
          <div className="mt-2 flex flex-wrap gap-2">
            {CANAUX.map((canal) => {
              const actif = canaux.includes(canal);
              return (
                <button
                  key={canal}
                  type="button"
                  onClick={() => basculerCanal(canal)}
                  className={`rounded-full border px-[14px] py-2 text-xs font-bold ${
                    actif
                      ? "border-[#BFE3CC] bg-green-soft text-green"
                      : "border-[#CDE6F2] bg-teal-soft text-blue"
                  }`}
                >
                  {canal}
                  {actif ? " ✓" : ""}
                </button>
              );
            })}
          </div>
        </div>
        <div className="mt-[14px]">
          <label className={etiquette}>Message</label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={3}
            className={`${champ} min-h-[70px] resize-y`}
          />
        </div>
        <button
          type="button"
          onClick={envoyer}
          disabled={!message.trim() || canaux.length === 0}
          className="mt-[14px] rounded-[9px] bg-teal px-[14px] py-2 text-[12.5px] font-bold text-white transition-colors hover:bg-[#2790bc] disabled:cursor-not-allowed disabled:opacity-50"
        >
          📢 Envoyer l’annonce
        </button>
      </div>

      <div className="rounded-2xl border border-line bg-white p-5">
        <h3 className="mb-1 text-[15px] font-extrabold">Historique des annonces</h3>
        {pagi.tranche.map((annonce) => (
          <div
            key={annonce.id}
            className="flex flex-wrap items-center gap-[13px] border-b border-line py-[14px] last:border-b-0"
          >
            <span
              aria-hidden
              className="grid h-[42px] w-[42px] flex-none place-items-center rounded-xl text-sm text-white"
              style={{ background: "linear-gradient(135deg,#2E9CCA,#15506B)" }}
            >
              📢
            </span>
            <div className="min-w-0 flex-1">
              <b className="block text-sm font-extrabold">{annonce.message}</b>
              <small className="text-xs text-muted">{annonce.detail}</small>
            </div>
            <span className="rounded-lg bg-green-soft px-[9px] py-1 text-[11px] font-bold text-green">
              Envoyée
            </span>
          </div>
        ))}
        <Pagination
          page={pagi.page}
          pages={pagi.pages}
          total={pagi.total}
          premier={pagi.premier}
          dernier={pagi.dernier}
          onPage={pagi.setPage}
          libelle="annonces"
        />
        <p className="mt-3 text-[11.5px] text-muted">
          Mode démonstration : l’annonce est ajoutée à l’historique et les envois simulés
          apparaissent dans le centre de notifications (🔔). L’envoi réel sera branché avec la
          base de données.
        </p>
      </div>
      </div>
    </AdminShell>
  );
}
