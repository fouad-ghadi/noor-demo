/**
 * Style des blocs de visite dans le calendrier, selon le statut :
 * fond blanc + barre de couleur à gauche (le statut), texte toujours en encre lisible.
 * Le safran n'apparaît pas ici : il est réservé à « aujourd'hui » et à l'heure actuelle.
 */
import type { Visit } from "@/api/types";

export function visitBlockClass(v: Visit): string {
  if (v.report_pending) return "border-l-orange-500 bg-orange-50 text-ink";
  switch (v.status) {
    case "realisee":
      return "border-l-emerald-500 bg-white text-ink/75";
    case "annulee":
      return "border-l-rose-400 bg-white text-ink/50 line-through decoration-rose-400";
    case "reportee":
      return "border-l-amber-400 bg-white text-ink/50 line-through decoration-amber-400";
    default:
      return "border-l-pine bg-mint-wash text-ink";
  }
}

export const LEGEND = [
  { label: "Planifiée", className: "bg-pine" },
  { label: "Compte-rendu à faire", className: "bg-orange-500" },
  { label: "Réalisée", className: "bg-emerald-500" },
  { label: "Annulée / reportée", className: "bg-rose-400" },
];
