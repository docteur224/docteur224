/** Formate un montant en GNF comme dans les maquettes : « 200 000 GNF ». */
export function formatGNF(montant: number): string {
  return `${montant.toLocaleString("fr-FR")} GNF`;
}

/** Formate une note sur 5 avec la virgule française : « 4,9 ». */
export function formatNote(note: number): string {
  return note.toLocaleString("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}
