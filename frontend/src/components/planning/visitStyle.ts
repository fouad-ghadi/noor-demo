/** Couleurs des blocs de visite dans le calendrier, selon le statut. */
import type { Visit } from "@/api/types";

export function visitBlockClass(v: Visit): string {
  if (v.report_pending) return "border-orange-300 bg-orange-50 text-orange-900";
  switch (v.status) {
    case "realisee":
      return "border-emerald-200 bg-emerald-50 text-emerald-900";
    case "annulee":
      return "border-rose-200 bg-rose-50/70 text-rose-800 line-through decoration-rose-400";
    case "reportee":
      return "border-amber-200 bg-amber-50/70 text-amber-800 line-through decoration-amber-400";
    default:
      return "border-sky-200 bg-sky-50 text-sky-900";
  }
}

export const LEGEND = [
  { label: "Planifiée", className: "bg-sky-400" },
  { label: "Compte-rendu à faire", className: "bg-orange-400" },
  { label: "Réalisée", className: "bg-emerald-500" },
  { label: "Annulée / reportée", className: "bg-rose-400" },
];
