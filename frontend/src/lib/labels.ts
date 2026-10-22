/**
 * Libellés français et couleurs des valeurs codées renvoyées par l'API.
 * (En base, on stocke des codes sans accents : "realisee", "apres_midi"...)
 */
import type {
  AlertSeverity,
  EventType,
  Feedback,
  Frequency,
  PracticeType,
  PrescribingStatus,
  PrescriptionFeedback,
  ProgressStatus,
  Segment,
  TimeSlot,
  VisitStatus,
} from "@/api/types";

/*
 * Statuts : une pastille de couleur (`dot`) + le libellé, sur fond blanc.
 * La couleur n'est jamais seule : le libellé est toujours affiché.
 */
export const VISIT_STATUS: Record<VisitStatus, { label: string; dot: string }> = {
  planifiee: { label: "Planifiée", dot: "bg-sky-500" },
  realisee: { label: "Réalisée", dot: "bg-emerald-500" },
  annulee: { label: "Annulée", dot: "bg-rose-500" },
  reportee: { label: "Reportée", dot: "bg-amber-400" },
};

export const PRESCRIBING: Record<PrescribingStatus, { label: string; dot: string }> = {
  regulier: { label: "Régulier", dot: "bg-emerald-500" },
  occasionnel: { label: "Occasionnel", dot: "bg-amber-400" },
  non_prescripteur: { label: "Non prescripteur", dot: "bg-slate-300" },
};

/** Segments : une seule teinte (pin), du plus plein (A, fort potentiel) au plus léger (C). */
export const SEGMENT: Record<Segment, { label: string; className: string }> = {
  A: { label: "Segment A, fort potentiel", className: "bg-pine text-white border-pine" },
  B: { label: "Segment B, potentiel moyen", className: "bg-mint text-pine border-mint" },
  C: { label: "Segment C, faible potentiel", className: "bg-white text-pine/70 border-pine/25" },
};

/** Ciblage (fréquence de visite). Un médecin sans fréquence est « hors cible ». */
export const FREQUENCY: Record<Frequency, { label: string; long: string }> = {
  F1: { label: "F1", long: "Ciblé F1, 1 visite par mois" },
  F2: { label: "F2", long: "Ciblé F2, 2 visites par mois" },
};
export const OUT_OF_TARGET = "Hors cible";

/** Ce que le médecin dit de sa prescription pendant la visite. */
export const PRESCRIPTION_FEEDBACK: Record<PrescriptionFeedback, string> = {
  prescrit_regulierement: "Prescrit régulièrement",
  prescrit_parmi_autres: "Prescrit parmi d'autres",
  promesse_prescrire: "Promesse de prescrire davantage",
  ne_prescrit_pas: "Ne prescrit pas",
};

/** Événements d'agenda hors visites (ils réduisent les jours travaillés sur le terrain). */
export const EVENT_TYPE: Record<EventType, string> = {
  reunion_equipe: "Réunion d'équipe",
  formation: "Formation",
  congres: "Congrès",
  staff: "Staff hospitalier",
  table_ronde: "Table ronde",
  administratif: "Administratif",
  conge_annuel: "Congé annuel",
  conge_maladie: "Congé maladie",
  fete: "Jour férié",
  autre: "Autre",
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

export const SEVERITY: Record<AlertSeverity, { label: string; dot: string }> = {
  haute: { label: "Haute", dot: "bg-rose-500" },
  moyenne: { label: "Moyenne", dot: "bg-amber-400" },
  faible: { label: "Faible", dot: "bg-slate-400" },
};

export const PROGRESS_STATUS: Record<ProgressStatus, { label: string; dot: string }> = {
  en_avance: { label: "En avance", dot: "bg-emerald-500" },
  dans_les_temps: { label: "Dans les temps", dot: "bg-sky-500" },
  en_retard: { label: "En retard", dot: "bg-rose-500" },
};

export const LAST_VISIT_FILTERS: Record<string, string> = {
  lt30: "Moins de 30 jours",
  gt30: "30 jours ou plus (à revoir)",
  "30_60": "Entre 30 et 60 jours",
  gt60: "Plus de 60 jours",
  never: "Jamais visité",
};
