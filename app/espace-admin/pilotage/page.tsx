"use client";

import AdminShell from "@/components/admin/AdminShell";
import EnTeteMobile from "@/components/mobile/EnTeteMobile";
import Interrupteur from "@/components/patient/Interrupteur";
import { basculerVedette, useVedettes } from "@/lib/admin";

/*
 * Pilotage & croissance — reproduit l'écran « admin-pilotage » de la maquette
 * web : couverture par ville et spécialité, consommation SMS, mises en avant.
 * Les interrupteurs « en vedette » sont persistés en local (mock).
 */

const COUVERTURE_VILLES = [
  { ville: "Conakry", medecins: 128, demande: "Bonne", classes: "bg-green-soft text-green" },
  { ville: "Kankan", medecins: 14, demande: "Moyenne", classes: "bg-amber-soft text-amber" },
  { ville: "N'Zérékoré", medecins: 3, demande: "Faible", classes: "bg-red-soft text-red" },
];

const COUVERTURE_SPECIALITES = [
  { nom: "Médecine générale · 64", classes: "border-[#DCE4EA] bg-[#EEF2F5] text-[#3A4A55]" },
  { nom: "Pédiatrie · 38", classes: "border-[#DCE4EA] bg-[#EEF2F5] text-[#3A4A55]" },
  { nom: "Gynécologie · 21", classes: "border-[#DCE4EA] bg-[#EEF2F5] text-[#3A4A55]" },
  { nom: "Neurologie · 2 ⚠", classes: "border-[#EAD3AE] bg-amber-soft text-amber" },
  { nom: "Psychiatrie · 0 ⚠", classes: "border-[#F1C9C2] bg-red-soft text-red" },
];

