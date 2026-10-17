/**
 * Libellés français et couleurs des valeurs codées renvoyées par l'API.
 * (En base, on stocke des codes sans accents : "realisee", "apres_midi"...)
 */
import type {
  AlertSeverity,
  Feedback,
  PracticeType,
  PrescribingStatus,
  ProgressStatus,
  Segment,
  TimeSlot,
  VisitStatus,
} from "@/api/types";

export const VISIT_STATUS: Record<VisitStatus, { label: string; className: string }> = {
  planifiee: { label: "Planifiée", className: "bg-sky-50 text-sky-700 border-sky-200" },
  realisee: { label: "Réalisée", className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  annulee: { label: "Annulée", className: "bg-rose-50 text-rose-700 border-rose-200" },
  reportee: { label: "Reportée", className: "bg-amber-50 text-amber-700 border-amber-200" },
};

export const PRESCRIBING: Record<PrescribingStatus, { label: string; className: string; dot: string }> = {
  regulier: { label: "Régulier", className: "bg-emerald-50 text-emerald-700 border-emerald-200", dot: "bg-emerald-500" },
  occasionnel: { label: "Occasionnel", className: "bg-amber-50 text-amber-700 border-amber-200", dot: "bg-amber-400" },
  non_prescripteur: { label: "Non prescripteur", className: "bg-slate-50 text-slate-500 border-slate-200", dot: "bg-slate-300" },
};

export const SEGMENT: Record<Segment, { label: string; className: string }> = {
  A: { label: "Segment A — fort potentiel", className: "bg-teal-700 text-white border-teal-700" },
  B: { label: "Segment B — potentiel moyen", className: "bg-teal-100 text-teal-800 border-teal-200" },
  C: { label: "Segment C — faible potentiel", className: "bg-slate-100 text-slate-600 border-slate-200" },
};

export const TIME_SLOT: Record<TimeSlot, string> = {
  matin: "Matin (9h–12h)",
  midi: "Midi (12h–14h)",
  apres_midi: "Après-midi (14h–19h)",
};

export const PRACTICE_TYPE: Record<PracticeType, string> = {
  cabinet: "Cabinet",
  clinique: "Clinique",
  hopital_public: "Hôpital public",
};

export const FEEDBACK: Record<Feedback, { label: string; emoji: string; className: string }> = {
  tres_favorable: { label: "Très favorable", emoji: "😀", className: "text-emerald-700" },
  favorable: { label: "Favorable", emoji: "🙂", className: "text-emerald-600" },
  neutre: { label: "Neutre", emoji: "😐", className: "text-slate-600" },
  reserve: { label: "Réservé", emoji: "😕", className: "text-amber-700" },
  defavorable: { label: "Défavorable", emoji: "🙁", className: "text-rose-700" },
};

export const SOURCE: Record<string, string> = {
  manuel: "Saisie manuelle",
  carte_de_visite: "Carte de visite",
  import: "Import",
};

export const SEVERITY: Record<AlertSeverity, { label: string; className: string }> = {
  haute: { label: "Haute", className: "bg-rose-50 text-rose-700 border-rose-200" },
  moyenne: { label: "Moyenne", className: "bg-amber-50 text-amber-700 border-amber-200" },
  faible: { label: "Faible", className: "bg-slate-50 text-slate-600 border-slate-200" },
};

export const PROGRESS_STATUS: Record<ProgressStatus, { label: string; className: string }> = {
  en_avance: { label: "En avance", className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  dans_les_temps: { label: "Dans les temps", className: "bg-sky-50 text-sky-700 border-sky-200" },
  en_retard: { label: "En retard", className: "bg-rose-50 text-rose-700 border-rose-200" },
};

export const LAST_VISIT_FILTERS: Record<string, string> = {
  lt30: "Moins de 30 jours",
  gt30: "30 jours ou plus (à revoir)",
  "30_60": "Entre 30 et 60 jours",
  gt60: "Plus de 60 jours",
  never: "Jamais visité",
};
