import Link from "next/link";
import TopNav from "@/components/site/TopNav";

/**
 * Écran temporaire pour les routes prévues dans les phases suivantes.
 * Évite les 404 sur les liens de navigation déjà présents dans les maquettes.
 */
export default function EcranAVenir({ titre, phase }: { titre: string; phase: string }) {
  return (
    <div className="flex min-h-screen flex-col">
      <TopNav />
      <main className="flex flex-1 items-center justify-center px-6 py-16">
        <div className="w-full max-w-[520px] rounded-[18px] border border-line bg-white p-10 text-center shadow-card">
          <div className="text-4xl" aria-hidden>
            🚧
          </div>
          <h1 className="mt-4 text-[22px] font-extrabold tracking-[-0.3px]">{titre}</h1>
          <p className="mt-3 text-[13.5px] leading-relaxed text-muted">
            Cet écran sera développé en <b>{phase}</b>, conformément à la méthode « une phase à la
            fois, qui fonctionne réellement ».
          </p>
          <Link
            href="/"
            className="mt-6 inline-block rounded-[11px] bg-teal px-[18px] py-[11px] text-[13.5px] font-bold text-white transition-colors hover:bg-[#2790bc]"
          >
            ← Retour à l&apos;accueil
          </Link>
        </div>
      </main>
    </div>
  );
}
