"use client";

import AdminShell from "@/components/admin/AdminShell";
import AppBarMobile from "@/components/mobile/AppBarMobile";
import Interrupteur from "@/components/patient/Interrupteur";
import {
  enregistrerPermissionsAdmin,
  usePermissionsAdmin,
  type PermissionsAdmin,
} from "@/lib/mock-admin";

/*
 * Équipe admin — reproduit l'écran « admin-equipe » de la maquette web :
 * comptes administrateurs avec rôles, et grille de permissions de la
 * modératrice (persistée en local). Cloisonnement : les dossiers médicaux
 * ne sont jamais accessibles depuis l'espace d'administration.
 */

const ADMINS = [
  {
    nom: "Fatou Keïta",
    email: "fatou@docteur224.gn",
    initiales: "FK",
    gradient: "linear-gradient(135deg,#15506B,#0B2E3D)",
    role: "Super-admin",
    classes: "bg-teal-soft text-blue",
  },
  {
    nom: "Mariam Diané",
    email: "mariam@docteur224.gn",
    initiales: "MD",
    gradient: "linear-gradient(135deg,#6C5CE7,#341F97)",
    role: "Modératrice",
    classes: "bg-amber-soft text-amber",
  },
  {
    nom: "Sékou Camara",
    email: "sekou@docteur224.gn",
    initiales: "SC",
    gradient: "linear-gradient(135deg,#16A085,#0E6655)",
    role: "Finance",
    classes: "bg-green-soft text-green",
  },
  {
    nom: "Aïcha Baldé",
    email: "aicha@docteur224.gn",
    initiales: "AB",
    gradient: "linear-gradient(135deg,#9AA8B2,#647A89)",
    role: "Validation",
    classes: "bg-teal-soft text-blue",
  },
];

const PERMISSIONS: { cle: keyof PermissionsAdmin; titre: string; detail?: string }[] = [
  { cle: "validations", titre: "Validations", detail: "Approuver / rejeter les professionnels" },
  { cle: "moderation", titre: "Modération", detail: "Signalements et avis" },
  { cle: "pilotageAnnonces", titre: "Pilotage & annonces" },
  { cle: "finances", titre: "Finances", detail: "Revenus, remboursements, reversements" },
  { cle: "parametres", titre: "Paramètres de la plateforme" },
];

