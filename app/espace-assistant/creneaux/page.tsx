"use client";

import AssistantShell from "@/components/assistant/AssistantShell";
import GrilleDisponibilites from "@/components/pro/GrilleDisponibilites";
import AppBarMobile from "@/components/mobile/AppBarMobile";
import { useContextePro } from "@/lib/pro";

/*
 * Créneaux & disponibilités (assistant(e)) — reproduit l'écran « asst-dispos »
 * de la maquette web. La grille est PARTAGÉE avec l'espace médecin ; la
 * permission « gérer les créneaux » vient de la table `assistants` et la
 * RLS refuse réellement l'écriture si elle n'est pas accordée.
 */
export default function CreneauxAssistant() {
  const { medecin, permissions, chargement } = useContextePro();

  if (chargement || !medecin) {
    return (
      <AssistantShell>
        <p className="p-6 text-[13px] text-muted">Chargement…</p>
      </AssistantShell>
    );
  }

  const nomMedecin = `${medecin.civilite} ${medecin.prenom.charAt(0)}. ${medecin.nom}`;

  return (
    <AssistantShell>
      {/* ===== Version mobile (écran « m-asst-dispos » de la maquette mobile) ===== */}
      <div className="md:hidden">
        <AppBarMobile retour="/espace-assistant/compte" titre="Créneaux & dispos" />
        <div className="pad">
          {permissions.gererCreneaux ? (
            <div className="abannerm">
              <span aria-hidden>✅</span>
              <div>
                {nomMedecin} vous a accordé la permission de <b>gérer les créneaux</b>. Vos
                modifications sont visibles par le médecin.
              </div>
            </div>
          ) : (
            <div className="abannerm" style={{ background: "var(--red-soft)", borderColor: "#F3C9C2", color: "var(--red)" }}>
              <span aria-hidden>⛔</span>
              <div>
                La permission <b>« Ouvrir / fermer des créneaux »</b> ne vous a pas été accordée.
                La grille est en lecture seule.
              </div>
            </div>
          )}
          <GrilleDisponibilites medecinId={medecin.id} peutModifier={permissions.gererCreneaux} />
        </div>
      </div>

      {/* ===== Version web ===== */}
      <div className="hidden md:block">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-[21px] font-extrabold tracking-[-0.3px]">
            Créneaux &amp; disponibilités
          </h2>
          <small className="text-[13px] text-muted">
            Ouvrez ou fermez les créneaux du médecin
          </small>
        </div>
        {permissions.gererCreneaux && (
          <span className="text-[12.5px] font-bold text-green">
            ✓ Modifications enregistrées automatiquement
          </span>
        )}
      </div>

      {permissions.gererCreneaux ? (
        <div className="mb-[18px] flex items-start gap-[9px] rounded-xl border border-[#BFE0EF] bg-teal-soft px-[14px] py-3 text-[12.5px] font-semibold leading-relaxed text-blue">
          <span aria-hidden>✅</span>
          <div>
            {nomMedecin} vous a accordé la permission de <b>gérer les créneaux</b>. Vos
            modifications sont visibles par le médecin.
          </div>
        </div>
      ) : (
        <div className="mb-[18px] flex items-start gap-[9px] rounded-xl border border-[#F3C9C2] bg-red-soft px-[14px] py-3 text-[12.5px] font-semibold leading-relaxed text-red">
          <span aria-hidden>⛔</span>
          <div>
            La permission <b>« Ouvrir / fermer des créneaux »</b> ne vous a pas été accordée par
            le médecin. La grille est en lecture seule — et toute tentative de modification est
            refusée par la base de données (RLS), pas seulement masquée.
          </div>
        </div>
      )}

      <GrilleDisponibilites medecinId={medecin.id} peutModifier={permissions.gererCreneaux} />
      </div>
    </AssistantShell>
  );
}
