/**
 * Couleurs des graphiques — palettes VALIDÉES (lisibilité daltoniens, contraste)
 * avec le script de validation de palette. Ne pas en changer l'ordre au hasard :
 * l'ordre fait partie de la validation (deux couleurs voisines restent distinctes).
 */

/** Une couleur fixe par délégué (attribuée selon l'ordre des identifiants, jamais selon le rang). */
export const DELEGATE_COLORS = ["#0d9488", "#6250d6", "#eb6834", "#2a78d6"];

/** Visites réalisées vs annulées/reportées. */
export const DONE_COLOR = "#0d9488";
export const CANCELLED_COLOR = "#eb6834";

/** Segments A → C : une seule teinte, du plus foncé (A, fort potentiel) au plus clair. */
export const SEGMENT_COLORS = { A: "#134e4a", B: "#0f766e", C: "#14b8a6" } as const;

/** Encre des axes et grilles (discrète). */
export const AXIS_COLOR = "#64748b";
export const GRID_COLOR = "#e2e8f0";

/** Couleur stable d'un délégué à partir de la liste triée des ids de l'équipe. */
export function delegateColor(delegueId: number, allIds: number[]): string {
  const sorted = [...allIds].sort((a, b) => a - b);
  return DELEGATE_COLORS[sorted.indexOf(delegueId) % DELEGATE_COLORS.length] ?? DELEGATE_COLORS[0];
}

/** Tendance de l'activité : couverture et CPA (deux couleurs voisines de la palette validée ci-dessus). */
export const COVERAGE_COLOR = DELEGATE_COLORS[0];
export const CPA_COLOR = DELEGATE_COLORS[1];