export default function EquipeAdmin() {
  const permissions = usePermissionsAdmin();

  function basculer(cle: keyof PermissionsAdmin, valeur: boolean) {
    enregistrerPermissionsAdmin({ ...permissions, [cle]: valeur });
  }

  return (
    <AdminShell>
      {/* ===== Version mobile (écran « m-admin-equipe » de la maquette mobile) ===== */}
      <div className="md:hidden">
        <AppBarMobile retour="/espace-admin/plus" titre="Équipe admin" />
        <div className="pad">
          <div className="abannerm" style={{ background: "var(--red-soft)", borderColor: "#F3C9C2", color: "var(--red)" }}>
            <span aria-hidden>🔒</span>
            <div>
              <b>Cloisonnement.</b> Aucun administrateur ne peut consulter les{" "}
              <b>dossiers médicaux</b> des patients.
            </div>
          </div>
          <button
            type="button"
            className="btn block"
            disabled
            title="Disponible avec l'authentification"
            style={{ opacity: 0.5, cursor: "not-allowed", marginTop: 0 }}
          >
            + Ajouter un administrateur
          </button>
          <div className="card2" style={{ marginTop: 12 }}>
            <h4>Administrateurs · {ADMINS.length}</h4>
            {ADMINS.map((admin) => (
              <div key={admin.nom} className="asstrowm">
                <span className="av" aria-hidden style={{ background: admin.gradient }}>
                  {admin.initiales}
                </span>
                <span className="meta">
                  <b>{admin.nom}</b>
                  <small>{admin.email}</small>
                </span>
                <span className="rolepill">{admin.role}</span>
              </div>
            ))}
          </div>
          <div className="card2">
            <h4>Permissions — Mariam</h4>
            {PERMISSIONS.map((permission) => (
              <div key={permission.cle} className="setrow">
                <div>
                  <b>{permission.titre}</b>
                  {permission.detail && <small>{permission.detail}</small>}
                </div>
                <Interrupteur
                  actif={permissions[permission.cle]}
                  onChange={(v) => basculer(permission.cle, v)}
                  label={permission.titre}
                />
              </div>
            ))}
            <div className="setrow">
              <div>
                <b>🔒 Dossiers médicaux</b>
                <small>Interdit à tous les admins</small>
              </div>
              <span className="pill bad">Verrouillé</span>
            </div>
          </div>
        </div>
      </div>

      {/* ===== Version web (inchangée) ===== */}
      <div className="hidden md:block">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-[21px] font-extrabold tracking-[-0.3px]">Équipe admin</h2>
          <small className="text-[13px] text-muted">Comptes administrateurs et rôles</small>
        </div>
        <button
          type="button"
          disabled
          title="Disponible avec l'authentification"
          className="cursor-not-allowed rounded-[9px] bg-teal px-[14px] py-2 text-[12.5px] font-bold text-white opacity-50"
        >
          + Ajouter un administrateur
        </button>
      </div>

      <div className="mb-4 flex items-start gap-[9px] rounded-xl border border-[#F3C9C2] bg-red-soft px-[14px] py-3 text-[12.5px] font-semibold leading-relaxed text-red">
        <span aria-hidden>🔒</span>
        <div>
          <b>Cloisonnement.</b> Aucun administrateur ne peut consulter les{" "}
          <b>dossiers médicaux</b> des patients. Ces données de santé ne sont jamais accessibles
          depuis l’espace d’administration.
        </div>
      </div>

      <div className="mb-4 rounded-2xl border border-line bg-white p-5">
        <h3 className="mb-1 text-[15px] font-extrabold">Administrateurs · {ADMINS.length}</h3>
        {ADMINS.map((admin) => (
          <div
            key={admin.nom}
            className="flex flex-wrap items-center gap-[13px] border-b border-line py-[14px] last:border-b-0"
          >
            <span
              aria-hidden
              className="grid h-[42px] w-[42px] flex-none place-items-center rounded-xl text-sm font-extrabold text-white"
              style={{ background: admin.gradient }}
            >
              {admin.initiales}
            </span>
            <div className="min-w-0 flex-1">
              <b className="block text-sm font-extrabold">{admin.nom}</b>
              <small className="text-xs text-muted">{admin.email}</small>
            </div>
            <span
              className={`flex-none rounded-full px-[9px] py-[3px] text-[10.5px] font-extrabold ${admin.classes}`}
            >
              {admin.role}
            </span>
            <button
              type="button"
              disabled
              title="Disponible avec l'authentification"
              className="cursor-not-allowed rounded-[9px] border-[1.5px] border-line bg-white px-3 py-1.5 text-[11.5px] font-bold text-blue opacity-50"
            >
              Gérer
            </button>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-line bg-white p-5">
        <h3 className="mb-1 text-[15px] font-extrabold">Permissions — Mariam (Modératrice)</h3>
        {PERMISSIONS.map((permission) => (
          <div
            key={permission.cle}
            className="flex items-center justify-between gap-[14px] border-b border-line py-[15px]"
          >
            <div>
              <b className="block text-[13.5px] font-bold">{permission.titre}</b>
              {permission.detail && (
                <small className="text-xs text-muted">{permission.detail}</small>
              )}
            </div>
            <Interrupteur
              actif={permissions[permission.cle]}
              onChange={(v) => basculer(permission.cle, v)}
              label={permission.titre}
            />
          </div>
        ))}
        <div className="flex items-center justify-between gap-[14px] py-[15px]">
          <div>
            <b className="block text-[13.5px] font-bold">🔒 Dossiers médicaux des patients</b>
            <small className="text-xs text-muted">Interdit à tous les profils admin</small>
          </div>
          <span className="rounded-lg bg-red-soft px-[9px] py-1 text-[11px] font-bold text-red">
            Verrouillé
          </span>
        </div>
      </div>
      </div>
    </AdminShell>
  );
}
