import Image from "next/image";
import Link from "next/link";
import logoHorizontal from "@/public/Logo_Principal_Horizontal_Docteur224_Transparent.png";
import logoCompact from "@/public/Logotype__Compact_Vertical_Docteur224_Transparent.png";
import marque from "@/public/Favicon_Docteur224_Transparent.png";

/**
 * Logo Docteur 224 — source unique pour tous les écrans.
 *
 * - `horizontal` : logo principal (stéthoscope + « Docteur 224 » + baseline),
 *   pour les barres de navigation et le pied de page.
 * - `compact`    : logotype vertical, pour les écrans d'authentification.
 * - `marque`     : le pictogramme seul, quand la place manque.
 *
 * `surFonce` inverse le logo en blanc plein : les fichiers fournis ont le mot
 * « Docteur » en bleu nuit, illisible sur le héros bleu ou le pied de page.
 */
export default function Logo({
  variante = "horizontal",
  hauteur = 30,
  surFonce = false,
  lien = "/",
  className,
  priority = false,
}: {
  variante?: "horizontal" | "compact" | "marque";
  /** Hauteur de rendu en px ; la largeur suit le ratio d'origine. */
  hauteur?: number;
  surFonce?: boolean;
  /** `null` pour un logo non cliquable (écrans d'authentification). */
  lien?: string | null;
  className?: string;
  priority?: boolean;
}) {
  const source =
    variante === "horizontal" ? logoHorizontal : variante === "compact" ? logoCompact : marque;
  const ratio = source.width / source.height;

  const image = (
    <Image
      src={source}
      alt="Docteur 224 — La santé accessible en Guinée"
      height={hauteur}
      width={Math.round(hauteur * ratio)}
      priority={priority}
      className={surFonce ? "brightness-0 invert" : undefined}
      style={{ height: hauteur, width: "auto" }}
    />
  );

  if (!lien) return <span className={className}>{image}</span>;
  return (
    <Link href={lien} className={className} aria-label="Docteur 224 — accueil">
      {image}
    </Link>
  );
}
