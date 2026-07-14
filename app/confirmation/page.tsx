import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import TopNav from "@/components/site/TopNav";
import { formatDateLongue } from "@/lib/dates";
import { chargerEtablissementParId, chargerMedecinParId, nomComplet } from "@/lib/donnees";

export const metadata: Metadata = {
  title: "Rendez-vous confirmé | Docteur 224",
};

/*
 * Écran de succès — reproduit l'écran « confirmation » de la maquette web :
 * coche verte animée, récapitulatif en une phrase, bandeau de notification.
 */
export default async function Confirmation({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const medecinId = typeof sp.medecin === "string" ? sp.medecin : "";
  const date = typeof sp.date === "string" ? sp.date : "";
  const heure = typeof sp.heure === "string" ? sp.heure : "";

  const medecin = await chargerMedecinParId(medecinId);
  if (!medecin || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(heure)) {
    redirect("/");
  }
  const etab = await chargerEtablissementParId(medecin.etablissementId);

  return (
    <div className="flex min-h-screen flex-col bg-bg">
      <TopNav minimale />

      {/* ================= VERSION MOBILE (écran « confirmation » de la maquette mobile) ================= */}
      <div className="confwrap md:hidden">
        <div className="check">
          <div>✓</div>
        </div>
        <h2>Rendez-vous confirmé !</h2>
        <p>
          Votre rendez-vous avec <b>{nomComplet(medecin)}</b> est réservé pour le{" "}
          <b>
            {formatDateLongue(date)} à {heure}
          </b>
          , à la {etab?.nom}.
        </p>
        <div className="notif">📩 Confirmation envoyée par SMS et e-mail</div>
        <p style={{ fontSize: 11 }}>
          Mode démonstration : les envois simulés sont visibles dans le centre de notifications
          (🔔).
        </p>
        <div style={{ width: "100%", marginTop: 26, display: "flex", flexDirection: "column", gap: 10 }}>
          <Link href="/mes-rendez-vous" className="btn">
            Voir mes rendez-vous
          </Link>
          <Link href="/" className="btn ghost">
            Retour à l&apos;accueil
          </Link>
        </div>
      </div>

      {/* ================= VERSION WEB (inchangée) ================= */}
      <div className="mx-auto hidden max-w-[560px] px-[30px] py-[60px] text-center md:block">
        <div className="mx-auto mb-[22px] grid h-[104px] w-[104px] animate-[pop_.4s_ease] place-items-center rounded-full bg-green-soft">
          <div className="grid h-[72px] w-[72px] place-items-center rounded-full bg-green text-4xl text-white">
            ✓
          </div>
        </div>
        <h2 className="text-[25px] font-extrabold tracking-[-0.4px]">Rendez-vous confirmé !</h2>
        <p className="mt-[10px] text-[14.5px] leading-relaxed text-muted">
          Votre rendez-vous avec <b>{nomComplet(medecin)}</b> est réservé pour le
          <br />
          <b>
            {formatDateLongue(date)} à {heure}
          </b>
          , à la {etab?.nom}.
        </p>
        <div className="mt-[18px] inline-flex items-center gap-2 rounded-xl bg-green-soft px-[18px] py-[11px] text-[13px] font-bold text-green">
          📩 Confirmation envoyée par SMS et e-mail · rappel 24 h avant
        </div>
        <p className="mt-2 text-[11.5px] text-muted">
          Mode démonstration : les envois simulés sont visibles dans le centre de notifications
          (🔔). L’envoi réel sera branché avec la base de données.
        </p>
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <Link
            href="/mes-rendez-vous"
            className="rounded-[11px] bg-teal px-[18px] py-[11px] text-[13.5px] font-bold text-white transition-colors hover:bg-[#2790bc]"
          >
            Voir mes rendez-vous
          </Link>
          <Link
            href="/"
            className="rounded-[11px] border-[1.5px] border-line bg-white px-[18px] py-[11px] text-[13.5px] font-bold text-blue transition-colors hover:bg-bg"
          >
            Retour à l’accueil
          </Link>
        </div>
      </div>
    </div>
  );
}
