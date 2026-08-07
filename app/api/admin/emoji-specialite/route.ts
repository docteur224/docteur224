import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { creerClientServeur } from "@/lib/supabase/server";
import {
  devinerEmojiSpecialite,
  emojiDeSecours,
  estEmoji,
} from "@/lib/icones-specialites";

/*
 * Icône proposée pour une spécialité que le dictionnaire ne reconnaît pas.
 *
 * Le dictionnaire de `lib/icones-specialites` couvre les spécialités réelles,
 * mais l'admin peut saisir n'importe quoi (« Médecine traditionnelle »,
 * « Centre de dépistage »…). Plutôt que de retomber sur une pastille neutre,
 * on demande une icône au modèle.
 *
 * Côté serveur parce que la clé Anthropic n'a rien à faire dans le navigateur.
 * Réservé aux administrateurs : l'appel est facturé, et rien ne justifie de
 * l'ouvrir plus largement.
 *
 * Cette route n'échoue jamais du point de vue de l'appelant : IA indisponible,
 * clé absente, réponse illisible — on renvoie toujours une icône, quitte à ce
 * qu'elle vienne du jeu de secours. L'ajout d'une spécialité ne doit pas
 * dépendre de la disponibilité d'un service externe.
 */

const MODELE = "claude-opus-5";

const CONSIGNE = `Tu choisis l'emoji le plus représentatif d'une spécialité ou d'un service de santé, pour une plateforme de rendez-vous médicaux en Guinée.

Règles :
- un seul emoji, sans texte, sans variante de couleur de peau ;
- il doit évoquer l'organe, l'acte ou l'outil de la spécialité (un rein pour la néphrologie, une seringue pour la vaccination) ;
- évite le stéthoscope 🩺, réservé à la médecine générale, et l'hôpital 🏥, trop vague ;
- si rien d'évident ne convient, choisis ⚕️.`;

/** Demande une icône au modèle. Renvoie null si l'appel n'aboutit pas. */
async function demanderEmojiIA(nom: string): Promise<string | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;

  const client = new Anthropic();
  try {
    const reponse = await client.beta.messages.create({
      model: MODELE,
      max_tokens: 2048,
      system: CONSIGNE,
      // Choisir un emoji ne demande pas de raisonnement profond : `low`
      // limite les jetons de réflexion, donc le coût et l'attente de l'admin.
      output_config: {
        effort: "low",
        format: {
          type: "json_schema",
          schema: {
            type: "object",
            properties: {
              emoji: { type: "string", description: "L'emoji choisi, seul." },
            },
            required: ["emoji"],
            additionalProperties: false,
          },
        },
      },
      // Repli côté serveur : si les classificateurs refusent la requête,
      // l'API la rejoue sur le modèle recommandé plutôt que de nous rendre
      // un refus. Sans cela un nom mal interprété ferait perdre l'icône.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      messages: [{ role: "user", content: `Spécialité : ${nom}` }],
    });

    // Un refus renvoie un HTTP 200 au contenu vide : lire `content[0]`
    // directement lèverait une erreur au lieu de dégrader proprement.
    if (reponse.stop_reason === "refusal") return null;

    const texte = reponse.content.find((bloc) => bloc.type === "text")?.text;
    if (!texte) return null;
    const { emoji } = JSON.parse(texte) as { emoji?: string };
    return emoji && estEmoji(emoji) ? emoji.trim() : null;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const session = await creerClientServeur();
  const { data: auth } = await session.auth.getUser();
  if (!auth.user) {
    return NextResponse.json({ erreur: "Session expirée — reconnectez-vous." }, { status: 401 });
  }

  // Le rôle est relu en base, jamais déduit de ce que poste l'appelant.
  const { data: appelant } = await session
    .from("utilisateurs")
    .select("role")
    .eq("id", auth.user.id)
    .maybeSingle();
  if (appelant?.role !== "admin") {
    return NextResponse.json({ erreur: "Réservé aux administrateurs." }, { status: 403 });
  }

  const { nom } = await request.json().catch(() => ({ nom: null }));
  if (typeof nom !== "string" || !nom.trim()) {
    return NextResponse.json({ erreur: "Spécialité non précisée." }, { status: 400 });
  }
  const libelle = nom.trim().slice(0, 80);

  // Le dictionnaire d'abord : instantané, gratuit, et déjà juste dans la
  // grande majorité des cas. L'IA ne sert qu'au reliquat.
  const connu = devinerEmojiSpecialite(libelle);
  if (connu) return NextResponse.json({ emoji: connu, source: "dictionnaire" });

  const propose = await demanderEmojiIA(libelle);
  return propose
    ? NextResponse.json({ emoji: propose, source: "ia" })
    : NextResponse.json({ emoji: emojiDeSecours(libelle), source: "secours" });
}
