/**
 * Phrases prédéfinies du compte-rendu (demande du laboratoire : « phrases prédéfinies ou dictée vocale »).
 * Un clic ajoute la phrase aux notes ; « {p} » est remplacé par le premier produit présenté.
 * Le délégué peut ensuite modifier le texte librement.
 */
export const REPORT_PHRASES: { group: string; phrases: string[] }[] = [
  {
    group: "Accueil",
    phrases: [
      "Bon accueil, le médecin a pris le temps d'écouter la présentation.",
      "Visite courte : salle d'attente pleine.",
      "Reçu par la secrétaire, le médecin était absent.",
    ],
  },
  {
    group: "Produit",
    phrases: [
      "Intéressé par {p}, demande plus d'informations.",
      "Connaît bien {p} et le prescrit déjà.",
      "Préfère pour l'instant le produit concurrent.",
      "Questions sur la posologie de {p} : réponse donnée d'après le RCP.",
    ],
  },
  {
    group: "Prescription",
    phrases: [
      "S'engage à prescrire {p} à ses prochains patients.",
      "Prescrit {p} régulièrement, satisfait des résultats.",
      "Hésite à cause du prix pour ses patients.",
    ],
  },
  {
    group: "Patients",
    phrases: [
      "Bons retours de ses patients sur {p}.",
      "Signale des patients non remboursés par l'AMO.",
      "Demande des échantillons pour démarrer des patients.",
    ],
  },
];

/** Ajoute une phrase à la fin des notes (avec un espace), en remplaçant {p} par le produit présenté. */
export function appendPhrase(notes: string, phrase: string, product?: string): string {
  const text = phrase.replace(/\{p\}/g, product ?? "le produit");
  const trimmed = notes.trimEnd();
  return trimmed ? `${trimmed} ${text}` : text;
}