export default function PilotageAdmin() {
  const { vedettes, recharger } = useVedettes();

  return (
    <AdminShell>
      {/* ===== Version mobile (écran « m-admin-pilotage » de la maquette mobile) ===== */}
      <div className="md:hidden">
        <EnTeteMobile retour="/espace-admin/plus" titre="Pilotage & croissance" />
        <div className="pad">
          <div className="card2">
            <h4>Couverture par ville</h4>
            <table className="atab">
              <thead>
                <tr>
                  <th>Ville</th>
                  <th>Médecins</th>
                  <th>Demande</th>
                </tr>
              </thead>
              <tbody>
                {COUVERTURE_VILLES.map((ligne) => (
                  <tr key={ligne.ville}>
                    <td>{ligne.ville}</td>
                    <td>{ligne.medecins}</td>
                    <td>
                      <span
                        className={`pill ${
                          ligne.demande === "Bonne" ? "ok" : ligne.demande === "Moyenne" ? "soon" : "bad"
                        }`}
                      >
                        {ligne.demande}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="card2">
            <h4>Couverture par spécialité</h4>
            <div className="chips">
              {COUVERTURE_SPECIALITES.map((chip) => (
                <span
                  key={chip.nom}
                  className={`chip ${
                    chip.nom.includes("⚠") ? (chip.nom.includes("0") ? "bad" : "soon") : "grey"
                  }`}
                  style={
                    chip.nom.includes("⚠")
                      ? chip.nom.includes("0")
                        ? { background: "var(--red-soft)", color: "var(--red)", borderColor: "#F1C9C2" }
                        : { background: "var(--amber-soft)", color: "var(--amber)", borderColor: "#EAD3AE" }
                      : undefined
                  }
                >
                  {chip.nom}
                </span>
              ))}
            </div>
          </div>
          <div className="card2">
            <h4>Consommation SMS</h4>
            <b style={{ fontSize: 14 }}>
              18 400 <span className="muted" style={{ fontWeight: 600, fontSize: 12 }}>/ 25 000 ce mois</span>
            </b>
            <div className="budget">
              <span style={{ width: "74%" }} />
            </div>
            <small className="muted">
              Budget à 74 %. Rechargez avant épuisement pour ne pas interrompre les rappels.
            </small>
          </div>
          <div className="card2">
            <h4>En vedette</h4>
            {vedettes.map((vedette) => (
              <div key={vedette.id} className="setrow">
                <div>
                  <b>{vedette.nom}</b>
                  <small>{vedette.detail}</small>
                </div>
                <Interrupteur
                  actif={vedette.actif}
                  onChange={(v) => basculerVedette(vedette.id, v).then(recharger)}
                  label={`Mettre en vedette ${vedette.nom}`}
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ===== Version web (inchangée) ===== */}
      <div className="hidden md:block">
      <div className="mb-5">
        <h2 className="text-[21px] font-extrabold tracking-[-0.3px]">Pilotage & croissance</h2>
        <small className="text-[13px] text-muted">
          Couverture, consommation SMS et mises en avant
        </small>
      </div>

      <div className="mb-4 rounded-2xl border border-line bg-white p-5">
        <h3 className="mb-[14px] text-[15px] font-extrabold">Couverture par ville</h3>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr>
                {["Ville", "Médecins", "Demande", "Action"].map((th) => (
                  <th
                    key={th}
                    className="border-b border-line px-[10px] py-[9px] text-left text-[11px] font-extrabold uppercase tracking-[0.04em] text-muted"
                  >
                    {th}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {COUVERTURE_VILLES.map((ligne) => (
                <tr key={ligne.ville}>
                  <td className="border-b border-line px-[10px] py-[9px] last:border-b-0">
                    {ligne.ville}
                  </td>
                  <td className="border-b border-line px-[10px] py-[9px]">{ligne.medecins}</td>
                  <td className="border-b border-line px-[10px] py-[9px]">
                    <span
                      className={`rounded-lg px-[9px] py-1 text-[11px] font-bold ${ligne.classes}`}
                    >
                      {ligne.demande}
                    </span>
                  </td>
                  <td className="border-b border-line px-[10px] py-[9px]">
                    {ligne.demande === "Faible" ? (
                      <button
                        type="button"
                        disabled
                        title="Campagnes de recrutement : disponible dans une phase ultérieure"
                        className="cursor-not-allowed rounded-[9px] border-[1.5px] border-line bg-white px-3 py-1.5 text-[11.5px] font-bold text-blue opacity-50"
                      >
                        Développer
                      </button>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mb-4 rounded-2xl border border-line bg-white p-5">
        <h3 className="mb-3 text-[15px] font-extrabold">Couverture par spécialité</h3>
        <div className="flex flex-wrap gap-2">
          {COUVERTURE_SPECIALITES.map((chip) => (
            <span
              key={chip.nom}
              className={`rounded-full border px-[14px] py-2 text-xs font-bold ${chip.classes}`}
            >
              {chip.nom}
            </span>
          ))}
        </div>
      </div>

      <div className="mb-4 rounded-2xl border border-line bg-white p-5">
        <h3 className="mb-2 text-[15px] font-extrabold">Consommation SMS</h3>
        <b className="text-[15px]">
          18 400{" "}
          <span className="text-[13px] font-semibold text-muted">/ 25 000 ce mois</span>
        </b>
        <div className="my-[9px] h-[10px] overflow-hidden rounded-full bg-[#E7EEF3]">
          <span className="block h-full bg-teal" style={{ width: "74%" }} />
        </div>
        <small className="text-xs text-muted">
          Budget mensuel à 74 %. Pensez à recharger avant épuisement pour ne pas interrompre les
          rappels.
        </small>
      </div>

      <div className="rounded-2xl border border-line bg-white p-5">
        <h3 className="mb-1 text-[15px] font-extrabold">
          Médecins & établissements en vedette
        </h3>
        {vedettes.map((vedette) => (
          <div
            key={vedette.id}
            className="flex items-center justify-between gap-[14px] border-b border-line py-[15px] last:border-b-0"
          >
            <div>
              <b className="block text-[13.5px] font-bold">{vedette.nom}</b>
              <small className="text-xs text-muted">{vedette.detail}</small>
            </div>
            <Interrupteur
              actif={vedette.actif}
              onChange={(v) => basculerVedette(vedette.id, v).then(recharger)}
              label={`Mettre en vedette ${vedette.nom}`}
            />
          </div>
        ))}
      </div>
      </div>
    </AdminShell>
  );
}
